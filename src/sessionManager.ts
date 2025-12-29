import { randomUUID } from 'crypto';
import type { Config } from './config.js';
import { Session } from './session.js';
import { getAgentBackend } from './agents/index.js';
import type { SessionAuth, AgentType, SessionConfig } from './agents/index.js';
import type { CredentialStore } from './credentials.js';

export interface CreateSessionOptions {
  agent?: AgentType;
  auth?: SessionAuth;
  env?: Record<string, string>;
}

/**
 * Manages all active sessions
 */
export class SessionManager {
  private sessions: Map<string, Session> = new Map();
  private config: Config;
  private claudeCodeExecutable?: string;
  private credentialStore?: CredentialStore;

  constructor(config: Config, claudeCodeExecutable?: string, credentialStore?: CredentialStore) {
    this.config = config;
    this.claudeCodeExecutable = claudeCodeExecutable;
    this.credentialStore = credentialStore;
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
    const agent = options.agent || 'claude_code'; // Default to Claude Code for backwards compatibility

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

    // Create session
    const session = new Session(sessionConfig, backend, this.config, resolvedApiKey);

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
