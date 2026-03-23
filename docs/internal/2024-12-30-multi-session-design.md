# Multi-Session Architecture Design

**Date:** 2024-12-30
**Status:** Approved
**Author:** Claude + User

## Problem

The current multi-session implementation is broken:
1. Starting a second session redirects to home with "failed to load sessions" error
2. Cannot switch between sessions properly
3. Session switching uses navigation which causes full re-renders and WebSocket race conditions

## Solution

Implement a multi-connection architecture where:
- Multiple WebSocket connections maintained simultaneously (up to 10)
- Sidebar shows all sessions with live status indicators
- Switching sessions changes the view without disconnecting
- Each session independently manages its own connection lifecycle

## Architecture

### State Changes

**Before (single session):**
```javascript
store.state = {
  currentSession: { id, agent, ... },
  sessions: [...],
  messages: { [sessionId]: [...] },
  connection: { status, ws, error }
}
```

**After (multi-session):**
```javascript
store.state = {
  activeSessionId: 'uuid',           // which session is currently VIEWED
  sessions: [...],                    // all known sessions
  messages: { [sessionId]: [...] },   // unchanged
  connections: {                      // map of session connections
    [sessionId]: {
      status: 'connected' | 'connecting' | 'reconnecting' | 'disconnected' | 'error',
      error: null | string,
      retryCount: 0,
      isStreaming: false,
      hasUnread: false,
      unreadCount: 0,
      lastActivity: timestamp
    }
  }
}
```

### API Client Changes

Replace single WebSocket with connection map:

```javascript
class ApertureClient {
  connections = new Map();  // sessionId -> { ws, retryCount, messageHandler }

  async connectSession(sessionId, onMessage) { ... }
  disconnectSession(sessionId) { ... }
  sendToSession(sessionId, message) { ... }
  getConnectionStatus(sessionId) { ... }
  disconnectAll() { ... }
}
```

### Sidebar UI

```
┌─────────────────────────┐
│ Sessions            [+] │
├─────────────────────────┤
│ ● abc123de  CLAUDE      │  ← green dot = connected
│   "Working on tests..." │  ← last message preview
│   ↻ streaming           │  ← activity indicator
├─────────────────────────┤
│ ◐ def456gh  GEMINI      │  ← yellow = reconnecting
│   "Analyzing code..."   │
│   ⚠ reconnecting (2)    │
├─────────────────────────┤
│ ★ jkl012mn  CODEX  •3   │  ← star = active view
│   "Building feature..." │     •3 = unread count
│   ↻ streaming           │
└─────────────────────────┘
```

**Status Indicators:**
| Icon | Status | Color |
|------|--------|-------|
| `●` | Connected, idle | Green |
| `↻` | Connected, streaming | Blue pulse |
| `◐` | Reconnecting | Yellow |
| `○` | Disconnected | Gray |
| `✕` | Error/Failed | Red |
| `★` | Currently viewed | Accent |
| `•N` | Unread activity badge | Red dot |

### Chat View Changes

- Remove local `ws` variable
- Use `api.sendToSession(activeSessionId, msg)`
- Add `switchToSession(sessionId)` function
- Re-render messages only on session switch (not full DOM)

```javascript
function switchToSession(sessionId) {
  store.clearUnread(sessionId);
  await store.loadMessagesForSession(sessionId);
  renderSessionHeader(sessionId);
  renderMessages(sessionId);

  if (!api.isConnected(sessionId)) {
    connectSession(sessionId);
  }
}

function handleWebSocketMessage(sessionId, data) {
  processMessage(sessionId, data);

  if (sessionId === store.get('activeSessionId')) {
    renderMessages(sessionId);
  } else {
    store.incrementUnread(sessionId);
  }
}
```

### Session Lifecycle

**When to connect:**
- Session created → connect immediately
- App loads → connect to all active sessions
- User clicks disconnected session → reconnect

**When to disconnect:**
- User clicks "End Session" → disconnect + delete
- Server reports session ended → mark as ended
- Max connections reached → disconnect oldest idle

**Connection Limits:**
```javascript
const MAX_CONCURRENT_CONNECTIONS = 10;
```

### Error Handling

| Scenario | Handling |
|----------|----------|
| Server unreachable on startup | Show banner, retry with backoff |
| Single session disconnects | Mark as "reconnecting", others continue |
| Session deleted on server | Remove from connections, show toast |
| Max connections reached | Auto-disconnect oldest idle |
| Network goes offline | All sessions → "reconnecting" |

## File Changes

| File | Changes |
|------|---------|
| `store.js` | Add `activeSessionId`, `connections` map, helper methods |
| `api.js` | Replace single `ws` with `connections` Map |
| `chat.js` | Remove local `ws`, use `api.sendToSession()`, add `switchToSession()` |
| `sessions.js` | Use `setActiveSession()` instead of navigation |
| `new-session.js` | After create: connect, set active, navigate to `/chat` |
| `app.js` | Update init to connect multiple sessions |
| `app.css` | Add status indicator styles |

## Migration

Existing IndexedDB data unchanged. On first load:
- `currentSession` migrated to `activeSessionId`
- `connections` map initialized empty
- Old single-connection code removed
