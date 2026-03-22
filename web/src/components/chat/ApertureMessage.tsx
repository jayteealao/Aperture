import { memo, useMemo } from 'react'
import {
  isTextUIPart,
  isReasoningUIPart,
  isFileUIPart,
  isToolUIPart,
} from 'ai'
import { CopyIcon } from 'lucide-react'
import {
  Message,
  MessageAction,
  MessageActions,
  MessageContent,
  MessageResponse,
  MessageToolbar,
} from '@/components/ai-elements/message'
import {
  Reasoning,
  ReasoningContent,
  ReasoningTrigger,
} from '@/components/ai-elements/reasoning'
import type { ApertureUIMessage } from '@/utils/ui-message'
import { getMessageTimestamp } from '@/utils/ui-message'
import { formatMessageTimestamp } from '@/utils/format'
import {
  Attachments,
  Attachment,
  AttachmentHoverCard,
  AttachmentHoverCardContent,
  AttachmentHoverCardTrigger,
  AttachmentInfo,
  AttachmentPreview,
} from '@/components/ai-elements/attachments'
import { ApertureToolGroup, canGroupToolParts } from './ApertureToolGroup'
import { ApertureToolPart, type ToolPartUnion } from './ApertureToolPart'

const SAFE_URL_PROTOCOLS = new Set(['http:', 'https:', 'data:', 'blob:'])

export function isSafeUrl(url: string): boolean {
  try {
    const parsedUrl = new URL(url)
    return SAFE_URL_PROTOCOLS.has(parsedUrl.protocol)
  } catch {
    return false
  }
}

export type RenderedMessagePart =
  | { kind: 'text'; key: string; part: Extract<ApertureUIMessage['parts'][number], { type: 'text' }> }
  | { kind: 'file'; key: string; part: Extract<ApertureUIMessage['parts'][number], { type: 'file' }> }
  | { kind: 'tool'; key: string; part: ToolPartUnion }
  | { kind: 'tool-group'; key: string; parts: ToolPartUnion[] }

export function buildRenderedMessageParts(message: ApertureUIMessage): RenderedMessagePart[] {
  const items: RenderedMessagePart[] = []

  for (let index = 0; index < message.parts.length; index += 1) {
    const part = message.parts[index]
    const key = `${message.id}-${index}`

    if (isReasoningUIPart(part)) {
      continue
    }

    if (isTextUIPart(part)) {
      items.push({ kind: 'text', key, part })
      continue
    }

    if (isFileUIPart(part)) {
      items.push({ kind: 'file', key, part })
      continue
    }

    if (isToolUIPart(part)) {
      const toolRun: ToolPartUnion[] = [part]
      let cursor = index + 1

      while (cursor < message.parts.length) {
        const nextPart = message.parts[cursor]
        if (!isToolUIPart(nextPart)) {
          break
        }

        toolRun.push(nextPart)
        cursor += 1
      }

      let subrunStart = 0
      while (subrunStart < toolRun.length) {
        const subrun: ToolPartUnion[] = [toolRun[subrunStart]]
        let subrunCursor = subrunStart + 1

        while (
          subrunCursor < toolRun.length &&
          canGroupToolParts([subrun[0], toolRun[subrunCursor]])
        ) {
          subrun.push(toolRun[subrunCursor])
          subrunCursor += 1
        }

        if (canGroupToolParts(subrun)) {
          items.push({
            kind: 'tool-group',
            key: `${subrun[0].toolCallId}-group`,
            parts: subrun,
          })
        } else {
          items.push({
            kind: 'tool',
            key: subrun[0].toolCallId,
            part: subrun[0],
          })
        }

        subrunStart = subrunCursor
      }

      index = cursor - 1
    }
  }

  return items
}

/**
 * Renders a single UIMessage with parts in natural document order.
 *
 * Unlike the previous UIMessageBubble which grouped parts by type (breaking interleaving),
 * this component iterates parts sequentially — preserving the exact order the AI SDK streamed them.
 */
export const ApertureMessage = memo(function ApertureMessage({
  message,
}: {
  message: ApertureUIMessage
}) {
  const timestamp = getMessageTimestamp(message)
  const reasoningParts = useMemo(
    () => message.parts.filter(isReasoningUIPart),
    [message.parts],
  )
  const reasoningText = reasoningParts.map((part) => part.text).join('\n\n')
  const hasReasoning = reasoningText.trim().length > 0
  const isReasoningStreaming = reasoningParts.some((part) => part.state === 'streaming')
  const textContent = message.parts
    .filter(isTextUIPart)
    .map((part) => part.text)
    .join('\n\n')
  const renderedParts = useMemo(() => buildRenderedMessageParts(message), [message])

  return (
    <Message from={message.role}>
      <MessageContent>
        {hasReasoning && (
          <Reasoning className="w-full max-w-full" isStreaming={isReasoningStreaming}>
            <ReasoningTrigger
              getThinkingMessage={(streaming, duration) => {
                if (streaming) {
                  return <span>Thinking...</span>
                }
                if (typeof duration === 'number') {
                  return <span>Thought for {duration}s</span>
                }
                return <span>Thinking</span>
              }}
            />
            <ReasoningContent>{reasoningText}</ReasoningContent>
          </Reasoning>
        )}

        {renderedParts.map((item) => {
          if (item.kind === 'text') {
            return (
              <MessageResponse
                key={item.key}
                isAnimating={item.part.state === 'streaming'}
              >
                {item.part.text}
              </MessageResponse>
            )
          }

          if (item.kind === 'file') {
            return <MessageAttachment key={item.key} part={item.part} />
          }

          if (item.kind === 'tool-group') {
            return (
              <ApertureToolGroup
                key={item.key}
                parts={item.parts}
              />
            )
          }

          if (item.kind === 'tool') {
            return (
              <ApertureToolPart
                key={item.key}
                part={item.part}
              />
            )
          }

          return null
        })}

        {timestamp && (
          <div className="mt-2 text-2xs opacity-50">
            {formatMessageTimestamp(timestamp)}
          </div>
        )}

        {message.role === 'assistant' && textContent.trim().length > 0 && (
          <MessageToolbar className="mt-1">
            <div />
            <MessageActions>
              <MessageAction
                label="Copy message"
                onClick={() => void navigator.clipboard.writeText(textContent)}
                tooltip="Copy response"
              >
                <CopyIcon className="size-3" />
              </MessageAction>
            </MessageActions>
          </MessageToolbar>
        )}
      </MessageContent>
    </Message>
  )
})

function MessageAttachment({
  part,
}: {
  part: { mediaType: string; url: string; filename?: string }
}) {
  if (!isSafeUrl(part.url)) {
    return null
  }

  return (
    <Attachments variant="grid">
      <Attachment data={{ ...part, id: `${part.filename ?? part.url}-attachment`, type: 'file' }}>
        <AttachmentHoverCard>
          <AttachmentHoverCardTrigger asChild>
            <div className="size-full cursor-default">
              <AttachmentPreview />
            </div>
          </AttachmentHoverCardTrigger>
          <AttachmentHoverCardContent align="start">
            <div className="space-y-2">
              <AttachmentPreview className="h-48 w-full rounded-md" />
              <AttachmentInfo showMediaType />
            </div>
          </AttachmentHoverCardContent>
        </AttachmentHoverCard>
      </Attachment>
    </Attachments>
  )
}
