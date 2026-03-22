import { describe, expect, it } from 'vitest'
import { buildConversationRenderItems } from './conversation-grouping'
import type { ApertureUIMessage } from '@/utils/ui-message'

function createToolMessage(id: string, toolName: string): ApertureUIMessage {
  return {
    id,
    role: 'assistant',
    metadata: { timestamp: '2026-03-22T12:00:00.000Z' },
    parts: [
      {
        type: 'dynamic-tool',
        toolName,
        toolCallId: `${id}-${toolName}`,
        input: { id },
        state: 'output-available',
        output: `${toolName}-${id}`,
      },
    ],
  }
}

describe('buildConversationRenderItems', () => {
  it('groups adjacent assistant tool messages by tool family', () => {
    const items = buildConversationRenderItems([
      createToolMessage('read-1', 'Read'),
      createToolMessage('read-2', 'Read'),
      createToolMessage('bash-1', 'Bash'),
      createToolMessage('bash-2', 'Bash'),
    ])

    expect(items).toHaveLength(2)
    expect(items[0]).toMatchObject({
      kind: 'tool-group',
      key: 'read-1-Read-conversation-group',
    })
    expect(items[1]).toMatchObject({
      kind: 'tool-group',
      key: 'bash-1-Bash-conversation-group',
    })

    if (items[0].kind !== 'tool-group' || items[1].kind !== 'tool-group') {
      throw new Error('Expected grouped tool conversation items')
    }

    expect(items[0].parts.map((part) => part.toolCallId)).toEqual([
      'read-1-Read',
      'read-2-Read',
    ])
    expect(items[1].parts.map((part) => part.toolCallId)).toEqual([
      'bash-1-Bash',
      'bash-2-Bash',
    ])
  })

  it('stops grouping at non-tool messages', () => {
    const textMessage: ApertureUIMessage = {
      id: 'text-1',
      role: 'assistant',
      metadata: { timestamp: '2026-03-22T12:01:00.000Z' },
      parts: [{ type: 'text', text: 'boundary' }],
    }

    const items = buildConversationRenderItems([
      createToolMessage('read-1', 'Read'),
      textMessage,
      createToolMessage('read-2', 'Read'),
      createToolMessage('read-3', 'Read'),
    ])

    expect(items).toHaveLength(3)
    expect(items[0]).toMatchObject({ kind: 'message', key: 'read-1' })
    expect(items[1]).toMatchObject({ kind: 'message', key: 'text-1' })
    expect(items[2]).toMatchObject({
      kind: 'tool-group',
      key: 'read-2-Read-conversation-group',
    })
  })
})
