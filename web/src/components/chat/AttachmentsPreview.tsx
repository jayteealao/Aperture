import { usePromptInputAttachments } from '@/components/ai-elements/prompt-input'
import {
  Attachments,
  Attachment,
  AttachmentInfo,
  AttachmentPreview,
  AttachmentRemove,
} from '@/components/ai-elements/attachments'
import { Plus } from 'lucide-react'

/**
 * Renders a thumbnail grid of attached files from PromptInput's internal state.
 * Must be rendered inside a <PromptInput> — uses usePromptInputAttachments() hook.
 *
 * Shows image previews with remove buttons. When under the max file count,
 * shows an "add more" button that opens the file dialog.
 */
export function AttachmentsPreview({ maxFiles }: { maxFiles?: number }) {
  const { files, remove, openFileDialog } = usePromptInputAttachments()

  if (files.length === 0) {
    return null
  }

  return (
    <Attachments variant="grid">
      {files.map((file) => (
        <Attachment key={file.id} data={file} onRemove={() => remove(file.id)}>
          <AttachmentPreview />
          <AttachmentInfo className="sr-only" />
          <AttachmentRemove />
        </Attachment>
      ))}
      {(maxFiles === undefined || files.length < maxFiles) && (
        <button
          className="h-16 w-16 rounded-lg border border-dashed border-border flex items-center justify-center text-foreground/40 hover:text-muted-foreground hover:border-foreground/40 transition-colors"
          onClick={openFileDialog}
          title="Add more files"
          type="button"
        >
          <Plus size={20} />
        </button>
      )}
    </Attachments>
  )
}
