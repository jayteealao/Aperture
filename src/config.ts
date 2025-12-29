import { createRequire } from 'module';
const require = createRequire(import.meta.url);

export interface Config {
  // Server
  port: number;
  host: string;
  logLevel: string;

  // Authentication
  apiToken: string;

  // Optional Anthropic API key
  anthropicApiKey?: string;

  // Session limits
  maxConcurrentSessions: number;
  sessionIdleTimeoutMs: number;
  maxMessageSizeBytes: number;

  // Request timeout
  rpcRequestTimeoutMs: number;

  // Rate limiting
  rateLimitMax: number;
  rateLimitWindowMs: number;

  // Claude Code CLI path (optional, will auto-detect if not set)
  claudeCodeExecutable?: string;
}

function getEnv(key: string, defaultValue?: string): string | undefined {
  return process.env[key] || defaultValue;
}

function getEnvRequired(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

function getEnvNumber(key: string, defaultValue: number): number {
  const value = process.env[key];
  if (!value) {
    return defaultValue;
  }
  const parsed = parseInt(value, 10);
  if (isNaN(parsed)) {
    throw new Error(`Invalid number for ${key}: ${value}`);
  }
  return parsed;
}

export function loadConfig(): Config {
  // APERTURE_API_TOKEN is mandatory
  const apiToken = getEnvRequired('APERTURE_API_TOKEN');

  // Warn if ANTHROPIC_API_KEY is set
  const anthropicApiKey = getEnv('ANTHROPIC_API_KEY');
  if (anthropicApiKey) {
    console.warn(
      '⚠️  ANTHROPIC_API_KEY is set - this will use API billing instead of subscription usage!'
    );
    console.warn(
      '⚠️  To use Claude Pro/Max subscription, unset ANTHROPIC_API_KEY and authenticate via Claude Code CLI.'
    );
  }

  return {
    port: getEnvNumber('PORT', 8080),
    host: getEnv('HOST', '0.0.0.0')!,
    logLevel: getEnv('LOG_LEVEL', 'info')!,
    apiToken,
    anthropicApiKey,
    maxConcurrentSessions: getEnvNumber('MAX_CONCURRENT_SESSIONS', 50),
    sessionIdleTimeoutMs: getEnvNumber('SESSION_IDLE_TIMEOUT_MS', 600000), // 10 min
    maxMessageSizeBytes: getEnvNumber('MAX_MESSAGE_SIZE_BYTES', 262144), // 256KB
    rpcRequestTimeoutMs: getEnvNumber('RPC_REQUEST_TIMEOUT_MS', 300000), // 5 min
    rateLimitMax: getEnvNumber('RATE_LIMIT_MAX', 100),
    rateLimitWindowMs: getEnvNumber('RATE_LIMIT_WINDOW_MS', 60000), // 1 min
    claudeCodeExecutable: getEnv('CLAUDE_CODE_EXECUTABLE'),
  };
}
