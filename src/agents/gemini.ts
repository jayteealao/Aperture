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
 * Gemini CLI ACP backend
 *
 * Spawns Gemini CLI in ACP mode using: gemini --experimental-acp
 *
 * Supports three auth modes:
 * - oauth: Interactive Google login (requires one-time bootstrap via docker exec)
 * - api_key: GEMINI_API_KEY environment variable
 * - vertex: Google Cloud Vertex AI (requires GOOGLE_CLOUD_PROJECT, GOOGLE_CLOUD_LOCATION)
 */
export class GeminiBackend implements AgentBackend {
  readonly name = 'Gemini CLI';
  readonly type = 'gemini' as const;

  private geminiHomePath: string;

  constructor(geminiHomePath: string = '/home/app/.gemini') {
    this.geminiHomePath = geminiHomePath;
  }

  async ensureInstalled(): Promise<AgentReadiness> {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check if gemini CLI is available
    try {
      const output = execSync('gemini --version', { stdio: 'pipe', encoding: 'utf-8' });

      // Check for --experimental-acp flag support
      try {
        const helpOutput = execSync('gemini --help', { stdio: 'pipe', encoding: 'utf-8' });
        if (!helpOutput.includes('--experimental-acp')) {
          warnings.push(
            'Gemini CLI may not support --experimental-acp flag. ACP mode may not work.'
          );
        }
      } catch {
        warnings.push('Could not check Gemini CLI --help output');
      }

      // Extract version if possible
      const versionMatch = output.match(/(\d+\.\d+\.\d+)/);
      if (versionMatch) {
        const version = versionMatch[1];
        // Optionally check minimum version here
        warnings.push(`Gemini CLI version: ${version}`);
      }
    } catch (err) {
      errors.push(
        'Gemini CLI not found. Install via: npm install -g @google/gemini-cli'
      );
    }

    return {
      ready: errors.length === 0,
      executablePath: undefined, // Gemini CLI doesn't use an executable path config
      errors,
      warnings,
    };
  }

  validateAuth(sessionAuth: SessionAuth, hostedMode: boolean, allowInteractiveAuth: boolean): void {
    // Validate apiKeyRef and apiKey combination for api_key mode
    if (sessionAuth.mode === 'api_key') {
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
      if (sessionAuth.providerKey && sessionAuth.providerKey !== 'google') {
        throw new Error('Gemini only supports providerKey="google" in api_key mode');
      }
    }

    // Validate oauth mode (interactive Google login)
    if (sessionAuth.mode === 'oauth') {
      // In HOSTED_MODE, oauth is disabled by default unless explicitly enabled
      if (hostedMode && !allowInteractiveAuth) {
        throw new Error(
          'Gemini OAuth mode (interactive Google login) is disabled in hosted environments. ' +
            'Set ALLOW_INTERACTIVE_AUTH=true to enable, or use auth.mode="api_key" or "vertex" instead.'
        );
      }

      // Warn about oauth limitations even when allowed
      if (hostedMode) {
        console.warn(
          '⚠️  Gemini OAuth mode requires one-time login via: docker exec -it <container> gemini'
        );
        console.warn(
          '⚠️  Ensure ~/.gemini cache directory is persisted via Docker volume.'
        );
      }
    }

    // Validate vertex mode (Google Cloud Vertex AI)
    if (sessionAuth.mode === 'vertex') {
      if (!sessionAuth.vertexProjectId) {
        throw new Error('vertexProjectId (GOOGLE_CLOUD_PROJECT) is required for vertex mode');
      }

      if (!sessionAuth.vertexLocation) {
        throw new Error('vertexLocation (GOOGLE_CLOUD_LOCATION) is required for vertex mode');
      }

      // Validate provider
      if (sessionAuth.providerKey && sessionAuth.providerKey !== 'google') {
        throw new Error('Gemini only supports providerKey="google" in vertex mode');
      }

      console.info(
        `ℹ️  Vertex AI mode: Using project=${sessionAuth.vertexProjectId}, location=${sessionAuth.vertexLocation}`
      );
    }

    // Reject 'interactive' mode for Gemini (use 'oauth' instead)
    if (sessionAuth.mode === 'interactive') {
      throw new Error(
        'Gemini does not support auth.mode="interactive". Use "oauth", "api_key", or "vertex" instead.'
      );
    }
  }

  async spawn(config: SessionConfig, resolvedApiKey?: string): Promise<SpawnedAgent> {
    const env = { ...process.env };

    // Set HOME to persisted directory for OAuth cache
    env.HOME = this.geminiHomePath;

    // Handle authentication based on mode
    if (config.auth.mode === 'api_key') {
      if (!resolvedApiKey) {
        throw new Error('API key required for api_key mode but not provided');
      }

      // Set GEMINI_API_KEY for the subprocess
      env.GEMINI_API_KEY = resolvedApiKey;

      // Explicitly unset other Google API keys to avoid conflicts
      delete env.GOOGLE_API_KEY;
      delete env.GOOGLE_CLOUD_API_KEY;
    } else if (config.auth.mode === 'oauth') {
      // OAuth mode: explicitly unset API keys to prevent accidental API billing
      delete env.GEMINI_API_KEY;
      delete env.GOOGLE_API_KEY;
      delete env.GOOGLE_CLOUD_API_KEY;

      // Rely on Gemini CLI's cached OAuth credentials in ~/.gemini
      console.info('ℹ️  Gemini OAuth mode: Using cached Google credentials from ~/.gemini');
    } else if (config.auth.mode === 'vertex') {
      // Vertex AI mode: set required environment variables
      delete env.GEMINI_API_KEY; // Don't use API key in vertex mode
      delete env.GOOGLE_API_KEY;

      env.GOOGLE_CLOUD_PROJECT = config.auth.vertexProjectId!;
      env.GOOGLE_CLOUD_LOCATION = config.auth.vertexLocation!;

      // If service account credentials path provided, set it
      if (config.auth.vertexCredentialsPath) {
        env.GOOGLE_APPLICATION_CREDENTIALS = config.auth.vertexCredentialsPath;
        console.info(
          `ℹ️  Vertex AI: Using service account credentials from ${config.auth.vertexCredentialsPath}`
        );
      } else {
        // Rely on Application Default Credentials (ADC)
        console.info(
          'ℹ️  Vertex AI: Using Application Default Credentials (ADC)'
        );
      }
    } else {
      throw new Error(`Unsupported auth mode for Gemini: ${config.auth.mode}`);
    }

    // Apply safe whitelisted env vars from session config
    if (config.env) {
      for (const [key, value] of Object.entries(config.env)) {
        // Only allow safe env vars (never accept *_API_KEY or Google secrets unless auth mode allows)
        if (
          key.endsWith('_API_KEY') ||
          key.includes('GOOGLE_CLOUD') ||
          key.includes('GOOGLE_APPLICATION')
        ) {
          // Reject secret env vars unless mode explicitly handles them
          if (config.auth.mode !== 'api_key' && config.auth.mode !== 'vertex') {
            throw new Error(
              `Environment variable ${key} not allowed in ${config.auth.mode} mode. ` +
                'Use appropriate auth.mode instead.'
            );
          }
        }
        env[key] = value;
      }
    }

    // Spawn Gemini CLI in ACP mode
    const child = spawn('gemini', ['--experimental-acp'], {
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: true, // Required on Windows to resolve .cmd executables
    });

    return {
      child,
      agentType: 'gemini',
    };
  }
}
