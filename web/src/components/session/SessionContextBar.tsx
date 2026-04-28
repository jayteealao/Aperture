import { useMemo } from 'react'
import { cn } from '@/utils/cn'
import { formatNumber } from '@/utils/format'
import { ClaudeMascotIcon } from '@/components/icons/ClaudeMascotIcon'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import type { SessionResult } from '@/api/types'

const STALE_THRESHOLD_MS = 5 * 60 * 1000

interface SessionContextBarProps {
  usage: SessionResult | null
  isActive: boolean
  onClickSidebar: () => void
  lastActivityTime?: number
  className?: string
}

function computeContextUsage(usage: SessionResult) {
  const entries = Object.values(usage.usage)
  if (entries.length === 0) return null

  let totalTokens = 0
  let maxContextWindow = 0

  for (const m of entries) {
    totalTokens +=
      m.inputTokens +
      m.cacheReadInputTokens +
      m.cacheCreationInputTokens
    if (m.contextWindow && m.contextWindow > maxContextWindow) {
      maxContextWindow = m.contextWindow
    }
  }

  if (maxContextWindow === 0) return null

  const percent = Math.min(100, Math.round((totalTokens / maxContextWindow) * 100))
  const modelNames = Object.keys(usage.usage)

  return { totalTokens, maxContextWindow, percent, modelNames }
}

function getFillColor(percent: number) {
  if (percent >= 95) return 'bg-destructive'
  if (percent >= 80) return 'bg-warning'
  return 'bg-muted-foreground/60'
}

export function SessionContextBar({
  usage,
  isActive,
  onClickSidebar,
  lastActivityTime,
  className,
}: SessionContextBarProps) {
  const contextData = useMemo(
    () => (usage ? computeContextUsage(usage) : null),
    [usage],
  )

  const isStale = useMemo(() => {
    if (!lastActivityTime) return false
    return Date.now() - lastActivityTime > STALE_THRESHOLD_MS
  }, [lastActivityTime])

  const opacityClass = isStale ? 'opacity-50' : 'opacity-100'

  if (!contextData) {
    return (
      <TooltipProvider delayDuration={200}>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              className={cn(
                'flex flex-col items-center gap-0.5 transition-opacity duration-300',
                opacityClass,
                className,
              )}
              onClick={onClickSidebar}
              aria-label="Toggle SDK details"
            >
              <ClaudeMascotIcon
                size={20}
                className={cn(
                  isActive
                    ? 'text-[var(--primary)]'
                    : 'text-muted-foreground',
                  'transition-colors duration-300',
                )}
              />
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom" sideOffset={4}>
            <p className="text-xs">No usage data yet</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    )
  }

  const { percent, totalTokens, maxContextWindow, modelNames } = contextData

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            className={cn(
              'flex flex-col items-center gap-0.5 transition-opacity duration-300',
              opacityClass,
              className,
            )}
            onClick={onClickSidebar}
            aria-label="Toggle SDK details"
          >
            <ClaudeMascotIcon
              size={20}
              className={cn(
                isActive
                  ? 'text-[var(--primary)]'
                  : 'text-muted-foreground',
                'transition-colors duration-300',
              )}
            />
            <div
              className="h-[2px] w-5 rounded-full bg-secondary"
              role="progressbar"
              aria-valuenow={percent}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={`Context: ${percent}%`}
            >
              <div
                className={cn(
                  'h-full rounded-full transition-[width,background-color] duration-300 ease-in-out',
                  getFillColor(percent),
                )}
                style={{ width: `${percent}%` }}
              />
            </div>
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom" sideOffset={4}>
          <p className="text-xs font-medium">Context: {percent}%</p>
          <p className="text-xs text-muted-foreground">
            {formatNumber(totalTokens)} / {formatNumber(maxContextWindow)}{' '}
            tokens
          </p>
          {modelNames.length > 0 && (
            <p className="text-xs text-muted-foreground">
              {modelNames.join(', ')}
            </p>
          )}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
