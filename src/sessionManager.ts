import { randomUUID } from 'crypto';
import type { Config } from './config.js';
import { Session, type SessionOptions } from './session.js';

export interface CreateSessionOptions {
  anthropicApiKey?: string;
}

/**
 * Manages all active sessions
 */
export class SessionManager {
  private sessions: Map<string, Session> = new Map();
  private config: Config;
  private claudeCodeExecutable?: string;

  constructor(config: Config, claudeCodeExecutable?: string) {
    this.config = config;
    this.claudeCodeExecutable = claudeCodeExecutable;
  }

  /**
   * Creates a new session
   */
  async createSession(options: CreateSessionOptions = {}): Promise<Session> {
    // Check max sessions limit
    if (this.sessions.size >= this.config.maxConcurrentSessions) {
      throw new Error(
        `Maximum concurrent sessions (${this.config.maxConcurrentSessions}) reached`
      );
    }

    const id = randomUUID();
    const session = new Session(id, {
      config: this.config,
      claudeCodeExecutable: this.claudeCodeExecutable,
      anthropicApiKey: options.anthropicApiKey,
    });

    // Set up event handlers
    session.on('exit', () => {
      this.sessions.delete(id);
    });

    session.on('idle', () => {
      console.log(`Session ${id} idle, terminating`);
    });

    session.on('error', (err) => {
      console.error(`Session ${id} error:`, err);
    });

    session.on('stderr', (line) => {
      console.error(`Session ${id} stderr: ${line}`);
    });

    // Start the session
    await session.start();

    this.sessions.set(id, session);
    return session;
  }

  /**
   * Gets a session by ID
   */
  getSession(id: string): Session | undefined {
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
  }

  /**
   * Gets all sessions
   */
  getAllSessions(): Session[] {
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
