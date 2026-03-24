#!/usr/bin/env node
/**
 * Aperture CLI entry point.
 *
 * CLI flags take precedence over environment variables; environment variables
 * take precedence over built-in defaults.  A .env file in the working directory
 * is still loaded (via dotenv inside config.ts) for anything not supplied on the
 * command line.
 *
 * Usage:
 *   aperture [options]
 *
 * Examples:
 *   aperture --port 8080 --api-token my-secret
 *   aperture --host 0.0.0.0 --port 443 --no-hosted-mode
 *   APERTURE_API_TOKEN=secret aperture --port 9000
 */

import { parseArgs } from 'node:util';

const HELP = `
Usage: aperture [options]

Options:
  --port, -p <number>             Port to listen on                   [default: 8080]
  --host <string>                 Host/address to bind                [default: 0.0.0.0]
  --api-token <string>            Bearer token for API auth           [required]
  --log-level <string>            Pino log level                      [default: info]
                                    (trace|debug|info|warn|error)

  --hosted-mode / --no-hosted-mode
                                  Enforce API-key auth for Codex      [default: true]
  --allow-interactive-auth / --no-allow-interactive-auth
                                  Allow OAuth login flows             [default: false]

  --credentials-master-key <str>  Encrypt stored credentials (≥32 chars)
  --credentials-store-path <str>  Path for encrypted credentials file
  --database-path <str>           SQLite database path
  --claude-executable <str>       Path to the claude CLI binary

  --auto-install-claude           Auto-install Claude CLI if missing  [default: false]

  --max-sessions <number>         Max concurrent sessions             [default: 50]
  --session-idle-timeout <ms>     Session idle timeout in ms          [default: 600000]
  --max-message-size <bytes>      Max WebSocket message size          [default: 262144]
  --rpc-timeout <ms>              RPC request timeout in ms           [default: 300000]
  --rate-limit-max <number>       Max requests per window             [default: 1000]
  --rate-limit-window <ms>        Rate limit window in ms             [default: 60000]

  --version, -v                   Print version and exit
  --help, -h                      Print this help and exit
`.trim();

// ── Argument parsing ───────────────────────────────────────────────────────────

const { values } = parseArgs({
  strict: false,
  options: {
    // Core
    port:                      { type: 'string',  short: 'p' },
    host:                      { type: 'string' },
    'api-token':               { type: 'string' },
    'log-level':               { type: 'string' },

    // Auth modes
    'hosted-mode':             { type: 'boolean' },
    'no-hosted-mode':          { type: 'boolean' },
    'allow-interactive-auth':  { type: 'boolean' },
    'no-allow-interactive-auth': { type: 'boolean' },

    // Credentials / storage
    'credentials-master-key':  { type: 'string' },
    'credentials-store-path':  { type: 'string' },
    'database-path':           { type: 'string' },

    // Claude CLI
    'claude-executable':       { type: 'string' },
    'auto-install-claude':     { type: 'boolean' },

    // Limits
    'max-sessions':            { type: 'string' },
    'session-idle-timeout':    { type: 'string' },
    'max-message-size':        { type: 'string' },
    'rpc-timeout':             { type: 'string' },
    'rate-limit-max':          { type: 'string' },
    'rate-limit-window':       { type: 'string' },

    // Meta
    version:  { type: 'boolean', short: 'v' },
    help:     { type: 'boolean', short: 'h' },
  },
});

// ── Meta flags ─────────────────────────────────────────────────────────────────

if (values.help) {
  console.log(HELP);
  process.exit(0);
}

if (values.version) {
  // Resolved at build time relative to the package root
  const { createRequire } = await import('node:module');
  const require = createRequire(import.meta.url);
  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
  const pkg = require('../package.json') as { version: string };
  console.log(pkg.version);
  process.exit(0);
}

// ── Map CLI args → environment variables ───────────────────────────────────────
// dotenv (loaded inside config.ts) does NOT override already-set env vars, so
// anything we set here wins over the .env file while still allowing the user to
// omit flags and rely on .env / OS-level env vars for the rest.

function setEnv(key: string, value: string | undefined) {
  if (value !== undefined) process.env[key] = value;
}

// The `values` map has type `string | boolean | undefined` per key because
// parseArgs mixes string and boolean options. We only pass string-declared
// options to setEnv, so cast via `as string | undefined` is safe.
type Str = string | undefined;
setEnv('PORT',                       values.port as Str);
setEnv('HOST',                       values.host as Str);
setEnv('APERTURE_API_TOKEN',         values['api-token'] as Str);
setEnv('LOG_LEVEL',                  values['log-level'] as Str);
setEnv('CREDENTIALS_MASTER_KEY',     values['credentials-master-key'] as Str);
setEnv('CREDENTIALS_STORE_PATH',     values['credentials-store-path'] as Str);
setEnv('DATABASE_PATH',              values['database-path'] as Str);
setEnv('CLAUDE_CODE_EXECUTABLE',     values['claude-executable'] as Str);
setEnv('MAX_CONCURRENT_SESSIONS',    values['max-sessions'] as Str);
setEnv('SESSION_IDLE_TIMEOUT_MS',    values['session-idle-timeout'] as Str);
setEnv('MAX_MESSAGE_SIZE_BYTES',     values['max-message-size'] as Str);
setEnv('RPC_REQUEST_TIMEOUT_MS',     values['rpc-timeout'] as Str);
setEnv('RATE_LIMIT_MAX',             values['rate-limit-max'] as Str);
setEnv('RATE_LIMIT_WINDOW_MS',       values['rate-limit-window'] as Str);

// Boolean flags: explicit --hosted-mode / --no-hosted-mode
if (values['hosted-mode'])           process.env.HOSTED_MODE = 'true';
if (values['no-hosted-mode'])        process.env.HOSTED_MODE = 'false';
if (values['allow-interactive-auth'])   process.env.ALLOW_INTERACTIVE_AUTH = 'true';
if (values['no-allow-interactive-auth']) process.env.ALLOW_INTERACTIVE_AUTH = 'false';
if (values['auto-install-claude'])   process.env.AUTO_INSTALL_CLAUDE_CLI = 'true';

// ── Start server ───────────────────────────────────────────────────────────────
// Dynamic import ensures all process.env assignments above are visible to
// config.ts before loadConfig() is called.
await import('./index.js');
