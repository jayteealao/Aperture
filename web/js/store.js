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
      currentSession: null,
      sessions: [],
      messages: {},
      credentials: [],
      settings: this.loadSettings(),
      connection: {
        status: 'disconnected',
        ws: null,
        lastPing: null,
        error: null
      },
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

    // Persist to IndexedDB
    try {
      await db.saveSession(session);
      tabSync.broadcast(SyncEvents.SESSION_CREATED, session);
    } catch (error) {
      console.error('[Store] Failed to persist session:', error);
    }
  }

  async removeSession(sessionId) {
    this.set('sessions', this.state.sessions.filter(s => s.id !== sessionId));

    // Remove messages for this session
    const messages = { ...this.state.messages };
    delete messages[sessionId];
    this.set('messages', messages);

    if (this.state.currentSession?.id === sessionId) {
      this.set('currentSession', null);
    }

    // Persist to IndexedDB
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
      // Initialize database
      await db.init();

      // Restore sessions
      const sessions = await db.getAllSessions();
      if (sessions.length > 0) {
        this.state.sessions = sessions;
        console.log('[Store] Restored', sessions.length, 'sessions from IndexedDB');
      }

      // Restore last active session
      const lastSessionId = await db.getMeta('lastSessionId');
      if (lastSessionId) {
        const session = sessions.find(s => s.id === lastSessionId);
        if (session) {
          this.state.currentSession = session;

          // Restore messages for current session
          const messages = await db.getMessages(lastSessionId);
          if (messages.length > 0) {
            this.state.messages[lastSessionId] = messages;
            console.log('[Store] Restored', messages.length, 'messages for session', lastSessionId.slice(0, 8));
          }
        }
      }

      // Dispatch change event to update UI
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
      currentSession: null,
      sessions: [],
      messages: {},
      credentials: [],
      settings: this.loadSettings()
    };
    this.dispatchEvent(new CustomEvent('change', { detail: { key: 'all', value: null } }));
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
    const currentSession = store.get('currentSession');
    if (currentSession && currentSession.id === sessionId) {
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
