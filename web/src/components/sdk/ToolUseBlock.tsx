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
import { ToolInputDisplay } from './ToolInputDisplay'

interface ToolUseBlockProps {
  id: string
  name: string
  input: unknown
  result?: {
    content: string
    is_error?: boolean
  }
  isExecuting?: boolean
}

export function ToolUseBlock({ name, input, result, isExecuting }: ToolUseBlockProps) {
  const [isExpanded, setIsExpanded] = useState(true)

  const hasResult = result !== undefined
  const isError = result?.is_error

  return (
    <div className={cn(
      "rounded-lg border text-xs overflow-hidden",
      isError
        ? "border-danger/30 bg-danger/5"
        : hasResult
          ? "border-success/30 bg-success/5"
          : "border-[var(--color-border)] bg-[var(--color-surface)]"
    )}>
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center gap-2 px-3 py-2 hover:bg-[var(--color-surface-hover)] transition-colors"
      >
        {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        {isExecuting ? (
          <Loader2 size={14} className="text-accent animate-spin" />
        ) : isError ? (
          <XCircle size={14} className="text-danger" />
        ) : hasResult ? (
          <CheckCircle2 size={14} className="text-success" />
        ) : (
          <Wrench size={14} className="text-[var(--color-text-muted)]" />
        )}
        <span className="font-medium font-mono">{name}</span>
        {isExecuting && (
          <span className="text-[10px] text-accent ml-auto">executing...</span>
        )}
      </button>
      {isExpanded && (
        <div className="border-t border-[var(--color-border)]">
          {/* Input section */}
          <div className="px-3 py-2 bg-[var(--color-bg-tertiary)]">
            <ToolInputDisplay name={name} input={input} />
          </div>

          {/* Result section */}
          {hasResult && (
            <div className={cn(
              "px-3 py-2",
              isError ? "bg-danger/10" : "bg-success/10"
            )}>
              <div className={cn(
                "text-[10px] mb-1 font-medium",
                isError ? "text-danger" : "text-success"
              )}>
                {isError ? 'Error' : 'Result'}
              </div>
              <pre className={cn(
                "overflow-x-auto text-[10px] leading-relaxed whitespace-pre-wrap",
                isError ? "text-danger/80" : "text-success/80"
              )}>
                {result.content}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
