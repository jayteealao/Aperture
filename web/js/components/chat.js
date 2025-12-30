/**
 * Chat View - Timeline and Composer
 */

import { api } from '../api.js';
import { store } from '../store.js';
import { router, showToast } from '../app.js';

export function renderChat() {
  let session = store.getActiveSession();

  if (!session) {
    // No active session - try to get first available
    const sessions = store.get('sessions');
    if (sessions.length > 0) {
      store.setActiveSession(sessions[0].id);
      session = store.getActiveSession();
    } else {
      showToast('Error', 'No active session', 'error');
      router.push('/sessions');
      return document.createElement('div');
    }
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

  // Note: Connection state is now managed in store.connections[sessionId]
  // No local ws variable - use api.sendToSession() and api.isConnected()

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
    const sessionId = store.get('activeSessionId');
    if (!content || !sessionId) return;

    const conn = store.getConnection(sessionId);
    if (conn?.isStreaming) return; // Already streaming

    const toolsAllowed = container.querySelector('#tools-allowed').checked;
    const requireApprovals = container.querySelector('#require-approvals').checked;

    // Add user message to timeline
    const userMsg = {
      id: `msg-${Date.now()}`,
      role: 'user',
      content,
      timestamp: new Date().toISOString()
    };
    store.addMessage(sessionId, userMsg);
    renderMessages();

    // Clear composer
    composerInput.value = '';
    composerInput.style.height = 'auto';

    // Send via WebSocket
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
    // Extract text from ACP message content structures
    if (typeof content !== 'string') {
      content = extractTextContent(content);
    }
    // Escape HTML first
    let html = content
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    // Markdown rendering
    html = html
      // Code blocks (triple backticks) - must come before inline code
      .replace(/```(\w*)\n?([\s\S]*?)```/g, '<pre><code>$2</code></pre>')
      // Inline code
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      // Bold (** or __)
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/__([^_]+)__/g, '<strong>$1</strong>')
      // Italic (* or _) - be careful not to match inside words
      .replace(/(?<![*\w])\*([^*]+)\*(?![*\w])/g, '<em>$1</em>')
      .replace(/(?<![_\w])_([^_]+)_(?![_\w])/g, '<em>$1</em>')
      // Newlines to <br>
      .replace(/\n/g, '<br>');

    return html;
  }

  // Extract text from ACP content structures
  function extractTextContent(content) {
    if (typeof content === 'string') {
      return content;
    }

    // Handle null/undefined
    if (content == null) {
      return '';
    }

    // Handle array of content blocks
    if (Array.isArray(content)) {
      return content.map(block => extractTextContent(block)).join('\n');
    }

    // Handle object with type/text structure (ACP format)
    if (typeof content === 'object') {
      // Text block: { type: 'text', text: '...' }
      if (content.type === 'text' && typeof content.text === 'string') {
        return content.text;
      }
      // Tool use block
      if (content.type === 'tool_use') {
        return `[Tool: ${content.name || 'unknown'}]`;
      }
      // Tool result block
      if (content.type === 'tool_result') {
        if (typeof content.content === 'string') {
          return content.content;
        }
        return extractTextContent(content.content);
      }
      // Generic text property
      if (typeof content.text === 'string') {
        return content.text;
      }
      // Fallback to JSON for unknown objects
      return JSON.stringify(content, null, 2);
    }

    // Fallback for primitives
    return String(content);
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
      text = extractTextContent(text);
    }
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // Helper functions for multi-session support
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

  function updateConnectionStatus(sessionId) {
    const conn = store.getConnection(sessionId);
    const status = conn?.status || 'disconnected';

    const statusMap = {
      connected: { text: 'Connected', class: 'chip--ok' },
      connecting: { text: 'Connecting...', class: '' },
      reconnecting: { text: 'Reconnecting...', class: 'chip--warn' },
      disconnected: { text: 'Disconnected', class: 'chip--danger' },
      error: { text: 'Error', class: 'chip--danger' },
      ended: { text: 'Ended', class: 'chip--muted' }
    };

    const statusInfo = statusMap[status] || statusMap.disconnected;
    connectionStatus.textContent = statusInfo.text;
    connectionStatus.className = `chip chip--sm ${statusInfo.class}`;
    connectionStateText.textContent = conn?.error || `WebSocket ${status}`;
  }

  // WebSocket connection
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

  function handleWebSocketMessage(sessionId, data) {
    const activeSessionId = store.get('activeSessionId');

    // Handle ACP JSON-RPC format
    if (data.jsonrpc === '2.0') {
      handleAcpMessage(sessionId, data);
      return;
    }

    // Legacy format support (if any)
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

  // Handle ACP protocol messages
  function handleAcpMessage(sessionId, msg) {
    const method = msg.method;
    const params = msg.params || {};
    const activeSessionId = store.get('activeSessionId');

    // Log all ACP messages for debugging
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
      // Response to a request (e.g., session/prompt completed)
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

  // Handle session/update notifications from ACP
  function handleSessionUpdate(sessionId, params) {
    const update = params.update;
    if (!update) return;

    const updateType = update.sessionUpdate;
    const activeSessionId = store.get('activeSessionId');
    const isActive = sessionId === activeSessionId;

    switch (updateType) {
      case 'agent_message_chunk': {
        const conn = store.getConnection(sessionId);

        // Start streaming if not already
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

        // Extract text from content block
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

      case 'current_mode_update': {
        console.log('Mode changed to:', update.currentModeId);
        break;
      }

      default:
        console.log('Unknown session update type:', updateType, update);
    }
  }

  // Handle permission requests from agent
  function handlePermissionRequest(sessionId, params) {
    const { toolCallId, toolCall, options } = params;

    // Store pending approval
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

  // Handle session exit
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

  // Session list with status indicators
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
        statusText = 'active';
      } else if (conn.isStreaming) {
        statusClass = 'status-indicator--streaming';
        statusText = 'streaming';
      } else if (conn.status === 'connected') {
        statusClass = 'status-indicator--connected';
        statusText = 'connected';
      } else if (conn.status === 'reconnecting') {
        statusClass = 'status-indicator--reconnecting';
        statusText = `reconnecting (${conn.retryCount || 0})`;
      } else if (conn.status === 'error' || conn.status === 'ended') {
        statusClass = 'status-indicator--error';
        statusText = conn.status;
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
    const sessionId = store.get('activeSessionId');

    const sent = api.sendToSession(sessionId, {
      type: 'permission_response',
      toolCallId,
      optionId
    });

    if (sent) {
      // Mark as handled in store
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

  // Connection banner
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

  // Connection info
  function renderConnectionInfo() {
    const sessionId = store.get('activeSessionId');
    const conn = store.getConnection(sessionId) || {};
    const connectionInfo = container.querySelector('#connection-info');

    connectionInfo.innerHTML = `
      <div>
        <span class="kicker">Status</span>
        <div class="chip ${conn.status === 'connected' ? 'chip--ok' : 'chip--danger'}">${conn.status || 'disconnected'}</div>
      </div>
      <div>
        <span class="kicker">Server URL</span>
        <p class="mono">${store.get('serverUrl')}</p>
      </div>
      <div>
        <span class="kicker">Session ID</span>
        <p class="mono">${sessionId || 'none'}</p>
      </div>
      <div>
        <span class="kicker">Active Connections</span>
        <p class="mono">${api.connections?.size || 0} / ${api.maxConnections || 10}</p>
      </div>
      ${conn.retryCount ? `
        <div>
          <span class="kicker">Retry Count</span>
          <p class="mono meta">${conn.retryCount}</p>
        </div>
      ` : ''}
      ${conn.isStreaming ? `
        <div>
          <span class="kicker">Streaming</span>
          <p class="chip chip--accent">Active</p>
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

  container.querySelector('#new-session-rail').addEventListener('click', () => {
    router.push('/sessions');
  });

  // Store listeners
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
        renderConnectionInfo();
      }
    } else if (key === 'sessions') {
      renderSessionList();
    }
  });

  // Load messages from IndexedDB if not already in memory
  async function initializeMessages() {
    const sessionId = store.get('activeSessionId');
    const messages = store.get('messages')[sessionId];
    if (!messages || messages.length === 0) {
      await store.loadMessagesForSession(sessionId);
    }
    renderMessages();
  }

  // Initialize
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

  return container;
}
