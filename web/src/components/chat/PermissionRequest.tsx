import { AlertCircle } from 'lucide-react'
import { cn } from '@/utils/cn'
import { Card } from '@/components/ui/Card'
import {
  Confirmation,
  ConfirmationActions,
  ConfirmationAction,
  ConfirmationRequest,
  ConfirmationTitle,
} from '@/components/ai-elements/confirmation'
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
 * Normal permissions use the ai-elements `<Confirmation>` compound component
 * for consistent styling and accessibility (`role="alert"`).
 *
 * AskUserQuestion has its own multi-question tabbed UI with no ai-elements
 * equivalent, so it keeps the custom Card wrapper.
 *
 * The component always renders in `approval-requested` state because it
 * unmounts when the user responds (permission is removed from the store).
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

  // AskUserQuestion has its own interactive UI — keep in custom Card
  if (isAskUserQuestion) {
    const allowOption = options.find((option) =>
      option.kind?.includes('allow'),
    )

    return (
      <Card
        className="border-l-4 border-l-accent"
        padding="md"
        variant="glass"
      >
        <div className="flex items-start gap-3">
          <AlertCircle className="shrink-0 mt-0.5 text-accent" size={20} />
          <div className="flex-1 min-w-0">
            <h4 className="font-medium text-(--color-text-primary)">
              Question from Agent
            </h4>
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
              onSubmit={async (answers) => {
                if (!allowOption) {
                  return
                }
                const answerText = Object.entries(answers)
                  .map(([header, value]) => `${header}: ${value}`)
                  .join('\n')
                await onAddUserMessage(`My answers:\n${answerText}`)
                onRespond(permission.toolCallId, allowOption.optionId, answers)
              }}
            />
          </div>
        </div>
      </Card>
    )
  }

  // Normal permission — use ai-elements Confirmation for consistent styling.
  // Always in "approval-requested" state: the component unmounts when the user
  // responds because sendPermissionResponse removes it from the store.
  return (
    <Confirmation
      approval={{ id: permission.toolCallId }}
      className={cn(
        'border-l-4 border-l-warning',
        // Override Confirmation's flex-col with flex-row for icon placement
        'flex-row items-start gap-3',
      )}
      state="approval-requested"
    >
      <AlertCircle className="shrink-0 mt-0.5 text-warning" size={20} />
      <div className="flex flex-col gap-2 flex-1 min-w-0">
        <ConfirmationTitle className="inline font-medium text-(--color-text-primary)">
          Approve {toolName || 'action'}?
        </ConfirmationTitle>

        <ConfirmationRequest>
          {toolCall?.rawInput ? (
            <ToolCallDisplay
              name={toolCall.name}
              rawInput={toolCall.rawInput as Record<string, unknown>}
            />
          ) : (
            <p className="text-sm text-(--color-text-secondary)">
              {toolCall?.title || 'The agent is requesting permission to proceed.'}
            </p>
          )}
        </ConfirmationRequest>

        <ConfirmationActions className="self-start">
          {options.map((option) => (
            <ConfirmationAction
              key={option.optionId}
              onClick={() => onRespond(permission.toolCallId, option.optionId)}
              variant={option.kind?.includes('allow') ? 'default' : 'outline'}
            >
              {option.name}
            </ConfirmationAction>
          ))}
          <ConfirmationAction
            onClick={() => onRespond(permission.toolCallId, null)}
            variant="ghost"
          >
            Decline
          </ConfirmationAction>
        </ConfirmationActions>
      </div>
    </Confirmation>
  )
}
