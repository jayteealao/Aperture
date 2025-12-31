# Aperture Web Frontend - Product & UX Spec

## Overview

Aperture is a premium "AI workspace" web application that provides a beautiful, high-performance interface for interacting with ACP (Agent Communication Protocol) agents including Claude Code, Codex, and Gemini. The design draws inspiration from modern glass-morphism UI patterns with soft gradients, blurred surfaces, and a chat-centric workspace.

---

## Sitemap & Routes

| Route | Page | Description |
|-------|------|-------------|
| `/` | Redirect | Redirects to `/workspace` if connected, `/onboarding` otherwise |
| `/onboarding` | Onboarding | Gateway URL setup, token authentication, connection test |
| `/workspace` | Workspace | Main chat interface with session selector |
| `/workspace/:sessionId` | Workspace | Chat with specific session (deep link) |
| `/sessions` | Sessions | List, inspect, and manage all sessions |
| `/sessions/new` | New Session | Create new session with agent/auth picker |
| `/credentials` | Credentials | Manage stored API keys |
| `/settings` | Settings | Appearance, shortcuts, advanced options |
| `/help` | Help | Documentation, troubleshooting |

---

## Key User Journeys

### 1. First Run / Onboarding
```
Landing → Set Gateway URL → Enter Bearer Token → Test Connection → Success → Workspace
```

**Steps:**
1. User arrives at `/onboarding` (auto-redirect if not configured)
2. Gateway Base URL input (defaults from env or `http://localhost:8080`)
3. Bearer token input with visibility toggle
4. "Test Connection" button triggers `/healthz` and `/readyz` checks
5. Shows friendly diagnostics (green checkmarks or error messages)
6. Option to "Remember token" with security warning
7. On success, redirects to `/workspace`

### 2. Create Session
```
Workspace → New Session Button → Agent Picker → Auth Mode → Configure → Create → Chat
```

**Steps:**
1. Click "New Session" in sidebar or empty state
2. Modal/panel slides in with agent picker (Claude/Codex/Gemini cards)
3. Select auth mode based on agent:
   - Claude: Interactive (subscription) or API Key
   - Codex: API Key (recommended) or Interactive (local only)
   - Gemini: API Key, OAuth, or Vertex AI
4. If API Key: choose inline or stored credential
5. If Vertex: enter project ID, location, optional credentials path
6. Click "Create" → loading state → success toast
7. New session becomes active, opens in workspace

### 3. Workspace Chat (Realtime)
```
Select Session → Type Message → Send → Stream Response → View Tools → Approve Actions
```

**Steps:**
1. Session list in sidebar shows all sessions with status indicators
2. Click session to activate (in-place switch, no navigation)
3. Messages load from local IndexedDB + server sync
4. Type in composer (multiline, Shift+Enter for newline)
5. Send triggers WebSocket message
6. Response streams in with typing indicator/cursor
7. Tool calls appear as collapsible cards
8. Permission requests trigger approval modal

### 4. Session Management
```
Sessions Page → View List → Filter/Search → Select Session → View Details → Terminate
```

**Steps:**
1. Navigate to `/sessions` via sidebar
2. See all sessions with status, agent type, last activity
3. Filter by status (running, ended) or search by ID
4. Click session for details panel
5. "Terminate" with confirmation dialog
6. Deep link to workspace for active sessions

### 5. Credential Management
```
Credentials Page → View Stored → Add New → Delete Old
```

**Steps:**
1. Navigate to `/credentials` via sidebar
2. See credentials by provider (Anthropic, OpenAI, Google)
3. Add new: select provider, label, paste API key
4. Key is never shown after creation (security)
5. Delete with confirmation
6. Use in session creation via "stored credential" option

---

## Data Model

### Session (from server)
```typescript
interface Session {
  id: string;                    // UUID
  agent: 'claude_code' | 'codex' | 'gemini';
  status: {
    id: string;
    agent: string;
    authMode: string;
    running: boolean;
    pendingRequests: number;
    lastActivityTime: number;
    idleMs: number;
    acpSessionId: string | null;
  };
}
```

### Credential (from server)
```typescript
interface Credential {
  id: string;
  provider: 'anthropic' | 'openai' | 'google';
  label: string;
  createdAt: number;
  // Note: apiKey is never returned after creation
}
```

### Message (local + server)
```typescript
interface Message {
  id: string;
  sessionId: string;
  role: 'user' | 'assistant' | 'system';
  content: string | ContentBlock[];
  timestamp: string;
  toolCalls?: ToolCall[];
}
```

### Connection State (local)
```typescript
interface ConnectionState {
  status: 'disconnected' | 'connecting' | 'connected' | 'reconnecting' | 'error' | 'ended';
  error: string | null;
  retryCount: number;
  isStreaming: boolean;
  hasUnread: boolean;
  unreadCount: number;
  lastActivity: number;
}
```

---

## Realtime Strategy

### Primary: WebSocket
- Connect to `/v1/sessions/:id/ws?token=<bearer>`
- Bidirectional JSON-RPC communication
- Send: `{ type: 'user_message', content: string }` or raw JSON-RPC
- Receive: JSON-RPC notifications (`session/update`, `session/request_permission`)

### Fallback: Server-Sent Events (SSE)
- Connect to `/v1/sessions/:id/events` with Bearer auth
- Receive-only stream of agent messages
- Send via HTTP POST to `/v1/sessions/:id/rpc`

### Reconnection Strategy
```
Initial connect failed → Retry with exponential backoff
Delay: min(1000 * 2^attempt, 30000) + random(0-1000)
Max attempts: unlimited (but show UI warning after 5)
```

### Connection Health
- Track `lastActivity` timestamp
- Show "reconnecting" state with attempt count
- Offer manual reconnect button after multiple failures
- Handle stale sessions gracefully (session deleted on server)

---

## Security Decisions

### Token Handling
- Bearer token stored in `sessionStorage` by default (cleared on tab close)
- Optional "Remember me" stores in `localStorage` with explicit warning
- Never logged to console in production
- Input type `password` with visibility toggle

### API Key Security
- Never display stored credential keys after creation
- Inline keys cleared from memory after session creation
- No keys in URL parameters

### Local Storage
- Messages cached in IndexedDB for offline viewing
- "Clear local data" button in settings
- No sensitive data in localStorage except opt-in token

### CSP Considerations
- No inline scripts in HTML
- All JS via module imports
- Avoid `eval()` and `new Function()`

---

## API Contract Summary

### Endpoints Used

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/healthz` | Health check |
| GET | `/readyz` | Readiness check |
| POST | `/v1/sessions` | Create session |
| GET | `/v1/sessions` | List active sessions |
| GET | `/v1/sessions/:id` | Get session status |
| DELETE | `/v1/sessions/:id` | Terminate session |
| GET | `/v1/sessions/:id/messages` | Get message history |
| POST | `/v1/sessions/:id/rpc` | Send JSON-RPC message |
| GET | `/v1/sessions/:id/events` | SSE stream |
| WS | `/v1/sessions/:id/ws` | WebSocket |
| POST | `/v1/credentials` | Store credential |
| GET | `/v1/credentials` | List credentials |
| DELETE | `/v1/credentials/:id` | Delete credential |

### Session Creation Payload
```typescript
interface CreateSessionRequest {
  agent?: 'claude_code' | 'codex' | 'gemini';
  auth?: {
    mode: 'interactive' | 'api_key' | 'oauth' | 'vertex';
    providerKey?: 'anthropic' | 'openai' | 'google';
    apiKeyRef?: 'inline' | 'stored' | 'none';
    apiKey?: string;              // if apiKeyRef='inline'
    storedCredentialId?: string;  // if apiKeyRef='stored'
    vertexProjectId?: string;     // if mode='vertex'
    vertexLocation?: string;      // if mode='vertex'
    vertexCredentialsPath?: string; // optional for vertex
  };
  env?: Record<string, string>;
}
```

### WebSocket Message Formats

**Send (user message):**
```json
{
  "type": "user_message",
  "content": "Hello, Claude!"
}
```

**Send (permission response):**
```json
{
  "type": "permission_response",
  "toolCallId": "call_123",
  "optionId": "allow_once"
}
```

**Send (cancel):**
```json
{
  "type": "cancel"
}
```

**Receive (session update):**
```json
{
  "jsonrpc": "2.0",
  "method": "session/update",
  "params": {
    "update": {
      "sessionUpdate": "agent_message_chunk",
      "content": { "type": "text", "text": "Hello!" }
    }
  }
}
```

**Receive (permission request):**
```json
{
  "jsonrpc": "2.0",
  "method": "session/request_permission",
  "params": {
    "toolCallId": "call_123",
    "toolCall": { "title": "Read file", "rawInput": {...} },
    "options": [
      { "optionId": "allow_once", "name": "Allow Once", "kind": "allow_once" },
      { "optionId": "deny", "name": "Deny", "kind": "deny" }
    ]
  }
}
```

---

## Design System

### Color Tokens

```css
/* Dark Theme - "Nebula Glass" */
--color-bg-primary: #0a0a0f;
--color-bg-secondary: #12121a;
--color-bg-tertiary: #1a1a24;
--color-surface: rgba(255, 255, 255, 0.03);
--color-surface-hover: rgba(255, 255, 255, 0.06);
--color-surface-active: rgba(255, 255, 255, 0.09);
--color-border: rgba(255, 255, 255, 0.08);
--color-border-strong: rgba(255, 255, 255, 0.15);
--color-text-primary: rgba(255, 255, 255, 0.95);
--color-text-secondary: rgba(255, 255, 255, 0.65);
--color-text-muted: rgba(255, 255, 255, 0.4);
--color-accent: #00f5a0;
--color-accent-hover: #00d68f;
--color-accent-secondary: #7c3aed;
--color-danger: #ef4444;
--color-warning: #f59e0b;
--color-success: #22c55e;

/* Light Theme - "Pearl Glass" */
--color-bg-primary: #f8f9fc;
--color-bg-secondary: #ffffff;
--color-bg-tertiary: #f1f3f9;
--color-surface: rgba(0, 0, 0, 0.02);
--color-surface-hover: rgba(0, 0, 0, 0.04);
--color-surface-active: rgba(0, 0, 0, 0.06);
--color-border: rgba(0, 0, 0, 0.06);
--color-border-strong: rgba(0, 0, 0, 0.12);
--color-text-primary: rgba(0, 0, 0, 0.9);
--color-text-secondary: rgba(0, 0, 0, 0.6);
--color-text-muted: rgba(0, 0, 0, 0.4);
```

### Typography

```css
--font-sans: 'Inter', ui-sans-serif, system-ui, sans-serif;
--font-mono: 'JetBrains Mono', ui-monospace, monospace;

--text-xs: 0.75rem;    /* 12px */
--text-sm: 0.875rem;   /* 14px */
--text-base: 1rem;     /* 16px */
--text-lg: 1.125rem;   /* 18px */
--text-xl: 1.25rem;    /* 20px */
--text-2xl: 1.5rem;    /* 24px */
--text-3xl: 1.875rem;  /* 30px */
```

### Spacing

```css
--space-1: 0.25rem;   /* 4px */
--space-2: 0.5rem;    /* 8px */
--space-3: 0.75rem;   /* 12px */
--space-4: 1rem;      /* 16px */
--space-5: 1.25rem;   /* 20px */
--space-6: 1.5rem;    /* 24px */
--space-8: 2rem;      /* 32px */
--space-10: 2.5rem;   /* 40px */
--space-12: 3rem;     /* 48px */
```

### Radii

```css
--radius-sm: 0.375rem;  /* 6px */
--radius-md: 0.5rem;    /* 8px */
--radius-lg: 0.75rem;   /* 12px */
--radius-xl: 1rem;      /* 16px */
--radius-2xl: 1.5rem;   /* 24px */
--radius-full: 9999px;
```

### Shadows

```css
--shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.05);
--shadow-md: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
--shadow-lg: 0 10px 15px -3px rgba(0, 0, 0, 0.1);
--shadow-xl: 0 20px 25px -5px rgba(0, 0, 0, 0.1);
--shadow-glow: 0 0 20px rgba(0, 245, 160, 0.3);
```

### Glass Effects

```css
.glass {
  background: var(--color-surface);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border: 1px solid var(--color-border);
}

.glass-strong {
  background: rgba(255, 255, 255, 0.08);
  backdrop-filter: blur(40px);
  border: 1px solid rgba(255, 255, 255, 0.12);
}
```

### Motion

```css
--duration-fast: 100ms;
--duration-normal: 200ms;
--duration-slow: 300ms;
--easing-default: cubic-bezier(0.4, 0, 0.2, 1);
--easing-in: cubic-bezier(0.4, 0, 1, 1);
--easing-out: cubic-bezier(0, 0, 0.2, 1);
--easing-spring: cubic-bezier(0.34, 1.56, 0.64, 1);
```

---

## Component Library

### Primitives
- Button (primary, secondary, ghost, danger)
- Input (text, password, search)
- Textarea (auto-grow)
- Select
- Checkbox / Toggle
- Avatar
- Badge / Chip
- Spinner / Skeleton

### Composites
- Card (session card, credential card, message card)
- Dialog / Modal
- Dropdown / Menu
- Tabs
- Toast
- Tooltip
- Command Palette

### Layout
- Sidebar (collapsible on mobile)
- Topbar
- Content area
- Split pane (optional)

---

## Performance Checklist

- [ ] Route-level code splitting with React.lazy
- [ ] Virtualized message list (react-window or similar)
- [ ] Memoized message renderers
- [ ] Debounced search inputs
- [ ] Skeleton loading states
- [ ] Optimistic UI updates
- [ ] Deferred non-critical UI (settings, help)
- [ ] Surgical use of backdrop-filter (avoid large areas)
- [ ] Image lazy loading (if applicable)
- [ ] Service worker for offline support (future)

---

## Accessibility Checklist

- [ ] ARIA labels on interactive elements
- [ ] Keyboard navigation (Tab, Enter, Escape)
- [ ] Focus trap in modals
- [ ] Focus indicators (visible outline)
- [ ] Skip links for main content
- [ ] Semantic HTML (headings, landmarks)
- [ ] Color contrast ratios (WCAG AA)
- [ ] Reduced motion support (@media prefers-reduced-motion)
- [ ] Screen reader testing

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Build | Vite |
| Framework | React 18 |
| Language | TypeScript |
| Styling | Tailwind CSS + CSS variables |
| State | Zustand (UI) + TanStack Query (server) |
| Routing | React Router v6 |
| Realtime | Native WebSocket + reconnect logic |
| Persistence | IndexedDB (idb-keyval) |
| Testing | Vitest + React Testing Library |
| Linting | ESLint + Prettier |

---

## File Structure

```
web/
├── index.html
├── vite.config.ts
├── tailwind.config.ts
├── tsconfig.json
├── package.json
├── src/
│   ├── main.tsx                 # Entry point
│   ├── App.tsx                  # Root component with router
│   ├── index.css               # Global styles + Tailwind
│   ├── api/
│   │   ├── client.ts           # Fetch wrapper
│   │   ├── websocket.ts        # WebSocket manager
│   │   └── types.ts            # API types
│   ├── stores/
│   │   ├── app.ts              # Global app state
│   │   ├── sessions.ts         # Session state
│   │   └── settings.ts         # User preferences
│   ├── hooks/
│   │   ├── useSession.ts
│   │   ├── useWebSocket.ts
│   │   └── usePersistedState.ts
│   ├── components/
│   │   ├── ui/                 # Primitive components
│   │   │   ├── Button.tsx
│   │   │   ├── Input.tsx
│   │   │   ├── Card.tsx
│   │   │   └── ...
│   │   ├── layout/
│   │   │   ├── Sidebar.tsx
│   │   │   ├── Topbar.tsx
│   │   │   └── Shell.tsx
│   │   ├── chat/
│   │   │   ├── MessageList.tsx
│   │   │   ├── Message.tsx
│   │   │   ├── Composer.tsx
│   │   │   └── ToolCard.tsx
│   │   ├── session/
│   │   │   ├── SessionCard.tsx
│   │   │   ├── SessionList.tsx
│   │   │   └── NewSessionModal.tsx
│   │   └── ...
│   ├── pages/
│   │   ├── Onboarding.tsx
│   │   ├── Workspace.tsx
│   │   ├── Sessions.tsx
│   │   ├── Credentials.tsx
│   │   ├── Settings.tsx
│   │   └── Help.tsx
│   └── utils/
│       ├── format.ts
│       ├── storage.ts
│       └── constants.ts
├── tests/
│   ├── setup.ts
│   └── ...
└── PRODUCT_UX_SPEC.md          # This file
```

---

## Development Commands

```bash
# Install dependencies
npm install

# Start dev server
npm run dev

# Build for production
npm run build

# Run tests
npm run test

# Type check
npm run type-check

# Lint
npm run lint
```

---

## Deployment Notes

- Static hosting (Vercel, Netlify, Cloudflare Pages)
- Environment variable: `VITE_DEFAULT_GATEWAY_URL`
- Base path configurable via Vite config if needed
- No server-side rendering required
- CORS: gateway must allow frontend origin

---

## Future Considerations

- [ ] Multiple workspaces/projects
- [ ] File attachments
- [ ] Voice input
- [ ] Collaborative sessions
- [ ] Plugin/extension system
- [ ] Mobile native app (React Native)
