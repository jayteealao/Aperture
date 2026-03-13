import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/api/client'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogBody,
  DialogFooter,
  Button,
  Input,
  useToast,
} from '@/components/ui'
import { GitBranch, Folder } from 'lucide-react'

interface SaveRepoPromptProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  repoPath: string
}

export function SaveRepoPrompt({ open, onOpenChange, repoPath }: SaveRepoPromptProps) {
  const { addToast } = useToast()
  const queryClient = useQueryClient()

  // Extract default name from path
  const defaultName = repoPath.split(/[\/\\]/).pop() || 'repository'
  const [name, setName] = useState(defaultName)
  const [description, setDescription] = useState('')

  const handleClose = () => {
    onOpenChange(false)
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      return api.createWorkspace({
        name: name.trim() || defaultName,
        repoRoot: repoPath,
        description: description.trim() || undefined,
      })
    },
    onSuccess: () => {
      addToast({ title: 'Repository saved', message: 'This repository will appear in your list for future sessions', variant: 'success' })
      queryClient.invalidateQueries({ queryKey: ['workspaces'] })
      handleClose()
    },
    onError: (error) => {
      addToast({ title: 'Failed to save repository', message: error instanceof Error ? error.message : 'Unknown error', variant: 'error' })
    },
  })

  const handleSave = () => {
    saveMutation.mutate()
  }

  const handleSkip = () => {
    handleClose()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md">
        <DialogHeader onClose={handleClose}>Save Repository?</DialogHeader>
        <DialogBody>
          <div className="space-y-4">
            {/* Info */}
            <div className="flex items-start gap-3 p-3 bg-hud-gray/20 border border-hud-gray/30">
              <Folder size={20} className="text-hud-text/50 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm text-hud-text">
                  Your session is running in:
                </p>
                <p className="text-xs font-mono text-hud-text/50 mt-1 break-all">
                  {repoPath}
                </p>
              </div>
            </div>

            <p className="text-sm text-hud-text/70">
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
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={handleSkip} disabled={saveMutation.isPending}>
            Skip
          </Button>
          <Button
            variant="primary"
            onClick={handleSave}
            loading={saveMutation.isPending}
            icon={<GitBranch size={16} />}
          >
            Save Repository
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default SaveRepoPrompt
