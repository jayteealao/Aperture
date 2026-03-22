import { describe, expect, it } from 'vitest'
import { buildRenderedMessageParts, isSafeUrl } from './ApertureMessage'
import type { ApertureUIMessage } from '@/utils/ui-message'

function createToolPart(toolName: string, toolCallId: string) {
  return {
    type: 'dynamic-tool' as const,
    toolName,
    toolCallId,
    input: { id: toolCallId },
    state: 'output-available' as const,
    output: `${toolName}-${toolCallId}`,
  }
}

function createMessage(parts: ApertureUIMessage['parts']): ApertureUIMessage {
  return {
    id: 'message-1',
    role: 'assistant',
    metadata: { timestamp: '2026-03-22T12:00:00.000Z' },
    parts,
  }
}

describe('isSafeUrl', () => {
  it.each([
    ['https://example.com/image.png', true],
    ['http://localhost:3000/file.txt', true],
    ['data:image/png;base64,abc123', true],
    ['blob:http://localhost/uuid-here', true],
  ])('allows safe protocol: %s', (url, expected) => {
    expect(isSafeUrl(url)).toBe(expected)
  })

  it.each([
    ['javascript:alert(1)', false],
    ['vbscript:msgbox', false],
    ['file:///etc/passwd', false],
    ['ftp://example.com/file', false],
  ])('blocks unsafe protocol: %s', (url, expected) => {
    expect(isSafeUrl(url)).toBe(expected)
  })

  it.each([
    ['', false],
    ['not-a-url', false],
    ['://missing-scheme', false],
  ])('rejects malformed URL: %s', (url, expected) => {
    expect(isSafeUrl(url)).toBe(expected)
  })
})

describe('buildRenderedMessageParts', () => {
  it('groups adjacent same-family tool runs even when the overall tool block is mixed', () => {
    const message = createMessage([
      createToolPart('Read', 'read-1'),
      createToolPart('Read', 'read-2'),
      createToolPart('Bash', 'bash-1'),
      createToolPart('Bash', 'bash-2'),
    ])

    const parts = buildRenderedMessageParts(message)

    expect(parts).toHaveLength(2)
    expect(parts[0]).toMatchObject({
      kind: 'tool-group',
      key: 'read-1-group',
    })
    expect(parts[1]).toMatchObject({
      kind: 'tool-group',
      key: 'bash-1-group',
    })

    if (parts[0].kind !== 'tool-group' || parts[1].kind !== 'tool-group') {
      throw new Error('Expected grouped tool parts')
    }

    expect(parts[0].parts.map((part) => part.toolCallId)).toEqual(['read-1', 'read-2'])
    expect(parts[1].parts.map((part) => part.toolCallId)).toEqual(['bash-1', 'bash-2'])
  })

  it('does not group tool calls across non-tool boundaries', () => {
    const message = createMessage([
      createToolPart('Read', 'read-1'),
      { type: 'text' as const, text: 'boundary' },
      createToolPart('Read', 'read-2'),
      createToolPart('Read', 'read-3'),
    ])

    const parts = buildRenderedMessageParts(message)

    expect(parts).toHaveLength(3)
    expect(parts[0]).toMatchObject({ kind: 'tool', key: 'read-1' })
    expect(parts[1]).toMatchObject({ kind: 'text', key: 'message-1-1' })
    expect(parts[2]).toMatchObject({ kind: 'tool-group', key: 'read-2-group' })

    if (parts[2].kind !== 'tool-group') {
      throw new Error('Expected grouped trailing tool parts')
    }

    expect(parts[2].parts.map((part) => part.toolCallId)).toEqual(['read-2', 'read-3'])
  })
})
