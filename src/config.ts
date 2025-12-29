import { config as loadEnv } from 'dotenv';

// Load .env file
loadEnv();

export interface Config {
  // Server
  port: number;
  host: string;
  logLevel: string;

  // Authentication
  apiToken: string;

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

  // Auto-install Claude CLI if not found
  autoInstallClaude: boolean;

  // Hosted mode (enforces API key auth for Codex)
  hostedMode: boolean;

  // Allow interactive/OAuth auth modes in hosted mode (default: false)
  allowInteractiveAuth: boolean;

  // Credential storage encryption key (optional, enables stored credentials)
  credentialsMasterKey?: string;

  // Path to store encrypted credentials
  credentialsStorePath: string;

  // Gemini CLI home directory for OAuth cache
  geminiHomePath: string;
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

function getEnvBoolean(key: string, defaultValue: boolean): boolean {
  const value = process.env[key];
  if (!value) {
    return defaultValue;
  }
  const lower = value.toLowerCase();
  if (lower === 'true' || lower === '1' || lower === 'yes') {
    return true;
  }
  if (lower === 'false' || lower === '0' || lower === 'no') {
    return false;
  }
  throw new Error(`Invalid boolean for ${key}: ${value} (use true/false)`);
}

export function loadConfig(): Config {
  // APERTURE_API_TOKEN is mandatory
  const apiToken = getEnvRequired('APERTURE_API_TOKEN');

  // Warn if old API key env vars are set (no longer automatically forwarded)
  if (process.env.ANTHROPIC_API_KEY) {
    console.warn(
      '⚠️  ANTHROPIC_API_KEY in gateway environment is IGNORED by default.'
    );
    console.warn(
      '⚠️  Use per-session auth.mode="api_key" to explicitly enable API billing for a session.'
    );
  }
  if (process.env.OPENAI_API_KEY) {
    console.warn(
      '⚠️  OPENAI_API_KEY in gateway environment is IGNORED by default.'
    );
    console.warn(
      '⚠️  Use per-session auth.mode="api_key" for Codex sessions to explicitly enable API billing.'
    );
  }
  if (process.env.GEMINI_API_KEY) {
    console.warn(
      '⚠️  GEMINI_API_KEY in gateway environment is IGNORED by default.'
    );
    console.warn(
      '⚠️  Use per-session auth.mode="api_key" for Gemini sessions to explicitly enable API billing.'
    );
  }

  const credentialsMasterKey = getEnv('CREDENTIALS_MASTER_KEY');
  if (credentialsMasterKey && credentialsMasterKey.length < 32) {
    console.warn(
      '⚠️  CREDENTIALS_MASTER_KEY must be at least 32 characters. Stored credentials disabled.'
    );
  }

  return {
    port: getEnvNumber('PORT', 8080),
    host: getEnv('HOST', '0.0.0.0')!,
    logLevel: getEnv('LOG_LEVEL', 'info')!,
    apiToken,
    maxConcurrentSessions: getEnvNumber('MAX_CONCURRENT_SESSIONS', 50),
    sessionIdleTimeoutMs: getEnvNumber('SESSION_IDLE_TIMEOUT_MS', 600000), // 10 min
    maxMessageSizeBytes: getEnvNumber('MAX_MESSAGE_SIZE_BYTES', 262144), // 256KB
    rpcRequestTimeoutMs: getEnvNumber('RPC_REQUEST_TIMEOUT_MS', 300000), // 5 min
    rateLimitMax: getEnvNumber('RATE_LIMIT_MAX', 100),
    rateLimitWindowMs: getEnvNumber('RATE_LIMIT_WINDOW_MS', 60000), // 1 min
    claudeCodeExecutable: getEnv('CLAUDE_CODE_EXECUTABLE'),
    autoInstallClaude: getEnvBoolean('AUTO_INSTALL_CLAUDE_CLI', false),
    hostedMode: getEnvBoolean('HOSTED_MODE', true),
    allowInteractiveAuth: getEnvBoolean('ALLOW_INTERACTIVE_AUTH', false),
    credentialsMasterKey:
      credentialsMasterKey && credentialsMasterKey.length >= 32
        ? credentialsMasterKey
        : undefined,
    credentialsStorePath: getEnv('CREDENTIALS_STORE_PATH', '/data/credentials.json.enc')!,
    geminiHomePath: getEnv('GEMINI_HOME_PATH', '/home/app/.gemini')!,
  };
}
