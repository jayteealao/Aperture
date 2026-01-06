# Aperture

**Production-ready WebSocket + HTTP gateway for ACP agents (Claude Code + Codex + Gemini)**

Aperture exposes stdio-based ACP (Agent Communication Protocol) agents over WebSocket and HTTP (Server-Sent Events), making them suitable for running on a VPS and accessible from web clients, mobile apps, and other remote consumers.

## Supported Agents

- **Claude Code** (`@zed-industries/claude-code-acp`) - Claude AI assistant for coding
- **Codex** (`@zed-industries/codex-acp`) - OpenAI Codex for code generation
- **Gemini** (`@google/gemini-cli`) - Google Gemini AI with ACP mode support

## What is this?

- **Multi-Agent Gateway**: TypeScript/Node.js server that spawns ACP agent child processes (claude-code-acp, codex-acp, gemini --experimental-acp) and bridges stdio JSON-RPC to WebSocket/HTTP
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
│  ┌────────────────▼────────────────────────────────────┐      │
│  │  Session Manager                                     │      │
│  │  - Agent backend selection (Claude | Codex | Gemini) │      │
│  │  - Auth validation (hosted mode enforcement)         │      │
│  │  - Credential resolution (inline | stored)           │      │
│  └────────────────┬────────────────────────────────────┘      │
│                   │                                            │
│  ┌────────────────▼────────────────────────────────────┐      │
│  │  Session (per client)                                │      │
│  │  ┌────────────────────────────────────────────┐     │      │
│  │  │  Agent Backend (spawns child)              │     │      │
│  │  │  - ClaudeBackend → claude-code-acp         │     │      │
│  │  │  - CodexBackend  → codex-acp               │     │      │
│  │  │  - GeminiBackend → gemini --experimental-acp     │      │
│  │  └────────────────────────────────────────────┘     │      │
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
- **Gemini**: OAuth (Google login), API key, and Vertex AI modes
- Agent selection via `agent` parameter in session creation

### Authentication Modes (Per-Session)
- **Interactive**: Use persisted credentials from `~/.claude` or `~/.codex` (subscription)
- **OAuth**: Google account authentication for Gemini (cached in `~/.gemini`)
- **API Key**: Explicit API billing mode with key from:
  - `inline`: Provided in request body
  - `stored`: Retrieved from encrypted credential store
  - `none`: No API key (interactive/oauth mode)
- **Vertex AI**: Google Cloud Vertex AI with Application Default Credentials (Gemini only)

### Security
- **No auto-forwarding**: `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, and `GEMINI_API_KEY` in gateway environment are **IGNORED**
- **Encrypted credential storage**: AES-256-GCM with scrypt key derivation
- **Environment variable whitelist**: Session `env` validated; `*_API_KEY` and Google Cloud vars rejected unless auth mode explicitly allows
- **Bearer token auth**: Required for all endpoints (except health checks)
- **Rate limiting**: Configurable per-window limits
- **Hosted mode**: Enforces API key auth for Codex; disables Gemini OAuth unless `ALLOW_INTERACTIVE_AUTH=true`

### Workspace Management
- **Git worktree isolation**: Run multiple agents in parallel, each with isolated worktrees
- **Native performance**: Rust addon with git2-rs (50x faster than shelling to git)
- **Automatic cleanup**: Worktrees removed when sessions end
- **Web UI**: Visual management interface at `/workspaces`
- **Full REST API**: Create, list, monitor, and delete workspaces programmatically
- See [docs/WORKSPACES.md](docs/WORKSPACES.md) for details

### Transports
- **WebSocket**: Bidirectional JSON-RPC
- **HTTP POST**: Send request, await response with timeout
- **Server-Sent Events (SSE)**: Stream all agent messages

### Operations
- Session lifecycle: create, status, delete, list
- Credential management: store, list, delete (encrypted)
- **Workspace management**: Multi-agent git worktree isolation with Web UI ([docs/WORKSPACES.md](docs/WORKSPACES.md))
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
#### Gemini - OAuth (Google Login)

Uses your Google account to authenticate with Gemini via OAuth. Credentials are cached in `~/.gemini`.

**Prerequisites**: One-time OAuth bootstrap (only needed once):
```bash
docker exec -it aperture-gateway bash
gemini
# Follow prompts to authenticate with Google via browser
# Credentials will be cached for future sessions
exit
```

**Important**: In `HOSTED_MODE=true` (default), OAuth is disabled by default. To enable:
```bash
# In .env
ALLOW_INTERACTIVE_AUTH=true
```

**Create session**:
```bash
curl -X POST http://localhost:8080/v1/sessions \
  -H "Authorization: Bearer your-token" \
  -H "Content-Type: application/json" \
  -d '{
    "agent": "gemini",
    "auth": {
      "mode": "oauth",
      "providerKey": "google",
      "apiKeyRef": "none"
    }
  }'
```

**Response**:
```json
{
  "id": "7a3c8de0-1234-5678-abcd-1234567890ab",
  "agent": "gemini",
  "status": {
    "id": "7a3c8de0-...",
    "agent": "gemini",
    "authMode": "oauth",
    "running": true,
    "pendingRequests": 0,
    "lastActivityTime": 1704067200000,
    "idleMs": 0
  }
}
```

**If ALLOW_INTERACTIVE_AUTH=false** (default in hosted mode):
```json
{
  "error": "Failed to create session",
  "message": "Gemini OAuth mode (interactive Google login) is disabled in hosted environments. Set ALLOW_INTERACTIVE_AUTH=true to enable, or use auth.mode=\"api_key\" or \"vertex\" instead."
}
```

#### Gemini - API Key (Inline)

Uses Gemini API key for billing. Recommended for production VPS deployments.

**Get API key**: https://makersuite.google.com/app/apikey

**Create session**:
```bash
curl -X POST http://localhost:8080/v1/sessions \
  -H "Authorization: Bearer your-token" \
  -H "Content-Type: application/json" \
  -d '{
    "agent": "gemini",
    "auth": {
      "mode": "api_key",
      "providerKey": "google",
      "apiKeyRef": "inline",
      "apiKey": "AIza-your-gemini-api-key-here"
    }
  }'
```

#### Gemini - API Key (Stored Credential)

First, store the credential:
```bash
curl -X POST http://localhost:8080/v1/credentials \
  -H "Authorization: Bearer your-token" \
  -H "Content-Type: application/json" \
  -d '{
    "provider": "google",
    "label": "Production Gemini Key",
    "apiKey": "AIza-your-gemini-api-key-here"
  }'
```

Response:
```json
{
  "id": "xyz789ghi012",
  "provider": "google",
  "label": "Production Gemini Key",
  "createdAt": 1704067200000
}
```

Then create Gemini session:
```bash
curl -X POST http://localhost:8080/v1/sessions \
  -H "Authorization: Bearer your-token" \
  -H "Content-Type: application/json" \
  -d '{
    "agent": "gemini",
    "auth": {
      "mode": "api_key",
      "providerKey": "google",
      "apiKeyRef": "stored",
      "storedCredentialId": "xyz789ghi012"
    }
  }'
```

#### Gemini - Vertex AI (Google Cloud)

Uses Google Cloud Vertex AI for enterprise deployments with Application Default Credentials (ADC).

**Prerequisites**:
1. Enable Vertex AI API in your Google Cloud project
2. Configure ADC in the container (one of these methods):
   - **Option A**: Mount service account JSON and set `GOOGLE_APPLICATION_CREDENTIALS`
   - **Option B**: Use GCE/GKE workload identity
   - **Option C**: Use `gcloud auth application-default login` (dev only)

**Method A: Service Account JSON** (recommended for VPS):

1. Create service account JSON:
   ```bash
   gcloud iam service-accounts create aperture-gemini --project=your-project-id
   gcloud projects add-iam-policy-binding your-project-id \
     --member="serviceAccount:aperture-gemini@your-project-id.iam.gserviceaccount.com" \
     --role="roles/aiplatform.user"
   gcloud iam service-accounts keys create /path/to/service-account.json \
     --iam-account=aperture-gemini@your-project-id.iam.gserviceaccount.com
   ```

2. Mount in docker-compose.yml:
   ```yaml
   services:
     aperture:
       volumes:
         - /path/to/service-account.json:/app/gcp-service-account.json:ro
       environment:
         - GOOGLE_APPLICATION_CREDENTIALS=/app/gcp-service-account.json
   ```

3. Create session with Vertex credentials path:
   ```bash
   curl -X POST http://localhost:8080/v1/sessions \
     -H "Authorization: Bearer your-token" \
     -H "Content-Type: application/json" \
     -d '{
       "agent": "gemini",
       "auth": {
         "mode": "vertex",
         "providerKey": "google",
         "apiKeyRef": "none",
         "vertexProjectId": "your-gcp-project-id",
         "vertexLocation": "us-central1",
         "vertexCredentialsPath": "/app/gcp-service-account.json"
       }
     }'
   ```

**Method B: Application Default Credentials** (simpler, requires pre-configured ADC):

```bash
curl -X POST http://localhost:8080/v1/sessions \
  -H "Authorization: Bearer your-token" \
  -H "Content-Type: application/json" \
  -d '{
    "agent": "gemini",
    "auth": {
      "mode": "vertex",
      "providerKey": "google",
      "apiKeyRef": "none",
      "vertexProjectId": "your-gcp-project-id",
      "vertexLocation": "us-central1"
    }
  }'
```

**Note**: `vertexCredentialsPath` is optional. If not provided, Gemini CLI will use Application Default Credentials (ADC) from the environment.

**Common Vertex Locations**:
- `us-central1` (Iowa)
- `us-east4` (Northern Virginia)
- `europe-west4` (Netherlands)
- `asia-southeast1` (Singapore)

See: https://cloud.google.com/vertex-ai/docs/general/locations

**Vertex Auth Mode Requirements**:
- ✅ Works in `HOSTED_MODE=true` (recommended for production)
- ✅ No `ALLOW_INTERACTIVE_AUTH` flag needed
- ✅ Supports both service account JSON and ADC
- ⚠️  Requires Vertex AI API enabled in GCP project
- ⚠️  Billing is through Google Cloud, not Gemini API

### Gemini CLI Troubleshooting

#### Gemini CLI not found

**Error**:
```json
{
  "error": "Failed to create session",
  "message": "Agent backend not ready: Gemini CLI not found. Install via: npm install -g @google/gemini-cli"
}
```

**Solution** (Docker):
```bash
# Rebuild image (Gemini CLI is installed automatically)
docker-compose build --no-cache
docker-compose up -d
```

**Solution** (Local dev):
```bash
npm install -g @google/gemini-cli
gemini --version  # Verify installation
```

#### OAuth not working in hosted mode

**Error**:
```json
{
  "error": "Failed to create session",
  "message": "Gemini OAuth mode (interactive Google login) is disabled in hosted environments..."
}
```

**Solution**:
```bash
# In .env
ALLOW_INTERACTIVE_AUTH=true

# Restart gateway
docker-compose restart
```

#### Vertex AI authentication failed

**Error**:
```
Session stderr: Error: Could not load the default credentials
```

**Solution**:
1. **Verify service account JSON** is mounted and readable:
   ```bash
   docker exec -it aperture-gateway cat /app/gcp-service-account.json
   ```

2. **Verify GOOGLE_APPLICATION_CREDENTIALS** is set:
   ```bash
   docker exec -it aperture-gateway printenv GOOGLE_APPLICATION_CREDENTIALS
   ```

3. **Verify Vertex AI API is enabled**:
   ```bash
   gcloud services enable aiplatform.googleapis.com --project=your-project-id
   ```

4. **Verify service account has permissions**:
   ```bash
   gcloud projects get-iam-policy your-project-id \
     --flatten="bindings[].members" \
     --filter="bindings.members:serviceAccount:aperture-gemini@*"
   ```

#### ACP framing error (non-JSON output)

**Error** (in stderr logs):
```
Session stderr: Failed to parse stdout: Invalid JSON: Unexpected token...
```

**Cause**: Gemini CLI outputting logs to stdout instead of JSON-RPC.

**Solution**: Ensure `--experimental-acp` flag is supported in your Gemini CLI version:
```bash
docker exec -it aperture-gateway gemini --help | grep experimental-acp
# Should show: --experimental-acp    Starts the agent in ACP mode
```

If not present, update Gemini CLI:
```bash
# In Dockerfile
RUN npm install -g @google/gemini-cli@latest

# Rebuild
docker-compose build --no-cache
```

#### Gateway environment GEMINI_API_KEY not working

**Symptom**: Set `GEMINI_API_KEY` in `.env` but sessions don't use it.

**Explanation**: This is **intentional**. Aperture uses Zed-like auth semantics:
- Gateway environment API keys are **IGNORED**
- You must explicitly set `auth.mode="api_key"` per session
- This prevents accidental API billing

**Solution**: Use per-session auth configuration (see examples above).

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
