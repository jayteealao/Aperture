import { useState } from 'react'
import { cn } from '@/utils/cn'
import { Brain, ChevronDown, ChevronRight } from 'lucide-react'

interface ThinkingBlockProps {
  thinking: string
  signature?: string
  isStreaming?: boolean
}

export function ThinkingBlock({ thinking, isStreaming }: ThinkingBlockProps) {
  const [isExpanded, setIsExpanded] = useState(false)

  // Estimate token count (rough approximation: ~4 chars per token)
  const estimatedTokens = Math.ceil(thinking.length / 4)

  return (
    <div className="rounded-lg border border-purple-500/30 bg-purple-500/5 text-xs overflow-hidden">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center gap-2 px-3 py-2 hover:bg-purple-500/10 transition-colors"
      >
        {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <Brain size={14} className="text-purple-400" />
        <span className="font-medium text-purple-300">Thinking</span>
        {isStreaming && (
          <span className="inline-block w-2 h-2 bg-purple-400 rounded-full animate-pulse ml-1" />
        )}
        <span className="text-[10px] text-[var(--color-text-muted)] ml-auto">
          ~{estimatedTokens.toLocaleString()} tokens
        </span>
      </button>
      {isExpanded && (
        <div className="px-3 py-2 border-t border-purple-500/20 bg-[var(--color-bg-tertiary)]">
          <pre className={cn(
            "overflow-x-auto text-[10px] leading-relaxed whitespace-pre-wrap text-purple-200/80",
            isStreaming && "animate-pulse"
          )}>
            {thinking}
            {isStreaming && <span className="inline-block w-1.5 h-3 bg-purple-400 animate-pulse ml-0.5" />}
          </pre>
        </div>
      )}
    </div>
  )
}
