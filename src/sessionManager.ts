import { Session, SessionOptions } from './session';
import { config } from './config';

export class SessionManager {
  private static instance: SessionManager;
  private sessions = new Map<string, Session>();

  private constructor() {
    // Periodic cleanup of idle sessions
    setInterval(() => this.cleanupIdleSessions(), 60000);
  }

  static getInstance(): SessionManager {
    if (!SessionManager.instance) {
      SessionManager.instance = new SessionManager();
    }
    return SessionManager.instance;
  }

  async createSession(options: SessionOptions): Promise<Session> {
    if (this.sessions.size >= config.MAX_SESSIONS) {
      throw new Error('Max concurrent sessions reached');
    }

    const session = new Session(options);
    await session.start();
    this.sessions.set(session.id, session);

    session.on('close', () => {
      this.sessions.delete(session.id);
    });

    return session;
  }

  getSession(id: string): Session | undefined {
    return this.sessions.get(id);
  }

  terminateSession(id: string): boolean {
    const session = this.sessions.get(id);
    if (session) {
      session.close();
      this.sessions.delete(id);
      return true;
    }
    return false;
  }

  private cleanupIdleSessions() {
    for (const [id, session] of this.sessions) {
      if (session.isIdle(config.SESSION_TIMEOUT_MS)) {
        console.log(`[SessionManager] Terminating idle session ${id}`);
        session.close();
      }
    }
  }

  get stats() {
    return {
      activeSessions: this.sessions.size,
    };
  }
}
