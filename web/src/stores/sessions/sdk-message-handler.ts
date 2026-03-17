// SDK WebSocket message handler — streaming state, permissions, usage
// Content rendering is handled by WsToUIChunkTranslator + useChat.
// This handler only updates the non-message parts of the store that
// SdkControlPanel, PermissionRequest, and connection status rely on.

import type { SdkWsMessage, SessionResult } from '@/api/types'
import type { StoreGet, StoreSet } from './handler-types'

export function handleSdkWebSocketMessage(
  sessionId: string,
  message: SdkWsMessage,
  get: StoreGet,
  _set: StoreSet,
) {
  const { type, payload } = message

  switch (type) {
    case 'content_block_start': {
      if (!get().connections[sessionId]?.isStreaming) {
        get().setStreaming(sessionId, true)
      }
      break
    }

    case 'prompt_complete': {
      get().setStreaming(sessionId, false)
      get().setSdkUsage(sessionId, payload as SessionResult)
      break
    }

    case 'prompt_error': {
      get().setStreaming(sessionId, false)
      break
    }

    case 'permission_request': {
      const params = payload as { toolCallId: string; toolCall: unknown; options: unknown[] }
      get().setStreaming(sessionId, false)
      get().addPendingPermission(sessionId, params)
      if (sessionId !== get().activeSessionId) {
        get().incrementUnread(sessionId)
      }
      break
    }

    default:
      break
  }
}
