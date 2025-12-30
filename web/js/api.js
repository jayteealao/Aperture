/**
 * Aperture API Client
 * WebSocket, HTTP, and SSE communication with the gateway
 */

import { store } from './store.js';

class ApertureClient {
  constructor() {
    this.baseUrl = '';
    this.token = '';
    this.connections = new Map();  // sessionId -> { ws, retryCount, onMessage }
    this.maxConnections = 10;
    this.sse = null;
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

  // Multi-connection WebSocket management
  async connectSession(sessionId, onMessage, options = {}) {
    // Check if already connected
    const existing = this.connections.get(sessionId);
    if (existing && existing.ws && existing.ws.readyState === WebSocket.OPEN) {
      console.log('[API] Already connected to session:', sessionId);
      return existing.ws;
    }

    // Enforce connection limit
    if (this.connections.size >= this.maxConnections) {
      const oldest = this.findOldestIdleConnection();
      if (oldest) {
        console.log('[API] Max connections reached, disconnecting:', oldest);
        this.disconnectSession(oldest);
      } else {
        throw new Error('Maximum concurrent connections reached');
      }
    }

    // Check if session exists on server
    if (!options.skipSessionCheck) {
      try {
        const sessionStatus = await this.getSession(sessionId);
        if (!sessionStatus || sessionStatus.status === 'ended') {
          throw new Error('Session no longer exists or has ended');
        }
      } catch (err) {
        store.updateConnection(sessionId, {
          status: 'error',
          error: 'Session no longer exists on server'
        });
        throw err;
      }
    }

    store.updateConnection(sessionId, { status: 'connecting' });

    return new Promise((resolve, reject) => {
      const wsUrl = this.baseUrl.replace(/^http/, 'ws');
      const url = `${wsUrl}/v1/sessions/${sessionId}/ws?token=${encodeURIComponent(this.token)}`;

      try {
        const ws = new WebSocket(url);

        const connData = {
          ws,
          retryCount: 0,
          onMessage,
          sessionId
        };
        this.connections.set(sessionId, connData);

        ws.onopen = () => {
          console.log('[API] Connected to session:', sessionId);
          store.updateConnection(sessionId, {
            status: 'connected',
            error: null,
            retryCount: 0
          });
          connData.retryCount = 0;
          resolve(ws);
        };

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            onMessage(sessionId, data);
            store.addEvent({
              timestamp: Date.now(),
              type: 'message',
              direction: 'inbound',
              sessionId,
              data
            });
          } catch (error) {
            console.error('[API] Failed to parse message:', error);
          }
        };

        ws.onerror = (error) => {
          console.error('[API] WebSocket error for session:', sessionId, error);
          store.updateConnection(sessionId, { error: 'WebSocket error' });
        };

        ws.onclose = (event) => {
          console.log('[API] WebSocket closed for session:', sessionId, event.code, event.reason);

          if (!event.wasClean || event.code !== 1000) {
            store.updateConnection(sessionId, { status: 'reconnecting' });
            this.retryConnection(sessionId, onMessage);
          } else {
            store.updateConnection(sessionId, { status: 'disconnected' });
            this.connections.delete(sessionId);
          }
        };
      } catch (error) {
        console.error('[API] Failed to create WebSocket:', error);
        store.updateConnection(sessionId, { status: 'error', error: error.message });
        reject(error);
      }
    });
  }

  retryConnection(sessionId, onMessage) {
    const conn = this.connections.get(sessionId);
    if (!conn) return;

    conn.retryCount++;
    const delay = Math.min(1000 * Math.pow(2, conn.retryCount), 30000);
    const jitter = Math.random() * 1000;

    console.log(`[API] Reconnecting session ${sessionId} in ${(delay + jitter) / 1000}s (attempt ${conn.retryCount})`);

    store.updateConnection(sessionId, {
      status: 'reconnecting',
      retryCount: conn.retryCount
    });

    setTimeout(async () => {
      // Check connection still exists (user may have ended session)
      if (!this.connections.has(sessionId)) return;

      try {
        await this.connectSession(sessionId, onMessage, { isReconnect: true });
      } catch (error) {
        console.error('[API] Reconnect failed for session:', sessionId, error);

        if (error.message && error.message.includes('no longer exists')) {
          store.updateConnection(sessionId, {
            status: 'error',
            error: 'Session ended'
          });
          this.connections.delete(sessionId);
        }
        // Otherwise onclose handler will trigger another retry
      }
    }, delay + jitter);
  }

  disconnectSession(sessionId) {
    const conn = this.connections.get(sessionId);
    if (conn) {
      if (conn.ws) {
        conn.ws.close(1000, 'User disconnect');
      }
      this.connections.delete(sessionId);
      store.updateConnection(sessionId, { status: 'disconnected' });
    }
  }

  disconnectAll() {
    for (const [sessionId, conn] of this.connections) {
      if (conn.ws) {
        conn.ws.close(1000, 'Disconnect all');
      }
      store.updateConnection(sessionId, { status: 'disconnected' });
    }
    this.connections.clear();
  }

  sendToSession(sessionId, message) {
    const conn = this.connections.get(sessionId);
    if (conn && conn.ws && conn.ws.readyState === WebSocket.OPEN) {
      const payload = JSON.stringify(message);
      conn.ws.send(payload);
      store.addEvent({
        timestamp: Date.now(),
        type: 'message',
        direction: 'outbound',
        sessionId,
        data: message
      });
      return true;
    }
    return false;
  }

  isConnected(sessionId) {
    const conn = this.connections.get(sessionId);
    return conn && conn.ws && conn.ws.readyState === WebSocket.OPEN;
  }

  getConnectionStatus(sessionId) {
    const conn = this.connections.get(sessionId);
    if (!conn || !conn.ws) return 'disconnected';

    switch (conn.ws.readyState) {
      case WebSocket.CONNECTING: return 'connecting';
      case WebSocket.OPEN: return 'connected';
      case WebSocket.CLOSING: return 'disconnecting';
      case WebSocket.CLOSED: return 'disconnected';
      default: return 'unknown';
    }
  }

  findOldestIdleConnection() {
    let oldest = null;
    let oldestTime = Infinity;

    for (const [sessionId] of this.connections) {
      const conn = store.getConnection(sessionId);
      if (conn && !conn.isStreaming && conn.lastActivity < oldestTime) {
        oldest = sessionId;
        oldestTime = conn.lastActivity;
      }
    }
    return oldest;
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
