// SDK MCP Status - MCP server list with status badges

import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Spinner } from '@/components/ui/Spinner'
import { Server, RefreshCw, AlertCircle, CheckCircle2, Clock, Lock } from 'lucide-react'
import type { McpServerStatus } from '@/api/types'

interface SdkMcpStatusProps {
  mcpStatus: McpServerStatus[]
  loading: boolean
  error?: string
  onRefresh: () => void
}

const STATUS_CONFIG: Record<
  McpServerStatus['status'],
  { variant: 'success' | 'danger' | 'warning' | 'default'; icon: React.ReactNode; label: string }
> = {
  connected: { variant: 'success', icon: <CheckCircle2 size={10} />, label: 'Connected' },
  failed: { variant: 'danger', icon: <AlertCircle size={10} />, label: 'Failed' },
  'needs-auth': { variant: 'warning', icon: <Lock size={10} />, label: 'Auth Required' },
  pending: { variant: 'default', icon: <Clock size={10} />, label: 'Pending' },
}

export function SdkMcpStatus({ mcpStatus, loading, error, onRefresh }: SdkMcpStatusProps) {
  // Check if we need to send a prompt first
  const needsPrompt = error?.includes('No active query')

  if (loading) {
    return (
      <div className="flex items-center justify-center py-4">
        <Spinner size="sm" />
      </div>
    )
  }

  if (needsPrompt) {
    return (
      <div className="text-center py-3">
        <Server size={24} className="mx-auto text-[var(--color-text-muted)] mb-2" />
        <p className="text-xs text-[var(--color-text-muted)]">Send a prompt to load MCP status</p>
      </div>
    )
  }

  if (mcpStatus.length === 0) {
    return (
      <div className="text-center py-3">
        <Server size={24} className="mx-auto text-[var(--color-text-muted)] mb-2" />
        <p className="text-xs text-[var(--color-text-muted)]">No MCP servers configured</p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {/* Header with refresh */}
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-[var(--color-text-secondary)]">
          {mcpStatus.length} server{mcpStatus.length !== 1 ? 's' : ''}
        </span>
        <Button variant="ghost" size="sm" onClick={onRefresh} className="h-6 px-2">
          <RefreshCw size={12} />
        </Button>
      </div>

      {/* Server List */}
      <div className="space-y-1.5">
        {mcpStatus.map((server) => {
          const statusConfig = STATUS_CONFIG[server.status]
          return (
            <div
              key={server.name}
              className="flex items-center justify-between p-2 bg-[var(--color-surface)] rounded-lg"
            >
              <div className="flex items-center gap-2 min-w-0">
                <Server size={14} className="text-[var(--color-text-muted)] shrink-0" />
                <span className="text-xs text-[var(--color-text-primary)] truncate">
                  {server.name}
                </span>
              </div>
              <Badge variant={statusConfig.variant} size="sm" className="shrink-0 gap-1">
                {statusConfig.icon}
                {statusConfig.label}
              </Badge>
            </div>
          )
        })}
      </div>

      {/* Error details */}
      {mcpStatus
        .filter((s) => s.error)
        .map((server) => (
          <div
            key={`${server.name}-error`}
            className="text-2xs text-danger bg-danger/10 rounded p-2"
          >
            <span className="font-medium">{server.name}:</span> {server.error}
          </div>
        ))}
    </div>
  )
}
