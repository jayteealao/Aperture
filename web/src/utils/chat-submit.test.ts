import { beforeEach, describe, expect, it, vi } from 'vitest'
import { submitChatMessage } from './chat-submit'
import type { ChatSubmitDeps, ChatSubmitMessage } from './chat-submit'
import type { ConnectionState } from '@/api/types'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMessage(overrides?: Partial<ChatSubmitMessage>): ChatSubmitMessage {
  return {
    text: 'Hello world',
    files: [],
    ...overrides,
  }
}

function makeConnection(overrides?: Partial<ConnectionState>): ConnectionState {
  return {
    status: 'connected',
    error: null,
    retryCount: 0,
    isStreaming: false,
    hasUnread: false,
    unreadCount: 0,
    lastActivity: Date.now(),
    ...overrides,
  }
}

function makeDeps(overrides?: Partial<ChatSubmitDeps>): ChatSubmitDeps {
  return {
    connection: makeConnection(),
    sendMessage: vi.fn<ChatSubmitDeps['sendMessage']>().mockResolvedValue(undefined),
    notifyError: vi.fn(),
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('submitChatMessage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ── Happy path ──────────────────────────────────────────────────────────

  describe('happy path', () => {
    it('resolves when connected and sendMessage succeeds', async () => {
      const deps = makeDeps()
      await expect(submitChatMessage(makeMessage(), deps)).resolves.toBeUndefined()
    })

    it('calls sendMessage with text and metadata', async () => {
      const deps = makeDeps()
      await submitChatMessage(makeMessage({ text: 'test message' }), deps)

      expect(deps.sendMessage).toHaveBeenCalledOnce()
      expect(deps.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          text: 'test message',
          metadata: expect.objectContaining({ timestamp: expect.any(String) }),
        }),
      )
    })

    it('omits files when empty', async () => {
      const deps = makeDeps()
      await submitChatMessage(makeMessage({ files: [] }), deps)

      expect(deps.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({ files: undefined }),
      )
    })

    it('includes files when present', async () => {
      const deps = makeDeps()
      const files = [{ type: 'file' as const, url: 'data:image/png;base64,abc', mediaType: 'image/png', filename: 'pic.png' }]
      await submitChatMessage(makeMessage({ files }), deps)

      expect(deps.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({ files }),
      )
    })

    it('does not call notifyError on success', async () => {
      const deps = makeDeps()
      await submitChatMessage(makeMessage(), deps)

      expect(deps.notifyError).not.toHaveBeenCalled()
    })
  })

  // ── Disconnected (throw contract) ──────────────────────────────────────

  describe('when disconnected', () => {
    it.each<{ label: string; connection: ConnectionState | null }>([
      { label: 'null connection', connection: null },
      { label: 'status disconnected', connection: makeConnection({ status: 'disconnected' }) },
      { label: 'status connecting', connection: makeConnection({ status: 'connecting' }) },
      { label: 'status reconnecting', connection: makeConnection({ status: 'reconnecting' }) },
    ])('throws for $label', async ({ connection }) => {
      const deps = makeDeps({ connection })
      await expect(submitChatMessage(makeMessage(), deps)).rejects.toThrow('Not connected')
    })

    it('notifies with session-specific error copy', async () => {
      const deps = makeDeps({ connection: null })

      await submitChatMessage(makeMessage(), deps).catch(() => {})

      expect(deps.notifyError).toHaveBeenCalledOnce()
      expect(deps.notifyError).toHaveBeenCalledWith(
        'Session not connected',
        expect.stringContaining('reconnect'),
      )
    })

    it('does not call sendMessage', async () => {
      const deps = makeDeps({ connection: null })

      await submitChatMessage(makeMessage(), deps).catch(() => {})

      expect(deps.sendMessage).not.toHaveBeenCalled()
    })
  })

  // ── Send failure (re-throw contract) ───────────────────────────────────

  describe('when sendMessage rejects', () => {
    it('re-throws the original error', async () => {
      const sendError = new Error('WebSocket closed')
      const deps = makeDeps({
        sendMessage: vi.fn<ChatSubmitDeps['sendMessage']>().mockRejectedValue(sendError),
      })

      await expect(submitChatMessage(makeMessage(), deps)).rejects.toThrow('WebSocket closed')
    })

    it('notifies with send-failure error copy', async () => {
      const deps = makeDeps({
        sendMessage: vi.fn<ChatSubmitDeps['sendMessage']>().mockRejectedValue(new Error('timeout')),
      })

      await submitChatMessage(makeMessage(), deps).catch(() => {})

      expect(deps.notifyError).toHaveBeenCalledOnce()
      expect(deps.notifyError).toHaveBeenCalledWith(
        'Message not sent',
        expect.stringContaining('preserved'),
      )
    })
  })

  // ── Edge cases ─────────────────────────────────────────────────────────

  describe('edge cases', () => {
    it('includes ISO timestamp in metadata', async () => {
      const deps = makeDeps()
      await submitChatMessage(makeMessage(), deps)

      const call = vi.mocked(deps.sendMessage).mock.calls[0][0]
      // Validate it's a parseable ISO 8601 string
      expect(Number.isNaN(Date.parse(call.metadata.timestamp))).toBe(false)
    })

    it('handles message with only whitespace text (delegates validation to PromptInput)', async () => {
      const deps = makeDeps()
      // submitChatMessage does not validate empty text — PromptInput handles that
      await expect(submitChatMessage(makeMessage({ text: '   ' }), deps)).resolves.toBeUndefined()
    })
  })
})
