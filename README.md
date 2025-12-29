# Aperture

**Production-ready WebSocket + HTTP gateway for ACP agents (Claude Code + Codex)**

Aperture exposes stdio-based ACP (Agent Communication Protocol) agents over WebSocket and HTTP (Server-Sent Events), making them suitable for running on a VPS and accessible from web clients, mobile apps, and other remote consumers.

## Supported Agents

- **Claude Code** (`@zed-industries/claude-code-acp`) - Claude AI assistant for coding
- **Codex** (`@zed-industries/codex-acp`) - OpenAI Codex for code generation

## What is this?

- **Multi-Agent Gateway**: TypeScript/Node.js server that spawns ACP agent child processes (claude-code-acp, codex-acp) and bridges stdio JSON-RPC to WebSocket/HTTP
- **Zed-like Auth**: Explicit per-session authentication - no accidental API billing from ambient environment variables
- **Production-ready**: Bearer token auth, rate limiting, session management, idle timeouts, encrypted credential storage
- **Docker-first**: Designed for VPS deployment with persistent volumes for agent state

## What this is NOT

- Not a replacement for Claude Code CLI, claude-code-acp, or codex-acp
- Not affiliated with Anthropic or OpenAI
- Does not bypass authentication or terms of service

## Why This Architecture?

**Problem**: Long-running services with ambient `ANTHROPIC_API_KEY` or `OPENAI_API_KEY` environment variables can accidentally bill API usage when you meant to use a subscription, or mix credentials across sessions.

**Solution**: Aperture follows Zed's external agent semantics:
- **No auto-forwarding** of provider API keys from gateway environment
- **Explicit per-session auth** - you choose API billing or subscription for each session
- **Credential isolation** - stored credentials are encrypted and session-scoped
- **Hosted mode guardrails** - prevents unsupported auth methods (e.g., ChatGPT login on remote VPS)

## Architecture

```
┌─────────────┐
│   Client    │ (Browser, mobile app, curl, etc.)
└──────┬──────┘
       │ HTTP/WebSocket + Bearer auth
       ▼
┌──────────────────────────────────────────────────────────┐
│                 Aperture Gateway                         │
│  ┌─────────────────────────────────────────────────┐    │
│  │  Fastify HTTP Server                            │    │
│  │  - Bearer token auth                            │    │
│  │  - Rate limiting                                │    │
│  │  - Credential store (AES-256-GCM encrypted)     │    │
│  └────────────────┬────────────────────────────────┘    │
│                   │                                      │
│  ┌────────────────▼──────────────────────────────┐      │
│  │  Session Manager                               │      │
│  │  - Agent backend selection (Claude | Codex)    │      │
│  │  - Auth validation (hosted mode enforcement)   │      │
│  │  - Credential resolution (inline | stored)     │      │
│  └────────────────┬──────────────────────────────┘      │
│                   │                                      │
│  ┌────────────────▼──────────────────────────────┐      │
│  │  Session (per client)                          │      │
│  │  ┌──────────────────────────────────────┐     │      │
│  │  │  Agent Backend (spawns child)        │     │      │
│  │  │  - ClaudeBackend → claude-code-acp   │     │      │
│  │  │  - CodexBackend  → codex-acp         │     │      │
│  │  └──────────────────────────────────────┘     │      │
│  │  - stdio JSON-RPC framing (newline-delimited) │      │
│  │  - stdin write mutex (no interleaving)        │      │
│  │  - stdout line reader                         │      │
│  │  - pending request map (with timeout)         │      │
│  └────────────────────────────────────────────────┘      │
└──────────────────────────────────────────────────────────┘
```

## Features

### Multi-Agent Support
- **Claude Code**: Full support for interactive (subscription) and API key modes
- **Codex**: API key mode (hosted mode enforces this; ChatGPT login doesn't work remotely)
- Agent selection via `agent` parameter in session creation

### Authentication Modes (Per-Session)
- **Interactive**: Use persisted credentials from `~/.claude` or `~/.codex` (subscription)
- **API Key**: Explicit API billing mode with key from:
  - `inline`: Provided in request body
  - `stored`: Retrieved from encrypted credential store
  - `none`: No API key (interactive mode)

### Security
- **No auto-forwarding**: `ANTHROPIC_API_KEY` and `OPENAI_API_KEY` in gateway environment are **IGNORED**
- **Encrypted credential storage**: AES-256-GCM with scrypt key derivation
- **Environment variable whitelist**: Session `env` validated; `*_API_KEY` rejected unless `auth.mode=api_key`
- **Bearer token auth**: Required for all endpoints (except health checks)
- **Rate limiting**: Configurable per-window limits
- **Hosted mode**: Enforces API key auth for Codex (ChatGPT login unsupported remotely)

### Transports
- **WebSocket**: Bidirectional JSON-RPC
- **HTTP POST**: Send request, await response with timeout
- **Server-Sent Events (SSE)**: Stream all agent messages

### Operations
- Session lifecycle: create, status, delete, list
- Credential management: store, list, delete (encrypted)
- Health/readiness checks

## Quick Start

### Using Docker (Recommended)

1. **Clone and configure**:
   ```bash
   git clone <repo-url>
   cd aperture
   cp .env.example .env
   ```

2. **Edit `.env`**:
   ```bash
   # Required
   APERTURE_API_TOKEN=your-secret-token-here

   # Hosted mode (default: true, enforces API keys for Codex)
   HOSTED_MODE=true

   # Enable stored credentials (optional, 32+ chars)
   CREDENTIALS_MASTER_KEY=your-very-long-random-master-key-here
   ```

3. **Start the gateway**:
   ```bash
   docker-compose up -d
   ```

4. **Verify**:
   ```bash
   curl http://localhost:8080/healthz
   # {"status":"ok"}
   ```

### Session Examples

#### Claude Code - Interactive (Subscription)

Uses your Claude Pro/Max subscription via persisted `~/.claude` credentials.

**Prerequisites**: One-time login (if not already done):
```bash
docker exec -it aperture-gateway bash
claude
# Inside Claude CLI: /login
# Follow browser OAuth, then /exit
```

**Create session**:
```bash
curl -X POST http://localhost:8080/v1/sessions \
  -H "Authorization: Bearer your-token" \
  -H "Content-Type: application/json" \
  -d '{
    "agent": "claude_code",
    "auth": {
      "mode": "interactive",
      "apiKeyRef": "none"
    }
  }'
```

**Response**:
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "agent": "claude_code",
  "status": {
    "id": "550e8400-...",
    "agent": "claude_code",
    "authMode": "interactive",
    "running": true,
    "pendingRequests": 0,
    "lastActivityTime": 1704067200000,
    "idleMs": 0
  }
}
```

#### Claude Code - API Key (Inline)

Uses API billing with key provided in request.

```bash
curl -X POST http://localhost:8080/v1/sessions \
  -H "Authorization: Bearer your-token" \
  -H "Content-Type: application/json" \
  -d '{
    "agent": "claude_code",
    "auth": {
      "mode": "api_key",
      "providerKey": "anthropic",
      "apiKeyRef": "inline",
      "apiKey": "sk-ant-your-api-key-here"
    }
  }'
```

#### Codex - API Key (Stored Credential)

First, store the credential:
```bash
curl -X POST http://localhost:8080/v1/credentials \
  -H "Authorization: Bearer your-token" \
  -H "Content-Type: application/json" \
  -d '{
    "provider": "openai",
    "label": "Production OpenAI Key",
    "apiKey": "sk-your-openai-key-here"
  }'
```

Response:
```json
{
  "id": "abc123def456",
  "provider": "openai",
  "label": "Production OpenAI Key",
  "createdAt": 1704067200000
}
```

Then create Codex session:
```bash
curl -X POST http://localhost:8080/v1/sessions \
  -H "Authorization: Bearer your-token" \
  -H "Content-Type: application/json" \
  -d '{
    "agent": "codex",
    "auth": {
      "mode": "api_key",
      "providerKey": "openai",
      "apiKeyRef": "stored",
      "storedCredentialId": "abc123def456"
    }
  }'
```

#### Codex - Interactive (Non-Hosted Mode Only)

⚠️ **Warning**: Codex interactive mode (ChatGPT login) does not work for remote projects. Only use this locally.

```bash
# Requires HOSTED_MODE=false in .env
curl -X POST http://localhost:8080/v1/sessions \
  -H "Authorization: Bearer your-token" \
  -H "Content-Type: application/json" \
  -d '{
    "agent": "codex",
    "auth": {
      "mode": "interactive",
      "apiKeyRef": "none"
    }
  }'
```

If `HOSTED_MODE=true` (default), this returns:
```json
{
  "error": "Failed to create session",
  "message": "Codex interactive mode (ChatGPT login) is not supported in hosted environments. Please use auth.mode=\"api_key\" with an OpenAI API key."
}
```

## API Reference

### Health & Readiness

#### GET /healthz
Always returns 200 OK.

```bash
curl http://localhost:8080/healthz
```

#### GET /readyz
Verifies runtime, child spawn capability, and agent availability.

```bash
curl http://localhost:8080/readyz
```

Response:
```json
{
  "status": "ready",
  "claudePath": "/usr/local/bin/claude"
}
```

### Credential Management

#### POST /v1/credentials
Store an encrypted credential.

**Request**:
```json
{
  "provider": "anthropic" | "openai",
  "label": "My Production Key",
  "apiKey": "sk-ant-..."
}
```

**Response (201 Created)**:
```json
{
  "id": "abc123...",
  "provider": "anthropic",
  "label": "My Production Key",
  "createdAt": 1704067200000
}
```

Note: API key is NOT returned.

#### GET /v1/credentials
List all stored credentials (without API keys).

```bash
curl http://localhost:8080/v1/credentials \
  -H "Authorization: Bearer your-token"
```

**Response**:
```json
{
  "credentials": [
    {
      "id": "abc123",
      "provider": "anthropic",
      "label": "Production Key",
      "createdAt": 1704067200000
    }
  ],
  "total": 1
}
```

#### DELETE /v1/credentials/:id
Delete a stored credential.

```bash
curl -X DELETE http://localhost:8080/v1/credentials/abc123 \
  -H "Authorization: Bearer your-token"
```

**Response (204 No Content)**

### Session Management

#### POST /v1/sessions
Create a new agent session.

**Request Body**:
```typescript
{
  agent?: "claude_code" | "codex",  // default: "claude_code"
  auth?: {
    mode: "interactive" | "api_key",
    providerKey?: "anthropic" | "openai",  // auto-derived from agent
    apiKeyRef?: "inline" | "stored" | "none",
    apiKey?: string,  // only when apiKeyRef="inline"
    storedCredentialId?: string  // only when apiKeyRef="stored"
  },
  env?: Record<string, string>  // whitelisted env vars (NO *_API_KEY unless auth.mode=api_key)
}
```

**Defaults**:
- `agent`: `"claude_code"`
- `auth.mode`: `"interactive"`
- `auth.apiKeyRef`: `"none"`
- `auth.providerKey`: auto-derived (`"anthropic"` for Claude, `"openai"` for Codex)

**Response (201 Created)**:
```json
{
  "id": "550e8400-...",
  "agent": "claude_code",
  "status": {
    "id": "550e8400-...",
    "agent": "claude_code",
    "authMode": "interactive",
    "running": true,
    "pendingRequests": 0,
    "lastActivityTime": 1704067200000,
    "idleMs": 0
  }
}
```

#### GET /v1/sessions/:id
Get session status.

```bash
curl http://localhost:8080/v1/sessions/<session-id> \
  -H "Authorization: Bearer your-token"
```

#### DELETE /v1/sessions/:id
Terminate a session.

```bash
curl -X DELETE http://localhost:8080/v1/sessions/<session-id> \
  -H "Authorization: Bearer your-token"
```

#### GET /v1/sessions
List all active sessions.

```bash
curl http://localhost:8080/v1/sessions \
  -H "Authorization: Bearer your-token"
```

### JSON-RPC Communication

#### POST /v1/sessions/:id/rpc
Send a JSON-RPC message.

- If message has `id` (request): waits for response, returns it
- If no `id` (notification): returns 202 Accepted immediately

**Request**:
```json
{
  "message": {
    "jsonrpc": "2.0",
    "method": "tools/list",
    "id": 1
  }
}
```

**Response (200 OK)** for requests:
```json
{
  "jsonrpc": "2.0",
  "result": { "tools": [...] },
  "id": 1
}
```

**Response (202 Accepted)** for notifications:
```json
{
  "status": "accepted"
}
```

#### GET /v1/sessions/:id/events
Server-Sent Events stream of all agent messages.

```bash
curl -N http://localhost:8080/v1/sessions/<session-id>/events \
  -H "Authorization: Bearer your-token"
```

**Output**:
```
data: {"type":"connected"}

data: {"jsonrpc":"2.0","method":"progress","params":{...}}

data: {"jsonrpc":"2.0","result":{...},"id":1}
```

#### WebSocket /v1/sessions/:id/ws
Bidirectional WebSocket for real-time JSON-RPC.

**Using `websocat`**:
```bash
websocat ws://localhost:8080/v1/sessions/<session-id>/ws \
  --header "Authorization: Bearer your-token"
```

**Send** (one JSON object per line):
```json
{"jsonrpc":"2.0","method":"tools/list","id":1}
```

**Receive**:
```json
{"jsonrpc":"2.0","result":{"tools":[...]},"id":1}
```

## Authentication Explained

### Why This Approach?

**Old Problem** (pre-refactor):
```bash
# Gateway environment has:
ANTHROPIC_API_KEY=sk-ant-...

# Create session → automatically uses API billing
# Even if you wanted subscription usage!
# No way to control it per-session
```

**New Solution** (Zed-like):
```bash
# Gateway environment API keys are IGNORED
# ANTHROPIC_API_KEY=...  ← IGNORED
# OPENAI_API_KEY=...     ← IGNORED

# You explicitly choose per session:
{
  "auth": {
    "mode": "interactive",  // Use subscription
    "apiKeyRef": "none"
  }
}

# OR:
{
  "auth": {
    "mode": "api_key",      // Use API billing
    "apiKeyRef": "inline",
    "apiKey": "sk-ant-..."
  }
}
```

### Authentication Modes

#### Interactive Mode
- **What**: Uses persisted credentials from agent's home directory
- **Claude Code**: `~/.claude` (from `claude` CLI `/login`)
- **Codex**: `~/.codex` (from Codex CLI login)
- **Billing**: Counts against subscription (Pro/Max)
- **Setup**: One-time login required (see examples above)
- **Hosted Mode**:
  - Claude: ✅ Allowed (requires `docker exec` login once)
  - Codex: ❌ Blocked (ChatGPT login doesn't work for remote projects)

#### API Key Mode
- **What**: Explicitly use API key for billing
- **Billing**: Charged to API account (pay-per-token)
- **Sources**:
  - `inline`: Key in request body (less secure, but convenient)
  - `stored`: Key from encrypted credential store (more secure)
- **Hosted Mode**: ✅ Always allowed

### Credential Storage

When `CREDENTIALS_MASTER_KEY` is set:
- Credentials stored encrypted with AES-256-GCM
- Master key must be ≥32 characters
- Stored at `/data/credentials.json.enc` (persisted via Docker volume)
- List credentials without exposing keys
- Per-provider storage (anthropic, openai)

When `CREDENTIALS_MASTER_KEY` is NOT set:
- Stored credentials disabled
- Only `apiKeyRef="inline"` available for API key mode

### Hosted Mode

**`HOSTED_MODE=true`** (default for VPS):
- **Codex**: Requires `auth.mode="api_key"` (blocks interactive)
- **Claude**: Allows both modes
- **Why**: ChatGPT login for Codex doesn't work on remote projects

**`HOSTED_MODE=false`** (local development):
- Both agents allow interactive mode
- ChatGPT login may still fail for Codex (depends on project location)

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `APERTURE_API_TOKEN` | ✅ Yes | - | Bearer token for gateway authentication |
| `HOSTED_MODE` | No | `true` | Enforce API key auth for Codex |
| `CREDENTIALS_MASTER_KEY` | No | - | Enable encrypted credential storage (≥32 chars) |
| `CREDENTIALS_STORE_PATH` | No | `/data/credentials.json.enc` | Path to encrypted credentials file |
| `PORT` | No | `8080` | Server port |
| `HOST` | No | `0.0.0.0` | Server host |
| `LOG_LEVEL` | No | `info` | Log level (trace, debug, info, warn, error) |
| `MAX_CONCURRENT_SESSIONS` | No | `50` | Max simultaneous sessions |
| `SESSION_IDLE_TIMEOUT_MS` | No | `600000` | Session idle timeout (10 min) |
| `MAX_MESSAGE_SIZE_BYTES` | No | `262144` | Max JSON-RPC message size (256KB) |
| `RPC_REQUEST_TIMEOUT_MS` | No | `300000` | Timeout for RPC requests (5 min) |
| `RATE_LIMIT_MAX` | No | `100` | Max requests per window |
| `RATE_LIMIT_WINDOW_MS` | No | `60000` | Rate limit window (1 min) |
| `CLAUDE_CODE_EXECUTABLE` | No | auto | Path to Claude CLI (auto-detected) |
| `AUTO_INSTALL_CLAUDE_CLI` | No | `false` | Auto-install Claude CLI if missing |

**IMPORTANT**: `ANTHROPIC_API_KEY` and `OPENAI_API_KEY` in gateway environment are **IGNORED**. Use per-session auth instead.

## VPS Deployment

### Prerequisites
- Docker & Docker Compose
- Domain + TLS certificate (recommended)
- Reverse proxy (NGINX, Traefik, Caddy)

### Deployment Steps

1. **Set up environment**:
   ```bash
   cp .env.example .env
   nano .env
   ```

   Critical variables:
   ```bash
   APERTURE_API_TOKEN=<generate-strong-token>
   HOSTED_MODE=true
   CREDENTIALS_MASTER_KEY=<generate-32+-char-key>
   ```

2. **Start services**:
   ```bash
   docker-compose up -d
   ```

3. **One-time Claude login** (if using interactive mode):
   ```bash
   docker exec -it aperture-gateway bash
   claude
   # /login
   # Follow OAuth flow
   # /exit
   ```

4. **Configure reverse proxy** (NGINX example):
   ```nginx
   upstream aperture {
       server localhost:8080;
   }

   server {
       listen 443 ssl http2;
       server_name aperture.yourdomain.com;

       ssl_certificate /path/to/cert.pem;
       ssl_certificate_key /path/to/key.pem;

       location / {
           proxy_pass http://aperture;
           proxy_http_version 1.1;
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection "upgrade";
           proxy_set_header Host $host;
           proxy_set_header X-Real-IP $remote_addr;
       }
   }
   ```

5. **Verify**:
   ```bash
   curl https://aperture.yourdomain.com/healthz
   ```

### Security Recommendations

- ✅ Use TLS/HTTPS (required for production)
- ✅ Strong `APERTURE_API_TOKEN` (≥32 random chars)
- ✅ Strong `CREDENTIALS_MASTER_KEY` (≥32 random chars)
- ✅ Keep `HOSTED_MODE=true` on VPS
- ✅ Firewall: only expose reverse proxy port (443)
- ✅ Regular backups of Docker volumes
- ✅ Monitor logs for suspicious activity
- ❌ Never expose port 8080 directly to internet

### Volume Management

```bash
# Backup credentials
docker run --rm \
  -v aperture-credentials-data:/data \
  -v $(pwd):/backup \
  alpine tar czf /backup/credentials-backup.tar.gz -C /data .

# Backup Claude auth
docker run --rm \
  -v aperture-claude-data:/data \
  -v $(pwd):/backup \
  alpine tar czf /backup/claude-backup.tar.gz -C /data .

# Restore (example)
docker run --rm \
  -v aperture-credentials-data:/data \
  -v $(pwd):/backup \
  alpine tar xzf /backup/credentials-backup.tar.gz -C /data
```

### Upgrades

```bash
cd aperture
git pull
docker-compose down
docker-compose build
docker-compose up -d
```

## Troubleshooting

### "Claude Code interactive mode requires one-time login"

**Symptom**: Session created but agent can't authenticate.

**Solution**:
```bash
docker exec -it aperture-gateway bash
claude
# Inside Claude CLI:
# /login
# Follow browser OAuth flow
# /exit
```

This persists credentials in `~/.claude` (Docker volume).

### "Codex interactive mode is not supported in hosted environments"

**Symptom**: 400 error when creating Codex session with `auth.mode="interactive"`.

**Why**: ChatGPT login doesn't work for remote projects in most cases.

**Solutions**:
1. Use API key mode:
   ```json
   {
     "agent": "codex",
     "auth": {
       "mode": "api_key",
       "apiKeyRef": "inline",
       "apiKey": "sk-your-openai-key"
     }
   }
   ```

2. For local development only: Set `HOSTED_MODE=false` in `.env`

### "Credential storage not enabled"

**Symptom**: 503 error when accessing `/v1/credentials` endpoints.

**Solution**: Set `CREDENTIALS_MASTER_KEY` in `.env`:
```bash
CREDENTIALS_MASTER_KEY=your-very-long-random-master-key-here-at-least-32-characters
```

Must be ≥32 characters. Restart gateway after setting.

### "API key required but not provided"

**Symptom**: Session creation fails with this error.

**Cause**: Using `auth.mode="api_key"` but:
- `apiKeyRef="inline"` without `apiKey`
- `apiKeyRef="stored"` with invalid `storedCredentialId`

**Solution**: Provide valid API key:
```json
{
  "auth": {
    "mode": "api_key",
    "apiKeyRef": "inline",
    "apiKey": "sk-ant-..."  // ← Add this
  }
}
```

### "Environment variable X not allowed in interactive mode"

**Symptom**: Session creation fails when passing `env` with API keys.

**Cause**: Security safeguard - `*_API_KEY` env vars are blocked in interactive mode.

**Solution**: Either:
1. Remove the `*_API_KEY` from `env` object
2. Use `auth.mode="api_key"` instead

### "claude-code-acp not found in PATH"

**Symptom**: Sessions fail to start.

**Solution**: Rebuild Docker image (should auto-install):
```bash
docker-compose down
docker-compose build
docker-compose up -d
```

Or install manually:
```bash
npm install -g @zed-industries/claude-code-acp
```

### "codex-acp not found in PATH"

**Solution**: Install manually or verify Dockerfile includes it:
```bash
npm install -g @zed-industries/codex-acp
npm install -g @openai/codex
```

### Message Framing Errors

**Symptom**: "JSON-RPC messages must not contain embedded newlines"

**Cause**: Sending pretty-printed JSON instead of single-line.

**Solution**: Send JSON as single line:
```bash
# ✅ Correct:
{"jsonrpc":"2.0","method":"test","id":1}

# ❌ Wrong:
{
  "jsonrpc": "2.0",
  "method": "test"
}
```

### Session Timeout / Idle Disconnect

**Symptom**: Session terminates after inactivity.

**Cause**: Default idle timeout is 10 minutes.

**Solution**: Adjust in `.env`:
```bash
SESSION_IDLE_TIMEOUT_MS=1800000  # 30 minutes
```

Or send periodic keepalive messages.

## Migration from Old Version

### Breaking Changes

1. **Session Creation API Changed**

   **Before**:
   ```json
   {
     "anthropicApiKey": "sk-ant-..."
   }
   ```

   **After**:
   ```json
   {
     "agent": "claude_code",
     "auth": {
       "mode": "api_key",
       "apiKeyRef": "inline",
       "apiKey": "sk-ant-..."
     }
   }
   ```

2. **Environment Variables No Longer Auto-Forwarded**

   **Before**: `ANTHROPIC_API_KEY` in gateway `.env` → automatically used by all sessions

   **After**: Gateway env API keys are IGNORED → use per-session auth

3. **Default Behavior Changed**

   **Before**: Default to API billing if `ANTHROPIC_API_KEY` set

   **After**: Default to interactive mode (subscription)

### Migration Steps

1. **Update client code** to use new session creation API
2. **Remove** `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` from gateway `.env` (optional, but they're ignored anyway)
3. **Add** `CREDENTIALS_MASTER_KEY` if using stored credentials
4. **Set** `HOSTED_MODE=true` for VPS deployments
5. **Test** session creation with new auth structure

## Testing

```bash
# Run tests
npm test

# Watch mode
npm run test:watch

# Type checking
npm run type-check

# Lint
npm run lint
```

Tests cover:
- Agent backend auth validation
- Hosted mode enforcement
- Credential encryption/storage
- Environment variable whitelist
- JSON-RPC parsing and validation

## Development

```bash
# Install dependencies
npm install

# Install ACP agents
npm install -g @zed-industries/claude-code-acp
npm install -g @zed-industries/codex-acp
npm install -g @openai/codex

# Run in dev mode
npm run dev

# Build
npm run build

# Start production
npm start
```

## License

MIT

## Contributing

Issues and pull requests welcome!

## Acknowledgments

- Built for [@zed-industries/claude-code-acp](https://www.npmjs.com/package/@zed-industries/claude-code-acp) and [@zed-industries/codex-acp](https://www.npmjs.com/package/@zed-industries/codex-acp)
- Auth semantics inspired by [Zed's external agent architecture](https://github.com/zed-industries/zed)
- Uses [Claude Code CLI](https://claude.ai/download) and OpenAI Codex
