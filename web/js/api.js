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
    this.maxRetries = 5;
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
  connectWebSocket(sessionId, onMessage) {
    return new Promise((resolve, reject) => {
      const wsUrl = this.baseUrl.replace(/^http/, 'ws');
      // Pass token as query param since browsers don't support custom WebSocket headers
      const url = `${wsUrl}/v1/sessions/${sessionId}/ws?token=${encodeURIComponent(this.token)}`;

      try {
        this.ws = new WebSocket(url);

        this.ws.onopen = () => {
          console.log('[WS] Connected to session:', sessionId);
          store.update('connection', conn => ({ ...conn, status: 'connected', error: null }));
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

          // Attempt reconnect if not a clean close
          if (!event.wasClean && this.retryCount < this.maxRetries) {
            this.retryReconnect(sessionId, onMessage);
          }
        };
      } catch (error) {
        console.error('[WS] Failed to create WebSocket:', error);
        reject(error);
      }
    });
  }

  retryReconnect(sessionId, onMessage) {
    this.retryCount++;
    const delay = Math.min(1000 * Math.pow(2, this.retryCount), 30000);
    const jitter = Math.random() * 1000;

    console.log(`[WS] Reconnecting in ${(delay + jitter) / 1000}s (attempt ${this.retryCount}/${this.maxRetries})`);

    store.update('connection', conn => ({ ...conn, status: 'reconnecting' }));

    setTimeout(() => {
      if (this.retryCount < this.maxRetries) {
        this.connectWebSocket(sessionId, onMessage).catch(error => {
          console.error('[WS] Reconnect failed:', error);
        });
      } else {
        store.update('connection', conn => ({
          ...conn,
          status: 'failed',
          error: 'Max retries exceeded'
        }));
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
