import { randomUUID } from 'crypto';
import type { Config } from './config.js';
import { SdkSession } from './sdk-session.js';
import { PiSession } from './pi-session.js';
import { ClaudeSdkBackend, PiSdkBackend } from './agents/index.js';
import type { SessionAuth, SessionConfig, SdkSessionConfig, PiSessionConfig, AgentType } from './agents/index.js';
import type { CredentialStore } from './credentials.js';
import type { ApertureDatabase, SessionRecord } from './database.js';

export interface CreateSessionOptions {
  agent?: AgentType;
  auth?: SessionAuth;
  env?: Record<string, string>;
  workspaceId?: string; // Optional workspace ID for workspace-backed sessions
  repoPath?: string; // Optional repo path for sessions without workspace (no worktree isolation)
  sdk?: SdkSessionConfig; // Claude SDK-specific configuration
  pi?: PiSessionConfig; // Pi SDK-specific configuration
}

/**
 * Manages all active sessions
 */
export class SessionManager {
  private sessions: Map<string, SdkSession | PiSession> = new Map();
  private config: Config;
  private claudeBackend: ClaudeSdkBackend;
  private piBackend: PiSdkBackend;
  private credentialStore?: CredentialStore;
  private database?: ApertureDatabase;

  constructor(
    config: Config,
    database?: ApertureDatabase,
    _claudeCodeExecutable?: string,
    credentialStore?: CredentialStore
  ) {
    this.config = config;
    this.database = database;
    this.credentialStore = credentialStore;
    this.claudeBackend = new ClaudeSdkBackend();
    this.piBackend = new PiSdkBackend();
  }

  /**
   * Restore sessions from database on startup
   * SDK sessions with sdk_session_id or pi_session_path are marked as idle (resumable)
   */
  async restoreSessions(): Promise<void> {
    if (!this.database) {
      return;
    }

    const activeSessions = this.database.getActiveSessions();
    console.log(`[SessionManager] Found ${activeSessions.length} active sessions in database`);

    let endedCount = 0;
    let sdkResumableCount = 0;

    for (const sessionRecord of activeSessions) {
      // Claude SDK sessions with sdk_session_id can be resumed
      if (sessionRecord.sdk_session_id && sessionRecord.agent === 'claude_sdk') {
        this.database.markSdkSessionsIdle();
        sdkResumableCount++;
      }
      // Pi SDK sessions with pi_session_path can be resumed
      else if (sessionRecord.pi_session_path && sessionRecord.agent === 'pi_sdk') {
        this.database.markSdkSessionsIdle();
        sdkResumableCount++;
      } else {
        // Sessions without resumption data can't be resumed
        this.database.endSession(sessionRecord.id, Date.now());
        endedCount++;
      }
    }

    if (endedCount > 0) {
      console.log(`[SessionManager] Marked ${endedCount} sessions as ended`);
    }
    console.log(`[SessionManager] Kept ${sdkResumableCount} SDK sessions as idle (resumable)`);
  }

  /**
   * Restore/reconnect to an existing session
   * Routes to appropriate restore method based on agent type
   */
  async restoreSession(sessionId: string): Promise<SdkSession | PiSession | null> {
    if (!this.database) {
      throw new Error('Database not configured');
    }

    const sessionRecord = this.database.getSession(sessionId);
    if (!sessionRecord) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    // Check if session already exists in memory
    const existingSession = this.sessions.get(sessionId);
    if (existingSession) {
      console.log(`[SessionManager] Session ${sessionId} already active in memory`);
      return existingSession;
    }

    // Route to appropriate restore method based on agent type
    if (sessionRecord.agent === 'claude_sdk') {
      return this.restoreClaudeSdkSession(sessionId, sessionRecord);
    } else if (sessionRecord.agent === 'pi_sdk') {
      return this.restorePiSession(sessionId, sessionRecord);
    } else {
      throw new Error(`Unknown agent type for session ${sessionId}: ${sessionRecord.agent}`);
    }
  }

  /**
   * Restore Claude SDK session
   */
  private async restoreClaudeSdkSession(sessionId: string, sessionRecord: SessionRecord): Promise<SdkSession> {
    if (!sessionRecord.sdk_session_id) {
      throw new Error(`Session ${sessionId} has no SDK session ID`);
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

    // Set up event handlers
    this.setupSdkSessionEventHandlers(session, sessionId);

    // Start the session
    await session.start();

    this.sessions.set(sessionId, session);
    console.log(`[SessionManager] Restored Claude SDK session ${sessionId} with SDK session ID ${sessionRecord.sdk_session_id}`);

    return session;
  }

  /**
   * Restore Pi SDK session
   */
  private async restorePiSession(sessionId: string, sessionRecord: SessionRecord): Promise<PiSession> {
    if (!sessionRecord.pi_session_path) {
      throw new Error(`Session ${sessionId} has no Pi session path`);
    }

    // Parse stored Pi config
    let piConfig: PiSessionConfig = {};
    if (sessionRecord.sdk_config) {
      try {
        piConfig = JSON.parse(sessionRecord.sdk_config);
      } catch (e) {
        console.warn(`[SessionManager] Failed to parse Pi config for session ${sessionId}`);
      }
    }

    // Set up resume configuration
    piConfig.sessionMode = 'open';
    piConfig.sessionPath = sessionRecord.pi_session_path;

    // Build session config
    const sessionConfig: SessionConfig = {
      id: sessionId,
      agent: 'pi_sdk',
      auth: {
        mode: sessionRecord.auth_mode as SessionAuth['mode'],
        apiKeyRef: 'none',
      },
      pi: piConfig,
    };

    // Create new PiSession with resume config
    const session = new PiSession(
      sessionConfig,
      this.config,
      this.database,
      undefined, // API key not stored
      sessionRecord.working_directory || undefined
    );

    // Set up event handlers
    this.setupPiSessionEventHandlers(session, sessionId);

    // Start the session
    await session.start();

    this.sessions.set(sessionId, session);
    console.log(`[SessionManager] Restored Pi SDK session ${sessionId} with session path ${sessionRecord.pi_session_path}`);

    return session;
  }

  /**
   * Set up event handlers for Claude SDK session
   */
  private setupSdkSessionEventHandlers(session: SdkSession, sessionId: string): void {
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

    session.on('error', (err: Error) => {
      console.error(`Session ${sessionId} error:`, err);
    });

    session.on('activity', () => {
      if (this.database) {
        this.database.updateSessionActivity(sessionId, Date.now());
      }
    });
  }

  /**
   * Set up event handlers for Pi SDK session
   */
  private setupPiSessionEventHandlers(session: PiSession, sessionId: string): void {
    session.on('exit', () => {
      this.sessions.delete(sessionId);
      if (this.database) {
        this.database.endSession(sessionId, Date.now());
        this.database.markNonResumable(sessionId);
      }
    });

    session.on('idle', () => {
      console.log(`Pi Session ${sessionId} idle`);
      if (this.database) {
        const record = this.database.getSession(sessionId);
        if (record) {
          this.database.saveSession({
            ...record,
            status: 'idle',
            last_activity_at: Date.now(),
          });
        }
      }
    });

    session.on('error', (err: Error) => {
      console.error(`Pi Session ${sessionId} error:`, err);
    });

    session.on('activity', () => {
      if (this.database) {
        this.database.updateSessionActivity(sessionId, Date.now());
      }
    });
  }

  /**
   * Get resumable sessions from database
   */
  getResumableSessions(): { id: string; agent: string; sdkSessionId?: string; piSessionPath?: string; lastActivity: number; workingDirectory: string | null }[] {
    if (!this.database) {
      return [];
    }

    const records = this.database.getResumableSessions();
    return records.map(r => ({
      id: r.id,
      agent: r.agent,
      sdkSessionId: r.sdk_session_id || undefined,
      piSessionPath: r.pi_session_path || undefined,
      lastActivity: r.last_activity_at,
      workingDirectory: r.working_directory,
    }));
  }

  /**
   * Creates a new session
   */
  async createSession(options: CreateSessionOptions = {}): Promise<SdkSession | PiSession> {
    // Check max sessions limit
    if (this.sessions.size >= this.config.maxConcurrentSessions) {
      throw new Error(
        `Maximum concurrent sessions (${this.config.maxConcurrentSessions}) reached`
      );
    }

    const id = randomUUID();
    const agentType: AgentType = options.agent || 'claude_sdk';

    // Build session auth configuration with defaults
    const auth: SessionAuth = {
      mode: options.auth?.mode || 'oauth',
      providerKey: options.auth?.providerKey || 'anthropic',
      apiKeyRef: options.auth?.apiKeyRef || 'none',
      apiKey: options.auth?.apiKey,
      storedCredentialId: options.auth?.storedCredentialId,
    };

    // Select backend based on agent type
    const backend = agentType === 'pi_sdk' ? this.piBackend : this.claudeBackend;

    // Validate auth
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

    // Create session based on agent type
    if (agentType === 'pi_sdk') {
      return this.createPiSession(id, auth, options, resolvedApiKey, sessionCwd);
    } else {
      return this.createClaudeSdkSession(id, auth, options, resolvedApiKey, sessionCwd);
    }
  }

  /**
   * Create a Claude SDK session
   */
  private async createClaudeSdkSession(
    id: string,
    auth: SessionAuth,
    options: CreateSessionOptions,
    resolvedApiKey: string | undefined,
    sessionCwd: string | undefined
  ): Promise<SdkSession> {
    // Build session config
    const sessionConfig: SessionConfig = {
      id,
      agent: 'claude_sdk',
      auth,
      env: options.env,
      sdk: options.sdk,
    };

    // Create SDK session
    if (auth.mode === 'api_key' && !resolvedApiKey) {
      throw new Error('Claude SDK api_key mode requires an API key.');
    }

    const session = new SdkSession(sessionConfig, this.config, this.database, resolvedApiKey, sessionCwd);

    // Persist to database
    if (this.database) {
      this.database.saveSession({
        id,
        agent: 'claude_sdk',
        auth_mode: auth.mode,
        acp_session_id: null,
        created_at: Date.now(),
        last_activity_at: Date.now(),
        ended_at: null,
        status: 'active',
        metadata: JSON.stringify({ env: options.env }),
        user_id: null,
        sdk_session_id: null, // Will be updated when SDK returns session_id
        sdk_config: options.sdk ? JSON.stringify(options.sdk) : null,
        is_resumable: 1, // SDK sessions start as potentially resumable
        working_directory: sessionCwd || null,
        pi_session_path: null,
      });
    }

    // Set up event handlers
    session.on('exit', () => {
      this.sessions.delete(id);
      if (this.database) {
        this.database.endSession(id, Date.now());
      }
    });

    session.on('idle', () => {
      console.log(`Session ${id} idle, terminating`);
      if (this.database) {
        const record = this.database.getSession(id);
        if (record) {
          this.database.saveSession({
            ...record,
            status: 'idle',
            last_activity_at: Date.now(),
          });
        }
      }
    });

    session.on('error', (err: Error) => {
      console.error(`Session ${id} error:`, err);
    });

    session.on('stderr', (line: string) => {
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
   * Create a Pi SDK session
   */
  private async createPiSession(
    id: string,
    auth: SessionAuth,
    options: CreateSessionOptions,
    resolvedApiKey: string | undefined,
    sessionCwd: string | undefined
  ): Promise<PiSession> {
    // Build session config
    const sessionConfig: SessionConfig = {
      id,
      agent: 'pi_sdk',
      auth,
      env: options.env,
      pi: options.pi,
    };

    const session = new PiSession(sessionConfig, this.config, this.database, resolvedApiKey, sessionCwd);

    // Persist to database
    if (this.database) {
      this.database.saveSession({
        id,
        agent: 'pi_sdk',
        auth_mode: auth.mode,
        acp_session_id: null,
        created_at: Date.now(),
        last_activity_at: Date.now(),
        ended_at: null,
        status: 'active',
        metadata: JSON.stringify({ env: options.env }),
        user_id: null,
        sdk_session_id: null,
        sdk_config: options.pi ? JSON.stringify(options.pi) : null,
        is_resumable: 1, // Pi SDK sessions start as potentially resumable
        working_directory: sessionCwd || null,
        pi_session_path: null, // Will be updated when Pi SDK creates session file
      });
    }

    // Set up event handlers
    this.setupPiSessionEventHandlers(session, id);

    // Start the session
    await session.start();

    this.sessions.set(id, session);
    return session;
  }

  /**
   * Gets a session by ID
   */
  getSession(id: string): SdkSession | PiSession | undefined {
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
  getAllSessions(): (SdkSession | PiSession)[] {
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
