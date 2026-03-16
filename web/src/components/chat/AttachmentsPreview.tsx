import { usePromptInputAttachments } from '@/components/ai-elements/prompt-input'
import { Plus, X } from 'lucide-react'

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
    <div className="flex flex-wrap gap-2">
      {files.map((file) => (
        <div key={file.id} className="relative group">
          {file.mediaType.startsWith('image/') ? (
            <img
              alt={file.filename || 'Attachment'}
              className="h-16 w-16 rounded-lg object-cover border border-(--color-border)"
              src={file.url}
            />
          ) : (
            <div className="h-16 w-16 rounded-lg border border-(--color-border) flex items-center justify-center text-2xs text-(--color-text-muted) text-center p-1">
              {file.filename || file.mediaType}
            </div>
          )}
          <button
            className="absolute -top-1.5 -right-1.5 p-0.5 rounded-full bg-(--color-bg-primary) border border-(--color-border) opacity-0 group-hover:opacity-100 transition-opacity"
            onClick={() => remove(file.id)}
            title="Remove attachment"
            type="button"
          >
            <X size={12} />
          </button>
        </div>
      ))}
      {(maxFiles === undefined || files.length < maxFiles) && (
        <button
          className="h-16 w-16 rounded-lg border border-dashed border-(--color-border) flex items-center justify-center text-(--color-text-muted) hover:text-(--color-text-secondary) hover:border-(--color-text-muted) transition-colors"
          onClick={openFileDialog}
          title="Add more images"
          type="button"
        >
          <Plus size={20} />
        </button>
      )}
    </div>
  )
}
