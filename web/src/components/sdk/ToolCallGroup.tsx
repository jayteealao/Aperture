import { useState } from 'react'
import { cn } from '@/utils/cn'
import {
  ChevronDown,
  ChevronRight,
  Wrench,
  Loader2,
  CheckCircle2,
  XCircle,
} from 'lucide-react'
import { ToolUseBlock } from './ToolUseBlock'

interface ToolCallData {
  id: string
  name: string
  input: unknown
  result?: {
    content: string
    is_error?: boolean
  }
  isExecuting: boolean
}

interface ToolCallGroupProps {
  toolCalls: ToolCallData[]
}

export function ToolCallGroup({ toolCalls }: ToolCallGroupProps) {
  const [isExpanded, setIsExpanded] = useState(false)

  const completedCount = toolCalls.filter(t => t.result !== undefined).length
  const errorCount = toolCalls.filter(t => t.result?.is_error).length
  const executingCount = toolCalls.filter(t => t.isExecuting).length
  const allComplete = completedCount === toolCalls.length
  const hasErrors = errorCount > 0

  return (
    <div className={cn(
      "rounded-lg border text-xs overflow-hidden",
      hasErrors
        ? "border-danger/30 bg-danger/5"
        : allComplete
          ? "border-success/30 bg-success/5"
          : "border-[var(--color-border)] bg-[var(--color-surface)]"
    )}>
      {/* Header - always visible */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center gap-2 px-3 py-2 hover:bg-[var(--color-surface-hover)] transition-colors"
      >
        {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        {executingCount > 0 ? (
          <Loader2 size={14} className="text-accent animate-spin" />
        ) : hasErrors ? (
          <XCircle size={14} className="text-danger" />
        ) : allComplete ? (
          <CheckCircle2 size={14} className="text-success" />
        ) : (
          <Wrench size={14} className="text-[var(--color-text-muted)]" />
        )}
        <span className="font-medium">
          {toolCalls.length} tool call{toolCalls.length !== 1 ? 's' : ''}
        </span>
        <span className="text-[var(--color-text-muted)] ml-auto">
          {completedCount}/{toolCalls.length} completed
          {errorCount > 0 && (
            <span className="text-danger ml-2">{errorCount} error{errorCount !== 1 ? 's' : ''}</span>
          )}
        </span>
      </button>

      {/* Expanded content - list of individual tool calls */}
      {isExpanded && (
        <div className="space-y-2 p-2 border-t border-[var(--color-border)]">
          {toolCalls.map(tc => (
            <ToolUseBlock
              key={tc.id}
              id={tc.id}
              name={tc.name}
              input={tc.input}
              result={tc.result}
              isExecuting={tc.isExecuting}
            />
          ))}
        </div>
      )}
    </div>
  )
}
