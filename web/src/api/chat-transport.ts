import type { ChatRequestOptions, ChatTransport, UIMessage, UIMessageChunk } from 'ai'
import type { ImageAttachment } from './types'
import { wsManager } from './websocket'

export class ApertureWebSocketTransport implements ChatTransport<UIMessage> {
  constructor(private readonly sessionId: string) {}

  async sendMessages(
    options: {
      trigger: 'submit-message' | 'regenerate-message'
      chatId: string
      messageId: string | undefined
      messages: UIMessage[]
      abortSignal: AbortSignal | undefined
    } & ChatRequestOptions
  ): Promise<ReadableStream<UIMessageChunk>> {
    const { abortSignal, messages } = options

    return new ReadableStream<UIMessageChunk>({
      start: (controller) => {
        let closed = false

        const close = () => {
          if (closed) {
            return
          }
          closed = true
          controller.close()
        }

        const cleanup = wsManager.onUIChunk(this.sessionId, (chunk) => {
          if (closed) {
            return
          }

          controller.enqueue(chunk)
          if (chunk.type === 'finish' || chunk.type === 'error' || chunk.type === 'abort') {
            close()
            cleanup()
          }
        })

        const lastUserMessage = [...messages].reverse().find((message) => message.role === 'user')
        const text = lastUserMessage?.parts
          .filter((part): part is Extract<UIMessage['parts'][number], { type: 'text' }> => part.type === 'text')
          .map((part) => part.text)
          .join('') ?? ''

        const images: ImageAttachment[] | undefined = lastUserMessage?.parts
          .filter((part): part is Extract<UIMessage['parts'][number], { type: 'file' }> => part.type === 'file')
          .map((part) => ({
            data: part.url.replace(/^data:[^;]+;base64,/, ''),
            mimeType: part.mediaType as ImageAttachment['mimeType'],
            filename: part.filename,
          }))

        const sent = wsManager.send(this.sessionId, {
          type: 'user_message',
          content: text,
          ...(images && images.length > 0 ? { images } : {}),
        })

        if (!sent) {
          controller.enqueue({
            type: 'error',
            errorText: 'Failed to send message - not connected',
          })
          close()
          cleanup()
          return
        }

        abortSignal?.addEventListener(
          'abort',
          () => {
            wsManager.send(this.sessionId, { type: 'cancel' })
            if (!closed) {
              controller.enqueue({ type: 'abort', reason: 'Request aborted' })
              close()
            }
            cleanup()
          },
          { once: true }
        )
      },
    })
  }

  async reconnectToStream(): Promise<ReadableStream<UIMessageChunk> | null> {
    return null
  }
}
