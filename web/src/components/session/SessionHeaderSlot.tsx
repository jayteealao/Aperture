import type { ReactNode } from 'react'
import type { AgentType, ConnectionState, SessionResult, SessionVisualState } from '@/api/types'
import { cn } from '@/utils/cn'
import { Badge } from '@/components/ui/badge'
import { ConnectionStatus } from '@/components/chat'
import { SessionContextBar } from './SessionContextBar'
import { GitBranchLabel } from './GitBranchLabel'

export interface AgentHeaderSlots {
  identitySlot: ReactNode
  metadataSlot: ReactNode
}

// Derives the visual-state union used by AnimatedClawdMascot from raw chat
// status, pending permissions, and connection state. Priority order matters:
// disconnected > awaiting > active > starting > idle.
export function deriveSessionVisualState(
  status: string,
  pendingPermissionCount: number,
  connection: ConnectionState | null,
): SessionVisualState {
  if (connection && connection.status !== 'connected') return 'disconnected'
  if (pendingPermissionCount > 0) return 'awaiting'
  if (status === 'streaming') return 'active'
  if (status === 'submitted') return 'starting'
  return 'idle'
}

export function getAgentHeaderSlots(params: {
  agent: AgentType
  connection: ConnectionState | null
  sdkUsage: SessionResult | null
  gitBranch: string | null
  status: string
  pendingPermissionCount: number
  sdkSidebarOpen: boolean
  isDataStale: boolean
  onToggleSidebar: () => void
  lastActivityTime?: number
  agentLabel: string
  agentVariant: 'accent' | 'secondary'
}): AgentHeaderSlots {
  if (params.agent === 'claude_sdk') {
    const sessionState = deriveSessionVisualState(
      params.status,
      params.pendingPermissionCount,
      params.connection,
    )
    return {
      identitySlot: (
        <SessionContextBar
          usage={params.sdkUsage}
          sessionState={sessionState}
          sdkSidebarOpen={params.sdkSidebarOpen}
          onClickSidebar={params.onToggleSidebar}
          lastActivityTime={params.lastActivityTime}
        />
      ),
      metadataSlot: (
        <span className={cn('shrink min-w-0 transition-opacity duration-300', params.isDataStale && 'opacity-50')}>
          <GitBranchLabel branch={params.gitBranch} />
        </span>
      ),
    }
  }

  return {
    identitySlot: (
      <ConnectionStatus status={params.connection?.status ?? 'disconnected'} />
    ),
    metadataSlot: (
      <Badge variant={params.agentVariant} size="sm">{params.agentLabel}</Badge>
    ),
  }
}
