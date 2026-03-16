// Pi WebSocket message handler — streaming, tool execution, compaction, Pi JSON-RPC
// TEMPORARY: serves the legacy WorkspaceLegacy codepath. Deleted in Phase 8.

import type {
  PiWsMessage,
  PiThinkingLevel,
  PiSessionStats,
  PiSessionTree,
  PiForkableEntry,
  PiModelInfo,
} from '@/api/pi-types'
import { debouncedPersist, flushPersist } from './persistence'
import type { StoreGet, StoreSet } from './handler-types'

/** Handle first-class Pi WebSocket messages */
export function handlePiWebSocketMessage(
  sessionId: string,
  message: PiWsMessage,
  get: StoreGet,
  set: StoreSet
) {
  const { type, payload } = message
  const { activeSessionId } = get()
  const isActive = sessionId === activeSessionId

  switch (type) {
    case 'message_update': {
      const event = payload as {
        assistantMessageEvent: {
          type: string
          delta?: string
          toolCallId?: string
          toolName?: string
          error?: string
        }
      }
      const msgEvent = event.assistantMessageEvent

      if (msgEvent.type === 'text_delta' && msgEvent.delta) {
        const currentState = get().piStreamingState[sessionId]
        if (!currentState) {
          const msgId = crypto.randomUUID()
          get().setStreaming(sessionId, true, msgId)

          get().addMessage(sessionId, {
            id: msgId,
            sessionId,
            role: 'assistant',
            content: msgEvent.delta,
            timestamp: new Date().toISOString(),
          })

          set((state) => ({
            piStreamingState: {
              ...state.piStreamingState,
              [sessionId]: {
                messageId: msgId,
                contentBlocks: [{ type: 'text', text: msgEvent.delta || '' }],
                currentBlockIndex: 0,
                isStreaming: true,
              },
            },
          }))
        } else {
          const msgId = currentState.messageId
          const messages = get().messages[sessionId] || []
          const msgIndex = messages.findIndex((m) => m.id === msgId)
          if (msgIndex !== -1) {
            const msg = messages[msgIndex]
            const updatedContent = (typeof msg.content === 'string' ? msg.content : '') + msgEvent.delta
            get().updateMessage(sessionId, msgId, { content: updatedContent })
            debouncedPersist(sessionId, get().messages[sessionId] || [])
          }
        }
      } else if (msgEvent.type === 'done') {
        get().setStreaming(sessionId, false)
        flushPersist(sessionId, get().messages[sessionId] || [])
        set((state) => ({
          piStreamingState: { ...state.piStreamingState, [sessionId]: null },
        }))
        if (!isActive) {
          get().incrementUnread(sessionId)
        }
      } else if (msgEvent.type === 'error') {
        console.error('[Pi WS] Error:', msgEvent.error)
        get().setStreaming(sessionId, false)
        // Clear piStreamingState on error to prevent stale state
        set((state) => ({
          piStreamingState: { ...state.piStreamingState, [sessionId]: null },
        }))
      }
      break
    }

    case 'agent_start': {
      get().setStreaming(sessionId, true)
      break
    }

    case 'agent_end': {
      get().setStreaming(sessionId, false)
      flushPersist(sessionId, get().messages[sessionId] || [])
      set((state) => ({
        piStreamingState: { ...state.piStreamingState, [sessionId]: null },
      }))
      break
    }

    case 'tool_execution_start':
    case 'tool_execution_end':
    case 'auto_compaction_start':
    case 'auto_compaction_end':
      // These events are informational — UI chunks handle rendering
      break

    default:
      // Handle JSON-RPC responses for Pi-specific commands
      if (typeof payload === 'object' && payload !== null && 'method' in (payload as Record<string, unknown>)) {
        const rpcPayload = payload as { method: string; params: unknown }
        handlePiJsonRpcResponse(sessionId, rpcPayload.method, rpcPayload.params, get)
      } else if (import.meta.env.DEV) {
        console.log('[Pi WS] Unknown message type:', type)
      }
  }
}

/** Handle Pi JSON-RPC responses */
function handlePiJsonRpcResponse(
  sessionId: string,
  method: string,
  params: unknown,
  get: StoreGet
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
