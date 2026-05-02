import type { ReactNode } from 'react'
import type { AgentType, ConnectionState, SessionResult } from '@/api/types'
import { cn } from '@/utils/cn'
import { Badge } from '@/components/ui/badge'
import { ConnectionStatus } from '@/components/chat'
import { SessionContextBar } from './SessionContextBar'
import { GitBranchLabel } from './GitBranchLabel'

export interface AgentHeaderSlots {
  identitySlot: ReactNode
  metadataSlot: ReactNode
}

export function getAgentHeaderSlots(params: {
  agent: AgentType
  connection: ConnectionState | null
  sdkUsage: SessionResult | null
  gitBranch: string | null
  isActive: boolean
  sdkSidebarOpen: boolean
  isDataStale: boolean
  onToggleSidebar: () => void
  lastActivityTime?: number
  agentLabel: string
  agentVariant: 'accent' | 'secondary'
}): AgentHeaderSlots {
  if (params.agent === 'claude_sdk') {
    return {
      identitySlot: (
        <SessionContextBar
          usage={params.sdkUsage}
          isActive={params.isActive}
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
