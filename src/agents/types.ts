import type { SdkSessionConfig } from './sdk-types.js';

/**
 * Authentication mode for an agent session
 */
export type AuthMode = 'api_key' | 'oauth';

/**
 * Provider type (only Anthropic for Claude SDK)
 */
export type Provider = 'anthropic';

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
 * Agent type - Claude SDK only
 */
export type AgentType = 'claude_sdk';

/**
 * Session configuration for creating an agent
 */
export interface SessionConfig {
  id: string;
  agent: AgentType;
  auth: SessionAuth;
  env?: Record<string, string>;
  sdk?: SdkSessionConfig;
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
 * Agent backend interface for Claude SDK
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
}
