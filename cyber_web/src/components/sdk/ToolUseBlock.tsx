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
      "border text-xs overflow-hidden",
      isError
        ? "border-hud-error/30 bg-hud-error/5"
        : hasResult
          ? "border-hud-success/30 bg-hud-success/5"
          : "border-hud-gray/30 bg-hud-gray/10"
    )}>
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center gap-2 px-3 py-2 hover:bg-hud-gray/20 transition-colors"
      >
        {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        {isExecuting ? (
          <Loader2 size={14} className="text-hud-accent animate-spin" />
        ) : isError ? (
          <XCircle size={14} className="text-hud-error" />
        ) : hasResult ? (
          <CheckCircle2 size={14} className="text-hud-success" />
        ) : (
          <Wrench size={14} className="text-hud-text/50" />
        )}
        <span className="font-medium font-mono">{name}</span>
        {isExecuting && (
          <span className="text-[10px] text-hud-accent ml-auto">executing...</span>
        )}
      </button>
      {isExpanded && (
        <div className="border-t border-hud-gray/30">
          {/* Input section */}
          <div className="px-3 py-2 bg-hud-gray/10">
            <ToolInputDisplay name={name} input={input} />
          </div>

          {/* Result section */}
          {hasResult && (
            <div className={cn(
              "px-3 py-2",
              isError ? "bg-hud-error/10" : "bg-hud-success/10"
            )}>
              <div className={cn(
                "text-[10px] mb-1 font-medium",
                isError ? "text-hud-error" : "text-hud-success"
              )}>
                {isError ? 'Error' : 'Result'}
              </div>
              <pre className={cn(
                "overflow-x-auto text-[10px] leading-relaxed whitespace-pre-wrap",
                isError ? "text-hud-error/80" : "text-hud-success/80"
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
