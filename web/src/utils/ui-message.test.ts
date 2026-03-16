import { describe, expect, it } from 'vitest'
import type { Message } from '@/api/types'
import { coerceStoredMessagesToUIMessages, legacyMessageToUIMessage } from './ui-message'

describe('legacyMessageToUIMessage', () => {
  it('maps text, reasoning, image, and tool blocks to UI parts', () => {
    const message: Message = {
      id: 'assistant-1',
      role: 'assistant',
      timestamp: '2026-03-14T12:00:00.000Z',
      content: [
        { type: 'thinking', thinking: 'checking' },
        { type: 'text', text: 'Hello' },
        { type: 'image', mimeType: 'image/png', data: 'abc123', filename: 'shot.png' },
        { type: 'tool_use', id: 'tool-1', name: 'bash', input: { command: 'pwd' } },
        { type: 'tool_result', tool_use_id: 'tool-1', content: '/repo' },
      ],
    }

    const result = legacyMessageToUIMessage(message)

    expect(result.metadata?.timestamp).toBe(message.timestamp)
    expect(result.parts).toEqual([
      { type: 'reasoning', text: 'checking' },
      { type: 'text', text: 'Hello' },
      {
        type: 'file',
        mediaType: 'image/png',
        filename: 'shot.png',
        url: 'data:image/png;base64,abc123',
      },
      {
        type: 'dynamic-tool',
        toolName: 'bash',
        toolCallId: 'tool-1',
        input: { command: 'pwd' },
        state: 'output-available',
        output: '/repo',
      },
    ])
  })
})

describe('coerceStoredMessagesToUIMessages', () => {
  it('accepts already-migrated UI messages and legacy messages in the same payload', () => {
    const result = coerceStoredMessagesToUIMessages([
      {
        id: 'user-1',
        role: 'user',
        metadata: { timestamp: '2026-03-14T12:00:00.000Z' },
        parts: [{ type: 'text', text: 'Hi' }],
      },
      {
        id: 'assistant-1',
        role: 'assistant',
        timestamp: '2026-03-14T12:00:01.000Z',
        content: 'Hello',
      },
    ])

    expect(result).toHaveLength(2)
    expect(result[0].parts).toEqual([{ type: 'text', text: 'Hi' }])
    expect(result[1].parts).toEqual([{ type: 'text', text: 'Hello' }])
  })
})
