import { useEffect, useMemo, useState } from 'react'
import { cn } from '@/utils/cn'
import { formatNumber } from '@/utils/format'
import { AnimatedClawdMascot } from './AnimatedClawdMascot'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import type { SessionResult, SessionVisualState } from '@/api/types'

const STALE_THRESHOLD_MS = 5 * 60 * 1000
const POLL_INTERVAL_MS = 30 * 1000

interface SessionContextBarProps {
  usage: SessionResult | null
  sessionState: SessionVisualState
  sdkSidebarOpen?: boolean
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
    const input = Number(m.inputTokens) || 0
    const cacheRead = Number(m.cacheReadInputTokens) || 0
    const cacheWrite = Number(m.cacheCreationInputTokens) || 0
    const output = Number(m.outputTokens) || 0
    totalTokens += input + cacheRead + cacheWrite + output
    const cw = Number(m.contextWindow)
    if (Number.isFinite(cw) && cw > maxContextWindow) {
      maxContextWindow = cw
    }
  }

  if (maxContextWindow === 0) return null
  if (!Number.isFinite(totalTokens)) return null

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
  sessionState,
  sdkSidebarOpen,
  onClickSidebar,
  lastActivityTime,
  className,
}: SessionContextBarProps) {
  const contextData = useMemo(
    () => (usage ? computeContextUsage(usage) : null),
    [usage],
  )

  const [isStale, setIsStale] = useState(false)

  useEffect(() => {
    if (!lastActivityTime) {
      setIsStale(false)
      return
    }
    const check = () => setIsStale(Date.now() - lastActivityTime > STALE_THRESHOLD_MS)
    check()
    const id = setInterval(check, POLL_INTERVAL_MS)
    const onVisible = () => { if (!document.hidden) check() }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [lastActivityTime])

  const opacityClass = isStale ? 'opacity-50' : 'opacity-100'
  const buttonLabel = sdkSidebarOpen ? 'Close SDK sidebar' : 'Open SDK sidebar'
  const percent = contextData?.percent

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
            aria-label={buttonLabel}
          >
            {/* The animated mascot's per-state animation (idle bobbing, working
                variants, awaiting alert, disconnected slump) is the primary
                activity signal for SDK desktop sessions — WorkspaceChatPane
                suppresses the shimmer text label for the continuous active
                states. */}
            <AnimatedClawdMascot
              sessionState={sessionState}
              size={20}
              aria-hidden="true"
            />
            {contextData && (
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
                    getFillColor(contextData.percent),
                  )}
                  style={{ width: `${percent}%` }}
                />
              </div>
            )}
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom" sideOffset={4}>
          {contextData ? (
            <>
              <p className="text-xs font-medium">Context: {contextData.percent}%</p>
              <p className="text-xs text-muted-foreground">
                {formatNumber(contextData.totalTokens)} / {formatNumber(contextData.maxContextWindow)}{' '}
                tokens
              </p>
              {contextData.modelNames.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  {contextData.modelNames.join(', ')}
                </p>
              )}
            </>
          ) : (
            <p className="text-xs">No usage data yet</p>
          )}
        </TooltipContent>
        {contextData && (
          <span className="sr-only">
            Context: {contextData.percent}%, {formatNumber(contextData.totalTokens)} of {formatNumber(contextData.maxContextWindow)} tokens used
          </span>
        )}
      </Tooltip>
    </TooltipProvider>
  )
}
