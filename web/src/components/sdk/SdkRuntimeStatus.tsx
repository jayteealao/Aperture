import { Badge } from '@/components/ui/badge'
import type { SdkAuthStatus, SdkRuntimeStatus as SdkRuntimeStatusType, SdkMcpUpdateResult } from '@/api/types'
import { ShieldCheck, ShieldAlert, Activity, ServerCog } from 'lucide-react'

interface SdkRuntimeStatusProps {
  authStatus: SdkAuthStatus | null
  runtimeStatus: SdkRuntimeStatusType | null
  mcpUpdateResult: SdkMcpUpdateResult | null
}

export function SdkRuntimeStatus({
  authStatus,
  runtimeStatus,
  mcpUpdateResult,
}: SdkRuntimeStatusProps) {
  if (!authStatus && !runtimeStatus && !mcpUpdateResult) {
    return (
      <div className="text-xs text-foreground/40 text-center py-3">
        No runtime status yet
      </div>
    )
  }

  const mcpErrorCount = mcpUpdateResult ? Object.keys(mcpUpdateResult.errors).length : 0
  const mcpSummary = mcpUpdateResult
    ? [
        mcpUpdateResult.added.length > 0 ? `+${mcpUpdateResult.added.length} added` : null,
        mcpUpdateResult.removed.length > 0 ? `-${mcpUpdateResult.removed.length} removed` : null,
        mcpErrorCount > 0 ? `${mcpErrorCount} errors` : null,
      ].filter(Boolean).join(' • ')
    : null

  return (
    <div className="space-y-2.5">
      {authStatus && (
        <StatusRow
          icon={authStatus.error ? <ShieldAlert size={14} /> : <ShieldCheck size={14} />}
          label="Auth"
          detail={authStatus.error || authStatus.output || 'Ready'}
          badge={
            <Badge
              variant={authStatus.error ? 'danger' : authStatus.isAuthenticating ? 'warning' : 'success'}
              size="sm"
            >
              {authStatus.error ? 'Error' : authStatus.isAuthenticating ? 'Authenticating' : 'Ready'}
            </Badge>
          }
        />
      )}

      {runtimeStatus && (
        <StatusRow
          icon={<Activity size={14} />}
          label="Runtime"
          detail={runtimeStatus.status}
          badge={
            <Badge variant="outline" size="sm">
              {runtimeStatus.status}
            </Badge>
          }
        />
      )}

      {mcpUpdateResult && (
        <StatusRow
          icon={<ServerCog size={14} />}
          label="MCP Update"
          detail={mcpUpdateResult.error || mcpSummary || 'No changes'}
          badge={
            <Badge
              variant={
                mcpUpdateResult.error || mcpErrorCount > 0
                  ? 'danger'
                  : mcpUpdateResult.added.length > 0 || mcpUpdateResult.removed.length > 0
                    ? 'success'
                    : 'outline'
              }
              size="sm"
            >
              {mcpUpdateResult.error || mcpErrorCount > 0 ? 'Needs Review' : 'Applied'}
            </Badge>
          }
        />
      )}
    </div>
  )
}

function StatusRow({
  icon,
  label,
  detail,
  badge,
}: {
  icon: React.ReactNode
  label: string
  detail: string
  badge: React.ReactNode
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs text-foreground/50">
          {icon}
          <span>{label}</span>
        </div>
        {badge}
      </div>
      <div className="text-xs text-foreground break-words">
        {detail}
      </div>
    </div>
  )
}
