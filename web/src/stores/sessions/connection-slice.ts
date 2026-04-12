// Connection state slice — WebSocket connection lifecycle, status, streaming, and message routing

import type { StateCreator } from 'zustand'
import type {
  ConnectionState,
  ConnectionStatus,
  PermissionResponse,
} from '@/api/types'
import { isSdkWsMessage } from '@/api/types'
import { isPiWsMessage } from '@/api/pi-types'
import { api } from '@/api/client'
import { wsManager } from '@/api/websocket'
import { WsToUIChunkTranslator } from '@/api/ws-to-uichunk'
import type { SessionsStore } from './index'
import { handleSdkWebSocketMessage } from './sdk-message-handler'
import { handlePiWebSocketMessage } from './pi-message-handler'
import { handleJsonRpcMessage } from './jsonrpc-message-handler'

export interface ConnectionSlice {
  connections: Record<string, ConnectionState>

  updateConnection: (sessionId: string, updates: Partial<ConnectionState>) => void
  setStreaming: (sessionId: string, isStreaming: boolean) => void
  incrementUnread: (sessionId: string) => void
  clearUnread: (sessionId: string) => void
  cleanupConnection: (sessionId: string) => void

  // WebSocket lifecycle
  connectSession: (sessionId: string) => Promise<void>
  disconnectSession: (sessionId: string) => void
  sendPermissionResponse: (sessionId: string, toolCallId: string, optionId: string | null, answers?: Record<string, string>) => void
  cancelPrompt: (sessionId: string) => void
}

export const connectionSliceInitialState = {
  connections: {} as Record<string, ConnectionState>,
}

export const createConnectionSlice: StateCreator<SessionsStore, [], [], ConnectionSlice> = (set, get) => ({
  ...connectionSliceInitialState,

  updateConnection: (sessionId, updates) => {
    set((state) => {
      // Guard: do not recreate a connection entry for a session that has been
      // removed. Delayed WS callbacks (statusHandler, message handlers) can
      // fire after removeSession → cleanupConnection; without this guard they
      // would resurrect a ghost ConnectionState entry.
      if (!state.connections[sessionId]) return state
      return {
        connections: {
          ...state.connections,
          [sessionId]: {
            ...state.connections[sessionId],
            ...updates,
            lastActivity: Date.now(),
          },
        },
      }
    })
  },

  setStreaming: (sessionId, isStreaming) => {
    get().updateConnection(sessionId, { isStreaming })
  },

  incrementUnread: (sessionId) => {
    const { activeSessionId, connections } = get()
    if (sessionId === activeSessionId) return

    const conn = connections[sessionId]
    if (!conn) return

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
      if (response.restored && import.meta.env.DEV) {
        console.log(`[Sessions] Restored SDK session ${sessionId}`)
      }
      get().updateSessionStatus(sessionId, response.status)
      if (response.workspaceId) {
        const session = get().sessions.find((item) => item.id === sessionId)
        if (session && session.workspaceId !== response.workspaceId) {
          void get().addSession({ ...session, workspaceId: response.workspaceId, status: response.status })
        }
      }
    } catch (err) {
      if (import.meta.env.DEV) {
        console.warn(`[Sessions] Failed to connect/restore session ${sessionId}:`, err)
      }
      get().updateConnection(sessionId, {
        status: 'error',
        error: err instanceof Error ? err.message : 'Session not found on server',
      })
      return
    }

    const wsUrl = api.getWebSocketUrl(sessionId)
    const translator = new WsToUIChunkTranslator()

    // Track how many times we've re-run the full REST+WS restore flow for this
    // connectSession invocation, to prevent an infinite loop if the server keeps
    // rejecting the session.
    let restoreRetries = 0
    const MAX_RESTORE_RETRIES = 3

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

      // If the WS was rejected because the session isn't in server memory yet
      // (happens when the WS manager retries after a server restart before the
      // REST restore has run), re-run the full connectSession REST+WS flow so
      // the session is loaded into memory before the next WS attempt.
      if (status === 'error' && error === 'Session not found' && restoreRetries < MAX_RESTORE_RETRIES) {
        restoreRetries++
        const delay = 500 * restoreRetries
        if (import.meta.env.DEV) {
          console.log(`[Sessions] WS rejected "session not found" for ${sid}, retrying REST restore in ${delay}ms (attempt ${restoreRetries}/${MAX_RESTORE_RETRIES})`)
        }
        setTimeout(() => {
          // Only retry if the session still exists in the store
          if (get().sessions.find((s) => s.id === sid)) {
            void get().connectSession(sid)
          }
        }, delay)
        return
      }

      // Reset translator on (re)connect to clear stale partial block state
      if (status === 'connected') {
        translator.reset()

        // Auto-fetch session data when WebSocket connects
        const session = get().sessions.find((s) => s.id === sid)
        if (session?.agent === 'pi_sdk') {
          get().piGetStats(sid)
          get().piGetModels(sid)
          get().piGetForkable(sid)
        } else if (session?.agent === 'claude_sdk') {
          get().markSdkHydrationConnected(sid)
        }

        // Re-fetch session metadata to sync title changes during disconnect
        void api.getSession(sid).then((serverSession) => {
          if (serverSession.title && serverSession.title !== session?.title) {
            get().updateSessionTitle(sid, serverSession.title)
          }
        }).catch(() => {
          // Non-critical — stale title is acceptable until next sync
        })
      }
    }

    wsManager.connect(sessionId, wsUrl, messageHandler, statusHandler)
  },

  disconnectSession: (sessionId) => {
    wsManager.disconnect(sessionId)
    get().updateConnection(sessionId, { status: 'disconnected' })
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
    const sent = wsManager.send(sessionId, message)
    if (sent) {
      // Only dismiss the dialog once the message is actually on the wire.
      // If the WS is down, keep the pending permission visible so the user
      // can retry once the connection is re-established.
      get().removePendingPermission(sessionId, toolCallId)
    } else if (import.meta.env.DEV) {
      console.warn('[WS] Permission response not sent — WebSocket not connected for session', sessionId)
    }
  },

  cancelPrompt: (sessionId) => {
    wsManager.send(sessionId, { type: 'cancel' })
    get().setStreaming(sessionId, false)
  },
})
