import { AlertCircle, CheckIcon, XIcon } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Card } from '@/components/ui/card'
import {
  Confirmation,
  ConfirmationAccepted,
  ConfirmationActions,
  ConfirmationAction,
  ConfirmationRejected,
  ConfirmationRequest,
  ConfirmationTitle,
} from '@/components/ai-elements/confirmation'
import { ToolInputDisplay } from '@/components/sdk/ToolInputDisplay'
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
 * for consistent styling and built-in `role="alert"` accessibility (via Alert).
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
  const [selectedOptionId, setSelectedOptionId] = useState<string | null>(null)
  const toolCall = permission.toolCall as {
    name?: string
    title?: string
    rawInput?: unknown
  }
  const options = permission.options as PermissionOption[]
  const toolName = toolCall?.name || toolCall?.title
  const selectedOption = useMemo(
    () => options.find((option) => option.optionId === selectedOptionId) ?? null,
    [options, selectedOptionId],
  )
  const approvalState = selectedOptionId
    ? (selectedOption?.kind?.includes('allow') ? 'approval-responded' : 'output-denied')
    : 'approval-requested'
  const isAskUserQuestion =
    toolName === 'AskUserQuestion' && isAskUserQuestionInput(toolCall.rawInput)

  // AskUserQuestion has its own interactive UI — keep in custom Card.
  if (isAskUserQuestion) {
    const allowOption = options.find((option) => option.kind?.includes('allow'))

    /**
     * CR-2 fix: If no allow option exists (malformed permission from server),
     * unblock the agent with a null response and log for observability rather
     * than silently no-op and leave the session hanging.
     */
    const handleAskUserQuestionSubmit = async (
      answers: Record<string, string>,
    ) => {
      if (!allowOption) {
        console.error(
          '[PermissionRequest] AskUserQuestion has no allow option — responding null to unblock agent',
          { toolCallId: permission.toolCallId, options },
        )
        onRespond(permission.toolCallId, null)
        return
      }
      const answerText = Object.entries(answers)
        .map(([header, value]) => `${header}: ${value}`)
        .join('\n')
      // Await persistence before sending the permission response (RS-1 fix)
      await onAddUserMessage(`My answers:\n${answerText}`)
      setSelectedOptionId(allowOption.optionId)
      onRespond(permission.toolCallId, allowOption.optionId, answers)
    }

    return (
      <Card
        className="border-l-4 border-l-accent"
        padding="md"
        variant="glass"
      >
        <div className="flex items-start gap-3">
          <AlertCircle className="shrink-0 mt-0.5 text-accent" size={20} />
          <div className="flex-1 min-w-0">
            <h4 className="font-medium text-foreground">
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
              onSubmit={handleAskUserQuestionSubmit}
            />
          </div>
        </div>
      </Card>
    )
  }

  // DX-1 fix: Guard against an empty toolCallId — Confirmation returns null for
  // falsy approval.id with no error, which would silently hide the permission UI.
  if (!permission.toolCallId) {
    console.error('[PermissionRequest] Received permission with empty toolCallId', permission)
    return null
  }

  // Normal permission — use ai-elements Confirmation for consistent styling.
  // Always in "approval-requested" state: the component unmounts when the user
  // responds because sendPermissionResponse removes it from the store.
  //
  // ST-1 fix: Icon is placed inside ConfirmationTitle (a flex row) rather than
  // as a direct sibling of the content div — avoids fighting Confirmation's
  // internal flex-col layout via className override.
  //
  // CR-1 fix: No hardcoded Decline button — the backend always includes a deny
  // option in the options array. Rendering one here would duplicate it.
  return (
    <Confirmation
      approval={
        selectedOptionId
          ? {
              id: permission.toolCallId,
              approved: Boolean(selectedOption?.kind?.includes('allow')),
            }
          : { id: permission.toolCallId }
      }
      className="border-l-4 border-l-warning"
      state={approvalState}
    >
      <ConfirmationTitle className="flex items-center gap-2 font-medium text-foreground">
        <AlertCircle className="shrink-0 text-warning" size={16} />
        Approve {toolName || 'this request'}?
      </ConfirmationTitle>

      <ConfirmationRequest>
        {toolCall?.rawInput ? (
          <ToolInputDisplay
            name={toolCall.name ?? 'Unknown Tool'}
            input={toolCall.rawInput}
          />
        ) : (
          <p className="text-sm text-muted-foreground">
            {toolCall?.title || 'The agent is requesting permission to proceed.'}
          </p>
        )}
      </ConfirmationRequest>

      <ConfirmationAccepted>
        <div className="flex items-center gap-2 text-sm text-success">
          <CheckIcon size={14} />
          <span>{selectedOption?.name || 'Approved'}</span>
        </div>
      </ConfirmationAccepted>

      <ConfirmationRejected>
        <div className="flex items-center gap-2 text-sm text-warning">
          <XIcon size={14} />
          <span>{selectedOption?.name || 'Rejected'}</span>
        </div>
      </ConfirmationRejected>

      <ConfirmationActions>
        {/* CR-3 fix: If the server sends no options (malformed), render a single
            dismiss button so the user can always unblock the session. */}
        {options.length === 0 ? (
          <ConfirmationAction
            onClick={() => {
              setSelectedOptionId('__dismiss__')
              onRespond(permission.toolCallId, null)
            }}
            variant="outline"
          >
            Dismiss
          </ConfirmationAction>
        ) : (
          options.map((option) => (
            <ConfirmationAction
              key={option.optionId}
              onClick={() => {
                setSelectedOptionId(option.optionId)
                onRespond(permission.toolCallId, option.optionId)
              }}
              variant={option.kind?.includes('allow') ? 'default' : 'outline'}
            >
              {option.name}
            </ConfirmationAction>
          ))
        )}
      </ConfirmationActions>
    </Confirmation>
  )
}
