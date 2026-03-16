import { AlertCircle } from 'lucide-react'
import { cn } from '@/utils/cn'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { ToolCallDisplay } from '@/components/session/ToolCallDisplay'
import {
  AskUserQuestionDisplay,
  isAskUserQuestionInput,
} from '@/components/session/AskUserQuestionDisplay'
import type { PermissionOption } from '@/api/types'

export interface PermissionRequestProps {
  permission: {
    toolCallId: string
    toolCall: unknown
    options: unknown[]
  }
  onRespond: (
    toolCallId: string,
    optionId: string | null,
    answers?: Record<string, string>,
  ) => void
  /**
   * Called to inject a synthetic user message into the message list and persist it.
   * Returns a promise that resolves once persistence completes — callers should
   * await this before sending the permission response over WebSocket.
   */
  onAddUserMessage: (content: string) => Promise<void>
}

/**
 * Displays a pending permission request or AskUserQuestion prompt.
 *
 * MED-4 fix: onAddUserMessage uses a functional setMessages updater (no stale closure).
 * RS-1 fix: onAddUserMessage is async — persists before onRespond fires.
 */
export function PermissionRequest({
  permission,
  onRespond,
  onAddUserMessage,
}: PermissionRequestProps) {
  const toolCall = permission.toolCall as {
    name?: string
    title?: string
    rawInput?: unknown
  }
  const options = permission.options as PermissionOption[]
  const toolName = toolCall?.name || toolCall?.title
  const isAskUserQuestion =
    toolName === 'AskUserQuestion' && isAskUserQuestionInput(toolCall.rawInput)
  const allowOption = options.find((option) =>
    option.kind?.includes('allow'),
  )

  const handleAskUserQuestionSubmit = async (answers: Record<string, string>) => {
    if (!allowOption) {
      return
    }

    const answerText = Object.entries(answers)
      .map(([header, value]) => `${header}: ${value}`)
      .join('\n')

    // Await persistence before sending the permission response (RS-1 fix)
    await onAddUserMessage(`My answers:\n${answerText}`)
    onRespond(permission.toolCallId, allowOption.optionId, answers)
  }

  return (
    <Card
      className={cn(
        'border-l-4',
        isAskUserQuestion ? 'border-l-accent' : 'border-l-warning',
      )}
      padding="md"
      variant="glass"
    >
      <div className="flex items-start gap-3">
        <AlertCircle
          className={cn(
            'shrink-0 mt-0.5',
            isAskUserQuestion ? 'text-accent' : 'text-warning',
          )}
          size={20}
        />
        <div className="flex-1 min-w-0">
          <h4 className="font-medium text-(--color-text-primary)">
            {isAskUserQuestion
              ? 'Question from Agent'
              : `Approve ${toolName || 'action'}?`}
          </h4>

          {!isAskUserQuestion && (
            <p className="text-sm text-(--color-text-secondary) mt-1">
              {toolCall?.title || 'The agent is requesting permission to proceed.'}
            </p>
          )}

          {isAskUserQuestion ? (
            <AskUserQuestionDisplay
              input={
                toolCall.rawInput as {
                  questions: Array<{
                    question: string
                    header: string
                    options: Array<{
                      label: string
                      description: string
                    }>
                    multiSelect: boolean
                  }>
                }
              }
              onSubmit={handleAskUserQuestionSubmit}
            />
          ) : toolCall?.rawInput ? (
            <>
              <ToolCallDisplay
                name={toolCall.name}
                rawInput={
                  toolCall.rawInput as Record<string, unknown>
                }
              />
              <div className="flex flex-wrap gap-2 mt-3">
                {options.map((option) => {
                  const isAllow = option.kind?.includes('allow')
                  return (
                    <Button
                      key={option.optionId}
                      onClick={() =>
                        onRespond(
                          permission.toolCallId,
                          option.optionId,
                        )
                      }
                      size="sm"
                      variant={isAllow ? 'primary' : 'secondary'}
                    >
                      {option.name}
                    </Button>
                  )
                })}
                <Button
                  onClick={() =>
                    onRespond(permission.toolCallId, null)
                  }
                  size="sm"
                  variant="ghost"
                >
                  Decline
                </Button>
              </div>
            </>
          ) : null}
        </div>
      </div>
    </Card>
  )
}
