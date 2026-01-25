import type { ChildProcess } from 'child_process';
import type { SdkSessionConfig } from './sdk-types.js';

/**
 * Authentication mode for an agent session
 */
export type AuthMode = 'interactive' | 'api_key' | 'oauth' | 'vertex';

/**
 * Provider type
 */
export type Provider = 'anthropic' | 'openai' | 'google';

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

  // Vertex AI specific (only for mode='vertex')
  vertexProjectId?: string; // GOOGLE_CLOUD_PROJECT
  vertexLocation?: string; // GOOGLE_CLOUD_LOCATION
  vertexCredentialsPath?: string; // Path to service account JSON (optional)
}

/**
 * Agent type
 */
export type AgentType = 'claude_acp' | 'codex' | 'gemini' | 'claude_sdk';

/**
 * Session configuration for creating an agent
 */
export interface SessionConfig {
  id: string;
  agent: AgentType;
  auth: SessionAuth;
  env?: Record<string, string>;
  sdk?: SdkSessionConfig; // SDK-specific configuration
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
  validateAuth(sessionAuth: SessionAuth, hostedMode: boolean, allowInteractiveAuth?: boolean): void;

  /**
   * Spawn the agent process with the given configuration
   */
  spawn(config: SessionConfig, resolvedApiKey?: string): Promise<SpawnedAgent>;
}

/**
 * SDK-based agent backend interface
 * For agents that use library calls instead of spawning processes
 */
export interface SdkAgentBackend {
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
  validateAuth(sessionAuth: SessionAuth, hostedMode: boolean, allowInteractiveAuth?: boolean): void;
}
