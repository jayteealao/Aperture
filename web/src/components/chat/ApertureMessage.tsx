import { memo } from 'react'
import {
  isTextUIPart,
  isReasoningUIPart,
  isFileUIPart,
  isToolUIPart,
} from 'ai'
import { cn } from '@/utils/cn'
import { Message, MessageContent } from '@/components/ai-elements/message'
import { MessageResponse } from '@/components/ai-elements/message'
import {
  Reasoning,
  ReasoningContent,
  ReasoningTrigger,
} from '@/components/ai-elements/reasoning'
import type { ApertureUIMessage } from '@/utils/ui-message'
import { getMessageTimestamp } from '@/utils/ui-message'
import { ApertureToolPart } from './ApertureToolPart'

const SAFE_URL_PROTOCOLS = new Set(['http:', 'https:', 'data:', 'blob:'])

/** Validate URL protocol to prevent javascript: / vbscript: injection */
export function isSafeUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    return SAFE_URL_PROTOCOLS.has(parsed.protocol)
  } catch {
    return false
  }
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

  return (
    <Message from={message.role}>
      <MessageContent>
        {message.parts.map((part, index) => {
          const key = `${message.id}-${index}`

          if (isTextUIPart(part)) {
            return (
              <MessageResponse
                key={key}
                isAnimating={part.state === 'streaming'}
              >
                {part.text}
              </MessageResponse>
            )
          }

          if (isReasoningUIPart(part)) {
            return (
              <Reasoning
                key={key}
                isStreaming={part.state === 'streaming'}
              >
                <ReasoningTrigger />
                <ReasoningContent>{part.text}</ReasoningContent>
              </Reasoning>
            )
          }

          if (isFileUIPart(part)) {
            return <FilePart key={key} part={part} />
          }

          if (isToolUIPart(part)) {
            return <ApertureToolPart key={part.toolCallId} part={part} />
          }

          // Unknown part type — skip silently
          return null
        })}

        {timestamp && (
          <div className="mt-2 text-2xs opacity-50">
            {new Date(timestamp).toLocaleTimeString()}
          </div>
        )}
      </MessageContent>
    </Message>
  )
})

/** Renders a file attachment (image or download link) with URL sanitization. */
function FilePart({ part }: { part: { mediaType: string; url: string; filename?: string } }) {
  if (!isSafeUrl(part.url)) {
    return null
  }

  if (part.mediaType.startsWith('image/')) {
    return (
      <img
        alt={part.filename || 'Attachment'}
        className={cn(
          'max-h-48 max-w-[280px] rounded-lg object-contain',
          'border border-border',
        )}
        src={part.url}
      />
    )
  }

  return (
    <a
      className="text-sm underline underline-offset-4"
      download={part.filename}
      href={part.url}
    >
      {part.filename || part.mediaType}
    </a>
  )
}
