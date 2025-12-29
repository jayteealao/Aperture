import { spawn } from 'child_process';
import { execSync } from 'child_process';
import type {
  AgentBackend,
  AgentReadiness,
  SessionAuth,
  SessionConfig,
  SpawnedAgent,
} from './types.js';

/**
 * Codex ACP backend
 */
export class CodexBackend implements AgentBackend {
  readonly name = 'Codex';
  readonly type = 'codex' as const;

  async ensureInstalled(): Promise<AgentReadiness> {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check if codex CLI is available
    try {
      execSync('codex --version', { stdio: 'ignore' });
    } catch {
      errors.push('Codex CLI not found. Install via: npm install -g @openai/codex');
    }

    // Check if codex-acp is available
    try {
      execSync('which codex-acp || where codex-acp', { stdio: 'ignore' });
    } catch {
      errors.push(
        'codex-acp not found in PATH. Install via: npm install -g @zed-industries/codex-acp'
      );
    }

    return {
      ready: errors.length === 0,
      executablePath: undefined, // Codex doesn't use an executable path config
      errors,
      warnings,
    };
  }

  validateAuth(sessionAuth: SessionAuth, hostedMode: boolean, _allowInteractiveAuth?: boolean): void {
    // Validate apiKeyRef and apiKey combination
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
    if (sessionAuth.mode === 'api_key') {
      if (sessionAuth.providerKey && sessionAuth.providerKey !== 'openai') {
        throw new Error('Codex only supports providerKey="openai" in api_key mode');
      }
    }

    // In HOSTED_MODE, require API key for Codex
    if (hostedMode && sessionAuth.mode === 'interactive') {
      throw new Error(
        'Codex interactive mode (ChatGPT login) is not supported in hosted environments. ' +
          'Please use auth.mode="api_key" with an OpenAI API key.'
      );
    }

    // Even in non-hosted mode, warn about interactive limitations
    if (sessionAuth.mode === 'interactive') {
      console.warn(
        '⚠️  Codex interactive mode (ChatGPT login) may not work for remote projects.'
      );
      console.warn(
        '⚠️  Consider using auth.mode="api_key" with an OpenAI API key for reliable operation.'
      );
    }
  }

  async spawn(config: SessionConfig, resolvedApiKey?: string): Promise<SpawnedAgent> {
    const env = { ...process.env };

    // Handle authentication based on mode
    if (config.auth.mode === 'api_key') {
      if (!resolvedApiKey) {
        throw new Error('API key required for api_key mode but not provided');
      }

      // Codex supports both OPENAI_API_KEY and CODEX_API_KEY
      // Default to OPENAI_API_KEY as it's more standard
      env.OPENAI_API_KEY = resolvedApiKey;

      // Explicitly unset CODEX_API_KEY to avoid conflicts
      // (unless user explicitly set it in session env)
      if (!config.env?.CODEX_API_KEY) {
        delete env.CODEX_API_KEY;
      }
    } else {
      // Interactive mode: explicitly unset to prevent accidental API billing
      delete env.OPENAI_API_KEY;
      delete env.CODEX_API_KEY;
    }

    // Apply safe whitelisted env vars from session config
    if (config.env) {
      for (const [key, value] of Object.entries(config.env)) {
        // Only allow safe env vars (never accept *_API_KEY unless auth.mode=api_key)
        if (key.endsWith('_API_KEY')) {
          if (config.auth.mode !== 'api_key') {
            throw new Error(
              `Environment variable ${key} not allowed in interactive mode. Use auth.mode="api_key" instead.`
            );
          }
        }
        env[key] = value;
      }
    }

    const child = spawn('codex-acp', [], {
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    return {
      child,
      agentType: 'codex',
    };
  }
}
