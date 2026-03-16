import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { UIMessage, UIMessageChunk } from 'ai'
import { ApertureWebSocketTransport } from './chat-transport'

// ---------------------------------------------------------------------------
// wsManager mock
// ---------------------------------------------------------------------------

const mockOnUIChunk = vi.hoisted(() => vi.fn<[string, (chunk: UIMessageChunk) => void], () => void>())
const mockSend = vi.hoisted(() => vi.fn<[string, unknown], boolean>())

vi.mock('@/api/websocket', () => ({
  wsManager: {
    send: mockSend,
    onUIChunk: mockOnUIChunk,
  },
}))

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Captured chunk handlers registered via wsManager.onUIChunk */
let capturedHandler: ((chunk: UIMessageChunk) => void) | null = null
/** Cleanup spy returned from onUIChunk */
let cleanupSpy: ReturnType<typeof vi.fn>

function buildTransport(sessionId = 'session-1') {
  return new ApertureWebSocketTransport(sessionId)
}

function makeUserMessage(text: string, files?: Array<{ url: string; mediaType: string; filename?: string }>): UIMessage {
  return {
    id: 'msg-1',
    role: 'user',
    parts: [
      { type: 'text', text },
      ...(files ?? []).map((f) => ({
        type: 'file' as const,
        url: f.url,
        mediaType: f.mediaType,
        filename: f.filename,
      })),
    ],
    content: text,
  }
}

function defaultSendOptions(
  overrides: Partial<{
    messages: UIMessage[]
    abortSignal: AbortSignal
    messageId: string
  }> = {}
) {
  return {
    trigger: 'submit-message' as const,
    chatId: 'chat-1',
    messageId: overrides.messageId,
    messages: overrides.messages ?? [makeUserMessage('Hello')],
    abortSignal: overrides.abortSignal,
  }
}

/** Read all chunks from a ReadableStream until closed */
async function readAllChunks(stream: ReadableStream<UIMessageChunk>): Promise<UIMessageChunk[]> {
  const reader = stream.getReader()
  const chunks: UIMessageChunk[] = []
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
  }
  return chunks
}

/** Read chunks while also pushing server-side chunks via the captured handler */
async function driveStream(
  stream: ReadableStream<UIMessageChunk>,
  serverChunks: UIMessageChunk[]
): Promise<UIMessageChunk[]> {
  const reader = stream.getReader()
  const received: UIMessageChunk[] = []

  // Push server chunks asynchronously so the ReadableStream start() has run
  Promise.resolve().then(() => {
    for (const chunk of serverChunks) {
      capturedHandler?.(chunk)
    }
  })

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    received.push(value)
  }
  return received
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  capturedHandler = null
  cleanupSpy = vi.fn()

  mockOnUIChunk.mockReset()
  mockSend.mockReset()

  mockOnUIChunk.mockImplementation((_sessionId, handler) => {
    capturedHandler = handler
    return cleanupSpy
  })

  // Default: send succeeds
  mockSend.mockReturnValue(true)
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ApertureWebSocketTransport', () => {
  // -------------------------------------------------------------------------
  // 1. Happy path
  // -------------------------------------------------------------------------
  describe('happy path', () => {
    it('registers an onUIChunk listener for the correct session', async () => {
      const transport = buildTransport('my-session')
      const stream = await transport.sendMessages(defaultSendOptions())

      // Drive stream to completion
      await driveStream(stream, [
        { type: 'text', text: 'Hello back' },
        { type: 'finish', finishReason: 'stop', usage: { promptTokens: 1, completionTokens: 1 } },
      ])

      expect(mockOnUIChunk).toHaveBeenCalledWith('my-session', expect.any(Function))
    })

    it('sends a user_message via wsManager.send with the correct content', async () => {
      const transport = buildTransport('session-1')
      const stream = await transport.sendMessages(defaultSendOptions({
        messages: [makeUserMessage('Say hello')],
      }))

      await driveStream(stream, [
        { type: 'finish', finishReason: 'stop', usage: { promptTokens: 1, completionTokens: 1 } },
      ])

      expect(mockSend).toHaveBeenCalledWith('session-1', {
        type: 'user_message',
        content: 'Say hello',
      })
    })

    it('enqueues text chunks received from the server', async () => {
      const transport = buildTransport()
      const stream = await transport.sendMessages(defaultSendOptions())

      const chunks = await driveStream(stream, [
        { type: 'text', text: 'chunk 1' },
        { type: 'text', text: 'chunk 2' },
        { type: 'finish', finishReason: 'stop', usage: { promptTokens: 1, completionTokens: 1 } },
      ])

      expect(chunks).toEqual([
        { type: 'text', text: 'chunk 1' },
        { type: 'text', text: 'chunk 2' },
        { type: 'finish', finishReason: 'stop', usage: { promptTokens: 1, completionTokens: 1 } },
      ])
    })

    it('closes the stream after a finish chunk', async () => {
      const transport = buildTransport()
      const stream = await transport.sendMessages(defaultSendOptions())

      const reader = stream.getReader()

      // Push server chunks after the ReadableStream start() has run
      Promise.resolve().then(() => {
        capturedHandler?.({ type: 'finish', finishReason: 'stop', usage: { promptTokens: 1, completionTokens: 1 } })
      })

      const chunks: UIMessageChunk[] = []
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        chunks.push(value)
      }

      // The stream is done — a further read confirms it
      const { done } = await reader.read()
      expect(done).toBe(true)
      expect(chunks[chunks.length - 1]?.type).toBe('finish')
    })

    it('calls cleanup after stream closes via finish', async () => {
      const transport = buildTransport()
      const stream = await transport.sendMessages(defaultSendOptions())

      await driveStream(stream, [
        { type: 'finish', finishReason: 'stop', usage: { promptTokens: 1, completionTokens: 1 } },
      ])

      expect(cleanupSpy).toHaveBeenCalledTimes(1)
    })

    it('closes the stream after an error chunk', async () => {
      const transport = buildTransport()
      const stream = await transport.sendMessages(defaultSendOptions())

      const chunks = await driveStream(stream, [
        { type: 'error', errorText: 'server error' },
      ])

      expect(chunks).toEqual([{ type: 'error', errorText: 'server error' }])
      expect(cleanupSpy).toHaveBeenCalledTimes(1)
    })

    it('uses the last user message text when multiple messages are present', async () => {
      const transport = buildTransport('session-1')
      const assistantMessage: UIMessage = {
        id: 'msg-0',
        role: 'assistant',
        parts: [{ type: 'text', text: 'I am an assistant' }],
        content: 'I am an assistant',
      }
      const stream = await transport.sendMessages(defaultSendOptions({
        messages: [assistantMessage, makeUserMessage('Final user message')],
      }))

      await driveStream(stream, [
        { type: 'finish', finishReason: 'stop', usage: { promptTokens: 1, completionTokens: 1 } },
      ])

      expect(mockSend).toHaveBeenCalledWith('session-1', expect.objectContaining({
        content: 'Final user message',
      }))
    })

    it('concatenates multiple text parts from the last user message', async () => {
      const transport = buildTransport('session-1')
      const multiPartMessage: UIMessage = {
        id: 'msg-1',
        role: 'user',
        parts: [
          { type: 'text', text: 'Hello ' },
          { type: 'text', text: 'world' },
        ],
        content: 'Hello world',
      }
      const stream = await transport.sendMessages(defaultSendOptions({ messages: [multiPartMessage] }))

      await driveStream(stream, [
        { type: 'finish', finishReason: 'stop', usage: { promptTokens: 1, completionTokens: 1 } },
      ])

      expect(mockSend).toHaveBeenCalledWith('session-1', expect.objectContaining({
        content: 'Hello world',
      }))
    })
  })

  // -------------------------------------------------------------------------
  // 2. Send failure
  // -------------------------------------------------------------------------
  describe('send failure', () => {
    it('enqueues an error chunk and closes the stream when send returns false', async () => {
      mockSend.mockReturnValue(false)

      const transport = buildTransport()
      const stream = await transport.sendMessages(defaultSendOptions())
      const chunks = await readAllChunks(stream)

      expect(chunks).toEqual([
        { type: 'error', errorText: 'Failed to send message - not connected' },
      ])
    })

    it('calls cleanup when send fails', async () => {
      mockSend.mockReturnValue(false)

      const transport = buildTransport()
      const stream = await transport.sendMessages(defaultSendOptions())
      await readAllChunks(stream)

      expect(cleanupSpy).toHaveBeenCalledTimes(1)
    })

    it('stream is done after send failure', async () => {
      mockSend.mockReturnValue(false)

      const transport = buildTransport()
      const stream = await transport.sendMessages(defaultSendOptions())
      const reader = stream.getReader()

      const chunks: UIMessageChunk[] = []
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        chunks.push(value)
      }

      // Reader is already at done; a further read confirms it
      const { done } = await reader.read()
      expect(done).toBe(true)
    })
  })

  // -------------------------------------------------------------------------
  // 3. Abort signal
  // -------------------------------------------------------------------------
  describe('abort signal', () => {
    it('sends a cancel message when the abort signal fires', async () => {
      const controller = new AbortController()
      const transport = buildTransport('session-1')
      const stream = await transport.sendMessages(defaultSendOptions({ abortSignal: controller.signal }))

      const reader = stream.getReader()

      // Give the ReadableStream start() callback time to register
      await Promise.resolve()

      controller.abort()

      // Drain remaining chunks
      const chunks: UIMessageChunk[] = []
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        chunks.push(value)
      }

      expect(mockSend).toHaveBeenCalledWith('session-1', { type: 'cancel' })
    })

    it('enqueues an abort chunk when the signal fires', async () => {
      const controller = new AbortController()
      const transport = buildTransport()
      const stream = await transport.sendMessages(defaultSendOptions({ abortSignal: controller.signal }))

      const reader = stream.getReader()
      await Promise.resolve()

      controller.abort()

      const chunks: UIMessageChunk[] = []
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        chunks.push(value)
      }

      expect(chunks).toContainEqual({ type: 'abort', reason: 'Request aborted' })
    })

    it('closes the stream after abort', async () => {
      const controller = new AbortController()
      const transport = buildTransport()
      const stream = await transport.sendMessages(defaultSendOptions({ abortSignal: controller.signal }))

      const reader = stream.getReader()
      await Promise.resolve()

      controller.abort()

      const chunks: UIMessageChunk[] = []
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        chunks.push(value)
      }

      // Stream is now closed; subsequent read must be done
      const { done } = await reader.read()
      expect(done).toBe(true)
    })

    it('calls cleanup after abort', async () => {
      const controller = new AbortController()
      const transport = buildTransport()
      const stream = await transport.sendMessages(defaultSendOptions({ abortSignal: controller.signal }))

      const reader = stream.getReader()
      await Promise.resolve()
      controller.abort()

      while (true) {
        const { done } = await reader.read()
        if (done) break
      }

      expect(cleanupSpy).toHaveBeenCalledTimes(1)
    })
  })

  // -------------------------------------------------------------------------
  // 4. Double-close guard
  // -------------------------------------------------------------------------
  describe('double-close guard', () => {
    it('does not throw when a server chunk arrives after abort closes the stream', async () => {
      const controller = new AbortController()
      const transport = buildTransport()
      const stream = await transport.sendMessages(defaultSendOptions({ abortSignal: controller.signal }))

      const reader = stream.getReader()
      await Promise.resolve()

      // Abort first — this closes the stream
      controller.abort()

      // Drain the abort chunk
      while (true) {
        const { done } = await reader.read()
        if (done) break
      }

      // Now simulate a late finish chunk arriving from the server — must not throw
      expect(() => {
        capturedHandler?.({
          type: 'finish',
          finishReason: 'stop',
          usage: { promptTokens: 1, completionTokens: 1 },
        })
      }).not.toThrow()
    })

    it('does not call cleanup more than once when finish follows abort', async () => {
      const controller = new AbortController()
      const transport = buildTransport()
      const stream = await transport.sendMessages(defaultSendOptions({ abortSignal: controller.signal }))

      const reader = stream.getReader()
      await Promise.resolve()

      controller.abort()

      while (true) {
        const { done } = await reader.read()
        if (done) break
      }

      // Push a late finish chunk
      capturedHandler?.({
        type: 'finish',
        finishReason: 'stop',
        usage: { promptTokens: 1, completionTokens: 1 },
      })

      // cleanup was called once at abort; the late finish chunk is a no-op
      expect(cleanupSpy).toHaveBeenCalledTimes(1)
    })
  })

  // -------------------------------------------------------------------------
  // 5. Image attachment extraction
  // -------------------------------------------------------------------------
  describe('image attachment extraction', () => {
    it('includes images in the sent message when file parts are present', async () => {
      const transport = buildTransport('session-1')
      const messageWithImage = makeUserMessage('Look at this', [
        {
          url: 'data:image/png;base64,iVBORw0KGgo=',
          mediaType: 'image/png',
          filename: 'screenshot.png',
        },
      ])

      const stream = await transport.sendMessages(defaultSendOptions({ messages: [messageWithImage] }))
      await driveStream(stream, [
        { type: 'finish', finishReason: 'stop', usage: { promptTokens: 1, completionTokens: 1 } },
      ])

      expect(mockSend).toHaveBeenCalledWith('session-1', {
        type: 'user_message',
        content: 'Look at this',
        images: [
          {
            data: 'iVBORw0KGgo=',
            mimeType: 'image/png',
            filename: 'screenshot.png',
          },
        ],
      })
    })

    it('strips the data URI prefix from the base64 data', async () => {
      const transport = buildTransport('session-1')
      const messageWithImage = makeUserMessage('Here', [
        {
          url: 'data:image/jpeg;base64,/9j/4AAQSkZJRgAB',
          mediaType: 'image/jpeg',
          filename: 'photo.jpg',
        },
      ])

      const stream = await transport.sendMessages(defaultSendOptions({ messages: [messageWithImage] }))
      await driveStream(stream, [
        { type: 'finish', finishReason: 'stop', usage: { promptTokens: 1, completionTokens: 1 } },
      ])

      const sentPayload = mockSend.mock.lastCall?.[1] as { images?: Array<{ data: string }> } | undefined
      expect(sentPayload?.images?.[0]?.data).toBe('/9j/4AAQSkZJRgAB')
    })

    it('does not include an images key when there are no file parts', async () => {
      const transport = buildTransport('session-1')
      const stream = await transport.sendMessages(defaultSendOptions({
        messages: [makeUserMessage('Just text')],
      }))
      await driveStream(stream, [
        { type: 'finish', finishReason: 'stop', usage: { promptTokens: 1, completionTokens: 1 } },
      ])

      expect(mockSend).toHaveBeenCalledWith('session-1', {
        type: 'user_message',
        content: 'Just text',
      })
      // Confirm no images key present
      const call = mockSend.mock.calls[0]
      expect(call?.[1]).not.toHaveProperty('images')
    })

    it('handles multiple image attachments', async () => {
      const transport = buildTransport('session-1')
      const messageWithImages = makeUserMessage('Two images', [
        { url: 'data:image/png;base64,AAAA', mediaType: 'image/png', filename: 'a.png' },
        { url: 'data:image/png;base64,BBBB', mediaType: 'image/png', filename: 'b.png' },
      ])

      const stream = await transport.sendMessages(defaultSendOptions({ messages: [messageWithImages] }))
      await driveStream(stream, [
        { type: 'finish', finishReason: 'stop', usage: { promptTokens: 1, completionTokens: 1 } },
      ])

      const payload = mockSend.mock.lastCall?.[1] as { images?: Array<{ data: string; filename?: string }> } | undefined
      expect(payload?.images).toHaveLength(2)
      expect(payload?.images?.[0]?.data).toBe('AAAA')
      expect(payload?.images?.[1]?.data).toBe('BBBB')
    })
  })

  // -------------------------------------------------------------------------
  // 6. reconnectToStream
  // -------------------------------------------------------------------------
  describe('reconnectToStream', () => {
    it('returns null', async () => {
      const transport = buildTransport()
      const result = await transport.reconnectToStream()
      expect(result).toBeNull()
    })
  })
})
