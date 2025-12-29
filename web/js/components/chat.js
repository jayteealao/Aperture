/**
 * Chat View - Timeline and Composer
 */

import { api } from '../api.js';
import { store } from '../store.js';
import { router, showToast } from '../app.js';

export function renderChat() {
  const session = store.get('currentSession');

  if (!session) {
    showToast('Error', 'No active session', 'error');
    router.push('/sessions');
    return document.createElement('div');
  }

  const container = document.createElement('div');
  container.className = 'app-shell';

  container.innerHTML = `
    <div class="connection-banner" id="connection-banner" style="display: none;"></div>

    <div class="connection-bar" id="connection-bar">
      <div class="cluster cluster--xs">
        <button class="btn btn--ghost btn--sm" id="toggle-rail">☰</button>
        <div class="connection-bar__status">
          <span class="chip chip--sm" id="connection-status">Connecting...</span>
        </div>
      </div>
      <div class="connection-bar__session">
        <span class="kicker">Session</span>
        <span class="mono">${session.id.slice(0, 8)}</span>
        <span class="meta">${session.agent}</span>
      </div>
      <div class="cluster cluster--xs">
        <button class="btn btn--ghost btn--sm" id="toggle-inspector">Inspector</button>
        <button class="btn btn--ghost btn--sm" id="end-session">End</button>
      </div>
    </div>

    <div class="rail" id="rail" data-open="false">
      <div class="session-list">
        <div class="cluster mb-4">
          <h3 class="kicker">Sessions</h3>
          <button class="btn btn--ghost btn--sm" id="new-session-rail">+</button>
        </div>
        <input
          type="search"
          class="input mb-4"
          id="session-search"
          placeholder="Search..."
        />
        <div id="session-list-items"></div>
      </div>
    </div>

    <div class="main" id="main">
      <div class="chat-timeline" id="chat-timeline">
        <div class="chat-timeline__empty">
          <div class="kicker">Ready</div>
          <p class="meta">Send a message to start the conversation</p>
        </div>
      </div>
      <div class="composer" id="composer">
        <div class="composer__connection-state">
          <span class="mono meta" id="connection-state-text">WebSocket connected</span>
        </div>
        <div class="composer__input-area">
          <textarea
            class="composer__textarea"
            id="composer-input"
            placeholder="Type your message..."
            rows="1"
          ></textarea>
          <button class="btn btn--primary btn--lg" id="send-btn">
            Send
          </button>
        </div>
        <div class="composer__controls">
          <label class="checkbox-label">
            <input type="checkbox" id="tools-allowed" checked />
            <span class="kicker">Tools</span>
          </label>
          <label class="checkbox-label">
            <input type="checkbox" id="require-approvals" />
            <span class="kicker">Require Approvals</span>
          </label>
        </div>
      </div>
    </div>

    <div class="inspector" id="inspector" data-open="false">
      <div class="inspector__header">
        <h3 class="kicker">Inspector</h3>
        <button class="btn btn--ghost btn--sm" id="close-inspector">×</button>
      </div>
      <div class="tabs" id="inspector-tabs">
        <button class="tab" data-tab="events" aria-selected="true">Events</button>
        <button class="tab" data-tab="approvals">Approvals</button>
        <button class="tab" data-tab="connection">Connection</button>
      </div>
      <div class="inspector__content" id="inspector-content">
        <div class="tab-panel" data-panel="events">
          <div class="cluster mb-4">
            <button class="btn btn--ghost btn--sm" id="clear-events">Clear</button>
          </div>
          <div id="events-list"></div>
        </div>
        <div class="tab-panel" data-panel="approvals" hidden>
          <div id="approvals-list">
            <p class="meta">No pending approvals</p>
          </div>
        </div>
        <div class="tab-panel" data-panel="connection" hidden>
          <div class="stack--s3" id="connection-info"></div>
        </div>
      </div>
    </div>
  `;

  // DOM references
  const connectionBanner = container.querySelector('#connection-banner');
  const rail = container.querySelector('#rail');
  const inspector = container.querySelector('#inspector');
  const timeline = container.querySelector('#chat-timeline');
  const composerInput = container.querySelector('#composer-input');
  const sendBtn = container.querySelector('#send-btn');
  const connectionStatus = container.querySelector('#connection-status');
  const connectionStateText = container.querySelector('#connection-state-text');
  const sessionListItems = container.querySelector('#session-list-items');
  const eventsList = container.querySelector('#events-list');
  const inspectorContent = container.querySelector('#inspector-content');
  const inspectorTabs = container.querySelector('#inspector-tabs');

  // State
  let ws = null;
  let isStreaming = false;
  let currentStreamMessageId = null;

  // Auto-grow textarea
  composerInput.addEventListener('input', () => {
    composerInput.style.height = 'auto';
    composerInput.style.height = composerInput.scrollHeight + 'px';
  });

  // Keyboard handling: Enter = send, Shift+Enter = newline
  composerInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  sendBtn.addEventListener('click', sendMessage);

  async function sendMessage() {
    const content = composerInput.value.trim();
    if (!content || isStreaming) return;

    const toolsAllowed = container.querySelector('#tools-allowed').checked;
    const requireApprovals = container.querySelector('#require-approvals').checked;

    // Add user message to timeline
    const userMsg = {
      id: `msg-${Date.now()}`,
      role: 'user',
      content,
      timestamp: new Date().toISOString()
    };
    store.addMessage(session.id, userMsg);
    renderMessages();

    // Clear composer
    composerInput.value = '';
    composerInput.style.height = 'auto';

    // Send via WebSocket
    try {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          type: 'user_message',
          content,
          toolsAllowed,
          requireApprovals
        }));
      } else {
        throw new Error('WebSocket not connected');
      }
    } catch (error) {
      showToast('Error', `Failed to send: ${error.message}`, 'error');
    }
  }

  function renderMessages() {
    const messages = store.get('messages')[session.id] || [];

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

    // Scroll to bottom
    timeline.scrollTop = timeline.scrollHeight;

    // Attach action listeners
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

  function formatContent(content) {
    if (typeof content !== 'string') {
      content = JSON.stringify(content, null, 2);
    }
    // Basic markdown-like formatting
    return content
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\n/g, '<br>')
      .replace(/`([^`]+)`/g, '<code>$1</code>');
  }

  function formatTime(timestamp) {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });
  }

  function escapeHtml(text) {
    if (typeof text !== 'string') {
      text = JSON.stringify(text);
    }
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // WebSocket connection
  async function connectWebSocket() {
    try {
      connectionStatus.textContent = 'Connecting...';
      connectionStatus.className = 'chip chip--sm';
      connectionStateText.textContent = 'Establishing WebSocket connection...';

      ws = await api.connectWebSocket(session.id, handleWebSocketMessage);

      connectionStatus.textContent = 'Connected';
      connectionStatus.className = 'chip chip--sm chip--ok';
      connectionStateText.textContent = 'WebSocket connected';

    } catch (error) {
      connectionStatus.textContent = 'Disconnected';
      connectionStatus.className = 'chip chip--sm chip--danger';
      connectionStateText.textContent = `Error: ${error.message}`;
      showToast('Connection Error', error.message, 'error');
    }
  }

  function handleWebSocketMessage(data) {
    // Handle ACP JSON-RPC format
    if (data.jsonrpc === '2.0') {
      handleAcpMessage(data);
      return;
    }

    // Legacy format support (if any)
    if (data.type === 'error') {
      showToast('Error', data.message || 'Unknown error', 'error');
      store.addEvent({
        timestamp: Date.now(),
        type: 'error',
        data
      });
      renderEvents();
    }
  }

  // Handle ACP protocol messages
  function handleAcpMessage(msg) {
    const method = msg.method;
    const params = msg.params || {};

    // Log all ACP messages for debugging
    store.addEvent({
      timestamp: Date.now(),
      type: method || 'response',
      data: msg
    });
    renderEvents();

    if (method === 'session/update') {
      handleSessionUpdate(params);
    } else if (method === 'session/request_permission') {
      handlePermissionRequest(params);
    } else if (method === 'session/exit') {
      handleSessionExit(params);
    } else if (method === 'session/error') {
      showToast('Error', params.message || 'Unknown error', 'error');
    } else if (msg.result) {
      // Response to a request (e.g., session/prompt completed)
      if (msg.result.stopReason) {
        isStreaming = false;
        currentStreamMessageId = null;
        renderMessages();
      }
    } else if (msg.error) {
      showToast('Error', msg.error.message || 'Unknown error', 'error');
    }
  }

  // Handle session/update notifications from ACP
  function handleSessionUpdate(params) {
    const update = params.update;
    if (!update) return;

    const updateType = update.sessionUpdate;

    switch (updateType) {
      case 'agent_message_chunk': {
        // Start streaming if not already
        if (!isStreaming) {
          isStreaming = true;
          currentStreamMessageId = `msg-${Date.now()}`;
          store.addMessage(session.id, {
            id: currentStreamMessageId,
            role: 'assistant',
            content: '',
            timestamp: new Date().toISOString()
          });
        }

        // Extract text from content block
        const content = update.content;
        if (content && content.type === 'text' && content.text) {
          const messages = store.get('messages')[session.id] || [];
          const currentMsg = messages.find(m => m.id === currentStreamMessageId);
          if (currentMsg) {
            store.updateMessage(session.id, currentStreamMessageId, {
              content: currentMsg.content + content.text
            });
          }
        }
        renderMessages();
        break;
      }

      case 'agent_thought_chunk': {
        // Could display thoughts differently, for now treat like message
        const content = update.content;
        if (content && content.type === 'text' && content.text) {
          // Optionally log thoughts
          console.log('Agent thought:', content.text);
        }
        break;
      }

      case 'tool_call': {
        // New tool call started
        store.addEvent({
          timestamp: Date.now(),
          type: 'tool_call',
          data: {
            toolCallId: update.toolCallId,
            title: update.title,
            kind: update.kind,
            status: update.status
          }
        });
        renderEvents();
        break;
      }

      case 'tool_call_update': {
        // Tool call status update
        store.addEvent({
          timestamp: Date.now(),
          type: 'tool_call_update',
          data: {
            toolCallId: update.toolCallId,
            title: update.title,
            kind: update.kind,
            status: update.status,
            content: update.content
          }
        });
        renderEvents();
        break;
      }

      case 'plan': {
        // Agent planning
        store.addEvent({
          timestamp: Date.now(),
          type: 'plan',
          data: update.entries
        });
        renderEvents();
        break;
      }

      case 'current_mode_update': {
        // Mode changed
        console.log('Mode changed to:', update.currentModeId);
        break;
      }

      default:
        console.log('Unknown session update type:', updateType, update);
    }
  }

  // Handle permission requests from agent
  function handlePermissionRequest(params) {
    const { toolCallId, toolCall, options } = params;

    // Store pending approval
    store.addEvent({
      timestamp: Date.now(),
      type: 'permission_request',
      data: {
        toolCallId,
        toolCall,
        options,
        pending: true
      }
    });

    // Show in approvals tab
    renderApprovals();

    // Switch to approvals tab
    switchTab('approvals');
    inspector.setAttribute('data-open', 'true');
  }

  // Handle session exit
  function handleSessionExit(params) {
    isStreaming = false;
    currentStreamMessageId = null;
    showToast('Session Ended', `Exit code: ${params.code}`, 'info');
    connectionStatus.textContent = 'Disconnected';
    connectionStatus.className = 'chip chip--sm chip--danger';
  }

  // Session list
  function renderSessionList() {
    const sessions = store.get('sessions');
    const currentId = session.id;

    if (sessions.length === 0) {
      sessionListItems.innerHTML = '<p class="meta">No sessions</p>';
      return;
    }

    sessionListItems.innerHTML = sessions.map(s => `
      <div class="session-card ${s.id === currentId ? 'session-card--active' : ''}" data-id="${s.id}">
        <div class="session-card__header">
          <span class="kicker">${s.agent}</span>
          <span class="mono meta">${s.id.slice(0, 8)}</span>
        </div>
        <div class="meta">${s.status || 'active'}</div>
      </div>
    `).join('');

    sessionListItems.querySelectorAll('.session-card').forEach(card => {
      card.addEventListener('click', () => {
        const sessionId = card.dataset.id;
        const targetSession = sessions.find(s => s.id === sessionId);
        if (targetSession) {
          store.set('currentSession', targetSession);
          // Close WebSocket and reload
          if (ws) ws.close();
          router.push('/chat');
        }
      });
    });
  }

  // Inspector tabs
  function switchTab(tabName) {
    inspectorTabs.querySelectorAll('.tab').forEach(tab => {
      tab.setAttribute('aria-selected', tab.dataset.tab === tabName ? 'true' : 'false');
    });

    inspectorContent.querySelectorAll('.tab-panel').forEach(panel => {
      panel.hidden = panel.dataset.panel !== tabName;
    });

    store.update('inspector', inspector => ({ ...inspector, activeTab: tabName }));
  }

  inspectorTabs.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => switchTab(tab.dataset.tab));
  });

  // Events rendering
  function renderEvents() {
    const events = store.get('inspector').events;

    if (events.length === 0) {
      eventsList.innerHTML = '<p class="meta">No events yet</p>';
      return;
    }

    eventsList.innerHTML = events.slice().reverse().map(event => `
      <details class="event-item">
        <summary class="event-item__summary">
          <span class="mono meta">${formatTime(new Date(event.timestamp).toISOString())}</span>
          <span class="kicker">${event.type}</span>
        </summary>
        <pre class="mono event-item__data">${JSON.stringify(event.data, null, 2)}</pre>
      </details>
    `).join('');
  }

  container.querySelector('#clear-events').addEventListener('click', () => {
    store.clearEvents();
    renderEvents();
  });

  // Approvals rendering (ACP permission_request format)
  function renderApprovals() {
    const approvalsList = container.querySelector('#approvals-list');
    const events = store.get('inspector').events;
    // Filter for pending ACP permission requests
    const pendingApprovals = events.filter(e =>
      e.type === 'permission_request' && e.data.pending
    );

    if (pendingApprovals.length === 0) {
      approvalsList.innerHTML = '<p class="meta">No pending approvals</p>';
      return;
    }

    approvalsList.innerHTML = pendingApprovals.map(approval => {
      const { toolCallId, toolCall, options } = approval.data;
      const title = toolCall?.title || 'Tool Call';

      // Render options as buttons
      const optionButtons = (options || []).map(opt => {
        const isAllow = opt.kind?.includes('allow');
        const btnClass = isAllow ? 'btn--primary' : 'btn--secondary';
        return `<button class="btn ${btnClass} btn--sm" data-action="select-option" data-option-id="${opt.optionId}">${opt.name}</button>`;
      }).join('');

      return `
        <div class="approval-card" data-tool-call-id="${toolCallId}">
          <div class="kicker mb-2">${title}</div>
          ${toolCall?.rawInput ? `<pre class="mono mb-4" style="font-size: 12px;">${JSON.stringify(toolCall.rawInput, null, 2)}</pre>` : ''}
          <div class="cluster">
            ${optionButtons || `
              <button class="btn btn--primary btn--sm" data-action="approve">Approve</button>
              <button class="btn btn--secondary btn--sm" data-action="deny">Deny</button>
            `}
          </div>
        </div>
      `;
    }).join('');

    // Handle option selection
    approvalsList.querySelectorAll('[data-action="select-option"]').forEach(btn => {
      btn.addEventListener('click', () => {
        const card = btn.closest('.approval-card');
        const toolCallId = card.dataset.toolCallId;
        const optionId = btn.dataset.optionId;
        handlePermissionResponse(toolCallId, optionId);
      });
    });

    // Fallback approve/deny buttons
    approvalsList.querySelectorAll('[data-action="approve"]').forEach(btn => {
      btn.addEventListener('click', () => {
        const card = btn.closest('.approval-card');
        const toolCallId = card.dataset.toolCallId;
        // Find allow_once option or use first allow option
        const events = store.get('inspector').events;
        const permEvent = events.find(e => e.data.toolCallId === toolCallId);
        const allowOption = permEvent?.data.options?.find(o => o.kind === 'allow_once')
          || permEvent?.data.options?.find(o => o.kind?.includes('allow'));
        handlePermissionResponse(toolCallId, allowOption?.optionId || 'allow');
      });
    });

    approvalsList.querySelectorAll('[data-action="deny"]').forEach(btn => {
      btn.addEventListener('click', () => {
        const card = btn.closest('.approval-card');
        const toolCallId = card.dataset.toolCallId;
        handlePermissionResponse(toolCallId, null); // null = cancel
      });
    });
  }

  function handlePermissionResponse(toolCallId, optionId) {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'permission_response',
        toolCallId,
        optionId // null means cancel/deny
      }));

      // Mark as handled in store
      const events = store.get('inspector').events;
      const eventIdx = events.findIndex(e => e.data.toolCallId === toolCallId);
      if (eventIdx >= 0) {
        events[eventIdx].data.pending = false;
        events[eventIdx].data.response = optionId ? 'approved' : 'denied';
      }

      showToast('Sent', optionId ? 'Permission granted' : 'Permission denied', 'success');
      renderApprovals();
    }
  }

  // Connection banner
  function renderConnectionBanner() {
    const conn = store.get('connection');

    if (conn.status === 'reconnecting') {
      connectionBanner.innerHTML = `
        <div style="background: #f59e0b; color: white; padding: 12px; text-align: center;">
          <span>Reconnecting... (attempt ${conn.retryCount || 0})</span>
          <button class="btn btn--sm" style="margin-left: 12px;" onclick="location.reload()">Reload Page</button>
        </div>
      `;
      connectionBanner.style.display = 'block';
    } else if (conn.status === 'failed') {
      connectionBanner.innerHTML = `
        <div style="background: #dc2626; color: white; padding: 12px; text-align: center;">
          <span>Connection lost: ${conn.error || 'Unknown error'}</span>
          <button class="btn btn--sm" style="margin-left: 12px;" onclick="location.hash = '/sessions'">Back to Sessions</button>
        </div>
      `;
      connectionBanner.style.display = 'block';
    } else {
      connectionBanner.style.display = 'none';
    }
  }

  // Connection info
  function renderConnectionInfo() {
    const conn = store.get('connection');
    const connectionInfo = container.querySelector('#connection-info');

    connectionInfo.innerHTML = `
      <div>
        <span class="kicker">Status</span>
        <div class="chip ${conn.status === 'connected' ? 'chip--ok' : 'chip--danger'}">${conn.status}</div>
      </div>
      <div>
        <span class="kicker">Server URL</span>
        <p class="mono">${store.get('serverUrl')}</p>
      </div>
      <div>
        <span class="kicker">Session ID</span>
        <p class="mono">${session.id}</p>
      </div>
      ${conn.retryCount ? `
        <div>
          <span class="kicker">Retry Count</span>
          <p class="mono meta">${conn.retryCount}</p>
        </div>
      ` : ''}
      ${conn.lastPing ? `
        <div>
          <span class="kicker">Last Ping</span>
          <p class="mono meta">${new Date(conn.lastPing).toLocaleTimeString()}</p>
        </div>
      ` : ''}
      ${conn.error ? `
        <div>
          <span class="kicker">Error</span>
          <p class="meta chip chip--danger">${conn.error}</p>
        </div>
      ` : ''}
    `;
  }

  // UI toggles
  container.querySelector('#toggle-rail').addEventListener('click', () => {
    const isOpen = rail.getAttribute('data-open') === 'true';
    rail.setAttribute('data-open', isOpen ? 'false' : 'true');
    store.update('rail', r => ({ ...r, open: !isOpen }));
  });

  container.querySelector('#toggle-inspector').addEventListener('click', () => {
    const isOpen = inspector.getAttribute('data-open') === 'true';
    inspector.setAttribute('data-open', isOpen ? 'false' : 'true');
    store.update('inspector', i => ({ ...i, open: !isOpen }));
  });

  container.querySelector('#close-inspector').addEventListener('click', () => {
    inspector.setAttribute('data-open', 'false');
    store.update('inspector', i => ({ ...i, open: false }));
  });

  container.querySelector('#end-session').addEventListener('click', async () => {
    if (confirm('End this session? Messages will be lost.')) {
      try {
        if (ws) ws.close();
        await api.deleteSession(session.id);
        store.removeSession(session.id);
        showToast('Success', 'Session ended', 'success');
        router.push('/sessions');
      } catch (error) {
        showToast('Error', `Failed to end session: ${error.message}`, 'error');
      }
    }
  });

  container.querySelector('#new-session-rail').addEventListener('click', () => {
    router.push('/sessions');
  });

  // Store listeners
  store.addEventListener('change', (event) => {
    const { key } = event.detail;

    if (key === 'messages') {
      renderMessages();
    } else if (key === 'inspector') {
      renderEvents();
      renderApprovals();
      renderConnectionInfo();
    } else if (key === 'connection') {
      renderConnectionInfo();
      renderConnectionBanner();
    } else if (key === 'sessions') {
      renderSessionList();
    }
  });

  // Load messages from IndexedDB if not already in memory
  async function initializeMessages() {
    const messages = store.get('messages')[session.id];
    if (!messages || messages.length === 0) {
      await store.loadMessagesForSession(session.id);
    }
    renderMessages();
  }

  // Initialize
  (async () => {
    // Save current session ID for restoration
    await store.saveCurrentSessionId(session.id);

    // Load messages
    await initializeMessages();

    renderSessionList();
    renderEvents();
    renderApprovals();
    renderConnectionInfo();
    connectWebSocket();
  })();

  return container;
}
