import type { FileUIPart } from 'ai'
import type { ConnectionState } from '@/api/types'

export interface ChatSubmitDeps {
  connection: ConnectionState | null
  sendMessage: (payload: {
    text: string
    files?: FileUIPart[]
    metadata: { timestamp: string }
  }) => Promise<unknown>
  notifyError: (title: string, body: string) => void
}

export interface ChatSubmitMessage {
  text: string
  files: FileUIPart[]
}

/**
 * Validates the connection state and delegates to sendMessage.
 *
 * **Contract**: throws on failure so that PromptInput preserves the user's
 * input for retry. Callers must NOT swallow exceptions.
 *
 * - Disconnected → throws immediately (input preserved).
 * - sendMessage rejection → re-throws after notifying (input preserved).
 * - Success → resolves normally (PromptInput clears input).
 */
export async function submitChatMessage(
  message: ChatSubmitMessage,
  deps: ChatSubmitDeps,
): Promise<void> {
  const { connection, sendMessage, notifyError } = deps

  if (!connection || connection.status !== 'connected') {
    notifyError('Session not connected', 'Wait for the session to reconnect, or start a new one.')
    throw new Error('Not connected')
  }

  try {
    await sendMessage({
      text: message.text,
      files: message.files.length > 0 ? message.files : undefined,
      metadata: { timestamp: new Date().toISOString() },
    })
  } catch (error) {
    console.error('[useChat] Send error:', error)
    notifyError('Message not sent', 'Something went wrong. Your message has been preserved — try again.')
    throw error
  }
}
