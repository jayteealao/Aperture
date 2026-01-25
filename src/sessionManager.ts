import { randomUUID } from 'crypto';
import type { Config } from './config.js';
import { Session } from './session.js';
import { SdkSession } from './sdk-session.js';
import { getAgentBackend, isSdkBackend } from './agents/index.js';
import type { SessionAuth, AgentType, SessionConfig, SdkSessionConfig } from './agents/index.js';
import type { CredentialStore } from './credentials.js';
import type { ApertureDatabase } from './database.js';

export interface CreateSessionOptions {
  agent?: AgentType;
  auth?: SessionAuth;
  env?: Record<string, string>;
  workspaceId?: string; // Optional workspace ID for workspace-backed sessions
  repoPath?: string; // Optional repo path for sessions without workspace (no worktree isolation)
  sdk?: SdkSessionConfig; // SDK-specific configuration
}

/**
 * Manages all active sessions
 */
export class SessionManager {
  private sessions: Map<string, Session | SdkSession> = new Map();
  private config: Config;
  private claudeCodeExecutable?: string;
  private credentialStore?: CredentialStore;
  private database?: ApertureDatabase;

  constructor(
    config: Config,
    database?: ApertureDatabase,
    claudeCodeExecutable?: string,
    credentialStore?: CredentialStore
  ) {
    this.config = config;
    this.database = database;
    this.claudeCodeExecutable = claudeCodeExecutable;
    this.credentialStore = credentialStore;
  }

  /**
   * Restore sessions from database on startup
   * SDK sessions with sdk_session_id are marked as idle (resumable)
   * ACP sessions are marked as ended (process-coupled, can't resume)
   */
  async restoreSessions(): Promise<void> {
    if (!this.database) {
      return;
    }

    const activeSessions = this.database.getActiveSessions();
    console.log(`[SessionManager] Found ${activeSessions.length} active sessions in database`);

    let acpCount = 0;
    let sdkResumableCount = 0;

    for (const sessionRecord of activeSessions) {
      // SDK sessions with sdk_session_id can be resumed
      if (sessionRecord.sdk_session_id && sessionRecord.agent === 'claude_sdk') {
        // Mark as idle (not ended) - can be restored later
        this.database.markSdkSessionsIdle();
        sdkResumableCount++;
      } else {
        // ACP sessions can't be resumed after server restart
        this.database.endSession(sessionRecord.id, Date.now());
        acpCount++;
      }
    }

    console.log(`[SessionManager] Marked ${acpCount} ACP sessions as ended`);
    console.log(`[SessionManager] Kept ${sdkResumableCount} SDK sessions as idle (resumable)`);
  }

  /**
   * Restore/reconnect to an existing SDK session
   * Creates a new SdkSession instance with resume configuration
   */
  async restoreSession(sessionId: string): Promise<SdkSession | null> {
    if (!this.database) {
      throw new Error('Database not configured');
    }

    const sessionRecord = this.database.getSession(sessionId);
    if (!sessionRecord) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    if (!sessionRecord.sdk_session_id) {
      throw new Error(`Session ${sessionId} is not an SDK session or has no SDK session ID`);
    }

    if (sessionRecord.agent !== 'claude_sdk') {
      throw new Error(`Session ${sessionId} is not an SDK session (agent: ${sessionRecord.agent})`);
    }

    // Check if session already exists in memory
    const existingSession = this.sessions.get(sessionId);
    if (existingSession) {
      console.log(`[SessionManager] Session ${sessionId} already active in memory`);
      return existingSession as SdkSession;
    }

    // Parse stored SDK config
    let sdkConfig: SdkSessionConfig = {};
    if (sessionRecord.sdk_config) {
      try {
        sdkConfig = JSON.parse(sessionRecord.sdk_config);
      } catch (e) {
        console.warn(`[SessionManager] Failed to parse SDK config for session ${sessionId}`);
      }
    }

    // Set up resume configuration
    sdkConfig.resume = sessionRecord.sdk_session_id;
    sdkConfig.continue = true;
    sdkConfig.persistSession = true;

    // Build session config
    const sessionConfig: SessionConfig = {
      id: sessionId,
      agent: 'claude_sdk',
      auth: {
        mode: sessionRecord.auth_mode as SessionAuth['mode'],
        providerKey: 'anthropic',
        apiKeyRef: 'none',
      },
      sdk: sdkConfig,
    };

    // Create new SdkSession with resume config
    const session = new SdkSession(
      sessionConfig,
      this.config,
      this.database,
      undefined, // API key not stored - will use oauth/existing auth
      sessionRecord.working_directory || undefined
    );

    // Update database status
    this.database.saveSession({
      ...sessionRecord,
      status: 'active',
      last_activity_at: Date.now(),
      ended_at: null,
    });

    // Set up event handlers
    session.on('exit', () => {
      this.sessions.delete(sessionId);
      if (this.database) {
        this.database.endSession(sessionId, Date.now());
        this.database.markNonResumable(sessionId);
      }
    });

    session.on('idle', () => {
      console.log(`Session ${sessionId} idle, terminating`);
      if (this.database) {
        this.database.endSession(sessionId, Date.now());
      }
    });

    session.on('error', (err) => {
      console.error(`Session ${sessionId} error:`, err);
    });

    session.on('activity', () => {
      if (this.database) {
        this.database.updateSessionActivity(sessionId, Date.now());
      }
    });

    // Start the session
    await session.start();

    this.sessions.set(sessionId, session);
    console.log(`[SessionManager] Restored SDK session ${sessionId} with SDK session ID ${sessionRecord.sdk_session_id}`);

    return session;
  }

  /**
   * Get resumable sessions from database
   */
  getResumableSessions(): { id: string; agent: string; sdkSessionId: string; lastActivity: number; workingDirectory: string | null }[] {
    if (!this.database) {
      return [];
    }

    const records = this.database.getResumableSessions();
    return records.map(r => ({
      id: r.id,
      agent: r.agent,
      sdkSessionId: r.sdk_session_id!,
      lastActivity: r.last_activity_at,
      workingDirectory: r.working_directory,
    }));
  }

  /**
   * Creates a new session
   */
  async createSession(options: CreateSessionOptions = {}): Promise<Session | SdkSession> {
    // Check max sessions limit
    if (this.sessions.size >= this.config.maxConcurrentSessions) {
      throw new Error(
        `Maximum concurrent sessions (${this.config.maxConcurrentSessions}) reached`
      );
    }

    const id = randomUUID();
    const agent = options.agent || 'claude_acp'; // Default to Claude(ACP) for backwards compatibility

    // Determine default provider based on agent
    let defaultProvider: 'anthropic' | 'openai' | 'google' = 'anthropic';
    if (agent === 'codex') {
      defaultProvider = 'openai';
    } else if (agent === 'gemini') {
      defaultProvider = 'google';
    }

    // Build session auth configuration with defaults
    const auth: SessionAuth = {
      mode: options.auth?.mode || 'interactive',
      providerKey: options.auth?.providerKey || defaultProvider,
      apiKeyRef: options.auth?.apiKeyRef || 'none',
      apiKey: options.auth?.apiKey,
      storedCredentialId: options.auth?.storedCredentialId,
      // Vertex AI specific fields
      vertexProjectId: options.auth?.vertexProjectId,
      vertexLocation: options.auth?.vertexLocation,
      vertexCredentialsPath: options.auth?.vertexCredentialsPath,
    };

    // Build session config
    const sessionConfig: SessionConfig = {
      id,
      agent,
      auth,
      env: options.env,
      sdk: options.sdk,
    };

    // Get agent backend
    const backend = getAgentBackend(agent, this.claudeCodeExecutable, this.config.geminiHomePath);

    // Validate auth for this backend
    backend.validateAuth(auth, this.config.hostedMode, this.config.allowInteractiveAuth);

    // Resolve API key if needed (only for api_key mode)
    let resolvedApiKey: string | undefined;
    if (auth.mode === 'api_key') {
      if (auth.apiKeyRef === 'inline') {
        if (!auth.apiKey) {
          throw new Error('API key required when apiKeyRef="inline"');
        }
        resolvedApiKey = auth.apiKey;
      } else if (auth.apiKeyRef === 'stored') {
        if (!this.credentialStore) {
          throw new Error('Stored credentials not enabled. Set CREDENTIALS_MASTER_KEY to enable.');
        }
        if (!auth.storedCredentialId) {
          throw new Error('storedCredentialId required when apiKeyRef="stored"');
        }
        const credential = this.credentialStore.get(auth.storedCredentialId);
        if (!credential) {
          throw new Error(`Credential not found: ${auth.storedCredentialId}`);
        }
        // Validate provider matches
        if (credential.provider !== auth.providerKey) {
          throw new Error(
            `Credential provider mismatch: expected ${auth.providerKey}, got ${credential.provider}`
          );
        }
        resolvedApiKey = credential.apiKey;
      } else {
        throw new Error('API key mode requires apiKeyRef to be "inline" or "stored"');
      }
    }
    // Note: oauth and vertex modes don't need API key resolution here

    // Handle workspace-backed sessions or direct repo path
    let sessionCwd: string | undefined;

    if (options.workspaceId && this.database) {
      // Workspace mode: create worktree for isolation
      const { createWorktreeManager } = await import('./workspaces/worktreeManager.js');
      const worktreeManager = createWorktreeManager();

      const workspace = this.database.getWorkspace(options.workspaceId);
      if (!workspace) {
        throw new Error(`Workspace not found: ${options.workspaceId}`);
      }

      // Generate branch name for this agent (use session ID for uniqueness)
      const branch = `agent/${id.substring(0, 8)}`;

      try {
        // Create worktree
        const worktreeResult = await worktreeManager.ensureWorktree({
          repoRoot: workspace.repo_root,
          branch,
          worktreeBaseDir: `${workspace.repo_root}/.worktrees`,
          pathTemplate: '{worktreeBaseDir}/{branch}',
        });

        sessionCwd = worktreeResult.worktreePath;

        // Save workspace agent mapping
        this.database.saveWorkspaceAgent({
          id: randomUUID(),
          workspace_id: options.workspaceId,
          session_id: id,
          branch,
          worktree_path: sessionCwd,
          created_at: Date.now(),
          updated_at: Date.now(),
        });

        console.log(`[SessionManager] Created worktree for session ${id} at ${sessionCwd}`);
      } catch (error) {
        console.error(`[SessionManager] Failed to create worktree:`, error);
        throw new Error(`Failed to create worktree for workspace: ${error}`);
      }
    } else if (options.repoPath) {
      // Direct repo path mode: use provided path without worktree isolation
      const { stat } = await import('fs/promises');
      const { resolve, join } = await import('path');

      const resolvedPath = resolve(options.repoPath);

      // Verify path exists and is a directory
      try {
        const pathStat = await stat(resolvedPath);
        if (!pathStat.isDirectory()) {
          throw new Error(`Path is not a directory: ${resolvedPath}`);
        }
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
          throw new Error(`Path does not exist: ${resolvedPath}`);
        }
        throw error;
      }

      // Verify it's a git repository
      try {
        await stat(join(resolvedPath, '.git'));
      } catch {
        throw new Error(`Path is not a git repository: ${resolvedPath}`);
      }

      sessionCwd = resolvedPath;
      console.log(`[SessionManager] Using direct repo path for session ${id}: ${sessionCwd}`);
    }

    // Create session based on backend type
    let session: Session | SdkSession;

    if (isSdkBackend(backend)) {
      // SDK-based session requires API key for api_key mode, but not for oauth mode
      if (auth.mode === 'api_key' && !resolvedApiKey) {
        throw new Error('Claude SDK api_key mode requires an API key.');
      }
      // For oauth mode, resolvedApiKey will be undefined - SDK uses pre-existing auth
      session = new SdkSession(sessionConfig, this.config, this.database, resolvedApiKey, sessionCwd);
    } else {
      // Process-based session
      session = new Session(sessionConfig, backend, this.config, this.database, resolvedApiKey);

      // Pass working directory to session if available (worktree or direct repo path)
      if (sessionCwd) {
        session.setWorktreePath(sessionCwd);
      }
    }

    // Persist to database
    if (this.database) {
      const isSdkSession = agent === 'claude_sdk';
      this.database.saveSession({
        id,
        agent,
        auth_mode: auth.mode,
        acp_session_id: null, // Will be updated after initialization
        created_at: Date.now(),
        last_activity_at: Date.now(),
        ended_at: null,
        status: 'active',
        metadata: JSON.stringify({ env: options.env }),
        user_id: null, // Future: extract from auth token
        // SDK session fields
        sdk_session_id: null, // Will be updated when SDK returns session_id
        sdk_config: isSdkSession && options.sdk ? JSON.stringify(options.sdk) : null,
        is_resumable: isSdkSession ? 1 : 0, // SDK sessions start as potentially resumable
        working_directory: sessionCwd || null,
      });
    }

    // Set up event handlers
    const isSdkSessionType = agent === 'claude_sdk';
    session.on('exit', () => {
      this.sessions.delete(id);

      // Mark session as ended in database
      // SDK sessions that exit cleanly remain resumable
      if (this.database) {
        this.database.endSession(id, Date.now());
        // SDK sessions stay resumable even after exit (can reconnect later)
        // They only become non-resumable on explicit termination via deleteSession
      }
    });

    session.on('idle', () => {
      console.log(`Session ${id} idle, terminating`);

      // Mark session as ended in database
      // For SDK sessions, they remain resumable even when idle
      if (this.database) {
        if (isSdkSessionType) {
          // SDK sessions: mark as idle but keep resumable
          const record = this.database.getSession(id);
          if (record) {
            this.database.saveSession({
              ...record,
              status: 'idle',
              last_activity_at: Date.now(),
            });
          }
        } else {
          // ACP sessions: mark as ended
          this.database.endSession(id, Date.now());
        }
      }
    });

    session.on('error', (err) => {
      console.error(`Session ${id} error:`, err);
    });

    session.on('stderr', (line) => {
      console.error(`Session ${id} stderr: ${line}`);
    });

    // Set up activity tracking
    session.on('activity', () => {
      if (this.database) {
        this.database.updateSessionActivity(id, Date.now());
      }
    });

    // Start the session
    await session.start();

    this.sessions.set(id, session);
    return session;
  }

  /**
   * Gets a session by ID
   */
  getSession(id: string): Session | SdkSession | undefined {
    return this.sessions.get(id);
  }

  /**
   * Deletes a session
   */
  async deleteSession(id: string): Promise<void> {
    const session = this.sessions.get(id);
    if (!session) {
      throw new Error('Session not found');
    }

    await session.terminate();
    this.sessions.delete(id);

    // Delete from database
    if (this.database) {
      this.database.deleteSession(id);
    }
  }

  /**
   * Gets all sessions
   */
  getAllSessions(): (Session | SdkSession)[] {
    return Array.from(this.sessions.values());
  }

  /**
   * Gets session count
   */
  getSessionCount(): number {
    return this.sessions.size;
  }

  /**
   * Terminates all sessions
   */
  async terminateAll(): Promise<void> {
    const promises = Array.from(this.sessions.values()).map((session) => session.terminate());
    await Promise.all(promises);
    this.sessions.clear();
  }
}
