// WebSocket Manager for Aperture sessions

import type {
  OutboundMessage,
  JsonRpcMessage,
  ConnectionStatus,
} from './types'

type MessageHandler = (sessionId: string, message: JsonRpcMessage) => void
type StatusHandler = (sessionId: string, status: ConnectionStatus, error?: string) => void

interface Connection {
  ws: WebSocket | null
  sessionId: string
  retryCount: number
  retryTimeout?: ReturnType<typeof setTimeout>
  messageHandler: MessageHandler
  statusHandler: StatusHandler
}

class WebSocketManager {
  private connections = new Map<string, Connection>()
  private maxConnections = 10
  private maxRetries = 20
  private baseRetryDelay = 1000
  private maxRetryDelay = 30000

  connect(
    sessionId: string,
    wsUrl: string,
    messageHandler: MessageHandler,
    statusHandler: StatusHandler
  ): void {
    // Check if already connected
    const existing = this.connections.get(sessionId)
    if (existing?.ws?.readyState === WebSocket.OPEN) {
      return
    }

    // Enforce connection limit
    if (this.connections.size >= this.maxConnections) {
      const oldest = this.findOldestConnection()
      if (oldest) {
        this.disconnect(oldest)
      }
    }

    // Clean up existing connection if any
    if (existing) {
      this.cleanupConnection(sessionId)
    }

    const conn: Connection = {
      ws: null,
      sessionId,
      retryCount: 0,
      messageHandler,
      statusHandler,
    }

    this.connections.set(sessionId, conn)
    this.createWebSocket(sessionId, wsUrl)
  }

  private createWebSocket(sessionId: string, wsUrl: string): void {
    const conn = this.connections.get(sessionId)
    if (!conn) return

    conn.statusHandler(sessionId, 'connecting')

    try {
      const ws = new WebSocket(wsUrl)
      conn.ws = ws

      ws.onopen = () => {
        conn.retryCount = 0
        conn.statusHandler(sessionId, 'connected')
      }

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data) as JsonRpcMessage
          conn.messageHandler(sessionId, data)
        } catch (error) {
          console.error('[WS] Failed to parse message:', error)
        }
      }

      ws.onerror = () => {
        conn.statusHandler(sessionId, 'error', 'WebSocket error')
      }

      ws.onclose = (event) => {
        if (!event.wasClean || event.code !== 1000) {
          this.scheduleRetry(sessionId, wsUrl)
        } else {
          conn.statusHandler(sessionId, 'disconnected')
          this.connections.delete(sessionId)
        }
      }
    } catch (error) {
      conn.statusHandler(sessionId, 'error', (error as Error).message)
    }
  }

  private scheduleRetry(sessionId: string, wsUrl: string): void {
    const conn = this.connections.get(sessionId)
    if (!conn) return

    conn.retryCount++

    if (conn.retryCount > this.maxRetries) {
      conn.statusHandler(sessionId, 'error', 'Max retries exceeded')
      this.connections.delete(sessionId)
      return
    }

    conn.statusHandler(sessionId, 'reconnecting')

    const delay = Math.min(
      this.baseRetryDelay * Math.pow(2, conn.retryCount - 1),
      this.maxRetryDelay
    )
    const jitter = Math.random() * 1000

    conn.retryTimeout = setTimeout(() => {
      if (this.connections.has(sessionId)) {
        this.createWebSocket(sessionId, wsUrl)
      }
    }, delay + jitter)
  }

  private cleanupConnection(sessionId: string): void {
    const conn = this.connections.get(sessionId)
    if (!conn) return

    if (conn.retryTimeout) {
      clearTimeout(conn.retryTimeout)
    }

    if (conn.ws) {
      conn.ws.onclose = null
      conn.ws.onerror = null
      conn.ws.onmessage = null
      conn.ws.onopen = null
      if (conn.ws.readyState === WebSocket.OPEN || conn.ws.readyState === WebSocket.CONNECTING) {
        conn.ws.close(1000, 'Cleanup')
      }
    }
  }

  disconnect(sessionId: string): void {
    this.cleanupConnection(sessionId)
    const conn = this.connections.get(sessionId)
    if (conn) {
      conn.statusHandler(sessionId, 'disconnected')
    }
    this.connections.delete(sessionId)
  }

  disconnectAll(): void {
    for (const sessionId of this.connections.keys()) {
      this.disconnect(sessionId)
    }
  }

  send(sessionId: string, message: OutboundMessage): boolean {
    const conn = this.connections.get(sessionId)
    if (!conn?.ws || conn.ws.readyState !== WebSocket.OPEN) {
      return false
    }

    try {
      conn.ws.send(JSON.stringify(message))
      return true
    } catch (error) {
      console.error('[WS] Failed to send message:', error)
      return false
    }
  }

  isConnected(sessionId: string): boolean {
    const conn = this.connections.get(sessionId)
    return conn?.ws?.readyState === WebSocket.OPEN
  }

  getStatus(sessionId: string): ConnectionStatus {
    const conn = this.connections.get(sessionId)
    if (!conn?.ws) return 'disconnected'

    switch (conn.ws.readyState) {
      case WebSocket.CONNECTING:
        return 'connecting'
      case WebSocket.OPEN:
        return 'connected'
      case WebSocket.CLOSING:
      case WebSocket.CLOSED:
      default:
        return 'disconnected'
    }
  }

  getRetryCount(sessionId: string): number {
    return this.connections.get(sessionId)?.retryCount ?? 0
  }

  private findOldestConnection(): string | null {
    let oldest: string | null = null
    // For simplicity, just return the first connection
    for (const sessionId of this.connections.keys()) {
      oldest = sessionId
      break
    }
    return oldest
  }
}

export const wsManager = new WebSocketManager()
