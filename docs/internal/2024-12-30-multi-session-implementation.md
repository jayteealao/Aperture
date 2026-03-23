# Multi-Session Architecture Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Enable simultaneous WebSocket connections to multiple agent sessions with seamless switching.

**Architecture:** Replace single WebSocket with a connection map. Each session maintains its own connection lifecycle. Sidebar shows live status indicators. Switching sessions re-renders messages without navigation or disconnect.

**Tech Stack:** Vanilla JS, WebSocket API, IndexedDB (via db.js), CSS custom properties

---

## Task 1: Update Store State Structure

**Files:**
- Modify: `web/js/store.js`

**Step 1: Add new state properties and migration**

In `store.js`, update the constructor to add new state properties and migrate from old structure:

```javascript
// In constructor(), update this.state:
constructor() {
  super();
  this.state = {
    serverUrl: localStorage.getItem('aperture:serverUrl') || 'http://localhost:8080',
    apiToken: localStorage.getItem('aperture:apiToken') || '',
    activeSessionId: null,  // NEW: replaces currentSession
    sessions: [],
    messages: {},
    connections: {},  // NEW: per-session connection state
    credentials: [],
    settings: this.loadSettings(),
    // REMOVED: connection (singular)
    inspector: {
      open: false,
      activeTab: 'events',
      events: []
    },
    rail: {
      open: false
    }
  };
}
```

**Step 2: Add helper methods for activeSessionId**

Add after the `clearAll()` method:

```javascript
// Active session management
setActiveSession(sessionId) {
  const oldId = this.state.activeSessionId;
  this.state.activeSessionId = sessionId;

  // Clear unread for newly active session
  if (sessionId && this.state.connections[sessionId]) {
    this.state.connections[sessionId] = {
      ...this.state.connections[sessionId],
      hasUnread: false,
      unreadCount: 0
    };
  }

  // Persist last viewed
  if (sessionId) {
    this.saveCurrentSessionId(sessionId);
  }

  this.dispatchEvent(new CustomEvent('change', {
    detail: { key: 'activeSessionId', value: sessionId, oldValue: oldId }
  }));
}

getActiveSession() {
  const id = this.state.activeSessionId;
  return this.state.sessions.find(s => s.id === id) || null;
}
```

**Step 3: Add connection state management methods**

Add after the active session methods:

```javascript
// Connection state management
updateConnection(sessionId, updates) {
  const connections = { ...this.state.connections };
  connections[sessionId] = {
    status: 'disconnected',
    error: null,
    retryCount: 0,
    isStreaming: false,
    hasUnread: false,
    unreadCount: 0,
    lastActivity: Date.now(),
    ...connections[sessionId],
    ...updates,
    lastActivity: Date.now()
  };
  this.set('connections', connections);
}

getConnection(sessionId) {
  return this.state.connections[sessionId] || null;
}

removeConnection(sessionId) {
  const connections = { ...this.state.connections };
  delete connections[sessionId];
  this.set('connections', connections);
}

incrementUnread(sessionId) {
  if (sessionId === this.state.activeSessionId) return;

  const connections = { ...this.state.connections };
  const conn = connections[sessionId] || {};
  connections[sessionId] = {
    ...conn,
    hasUnread: true,
    unreadCount: (conn.unreadCount || 0) + 1
  };
  this.set('connections', connections);
}

clearUnread(sessionId) {
  const conn = this.state.connections[sessionId];
  if (conn && (conn.hasUnread || conn.unreadCount > 0)) {
    this.updateConnection(sessionId, { hasUnread: false, unreadCount: 0 });
  }
}

setStreaming(sessionId, isStreaming) {
  this.updateConnection(sessionId, { isStreaming });
}
```

**Step 4: Update restoreState for migration**

Modify the `restoreState()` method:

```javascript
async restoreState() {
  try {
    await db.init();

    const sessions = await db.getAllSessions();
    if (sessions.length > 0) {
      this.state.sessions = sessions;
      console.log('[Store] Restored', sessions.length, 'sessions from IndexedDB');
    }

    // Restore last active session (migrate from lastSessionId)
    const lastSessionId = await db.getMeta('lastSessionId');
    if (lastSessionId) {
      const session = sessions.find(s => s.id === lastSessionId);
      if (session) {
        this.state.activeSessionId = lastSessionId;

        const messages = await db.getMessages(lastSessionId);
        if (messages.length > 0) {
          this.state.messages[lastSessionId] = messages;
          console.log('[Store] Restored', messages.length, 'messages for session', lastSessionId.slice(0, 8));
        }
      }
    }

    // Initialize connections map for existing sessions
    this.state.connections = {};
    for (const session of sessions) {
      this.state.connections[session.id] = {
        status: 'disconnected',
        error: null,
        retryCount: 0,
        isStreaming: false,
        hasUnread: false,
        unreadCount: 0,
        lastActivity: Date.now()
      };
    }

    this.dispatchEvent(new CustomEvent('change', { detail: { key: 'all', value: null } }));
  } catch (error) {
    console.error('[Store] Failed to restore state from IndexedDB:', error);
  }
}
```

**Step 5: Update addSession to initialize connection**

Modify `addSession()`:

```javascript
async addSession(session) {
  const sessions = [...this.state.sessions];
  const existing = sessions.findIndex(s => s.id === session.id);

  if (existing >= 0) {
    sessions[existing] = session;
  } else {
    sessions.push(session);
  }

  this.set('sessions', sessions);

  // Initialize connection state for new session
  if (!this.state.connections[session.id]) {
    this.updateConnection(session.id, { status: 'disconnected' });
  }

  try {
    await db.saveSession(session);
    tabSync.broadcast(SyncEvents.SESSION_CREATED, session);
  } catch (error) {
    console.error('[Store] Failed to persist session:', error);
  }
}
```

**Step 6: Update removeSession to clean up connection**

Modify `removeSession()`:

```javascript
async removeSession(sessionId) {
  this.set('sessions', this.state.sessions.filter(s => s.id !== sessionId));

  const messages = { ...this.state.messages };
  delete messages[sessionId];
  this.set('messages', messages);

  // Remove connection state
  this.removeConnection(sessionId);

  if (this.state.activeSessionId === sessionId) {
    this.state.activeSessionId = null;
  }

  try {
    await db.deleteSession(sessionId);
    tabSync.broadcast(SyncEvents.SESSION_DELETED, { sessionId });
  } catch (error) {
    console.error('[Store] Failed to delete session from DB:', error);
  }
}
```

**Step 7: Verify changes compile**

Run: Open browser console, verify no JS errors on page load.

**Step 8: Commit**

```bash
git add web/js/store.js
git commit -m "feat(store): add multi-session state with connections map"
```

---

## Task 2: Refactor API Client for Multi-Connection

**Files:**
- Modify: `web/js/api.js`

**Step 1: Replace single ws with connections Map**

Update the class properties at the top of `ApertureClient`:

```javascript
class ApertureClient {
  constructor() {
    this.baseUrl = '';
    this.token = '';
    this.connections = new Map();  // sessionId -> { ws, retryCount, onMessage }
    this.maxConnections = 10;
  }

  configure(baseUrl, token) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.token = token;
  }
```

**Step 2: Add connectSession method**

Replace the old `connectWebSocket` method with:

```javascript
async connectSession(sessionId, onMessage, options = {}) {
  // Check if already connected
  const existing = this.connections.get(sessionId);
  if (existing && existing.ws && existing.ws.readyState === WebSocket.OPEN) {
    console.log('[API] Already connected to session:', sessionId);
    return existing.ws;
  }

  // Enforce connection limit
  if (this.connections.size >= this.maxConnections) {
    const oldest = this.findOldestIdleConnection();
    if (oldest) {
      console.log('[API] Max connections reached, disconnecting:', oldest);
      this.disconnectSession(oldest);
    } else {
      throw new Error('Maximum concurrent connections reached');
    }
  }

  // Check if session exists on server
  if (!options.skipSessionCheck) {
    try {
      const sessionStatus = await this.getSession(sessionId);
      if (!sessionStatus || sessionStatus.status === 'ended') {
        throw new Error('Session no longer exists or has ended');
      }
    } catch (err) {
      store.updateConnection(sessionId, {
        status: 'error',
        error: 'Session no longer exists on server'
      });
      throw err;
    }
  }

  store.updateConnection(sessionId, { status: 'connecting' });

  return new Promise((resolve, reject) => {
    const wsUrl = this.baseUrl.replace(/^http/, 'ws');
    const url = `${wsUrl}/v1/sessions/${sessionId}/ws?token=${encodeURIComponent(this.token)}`;

    try {
      const ws = new WebSocket(url);

      const connData = {
        ws,
        retryCount: 0,
        onMessage,
        sessionId
      };
      this.connections.set(sessionId, connData);

      ws.onopen = () => {
        console.log('[API] Connected to session:', sessionId);
        store.updateConnection(sessionId, {
          status: 'connected',
          error: null,
          retryCount: 0
        });
        connData.retryCount = 0;
        resolve(ws);
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          onMessage(sessionId, data);
          store.addEvent({
            timestamp: Date.now(),
            type: 'message',
            direction: 'inbound',
            sessionId,
            data
          });
        } catch (error) {
          console.error('[API] Failed to parse message:', error);
        }
      };

      ws.onerror = (error) => {
        console.error('[API] WebSocket error for session:', sessionId, error);
        store.updateConnection(sessionId, { error: 'WebSocket error' });
      };

      ws.onclose = (event) => {
        console.log('[API] WebSocket closed for session:', sessionId, event.code, event.reason);

        if (!event.wasClean || event.code !== 1000) {
          store.updateConnection(sessionId, { status: 'reconnecting' });
          this.retryConnection(sessionId, onMessage);
        } else {
          store.updateConnection(sessionId, { status: 'disconnected' });
          this.connections.delete(sessionId);
        }
      };
    } catch (error) {
      console.error('[API] Failed to create WebSocket:', error);
      store.updateConnection(sessionId, { status: 'error', error: error.message });
      reject(error);
    }
  });
}
```

**Step 3: Add retry logic for individual session**

```javascript
retryConnection(sessionId, onMessage) {
  const conn = this.connections.get(sessionId);
  if (!conn) return;

  conn.retryCount++;
  const delay = Math.min(1000 * Math.pow(2, conn.retryCount), 30000);
  const jitter = Math.random() * 1000;

  console.log(`[API] Reconnecting session ${sessionId} in ${(delay + jitter) / 1000}s (attempt ${conn.retryCount})`);

  store.updateConnection(sessionId, {
    status: 'reconnecting',
    retryCount: conn.retryCount
  });

  setTimeout(async () => {
    // Check connection still exists (user may have ended session)
    if (!this.connections.has(sessionId)) return;

    try {
      await this.connectSession(sessionId, onMessage, { isReconnect: true });
    } catch (error) {
      console.error('[API] Reconnect failed for session:', sessionId, error);

      if (error.message && error.message.includes('no longer exists')) {
        store.updateConnection(sessionId, {
          status: 'error',
          error: 'Session ended'
        });
        this.connections.delete(sessionId);
      }
      // Otherwise onclose handler will trigger another retry
    }
  }, delay + jitter);
}
```

**Step 4: Add disconnect methods**

```javascript
disconnectSession(sessionId) {
  const conn = this.connections.get(sessionId);
  if (conn) {
    if (conn.ws) {
      conn.ws.close(1000, 'User disconnect');
    }
    this.connections.delete(sessionId);
    store.updateConnection(sessionId, { status: 'disconnected' });
  }
}

disconnectAll() {
  for (const [sessionId, conn] of this.connections) {
    if (conn.ws) {
      conn.ws.close(1000, 'Disconnect all');
    }
    store.updateConnection(sessionId, { status: 'disconnected' });
  }
  this.connections.clear();
}
```

**Step 5: Add send and status methods**

```javascript
sendToSession(sessionId, message) {
  const conn = this.connections.get(sessionId);
  if (conn && conn.ws && conn.ws.readyState === WebSocket.OPEN) {
    const payload = JSON.stringify(message);
    conn.ws.send(payload);
    store.addEvent({
      timestamp: Date.now(),
      type: 'message',
      direction: 'outbound',
      sessionId,
      data: message
    });
    return true;
  }
  return false;
}

isConnected(sessionId) {
  const conn = this.connections.get(sessionId);
  return conn && conn.ws && conn.ws.readyState === WebSocket.OPEN;
}

getConnectionStatus(sessionId) {
  const conn = this.connections.get(sessionId);
  if (!conn || !conn.ws) return 'disconnected';

  switch (conn.ws.readyState) {
    case WebSocket.CONNECTING: return 'connecting';
    case WebSocket.OPEN: return 'connected';
    case WebSocket.CLOSING: return 'disconnecting';
    case WebSocket.CLOSED: return 'disconnected';
    default: return 'unknown';
  }
}

findOldestIdleConnection() {
  let oldest = null;
  let oldestTime = Infinity;

  for (const [sessionId] of this.connections) {
    const conn = store.getConnection(sessionId);
    if (conn && !conn.isStreaming && conn.lastActivity < oldestTime) {
      oldest = sessionId;
      oldestTime = conn.lastActivity;
    }
  }
  return oldest;
}
```

**Step 6: Remove old single-connection methods**

Delete these methods (they are replaced):
- `connectWebSocket` (replaced by `connectSession`)
- `retryReconnect` (replaced by `retryConnection`)
- `sendWebSocketMessage` (replaced by `sendToSession`)
- `disconnectWebSocket` (replaced by `disconnectSession`)

Also delete the old class properties:
- `this.ws = null;`
- `this.currentSessionId = null;`
- `this.retryCount = 0;`
- `this.maxRetries = Infinity;`
- `this.reconnectStrategy = 'exponential';`

**Step 7: Add import for store**

At the top of the file, the import is already there:
```javascript
import { store } from './store.js';
```

**Step 8: Commit**

```bash
git add web/js/api.js
git commit -m "feat(api): multi-connection WebSocket manager"
```

---

## Task 3: Add CSS Status Indicators

**Files:**
- Modify: `web/css/app.css`

**Step 1: Add status dot styles**

Add at the end of `app.css`:

```css
/* =============================================================================
   Session Status Indicators
   ============================================================================= */

.status-indicator {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 12px;
  height: 12px;
  font-size: 12px;
  flex-shrink: 0;
}

.status-indicator--connected::before {
  content: '';
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--ok);
}

.status-indicator--streaming::before {
  content: '';
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--accent);
  animation: pulse 1.5s ease-in-out infinite;
}

.status-indicator--reconnecting::before {
  content: '';
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--warn);
  animation: pulse 1s ease-in-out infinite;
}

.status-indicator--disconnected::before {
  content: '';
  width: 8px;
  height: 8px;
  border-radius: 50%;
  border: 2px solid var(--muted);
  background: transparent;
}

.status-indicator--error::before {
  content: '';
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--danger);
}

.status-indicator--active::before {
  content: '★';
  color: var(--accent);
  font-size: 12px;
  line-height: 1;
}

@keyframes pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.6; transform: scale(0.9); }
}

/* Unread badge */
.unread-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  border-radius: 9px;
  background: var(--danger);
  color: white;
  font-size: 11px;
  font-weight: 600;
}

/* Session card in sidebar */
.session-card {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 12px;
  border: 2px solid var(--border);
  background: var(--surface);
  cursor: pointer;
  transition: border-color var(--t-fast), background var(--t-fast);
}

.session-card:hover {
  border-color: var(--fg);
}

.session-card--active {
  border-color: var(--accent);
  background: color-mix(in srgb, var(--accent) 10%, var(--surface));
}

.session-card__header {
  display: flex;
  align-items: center;
  gap: 8px;
}

.session-card__info {
  flex: 1;
  min-width: 0;
}

.session-card__id {
  font-family: var(--font-mono);
  font-size: 13px;
}

.session-card__agent {
  font-size: 11px;
  text-transform: uppercase;
  color: var(--muted);
}

.session-card__preview {
  font-size: 12px;
  color: var(--muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.session-card__status {
  font-size: 11px;
  color: var(--muted);
}

.session-card__status--streaming {
  color: var(--accent);
}

.session-card__status--reconnecting {
  color: var(--warn);
}

.session-card__status--error {
  color: var(--danger);
}
```

**Step 2: Commit**

```bash
git add web/css/app.css
git commit -m "feat(css): session status indicators and card styles"
```

---

## Task 4: Update Chat View for Multi-Session

**Files:**
- Modify: `web/js/components/chat.js`

**Step 1: Update imports and remove local ws**

At the top of `renderChat()`, change how we get the session:

```javascript
export function renderChat() {
  const session = store.getActiveSession();

  if (!session) {
    // No active session - try to get first available
    const sessions = store.get('sessions');
    if (sessions.length > 0) {
      store.setActiveSession(sessions[0].id);
      return renderChat(); // Re-render with active session
    }
    showToast('Error', 'No active session', 'error');
    router.push('/sessions');
    return document.createElement('div');
  }
```

**Step 2: Remove local ws variable**

Remove these lines from inside `renderChat()`:
```javascript
// DELETE THESE:
let ws = null;
```

**Step 3: Update sendMessage to use api.sendToSession**

Replace the `sendMessage` function:

```javascript
async function sendMessage() {
  const content = composerInput.value.trim();
  const sessionId = store.get('activeSessionId');
  if (!content || !sessionId) return;

  const conn = store.getConnection(sessionId);
  if (conn?.isStreaming) return; // Already streaming

  const toolsAllowed = container.querySelector('#tools-allowed').checked;
  const requireApprovals = container.querySelector('#require-approvals').checked;

  const userMsg = {
    id: `msg-${Date.now()}`,
    role: 'user',
    content,
    timestamp: new Date().toISOString()
  };
  store.addMessage(sessionId, userMsg);
  renderMessages();

  composerInput.value = '';
  composerInput.style.height = 'auto';

  const sent = api.sendToSession(sessionId, {
    type: 'user_message',
    content,
    toolsAllowed,
    requireApprovals
  });

  if (!sent) {
    showToast('Error', 'Not connected to session', 'error');
  }
}
```

**Step 4: Add switchToSession function**

Add this function after the state declarations:

```javascript
async function switchToSession(sessionId) {
  if (sessionId === store.get('activeSessionId')) return;

  console.log('[Chat] Switching to session:', sessionId);

  // Update active session
  store.setActiveSession(sessionId);
  store.clearUnread(sessionId);

  // Load messages if not in memory
  await store.loadMessagesForSession(sessionId);

  // Update header
  const newSession = store.getActiveSession();
  if (newSession) {
    container.querySelector('.connection-bar__session').innerHTML = `
      <span class="kicker">Session</span>
      <span class="mono">${newSession.id.slice(0, 8)}</span>
      <span class="meta">${newSession.agent}</span>
    `;
  }

  // Re-render messages
  renderMessages();

  // Connect if not already connected
  if (!api.isConnected(sessionId)) {
    connectToSession(sessionId);
  }

  // Update connection status display
  updateConnectionStatus(sessionId);
}
```

**Step 5: Add updateConnectionStatus helper**

```javascript
function updateConnectionStatus(sessionId) {
  const conn = store.getConnection(sessionId);
  const status = conn?.status || 'disconnected';

  const statusMap = {
    connected: { text: 'Connected', class: 'chip--ok' },
    connecting: { text: 'Connecting...', class: '' },
    reconnecting: { text: 'Reconnecting...', class: 'chip--warn' },
    disconnected: { text: 'Disconnected', class: 'chip--danger' },
    error: { text: 'Error', class: 'chip--danger' }
  };

  const statusInfo = statusMap[status] || statusMap.disconnected;
  connectionStatus.textContent = statusInfo.text;
  connectionStatus.className = `chip chip--sm ${statusInfo.class}`;
  connectionStateText.textContent = conn?.error || `WebSocket ${status}`;
}
```

**Step 6: Replace connectWebSocket with connectToSession**

Replace the `connectWebSocket` function:

```javascript
async function connectToSession(sessionId) {
  try {
    updateConnectionStatus(sessionId);

    await api.connectSession(sessionId, handleWebSocketMessage);

    updateConnectionStatus(sessionId);
  } catch (error) {
    updateConnectionStatus(sessionId);

    if (!error.message || !error.message.includes('no longer exists')) {
      showToast('Connection Error', error.message, 'error');
    }
  }
}
```

**Step 7: Update handleWebSocketMessage to receive sessionId**

The function signature changes - it now receives sessionId as first parameter:

```javascript
function handleWebSocketMessage(sessionId, data) {
  const activeSessionId = store.get('activeSessionId');

  // Handle ACP JSON-RPC format
  if (data.jsonrpc === '2.0') {
    handleAcpMessage(sessionId, data);
    return;
  }

  // Legacy format support
  if (data.type === 'error') {
    showToast('Error', data.message || 'Unknown error', 'error');
    store.addEvent({
      timestamp: Date.now(),
      type: 'error',
      sessionId,
      data
    });
    if (sessionId === activeSessionId) {
      renderEvents();
    }
  }
}
```

**Step 8: Update handleAcpMessage to use sessionId**

```javascript
function handleAcpMessage(sessionId, msg) {
  const method = msg.method;
  const params = msg.params || {};
  const activeSessionId = store.get('activeSessionId');

  store.addEvent({
    timestamp: Date.now(),
    type: method || 'response',
    sessionId,
    data: msg
  });

  if (sessionId === activeSessionId) {
    renderEvents();
  }

  if (method === 'session/update') {
    handleSessionUpdate(sessionId, params);
  } else if (method === 'session/request_permission') {
    handlePermissionRequest(sessionId, params);
  } else if (method === 'session/exit') {
    handleSessionExit(sessionId, params);
  } else if (method === 'session/error') {
    showToast('Error', params.message || 'Unknown error', 'error');
  } else if (msg.result) {
    if (msg.result.stopReason) {
      store.setStreaming(sessionId, false);
      if (sessionId === activeSessionId) {
        renderMessages();
      }
    }
  } else if (msg.error) {
    showToast('Error', msg.error.message || 'Unknown error', 'error');
  }
}
```

**Step 9: Update handleSessionUpdate with sessionId**

```javascript
function handleSessionUpdate(sessionId, params) {
  const update = params.update;
  if (!update) return;

  const updateType = update.sessionUpdate;
  const activeSessionId = store.get('activeSessionId');
  const isActive = sessionId === activeSessionId;

  switch (updateType) {
    case 'agent_message_chunk': {
      const conn = store.getConnection(sessionId);
      const currentStreamId = conn?.currentStreamMessageId;

      if (!conn?.isStreaming) {
        const msgId = `msg-${Date.now()}`;
        store.setStreaming(sessionId, true);
        store.updateConnection(sessionId, { currentStreamMessageId: msgId });
        store.addMessage(sessionId, {
          id: msgId,
          role: 'assistant',
          content: '',
          timestamp: new Date().toISOString()
        });
      }

      const content = update.content;
      if (content && content.type === 'text' && content.text) {
        const messages = store.get('messages')[sessionId] || [];
        const streamMsgId = store.getConnection(sessionId)?.currentStreamMessageId;
        const currentMsg = messages.find(m => m.id === streamMsgId);
        if (currentMsg) {
          store.updateMessage(sessionId, streamMsgId, {
            content: currentMsg.content + content.text
          });
        }
      }

      if (isActive) {
        renderMessages();
      } else {
        store.incrementUnread(sessionId);
      }
      break;
    }

    case 'agent_thought_chunk': {
      const content = update.content;
      if (content && content.type === 'text' && content.text) {
        console.log('Agent thought:', content.text);
      }
      break;
    }

    case 'tool_call':
    case 'tool_call_update': {
      store.addEvent({
        timestamp: Date.now(),
        type: updateType,
        sessionId,
        data: update
      });
      if (isActive) renderEvents();
      break;
    }

    case 'plan': {
      store.addEvent({
        timestamp: Date.now(),
        type: 'plan',
        sessionId,
        data: update.entries
      });
      if (isActive) renderEvents();
      break;
    }

    default:
      console.log('Unknown session update type:', updateType, update);
  }
}
```

**Step 10: Update handlePermissionRequest with sessionId**

```javascript
function handlePermissionRequest(sessionId, params) {
  const { toolCallId, toolCall, options } = params;

  store.addEvent({
    timestamp: Date.now(),
    type: 'permission_request',
    sessionId,
    data: {
      toolCallId,
      toolCall,
      options,
      pending: true
    }
  });

  const isActive = sessionId === store.get('activeSessionId');
  if (isActive) {
    renderApprovals();
    switchTab('approvals');
    inspector.setAttribute('data-open', 'true');
  } else {
    store.incrementUnread(sessionId);
    showToast('Approval Needed', `Session ${sessionId.slice(0, 8)} requires approval`, 'info');
  }
}
```

**Step 11: Update handleSessionExit with sessionId**

```javascript
function handleSessionExit(sessionId, params) {
  store.setStreaming(sessionId, false);
  store.updateConnection(sessionId, {
    status: 'ended',
    currentStreamMessageId: null
  });

  const isActive = sessionId === store.get('activeSessionId');
  if (isActive) {
    showToast('Session Ended', `Exit code: ${params.code}`, 'info');
    updateConnectionStatus(sessionId);
  }
}
```

**Step 12: Update handlePermissionResponse with sessionId**

```javascript
function handlePermissionResponse(toolCallId, optionId) {
  const sessionId = store.get('activeSessionId');

  const sent = api.sendToSession(sessionId, {
    type: 'permission_response',
    toolCallId,
    optionId
  });

  if (sent) {
    const events = store.get('inspector').events;
    const eventIdx = events.findIndex(e => e.data.toolCallId === toolCallId);
    if (eventIdx >= 0) {
      events[eventIdx].data.pending = false;
      events[eventIdx].data.response = optionId ? 'approved' : 'denied';
    }

    showToast('Sent', optionId ? 'Permission granted' : 'Permission denied', 'success');
    renderApprovals();
  } else {
    showToast('Error', 'Failed to send response - not connected', 'error');
  }
}
```

**Step 13: Update renderSessionList for multi-session sidebar**

```javascript
function renderSessionList() {
  const sessions = store.get('sessions');
  const connections = store.get('connections');
  const activeId = store.get('activeSessionId');

  if (sessions.length === 0) {
    sessionListItems.innerHTML = '<p class="meta">No sessions</p>';
    return;
  }

  sessionListItems.innerHTML = sessions.map(s => {
    const conn = connections[s.id] || {};
    const isActive = s.id === activeId;

    // Determine status indicator class
    let statusClass = 'status-indicator--disconnected';
    let statusText = 'disconnected';

    if (isActive) {
      statusClass = 'status-indicator--active';
    } else if (conn.isStreaming) {
      statusClass = 'status-indicator--streaming';
      statusText = 'streaming';
    } else if (conn.status === 'connected') {
      statusClass = 'status-indicator--connected';
      statusText = 'connected';
    } else if (conn.status === 'reconnecting') {
      statusClass = 'status-indicator--reconnecting';
      statusText = `reconnecting (${conn.retryCount || 0})`;
    } else if (conn.status === 'error') {
      statusClass = 'status-indicator--error';
      statusText = 'error';
    }

    const unreadBadge = conn.unreadCount > 0
      ? `<span class="unread-badge">${conn.unreadCount}</span>`
      : '';

    return `
      <div class="session-card ${isActive ? 'session-card--active' : ''}" data-id="${s.id}">
        <div class="session-card__header">
          <span class="status-indicator ${statusClass}"></span>
          <div class="session-card__info">
            <span class="session-card__id">${s.id.slice(0, 8)}</span>
            <span class="session-card__agent">${s.agent}</span>
          </div>
          ${unreadBadge}
        </div>
        <div class="session-card__status session-card__status--${conn.status || 'disconnected'}">
          ${statusText}
        </div>
      </div>
    `;
  }).join('');

  // Click handlers - use switchToSession instead of navigation
  sessionListItems.querySelectorAll('.session-card').forEach(card => {
    card.addEventListener('click', () => {
      const sessionId = card.dataset.id;
      switchToSession(sessionId);
    });
  });
}
```

**Step 14: Update renderConnectionBanner**

```javascript
function renderConnectionBanner() {
  const sessionId = store.get('activeSessionId');
  const conn = store.getConnection(sessionId);

  if (!conn) {
    connectionBanner.style.display = 'none';
    return;
  }

  if (conn.status === 'reconnecting') {
    connectionBanner.innerHTML = `
      <div style="background: var(--warn); color: white; padding: 12px; text-align: center;">
        <span>Reconnecting... (attempt ${conn.retryCount || 0})</span>
        <button class="btn btn--sm" style="margin-left: 12px;" onclick="location.reload()">Reload Page</button>
      </div>
    `;
    connectionBanner.style.display = 'block';
  } else if (conn.status === 'error') {
    const isStaleSession = conn.error && conn.error.includes('no longer exists');

    if (isStaleSession) {
      connectionBanner.innerHTML = `
        <div style="background: var(--danger); color: white; padding: 12px; text-align: center;">
          <span>Session no longer exists on server</span>
          <button class="btn btn--sm" style="margin-left: 12px;" id="cleanup-stale-session">Remove &amp; Go Back</button>
          <button class="btn btn--sm" style="margin-left: 8px;" id="keep-local-session">Keep Local Copy</button>
        </div>
      `;
      connectionBanner.style.display = 'block';

      connectionBanner.querySelector('#cleanup-stale-session')?.addEventListener('click', async () => {
        await store.removeSession(sessionId);
        api.disconnectSession(sessionId);
        showToast('Cleaned Up', 'Stale session removed', 'success');
        router.push('/sessions');
      });

      connectionBanner.querySelector('#keep-local-session')?.addEventListener('click', () => {
        router.push('/sessions');
      });
    } else {
      connectionBanner.innerHTML = `
        <div style="background: var(--danger); color: white; padding: 12px; text-align: center;">
          <span>Connection error: ${conn.error || 'Unknown error'}</span>
          <button class="btn btn--sm" style="margin-left: 12px;" id="retry-connection">Retry</button>
        </div>
      `;
      connectionBanner.style.display = 'block';

      connectionBanner.querySelector('#retry-connection')?.addEventListener('click', () => {
        connectToSession(sessionId);
      });
    }
  } else {
    connectionBanner.style.display = 'none';
  }
}
```

**Step 15: Update end session handler**

```javascript
container.querySelector('#end-session').addEventListener('click', async () => {
  const sessionId = store.get('activeSessionId');
  if (!sessionId) return;

  if (confirm('End this session? The agent will be stopped.')) {
    try {
      api.disconnectSession(sessionId);
      await api.deleteSession(sessionId);
      await store.removeSession(sessionId);
      showToast('Success', 'Session ended', 'success');

      // Switch to another session or go to sessions page
      const remaining = store.get('sessions');
      if (remaining.length > 0) {
        switchToSession(remaining[0].id);
      } else {
        router.push('/sessions');
      }
    } catch (error) {
      showToast('Error', `Failed to end session: ${error.message}`, 'error');
    }
  }
});
```

**Step 16: Update store listener for connections**

In the store listener section, update to handle connections:

```javascript
store.addEventListener('change', (event) => {
  const { key } = event.detail;
  const activeSessionId = store.get('activeSessionId');

  if (key === 'messages') {
    renderMessages();
  } else if (key === 'inspector') {
    renderEvents();
    renderApprovals();
    renderConnectionInfo();
  } else if (key === 'connections' || key === 'activeSessionId') {
    renderSessionList();
    if (activeSessionId) {
      updateConnectionStatus(activeSessionId);
      renderConnectionBanner();
    }
  } else if (key === 'sessions') {
    renderSessionList();
  }
});
```

**Step 17: Update initialization**

Replace the init IIFE at the bottom:

```javascript
(async () => {
  const sessionId = store.get('activeSessionId');
  if (!sessionId) return;

  await store.saveCurrentSessionId(sessionId);
  await initializeMessages();

  renderSessionList();
  renderEvents();
  renderApprovals();
  renderConnectionInfo();

  // Connect to active session
  connectToSession(sessionId);
})();
```

**Step 18: Update renderMessages to use activeSessionId**

```javascript
function renderMessages() {
  const sessionId = store.get('activeSessionId');
  const messages = store.get('messages')[sessionId] || [];
  const conn = store.getConnection(sessionId);
  const currentStreamMessageId = conn?.currentStreamMessageId;

  if (messages.length === 0) {
    timeline.innerHTML = `
      <div class="chat-timeline__empty">
        <div class="kicker">Ready</div>
        <p class="meta">Send a message to start the conversation</p>
      </div>
    `;
    return;
  }

  timeline.innerHTML = messages.map(msg => {
    const isUser = msg.role === 'user';
    const isStreaming = msg.id === currentStreamMessageId;

    return `
      <div class="message-slab ${isUser ? 'message-slab--user' : 'message-slab--agent'}" data-id="${msg.id}">
        <div class="message-slab__header">
          <span class="kicker">${isUser ? 'You' : msg.role || 'Agent'}</span>
          <span class="mono meta">${formatTime(msg.timestamp)}</span>
        </div>
        <div class="message-slab__content">
          ${formatContent(msg.content)}${isStreaming ? '<span class="cursor">█</span>' : ''}
        </div>
        <div class="message-slab__actions">
          <button class="btn btn--ghost btn--sm" data-action="copy" data-content="${escapeHtml(msg.content)}">Copy</button>
          <button class="btn btn--ghost btn--sm" data-action="inspect" data-message-id="${msg.id}">Inspect</button>
        </div>
      </div>
    `;
  }).join('');

  timeline.scrollTop = timeline.scrollHeight;

  // Re-attach action listeners...
  timeline.querySelectorAll('[data-action="copy"]').forEach(btn => {
    btn.addEventListener('click', () => {
      navigator.clipboard.writeText(btn.dataset.content);
      showToast('Copied', 'Message copied to clipboard', 'success');
    });
  });

  timeline.querySelectorAll('[data-action="inspect"]').forEach(btn => {
    btn.addEventListener('click', () => {
      const msgId = btn.dataset.messageId;
      const msg = messages.find(m => m.id === msgId);
      if (msg) {
        store.addEvent({
          timestamp: Date.now(),
          type: 'inspect_message',
          data: msg
        });
        inspector.setAttribute('data-open', 'true');
        switchTab('events');
      }
    });
  });
}
```

**Step 19: Commit**

```bash
git add web/js/components/chat.js
git commit -m "feat(chat): multi-session support with in-place switching"
```

---

## Task 5: Update Sessions Page

**Files:**
- Modify: `web/js/components/sessions.js`

**Step 1: Update session click handler**

In `loadSessions()`, update the click handlers to use `setActiveSession`:

```javascript
// Add click handlers - lines 177-186
listContainer.querySelectorAll('.session-item').forEach(item => {
  item.addEventListener('click', () => {
    const sessionId = item.getAttribute('data-session-id');
    const session = sessions.find(s => s.id === sessionId);
    if (session) {
      store.setActiveSession(sessionId);
      router.push('/chat');
    }
  });
});
```

**Step 2: Commit**

```bash
git add web/js/components/sessions.js
git commit -m "fix(sessions): use setActiveSession instead of currentSession"
```

---

## Task 6: Update New Session Flow

**Files:**
- Modify: `web/js/components/new-session.js`

**Step 1: Update session creation handler**

In the create button click handler (around line 289-300), update to use new methods:

```javascript
try {
  const session = await api.createSession(config);
  await store.addSession(session);
  store.setActiveSession(session.id);

  // Connect to the new session
  api.connectSession(session.id, (sessionId, data) => {
    // This handler will be replaced when chat.js loads
    console.log('[NewSession] Message for session:', sessionId, data);
  });

  showToast('Success', `Session ${session.id.slice(0, 8)} created`, 'success');
  router.push('/chat');
} catch (error) {
  showToast('Error', `Failed to create session: ${error.message}`, 'error');
} finally {
  createBtn.disabled = false;
  createBtn.textContent = 'Create Session';
}
```

**Step 2: Commit**

```bash
git add web/js/components/new-session.js
git commit -m "feat(new-session): connect immediately after creation"
```

---

## Task 7: Update App Initialization

**Files:**
- Modify: `web/js/app.js`

**Step 1: Update init function for multi-session startup**

```javascript
async function init() {
  // Restore state from IndexedDB
  await store.restoreState();

  // Configure API client
  const serverUrl = store.get('serverUrl');
  const apiToken = store.get('apiToken');

  if (serverUrl) {
    api.configure(serverUrl, apiToken);
  }

  // Fetch active sessions from server and reconcile
  try {
    const { sessions: serverSessions } = await api.listSessions();

    // Update local sessions with server status
    for (const serverSession of serverSessions) {
      await store.addSession(serverSession);
    }

    // Connect to all active server sessions (up to limit)
    const sessionsToConnect = serverSessions.slice(0, 10);
    for (const session of sessionsToConnect) {
      try {
        api.connectSession(session.id, (sessionId, data) => {
          // Global message handler - chat.js will handle when active
          handleGlobalMessage(sessionId, data);
        });
      } catch (err) {
        console.warn('[App] Failed to connect session:', session.id, err);
      }
    }
  } catch (err) {
    console.warn('[App] Failed to fetch server sessions:', err);
  }

  // Navigate based on state
  const activeSessionId = store.get('activeSessionId');
  if (activeSessionId && router.currentPath === '/') {
    await router.navigate('/chat');
  } else {
    await router.navigate(router.currentPath);
  }

  applySettings();

  store.addEventListener('change', (event) => {
    if (event.detail.key === 'settings') {
      applySettings();
    }
  });
}

// Global message handler for sessions not currently viewed
function handleGlobalMessage(sessionId, data) {
  const activeSessionId = store.get('activeSessionId');

  // If this is for the active session, chat.js handles it
  if (sessionId === activeSessionId) return;

  // Handle background session updates
  if (data.jsonrpc === '2.0' && data.method === 'session/update') {
    const update = data.params?.update;
    if (update?.sessionUpdate === 'agent_message_chunk') {
      store.setStreaming(sessionId, true);
      store.incrementUnread(sessionId);
    }
  }
}
```

**Step 2: Commit**

```bash
git add web/js/app.js
git commit -m "feat(app): multi-session startup with background connections"
```

---

## Task 8: Integration Testing

**Step 1: Start the dev server**

```bash
npm run dev
```

**Step 2: Manual test checklist**

1. **Create first session:**
   - Go to /sessions
   - Create a Claude session
   - Verify sidebar shows session with green dot
   - Send a message, verify response streams

2. **Create second session:**
   - Click "+" in sidebar
   - Create a Gemini session
   - Verify both sessions appear in sidebar
   - Verify first session still shows connected (green dot)

3. **Switch between sessions:**
   - Click first session in sidebar
   - Verify messages load instantly (no page refresh)
   - Verify header updates to show correct session
   - Click second session
   - Verify switch is instant

4. **Unread indicators:**
   - While viewing Session A, send message to Session B (via API or another tab)
   - Verify Session B shows unread badge
   - Click Session B
   - Verify badge clears

5. **Reconnection:**
   - Stop the server
   - Verify sessions show "reconnecting" status
   - Restart server
   - Verify sessions reconnect automatically

6. **End session:**
   - Click "End" button
   - Verify session removed from sidebar
   - Verify another session becomes active

**Step 3: Commit final state**

```bash
git add -A
git commit -m "test: verify multi-session integration"
```

---

## Summary

**Files Modified:**
1. `web/js/store.js` - New state structure with `activeSessionId` and `connections` map
2. `web/js/api.js` - Multi-connection WebSocket manager
3. `web/css/app.css` - Status indicator styles
4. `web/js/components/chat.js` - Session switching without navigation
5. `web/js/components/sessions.js` - Use `setActiveSession()`
6. `web/js/components/new-session.js` - Connect immediately after create
7. `web/js/app.js` - Multi-session startup

**Commits:** 8 incremental commits
**Testing:** Manual integration testing checklist
