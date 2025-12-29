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
  // Configure API client
  const serverUrl = store.get('serverUrl');
  const apiToken = store.get('apiToken');

  if (serverUrl) {
    api.configure(serverUrl, apiToken);
  }

  // Navigate to initial route
  await router.navigate(router.currentPath);

  // Apply settings
  applySettings();

  // Listen for settings changes
  store.addEventListener('change', (event) => {
    if (event.detail.key === 'settings') {
      applySettings();
    }
  });
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
