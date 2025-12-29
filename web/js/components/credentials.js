/**
 * Credentials Vault - Manage stored API keys
 */

import { api } from '../api.js';
import { store } from '../store.js';
import { router, showToast } from '../app.js';

export function renderCredentials() {
  const container = document.createElement('div');
  container.className = 'loading-screen';

  container.innerHTML = `
    <div class="surface surface--heavy" style="max-width: 800px; width: calc(100vw - 32px);">
      <div class="cluster mb-6">
        <button class="btn btn--ghost btn--sm" id="back-btn">← Back</button>
        <h1 class="title">CREDENTIALS</h1>
        <div></div>
      </div>

      <div class="stack">
        <div class="stack--s3">
          <p class="body">
            Store API keys securely on the server. They will be encrypted at rest and can be referenced by ID when creating sessions.
          </p>
          <p class="meta">
            ⚠️ Keys are stored server-side. Deleting a credential will not affect active sessions using it.
          </p>
        </div>

        <div class="rule"></div>

        <div id="credentials-list"></div>

        <div class="rule"></div>

        <details>
          <summary class="kicker" style="cursor: pointer; margin-bottom: 16px;">+ Add New Credential</summary>
          <div class="stack">
            <div class="stack--s3">
              <label class="kicker" for="cred-label">Label</label>
              <input
                type="text"
                id="cred-label"
                class="input"
                placeholder="My API Key"
              />
            </div>

            <div class="stack--s3">
              <label class="kicker" for="cred-provider">Provider</label>
              <select class="select" id="cred-provider">
                <option value="">-- Select Provider --</option>
                <option value="anthropic">Anthropic (Claude)</option>
                <option value="openai">OpenAI (Codex)</option>
                <option value="google">Google (Gemini)</option>
              </select>
            </div>

            <div class="stack--s3">
              <label class="kicker" for="cred-key">API Key</label>
              <input
                type="password"
                id="cred-key"
                class="input"
                placeholder="sk-..."
              />
            </div>

            <button class="btn btn--primary" id="add-credential-btn">
              Add Credential
            </button>
          </div>
        </details>
      </div>
    </div>
  `;

  const credentialsList = container.querySelector('#credentials-list');
  const addBtn = container.querySelector('#add-credential-btn');
  const backBtn = container.querySelector('#back-btn');

  async function loadCredentials() {
    credentialsList.innerHTML = '<p class="meta">Loading...</p>';

    try {
      const { credentials } = await api.listCredentials();
      store.set('credentials', credentials);
      renderCredentialsList(credentials);
    } catch (error) {
      credentialsList.innerHTML = `<p class="meta chip chip--danger">Failed to load: ${error.message}</p>`;
    }
  }

  function renderCredentialsList(credentials) {
    if (credentials.length === 0) {
      credentialsList.innerHTML = '<p class="meta">No credentials stored</p>';
      return;
    }

    credentialsList.innerHTML = `
      <div class="stack--s3">
        <h3 class="kicker">Stored Credentials</h3>
        <div class="stack--s4">
          ${credentials.map(cred => `
            <div class="credential-card" data-id="${cred.id}">
              <div class="credential-card__header">
                <div>
                  <div class="subtitle">${cred.label}</div>
                  <div class="meta">${cred.provider}</div>
                </div>
                <button class="btn btn--ghost btn--sm" data-action="delete" data-id="${cred.id}">
                  Delete
                </button>
              </div>
              <div class="mono meta">ID: ${cred.id}</div>
              ${cred.createdAt ? `<div class="meta">Created: ${new Date(cred.createdAt).toLocaleString()}</div>` : ''}
            </div>
          `).join('')}
        </div>
      </div>
    `;

    // Attach delete handlers
    credentialsList.querySelectorAll('[data-action="delete"]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.id;
        const cred = credentials.find(c => c.id === id);

        if (confirm(`Delete credential "${cred.label}"? This cannot be undone.`)) {
          try {
            await api.deleteCredential(id);
            showToast('Success', 'Credential deleted', 'success');
            loadCredentials();
          } catch (error) {
            showToast('Error', `Failed to delete: ${error.message}`, 'error');
          }
        }
      });
    });
  }

  addBtn.addEventListener('click', async () => {
    const label = container.querySelector('#cred-label').value.trim();
    const provider = container.querySelector('#cred-provider').value;
    const key = container.querySelector('#cred-key').value.trim();

    if (!label) {
      showToast('Error', 'Label is required', 'error');
      return;
    }

    if (!provider) {
      showToast('Error', 'Provider is required', 'error');
      return;
    }

    if (!key) {
      showToast('Error', 'API key is required', 'error');
      return;
    }

    addBtn.disabled = true;
    addBtn.textContent = 'Adding...';

    try {
      await api.storeCredential(provider, label, key);
      showToast('Success', 'Credential added', 'success');

      // Clear form
      container.querySelector('#cred-label').value = '';
      container.querySelector('#cred-provider').value = '';
      container.querySelector('#cred-key').value = '';

      // Reload list
      loadCredentials();
    } catch (error) {
      showToast('Error', `Failed to add: ${error.message}`, 'error');
    } finally {
      addBtn.disabled = false;
      addBtn.textContent = 'Add Credential';
    }
  });

  backBtn.addEventListener('click', () => {
    router.push('/sessions');
  });

  loadCredentials();

  return container;
}
