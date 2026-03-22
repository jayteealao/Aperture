import { useMemo, useState } from 'react'
import { ChevronDown, ChevronUp, Eye } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { TurnDiffSummary } from '@/api/types'
import { ChangedFilesTree } from './ChangedFilesTree'
import { TurnDiffPanel } from './TurnDiffPanel'

interface TurnDiffCardProps {
  sessionId: string
  summary: TurnDiffSummary
}

export function TurnDiffCard({ sessionId, summary }: TurnDiffCardProps) {
  const [expandedAll, setExpandedAll] = useState(false)
  const [panelOpen, setPanelOpen] = useState(false)
  const [selectedFile, setSelectedFile] = useState<string | null>(null)

  const statsLabel = useMemo(
    () => `+${summary.additions} -${summary.deletions}`,
    [summary.additions, summary.deletions]
  )

  return (
    <>
      <div className="mt-3 w-full max-w-full overflow-hidden rounded-lg border border-border bg-card/60">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2">
          <div className="min-w-0">
            <div className="text-sm font-medium text-foreground">
              Changed files ({summary.fileCount})
            </div>
            <div className="text-xs text-muted-foreground">{statsLabel}</div>
          </div>
          <div className="flex flex-wrap items-center gap-1">
            <Button
              type="button"
              size="xs"
              variant="ghost"
              leftIcon={expandedAll ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />}
              onClick={() => setExpandedAll((value) => !value)}
            >
              {expandedAll ? 'Collapse all' : 'Expand all'}
            </Button>
            <Button
              type="button"
              size="xs"
              variant="secondary"
              leftIcon={<Eye className="size-3" />}
              onClick={() => {
                setSelectedFile(null)
                setPanelOpen(true)
              }}
            >
              View diff
            </Button>
          </div>
        </div>
        <div className="px-2 py-2">
          <ChangedFilesTree
            files={summary.files}
            expandedAll={expandedAll}
            onFileSelect={(filePath) => {
              setSelectedFile(filePath)
              setPanelOpen(true)
            }}
          />
        </div>
      </div>
      <TurnDiffPanel
        sessionId={sessionId}
        summary={summary}
        open={panelOpen}
        initialFilePath={selectedFile}
        onOpenChange={setPanelOpen}
      />
    </>
  )
}
