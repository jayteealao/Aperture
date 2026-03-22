import { getToolName, isToolUIPart } from 'ai'
import type { ApertureUIMessage } from '@/utils/ui-message'
import { canGroupToolParts } from './ApertureToolGroup'
import type { ToolPartUnion } from './ApertureToolPart'

export type ConversationRenderItem =
  | { kind: 'message'; key: string; message: ApertureUIMessage }
  | {
      kind: 'tool-group'
      key: string
      messages: ApertureUIMessage[]
      parts: ToolPartUnion[]
      timestamp: string | null
    }

function getSingleToolMessagePart(message: ApertureUIMessage): ToolPartUnion | null {
  if (message.role !== 'assistant' || message.parts.length !== 1) {
    return null
  }

  const [part] = message.parts
  return isToolUIPart(part) ? part : null
}

export function buildConversationRenderItems(
  messages: ApertureUIMessage[],
): ConversationRenderItem[] {
  const items: ConversationRenderItem[] = []

  for (let index = 0; index < messages.length; index += 1) {
    const message = messages[index]
    const firstPart = getSingleToolMessagePart(message)

    if (!firstPart) {
      items.push({ kind: 'message', key: message.id, message })
      continue
    }

    const toolMessages: ApertureUIMessage[] = [message]
    const toolParts: ToolPartUnion[] = [firstPart]
    let cursor = index + 1

    while (cursor < messages.length) {
      const nextMessage = messages[cursor]
      const nextPart = getSingleToolMessagePart(nextMessage)

      if (!nextPart) {
        break
      }

      toolMessages.push(nextMessage)
      toolParts.push(nextPart)
      cursor += 1
    }

    let subrunStart = 0
    while (subrunStart < toolParts.length) {
      const subrunParts: ToolPartUnion[] = [toolParts[subrunStart]]
      const subrunMessages: ApertureUIMessage[] = [toolMessages[subrunStart]]
      let subrunCursor = subrunStart + 1

      while (
        subrunCursor < toolParts.length &&
        getToolName(toolParts[subrunCursor]) === getToolName(subrunParts[0]) &&
        canGroupToolParts([subrunParts[0], toolParts[subrunCursor]])
      ) {
        subrunParts.push(toolParts[subrunCursor])
        subrunMessages.push(toolMessages[subrunCursor])
        subrunCursor += 1
      }

      if (canGroupToolParts(subrunParts)) {
        items.push({
          kind: 'tool-group',
          key: `${subrunParts[0].toolCallId}-conversation-group`,
          messages: subrunMessages,
          parts: subrunParts,
          timestamp: subrunMessages[0]?.metadata?.timestamp ?? null,
        })
      } else {
        items.push({
          kind: 'message',
          key: subrunMessages[0]!.id,
          message: subrunMessages[0]!,
        })
      }

      subrunStart = subrunCursor
    }

    index = cursor - 1
  }

  return items
}
