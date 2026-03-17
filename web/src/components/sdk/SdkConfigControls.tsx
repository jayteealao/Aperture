// SDK Config Controls - Thinking tokens, budget controls

import { useState, useCallback } from 'react'
import { Input } from '@/components/ui/input'
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
        <label htmlFor="sdk-thinking-tokens" className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground mb-1.5">
          <Brain size={12} />
          Thinking Tokens
        </label>
        <Input
          id="sdk-thinking-tokens"
          type="number"
          min={0}
          max={100000}
          step={1000}
          placeholder="Default (auto)"
          value={thinkingInput}
          onChange={(e) => setThinkingInput(e.target.value)}
          onBlur={handleThinkingBlur}
          className="text-xs"
        />
        <p className="mt-1 text-xs text-foreground/40">0–100,000 tokens for extended thinking</p>
      </div>

      {/* Max Budget */}
      <div>
        <label htmlFor="sdk-max-budget" className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground mb-1.5">
          <DollarSign size={12} />
          Max Budget (USD)
        </label>
        <Input
          id="sdk-max-budget"
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
        <label htmlFor="sdk-max-turns" className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground mb-1.5">
          <RefreshCw size={12} />
          Max Turns
        </label>
        <Input
          id="sdk-max-turns"
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
