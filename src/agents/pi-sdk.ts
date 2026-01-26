import type { AgentReadiness, SessionAuth, SdkAgentBackend } from './types.js';

/**
 * Pi Coding Agent SDK backend
 * Uses @mariozechner/pi-coding-agent for programmatic interaction
 * Supports multiple providers: Anthropic, OpenAI, Google, Groq, OpenRouter
 */
export class PiSdkBackend implements SdkAgentBackend {
  readonly name = 'Pi(SDK)';
  readonly type = 'pi_sdk' as const;

  async ensureInstalled(): Promise<AgentReadiness> {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check if @mariozechner/pi-coding-agent is importable
    try {
      await import('@mariozechner/pi-coding-agent');
    } catch {
      errors.push(
        '@mariozechner/pi-coding-agent not found. Install via: npm install @mariozechner/pi-coding-agent'
      );
    }

    // Check Node.js version (Pi SDK requires >= 20.0.0)
    const nodeVersion = process.versions.node;
    const majorVersion = parseInt(nodeVersion.split('.')[0], 10);
    if (majorVersion < 20) {
      errors.push(
        `Pi SDK requires Node.js >= 20.0.0. Current version: ${nodeVersion}`
      );
    }

    return {
      ready: errors.length === 0,
      errors,
      warnings,
    };
  }

  validateAuth(sessionAuth: SessionAuth, _hostedMode: boolean, _allowInteractiveAuth?: boolean): void {
    // Pi SDK supports api_key mode (multiple providers) and oauth
    if (sessionAuth.mode !== 'api_key' && sessionAuth.mode !== 'oauth') {
      throw new Error(
        'Pi SDK only supports api_key or oauth authentication modes.'
      );
    }

    // OAuth mode assumes pre-existing authentication via Pi's auth system
    if (sessionAuth.mode === 'oauth') {
      // Pi SDK handles OAuth through its AuthStorage system
      // No further validation needed
      return;
    }

    // Validate apiKeyRef and apiKey combination for api_key mode
    if (sessionAuth.apiKeyRef === 'inline' && !sessionAuth.apiKey) {
      throw new Error('apiKey is required when apiKeyRef="inline"');
    }

    if (sessionAuth.apiKeyRef !== 'inline' && sessionAuth.apiKey) {
      throw new Error('apiKey can only be provided when apiKeyRef="inline"');
    }

    if (sessionAuth.apiKeyRef === 'stored' && !sessionAuth.storedCredentialId) {
      throw new Error('storedCredentialId is required when apiKeyRef="stored"');
    }

    // Pi SDK supports multiple providers
    const supportedProviders = ['anthropic', 'openai', 'google', 'groq', 'openrouter'];
    if (sessionAuth.providerKey && !supportedProviders.includes(sessionAuth.providerKey)) {
      throw new Error(
        `Pi SDK supports providers: ${supportedProviders.join(', ')}. Got: ${sessionAuth.providerKey}`
      );
    }
  }
}
