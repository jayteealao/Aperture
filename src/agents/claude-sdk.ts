import type { AgentReadiness, SessionAuth, AgentBackend } from './types.js';

/**
 * Claude SDK backend
 * Uses @anthropic-ai/claude-agent-sdk for programmatic interaction
 */
export class ClaudeSdkBackend implements AgentBackend {
  readonly name = 'Claude';
  readonly type = 'claude_sdk' as const;

  async ensureInstalled(): Promise<AgentReadiness> {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check if @anthropic-ai/claude-agent-sdk is importable
    try {
      await import('@anthropic-ai/claude-agent-sdk');
    } catch {
      errors.push(
        '@anthropic-ai/claude-agent-sdk not found. Install via: npm install @anthropic-ai/claude-agent-sdk'
      );
    }

    // Check if Claude CLI is available (required by SDK runtime)
    try {
      const { execSync } = await import('child_process');
      execSync('which claude || where claude', { stdio: 'ignore' });
    } catch {
      warnings.push(
        'Claude CLI not found in PATH. SDK may use bundled CLI or fail to start.'
      );
    }

    return {
      ready: errors.length === 0,
      errors,
      warnings,
    };
  }

  validateAuth(sessionAuth: SessionAuth, hostedMode: boolean, _allowInteractiveAuth?: boolean): void {
    // SDK supports api_key mode and oauth mode (pre-authenticated)
    if (sessionAuth.mode !== 'api_key' && sessionAuth.mode !== 'oauth') {
      throw new Error(
        'Claude SDK only supports api_key or oauth authentication modes.'
      );
    }

    // OAuth mode assumes pre-existing authentication
    if (sessionAuth.mode === 'oauth') {
      if (hostedMode) {
        console.warn(
          'Claude SDK OAuth mode in hosted environment requires one-time login via: docker exec -it <container> claude'
        );
      }
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

    // Validate provider for API key mode
    if (sessionAuth.providerKey && sessionAuth.providerKey !== 'anthropic') {
      throw new Error('Claude SDK only supports providerKey="anthropic"');
    }
  }
}
