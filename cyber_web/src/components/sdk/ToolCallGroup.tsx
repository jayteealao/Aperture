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
      "border text-xs overflow-hidden",
      hasErrors
        ? "border-hud-error/30 bg-hud-error/5"
        : allComplete
          ? "border-hud-success/30 bg-hud-success/5"
          : "border-hud-gray/30 bg-hud-gray/10"
    )}>
      {/* Header - always visible */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center gap-2 px-3 py-2 hover:bg-hud-gray/20 transition-colors"
      >
        {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        {executingCount > 0 ? (
          <Loader2 size={14} className="text-hud-accent animate-spin" />
        ) : hasErrors ? (
          <XCircle size={14} className="text-hud-error" />
        ) : allComplete ? (
          <CheckCircle2 size={14} className="text-hud-success" />
        ) : (
          <Wrench size={14} className="text-hud-text/50" />
        )}
        <span className="font-medium">
          {toolCalls.length} tool call{toolCalls.length !== 1 ? 's' : ''}
        </span>
        <span className="text-hud-text/50 ml-auto">
          {completedCount}/{toolCalls.length} completed
          {errorCount > 0 && (
            <span className="text-hud-error ml-2">{errorCount} error{errorCount !== 1 ? 's' : ''}</span>
          )}
        </span>
      </button>

      {/* Expanded content - list of individual tool calls */}
      {isExpanded && (
        <div className="space-y-2 p-2 border-t border-hud-gray/30">
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
