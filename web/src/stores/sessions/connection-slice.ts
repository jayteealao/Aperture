// Connection state slice — WebSocket connection lifecycle, status, streaming, and message routing

import type { StateCreator } from 'zustand'
import type {
  ConnectionState,
  ConnectionStatus,
  ContentBlock,
  PermissionResponse,
  ImageAttachment,
  Message,
} from '@/api/types'
import { isSdkWsMessage } from '@/api/types'
import { isPiWsMessage } from '@/api/pi-types'
import { api } from '@/api/client'
import { wsManager } from '@/api/websocket'
import { WsToUIChunkTranslator } from '@/api/ws-to-uichunk'
import type { SessionsStore } from './index'
import { defaultConnectionState } from './persistence'
import { handleSdkWebSocketMessage } from './sdk-message-handler'
import { handlePiWebSocketMessage } from './pi-message-handler'
import { handleJsonRpcMessage } from './jsonrpc-message-handler'

export interface ConnectionSlice {
  connections: Record<string, ConnectionState>

  updateConnection: (sessionId: string, updates: Partial<ConnectionState>) => void
  setStreaming: (sessionId: string, isStreaming: boolean, streamMessageId?: string) => void
  incrementUnread: (sessionId: string) => void
  clearUnread: (sessionId: string) => void
  cleanupConnection: (sessionId: string) => void

  // WebSocket lifecycle
  connectSession: (sessionId: string) => Promise<void>
  disconnectSession: (sessionId: string) => void
  sendMessage: (sessionId: string, content: string, images?: ImageAttachment[]) => Promise<void>
  sendPermissionResponse: (sessionId: string, toolCallId: string, optionId: string | null, answers?: Record<string, string>) => void
  cancelPrompt: (sessionId: string) => void
}

export const connectionSliceInitialState = {
  connections: {} as Record<string, ConnectionState>,
}

export const createConnectionSlice: StateCreator<SessionsStore, [], [], ConnectionSlice> = (set, get) => ({
  ...connectionSliceInitialState,

  updateConnection: (sessionId, updates) => {
    set((state) => ({
      connections: {
        ...state.connections,
        [sessionId]: {
          ...defaultConnectionState(),
          ...state.connections[sessionId],
          ...updates,
          lastActivity: Date.now(),
        },
      },
    }))
  },

  setStreaming: (sessionId, isStreaming, streamMessageId) => {
    get().updateConnection(sessionId, {
      isStreaming,
      // Explicitly clear currentStreamMessageId when streaming stops
      currentStreamMessageId: isStreaming ? streamMessageId : undefined,
    })
  },

  incrementUnread: (sessionId) => {
    const { activeSessionId, connections } = get()
    if (sessionId === activeSessionId) return

    const conn = connections[sessionId] || defaultConnectionState()
    get().updateConnection(sessionId, {
      hasUnread: true,
      unreadCount: conn.unreadCount + 1,
    })
  },

  clearUnread: (sessionId) => {
    get().updateConnection(sessionId, {
      hasUnread: false,
      unreadCount: 0,
    })
  },

  cleanupConnection: (sessionId) => {
    set((state) => {
      const connections = { ...state.connections }
      delete connections[sessionId]
      return { connections }
    })
  },

  // WebSocket lifecycle
  connectSession: async (sessionId) => {
    // First, try to restore/connect to the session on the backend
    try {
      const response = await api.connectSession(sessionId)
      if (response.restored) {
        console.log(`[Sessions] Restored SDK session ${sessionId}`)
        get().updateSessionStatus(sessionId, response.status)
      }
    } catch (err) {
      console.warn(`[Sessions] Failed to connect/restore session ${sessionId}:`, err)
      get().updateConnection(sessionId, {
        status: 'error',
        error: err instanceof Error ? err.message : 'Session not found on server',
      })
      return
    }

    const wsUrl = api.getWebSocketUrl(sessionId)
    const translator = new WsToUIChunkTranslator()

    // Message handler that routes SDK, Pi, and JSON-RPC messages
    const messageHandler = (sid: string, data: unknown) => {
      if (isSdkWsMessage(data)) {
        for (const chunk of translator.translateSdkEvent(data.type, data.payload)) {
          wsManager.emitUIChunk(sid, chunk)
        }
        handleSdkWebSocketMessage(sid, data, get, set)
        return
      }
      if (isPiWsMessage(data)) {
        for (const chunk of translator.translatePiEvent(data.type, data.payload)) {
          wsManager.emitUIChunk(sid, chunk)
        }
        handlePiWebSocketMessage(sid, data, get, set)
        return
      }
      handleJsonRpcMessage(sid, data, get, set)
    }

    const statusHandler = (sid: string, status: ConnectionStatus, error?: string) => {
      get().updateConnection(sid, { status, error: error || null })

      // Reset translator on (re)connect to clear stale partial block state
      if (status === 'connected') {
        translator.reset()

        // Auto-fetch session data when WebSocket connects
        const session = get().sessions.find((s) => s.id === sid)
        if (session?.agent === 'pi_sdk') {
          get().piGetStats(sid)
          get().piGetModels(sid)
          get().piGetForkable(sid)
        }
      }
    }

    wsManager.connect(sessionId, wsUrl, messageHandler, statusHandler)
  },

  disconnectSession: (sessionId) => {
    wsManager.disconnect(sessionId)
    get().updateConnection(sessionId, { status: 'disconnected' })
  },

  sendMessage: async (sessionId, content, images) => {
    // Build message content: include image content blocks if present
    const messageContent: string | ContentBlock[] = images && images.length > 0
      ? [
          ...images.map((img) => ({
            type: 'image' as const,
            mimeType: img.mimeType,
            data: img.data,
            filename: img.filename,
          })),
          { type: 'text' as const, text: content },
        ]
      : content

    // Add user message to store
    const userMessage: Message = {
      id: crypto.randomUUID(),
      sessionId,
      role: 'user',
      content: messageContent,
      timestamp: new Date().toISOString(),
    }
    await get().addMessage(sessionId, userMessage)

    // Send via WebSocket (images sent alongside content)
    const sent = wsManager.send(sessionId, {
      type: 'user_message',
      content,
      ...(images && images.length > 0 ? { images } : {}),
    })

    if (!sent) {
      throw new Error('Failed to send message - not connected')
    }
  },

  sendPermissionResponse: (sessionId, toolCallId, optionId, answers) => {
    const message: PermissionResponse = {
      type: 'permission_response',
      toolCallId,
      optionId,
      ...(answers && { answers }),
    }
    if (import.meta.env.DEV) {
      console.log('[WS] Sending permission response for tool:', toolCallId)
    }
    wsManager.send(sessionId, message)
    get().removePendingPermission(sessionId, toolCallId)
  },

  cancelPrompt: (sessionId) => {
    wsManager.send(sessionId, { type: 'cancel' })
    get().setStreaming(sessionId, false)
  },
})
