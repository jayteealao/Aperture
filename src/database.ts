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
  workspace_id: string | null;
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

export interface TurnDiffSummaryFileRecord {
  path: string;
  additions: number;
  deletions: number;
}

export interface TurnDiffSummaryRecord {
  id: string;
  session_id: string;
  user_message_id: string | null;
  assistant_message_id: string;
  checkpoint_id: string | null;
  provider_session_id: string | null;
  working_directory: string;
  turn_started_at: number;
  turn_completed_at: number;
  git_base_head: string | null;
  git_head_at_completion: string | null;
  file_count: number;
  additions: number;
  deletions: number;
  files_json: string;
  patch_text: string;
  metadata: string | null;
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

export type CloneSource = 'workspace' | 'remote' | 'init' | 'external';

export interface ManagedRepoRecord {
  id: string;
  workspace_id: string;
  path: string;
  name: string;
  origin_url: string | null;
  created_at: number;
  updated_at: number;
  session_id: string | null;
  clone_source: CloneSource;
}

export class ApertureDatabase {
  private db: Database.Database;
  private hasSessionWorkspaceColumn = false;

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
    this.refreshSchemaCapabilities();

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

    this.ensureSessionWorkspaceCompatibility();
    const newVersion = this.getCurrentVersion();
    this.refreshSchemaCapabilities();
    console.log('[DB] Schema version after migrations:', newVersion);
  }

  private refreshSchemaCapabilities(): void {
    this.hasSessionWorkspaceColumn = this.hasColumn('sessions', 'workspace_id');
  }

  private hasColumn(table: string, column: string): boolean {
    const rows = this.db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
    return rows.some((row) => row.name === column);
  }

  /**
   * Some upgraded installations can have managed repos/workspaces but still miss the
   * sessions.workspace_id column if migration 008 never ran. Self-heal that case so
   * legacy workspace sessions can be associated and shown without manual cleanup.
   */
  private ensureSessionWorkspaceCompatibility(): void {
    if (this.hasColumn('sessions', 'workspace_id')) {
      this.hasSessionWorkspaceColumn = true;
      return;
    }

    console.log('[DB] Adding missing sessions.workspace_id compatibility column');
    this.db.exec('ALTER TABLE sessions ADD COLUMN workspace_id TEXT');
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_sessions_workspace_id ON sessions(workspace_id)');
    this.db.prepare(`
      INSERT INTO schema_version (version, applied_at)
      SELECT 8, ?
      WHERE NOT EXISTS (SELECT 1 FROM schema_version WHERE version = 8)
    `).run(Date.now());
    this.hasSessionWorkspaceColumn = true;
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
    if (this.hasSessionWorkspaceColumn) {
      const stmt = this.db.prepare(`
        INSERT OR REPLACE INTO sessions
        (id, agent, auth_mode, acp_session_id, created_at, last_activity_at, ended_at, status, metadata, user_id, sdk_session_id, sdk_config, is_resumable, working_directory, workspace_id, pi_session_path)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
        session.workspace_id ?? null,
        session.pi_session_path ?? null
      );
      return;
    }

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
   * Get the most recent session associated with a working directory.
   */
  getSessionByWorkingDirectory(workingDirectory: string): SessionRecord | null {
    const stmt = this.db.prepare(`
      SELECT * FROM sessions
      WHERE working_directory = ?
      ORDER BY last_activity_at DESC, created_at DESC
      LIMIT 1
    `);
    const result = stmt.get(workingDirectory) as SessionRecord | undefined;
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
   * Get sessions that should be discoverable to browsers.
   * Active sessions are always included. Idle sessions are included when resumable.
   */
  getDiscoverableSessions(): SessionRecord[] {
    const stmt = this.db.prepare(`
      SELECT * FROM sessions
      WHERE status = 'active'
         OR (status = 'idle' AND is_resumable = 1)
      ORDER BY last_activity_at DESC
    `);
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
   * Update status fields without replacing the full row.
   */
  updateSessionStatus(
    id: string,
    status: SessionRecord['status'],
    timestamp: number = Date.now(),
    endedAt: number | null = null
  ): void {
    const stmt = this.db.prepare(
      'UPDATE sessions SET status = ?, last_activity_at = ?, ended_at = ? WHERE id = ?'
    );
    stmt.run(status, timestamp, endedAt, id);
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
      "SELECT * FROM sessions WHERE is_resumable = 1 AND (sdk_session_id IS NOT NULL OR pi_session_path IS NOT NULL) ORDER BY last_activity_at DESC"
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
   * Update workspace association for a session.
   */
  updateWorkspaceId(id: string, workspaceId: string | null): void {
    if (!this.hasSessionWorkspaceColumn) {
      return;
    }
    const stmt = this.db.prepare("UPDATE sessions SET workspace_id = ? WHERE id = ?");
    stmt.run(workspaceId, id);
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
   * Save or update a canonical message snapshot for a session.
   */
  upsertMessage(message: MessageRecord): void {
    const stmt = this.db.prepare(`
      INSERT INTO messages (id, session_id, role, content, timestamp, metadata)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        session_id = excluded.session_id,
        role = excluded.role,
        content = excluded.content,
        timestamp = excluded.timestamp,
        metadata = excluded.metadata
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
   * Delete a workspace
   */
  deleteWorkspace(id: string): void {
    const stmt = this.db.prepare('DELETE FROM workspaces WHERE id = ?');
    stmt.run(id);
  }

  // ==================== Managed Repos Methods ====================

  /**
   * Save or update a managed repo
   */
  saveManagedRepo(repo: ManagedRepoRecord): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO managed_repos
      (id, workspace_id, path, name, origin_url, created_at, updated_at, session_id, clone_source)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      repo.id,
      repo.workspace_id,
      repo.path,
      repo.name,
      repo.origin_url,
      repo.created_at,
      repo.updated_at,
      repo.session_id,
      repo.clone_source
    );
  }

  /**
   * Get a managed repo by ID
   */
  getManagedRepo(id: string): ManagedRepoRecord | null {
    const stmt = this.db.prepare('SELECT * FROM managed_repos WHERE id = ?');
    const result = stmt.get(id) as ManagedRepoRecord | undefined;
    return result || null;
  }

  // ==================== Turn Diff Summary Methods ====================

  saveTurnDiffSummary(summary: TurnDiffSummaryRecord): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO turn_diff_summaries
      (id, session_id, user_message_id, assistant_message_id, checkpoint_id, provider_session_id, working_directory, turn_started_at, turn_completed_at, git_base_head, git_head_at_completion, file_count, additions, deletions, files_json, patch_text, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      summary.id,
      summary.session_id,
      summary.user_message_id,
      summary.assistant_message_id,
      summary.checkpoint_id,
      summary.provider_session_id,
      summary.working_directory,
      summary.turn_started_at,
      summary.turn_completed_at,
      summary.git_base_head,
      summary.git_head_at_completion,
      summary.file_count,
      summary.additions,
      summary.deletions,
      summary.files_json,
      summary.patch_text,
      summary.metadata
    );
  }

  getTurnDiffSummaries(sessionId: string): TurnDiffSummaryRecord[] {
    const stmt = this.db.prepare(`
      SELECT * FROM turn_diff_summaries
      WHERE session_id = ?
      ORDER BY turn_completed_at ASC
    `);
    return stmt.all(sessionId) as TurnDiffSummaryRecord[];
  }

  getTurnDiffSummaryByAssistantMessageId(
    sessionId: string,
    assistantMessageId: string
  ): TurnDiffSummaryRecord | null {
    const stmt = this.db.prepare(`
      SELECT * FROM turn_diff_summaries
      WHERE session_id = ? AND assistant_message_id = ?
      LIMIT 1
    `);
    const result = stmt.get(sessionId, assistantMessageId) as TurnDiffSummaryRecord | undefined;
    return result || null;
  }

  getLatestAssistantMessageId(sessionId: string, sinceTimestamp: number = 0): string | null {
    const stmt = this.db.prepare(`
      SELECT id
      FROM messages
      WHERE session_id = ? AND role = 'assistant' AND timestamp >= ?
      ORDER BY timestamp DESC
      LIMIT 1
    `);
    const result = stmt.get(sessionId, sinceTimestamp) as { id: string } | undefined;
    return result?.id || null;
  }

  /**
   * Get the most recent managed repo associated with a session.
   */
  getManagedRepoBySessionId(sessionId: string): ManagedRepoRecord | null {
    const stmt = this.db.prepare(
      'SELECT * FROM managed_repos WHERE session_id = ? ORDER BY updated_at DESC, created_at DESC LIMIT 1'
    );
    const result = stmt.get(sessionId) as ManagedRepoRecord | undefined;
    return result || null;
  }

  /**
   * Get managed repos for a workspace
   */
  getManagedRepos(workspaceId: string = 'default'): ManagedRepoRecord[] {
    const stmt = this.db.prepare(
      'SELECT * FROM managed_repos WHERE workspace_id = ? ORDER BY created_at DESC'
    );
    return stmt.all(workspaceId) as ManagedRepoRecord[];
  }

  /**
   * Get managed repo by path
   */
  getManagedRepoByPath(path: string): ManagedRepoRecord | null {
    const stmt = this.db.prepare('SELECT * FROM managed_repos WHERE path = ?');
    const result = stmt.get(path) as ManagedRepoRecord | undefined;
    return result || null;
  }

  /**
   * Delete a managed repo
   */
  deleteManagedRepo(id: string): void {
    const stmt = this.db.prepare('DELETE FROM managed_repos WHERE id = ?');
    stmt.run(id);
  }

  /**
   * Update managed repo session association
   */
  updateManagedRepoSession(id: string, sessionId: string | null): void {
    const stmt = this.db.prepare('UPDATE managed_repos SET session_id = ? WHERE id = ?');
    stmt.run(sessionId, id);
  }
}
