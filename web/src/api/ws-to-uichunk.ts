import type { UIMessageChunk } from 'ai'

export class WsToUIChunkTranslator {
  private blockCounter = 0
  private currentTextBlockId: string | null = null
  private currentReasoningBlockId: string | null = null
  private currentToolCallId: string | null = null
  private currentToolName: string | null = null
  private started = false
  private finished = false

  private nextBlockId(): string {
    this.blockCounter += 1
    return `block-${this.blockCounter}`
  }

  private ensureStarted(chunks: UIMessageChunk[]) {
    if (this.started) {
      return
    }

    chunks.push({
      type: 'start',
      messageMetadata: {
        timestamp: new Date().toISOString(),
      },
    })
    this.started = true
    this.finished = false
  }

  private closeOpenBlocks(chunks: UIMessageChunk[]) {
    if (this.currentTextBlockId) {
      chunks.push({ type: 'text-end', id: this.currentTextBlockId })
      this.currentTextBlockId = null
    }

    if (this.currentReasoningBlockId) {
      chunks.push({ type: 'reasoning-end', id: this.currentReasoningBlockId })
      this.currentReasoningBlockId = null
    }
  }

  private pushFinish(chunks: UIMessageChunk[], finishReason: 'stop' | 'error' = 'stop') {
    if (this.finished) {
      return
    }

    this.closeOpenBlocks(chunks)
    chunks.push({
      type: 'finish',
      finishReason,
      messageMetadata: {
        timestamp: new Date().toISOString(),
      },
    })
    this.reset()
  }

  /** Reset translator state. Call when reconnecting to avoid stale block IDs. */
  reset() {
    this.blockCounter = 0
    this.currentTextBlockId = null
    this.currentReasoningBlockId = null
    this.currentToolCallId = null
    this.currentToolName = null
    this.started = false
    this.finished = true
  }

  translateSdkEvent(type: string, payload: unknown): UIMessageChunk[] {
    const chunks: UIMessageChunk[] = []

    // Guard: payload must be an object — null/undefined/primitive payloads would crash `as` casts below
    if (payload == null || typeof payload !== 'object') return chunks

    switch (type) {
      case 'content_block_start': {
        this.ensureStarted(chunks)
        const block = (payload as {
          contentBlock?: { type?: string; id?: string; name?: string }
        }).contentBlock
        if (!block?.type) {
          return chunks
        }

        if (block.type === 'text') {
          this.currentTextBlockId = this.nextBlockId()
          chunks.push({ type: 'text-start', id: this.currentTextBlockId })
        } else if (block.type === 'thinking') {
          this.currentReasoningBlockId = this.nextBlockId()
          chunks.push({ type: 'reasoning-start', id: this.currentReasoningBlockId })
        } else if (block.type === 'tool_use') {
          this.currentToolCallId = block.id ?? this.nextBlockId()
          this.currentToolName = block.name ?? 'tool'
          chunks.push({
            type: 'tool-input-start',
            toolCallId: this.currentToolCallId,
            toolName: this.currentToolName,
          })
        }
        break
      }

      case 'assistant_delta': {
        this.ensureStarted(chunks)
        const delta = (payload as {
          delta?: {
            type?: string
            text?: string
            thinking?: string
            partial_json?: string
          }
        }).delta

        if (!delta?.type) {
          return chunks
        }

        if (delta.type === 'text_delta' && this.currentTextBlockId && delta.text) {
          chunks.push({ type: 'text-delta', id: this.currentTextBlockId, delta: delta.text })
        } else if (
          delta.type === 'thinking_delta' &&
          this.currentReasoningBlockId &&
          delta.thinking
        ) {
          chunks.push({
            type: 'reasoning-delta',
            id: this.currentReasoningBlockId,
            delta: delta.thinking,
          })
        } else if (
          delta.type === 'input_json_delta' &&
          this.currentToolCallId &&
          delta.partial_json
        ) {
          chunks.push({
            type: 'tool-input-delta',
            toolCallId: this.currentToolCallId,
            inputTextDelta: delta.partial_json,
          })
        }
        break
      }

      case 'content_block_stop': {
        const block = (payload as {
          contentBlock?: { type?: string; id?: string; name?: string; input?: unknown }
        }).contentBlock

        // SDK may only send { index } without contentBlock — fall back to tracked state
        if (!block?.type) {
          if (this.currentTextBlockId) {
            chunks.push({ type: 'text-end', id: this.currentTextBlockId })
            this.currentTextBlockId = null
          } else if (this.currentReasoningBlockId) {
            chunks.push({ type: 'reasoning-end', id: this.currentReasoningBlockId })
            this.currentReasoningBlockId = null
          } else if (this.currentToolCallId) {
            chunks.push({
              type: 'tool-input-available',
              toolCallId: this.currentToolCallId,
              toolName: this.currentToolName ?? 'tool',
              input: {},
            })
            this.currentToolCallId = null
            this.currentToolName = null
          }
          return chunks
        }

        if (block.type === 'text' && this.currentTextBlockId) {
          chunks.push({ type: 'text-end', id: this.currentTextBlockId })
          this.currentTextBlockId = null
        } else if (block.type === 'thinking' && this.currentReasoningBlockId) {
          chunks.push({ type: 'reasoning-end', id: this.currentReasoningBlockId })
          this.currentReasoningBlockId = null
        } else if (block.type === 'tool_use') {
          chunks.push({
            type: 'tool-input-available',
            toolCallId: block.id ?? this.currentToolCallId ?? this.nextBlockId(),
            toolName: block.name ?? this.currentToolName ?? 'tool',
            input: block.input ?? {},
          })
          this.currentToolCallId = null
          this.currentToolName = null
        }
        break
      }

      case 'assistant_message': {
        this.ensureStarted(chunks)
        const content = (payload as { content?: Array<Record<string, unknown>> }).content ?? []
        for (const block of content) {
          if (block.type === 'tool_result' && typeof block.tool_use_id === 'string') {
            if (block.is_error) {
              chunks.push({
                type: 'tool-output-error',
                toolCallId: block.tool_use_id,
                errorText: String(block.content ?? 'Tool error'),
              })
            } else {
              chunks.push({
                type: 'tool-output-available',
                toolCallId: block.tool_use_id,
                output: block.content ?? null,
              })
            }
          }
        }
        break
      }

      case 'prompt_complete':
        this.pushFinish(chunks, 'stop')
        break

      case 'prompt_error':
        this.ensureStarted(chunks)
        this.closeOpenBlocks(chunks)
        chunks.push({
          type: 'error',
          errorText: String((payload as { error?: string }).error ?? 'Unknown error'),
        })
        // error chunk is the terminal event — don't also emit finish (double-terminal crashes the stream controller)
        this.reset()
        break
    }

    return chunks
  }

  translatePiEvent(type: string, payload: unknown): UIMessageChunk[] {
    const chunks: UIMessageChunk[] = []

    // Guard: payload must be an object — null/undefined/primitive payloads would crash `as` casts below
    if (payload == null || typeof payload !== 'object') return chunks

    switch (type) {
      case 'agent_start':
        this.ensureStarted(chunks)
        break

      case 'agent_end':
        this.pushFinish(chunks, 'stop')
        break

      case 'tool_execution_start': {
        this.ensureStarted(chunks)
        const tool = payload as { toolCallId?: string; toolName?: string; input?: unknown }
        this.currentToolCallId = tool.toolCallId ?? this.nextBlockId()
        this.currentToolName = tool.toolName ?? 'tool'
        chunks.push({
          type: 'tool-input-start',
          toolCallId: this.currentToolCallId,
          toolName: this.currentToolName,
        })
        if (tool.input !== undefined) {
          chunks.push({
            type: 'tool-input-available',
            toolCallId: this.currentToolCallId,
            toolName: this.currentToolName,
            input: tool.input,
          })
        }
        break
      }

      case 'tool_execution_end': {
        this.ensureStarted(chunks)
        const tool = payload as {
          toolCallId?: string
          toolName?: string
          result?: unknown
          error?: string
        }
        const toolCallId = tool.toolCallId ?? this.currentToolCallId ?? this.nextBlockId()
        if (tool.error) {
          chunks.push({ type: 'tool-output-error', toolCallId, errorText: tool.error })
        } else {
          chunks.push({
            type: 'tool-output-available',
            toolCallId,
            output: tool.result ?? null,
          })
        }
        this.currentToolCallId = null
        this.currentToolName = null
        break
      }

      case 'message_update': {
        this.ensureStarted(chunks)
        const event = (payload as {
          assistantMessageEvent?: {
            type?: string
            delta?: string
            toolCallId?: string
            toolName?: string
            inputJson?: string
            input?: unknown
            error?: string
          }
        }).assistantMessageEvent

        if (!event?.type) {
          return chunks
        }

        switch (event.type) {
          case 'text_start':
            this.currentTextBlockId = this.nextBlockId()
            chunks.push({ type: 'text-start', id: this.currentTextBlockId })
            break

          case 'text_delta':
            if (!this.currentTextBlockId) {
              this.currentTextBlockId = this.nextBlockId()
              chunks.push({ type: 'text-start', id: this.currentTextBlockId })
            }
            if (event.delta) {
              chunks.push({ type: 'text-delta', id: this.currentTextBlockId, delta: event.delta })
            }
            break

          case 'text_end':
            if (this.currentTextBlockId) {
              chunks.push({ type: 'text-end', id: this.currentTextBlockId })
              this.currentTextBlockId = null
            }
            break

          case 'thinking_start':
            this.currentReasoningBlockId = this.nextBlockId()
            chunks.push({ type: 'reasoning-start', id: this.currentReasoningBlockId })
            break

          case 'thinking_delta':
            if (!this.currentReasoningBlockId) {
              this.currentReasoningBlockId = this.nextBlockId()
              chunks.push({ type: 'reasoning-start', id: this.currentReasoningBlockId })
            }
            if (event.delta) {
              chunks.push({
                type: 'reasoning-delta',
                id: this.currentReasoningBlockId,
                delta: event.delta,
              })
            }
            break

          case 'thinking_end':
            if (this.currentReasoningBlockId) {
              chunks.push({ type: 'reasoning-end', id: this.currentReasoningBlockId })
              this.currentReasoningBlockId = null
            }
            break

          case 'toolcall_start':
            this.currentToolCallId = event.toolCallId ?? this.nextBlockId()
            this.currentToolName = event.toolName ?? 'tool'
            chunks.push({
              type: 'tool-input-start',
              toolCallId: this.currentToolCallId,
              toolName: this.currentToolName,
            })
            break

          case 'toolcall_delta':
            if (!this.currentToolCallId) {
              this.currentToolCallId = event.toolCallId ?? this.nextBlockId()
              this.currentToolName = event.toolName ?? 'tool'
              chunks.push({
                type: 'tool-input-start',
                toolCallId: this.currentToolCallId,
                toolName: this.currentToolName,
              })
            }
            if (event.inputJson) {
              chunks.push({
                type: 'tool-input-delta',
                toolCallId: this.currentToolCallId,
                inputTextDelta: event.inputJson,
              })
            }
            break

          case 'toolcall_end':
            chunks.push({
              type: 'tool-input-available',
              toolCallId: event.toolCallId ?? this.currentToolCallId ?? this.nextBlockId(),
              toolName: event.toolName ?? this.currentToolName ?? 'tool',
              input: event.input ?? {},
            })
            this.currentToolCallId = null
            this.currentToolName = null
            break

          case 'done':
            this.pushFinish(chunks, 'stop')
            break

          case 'error':
            this.closeOpenBlocks(chunks)
            chunks.push({
              type: 'error',
              errorText: event.error || 'Unknown error',
            })
            // error chunk is the terminal event — don't also emit finish (double-terminal crashes the stream controller)
            this.reset()
            break
        }
        break
      }
    }

    return chunks
  }
}
