// SDK Checkpoints - Checkpoint list with rewind

import { useState } from 'react'
import { Button, Badge, Card, Spinner } from '@/components/ui'
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
        <History size={24} className="mx-auto text-hud-text/50 mb-2" />
        <p className="text-xs text-hud-text/50">No checkpoints available</p>
        <p className="text-2xs text-hud-text/30 mt-1">
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
          variant="bordered"
          className={`border-l-4 ${
            rewindResult.canRewind ? 'border-l-yellow-500' : 'border-l-hud-error'
          }`}
        >
          <div className="flex items-start justify-between gap-2 p-3">
            <div className="flex-1 min-w-0">
              {rewindResult.error ? (
                <div className="flex items-center gap-1.5 text-hud-error text-xs">
                  <X size={14} />
                  <span>{rewindResult.error}</span>
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-1.5 text-yellow-400 text-xs mb-1">
                    <AlertTriangle size={14} />
                    <span>Preview: {rewindResult.filesChanged?.length || 0} files changed</span>
                  </div>
                  {rewindResult.filesChanged && rewindResult.filesChanged.length > 0 && (
                    <div className="space-y-0.5 mb-2">
                      {rewindResult.filesChanged.slice(0, 3).map((file) => (
                        <div
                          key={file}
                          className="text-2xs text-hud-text/50 flex items-center gap-1"
                        >
                          <FileText size={10} />
                          <span className="truncate">{file}</span>
                        </div>
                      ))}
                      {rewindResult.filesChanged.length > 3 && (
                        <div className="text-2xs text-hud-text/30">
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
                  variant="outline"
                  onClick={() => handleRewind(selectedCheckpoint)}
                  className="h-6 px-2 text-2xs border-hud-error text-hud-error"
                >
                  <RotateCcw size={12} />
                  Rewind
                </Button>
              )}
              <Button
                variant="outline"
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
            className="flex items-center justify-between p-2 bg-hud-gray/20 border border-hud-gray/30 group"
          >
            <div className="flex items-center gap-2 min-w-0">
              <Badge variant="default">
                #{checkpoints.length - index}
              </Badge>
              <span className="text-xs text-hud-text/50 truncate font-mono">
                {checkpoint.slice(0, 12)}...
              </span>
            </div>
            <Button
              variant="outline"
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
