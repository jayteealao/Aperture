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
      (id, agent, auth_mode, acp_session_id, created_at, last_activity_at, ended_at, status, metadata, user_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      session.user_id
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
}
