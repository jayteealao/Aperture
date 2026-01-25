import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/api/client'
import { Dialog } from '@/components/ui/Dialog'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { useToast } from '@/components/ui/Toast'
import { GitBranch, Folder } from 'lucide-react'

interface SaveRepoPromptProps {
  open: boolean
  onClose: () => void
  repoPath: string
}

export function SaveRepoPrompt({ open, onClose, repoPath }: SaveRepoPromptProps) {
  const toast = useToast()
  const queryClient = useQueryClient()

  // Extract default name from path
  const defaultName = repoPath.split(/[\/\\]/).pop() || 'repository'
  const [name, setName] = useState(defaultName)
  const [description, setDescription] = useState('')

  const saveMutation = useMutation({
    mutationFn: async () => {
      return api.createWorkspace({
        name: name.trim() || defaultName,
        repoRoot: repoPath,
        description: description.trim() || undefined,
      })
    },
    onSuccess: () => {
      toast.success('Repository saved', 'This repository will appear in your list for future sessions')
      queryClient.invalidateQueries({ queryKey: ['workspaces'] })
      onClose()
    },
    onError: (error) => {
      toast.error('Failed to save repository', error instanceof Error ? error.message : 'Unknown error')
    },
  })

  const handleSave = () => {
    saveMutation.mutate()
  }

  const handleSkip = () => {
    onClose()
  }

  return (
    <Dialog open={open} onClose={onClose} title="Save Repository?" size="md">
      <div className="space-y-4">
        {/* Info */}
        <div className="flex items-start gap-3 p-3 rounded-lg bg-[var(--color-bg-tertiary)]">
          <Folder size={20} className="text-[var(--color-text-muted)] shrink-0 mt-0.5" />
          <div>
            <p className="text-sm text-[var(--color-text-primary)]">
              Your session is running in:
            </p>
            <p className="text-xs font-mono text-[var(--color-text-muted)] mt-1 break-all">
              {repoPath}
            </p>
          </div>
        </div>

        <p className="text-sm text-[var(--color-text-secondary)]">
          Would you like to save this repository for future sessions? Saved repositories appear
          in the dropdown when creating new sessions.
        </p>

        {/* Save form */}
        <div className="space-y-3">
          <Input
            label="Repository name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={defaultName}
          />
          <Input
            label="Description (optional)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="A brief description of this repository"
          />
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3 pt-4 border-t border-[var(--color-border)]">
          <Button variant="ghost" onClick={handleSkip} disabled={saveMutation.isPending}>
            Skip
          </Button>
          <Button
            variant="primary"
            onClick={handleSave}
            loading={saveMutation.isPending}
            leftIcon={<GitBranch size={16} />}
          >
            Save Repository
          </Button>
        </div>
      </div>
    </Dialog>
  )
}

export default SaveRepoPrompt
