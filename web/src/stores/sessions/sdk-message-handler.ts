// SDK WebSocket message handler — content blocks, streaming, permissions
// TEMPORARY: serves the legacy WorkspaceLegacy codepath. Deleted in Phase 8.

import type {
  ContentBlock,
  SdkContentBlock,
  SdkWsMessage,
  SessionResult,
} from '@/api/types'
import { debouncedPersist, flushPersist } from './persistence'
import type { StoreGet, StoreSet } from './handler-types'

/**
 * Handle first-class SDK WebSocket messages.
 * These use native content block arrays instead of JSON-RPC wrapped format.
 */
export function handleSdkWebSocketMessage(
  sessionId: string,
  message: SdkWsMessage,
  get: StoreGet,
  set: StoreSet
) {
  const { type, payload } = message
  const { activeSessionId } = get()
  const isActive = sessionId === activeSessionId

  switch (type) {
    case 'content_block_start': {
      const { index, contentBlock } = payload as { index: number; contentBlock: SdkContentBlock }

      const currentState = get().sdkStreamingState[sessionId]
      if (!currentState) {
        const msgId = crypto.randomUUID()
        get().setStreaming(sessionId, true, msgId)

        // Message.content is string | ContentBlock[] — start with empty array
        get().addMessage(sessionId, {
          id: msgId,
          sessionId,
          role: 'assistant',
          content: [] as ContentBlock[],
          timestamp: new Date().toISOString(),
        })

        set((state) => ({
          sdkStreamingState: {
            ...state.sdkStreamingState,
            [sessionId]: {
              messageId: msgId,
              contentBlocks: [contentBlock],
              currentBlockIndex: index,
            },
          },
        }))
      } else {
        set((state) => {
          const streamState = state.sdkStreamingState[sessionId]
          if (!streamState) return state
          const blocks = [...streamState.contentBlocks]
          blocks[index] = contentBlock
          return {
            sdkStreamingState: {
              ...state.sdkStreamingState,
              [sessionId]: {
                ...streamState,
                contentBlocks: blocks,
                currentBlockIndex: index,
              },
            },
          }
        })
      }
      break
    }

    case 'assistant_delta': {
      const { index, delta } = payload as {
        index: number
        delta: { type: string; text?: string; thinking?: string; partial_json?: string }
      }

      set((state) => {
        const streamState = state.sdkStreamingState[sessionId]
        if (!streamState) return state

        const blocks = [...streamState.contentBlocks]
        const block = blocks[index]
        if (!block) return state

        if (delta.type === 'text_delta' && block.type === 'text') {
          blocks[index] = { ...block, text: (block.text || '') + (delta.text || '') }
        } else if (delta.type === 'thinking_delta' && block.type === 'thinking') {
          blocks[index] = { ...block, thinking: (block.thinking || '') + (delta.thinking || '') }
        } else if (delta.type === 'input_json_delta' && block.type === 'tool_use') {
          const currentInput = typeof block.input === 'string' ? block.input : ''
          blocks[index] = { ...block, input: currentInput + (delta.partial_json || '') }
        }

        const msgId = streamState.messageId
        const sessionMessages = state.messages[sessionId] || []
        const msgIndex = sessionMessages.findIndex((m) => m.id === msgId)
        if (msgIndex === -1) {
          return { sdkStreamingState: { ...state.sdkStreamingState, [sessionId]: { ...streamState, contentBlocks: blocks } } }
        }

        const updatedMessages = [...sessionMessages]
        updatedMessages[msgIndex] = {
          ...updatedMessages[msgIndex],
          content: blocks as ContentBlock[],
        }

        return {
          messages: { ...state.messages, [sessionId]: updatedMessages },
          sdkStreamingState: { ...state.sdkStreamingState, [sessionId]: { ...streamState, contentBlocks: blocks } },
        }
      })
      debouncedPersist(sessionId, get().messages[sessionId] || [])
      break
    }

    case 'content_block_stop': {
      const { index } = payload as { index: number }

      set((state) => {
        const streamState = state.sdkStreamingState[sessionId]
        if (!streamState) return state

        const blocks = [...streamState.contentBlocks]
        const block = blocks[index]

        // Parse tool_use accumulated JSON
        if (block?.type === 'tool_use' && typeof block.input === 'string') {
          try {
            blocks[index] = { ...block, input: JSON.parse(block.input) as unknown }
          } catch {
            // Keep as string if JSON parse fails
          }
        }

        const msgId = streamState.messageId
        const sessionMessages = state.messages[sessionId] || []
        const msgIndex = sessionMessages.findIndex((m) => m.id === msgId)
        if (msgIndex === -1) {
          return { sdkStreamingState: { ...state.sdkStreamingState, [sessionId]: { ...streamState, contentBlocks: blocks } } }
        }

        const updatedMessages = [...sessionMessages]
        updatedMessages[msgIndex] = {
          ...updatedMessages[msgIndex],
          content: blocks as ContentBlock[],
        }

        return {
          messages: { ...state.messages, [sessionId]: updatedMessages },
          sdkStreamingState: { ...state.sdkStreamingState, [sessionId]: { ...streamState, contentBlocks: blocks } },
        }
      })
      debouncedPersist(sessionId, get().messages[sessionId] || [])
      break
    }

    case 'assistant_message': {
      const { messageId, content } = payload as {
        messageId: string
        stopReason?: string
        usage?: { input_tokens: number; output_tokens: number }
        content: SdkContentBlock[]
      }

      const streamState = get().sdkStreamingState[sessionId]
      if (streamState) {
        get().updateMessage(sessionId, streamState.messageId, {
          content: content as ContentBlock[],
        })
      } else {
        get().addMessage(sessionId, {
          id: messageId || crypto.randomUUID(),
          sessionId,
          role: 'assistant',
          content: content as ContentBlock[],
          timestamp: new Date().toISOString(),
        })
      }

      flushPersist(sessionId, get().messages[sessionId] || [])

      set((state) => ({
        sdkStreamingState: { ...state.sdkStreamingState, [sessionId]: null },
      }))

      if (!isActive) {
        get().incrementUnread(sessionId)
      }
      break
    }

    case 'prompt_complete':
    case 'prompt_error': {
      get().setStreaming(sessionId, false)
      flushPersist(sessionId, get().messages[sessionId] || [])

      set((state) => ({
        sdkStreamingState: { ...state.sdkStreamingState, [sessionId]: null },
      }))

      if (type === 'prompt_complete') {
        const result = payload as SessionResult
        get().setSdkUsage(sessionId, result)
      }
      break
    }

    case 'permission_request': {
      const params = payload as { toolCallId: string; toolCall: unknown; options: unknown[] }
      get().setStreaming(sessionId, false)
      get().addPendingPermission(sessionId, params)
      if (!isActive) {
        get().incrementUnread(sessionId)
      }
      break
    }

    default:
      if (import.meta.env.DEV) {
        console.log('[SDK WS] Unknown message type:', type)
      }
  }
}
