/**
 * Aperture State Store
 * Minimal reactive state management with localStorage persistence
 */

import { db } from './db.js';
import { tabSync, SyncEvents } from './sync.js';

class Store extends EventTarget {
  constructor() {
    super();
    this.state = {
      serverUrl: localStorage.getItem('aperture:serverUrl') || 'http://localhost:8080',
      apiToken: localStorage.getItem('aperture:apiToken') || '',
      activeSessionId: null,  // replaces currentSession
      sessions: [],
      messages: {},
      connections: {},  // per-session connection state
      credentials: [],
      settings: this.loadSettings(),
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

  loadSettings() {
    const defaults = {
      reduceMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
      fontScale: 1,
      saveTranscripts: false
    };

    try {
      const saved = localStorage.getItem('aperture:settings');
      return saved ? { ...defaults, ...JSON.parse(saved) } : defaults;
    } catch {
      return defaults;
    }
  }

  get(key) {
    return key ? this.state[key] : this.state;
  }

  set(key, value) {
    const oldValue = this.state[key];
    this.state[key] = value;

    // Persist certain values
    if (key === 'serverUrl') {
      localStorage.setItem('aperture:serverUrl', value);
    } else if (key === 'apiToken') {
      localStorage.setItem('aperture:apiToken', value);
    } else if (key === 'settings') {
      localStorage.setItem('aperture:settings', JSON.stringify(value));
    }

    this.dispatchEvent(new CustomEvent('change', {
      detail: { key, value, oldValue }
    }));
  }

  update(key, updater) {
    const current = this.get(key);
    const updated = typeof updater === 'function' ? updater(current) : updater;
    this.set(key, updated);
  }

  // Session helpers
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

  async addMessage(sessionId, message) {
    const messages = { ...this.state.messages };
    if (!messages[sessionId]) {
      messages[sessionId] = [];
    }
    messages[sessionId] = [...messages[sessionId], message];
    this.set('messages', messages);

    // Persist to IndexedDB
    try {
      await db.saveMessage(sessionId, message);
      await db.updateSessionActivity(sessionId);
      tabSync.broadcast(SyncEvents.MESSAGE_ADDED, { sessionId, message });
    } catch (error) {
      console.error('[Store] Failed to persist message:', error);
    }
  }

  async updateMessage(sessionId, messageId, updates) {
    const messages = { ...this.state.messages };
    if (messages[sessionId]) {
      const index = messages[sessionId].findIndex(m => m.id === messageId);
      if (index >= 0) {
        messages[sessionId] = [...messages[sessionId]];
        messages[sessionId][index] = { ...messages[sessionId][index], ...updates };
        this.set('messages', messages);

        // Persist to IndexedDB
        try {
          await db.updateMessage(sessionId, messageId, updates);
          tabSync.broadcast(SyncEvents.MESSAGE_UPDATED, { sessionId, messageId, updates });
        } catch (error) {
          console.error('[Store] Failed to update message in DB:', error);
        }
      }
    }
  }

  // Inspector helpers
  addEvent(event) {
    const events = [...this.state.inspector.events, event];
    this.update('inspector', inspector => ({ ...inspector, events }));
  }

  clearEvents() {
    this.update('inspector', inspector => ({ ...inspector, events: [] }));
  }

  // Restore state from IndexedDB
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

  // Load messages for a session from IndexedDB
  async loadMessagesForSession(sessionId) {
    try {
      const messages = await db.getMessages(sessionId);
      if (messages.length > 0) {
        const allMessages = { ...this.state.messages };
        allMessages[sessionId] = messages;
        this.set('messages', allMessages);
        console.log('[Store] Loaded', messages.length, 'messages for session', sessionId.slice(0, 8));
      }
    } catch (error) {
      console.error('[Store] Failed to load messages:', error);
    }
  }

  // Save current session ID to metadata
  async saveCurrentSessionId(sessionId) {
    try {
      await db.setMeta('lastSessionId', sessionId);
    } catch (error) {
      console.error('[Store] Failed to save current session ID:', error);
    }
  }

  // Clear all local data
  async clearAll() {
    localStorage.clear();

    try {
      await db.clearAll();
      tabSync.broadcast(SyncEvents.DB_CLEARED, {});
    } catch (error) {
      console.error('[Store] Failed to clear IndexedDB:', error);
    }

    this.state = {
      ...this.state,
      serverUrl: 'http://localhost:8080',
      apiToken: '',
      activeSessionId: null,
      sessions: [],
      messages: {},
      connections: {},
      credentials: [],
      settings: this.loadSettings()
    };
    this.dispatchEvent(new CustomEvent('change', { detail: { key: 'all', value: null } }));
  }

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
}

// Initialize tab sync listeners
function initTabSyncListeners(store) {
  tabSync.on(SyncEvents.SESSION_CREATED, (session) => {
    console.log('[Sync] Session created in another tab:', session.id);
    store.addSession(session);
  });

  tabSync.on(SyncEvents.SESSION_DELETED, ({ sessionId }) => {
    console.log('[Sync] Session deleted in another tab:', sessionId);
    store.removeSession(sessionId);
  });

  tabSync.on(SyncEvents.MESSAGE_ADDED, ({ sessionId, message }) => {
    console.log('[Sync] Message added in another tab');
    // Only update if this session is active
    const activeSessionId = store.get('activeSessionId');
    if (activeSessionId === sessionId) {
      const messages = { ...store.state.messages };
      if (!messages[sessionId]) {
        messages[sessionId] = [];
      }
      messages[sessionId] = [...messages[sessionId], message];
      store.set('messages', messages);
    }
  });

  tabSync.on(SyncEvents.DB_CLEARED, () => {
    console.log('[Sync] Database cleared in another tab');
    store.clearAll();
  });
}

const storeInstance = new Store();
initTabSyncListeners(storeInstance);

export const store = storeInstance;
