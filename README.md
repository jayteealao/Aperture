# Aperture

**Production-ready WebSocket + HTTP gateway for @zed-industries/claude-code-acp**

Aperture exposes the stdio-based ACP (Agent Communication Protocol) agent from `@zed-industries/claude-code-acp` over WebSocket and HTTP (Server-Sent Events), making it suitable for running on a VPS and accessible from web clients, mobile apps, and other remote consumers.

## What is this?

- **Gateway**: Aperture is a TypeScript/Node.js server that spawns `claude-code-acp` child processes and bridges stdio JSON-RPC to WebSocket/HTTP
- **Production-ready**: Includes authentication, rate limiting, session management, idle timeouts, and comprehensive error handling
- **Docker-first**: Designed to run in containers with persistent storage for Claude Code authentication

## What this is NOT

- This is not a replacement for Claude Code CLI or claude-code-acp
- This is not affiliated with Anthropic (it's a community tool)
- This does not bypass Claude's authentication or terms of service

## Architecture

```
┌─────────────┐
│   Client    │ (Browser, mobile app, curl, etc.)
└──────┬──────┘
       │ HTTP/WebSocket + Bearer auth
       ▼
┌─────────────────────────────────────────┐
│          Aperture Gateway               │
│  ┌─────────────────────────────────┐   │
│  │     Fastify HTTP Server          │   │
│  │  - Authentication middleware      │   │
│  │  - Rate limiting                  │   │
│  │  - Session management             │   │
│  └──────────┬──────────────────────┘   │
│             │                            │
│  ┌──────────▼──────────────────────┐   │
│  │   Session Manager                │   │
│  │  - Spawn/terminate sessions       │   │
│  │  - Max sessions limit             │   │
│  │  - Idle timeout tracking          │   │
│  └──────────┬──────────────────────┘   │
│             │                            │
│  ┌──────────▼──────────────────────┐   │
│  │   Session (1 per client)         │   │
│  │  ┌────────────────────────────┐ │   │
│  │  │ claude-code-acp (child)    │ │   │
│  │  │  - stdio JSON-RPC           │ │   │
│  │  │  - ACP protocol             │ │   │
│  │  └────────────────────────────┘ │   │
│  │  - stdin write mutex             │   │
│  │  - stdout line reader            │   │
│  │  - pending request map           │   │
│  └──────────────────────────────────┘   │
└─────────────────────────────────────────┘
```

## Features

- **WebSocket transport**: Bidirectional JSON-RPC communication
- **HTTP transport**:
  - REST API for session management
  - Server-Sent Events (SSE) for streaming responses
  - Request/response via POST with timeout
- **Authentication**: Bearer token required for all endpoints (except health checks)
- **Session management**:
  - Create/delete sessions
  - Max concurrent sessions limit
  - Idle session timeout
- **Security**:
  - Max message size enforcement
  - Rate limiting
  - No secrets in logs
- **Claude Code CLI integration**:
  - Auto-detection of installed CLI
  - CLAUDE_CODE_EXECUTABLE override support
  - Vendored CLI fallback (as used by Zed)
- **Authentication modes**:
  - API key mode (ANTHROPIC_API_KEY)
  - Subscription mode (Claude Pro/Max via ~/.claude)

## Quick Start

### Using Docker (Recommended)

1. **Clone and configure**:
   ```bash
   git clone <repo-url>
   cd aperture
   cp .env.example .env
   ```

2. **Edit `.env`** and set your required token:
   ```bash
   APERTURE_API_TOKEN=your-secret-token-here
   ```

3. **Choose authentication mode**:

   **Option A: API Key Mode (API billing)**
   ```bash
   # Add to .env:
   ANTHROPIC_API_KEY=sk-ant-...
   ```

   **Option B: Subscription Mode (Claude Pro/Max)**
   ```bash
   # Leave ANTHROPIC_API_KEY unset in .env
   # After starting, you'll need to authenticate once (see below)
   ```

4. **Start the gateway**:
   ```bash
   docker-compose up -d
   ```

5. **If using subscription mode, authenticate** (one-time):
   ```bash
   docker exec -it aperture-gateway bash
   # Inside container:
   claude
   # Then use /login command and follow prompts
   # Exit when done (Ctrl+D or /exit)
   ```

6. **Verify it's running**:
   ```bash
   curl http://localhost:8080/healthz
   # {"status":"ok"}

   curl http://localhost:8080/readyz
   # {"status":"ready","claudePath":"/usr/local/bin/claude"}
   ```

### Local Development

```bash
npm install
npm install -g @zed-industries/claude-code-acp

# Set environment
cp .env.example .env
# Edit .env with your APERTURE_API_TOKEN

# Run in dev mode
npm run dev

# Or build and run
npm run build
npm start
```

## API Reference

All endpoints (except `/healthz` and `/readyz`) require authentication:

```
Authorization: Bearer <your-token>
```

### Health & Readiness

#### GET /healthz

Always returns 200 OK.

```bash
curl http://localhost:8080/healthz
```

Response:
```json
{"status":"ok"}
```

#### GET /readyz

Verifies that the gateway can spawn child processes and locate Claude Code executable.

```bash
curl http://localhost:8080/readyz
```

Response (ready):
```json
{
  "status":"ready",
  "claudePath":"/usr/local/bin/claude"
}
```

Response (not ready):
```json
{
  "status":"not ready",
  "errors":["claude-code-acp not found in PATH"]
}
```

### Session Management

#### POST /v1/sessions

Creates a new session (spawns a `claude-code-acp` child process).

```bash
curl -X POST http://localhost:8080/v1/sessions \
  -H "Authorization: Bearer your-token" \
  -H "Content-Type: application/json" \
  -d '{}'
```

Optional: Override API key per session:
```bash
curl -X POST http://localhost:8080/v1/sessions \
  -H "Authorization: Bearer your-token" \
  -H "Content-Type: application/json" \
  -d '{"anthropicApiKey":"sk-ant-..."}'
```

Response (201 Created):
```json
{
  "id":"550e8400-e29b-41d4-a716-446655440000",
  "status":{
    "id":"550e8400-e29b-41d4-a716-446655440000",
    "running":true,
    "pendingRequests":0,
    "lastActivityTime":1704067200000,
    "idleMs":0
  }
}
```

#### GET /v1/sessions/:id

Gets session status.

```bash
curl http://localhost:8080/v1/sessions/<session-id> \
  -H "Authorization: Bearer your-token"
```

#### DELETE /v1/sessions/:id

Terminates a session.

```bash
curl -X DELETE http://localhost:8080/v1/sessions/<session-id> \
  -H "Authorization: Bearer your-token"
```

#### GET /v1/sessions

Lists all active sessions.

```bash
curl http://localhost:8080/v1/sessions \
  -H "Authorization: Bearer your-token"
```

### JSON-RPC Communication

#### POST /v1/sessions/:id/rpc

Sends a JSON-RPC message to the session.

- If the message has an `id` (request), waits for response and returns it
- If no `id` (notification), returns 202 Accepted immediately

**Request example** (with id):
```bash
curl -X POST http://localhost:8080/v1/sessions/<session-id>/rpc \
  -H "Authorization: Bearer your-token" \
  -H "Content-Type: application/json" \
  -d '{
    "message": {
      "jsonrpc":"2.0",
      "method":"tools/list",
      "id":1
    }
  }'
```

Response (200 OK):
```json
{
  "jsonrpc":"2.0",
  "result":{"tools":[...]},
  "id":1
}
```

**Notification example** (no id):
```bash
curl -X POST http://localhost:8080/v1/sessions/<session-id>/rpc \
  -H "Authorization: Bearer your-token" \
  -H "Content-Type: application/json" \
  -d '{
    "message": {
      "jsonrpc":"2.0",
      "method":"progress/notify",
      "params":{"status":"working"}
    }
  }'
```

Response (202 Accepted):
```json
{"status":"accepted"}
```

#### GET /v1/sessions/:id/events

Server-Sent Events (SSE) stream of all messages from the session.

```bash
curl -N http://localhost:8080/v1/sessions/<session-id>/events \
  -H "Authorization: Bearer your-token"
```

Output:
```
data: {"type":"connected"}

data: {"jsonrpc":"2.0","method":"progress/notify","params":{...}}

data: {"jsonrpc":"2.0","result":{...},"id":1}

data: {"type":"exit","code":0,"signal":null}
```

#### WebSocket /v1/sessions/:id/ws

Bidirectional WebSocket connection for real-time JSON-RPC.

**Using `websocat`**:
```bash
websocat ws://localhost:8080/v1/sessions/<session-id>/ws \
  --header "Authorization: Bearer your-token"
```

Send (one JSON object per line):
```json
{"jsonrpc":"2.0","method":"tools/list","id":1}
```

Receive:
```json
{"jsonrpc":"2.0","result":{"tools":[...]},"id":1}
```

**Using JavaScript**:
```javascript
const ws = new WebSocket('ws://localhost:8080/v1/sessions/<session-id>/ws', {
  headers: {
    'Authorization': 'Bearer your-token'
  }
});

ws.onmessage = (event) => {
  const message = JSON.parse(event.data);
  console.log('Received:', message);
};

ws.send(JSON.stringify({
  jsonrpc: '2.0',
  method: 'tools/list',
  id: 1
}));
```

## Authentication Strategy

Aperture supports two authentication modes for Claude Code:

### API Key Mode (API Billing)

If `ANTHROPIC_API_KEY` is set (either in gateway env or per-session), Claude Code will use **API billing** instead of subscription usage. This means:

- Requests are billed to your Anthropic API account
- No browser-based login required
- Suitable for automated/headless environments

**To use**:
```bash
# In .env:
ANTHROPIC_API_KEY=sk-ant-...
```

Or per-session:
```bash
curl -X POST http://localhost:8080/v1/sessions \
  -H "Authorization: Bearer your-token" \
  -d '{"anthropicApiKey":"sk-ant-..."}'
```

### Subscription Mode (Claude Pro/Max)

If `ANTHROPIC_API_KEY` is **not set**, Claude Code will use your **Claude Pro or Max subscription** instead. This requires:

1. One-time authentication via Claude Code CLI
2. Persistent storage of `~/.claude` directory

**To use**:

1. Do NOT set `ANTHROPIC_API_KEY` in `.env`

2. Ensure the Docker volume persists `~/.claude`:
   ```yaml
   volumes:
     - claude-data:/home/app/.claude
   ```

3. Authenticate once (interactive):
   ```bash
   docker exec -it aperture-gateway bash
   # Inside container:
   claude
   # Use /login and follow browser-based OAuth flow
   ```

4. Authentication persists across container restarts (thanks to the volume)

**Important**:
- If you were previously logged in via Console (PAYG API), you may need to run `/logout` then `/login` to switch to subscription mode
- Headless subscription login can be tricky because it may require opening a local browser
- For remote VPS deployment, consider:
  - SSH port forwarding to access browser flow
  - Using API key mode instead
  - Pre-authenticating before deploying to VPS

## Claude Code CLI Installation

Aperture attempts to detect and use the Claude Code CLI (`claude`) on startup. The CLI is used by `claude-code-acp` via the `CLAUDE_CODE_EXECUTABLE` environment variable.

### Official Installation Methods

Aperture will inform you if Claude Code CLI is not found. You can install it using:

**macOS / Linux / WSL**:
```bash
curl -fsSL https://claude.ai/install.sh | bash
```

**Or via Homebrew** (macOS):
```bash
brew install --cask claude-code
```

**Or via npm** (any platform with Node 18+):
```bash
npm install -g @anthropic-ai/claude-code
```

**Windows PowerShell**:
```powershell
irm https://claude.ai/install.ps1 | iex
```

**Windows CMD**:
```cmd
curl -fsSL https://claude.ai/install.cmd -o install.cmd && install.cmd && del install.cmd
```

### How Aperture Uses the CLI

1. On startup, Aperture checks if `claude` is in PATH via `claude --version`
2. If not found and `AUTO_INSTALL_CLAUDE_CLI=true` is set, attempts automatic installation using official installers
3. Re-checks after installation attempt
4. If found, sets `CLAUDE_CODE_EXECUTABLE` env var when spawning `claude-code-acp`
5. If not found, logs a warning but continues (claude-code-acp will use its vendored CLI as fallback, just like Zed does)

**Auto-install** (optional):
```bash
# In .env:
AUTO_INSTALL_CLAUDE_CLI=true
```

When enabled, Aperture will automatically install Claude Code CLI on first startup if it's not found. This uses the official platform-specific installers.

**Manual override**:
```bash
# In .env:
CLAUDE_CODE_EXECUTABLE=/custom/path/to/claude
```

## VPS Deployment

### Prerequisites

- Docker & Docker Compose installed
- Domain name (optional, but recommended for TLS)
- Reverse proxy (NGINX, Traefik, Caddy) for TLS termination

### Deployment Steps

1. **Clone the repo on your VPS**:
   ```bash
   git clone <repo-url>
   cd aperture
   ```

2. **Configure environment**:
   ```bash
   cp .env.example .env
   nano .env  # Set APERTURE_API_TOKEN and other configs
   ```

3. **Build and start**:
   ```bash
   docker-compose up -d
   ```

4. **Verify health**:
   ```bash
   curl http://localhost:8080/healthz
   ```

5. **Set up reverse proxy** (example with NGINX):

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
           proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
           proxy_set_header X-Forwarded-Proto $scheme;
       }
   }
   ```

6. **Reload NGINX**:
   ```bash
   sudo nginx -t
   sudo systemctl reload nginx
   ```

### Security Recommendations

- **Never expose Aperture directly to the internet without TLS**
- Use a reverse proxy (NGINX/Traefik) with TLS certificates (Let's Encrypt)
- Consider using a Zero Trust tunnel (Cloudflare Tunnel, Tailscale, etc.)
- Rotate `APERTURE_API_TOKEN` regularly
- Monitor logs for suspicious activity
- Keep Docker images updated

### Upgrades

```bash
cd aperture
git pull
docker-compose down
docker-compose build
docker-compose up -d
```

### Logs

```bash
# View logs
docker-compose logs -f

# Export logs
docker-compose logs > aperture.log
```

### Volumes

The `claude-data` volume persists Claude Code authentication:

```bash
# Backup
docker run --rm -v aperture-claude-data:/data -v $(pwd):/backup alpine tar czf /backup/claude-data-backup.tar.gz -C /data .

# Restore
docker run --rm -v aperture-claude-data:/data -v $(pwd):/backup alpine tar xzf /backup/claude-data-backup.tar.gz -C /data
```

## Troubleshooting

### "claude-code-acp not found in PATH"

**Cause**: The `@zed-industries/claude-code-acp` package is not installed.

**Solution**:
```bash
npm install -g @zed-industries/claude-code-acp
```

Or rebuild the Docker image (it should install it automatically).

### "Claude Code CLI not found"

**Symptom**: Warning on startup: `⚠️ Claude Code CLI not found`

**Impact**: Not critical - claude-code-acp will use its vendored CLI

**Solution** (optional, for best results):
Install Claude Code CLI using one of the official methods above.

### Claude Code install fails

**Symptom**: Install script fails when running `curl -fsSL https://claude.ai/install.sh | bash`

**Common causes**:
- Network issues
- Insufficient permissions
- Unsupported platform

**Solution**:
1. Try alternative install methods (Homebrew, npm)
2. Check install script logs
3. Manually download and install from https://claude.ai/download

### Headless subscription login issues

**Symptom**: Can't complete `/login` flow on remote VPS (no browser)

**Solutions**:

**Option 1: SSH port forwarding**
```bash
# From local machine:
ssh -L 8080:localhost:8080 user@your-vps

# Then access http://localhost:8080 on your local browser
```

**Option 2: Pre-authenticate locally**
1. Install Claude Code CLI on your local machine
2. Run `claude` and authenticate with `/login`
3. Copy `~/.claude` directory to VPS
4. Place it in the Docker volume path

**Option 3: Use API key mode instead**
Set `ANTHROPIC_API_KEY` to bypass subscription login entirely.

### Message framing errors

**Symptom**: "JSON-RPC messages must not contain embedded newlines"

**Cause**: Trying to send a JSON-RPC message with literal newlines in the JSON

**Solution**: Ensure you're sending single-line JSON. The protocol is newline-delimited, so each message must be a single line:

```bash
# ✅ Correct (single line):
{"jsonrpc":"2.0","method":"test","id":1}

# ❌ Wrong (pretty-printed):
{
  "jsonrpc": "2.0",
  "method": "test",
  "id": 1
}
```

### Session timeout / idle disconnect

**Symptom**: Session terminates after period of inactivity

**Cause**: Default idle timeout is 10 minutes

**Solution**: Adjust timeout in `.env`:
```bash
SESSION_IDLE_TIMEOUT_MS=1800000  # 30 minutes
```

Or send periodic keepalive messages.

### Max sessions reached

**Symptom**: "Maximum concurrent sessions (50) reached"

**Solution**:
1. Delete idle sessions via DELETE `/v1/sessions/:id`
2. Increase limit in `.env`:
   ```bash
   MAX_CONCURRENT_SESSIONS=100
   ```

### Authentication errors

**Symptom**: 401 Unauthorized

**Causes**:
- Missing `Authorization` header
- Wrong token
- Token has spaces/newlines

**Solution**:
```bash
# Correct format:
curl -H "Authorization: Bearer your-token-here" ...
```

Ensure your `.env` has:
```bash
APERTURE_API_TOKEN=your-token-here
```

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `APERTURE_API_TOKEN` | ✅ Yes | - | Bearer token for gateway authentication |
| `ANTHROPIC_API_KEY` | No | - | Anthropic API key (enables API billing mode) |
| `PORT` | No | 8080 | Server port |
| `HOST` | No | 0.0.0.0 | Server host |
| `LOG_LEVEL` | No | info | Log level (trace, debug, info, warn, error) |
| `MAX_CONCURRENT_SESSIONS` | No | 50 | Max number of concurrent sessions |
| `SESSION_IDLE_TIMEOUT_MS` | No | 600000 | Session idle timeout (ms) |
| `MAX_MESSAGE_SIZE_BYTES` | No | 262144 | Max JSON-RPC message size (bytes) |
| `RPC_REQUEST_TIMEOUT_MS` | No | 300000 | Timeout for RPC requests with id (ms) |
| `RATE_LIMIT_MAX` | No | 100 | Max requests per window |
| `RATE_LIMIT_WINDOW_MS` | No | 60000 | Rate limit window (ms) |
| `CLAUDE_CODE_EXECUTABLE` | No | auto | Path to Claude Code CLI (auto-detected if not set) |
| `AUTO_INSTALL_CLAUDE_CLI` | No | false | Auto-install Claude CLI if not found on startup |

## Testing

```bash
# Run tests
npm test

# Watch mode
npm run test:watch

# Type checking
npm run type-check
```

## Development

```bash
# Install dependencies
npm install

# Run in dev mode (with auto-reload)
npm run dev

# Build
npm run build

# Lint
npm run lint
```

## License

MIT

## Contributing

Issues and pull requests welcome!

## Acknowledgments

- Built for [@zed-industries/claude-code-acp](https://www.npmjs.com/package/@zed-industries/claude-code-acp)
- Inspired by Zed's ACP adapter architecture
- Uses [Claude Code CLI](https://claude.ai/download)
