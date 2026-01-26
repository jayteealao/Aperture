/**
 * Pi SDK Thinking Level Selector
 * Allows users to select or cycle through thinking levels
 */

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/Select'
import { Button } from '@/components/ui/Button'
import type { PiThinkingLevel } from '@/api/pi-types'

interface PiThinkingLevelSelectorProps {
  level: PiThinkingLevel
  onLevelChange: (level: PiThinkingLevel) => void
  onCycle?: () => void
  disabled?: boolean
  compact?: boolean
}

const THINKING_LEVELS: { value: PiThinkingLevel; label: string; description: string }[] = [
  { value: 'off', label: 'Off', description: 'No thinking' },
  { value: 'minimal', label: 'Minimal', description: 'Very brief thinking' },
  { value: 'low', label: 'Low', description: 'Light reasoning' },
  { value: 'medium', label: 'Medium', description: 'Balanced thinking' },
  { value: 'high', label: 'High', description: 'Deep reasoning' },
  { value: 'xhigh', label: 'Extra High', description: 'Maximum thinking' },
]

export function PiThinkingLevelSelector({
  level,
  onLevelChange,
  onCycle,
  disabled = false,
  compact = false,
}: PiThinkingLevelSelectorProps) {
  const currentLevel = THINKING_LEVELS.find((l) => l.value === level)

  if (compact && onCycle) {
    return (
      <Button
        variant="outline"
        size="sm"
        onClick={onCycle}
        disabled={disabled}
        className="gap-1.5"
        title={`Thinking: ${currentLevel?.description || level}`}
      >
        <ThinkingIcon className="h-4 w-4" />
        <span className="capitalize">{level}</span>
      </Button>
    )
  }

  return (
    <div className="flex items-center gap-2">
      <label className="text-sm text-muted-foreground">Thinking:</label>
      <Select
        value={level}
        onValueChange={(value) => onLevelChange(value as PiThinkingLevel)}
        disabled={disabled}
      >
        <SelectTrigger className="w-32">
          <SelectValue placeholder="Select level" />
        </SelectTrigger>
        <SelectContent>
          {THINKING_LEVELS.map((l) => (
            <SelectItem key={l.value} value={l.value}>
              <div className="flex flex-col">
                <span>{l.label}</span>
                <span className="text-xs text-muted-foreground">{l.description}</span>
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

function ThinkingIcon({ className }: { className?: string }) {
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
      <circle cx="12" cy="12" r="10" />
      <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
      <path d="M12 17h.01" />
    </svg>
  )
}
