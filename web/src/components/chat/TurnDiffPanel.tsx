import { useEffect, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { CodeHighlight } from '@/components/ui/CodeHighlight'
import { api } from '@/api/client'
import type { TurnDiffSummary } from '@/api/types'

interface TurnDiffPanelProps {
  sessionId: string
  summary: TurnDiffSummary | null
  open: boolean
  initialFilePath?: string | null
  onOpenChange: (open: boolean) => void
}

export function TurnDiffPanel({
  sessionId,
  summary,
  open,
  initialFilePath,
  onOpenChange,
}: TurnDiffPanelProps) {
  const [selectedPath, setSelectedPath] = useState<string | null>(initialFilePath ?? null)
  const [patch, setPatch] = useState<string>('')
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    setSelectedPath(initialFilePath ?? null)
  }, [initialFilePath, open])

  useEffect(() => {
    if (!open || !summary) {
      return
    }

    let cancelled = false
    setIsLoading(true)
    void api.getTurnDiffPatch(sessionId, summary.assistantMessageId, selectedPath ?? undefined)
      .then((response) => {
        if (!cancelled) {
          setPatch(response.patch)
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [open, selectedPath, sessionId, summary])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>Changed files</DialogTitle>
        </DialogHeader>
        {summary && (
          <div className="flex min-h-0 flex-col gap-3 md:flex-row">
            <div className="max-h-[60vh] w-full shrink-0 overflow-y-auto rounded-lg border border-border bg-card/60 md:w-64">
              {summary.files.map((file) => (
                <Button
                  key={file.path}
                  type="button"
                  variant={selectedPath === file.path ? 'secondary' : 'ghost'}
                  className="flex h-auto w-full justify-between rounded-none px-3 py-2 text-left"
                  onClick={() => setSelectedPath(file.path)}
                >
                  <span className="min-w-0 truncate text-xs">{file.path}</span>
                  <span className="shrink-0 text-[11px] text-muted-foreground">
                    <span className="text-emerald-400">+{file.additions}</span>{' '}
                    <span className="text-rose-400">-{file.deletions}</span>
                  </span>
                </Button>
              ))}
            </div>
            <div className="min-w-0 flex-1">
              {isLoading ? (
                <div className="rounded-lg border border-border bg-card/60 p-4 text-sm text-muted-foreground">
                  Loading diff...
                </div>
              ) : patch ? (
                <CodeHighlight code={patch} language="diff" className="max-h-[60vh]" />
              ) : (
                <div className="rounded-lg border border-border bg-card/60 p-4 text-sm text-muted-foreground">
                  No diff available.
                </div>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
