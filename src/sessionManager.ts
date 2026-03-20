import { randomUUID } from 'crypto';
import { execFile } from 'child_process';
import { mkdir, stat } from 'fs/promises';
import os from 'os';
import path from 'path';
import { promisify } from 'util';

import type { FastifyBaseLogger } from 'fastify';
import type { Config } from './config.js';
import { SdkSession } from './sdk-session.js';
import { PiSession } from './pi-session.js';
import { ClaudeSdkBackend, PiSdkBackend } from './agents/index.js';
import type { SessionAuth, SessionConfig, SdkSessionConfig, PiSessionConfig, AgentType } from './agents/index.js';
import type { CredentialStore } from './credentials.js';
import type { ApertureDatabase, SessionRecord } from './database.js';

const execFileAsync = promisify(execFile);

export type RepoMode = 'none' | 'init' | 'clone' | 'existing';

export interface CreateSessionOptions {
  agent?: AgentType;
  auth?: SessionAuth;
  env?: Record<string, string>;
  workspaceId?: string; // Optional workspace ID for workspace-backed sessions
  /** @deprecated Use repoMode instead. Optional repo path for sessions without workspace (no worktree isolation) */
  repoPath?: string;
  sdk?: SdkSessionConfig; // Claude SDK-specific configuration
  pi?: PiSessionConfig; // Pi SDK-specific configuration
  // New repo mode fields
  repoMode?: RepoMode; // How to set up the repo: none, init, clone, existing
  repoUrl?: string; // Git URL for clone mode
  existingRepoId?: string; // ID of existing managed repo
}

/**
 * Get the path for a managed repo checkout.
 * Groups by human-readable repo name, not opaque workspace UUID.
 */
function getManagedRepoPath(groupName: string, checkoutName: string): string {
  const home = os.homedir();
  return path.join(home, '.aperture', 'workspaces', groupName, checkoutName);
}

/**
 * Extract repo name from a Git URL
 * e.g., https://github.com/user/my-project.git -> my-project
 * e.g., git@github.com:user/my-project.git -> my-project
 */
export function extractRepoNameFromUrl(url: string): string {
  // Handle SSH-style URLs (git@github.com:user/repo.git)
  // Handle HTTPS-style URLs (https://github.com/user/repo.git)
  const match = url.match(/\/([^/]+?)(\.git)?$/) || url.match(/:([^/]+?)(\.git)?$/);
  return match?.[1] || 'repo';
}

/**
 * Manages all active sessions
 */
export class SessionManager {
  private sessions: Map<string, SdkSession | PiSession> = new Map();
  private config: Config;
  private logger: FastifyBaseLogger;
  private claudeBackend: ClaudeSdkBackend;
  private piBackend: PiSdkBackend;
  private credentialStore?: CredentialStore;
  private database?: ApertureDatabase;

  constructor(
    config: Config,
    logger: FastifyBaseLogger,
    database?: ApertureDatabase,
    _claudeCodeExecutable?: string,
    credentialStore?: CredentialStore
  ) {
    this.config = config;
    this.logger = logger;
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
    this.logger.info(`Found ${activeSessions.length} active sessions in database`);

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
      this.logger.info(`Marked ${endedCount} sessions as ended`);
    }
    this.logger.info(`Kept ${sdkResumableCount} SDK sessions as idle (resumable)`);
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
      this.logger.info(`Session ${sessionId} already active in memory`);
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
        this.logger.warn(`Failed to parse SDK config for session ${sessionId}`);
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

    // Insert into memory before start() so attach/connect paths cannot race restore.
    this.sessions.set(sessionId, session);

    // Start the session
    try {
      await session.start();
    } catch (error) {
      this.sessions.delete(sessionId);
      throw error;
    }
    this.logger.info(`Restored Claude SDK session ${sessionId} with SDK session ID ${sessionRecord.sdk_session_id}`);

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
        this.logger.warn(`Failed to parse Pi config for session ${sessionId}`);
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

    // Insert into memory before start() so attach/connect paths cannot race restore.
    this.sessions.set(sessionId, session);

    // Start the session
    try {
      await session.start();
    } catch (error) {
      this.sessions.delete(sessionId);
      throw error;
    }
    this.logger.info(`Restored Pi SDK session ${sessionId} with session path ${sessionRecord.pi_session_path}`);

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
      this.logger.info(`Session ${sessionId} idle`);
      if (this.database) {
        this.database.updateSessionStatus(sessionId, 'idle', Date.now(), null);
      }
    });

    session.on('error', (err: Error) => {
      this.logger.error({ err }, `Session ${sessionId} error`);
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
      this.logger.info(`Pi Session ${sessionId} idle`);
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
      this.logger.error({ err }, `Pi Session ${sessionId} error`);
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
   * Get server-authoritative discoverable sessions for UI bootstrap.
   */
  getDiscoverableSessions(): SessionRecord[] {
    if (!this.database) {
      return this.getAllSessions().map((session) => {
        const status = session.getStatus() as {
          authMode: string;
          lastActivityTime: number;
          running?: boolean;
          isResumable?: boolean;
          workingDirectory?: string;
          acpSessionId?: string | null;
        };
        return {
        id: session.id,
        agent: session.agentType,
        auth_mode: status.authMode,
        acp_session_id: status.acpSessionId ?? null,
        created_at: 0,
        last_activity_at: status.lastActivityTime,
        ended_at: null,
        status: status.running ? 'active' : 'idle',
        metadata: null,
        user_id: null,
        sdk_session_id: 'sdkSessionId' in session ? session.sdkSessionId : null,
        sdk_config: null,
        is_resumable: status.isResumable ? 1 : 0,
        working_directory: status.workingDirectory || null,
        workspace_id: null,
        pi_session_path: 'piSessionPath' in session ? session.piSessionPath : null,
      };});
    }

    return this.database.getDiscoverableSessions();
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

    // Handle workspace-backed sessions, repo modes, or direct repo path
    let sessionCwd: string | undefined;
    let managedRepoId: string | undefined;
    const repoMode = options.repoMode || 'none';

    if (options.workspaceId && this.database) {
      // Workspace mode: create a local clone for isolation
      const workspace = this.database.getWorkspace(options.workspaceId);
      if (!workspace) {
        throw new Error(`Workspace not found: ${options.workspaceId}`);
      }

      const cloneName = id;
      const groupName = path.basename(workspace.repo_root);
      const clonePath = getManagedRepoPath(groupName, cloneName);

      try {
        await mkdir(path.dirname(clonePath), { recursive: true });

        // --no-hardlinks on Windows avoids NTFS cross-volume failures
        const cloneArgs = ['clone'];
        if (process.platform === 'win32') cloneArgs.push('--no-hardlinks');
        cloneArgs.push(workspace.repo_root, clonePath);
        await execFileAsync('git', cloneArgs);

        sessionCwd = clonePath;

        // Save managed repo with null session_id — the session row doesn't exist yet
        // (FK constraint on managed_repos.session_id → sessions.id).
        // The session_id is updated after the session is persisted.
        managedRepoId = randomUUID();
        this.database.saveManagedRepo({
          id: managedRepoId,
          workspace_id: options.workspaceId,
          path: clonePath,
          name: cloneName,
          origin_url: null,
          created_at: Date.now(),
          updated_at: Date.now(),
          session_id: null,
          clone_source: 'workspace',
        });

        this.logger.info(`Created local clone for session ${id} at ${clonePath}`);
      } catch (error) {
        this.logger.error({ err: error }, `Failed to create clone for workspace`);
        throw new Error(`Failed to create clone for workspace: ${error}`);
      }
    } else if (repoMode === 'init') {
      // Init mode: create a new empty git repository
      const repoName = id;
      const repoPath = getManagedRepoPath('standalone', repoName);

      try {
        // Create directory
        await mkdir(repoPath, { recursive: true });

        // Initialize git repo
        await execFileAsync('git', ['init'], { cwd: repoPath });

        sessionCwd = repoPath;

        // Save managed repo record (session_id is null initially, updated after session creation)
        if (this.database) {
          managedRepoId = randomUUID();
          this.database.saveManagedRepo({
            id: managedRepoId,
            workspace_id: options.workspaceId || 'default',
            path: repoPath,
            name: repoName,
            origin_url: null,
            created_at: Date.now(),
            updated_at: Date.now(),
            session_id: null,
            clone_source: 'init',
          });
        }

        this.logger.info(`Initialized new repo for session ${id} at ${sessionCwd}`);
      } catch (error) {
        this.logger.error({ err: error }, `Failed to initialize repo`);
        throw new Error(`Failed to initialize repository: ${error}`);
      }
    } else if (repoMode === 'clone') {
      // Clone mode: clone from URL
      if (!options.repoUrl) {
        throw new Error('repoUrl is required when repoMode is "clone"');
      }

      // Validate URL format to prevent command injection
      const validUrlPattern = /^(https?:\/\/|git:\/\/|ssh:\/\/|git@)/;
      if (!validUrlPattern.test(options.repoUrl)) {
        throw new Error(`Invalid repository URL format: ${options.repoUrl}`);
      }

      const baseRepoName = extractRepoNameFromUrl(options.repoUrl);
      const repoName = id;
      const repoPath = getManagedRepoPath(baseRepoName, repoName);

      try {
        // Create parent directory
        await mkdir(path.dirname(repoPath), { recursive: true });

        // Clone the repo (execFile avoids shell interpolation)
        await execFileAsync('git', ['clone', options.repoUrl, repoPath]);

        sessionCwd = repoPath;

        // Save managed repo record (session_id is null initially, updated after session creation)
        if (this.database) {
          managedRepoId = randomUUID();
          this.database.saveManagedRepo({
            id: managedRepoId,
            workspace_id: options.workspaceId || 'default',
            path: repoPath,
            name: repoName,
            origin_url: options.repoUrl,
            created_at: Date.now(),
            updated_at: Date.now(),
            session_id: null,
            clone_source: 'remote',
          });
        }

        this.logger.info(`Cloned repo for session ${id} at ${sessionCwd}`);
      } catch (error) {
        this.logger.error({ err: error }, `Failed to clone repo`);
        throw new Error(`Failed to clone repository: ${error}`);
      }
    } else if (repoMode === 'existing') {
      // Existing mode: use a previously created managed repo
      if (!options.existingRepoId || !this.database) {
        throw new Error('existingRepoId and database are required when repoMode is "existing"');
      }

      const managedRepo = this.database.getManagedRepo(options.existingRepoId);
      if (!managedRepo) {
        throw new Error(`Managed repo not found: ${options.existingRepoId}`);
      }

      // Verify the path still exists
      try {
        const pathStat = await stat(managedRepo.path);
        if (!pathStat.isDirectory()) {
          throw new Error(`Managed repo path is not a directory: ${managedRepo.path}`);
        }
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
          throw new Error(`Managed repo path does not exist: ${managedRepo.path}`);
        }
        throw error;
      }

      sessionCwd = managedRepo.path;

      // Note: We don't update session_id here because the session doesn't exist in DB yet.
      // The session_id field is optional and tracks the last session that used this repo.

      this.logger.info(`Using existing managed repo for session ${id}: ${sessionCwd}`);
    } else if (options.repoPath) {
      // @deprecated: Direct repo path mode (backwards compatibility)
      const resolvedPath = path.resolve(options.repoPath);

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
        await stat(path.join(resolvedPath, '.git'));
      } catch {
        throw new Error(`Path is not a git repository: ${resolvedPath}`);
      }

      sessionCwd = resolvedPath;
      this.logger.info(`Using direct repo path for session ${id}: ${sessionCwd}`);
    }
    // repoMode === 'none' or no repo specified: sessionCwd stays undefined

    // Link the managed repo to the session after session is persisted.
    // We use a callback so the child methods can invoke it after saveSession().
    const linkManagedRepo = managedRepoId
      ? () => { this.database?.updateManagedRepoSession(managedRepoId, id); }
      : undefined;

    // Create session based on agent type
    if (agentType === 'pi_sdk') {
      return this.createPiSession(id, auth, options, resolvedApiKey, sessionCwd, linkManagedRepo);
    } else {
      return this.createClaudeSdkSession(id, auth, options, resolvedApiKey, sessionCwd, linkManagedRepo);
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
    sessionCwd: string | undefined,
    linkManagedRepo?: () => void
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
        workspace_id: options.workspaceId || null,
        pi_session_path: null,
      });

      // Now that session row exists, link the managed repo to it
      linkManagedRepo?.();
    }

    // Set up event handlers
    session.on('exit', () => {
      this.sessions.delete(id);
      if (this.database) {
        this.database.endSession(id, Date.now());
      }
    });

    session.on('idle', () => {
      this.logger.info(`Session ${id} idle`);
      if (this.database) {
        this.database.updateSessionStatus(id, 'idle', Date.now(), null);
      }
    });

    session.on('error', (err: Error) => {
      this.logger.error({ err }, `Session ${id} error`);
    });

    session.on('stderr', (line: string) => {
      this.logger.error(`Session ${id} stderr: ${line}`);
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
    sessionCwd: string | undefined,
    linkManagedRepo?: () => void
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
        workspace_id: options.workspaceId || null,
        pi_session_path: null, // Will be updated when Pi SDK creates session file
      });

      // Now that session row exists, link the managed repo to it
      linkManagedRepo?.();
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
