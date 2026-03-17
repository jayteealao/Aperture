// Pi WebSocket message handler — streaming state and Pi JSON-RPC responses
// Content rendering is handled by WsToUIChunkTranslator + useChat.
// This handler only updates the non-message parts of the store that
// PiControlPanel, PermissionRequest, and connection status rely on.

import type {
  PiWsMessage,
  PiThinkingLevel,
  PiSessionStats,
  PiSessionTree,
  PiForkableEntry,
  PiModelInfo,
} from '@/api/pi-types'
import type { StoreGet, StoreSet } from './handler-types'

export function handlePiWebSocketMessage(
  sessionId: string,
  message: PiWsMessage,
  get: StoreGet,
  _set: StoreSet,
) {
  const { type, payload } = message

  switch (type) {
    case 'message_update': {
      const event = payload as {
        assistantMessageEvent: { type: string; delta?: string; error?: string }
      }
      const msgEvent = event.assistantMessageEvent

      if (msgEvent.type === 'text_delta' && msgEvent.delta) {
        if (!get().connections[sessionId]?.isStreaming) {
          get().setStreaming(sessionId, true)
        }
      } else if (msgEvent.type === 'done') {
        const { activeSessionId } = get()
        get().setStreaming(sessionId, false)
        if (sessionId !== activeSessionId) {
          get().incrementUnread(sessionId)
        }
      } else if (msgEvent.type === 'error') {
        if (import.meta.env.DEV) {
          console.error('[Pi WS] Error:', msgEvent.error)
        }
        get().setStreaming(sessionId, false)
        const rawError = typeof msgEvent.error === 'string' ? msgEvent.error : null
        const safeError = rawError !== null && rawError.length <= 200 ? rawError : 'Session error'
        get().updateConnection(sessionId, { status: 'error', error: safeError })
      }
      break
    }

    case 'agent_start':
      get().setStreaming(sessionId, true)
      break

    case 'agent_end':
      get().setStreaming(sessionId, false)
      break

    case 'tool_execution_start':
    case 'tool_execution_end':
    case 'auto_compaction_start':
    case 'auto_compaction_end':
      // These events are informational — UI chunks handle rendering
      break

    default:
      if (
        typeof payload === 'object' &&
        payload !== null &&
        'method' in (payload as Record<string, unknown>)
      ) {
        const rpcPayload = payload as { method: string; params: unknown }
        handlePiJsonRpcResponse(sessionId, rpcPayload.method, rpcPayload.params, get)
      } else if (import.meta.env.DEV) {
        console.log('[Pi WS] Unknown message type:', type)
      }
  }
}

function handlePiJsonRpcResponse(
  sessionId: string,
  method: string,
  params: unknown,
  get: StoreGet,
) {
  switch (method) {
    case 'pi/model_changed':
      // Informational — UI updates via config/models
      break

    case 'pi/thinking_level_changed': {
      const level = params as { level: PiThinkingLevel }
      get().setPiThinkingLevel(sessionId, level.level)
      break
    }

    case 'pi/session_tree': {
      const tree = (params as { tree: PiSessionTree | null }).tree
      get().setPiSessionTree(sessionId, tree)
      get().setPiLoading(sessionId, { tree: false })
      break
    }

    case 'pi/forkable_entries': {
      const entries = (params as { entries: PiForkableEntry[] }).entries
      get().setPiForkableEntries(sessionId, entries)
      get().setPiLoading(sessionId, { forkable: false })
      break
    }

    case 'pi/session_stats': {
      const stats = (params as { stats: PiSessionStats | null }).stats
      get().setPiStats(sessionId, stats)
      get().setPiLoading(sessionId, { stats: false })
      break
    }

    case 'pi/available_models': {
      const data = params as { models?: PiModelInfo[]; error?: string }
      if (data.models) {
        get().setPiModels(sessionId, data.models)
      } else if (data.error) {
        get().setPiErrors(sessionId, { models: data.error })
      }
      get().setPiLoading(sessionId, { models: false })
      break
    }

    default:
      if (import.meta.env.DEV) {
        console.log('[Pi RPC] Unknown method:', method)
      }
  }
}
