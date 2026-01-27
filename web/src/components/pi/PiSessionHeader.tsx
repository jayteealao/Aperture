/**
 * Pi SDK Session Header
 * Displays Pi session status, model, and basic controls
 */

import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { PiThinkingLevelSelector } from './PiThinkingLevelSelector'
import { usePiSession } from '@/hooks/usePiSession'

interface PiSessionHeaderProps {
  sessionId: string
  isStreaming: boolean
}

export function PiSessionHeader({ sessionId, isStreaming }: PiSessionHeaderProps) {
  const {
    config,
    thinkingLevel,
    isPiSession,
    cycleModel,
    cycleThinking,
    setThinkingLevel,
  } = usePiSession(sessionId)

  if (!isPiSession) {
    return null
  }

  const currentModel = config?.model

  return (
    <div className="flex items-center justify-between border-b border-border px-4 py-2 bg-muted/30">
      <div className="flex items-center gap-3">
        <Badge variant="default" className="gap-1.5">
          <PiIcon className="h-3.5 w-3.5" />
          Pi SDK
        </Badge>

        {currentModel && (
          <div className="flex items-center gap-1.5">
            <span className="text-sm text-muted-foreground">Model:</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={cycleModel}
              disabled={isStreaming}
              className="h-7 px-2 font-mono text-xs"
              title="Click to cycle model"
            >
              {currentModel.provider}/{currentModel.modelId}
            </Button>
          </div>
        )}
      </div>

      <div className="flex items-center gap-3">
        <PiThinkingLevelSelector
          level={thinkingLevel}
          onLevelChange={setThinkingLevel}
          onCycle={cycleThinking}
          disabled={isStreaming}
          compact
        />

        {isStreaming && (
          <Badge variant="default" className="animate-pulse">
            Streaming
          </Badge>
        )}
      </div>
    </div>
  )
}

function PiIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M8 6h13" />
      <path d="M8 6v12" />
      <path d="M15 6v12" />
      <path d="M3 6h2" />
    </svg>
  )
}
