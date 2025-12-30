/**
 * Aperture Web Interface
 * Main entry point with router and view transitions
 */

import { store } from './store.js';
import { api } from './api.js';
import { renderConnect } from './components/connect.js';
import { renderSessions } from './components/sessions.js';
import { renderChat } from './components/chat.js';
import { renderCredentials } from './components/credentials.js';
import { renderSettings } from './components/settings.js';
import { renderHelp } from './components/help.js';

class Router {
  constructor() {
    this.routes = {
      '/': renderConnect,
      '/connect': renderConnect,
      '/sessions': renderSessions,
      '/chat': renderChat,
      '/credentials': renderCredentials,
      '/settings': renderSettings,
      '/help': renderHelp
    };

    this.currentPath = window.location.hash.slice(1) || '/';

    window.addEventListener('hashchange', () => {
      this.navigate(window.location.hash.slice(1) || '/');
    });

    window.addEventListener('popstate', () => {
      this.navigate(window.location.pathname);
    });
  }

  async navigate(path) {
    const handler = this.routes[path] || this.routes['/'];
    this.currentPath = path;

    // Use View Transitions API if available
    if (document.startViewTransition && !store.get('settings').reduceMotion) {
      document.startViewTransition(() => {
        this.render(handler);
      });
    } else {
      this.render(handler);
    }
  }

  render(handler) {
    const app = document.getElementById('app');
    const content = handler();

    // Clear and render
    app.innerHTML = '';
    if (typeof content === 'string') {
      app.innerHTML = content;
    } else {
      app.appendChild(content);
    }

    // Apply font scale from settings
    const fontScale = store.get('settings').fontScale;
    document.documentElement.style.fontSize = `${16 * fontScale}px`;
  }

  push(path) {
    window.location.hash = path;
  }
}

// Initialize router
const router = new Router();

// Bootstrap
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
        api.connectSession(session.id, handleGlobalMessage);
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

  // Apply settings
  applySettings();

  // Listen for settings changes
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

function applySettings() {
  const settings = store.get('settings');

  // Font scale
  document.documentElement.style.fontSize = `${16 * settings.fontScale}px`;

  // Reduce motion
  if (settings.reduceMotion) {
    document.documentElement.style.setProperty('--t-fast', '0ms');
    document.documentElement.style.setProperty('--t-med', '0ms');
  } else {
    document.documentElement.style.setProperty('--t-fast', '120ms');
    document.documentElement.style.setProperty('--t-med', '180ms');
  }
}

// Toast utility
export function showToast(title, message, type = 'info') {
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.setAttribute('data-type', type);

  toast.innerHTML = `
    <div class="toast__title">${title}</div>
    <div class="toast__body">${message}</div>
  `;

  document.body.appendChild(toast);

  setTimeout(() => {
    toast.remove();
  }, 5000);
}

// Export router for use in components
export { router };

// Initialize on DOM ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
