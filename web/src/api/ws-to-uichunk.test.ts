import { describe, expect, it } from 'vitest'
import { WsToUIChunkTranslator } from './ws-to-uichunk'

describe('WsToUIChunkTranslator', () => {
  it('translates an SDK text stream into UI message chunks', () => {
    const translator = new WsToUIChunkTranslator()

    expect(
      translator.translateSdkEvent('content_block_start', {
        contentBlock: { type: 'text' },
      })
    ).toMatchObject([
      { type: 'start' },
      { type: 'text-start', id: 'block-1' },
    ])

    expect(
      translator.translateSdkEvent('assistant_delta', {
        delta: { type: 'text_delta', text: 'Hello' },
      })
    ).toEqual([{ type: 'text-delta', id: 'block-1', delta: 'Hello' }])

    expect(
      translator.translateSdkEvent('content_block_stop', {
        contentBlock: { type: 'text' },
      })
    ).toEqual([{ type: 'text-end', id: 'block-1' }])

    expect(translator.translateSdkEvent('prompt_complete', {})).toMatchObject([
      { type: 'finish', finishReason: 'stop' },
    ])
  })

  it('translates Pi reasoning and tool events into UI message chunks', () => {
    const translator = new WsToUIChunkTranslator()

    expect(translator.translatePiEvent('agent_start', {})).toMatchObject([{ type: 'start' }])

    expect(
      translator.translatePiEvent('message_update', {
        assistantMessageEvent: { type: 'thinking_delta', delta: 'considering' },
      })
    ).toEqual([
      { type: 'reasoning-start', id: 'block-1' },
      { type: 'reasoning-delta', id: 'block-1', delta: 'considering' },
    ])

    expect(
      translator.translatePiEvent('tool_execution_end', {
        toolCallId: 'tool-1',
        result: { ok: true },
      })
    ).toEqual([
      { type: 'tool-output-available', toolCallId: 'tool-1', output: { ok: true } },
    ])
  })

  it('backfills finalized assistant text when assistant_message arrives without usable deltas', () => {
    const translator = new WsToUIChunkTranslator()

    const chunks = translator.translateSdkEvent('assistant_message', {
      content: [{ type: 'text', text: 'Hi! How can I help you today?' }],
    })

    expect(chunks).toMatchObject([
      { type: 'start' },
      { type: 'text-start', id: 'block-1' },
      { type: 'text-delta', id: 'block-1', delta: 'Hi! How can I help you today?' },
      { type: 'text-end', id: 'block-1' },
    ])
  })

  it('emits error chunk without finish on prompt_error (no double-terminal)', () => {
    const translator = new WsToUIChunkTranslator()

    // Start a stream first
    translator.translateSdkEvent('content_block_start', {
      contentBlock: { type: 'text' },
    })
    translator.translateSdkEvent('assistant_delta', {
      delta: { type: 'text_delta', text: 'partial' },
    })

    const chunks = translator.translateSdkEvent('prompt_error', {
      error: 'Rate limited',
    })

    // Should close the open text block, emit error, but NOT emit finish
    const types = chunks.map((c) => c.type)
    expect(types).toContain('text-end')
    expect(types).toContain('error')
    expect(types).not.toContain('finish')

    // Error chunk should carry the error text
    const errorChunk = chunks.find((c) => c.type === 'error')
    expect(errorChunk).toMatchObject({ type: 'error', errorText: 'Rate limited' })
  })

  it('emits error chunk without finish on Pi error (no double-terminal)', () => {
    const translator = new WsToUIChunkTranslator()

    translator.translatePiEvent('agent_start', {})
    translator.translatePiEvent('message_update', {
      assistantMessageEvent: { type: 'text_start' },
    })

    const chunks = translator.translatePiEvent('message_update', {
      assistantMessageEvent: { type: 'error', error: 'Pi error' },
    })

    const types = chunks.map((c) => c.type)
    expect(types).toContain('text-end')
    expect(types).toContain('error')
    expect(types).not.toContain('finish')
  })

  it('falls back to tracked state when content_block_stop lacks contentBlock', () => {
    const translator = new WsToUIChunkTranslator()

    // Start a text block
    translator.translateSdkEvent('content_block_start', {
      contentBlock: { type: 'text' },
    })

    // Stop with only { index } — no contentBlock field
    const chunks = translator.translateSdkEvent('content_block_stop', { index: 0 })

    // Should still close the text block using tracked state
    expect(chunks).toEqual([{ type: 'text-end', id: 'block-1' }])
  })

  it('falls back to tracked tool state when content_block_stop lacks contentBlock', () => {
    const translator = new WsToUIChunkTranslator()

    translator.translateSdkEvent('content_block_start', {
      contentBlock: { type: 'tool_use', id: 'tool-abc', name: 'bash' },
    })

    // Stop with no contentBlock
    const chunks = translator.translateSdkEvent('content_block_stop', { index: 0 })

    expect(chunks).toEqual([
      {
        type: 'tool-input-available',
        toolCallId: 'tool-abc',
        toolName: 'bash',
        input: {},
      },
    ])
  })

  it('returns empty chunks for null/undefined/primitive SDK payloads', () => {
    const translator = new WsToUIChunkTranslator()

    expect(translator.translateSdkEvent('content_block_start', null)).toEqual([])
    expect(translator.translateSdkEvent('content_block_start', undefined)).toEqual([])
    expect(translator.translateSdkEvent('assistant_delta', 42)).toEqual([])
    expect(translator.translateSdkEvent('assistant_delta', 'string')).toEqual([])
  })

  it('returns empty chunks for null/undefined/primitive Pi payloads', () => {
    const translator = new WsToUIChunkTranslator()

    expect(translator.translatePiEvent('agent_start', null)).toEqual([])
    expect(translator.translatePiEvent('message_update', undefined)).toEqual([])
    expect(translator.translatePiEvent('tool_execution_start', false)).toEqual([])
  })

  it('reset() clears tracked state for clean reconnect', () => {
    const translator = new WsToUIChunkTranslator()

    // Start a text block (sets internal state)
    translator.translateSdkEvent('content_block_start', {
      contentBlock: { type: 'text' },
    })

    // Reset simulates reconnect
    translator.reset()

    // New stream should start fresh with block-1 (counter resets)
    const chunks = translator.translateSdkEvent('content_block_start', {
      contentBlock: { type: 'text' },
    })
    expect(chunks).toMatchObject([
      { type: 'start' },
      { type: 'text-start', id: 'block-1' },
    ])
  })
})
