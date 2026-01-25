import { spawn } from 'child_process';
import type {
  AgentBackend,
  AgentReadiness,
  SessionAuth,
  SessionConfig,
  SpawnedAgent,
} from './types.js';

/**
 * Claude Code ACP backend
 */
export class ClaudeBackend implements AgentBackend {
  readonly name = 'Claude(ACP)';
  readonly type = 'claude_acp' as const;

  private claudeCodeExecutable?: string;

  constructor(claudeCodeExecutable?: string) {
    this.claudeCodeExecutable = claudeCodeExecutable;
  }

  async ensureInstalled(): Promise<AgentReadiness> {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check if claude-code-acp is available
    try {
      const { execSync } = await import('child_process');
      execSync('which claude-code-acp || where claude-code-acp', { stdio: 'ignore' });
    } catch {
      errors.push(
        'claude-code-acp not found in PATH. Install via: npm install -g @zed-industries/claude-code-acp'
      );
    }

    // Check Claude CLI (optional but recommended)
    if (!this.claudeCodeExecutable) {
      warnings.push(
        'Claude Code CLI not configured. Agent will use vendored CLI (limited functionality).'
      );
    }

    return {
      ready: errors.length === 0,
      executablePath: this.claudeCodeExecutable,
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
      if (sessionAuth.providerKey && sessionAuth.providerKey !== 'anthropic') {
        throw new Error('Claude Code only supports providerKey="anthropic" in api_key mode');
      }
    }

    // Interactive mode is allowed for Claude (user must have logged in via docker exec)
    if (sessionAuth.mode === 'interactive' && hostedMode) {
      // Just a warning - interactive mode works if user has run `claude` and `/login` once
      console.warn(
        'ℹ️  Claude Code interactive mode in hosted environment requires one-time login via: docker exec -it <container> claude'
      );
    }
  }

  async spawn(config: SessionConfig, resolvedApiKey?: string): Promise<SpawnedAgent> {
    const env = { ...process.env };

    // Set CLAUDE_CODE_EXECUTABLE if configured
    if (this.claudeCodeExecutable) {
      env.CLAUDE_CODE_EXECUTABLE = this.claudeCodeExecutable;
    }

    // Handle authentication based on mode
    if (config.auth.mode === 'api_key') {
      if (!resolvedApiKey) {
        throw new Error('API key required for api_key mode but not provided');
      }
      env.ANTHROPIC_API_KEY = resolvedApiKey;
    } else {
      // Interactive mode: explicitly unset to prevent accidental API billing
      delete env.ANTHROPIC_API_KEY;
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

    const child = spawn('claude-code-acp', [], {
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: true, // Required on Windows to resolve .cmd executables
    });

    return {
      child,
      agentType: 'claude_acp',
    };
  }
}
