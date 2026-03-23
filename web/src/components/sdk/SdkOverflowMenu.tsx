import { MoreHorizontal } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { PromptInputButton } from '@/components/ai-elements/prompt-input'
import { SdkComposerControls } from './SdkComposerControls'

interface SdkOverflowMenuProps {
  sessionId: string
  connected: boolean
}

/**
 * The ⋯ overflow button shown in the prompt toolbar.
 * Opens a popover above the toolbar containing advanced SDK session settings
 * (permission mode, thinking tokens, effort). Always rendered regardless of
 * session type — shows empty state for non-SDK sessions.
 */
export function SdkOverflowMenu({ sessionId, connected }: SdkOverflowMenuProps) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <PromptInputButton tooltip={{ content: 'More options', side: 'top' }}>
          <MoreHorizontal className="size-4" />
        </PromptInputButton>
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align="end"
        className="w-56 p-0"
        // Prevent Popover closing when a Radix Select portal (listbox) is clicked,
        // since Select portals are rendered outside the Popover's DOM subtree.
        onInteractOutside={(e) => {
          const target = e.target as Element
          if (
            target.closest('[role="listbox"]') ||
            target.closest('[role="option"]') ||
            target.closest('[data-radix-popper-content-wrapper]')
          ) {
            e.preventDefault()
          }
        }}
      >
        <SdkComposerControls
          sessionId={sessionId}
          connected={connected}
          variant="overflow"
        />
      </PopoverContent>
    </Popover>
  )
}
