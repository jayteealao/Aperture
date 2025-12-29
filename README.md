# Aperture

A production-ready TypeScript gateway that exposes `@zed-industries/claude-code-acp` (stdio ACP agent) over WebSocket and HTTP (SSE). Designed for running on a VPS with Docker.

## Architecture

```
   Client (IDE/Tool)
        |
        | HTTP / WebSocket
        v
+-----------------------+
|      Aperture         |
|   (Node.js Gateway)   |
+-----------------------+
        |  stdio (JSON-RPC)
        v
+-----------------------+
|   claude-code-acp     | <--- @zed-industries/claude-code-acp
+-----------------------+
        |  uses
        v
+-----------------------+
|   Claude Code CLI     | <--- Managed / Installed by Aperture
+-----------------------+
```

## Features

- **Transports**: WebSocket (bidirectional) and HTTP (POST/SSE).
- **Session Management**: Spawns isolated `claude-code-acp` processes per session.
- **Auto-Installation**: Detects OS and installs the official Claude Code CLI if missing.
- **Authentication**:
  - Supports **API Key** billing (`ANTHROPIC_API_KEY`).
  - Supports **Subscription** billing (via persistent `~/.claude`).
- **Security**: Bearer token authentication, input validation, and resource limits.

## Docker Deployment

### Prerequisites

- Docker & Docker Compose

### Setup

1. **Clone the repository:**
   ```bash
   git clone <repo_url>
   cd aperture
   ```

2. **Configure Environment:**
   ```bash
   cp .env.example .env
   ```
   Edit `.env` and set `APERTURE_API_TOKEN`.

   > **Important:** To use **Subscription Mode** (Pro/Max), leave `ANTHROPIC_API_KEY` empty.

3. **Run with Docker Compose:**
   ```bash
   docker-compose up -d --build
   ```

   The server will be available at `http://localhost:8080`.

## API Documentation

All endpoints require `Authorization: Bearer <APERTURE_API_TOKEN>`.

### 1. Create Session
**POST** `/v1/sessions`
- **Body**: `{ "apiKey": "optional-sk-..." }`
- **Response**: `{ "id": "uuid" }`

### 2. Send RPC Request
**POST** `/v1/sessions/:id/rpc`
- **Body**: JSON-RPC 2.0 Request object.
- **Response**: JSON-RPC 2.0 Response (awaits child response).

### 3. Subscribe to Output (SSE)
**GET** `/v1/sessions/:id/events`
- Streams `stdout` from the child process as Server-Sent Events.

### 4. WebSocket Transport
**ws://host:8080/v1/sessions/:id/ws**
- **Send**: JSON-RPC objects (no newlines).
- **Receive**: JSON-RPC objects (stdout from child).

### 5. Terminate Session
**DELETE** `/v1/sessions/:id`

## Authentication Guide

### API Key Mode
Set `ANTHROPIC_API_KEY` in `.env` or pass it in the `create session` body. The gateway will inject this into the child process.

### Subscription Mode (Headless)
If you do not provide an API key, Claude Code uses the subscription associated with the login in `~/.claude`. This directory is persisted via the `claude_data` Docker volume.

To authenticate on a headless VPS:
1. Start the container.
2. Run the following command on the host:
   ```bash
   docker exec -it <container_name> /bin/bash
   ```
3. Inside the container, run:
   ```bash
   claude login
   ```
4. Follow the URL to authenticate in your browser, copy the code, and paste it back into the terminal.
5. Exit the container. The login is now persisted.

## Troubleshooting

- **Missing `claude` binary**: Aperture attempts to install it automatically. Check logs (`docker-compose logs`) to see installation status.
- **Login Issues**: Ensure you didn't set `ANTHROPIC_API_KEY` if you intend to use subscription. Check permissions on `claude_data` volume.
- **Framing Errors**: Ensure you never send embedded newlines in your JSON messages.

## Development

```bash
npm install
npm run dev
```

Run tests:
```bash
npm test
```
