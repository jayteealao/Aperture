import type { UIMessage } from 'ai'
import type { ContentBlock, Message } from '@/api/types'

export interface ApertureMessageMetadata {
  timestamp: string
}

export type ApertureUIMessage = UIMessage<ApertureMessageMetadata>

function toToolOutput(block: ContentBlock): unknown {
  if (typeof block.content === 'string') {
    return block.content
  }

  if (Array.isArray(block.content)) {
    return block.content
  }

  return null
}

export function legacyMessageToUIMessage(message: Message): ApertureUIMessage {
  if (typeof message.content === 'string') {
    return {
      id: message.id,
      role: message.role,
      metadata: { timestamp: message.timestamp },
      parts: message.content
        ? [{ type: 'text', text: message.content }]
        : [],
    }
  }

  const parts: ApertureUIMessage['parts'] = []
  const toolResults = new Map(
    message.content
      .filter((block) => block.type === 'tool_result' && block.tool_use_id)
      .map((block) => [block.tool_use_id!, block])
  )
  const renderedToolResults = new Set<string>()

  for (const block of message.content) {
    if (block.type === 'text' && block.text) {
      parts.push({ type: 'text', text: block.text })
      continue
    }

    if (block.type === 'thinking') {
      parts.push({ type: 'reasoning', text: block.thinking || '' })
      continue
    }

    if (block.type === 'image' && block.data && block.mimeType) {
      parts.push({
        type: 'file',
        mediaType: block.mimeType,
        filename: block.filename,
        url: `data:${block.mimeType};base64,${block.data}`,
      })
      continue
    }

    if (block.type === 'tool_use') {
      const result = block.id ? toolResults.get(block.id) : undefined
      if (result?.tool_use_id) {
        renderedToolResults.add(result.tool_use_id)
      }
      if (result) {
        parts.push({
          type: 'dynamic-tool',
          toolName: block.name || 'tool',
          toolCallId: block.id || block.toolCallId || `tool-${message.id}`,
          input: block.input,
          state: 'output-available',
          output: toToolOutput(result),
        })
      } else {
        parts.push({
          type: 'dynamic-tool',
          toolName: block.name || 'tool',
          toolCallId: block.id || block.toolCallId || `tool-${message.id}`,
          input: block.input,
          state: 'input-available',
        })
      }
      continue
    }

    if (
      block.type === 'tool_result' &&
      block.tool_use_id &&
      !renderedToolResults.has(block.tool_use_id)
    ) {
      parts.push({
        type: 'dynamic-tool',
        toolName: 'tool',
        toolCallId: block.tool_use_id,
        input: undefined,
        state: 'output-available',
        output: toToolOutput(block),
      })
      continue
    }
  }

  return {
    id: message.id,
    role: message.role,
    metadata: { timestamp: message.timestamp },
    parts,
  }
}

export function coerceStoredMessagesToUIMessages(
  messages: unknown
): ApertureUIMessage[] {
  if (!Array.isArray(messages)) {
    return []
  }

  return messages.flatMap((message) => {
    if (!message || typeof message !== 'object') {
      return []
    }

    if ('parts' in message && Array.isArray((message as { parts?: unknown[] }).parts)) {
      return [message as ApertureUIMessage]
    }

    if (
      'id' in message &&
      'role' in message &&
      'content' in message &&
      'timestamp' in message
    ) {
      return [legacyMessageToUIMessage(message as Message)]
    }

    return []
  })
}

export function getMessageTimestamp(message: ApertureUIMessage): string | null {
  return message.metadata?.timestamp ?? null
}
