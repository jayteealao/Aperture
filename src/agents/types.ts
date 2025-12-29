import type { ChildProcess } from 'child_process';

/**
 * Authentication mode for an agent session
 */
export type AuthMode = 'interactive' | 'api_key';

/**
 * Provider type
 */
export type Provider = 'anthropic' | 'openai';

/**
 * API key reference type
 */
export type ApiKeyRef = 'inline' | 'stored' | 'none';

/**
 * Session authentication configuration
 */
export interface SessionAuth {
  mode: AuthMode;
  providerKey?: Provider;
  apiKeyRef?: ApiKeyRef;
  apiKey?: string; // Only allowed when apiKeyRef='inline'
  storedCredentialId?: string; // Only used when apiKeyRef='stored'
}

/**
 * Agent type
 */
export type AgentType = 'claude_code' | 'codex';

/**
 * Session configuration for creating an agent
 */
export interface SessionConfig {
  id: string;
  agent: AgentType;
  auth: SessionAuth;
  env?: Record<string, string>;
}

/**
 * Agent readiness status
 */
export interface AgentReadiness {
  ready: boolean;
  executablePath?: string;
  errors: string[];
  warnings: string[];
}

/**
 * Spawned agent process info
 */
export interface SpawnedAgent {
  child: ChildProcess;
  agentType: AgentType;
}

/**
 * Agent backend interface
 * Each agent (Claude Code, Codex) implements this interface
 */
export interface AgentBackend {
  /** Agent name */
  readonly name: string;

  /** Agent type identifier */
  readonly type: AgentType;

  /**
   * Check if agent dependencies are installed and ready
   */
  ensureInstalled(): Promise<AgentReadiness>;

  /**
   * Validate authentication configuration for this agent
   * Throws user-facing errors if invalid
   */
  validateAuth(sessionAuth: SessionAuth, hostedMode: boolean): void;

  /**
   * Spawn the agent process with the given configuration
   */
  spawn(config: SessionConfig, resolvedApiKey?: string): Promise<SpawnedAgent>;
}
