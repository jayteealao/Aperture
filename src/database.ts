import Database from 'better-sqlite3';
import { readFileSync, existsSync, mkdirSync, readdirSync } from 'fs';
import { dirname, join } from 'path';

export interface SessionRecord {
  id: string;
  agent: string;
  auth_mode: string;
  acp_session_id: string | null;
  created_at: number;
  last_activity_at: number;
  ended_at: number | null;
  status: 'active' | 'idle' | 'ended';
  metadata: string | null;
  user_id: string | null;
  // SDK session fields (for long-lasting SDK sessions)
  sdk_session_id: string | null;
  sdk_config: string | null;
  is_resumable: number;
  working_directory: string | null;
  // Pi SDK session field
  pi_session_path: string | null;
}

export interface MessageRecord {
  id: string;
  session_id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  metadata: string | null;
}

export interface SessionEventRecord {
  id: number;
  session_id: string;
  event_type: string;
  event_data: string | null;
  timestamp: number;
}

export interface WorkspaceRecord {
  id: string;
  name: string;
  repo_root: string;
  description: string | null;
  created_at: number;
  updated_at: number;
  metadata: string | null;
}

export interface WorkspaceAgentRecord {
  id: string;
  workspace_id: string;
  session_id: string | null;
  branch: string;
  worktree_path: string;
  created_at: number;
  updated_at: number;
}

export class ApertureDatabase {
  private db: Database.Database;

  constructor(dbPath: string) {
    // Ensure directory exists
    const dir = dirname(dbPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    this.db = new Database(dbPath);

    // Enable WAL mode for better concurrency
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');

    console.log('[DB] Opened database:', dbPath);
  }

  /**
   * Run migrations from the migrations directory
   */
  migrate(migrationsDir: string): void {
    if (!existsSync(migrationsDir)) {
      console.log('[DB] No migrations directory found, skipping migrations');
      return;
    }

    const currentVersion = this.getCurrentVersion();
    console.log('[DB] Current schema version:', currentVersion);

    const migrationFiles = readdirSync(migrationsDir)
      .filter(file => file.endsWith('.sql'))
      .sort();

    for (const file of migrationFiles) {
      const match = file.match(/^(\d+)-/);
      if (!match) continue;

      const version = parseInt(match[1], 10);
      if (version <= currentVersion) continue;

      console.log(`[DB] Applying migration ${version}: ${file}`);
      const migrationPath = join(migrationsDir, file);
      const sql = readFileSync(migrationPath, 'utf-8');

      try {
        this.db.exec(sql);
        console.log(`[DB] Migration ${version} applied successfully`);
      } catch (error) {
        console.error(`[DB] Failed to apply migration ${version}:`, error);
        throw error;
      }
    }

    const newVersion = this.getCurrentVersion();
    console.log('[DB] Schema version after migrations:', newVersion);
  }

  /**
   * Get current schema version
   */
  private getCurrentVersion(): number {
    try {
      const result = this.db
        .prepare('SELECT MAX(version) as version FROM schema_version')
        .get() as { version: number | null };
      return result?.version || 0;
    } catch {
      return 0;
    }
  }

  // ==================== Session Methods ====================

  /**
   * Save or update a session
   */
  saveSession(session: SessionRecord): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO sessions
      (id, agent, auth_mode, acp_session_id, created_at, last_activity_at, ended_at, status, metadata, user_id, sdk_session_id, sdk_config, is_resumable, working_directory, pi_session_path)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      session.id,
      session.agent,
      session.auth_mode,
      session.acp_session_id,
      session.created_at,
      session.last_activity_at,
      session.ended_at,
      session.status,
      session.metadata,
      session.user_id,
      session.sdk_session_id ?? null,
      session.sdk_config ?? null,
      session.is_resumable ?? 0,
      session.working_directory ?? null,
      session.pi_session_path ?? null
    );
  }

  /**
   * Get a session by ID
   */
  getSession(id: string): SessionRecord | null {
    const stmt = this.db.prepare('SELECT * FROM sessions WHERE id = ?');
    const result = stmt.get(id) as SessionRecord | undefined;
    return result || null;
  }

  /**
   * Get all sessions
   */
  getAllSessions(userId?: string): SessionRecord[] {
    let stmt;
    if (userId) {
      stmt = this.db.prepare('SELECT * FROM sessions WHERE user_id = ? ORDER BY created_at DESC');
      return stmt.all(userId) as SessionRecord[];
    } else {
      stmt = this.db.prepare('SELECT * FROM sessions ORDER BY created_at DESC');
      return stmt.all() as SessionRecord[];
    }
  }

  /**
   * Get active sessions only
   */
  getActiveSessions(): SessionRecord[] {
    const stmt = this.db.prepare(
      "SELECT * FROM sessions WHERE status = 'active' ORDER BY created_at DESC"
    );
    return stmt.all() as SessionRecord[];
  }

  /**
   * Update session activity timestamp
   */
  updateSessionActivity(id: string, timestamp: number = Date.now()): void {
    const stmt = this.db.prepare('UPDATE sessions SET last_activity_at = ? WHERE id = ?');
    stmt.run(timestamp, id);
  }

  /**
   * End a session
   */
  endSession(id: string, timestamp: number = Date.now()): void {
    const stmt = this.db.prepare("UPDATE sessions SET status = 'ended', ended_at = ? WHERE id = ?");
    stmt.run(timestamp, id);
  }

  /**
   * Get resumable SDK sessions (sessions with sdk_session_id and is_resumable = 1)
   */
  getResumableSessions(): SessionRecord[] {
    const stmt = this.db.prepare(
      "SELECT * FROM sessions WHERE is_resumable = 1 AND sdk_session_id IS NOT NULL ORDER BY last_activity_at DESC"
    );
    return stmt.all() as SessionRecord[];
  }

  /**
   * Update SDK session ID for a session
   */
  updateSdkSessionId(id: string, sdkSessionId: string): void {
    const stmt = this.db.prepare(
      "UPDATE sessions SET sdk_session_id = ?, is_resumable = 1 WHERE id = ?"
    );
    stmt.run(sdkSessionId, id);
  }

  /**
   * Update SDK config for a session
   */
  updateSdkConfig(id: string, sdkConfig: string): void {
    const stmt = this.db.prepare("UPDATE sessions SET sdk_config = ? WHERE id = ?");
    stmt.run(sdkConfig, id);
  }

  /**
   * Mark a session as non-resumable
   */
  markNonResumable(id: string): void {
    const stmt = this.db.prepare("UPDATE sessions SET is_resumable = 0 WHERE id = ?");
    stmt.run(id);
  }

  /**
   * Update working directory for a session
   */
  updateWorkingDirectory(id: string, workingDirectory: string): void {
    const stmt = this.db.prepare("UPDATE sessions SET working_directory = ? WHERE id = ?");
    stmt.run(workingDirectory, id);
  }

  /**
   * Update Pi session path for a session
   */
  updatePiSessionPath(id: string, piSessionPath: string): void {
    const stmt = this.db.prepare(
      "UPDATE sessions SET pi_session_path = ?, is_resumable = 1 WHERE id = ?"
    );
    stmt.run(piSessionPath, id);
  }

  /**
   * Mark SDK sessions as idle (for server restart recovery)
   * Both Claude SDK and Pi SDK sessions can potentially be resumed
   */
  markSdkSessionsIdle(): void {
    const stmt = this.db.prepare(
      "UPDATE sessions SET status = 'idle' WHERE status = 'active' AND (sdk_session_id IS NOT NULL OR pi_session_path IS NOT NULL) AND is_resumable = 1"
    );
    stmt.run();
  }

  /**
   * Delete a session and all its messages
   */
  deleteSession(id: string): void {
    // Foreign key constraints will cascade delete messages and events
    const stmt = this.db.prepare('DELETE FROM sessions WHERE id = ?');
    stmt.run(id);
  }

  // ==================== Message Methods ====================

  /**
   * Save a message
   */
  saveMessage(message: MessageRecord): void {
    const stmt = this.db.prepare(`
      INSERT INTO messages (id, session_id, role, content, timestamp, metadata)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      message.id,
      message.session_id,
      message.role,
      message.content,
      message.timestamp,
      message.metadata
    );
  }

  /**
   * Get messages for a session
   */
  getMessages(sessionId: string, limit: number = 1000, offset: number = 0): MessageRecord[] {
    const stmt = this.db.prepare(`
      SELECT * FROM messages
      WHERE session_id = ?
      ORDER BY timestamp ASC
      LIMIT ? OFFSET ?
    `);
    return stmt.all(sessionId, limit, offset) as MessageRecord[];
  }

  /**
   * Get message count for a session
   */
  getMessageCount(sessionId: string): number {
    const stmt = this.db.prepare('SELECT COUNT(*) as count FROM messages WHERE session_id = ?');
    const result = stmt.get(sessionId) as { count: number };
    return result.count;
  }

  /**
   * Delete all messages for a session
   */
  deleteMessages(sessionId: string): void {
    const stmt = this.db.prepare('DELETE FROM messages WHERE session_id = ?');
    stmt.run(sessionId);
  }

  // ==================== Event Logging Methods ====================

  /**
   * Log a session event
   */
  logEvent(sessionId: string, eventType: string, eventData: object): void {
    const stmt = this.db.prepare(`
      INSERT INTO session_events (session_id, event_type, event_data, timestamp)
      VALUES (?, ?, ?, ?)
    `);

    stmt.run(sessionId, eventType, JSON.stringify(eventData), Date.now());
  }

  /**
   * Get events for a session
   */
  getEvents(sessionId: string, limit: number = 100): SessionEventRecord[] {
    const stmt = this.db.prepare(`
      SELECT * FROM session_events
      WHERE session_id = ?
      ORDER BY timestamp DESC
      LIMIT ?
    `);
    return stmt.all(sessionId, limit) as SessionEventRecord[];
  }

  // ==================== Utility Methods ====================

  /**
   * Get database statistics
   */
  getStats(): {
    totalSessions: number;
    activeSessions: number;
    totalMessages: number;
    totalEvents: number;
  } {
    const sessionCount = this.db
      .prepare('SELECT COUNT(*) as count FROM sessions')
      .get() as { count: number };

    const activeCount = this.db
      .prepare("SELECT COUNT(*) as count FROM sessions WHERE status = 'active'")
      .get() as { count: number };

    const messageCount = this.db
      .prepare('SELECT COUNT(*) as count FROM messages')
      .get() as { count: number };

    const eventCount = this.db
      .prepare('SELECT COUNT(*) as count FROM session_events')
      .get() as { count: number };

    return {
      totalSessions: sessionCount.count,
      activeSessions: activeCount.count,
      totalMessages: messageCount.count,
      totalEvents: eventCount.count
    };
  }

  /**
   * Close the database
   */
  close(): void {
    this.db.close();
    console.log('[DB] Database closed');
  }

  /**
   * Execute raw SQL (for testing/admin purposes)
   */
  exec(sql: string): void {
    this.db.exec(sql);
  }

  /**
   * Prepare a statement (for advanced queries)
   */
  prepare(sql: string): Database.Statement {
    return this.db.prepare(sql);
  }

  // ==================== Workspace Methods ====================

  /**
   * Save or update a workspace
   */
  saveWorkspace(workspace: WorkspaceRecord): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO workspaces
      (id, name, repo_root, description, created_at, updated_at, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      workspace.id,
      workspace.name,
      workspace.repo_root,
      workspace.description,
      workspace.created_at,
      workspace.updated_at,
      workspace.metadata
    );
  }

  /**
   * Get a workspace by ID
   */
  getWorkspace(id: string): WorkspaceRecord | null {
    const stmt = this.db.prepare('SELECT * FROM workspaces WHERE id = ?');
    const result = stmt.get(id) as WorkspaceRecord | undefined;
    return result || null;
  }

  /**
   * Get all workspaces
   */
  getAllWorkspaces(): WorkspaceRecord[] {
    const stmt = this.db.prepare('SELECT * FROM workspaces ORDER BY created_at DESC');
    return stmt.all() as WorkspaceRecord[];
  }

  /**
   * Delete a workspace and all its agents
   */
  deleteWorkspace(id: string): void {
    // Foreign key constraints will cascade delete workspace_agents
    const stmt = this.db.prepare('DELETE FROM workspaces WHERE id = ?');
    stmt.run(id);
  }

  /**
   * Save or update a workspace agent
   */
  saveWorkspaceAgent(agent: WorkspaceAgentRecord): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO workspace_agents
      (id, workspace_id, session_id, branch, worktree_path, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      agent.id,
      agent.workspace_id,
      agent.session_id,
      agent.branch,
      agent.worktree_path,
      agent.created_at,
      agent.updated_at
    );
  }

  /**
   * Get a workspace agent by session ID
   */
  getWorkspaceAgentBySession(sessionId: string): WorkspaceAgentRecord | null {
    const stmt = this.db.prepare('SELECT * FROM workspace_agents WHERE session_id = ?');
    const result = stmt.get(sessionId) as WorkspaceAgentRecord | undefined;
    return result || null;
  }

  /**
   * Get all agents for a workspace
   */
  getWorkspaceAgents(workspaceId: string): WorkspaceAgentRecord[] {
    const stmt = this.db.prepare(
      'SELECT * FROM workspace_agents WHERE workspace_id = ? ORDER BY created_at DESC'
    );
    return stmt.all(workspaceId) as WorkspaceAgentRecord[];
  }

  /**
   * Delete a workspace agent
   */
  deleteWorkspaceAgent(id: string): void {
    const stmt = this.db.prepare('DELETE FROM workspace_agents WHERE id = ?');
    stmt.run(id);
  }
}
