// SDK Config Controls - Thinking tokens, budget controls

import { useState, useCallback } from 'react'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { Brain, DollarSign, RefreshCw } from 'lucide-react'
import type { SdkSessionConfig } from '@/api/types'

interface SdkConfigControlsProps {
  config?: SdkSessionConfig
  onThinkingTokensChange: (tokens: number | null) => void
  onConfigUpdate: (config: Partial<SdkSessionConfig>) => void
}

export function SdkConfigControls({
  config,
  onThinkingTokensChange,
  onConfigUpdate,
}: SdkConfigControlsProps) {
  const [thinkingInput, setThinkingInput] = useState(
    config?.maxThinkingTokens?.toString() || ''
  )
  const [budgetInput, setBudgetInput] = useState(
    config?.maxBudgetUsd?.toString() || ''
  )
  const [turnsInput, setTurnsInput] = useState(
    config?.maxTurns?.toString() || ''
  )

  const handleThinkingBlur = useCallback(() => {
    const value = thinkingInput.trim()
    if (value === '') {
      onThinkingTokensChange(null)
    } else {
      const num = parseInt(value, 10)
      if (!isNaN(num) && num >= 0 && num <= 100000) {
        onThinkingTokensChange(num)
      }
    }
  }, [thinkingInput, onThinkingTokensChange])

  const handleBudgetBlur = useCallback(() => {
    const value = budgetInput.trim()
    if (value === '') {
      onConfigUpdate({ maxBudgetUsd: undefined })
    } else {
      const num = parseFloat(value)
      if (!isNaN(num) && num > 0) {
        onConfigUpdate({ maxBudgetUsd: num })
      }
    }
  }, [budgetInput, onConfigUpdate])

  const handleTurnsBlur = useCallback(() => {
    const value = turnsInput.trim()
    if (value === '') {
      onConfigUpdate({ maxTurns: undefined })
    } else {
      const num = parseInt(value, 10)
      if (!isNaN(num) && num > 0) {
        onConfigUpdate({ maxTurns: num })
      }
    }
  }, [turnsInput, onConfigUpdate])

  return (
    <div className="space-y-3">
      {/* Thinking Tokens */}
      <div>
        <label className="flex items-center gap-1.5 text-xs font-medium text-[var(--color-text-secondary)] mb-1.5">
          <Brain size={12} />
          Thinking Tokens
        </label>
        <Input
          type="number"
          min={0}
          max={100000}
          step={1000}
          placeholder="Default (auto)"
          value={thinkingInput}
          onChange={(e) => setThinkingInput(e.target.value)}
          onBlur={handleThinkingBlur}
          className="text-xs"
          hint="0-100,000 tokens for extended thinking"
        />
      </div>

      {/* Max Budget */}
      <div>
        <label className="flex items-center gap-1.5 text-xs font-medium text-[var(--color-text-secondary)] mb-1.5">
          <DollarSign size={12} />
          Max Budget (USD)
        </label>
        <Input
          type="number"
          min={0}
          step={0.1}
          placeholder="No limit"
          value={budgetInput}
          onChange={(e) => setBudgetInput(e.target.value)}
          onBlur={handleBudgetBlur}
          className="text-xs"
        />
      </div>

      {/* Max Turns */}
      <div>
        <label className="flex items-center gap-1.5 text-xs font-medium text-[var(--color-text-secondary)] mb-1.5">
          <RefreshCw size={12} />
          Max Turns
        </label>
        <Input
          type="number"
          min={1}
          step={1}
          placeholder="No limit"
          value={turnsInput}
          onChange={(e) => setTurnsInput(e.target.value)}
          onBlur={handleTurnsBlur}
          className="text-xs"
        />
      </div>
    </div>
  )
}
