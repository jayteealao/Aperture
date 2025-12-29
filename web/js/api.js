/**
 * Aperture API Client
 * WebSocket, HTTP, and SSE communication with the gateway
 */

import { store } from './store.js';

class ApertureClient {
  constructor() {
    this.baseUrl = '';
    this.token = '';
    this.ws = null;
    this.sse = null;
    this.retryCount = 0;
    this.maxRetries = Infinity; // Never give up on reconnecting
    this.reconnectStrategy = 'exponential';
    this.currentSessionId = null;
  }

  configure(baseUrl, token) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.token = token;
  }

  async request(endpoint, options = {}) {
    const url = `${this.baseUrl}${endpoint}`;
    const headers = {
      'Content-Type': 'application/json',
      ...(this.token && { 'Authorization': `Bearer ${this.token}` }),
      ...options.headers
    };

    try {
      const response = await fetch(url, {
        ...options,
        headers
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: response.statusText }));
        throw new Error(error.message || error.error || response.statusText);
      }

      if (response.status === 204) {
        return null;
      }

      return await response.json();
    } catch (error) {
      console.error(`API Error [${endpoint}]:`, error);
      throw error;
    }
  }

  // Health check
  async checkHealth() {
    return this.request('/healthz', { method: 'GET' });
  }

  // Readiness check
  async checkReady() {
    return this.request('/readyz', { method: 'GET' });
  }

  // Sessions
  async createSession(config) {
    return this.request('/v1/sessions', {
      method: 'POST',
      body: JSON.stringify(config)
    });
  }

  async getSession(sessionId) {
    return this.request(`/v1/sessions/${sessionId}`, { method: 'GET' });
  }

  async deleteSession(sessionId) {
    return this.request(`/v1/sessions/${sessionId}`, { method: 'DELETE' });
  }

  async getSessionMessages(sessionId, limit = 1000, offset = 0) {
    return this.request(`/v1/sessions/${sessionId}/messages?limit=${limit}&offset=${offset}`, {
      method: 'GET'
    });
  }

  async listSessions() {
    return this.request('/v1/sessions', { method: 'GET' });
  }

  async sendMessage(sessionId, message) {
    return this.request(`/v1/sessions/${sessionId}/rpc`, {
      method: 'POST',
      body: JSON.stringify({ message })
    });
  }

  // Credentials
  async storeCredential(provider, label, apiKey) {
    return this.request('/v1/credentials', {
      method: 'POST',
      body: JSON.stringify({ provider, label, apiKey })
    });
  }

  async listCredentials() {
    return this.request('/v1/credentials', { method: 'GET' });
  }

  async deleteCredential(id) {
    return this.request(`/v1/credentials/${id}`, { method: 'DELETE' });
  }

  // WebSocket connection
  async connectWebSocket(sessionId, onMessage, options = {}) {
    // Check if session still exists before connecting
    if (!options.skipSessionCheck) {
      try {
        const sessionStatus = await this.getSession(sessionId);
        if (!sessionStatus || sessionStatus.status === 'ended') {
          throw new Error('Session no longer exists or has ended');
        }
      } catch (err) {
        store.update('connection', conn => ({
          ...conn,
          status: 'failed',
          error: 'Session no longer exists on server'
        }));
        throw err;
      }
    }

    this.currentSessionId = sessionId;

    return new Promise((resolve, reject) => {
      const wsUrl = this.baseUrl.replace(/^http/, 'ws');
      // Pass token as query param since browsers don't support custom WebSocket headers
      const url = `${wsUrl}/v1/sessions/${sessionId}/ws?token=${encodeURIComponent(this.token)}`;

      try {
        this.ws = new WebSocket(url);

        this.ws.onopen = async () => {
          console.log('[WS] Connected to session:', sessionId);

          // Sync state after reconnection
          if (options.isReconnect) {
            await this.syncSessionState(sessionId);
          }

          store.update('connection', conn => ({ ...conn, status: 'connected', error: null, retryCount: 0 }));
          this.retryCount = 0;
          resolve(this.ws);
        };

        this.ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            onMessage(data);
            store.addEvent({
              timestamp: Date.now(),
              type: 'message',
              direction: 'inbound',
              data
            });
          } catch (error) {
            console.error('[WS] Failed to parse message:', error);
          }
        };

        this.ws.onerror = (error) => {
          console.error('[WS] Error:', error);
          store.update('connection', conn => ({ ...conn, error: 'WebSocket error' }));
        };

        this.ws.onclose = (event) => {
          console.log('[WS] Closed:', event.code, event.reason);
          store.update('connection', conn => ({ ...conn, status: 'disconnected' }));

          // Attempt reconnect if not a clean close (code 1000 = normal closure)
          if (!event.wasClean || (event.code !== 1000 && this.currentSessionId === sessionId)) {
            this.retryReconnect(sessionId, onMessage);
          }
        };
      } catch (error) {
        console.error('[WS] Failed to create WebSocket:', error);
        reject(error);
      }
    });
  }

  async syncSessionState(sessionId) {
    try {
      console.log('[Sync] Synchronizing session state...');

      // Get latest messages from server (if persistence is enabled)
      try {
        const response = await this.getSessionMessages(sessionId, 100, 0);
        if (response && response.messages) {
          console.log('[Sync] Received', response.messages.length, 'messages from server');
          // Server messages will be merged in store
        }
      } catch (err) {
        // Message persistence might not be enabled, that's OK
        console.log('[Sync] Message history not available (persistence may not be enabled)');
      }

      console.log('[Sync] State synchronized successfully');
    } catch (err) {
      console.error('[Sync] Failed to sync state:', err);
    }
  }

  retryReconnect(sessionId, onMessage) {
    this.retryCount++;
    const delay = Math.min(1000 * Math.pow(2, this.retryCount), 30000);
    const jitter = Math.random() * 1000;

    console.log(`[WS] Reconnecting in ${(delay + jitter) / 1000}s (attempt ${this.retryCount})`);

    store.update('connection', conn => ({
      ...conn,
      status: 'reconnecting',
      retryCount: this.retryCount
    }));

    setTimeout(async () => {
      // Always try to reconnect if this is still the current session
      if (this.currentSessionId === sessionId) {
        try {
          await this.connectWebSocket(sessionId, onMessage, { isReconnect: true });
        } catch (error) {
          console.error('[WS] Reconnect failed:', error);

          // Only stop if session explicitly doesn't exist
          if (error.message && error.message.includes('no longer exists')) {
            store.update('connection', conn => ({
              ...conn,
              status: 'failed',
              error: 'Session ended'
            }));
          } else {
            // Keep retrying for network errors
            this.retryReconnect(sessionId, onMessage);
          }
        }
      }
    }, delay + jitter);
  }

  sendWebSocketMessage(message) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      const payload = JSON.stringify(message);
      this.ws.send(payload);
      store.addEvent({
        timestamp: Date.now(),
        type: 'message',
        direction: 'outbound',
        data: message
      });
      return true;
    }
    return false;
  }

  disconnectWebSocket() {
    if (this.ws) {
      this.currentSessionId = null; // Stop reconnection attempts
      this.ws.close(1000, 'User disconnect');
      this.ws = null;
      this.retryCount = 0;
    }
  }

  // Server-Sent Events (fallback for streaming)
  connectSSE(sessionId, onMessage) {
    const url = `${this.baseUrl}/v1/sessions/${sessionId}/events`;

    try {
      this.sse = new EventSource(url);

      this.sse.onopen = () => {
        console.log('[SSE] Connected to session:', sessionId);
        store.update('connection', conn => ({ ...conn, status: 'connected', error: null }));
      };

      this.sse.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          onMessage(data);
          store.addEvent({
            timestamp: Date.now(),
            type: 'message',
            direction: 'inbound',
            data
          });
        } catch (error) {
          console.error('[SSE] Failed to parse message:', error);
        }
      };

      this.sse.onerror = (error) => {
        console.error('[SSE] Error:', error);
        store.update('connection', conn => ({
          ...conn,
          status: 'disconnected',
          error: 'SSE connection error'
        }));
        this.sse.close();
      };
    } catch (error) {
      console.error('[SSE] Failed to create EventSource:', error);
      throw error;
    }
  }

  disconnectSSE() {
    if (this.sse) {
      this.sse.close();
      this.sse = null;
    }
  }
}

export const api = new ApertureClient();
