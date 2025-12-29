/**
 * Aperture State Store
 * Minimal reactive state management with localStorage persistence
 */

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
  addSession(session) {
    const sessions = [...this.state.sessions];
    const existing = sessions.findIndex(s => s.id === session.id);

    if (existing >= 0) {
      sessions[existing] = session;
    } else {
      sessions.push(session);
    }

    this.set('sessions', sessions);
  }

  removeSession(sessionId) {
    this.set('sessions', this.state.sessions.filter(s => s.id !== sessionId));

    // Remove messages for this session
    const messages = { ...this.state.messages };
    delete messages[sessionId];
    this.set('messages', messages);

    if (this.state.currentSession?.id === sessionId) {
      this.set('currentSession', null);
    }
  }

  addMessage(sessionId, message) {
    const messages = { ...this.state.messages };
    if (!messages[sessionId]) {
      messages[sessionId] = [];
    }
    messages[sessionId] = [...messages[sessionId], message];
    this.set('messages', messages);
  }

  updateMessage(sessionId, messageId, updates) {
    const messages = { ...this.state.messages };
    if (messages[sessionId]) {
      const index = messages[sessionId].findIndex(m => m.id === messageId);
      if (index >= 0) {
        messages[sessionId] = [...messages[sessionId]];
        messages[sessionId][index] = { ...messages[sessionId][index], ...updates };
        this.set('messages', messages);
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

  // Clear all local data
  clearAll() {
    localStorage.clear();
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

export const store = new Store();
