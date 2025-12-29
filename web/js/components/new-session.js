/**
 * New Session Panel - Agent picker and auth configuration
 */

import { api } from '../api.js';
import { store } from '../store.js';
import { router, showToast } from '../app.js';

export function renderNewSessionPanel() {
  const container = document.createElement('div');
  container.className = 'new-session-panel';

  container.innerHTML = `
    <h2 class="title mb-6">NEW SESSION</h2>

    <div class="stack">
      <div class="stack--s3">
        <h3 class="kicker">Select Agent</h3>
        <div class="agent-picker" id="agent-picker">
          <div class="agent-card" role="button" tabindex="0" data-agent="claude_code">
            <div class="subtitle">CLAUDE</div>
            <div class="meta">Code AI</div>
          </div>
          <div class="agent-card" role="button" tabindex="0" data-agent="codex">
            <div class="subtitle">CODEX</div>
            <div class="meta">OpenAI</div>
          </div>
          <div class="agent-card" role="button" tabindex="0" data-agent="gemini">
            <div class="subtitle">GEMINI</div>
            <div class="meta">Google AI</div>
          </div>
        </div>
      </div>

      <div class="stack--s3">
        <h3 class="kicker">Auth Mode</h3>
        <select class="select" id="auth-mode">
          <option value="">-- Select --</option>
        </select>
      </div>

      <div id="auth-options"></div>

      <details>
        <summary class="kicker" style="cursor: pointer; margin-bottom: 8px;">Advanced Options</summary>
        <div class="stack--s3">
          <label class="kicker" for="env-vars">Environment Variables (JSON)</label>
          <textarea
            class="textarea"
            id="env-vars"
            placeholder='{"KEY": "value"}'
            rows="3"
          ></textarea>
        </div>
      </details>

      <button class="btn btn--primary btn--block btn--lg" id="create-session">
        Create Session
      </button>
    </div>
  `;

  // State
  let selectedAgent = null;
  let selectedAuthMode = null;

  // Agent picker
  const agentCards = container.querySelectorAll('.agent-card');
  const authModeSelect = container.querySelector('#auth-mode');
  const authOptions = container.querySelector('#auth-options');
  const createBtn = container.querySelector('#create-session');

  agentCards.forEach(card => {
    card.addEventListener('click', () => {
      agentCards.forEach(c => c.removeAttribute('aria-selected'));
      card.setAttribute('aria-selected', 'true');
      selectedAgent = card.getAttribute('data-agent');
      updateAuthModeOptions();
    });
  });

  function updateAuthModeOptions() {
    authOptions.innerHTML = '';
    selectedAuthMode = null;

    const options = {
      claude_code: [
        { value: 'interactive', label: 'Interactive (Subscription)' },
        { value: 'api_key', label: 'API Key' }
      ],
      codex: [
        { value: 'api_key', label: 'API Key (Recommended)' },
        { value: 'interactive', label: 'Interactive (Local Only)' }
      ],
      gemini: [
        { value: 'api_key', label: 'API Key' },
        { value: 'oauth', label: 'OAuth (Google Login)' },
        { value: 'vertex', label: 'Vertex AI (Google Cloud)' }
      ]
    };

    authModeSelect.innerHTML = '<option value="">-- Select Auth Mode --</option>';

    if (selectedAgent && options[selectedAgent]) {
      options[selectedAgent].forEach(opt => {
        const option = document.createElement('option');
        option.value = opt.value;
        option.textContent = opt.label;
        authModeSelect.appendChild(option);
      });
    }
  }

  authModeSelect.addEventListener('change', (e) => {
    selectedAuthMode = e.target.value;
    renderAuthOptions();
  });

  function renderAuthOptions() {
    authOptions.innerHTML = '';

    if (!selectedAuthMode || selectedAuthMode === 'interactive' || selectedAuthMode === 'oauth') {
      return; // No extra options needed
    }

    if (selectedAuthMode === 'api_key') {
      authOptions.innerHTML = `
        <div class="stack--s3">
          <h4 class="kicker">API Key Source</h4>
          <select class="select" id="api-key-ref">
            <option value="inline">Inline (paste below)</option>
            <option value="stored">Stored Credential</option>
          </select>
        </div>
        <div id="api-key-input-wrap"></div>
      `;

      const apiKeyRefSelect = authOptions.querySelector('#api-key-ref');
      const apiKeyInputWrap = authOptions.querySelector('#api-key-input-wrap');

      const renderApiKeyInput = () => {
        if (apiKeyRefSelect.value === 'inline') {
          apiKeyInputWrap.innerHTML = `
            <div class="stack--s3">
              <label class="kicker" for="api-key">API Key</label>
              <input
                type="password"
                id="api-key"
                class="input"
                placeholder="sk-..."
              />
            </div>
          `;
        } else {
          // Load credentials and show dropdown
          loadCredentials(apiKeyInputWrap);
        }
      };

      apiKeyRefSelect.addEventListener('change', renderApiKeyInput);
      renderApiKeyInput();
    } else if (selectedAuthMode === 'vertex') {
      authOptions.innerHTML = `
        <div class="stack--s3">
          <label class="kicker" for="vertex-project">GCP Project ID</label>
          <input type="text" id="vertex-project" class="input" placeholder="my-project-id" />
        </div>
        <div class="stack--s3">
          <label class="kicker" for="vertex-location">GCP Location</label>
          <input type="text" id="vertex-location" class="input" placeholder="us-central1" />
        </div>
        <div class="stack--s3">
          <label class="kicker" for="vertex-creds-path">Service Account JSON Path (optional)</label>
          <input type="text" id="vertex-creds-path" class="input" placeholder="/app/gcp-service-account.json" />
        </div>
      `;
    }
  }

  async function loadCredentials(container) {
    try {
      const { credentials } = await api.listCredentials();
      store.set('credentials', credentials);

      const providerMap = { claude_code: 'anthropic', codex: 'openai', gemini: 'google' };
      const provider = providerMap[selectedAgent];
      const filtered = credentials.filter(c => c.provider === provider);

      if (filtered.length === 0) {
        container.innerHTML = `
          <p class="meta">No ${provider} credentials stored. <a href="#/credentials" class="btn--ghost">Add one</a></p>
        `;
        return;
      }

      container.innerHTML = `
        <div class="stack--s3">
          <label class="kicker" for="stored-cred-id">Stored Credential</label>
          <select class="select" id="stored-cred-id">
            <option value="">-- Select --</option>
            ${filtered.map(c => `<option value="${c.id}">${c.label}</option>`).join('')}
          </select>
        </div>
      `;
    } catch (error) {
      container.innerHTML = `<p class="meta">Failed to load credentials: ${error.message}</p>`;
    }
  }

  createBtn.addEventListener('click', async () => {
    if (!selectedAgent) {
      showToast('Error', 'Please select an agent', 'error');
      return;
    }

    if (!selectedAuthMode) {
      showToast('Error', 'Please select an auth mode', 'error');
      return;
    }

    const config = {
      agent: selectedAgent,
      auth: {
        mode: selectedAuthMode,
        providerKey: selectedAgent === 'claude_code' ? 'anthropic' : selectedAgent === 'codex' ? 'openai' : 'google',
        apiKeyRef: 'none'
      }
    };

    // Collect auth-specific options
    if (selectedAuthMode === 'api_key') {
      const apiKeyRef = authOptions.querySelector('#api-key-ref')?.value || 'inline';
      config.auth.apiKeyRef = apiKeyRef;

      if (apiKeyRef === 'inline') {
        const apiKey = authOptions.querySelector('#api-key')?.value;
        if (!apiKey) {
          showToast('Error', 'API key is required', 'error');
          return;
        }
        config.auth.apiKey = apiKey;
      } else {
        const storedCredId = authOptions.querySelector('#stored-cred-id')?.value;
        if (!storedCredId) {
          showToast('Error', 'Please select a credential', 'error');
          return;
        }
        config.auth.storedCredentialId = storedCredId;
      }
    } else if (selectedAuthMode === 'vertex') {
      const projectId = authOptions.querySelector('#vertex-project')?.value;
      const location = authOptions.querySelector('#vertex-location')?.value;
      const credsPath = authOptions.querySelector('#vertex-creds-path')?.value;

      if (!projectId || !location) {
        showToast('Error', 'Project ID and Location are required for Vertex AI', 'error');
        return;
      }

      config.auth.vertexProjectId = projectId;
      config.auth.vertexLocation = location;
      if (credsPath) {
        config.auth.vertexCredentialsPath = credsPath;
      }
    }

    // Env vars
    const envVarsText = container.querySelector('#env-vars').value.trim();
    if (envVarsText) {
      try {
        config.env = JSON.parse(envVarsText);
      } catch (error) {
        showToast('Error', 'Invalid JSON in environment variables', 'error');
        return;
      }
    }

    // Create session
    createBtn.disabled = true;
    createBtn.textContent = 'Creating...';

    try {
      const session = await api.createSession(config);
      store.set('currentSession', session);
      store.addSession(session);
      showToast('Success', `Session ${session.id.slice(0, 8)} created`, 'success');
      router.push('/chat');
    } catch (error) {
      showToast('Error', `Failed to create session: ${error.message}`, 'error');
    } finally {
      createBtn.disabled = false;
      createBtn.textContent = 'Create Session';
    }
  });

  return container;
}
