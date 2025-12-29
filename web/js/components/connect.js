/**
 * Connect page - Server configuration and testing
 */

import { store } from '../store.js';
import { api } from '../api.js';
import { router, showToast } from '../app.js';

export function renderConnect() {
  const serverUrl = store.get('serverUrl');
  const apiToken = store.get('apiToken');

  const container = document.createElement('div');
  container.className = 'loading-screen';

  container.innerHTML = `
    <div class="surface surface--heavy" style="max-width: 600px; width: calc(100vw - 32px);">
      <h1 class="title mb-6">APERTURE</h1>

      <div class="stack">
        <div class="stack--s3">
          <label class="kicker" for="server-url">Server URL</label>
          <input
            type="url"
            id="server-url"
            class="input"
            value="${serverUrl}"
            placeholder="http://localhost:8080"
          />
        </div>

        <div class="stack--s3">
          <label class="kicker" for="api-token">API Token</label>
          <input
            type="password"
            id="api-token"
            class="input"
            value="${apiToken}"
            placeholder="your-api-token"
          />
          <p class="meta">⚠️ Token will be stored in localStorage</p>
        </div>

        <div class="rule"></div>

        <div class="cluster">
          <button class="btn btn--primary" id="test-health">
            Test /healthz
          </button>
          <button class="btn btn--secondary" id="test-ready">
            Test /readyz
          </button>
        </div>

        <div id="test-result"></div>

        <div class="rule"></div>

        <button class="btn btn--primary btn--block" id="connect">
          Connect
        </button>

        <button class="btn btn--ghost btn--block" id="go-help">
          Need Help?
        </button>
      </div>
    </div>
  `;

  // Event listeners
  const serverUrlInput = container.querySelector('#server-url');
  const apiTokenInput = container.querySelector('#api-token');
  const testHealthBtn = container.querySelector('#test-health');
  const testReadyBtn = container.querySelector('#test-ready');
  const connectBtn = container.querySelector('#connect');
  const goHelpBtn = container.querySelector('#go-help');
  const resultDiv = container.querySelector('#test-result');

  const saveConfig = () => {
    const url = serverUrlInput.value.trim();
    const token = apiTokenInput.value.trim();

    store.set('serverUrl', url);
    store.set('apiToken', token);
    api.configure(url, token);
  };

  testHealthBtn.addEventListener('click', async () => {
    saveConfig();
    testHealthBtn.disabled = true;
    resultDiv.innerHTML = '<p class="meta">Testing...</p>';

    try {
      const result = await api.checkHealth();
      resultDiv.innerHTML = `<div class="chip chip--ok">✓ Health check passed</div>`;
      console.log('Health:', result);
    } catch (error) {
      resultDiv.innerHTML = `<div class="chip chip--danger">✗ ${error.message}</div>`;
    } finally {
      testHealthBtn.disabled = false;
    }
  });

  testReadyBtn.addEventListener('click', async () => {
    saveConfig();
    testReadyBtn.disabled = true;
    resultDiv.innerHTML = '<p class="meta">Testing...</p>';

    try {
      const result = await api.checkReady();
      resultDiv.innerHTML = `
        <div class="chip chip--ok">✓ Ready</div>
        <pre class="mono" style="margin-top: 8px; font-size: 12px;">${JSON.stringify(result, null, 2)}</pre>
      `;
      console.log('Ready:', result);
    } catch (error) {
      resultDiv.innerHTML = `<div class="chip chip--danger">✗ ${error.message}</div>`;
    } finally {
      testReadyBtn.disabled = false;
    }
  });

  connectBtn.addEventListener('click', () => {
    saveConfig();

    if (!serverUrlInput.value.trim()) {
      showToast('Error', 'Server URL is required', 'error');
      return;
    }

    showToast('Connected', 'Configuration saved', 'success');
    router.push('/sessions');
  });

  goHelpBtn.addEventListener('click', () => {
    router.push('/help');
  });

  return container;
}
