/**
 * Pi SDK Control Panel
 * Provides controls for Pi-specific features like compaction, forking, and session management
 */

import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Badge } from '@/components/ui/Badge'
import { Spinner } from '@/components/ui/Spinner'
import { usePiSession } from '@/hooks/usePiSession'

interface PiControlPanelProps {
  sessionId: string
  isStreaming: boolean
}

export function PiControlPanel({ sessionId, isStreaming }: PiControlPanelProps) {
  const {
    stats,
    models,
    forkableEntries,
    isPiSession,
    isLoading,
    compact,
    newSession,
    fork,
    refreshStats,
    refreshModels,
    refreshForkable,
    steer,
    followUp,
  } = usePiSession(sessionId)

  const [steerContent, setSteerContent] = useState('')
  const [followUpContent, setFollowUpContent] = useState('')
  const [compactInstructions, setCompactInstructions] = useState('')

  if (!isPiSession) {
    return null
  }

  const handleSteer = () => {
    if (steerContent.trim()) {
      steer(steerContent)
      setSteerContent('')
    }
  }

  const handleFollowUp = () => {
    if (followUpContent.trim()) {
      followUp(followUpContent)
      setFollowUpContent('')
    }
  }

  const handleCompact = () => {
    compact(compactInstructions || undefined)
    setCompactInstructions('')
  }

  return (
    <div className="space-y-4 p-4">
      {/* Streaming Controls */}
      {isStreaming && (
        <Card className="p-4">
          <h3 className="text-sm font-medium mb-3">Streaming Controls</h3>
          <div className="space-y-3">
            <div className="flex gap-2">
              <Input
                placeholder="Steer message (interrupt & redirect)..."
                value={steerContent}
                onChange={(e) => setSteerContent(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSteer()}
                className="flex-1"
              />
              <Button onClick={handleSteer} size="sm" variant="secondary">
                Steer
              </Button>
            </div>
            <div className="flex gap-2">
              <Input
                placeholder="Follow-up message (queue for after)..."
                value={followUpContent}
                onChange={(e) => setFollowUpContent(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleFollowUp()}
                className="flex-1"
              />
              <Button onClick={handleFollowUp} size="sm" variant="secondary">
                Queue
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* Context Management */}
      <Card className="p-4">
        <h3 className="text-sm font-medium mb-3">Context Management</h3>
        <div className="space-y-3">
          <div className="flex gap-2">
            <Input
              placeholder="Compaction instructions (optional)..."
              value={compactInstructions}
              onChange={(e) => setCompactInstructions(e.target.value)}
              className="flex-1"
              disabled={isStreaming}
            />
            <Button onClick={handleCompact} size="sm" disabled={isStreaming}>
              Compact
            </Button>
          </div>
          <Button onClick={newSession} variant="outline" size="sm" disabled={isStreaming} className="w-full">
            New Session (Clear History)
          </Button>
        </div>
      </Card>

      {/* Session Stats */}
      <Card className="p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-medium">Session Stats</h3>
          <Button onClick={refreshStats} size="sm" variant="ghost" disabled={isLoading.stats}>
            {isLoading.stats ? <Spinner className="h-4 w-4" /> : 'Refresh'}
          </Button>
        </div>
        {stats ? (
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Input Tokens:</span>
              <span>{stats.inputTokens.toLocaleString()}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Output Tokens:</span>
              <span>{stats.outputTokens.toLocaleString()}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Total Cost:</span>
              <span>${stats.totalCost.toFixed(4)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Turns:</span>
              <span>{stats.turnCount}</span>
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No stats available</p>
        )}
      </Card>

      {/* Available Models */}
      <Card className="p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-medium">Available Models</h3>
          <Button onClick={refreshModels} size="sm" variant="ghost" disabled={isLoading.models}>
            {isLoading.models ? <Spinner className="h-4 w-4" /> : 'Refresh'}
          </Button>
        </div>
        {models.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {models.map((model) => (
              <Badge key={`${model.provider}-${model.modelId}`} variant="outline" className="text-xs">
                {model.provider}/{model.modelId}
                {model.supportsThinking && ' (thinking)'}
              </Badge>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No models available</p>
        )}
      </Card>

      {/* Forkable Entries */}
      <Card className="p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-medium">Forkable Messages</h3>
          <Button onClick={refreshForkable} size="sm" variant="ghost" disabled={isLoading.forkable}>
            {isLoading.forkable ? <Spinner className="h-4 w-4" /> : 'Refresh'}
          </Button>
        </div>
        {forkableEntries.length > 0 ? (
          <div className="space-y-2 max-h-40 overflow-y-auto">
            {forkableEntries.map((entry) => (
              <div key={entry.id} className="flex items-center gap-2 text-sm">
                <span className="flex-1 truncate text-muted-foreground" title={entry.content}>
                  {entry.content.slice(0, 50)}...
                </span>
                <Button onClick={() => fork(entry.id)} size="sm" variant="outline" disabled={isStreaming}>
                  Fork
                </Button>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No forkable messages</p>
        )}
      </Card>
    </div>
  )
}
