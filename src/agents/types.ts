import type { SdkSessionConfig } from './sdk-types.js';
import type { PiSessionConfig } from './pi-types.js';

/**
 * Authentication mode for an agent session
 */
export type AuthMode = 'api_key' | 'oauth';

/**
 * Provider type - Claude SDK uses anthropic, Pi SDK supports multiple providers
 */
export type Provider = 'anthropic' | 'openai' | 'google' | 'groq' | 'openrouter';

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
 * Agent type - SDK-based agents only
 */
export type AgentType = 'claude_sdk' | 'pi_sdk';

/**
 * Session configuration for creating an agent
 */
export interface SessionConfig {
  id: string;
  agent: AgentType;
  auth: SessionAuth;
  env?: Record<string, string>;
  sdk?: SdkSessionConfig; // Claude SDK-specific configuration
  pi?: PiSessionConfig; // Pi SDK-specific configuration
}

/**
 * Agent readiness status
 */
export interface AgentReadiness {
  ready: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * SDK Agent backend interface (no spawn method)
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

/**
 * Legacy AgentBackend alias - all backends are now SDK-based
 */
export type AgentBackend = SdkAgentBackend;
