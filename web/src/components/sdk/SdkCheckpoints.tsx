// SDK Checkpoints - Checkpoint list with rewind

import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Card } from '@/components/ui/Card'
import { Spinner } from '@/components/ui/Spinner'
import { History, RotateCcw, Eye, AlertTriangle, X, FileText } from 'lucide-react'
import type { RewindFilesResult } from '@/api/types'

interface SdkCheckpointsProps {
  checkpoints: string[]
  loading: boolean
  rewindResult: RewindFilesResult | null
  onRewind: (messageId: string, dryRun?: boolean) => void
  onClearResult: () => void
}

export function SdkCheckpoints({
  checkpoints,
  loading,
  rewindResult,
  onRewind,
  onClearResult,
}: SdkCheckpointsProps) {
  const [selectedCheckpoint, setSelectedCheckpoint] = useState<string | null>(null)

  if (loading) {
    return (
      <div className="flex items-center justify-center py-4">
        <Spinner size="sm" />
      </div>
    )
  }

  if (checkpoints.length === 0) {
    return (
      <div className="text-center py-3">
        <History size={24} className="mx-auto text-[var(--color-text-muted)] mb-2" />
        <p className="text-xs text-[var(--color-text-muted)]">No checkpoints available</p>
        <p className="text-2xs text-[var(--color-text-muted)] mt-1">
          Enable file checkpointing to rewind changes
        </p>
      </div>
    )
  }

  const handlePreview = (checkpoint: string) => {
    setSelectedCheckpoint(checkpoint)
    onRewind(checkpoint, true) // Dry run
  }

  const handleRewind = (checkpoint: string) => {
    onRewind(checkpoint, false)
    setSelectedCheckpoint(null)
  }

  return (
    <div className="space-y-2">
      {/* Rewind Result */}
      {rewindResult && (
        <Card
          variant="outline"
          padding="sm"
          className={`border-l-4 ${
            rewindResult.canRewind ? 'border-l-warning' : 'border-l-danger'
          }`}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              {rewindResult.error ? (
                <div className="flex items-center gap-1.5 text-danger text-xs">
                  <X size={14} />
                  <span>{rewindResult.error}</span>
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-1.5 text-warning text-xs mb-1">
                    <AlertTriangle size={14} />
                    <span>Preview: {rewindResult.filesChanged?.length || 0} files changed</span>
                  </div>
                  {rewindResult.filesChanged && rewindResult.filesChanged.length > 0 && (
                    <div className="space-y-0.5 mb-2">
                      {rewindResult.filesChanged.slice(0, 3).map((file) => (
                        <div
                          key={file}
                          className="text-2xs text-[var(--color-text-muted)] flex items-center gap-1"
                        >
                          <FileText size={10} />
                          <span className="truncate">{file}</span>
                        </div>
                      ))}
                      {rewindResult.filesChanged.length > 3 && (
                        <div className="text-2xs text-[var(--color-text-muted)]">
                          ...and {rewindResult.filesChanged.length - 3} more
                        </div>
                      )}
                    </div>
                  )}
                  <div className="flex items-center gap-3 text-2xs">
                    <span className="text-green-400">+{rewindResult.insertions || 0}</span>
                    <span className="text-red-400">-{rewindResult.deletions || 0}</span>
                  </div>
                </>
              )}
            </div>
            <div className="flex gap-1">
              {rewindResult.canRewind && selectedCheckpoint && (
                <Button
                  variant="danger"
                  size="sm"
                  onClick={() => handleRewind(selectedCheckpoint)}
                  className="h-6 px-2 text-2xs"
                >
                  <RotateCcw size={12} />
                  Rewind
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={onClearResult}
                className="h-6 px-2"
              >
                <X size={12} />
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* Checkpoint List */}
      <div className="space-y-1">
        {checkpoints.map((checkpoint, index) => (
          <div
            key={checkpoint}
            className="flex items-center justify-between p-2 bg-[var(--color-surface)] rounded-lg group"
          >
            <div className="flex items-center gap-2 min-w-0">
              <Badge variant="outline" size="sm">
                #{checkpoints.length - index}
              </Badge>
              <span className="text-xs text-[var(--color-text-muted)] truncate font-mono">
                {checkpoint.slice(0, 12)}...
              </span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handlePreview(checkpoint)}
              className="h-6 px-2 opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <Eye size={12} />
            </Button>
          </div>
        ))}
      </div>
    </div>
  )
}
