import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { SdkRuntimeActivityEntry } from '@/api/types'
import {
  Bell,
  Wrench,
  Workflow,
  ChevronRight,
  Layers3,
  TerminalSquare,
  Eraser,
} from 'lucide-react'

interface SdkRuntimeActivityProps {
  activity: SdkRuntimeActivityEntry[]
  onClear: () => void
}

export function SdkRuntimeActivity({ activity, onClear }: SdkRuntimeActivityProps) {
  if (activity.length === 0) {
    return (
      <div className="text-xs text-foreground/40 text-center py-3">
        No runtime activity yet
      </div>
    )
  }

  const recent = [...activity].reverse().slice(0, 12)

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">
          {activity.length} recent event{activity.length !== 1 ? 's' : ''}
        </span>
        <Button variant="ghost" size="sm" onClick={onClear} className="h-6 px-2">
          <Eraser size={12} />
        </Button>
      </div>

      <div className="space-y-2">
        {recent.map((entry) => {
          const presentation = getActivityPresentation(entry)
          return (
            <div key={entry.id} className="rounded-lg bg-secondary p-2">
              <div className="flex items-start justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2 text-xs text-foreground">
                  <span className="mt-0.5 shrink-0 text-foreground/50">{presentation.icon}</span>
                  <span className="font-medium truncate">{presentation.title}</span>
                </div>
                <Badge variant={severityToBadge(entry.severity)} size="sm" className="shrink-0">
                  {formatTime(entry.timestamp)}
                </Badge>
              </div>
              <div className="mt-1 text-xs text-foreground/70 break-words">
                {presentation.detail}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function getActivityPresentation(entry: SdkRuntimeActivityEntry) {
  const payload = entry.payload

  switch (entry.kind) {
    case 'tool_progress':
      return {
        icon: <Wrench size={14} />,
        title: typeof payload.toolName === 'string' ? payload.toolName : 'Tool Progress',
        detail: typeof payload.elapsedSeconds === 'number'
          ? `${payload.elapsedSeconds.toFixed(1)}s elapsed`
          : 'Running',
      }
    case 'task_notification':
      return {
        icon: <Bell size={14} />,
        title: typeof payload.summary === 'string' ? payload.summary : 'Task Notification',
        detail: [
          typeof payload.status === 'string' ? payload.status : null,
          typeof payload.outputFile === 'string' ? payload.outputFile : null,
        ].filter(Boolean).join(' • ') || 'Task update received',
      }
    case 'hook_started':
      return {
        icon: <Workflow size={14} />,
        title: typeof payload.hookName === 'string' ? payload.hookName : 'Hook Started',
        detail: typeof payload.hookEvent === 'string' ? payload.hookEvent : 'Hook execution began',
      }
    case 'hook_progress':
      return {
        icon: <ChevronRight size={14} />,
        title: 'Hook Progress',
        detail: getFirstString(payload.stdout, payload.stderr, payload.output) || 'Hook produced output',
      }
    case 'hook_response':
      return {
        icon: <Workflow size={14} />,
        title: 'Hook Response',
        detail: [
          typeof payload.outcome === 'string' ? payload.outcome : null,
          typeof payload.exitCode === 'number' ? `exit ${payload.exitCode}` : null,
        ].filter(Boolean).join(' • ') || 'Hook completed',
      }
    case 'compact_boundary':
      return {
        icon: <Layers3 size={14} />,
        title: 'Compaction Boundary',
        detail: [
          typeof payload.trigger === 'string' ? payload.trigger : null,
          typeof payload.preTokens === 'number' ? `${payload.preTokens} tokens` : null,
        ].filter(Boolean).join(' • ') || 'Claude compacted context',
      }
    case 'system':
      return {
        icon: <TerminalSquare size={14} />,
        title: typeof payload.subtype === 'string' ? payload.subtype : 'System Event',
        detail: stringifyPayload(payload),
      }
  }
}

function getFirstString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) {
      return value.trim()
    }
  }
  return ''
}

function stringifyPayload(payload: Record<string, unknown>) {
  for (const [key, value] of Object.entries(payload)) {
    if (typeof value === 'string' && value.trim()) {
      return `${key}: ${value.trim()}`
    }
  }
  return JSON.stringify(payload)
}

function severityToBadge(severity: SdkRuntimeActivityEntry['severity']) {
  switch (severity) {
    case 'success':
      return 'success'
    case 'warning':
      return 'warning'
    case 'danger':
      return 'danger'
    default:
      return 'outline'
  }
}

function formatTime(timestamp: number) {
  return new Date(timestamp).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  })
}
