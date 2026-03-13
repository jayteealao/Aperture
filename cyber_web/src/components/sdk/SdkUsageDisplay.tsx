// SDK Usage Display - Token counts, cost, turns

import { formatNumber, formatCurrency } from '@/utils/format'
import type { SessionResult } from '@/api/types'
import { Coins, Clock, Zap, ArrowDown, ArrowUp, Database } from 'lucide-react'

interface SdkUsageDisplayProps {
  usage: SessionResult | null
}

export function SdkUsageDisplay({ usage }: SdkUsageDisplayProps) {
  if (!usage) {
    return (
      <div className="text-xs text-hud-text/50 text-center py-3">
        Usage data appears after the first prompt
      </div>
    )
  }

  // Aggregate usage across all models
  const totals = Object.values(usage.usage).reduce(
    (acc, m) => ({
      inputTokens: acc.inputTokens + m.inputTokens,
      outputTokens: acc.outputTokens + m.outputTokens,
      cacheRead: acc.cacheRead + m.cacheReadInputTokens,
      cacheWrite: acc.cacheWrite + m.cacheCreationInputTokens,
    }),
    { inputTokens: 0, outputTokens: 0, cacheRead: 0, cacheWrite: 0 }
  )

  return (
    <div className="space-y-2">
      {/* Cost and Turns Row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Coins size={14} className="text-hud-success" />
          <span className="text-sm font-medium text-hud-text">
            {formatCurrency(usage.totalCostUsd)}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <Zap size={14} className="text-yellow-400" />
          <span className="text-sm text-hud-text/70">
            {usage.numTurns} turns
          </span>
        </div>
      </div>

      {/* Tokens Grid */}
      <div className="grid grid-cols-2 gap-2">
        <TokenStat
          icon={<ArrowUp size={12} />}
          label="Input"
          value={totals.inputTokens}
          color="text-blue-400"
        />
        <TokenStat
          icon={<ArrowDown size={12} />}
          label="Output"
          value={totals.outputTokens}
          color="text-green-400"
        />
        <TokenStat
          icon={<Database size={12} />}
          label="Cache Read"
          value={totals.cacheRead}
          color="text-purple-400"
        />
        <TokenStat
          icon={<Database size={12} />}
          label="Cache Write"
          value={totals.cacheWrite}
          color="text-orange-400"
        />
      </div>

      {/* Duration */}
      <div className="flex items-center gap-1.5 text-xs text-hud-text/50">
        <Clock size={12} />
        <span>
          {(usage.durationMs / 1000).toFixed(1)}s total ({(usage.durationApiMs / 1000).toFixed(1)}s API)
        </span>
      </div>
    </div>
  )
}

function TokenStat({
  icon,
  label,
  value,
  color,
}: {
  icon: React.ReactNode
  label: string
  value: number
  color: string
}) {
  return (
    <div className="bg-hud-gray/20 p-2 border border-hud-gray/30">
      <div className={`flex items-center gap-1 text-2xs ${color}`}>
        {icon}
        <span>{label}</span>
      </div>
      <div className="text-sm font-mono font-medium text-hud-text">
        {formatNumber(value)}
      </div>
    </div>
  )
}
