/**
 * Sessions page - List sessions + create new session
 */

import { store } from '../store.js';
import { api } from '../api.js';
import { router, showToast } from '../app.js';
import { renderNewSessionPanel } from './new-session.js';

export function renderSessions() {
  const container = document.createElement('div');
  container.className = 'app-shell';

  container.innerHTML = `
    <div class="connection-bar">
      <div class="connection-bar__inner">
        <span class="kicker">APERTURE</span>
        <span class="connection-bar__url">${store.get('serverUrl')}</span>
        <div class="connection-bar__status">
          <div class="chip chip--muted">Ready</div>
        </div>
        <div style="flex: 1"></div>
        <button class="btn btn--sm btn--ghost" id="go-settings">Settings</button>
        <button class="btn btn--sm btn--ghost" id="go-help">Help</button>
      </div>
    </div>

    <div class="rail" id="rail">
      <div class="session-list">
        <h2 class="subtitle mb-4">Sessions</h2>
        <input
          type="search"
          class="input session-list__search"
          placeholder="Search sessions..."
          id="session-search"
        />
        <div id="session-list-items"></div>
        <button class="btn btn--primary btn--block" id="new-session-btn" style="margin-top: 16px;">
          + New Session
        </button>
      </div>
    </div>

    <div class="main" id="main">
      <div id="main-content"></div>
    </div>

    <div class="inspector" id="inspector" data-open="false">
      <div class="inspector__tabs">
        <button class="btn btn--sm btn--ghost" id="close-inspector">✕ Close</button>
      </div>
      <div class="inspector__content">
        <p class="meta">Inspector panel (events, approvals, connection)</p>
      </div>
    </div>
  `;

  // Render initial content (new session panel)
  const mainContent = container.querySelector('#main-content');
  mainContent.appendChild(renderNewSessionPanel());

  // Event listeners
  const goSettingsBtn = container.querySelector('#go-settings');
  const goHelpBtn = container.querySelector('#go-help');
  const newSessionBtn = container.querySelector('#new-session-btn');
  const closeInspectorBtn = container.querySelector('#close-inspector');
  const sessionSearch = container.querySelector('#session-search');
  const rail = container.querySelector('#rail');
  const inspector = container.querySelector('#inspector');

  goSettingsBtn.addEventListener('click', () => router.push('/settings'));
  goHelpBtn.addEventListener('click', () => router.push('/help'));

  newSessionBtn.addEventListener('click', () => {
    mainContent.innerHTML = '';
    mainContent.appendChild(renderNewSessionPanel());
  });

  closeInspectorBtn.addEventListener('click', () => {
    inspector.setAttribute('data-open', 'false');
  });

  // Load sessions
  loadSessions(container);

  // Session search
  sessionSearch.addEventListener('input', (e) => {
    const query = e.target.value.toLowerCase();
    const items = container.querySelectorAll('.session-item');

    items.forEach(item => {
      const text = item.textContent.toLowerCase();
      item.style.display = text.includes(query) ? 'flex' : 'none';
    });
  });

  // Mobile: Toggle rail
  if (window.innerWidth <= 720) {
    const toggleRailBtn = document.createElement('button');
    toggleRailBtn.className = 'btn btn--sm btn--primary';
    toggleRailBtn.textContent = '☰ Sessions';
    toggleRailBtn.style.cssText = 'position: fixed; top: 70px; left: 16px; z-index: 50;';
    toggleRailBtn.addEventListener('click', () => {
      const isOpen = rail.getAttribute('data-open') === 'true';
      rail.setAttribute('data-open', isOpen ? 'false' : 'true');
    });
    container.appendChild(toggleRailBtn);
  }

  return container;
}

async function loadSessions(container) {
  const listContainer = container.querySelector('#session-list-items');

  try {
    const { sessions } = await api.listSessions();
    store.set('sessions', sessions);

    if (sessions.length === 0) {
      listContainer.innerHTML = '<p class="meta">No sessions yet</p>';
      return;
    }

    listContainer.innerHTML = sessions.map(session => `
      <div
        class="session-item"
        role="button"
        tabindex="0"
        data-session-id="${session.id}"
      >
        <div class="status-dot" data-status="${session.status.running ? 'ok' : 'idle'}"></div>
        <div class="session-item__meta">
          <div class="cluster--s2">
            <span class="kicker">${session.id.slice(0, 8)}</span>
            <span class="chip chip--accent">${session.agent.toUpperCase()}</span>
          </div>
          <span class="meta">${session.status.authMode} • ${new Date(session.status.lastActivityTime).toLocaleTimeString()}</span>
        </div>
      </div>
    `).join('');

    // Add click handlers
    listContainer.querySelectorAll('.session-item').forEach(item => {
      item.addEventListener('click', () => {
        const sessionId = item.getAttribute('data-session-id');
        const session = sessions.find(s => s.id === sessionId);
        if (session) {
          store.set('currentSession', session);
          router.push('/chat');
        }
      });
    });
  } catch (error) {
    showToast('Error', `Failed to load sessions: ${error.message}`, 'error');
    listContainer.innerHTML = '<p class="meta">Failed to load sessions</p>';
  }
}
