/**
 * Help - How it works, auth explanation, troubleshooting
 */

import { router } from '../app.js';

export function renderHelp() {
  const container = document.createElement('div');
  container.className = 'loading-screen';

  container.innerHTML = `
    <div class="surface surface--heavy" style="max-width: 800px; width: calc(100vw - 32px);">
      <div class="cluster mb-6">
        <button class="btn btn--ghost btn--sm" id="back-btn">← Back</button>
        <h1 class="title">HELP</h1>
        <div></div>
      </div>

      <div class="stack">
        <div class="stack--s3">
          <h2 class="subtitle">How Aperture Works</h2>
          <p class="body">
            Aperture is a gateway that exposes AI agents (Claude Code, Codex, Gemini) over WebSocket, HTTP, and SSE protocols.
          </p>
          <p class="body">
            This web interface lets you connect to an Aperture server, create sessions with different agents, and interact with them in real-time.
          </p>
        </div>

        <div class="rule"></div>

        <div class="stack--s3">
          <h2 class="subtitle">Getting Started</h2>
          <ol class="body" style="padding-left: 24px;">
            <li style="margin-bottom: 8px;">
              <strong>Connect:</strong> Enter your Aperture server URL and API token on the Connect page.
            </li>
            <li style="margin-bottom: 8px;">
              <strong>Test Connection:</strong> Use the "Test /healthz" and "Test /readyz" buttons to verify connectivity.
            </li>
            <li style="margin-bottom: 8px;">
              <strong>Create Session:</strong> Select an agent (Claude, Codex, or Gemini) and configure authentication.
            </li>
            <li style="margin-bottom: 8px;">
              <strong>Chat:</strong> Send messages and receive streaming responses. Use the Inspector to view events and approve tool calls.
            </li>
          </ol>
        </div>

        <div class="rule"></div>

        <div class="stack--s3">
          <h2 class="subtitle">Authentication Modes</h2>

          <div class="stack--s4">
            <div>
              <h3 class="kicker">Interactive (Claude & Codex)</h3>
              <p class="body">
                Authenticates using the agent's CLI login flow. For Claude, this requires an active Anthropic subscription.
                For Codex, this is for local development only.
              </p>
            </div>

            <div>
              <h3 class="kicker">API Key</h3>
              <p class="body">
                Use a direct API key from the provider. You can paste it inline or reference a stored credential from the vault.
              </p>
              <p class="meta">
                Recommended for production use. Keys can be managed in the Credentials page.
              </p>
            </div>

            <div>
              <h3 class="kicker">OAuth (Gemini)</h3>
              <p class="body">
                Authenticate using Google OAuth. Opens a browser flow to grant access.
              </p>
            </div>

            <div>
              <h3 class="kicker">Vertex AI (Gemini)</h3>
              <p class="body">
                Use Google Cloud's Vertex AI. Requires a GCP project ID, location, and optional service account credentials.
              </p>
            </div>
          </div>
        </div>

        <div class="rule"></div>

        <div class="stack--s3">
          <h2 class="subtitle">Features</h2>

          <div class="stack--s4">
            <div>
              <h3 class="kicker">Real-time Streaming</h3>
              <p class="body">
                Messages stream token-by-token over WebSocket for a responsive experience. The UI updates incrementally with a blinking cursor.
              </p>
            </div>

            <div>
              <h3 class="kicker">Tool Approvals</h3>
              <p class="body">
                When "Require Approvals" is enabled, tool calls will appear in the Inspector's Approvals tab. You can approve or deny each call.
              </p>
            </div>

            <div>
              <h3 class="kicker">Inspector</h3>
              <p class="body">
                The Inspector panel shows:
              </p>
              <ul class="body" style="padding-left: 24px;">
                <li>Events: Full WebSocket message log with JSON details</li>
                <li>Approvals: Pending tool calls requiring approval</li>
                <li>Connection: Server URL, session ID, connection status</li>
              </ul>
            </div>

            <div>
              <h3 class="kicker">Credentials Vault</h3>
              <p class="body">
                Store API keys securely on the server. They're encrypted at rest and can be referenced by ID when creating sessions.
              </p>
            </div>
          </div>
        </div>

        <div class="rule"></div>

        <div class="stack--s3">
          <h2 class="subtitle">Troubleshooting</h2>

          <div class="stack--s4">
            <div>
              <h3 class="kicker">Connection Failed</h3>
              <p class="body">
                Ensure the server URL is correct and the server is running. Check the browser console for detailed errors.
              </p>
              <p class="meta">
                If using HTTPS for the web interface, the server must also use HTTPS (or WSS for WebSocket).
              </p>
            </div>

            <div>
              <h3 class="kicker">WebSocket Disconnected</h3>
              <p class="body">
                The WebSocket connection may drop due to network issues. Aperture will automatically retry with exponential backoff.
              </p>
              <p class="meta">
                Check the Connection tab in the Inspector for retry attempts and error details.
              </p>
            </div>

            <div>
              <h3 class="kicker">Authentication Errors</h3>
              <p class="body">
                If session creation fails with auth errors:
              </p>
              <ul class="body" style="padding-left: 24px;">
                <li>Verify API key is correct and has sufficient quota</li>
                <li>For Claude Interactive: Ensure you have an active Anthropic subscription and have run <code>claude login</code> on the server</li>
                <li>For Vertex AI: Check project ID, location, and service account permissions</li>
              </ul>
            </div>

            <div>
              <h3 class="kicker">Sessions Not Loading</h3>
              <p class="body">
                If the session list is empty or stale, try refreshing the page. Session data is stored in-memory on the server and will be lost on restart.
              </p>
            </div>

            <div>
              <h3 class="kicker">UI Issues</h3>
              <p class="body">
                If the interface behaves unexpectedly:
              </p>
              <ul class="body" style="padding-left: 24px;">
                <li>Clear local data in Settings → Danger Zone</li>
                <li>Hard refresh the page (Ctrl+Shift+R or Cmd+Shift+R)</li>
                <li>Check browser console for JavaScript errors</li>
              </ul>
            </div>
          </div>
        </div>

        <div class="rule"></div>

        <div class="stack--s3">
          <h2 class="subtitle">Keyboard Shortcuts</h2>
          <div class="stack--s4">
            <div class="cluster">
              <code class="mono">Enter</code>
              <span class="body">Send message (in composer)</span>
            </div>
            <div class="cluster">
              <code class="mono">Shift + Enter</code>
              <span class="body">New line (in composer)</span>
            </div>
            <div class="cluster">
              <code class="mono">Tab</code>
              <span class="body">Navigate between interactive elements</span>
            </div>
          </div>
        </div>

        <div class="rule"></div>

        <div class="stack--s3">
          <h2 class="subtitle">Privacy & Security</h2>
          <p class="body">
            <strong>Local Storage:</strong> Server URL, API token, and settings are stored in your browser's localStorage. Clear them via Settings → Danger Zone.
          </p>
          <p class="body">
            <strong>API Tokens:</strong> The API token for Aperture is sent with every HTTP request as a Bearer token. Use HTTPS in production.
          </p>
          <p class="body">
            <strong>Credentials Vault:</strong> API keys stored in the vault are sent to the Aperture server and encrypted at rest. They never appear in the browser after being saved.
          </p>
          <p class="meta">
            ⚠️ This web interface is designed for trusted environments. Do not expose it publicly without authentication.
          </p>
        </div>

        <div class="rule"></div>

        <div class="stack--s3">
          <h2 class="subtitle">Technical Details</h2>
          <p class="body">
            Built with vanilla HTML, CSS, and JavaScript. No frameworks or bundlers.
          </p>
          <p class="meta">
            • ES Modules for code organization<br>
            • View Transitions API for smooth navigation<br>
            • WebSocket with exponential backoff retry<br>
            • Neo-brutalist design system with CSS custom properties<br>
            • Responsive layout with CSS Grid<br>
            • Full keyboard navigation support
          </p>
        </div>
      </div>
    </div>
  `;

  const backBtn = container.querySelector('#back-btn');

  backBtn.addEventListener('click', () => {
    router.push('/');
  });

  return container;
}
