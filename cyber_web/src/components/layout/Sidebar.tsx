import React from 'react'
import { useNavigate } from 'react-router-dom'
import { cn } from '@/utils/cn'
import {
  HUDLabel,
  HUDMicro,
  StatusDot,
  Button,
  IconButton,
  Badge,
  Spinner,
} from '@/components/ui'
import { useSessionsStore } from '@/stores'
import type { Session, ConnectionStatus } from '@/api/types'
import {
  Plus,
  MessageSquare,
  Trash2,
  ChevronRight,
  Bot,
  Cpu,
} from 'lucide-react'

interface SidebarProps {
  className?: string
}

export function Sidebar({ className }: SidebarProps) {
  const { sessions, activeSessionId, setActiveSession, connections } = useSessionsStore()
  const navigate = useNavigate()

  const handleSelectSession = (sessionId: string) => {
    setActiveSession(sessionId)
    navigate(`/workspace/${sessionId}`)
  }

  const handleNewSession = () => {
    navigate('/sessions?new=true')
  }

  return (
    <div className={cn('h-full flex flex-col bg-hud-black/30', className)}>
      {/* Header */}
      <div className="p-4 border-b border-hud-gray/30">
        <div className="flex items-center justify-between mb-2">
          <HUDLabel className="text-hud-white">Active Sessions</HUDLabel>
          <Badge variant="outline" size="sm">
            {sessions.length}
          </Badge>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="w-full"
          icon={<Plus className="w-3.5 h-3.5" />}
          onClick={handleNewSession}
        >
          New Session
        </Button>
      </div>

      {/* Sessions list */}
      <div className="flex-1 overflow-y-auto scrollbar-hide">
        {sessions.length === 0 ? (
          <div className="p-4 text-center">
            <MessageSquare className="w-8 h-8 mx-auto mb-2 text-hud-text/30" />
            <HUDMicro className="block">No active sessions</HUDMicro>
          </div>
        ) : (
          <div className="p-2 space-y-1">
            {sessions.map((session) => {
              const connection = connections[session.id]
              const isActive = session.id === activeSessionId

              return (
                <SessionItem
                  key={session.id}
                  session={session}
                  connection={connection}
                  isActive={isActive}
                  onClick={() => handleSelectSession(session.id)}
                />
              )
            })}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="p-3 border-t border-hud-gray/30">
        <HUDMicro className="block text-center">
          SYS // APERTURE v1.1.0
        </HUDMicro>
      </div>
    </div>
  )
}

interface SessionItemProps {
  session: Session
  connection?: { status: ConnectionStatus; isStreaming: boolean; hasUnread: boolean; unreadCount: number }
  isActive: boolean
  onClick: () => void
}

function SessionItem({ session, connection, isActive, onClick }: SessionItemProps) {
  const { removeSession, disconnectSession } = useSessionsStore()
  const [showDelete, setShowDelete] = React.useState(false)

  const status = connection?.status || 'disconnected'
  const isStreaming = connection?.isStreaming || false
  const hasUnread = connection?.hasUnread || false
  const unreadCount = connection?.unreadCount || 0

  const getStatusColor = (): 'connected' | 'disconnected' | 'connecting' | 'error' => {
    switch (status) {
      case 'connected':
        return 'connected'
      case 'connecting':
      case 'reconnecting':
        return 'connecting'
      case 'error':
        return 'error'
      default:
        return 'disconnected'
    }
  }

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation()
    try {
      disconnectSession(session.id)
      await removeSession(session.id)
    } catch (error) {
      console.error('Failed to delete session:', error)
    }
  }

  return (
    <div
      className={cn(
        'relative group p-2 cursor-pointer',
        'transition-all duration-200',
        'border border-transparent',
        isActive
          ? 'bg-hud-accent/10 border-hud-accent/30'
          : 'hover:bg-hud-white/5 hover:border-hud-gray/50'
      )}
      onClick={onClick}
      onMouseEnter={() => setShowDelete(true)}
      onMouseLeave={() => setShowDelete(false)}
    >
      {/* Active indicator */}
      {isActive && (
        <div className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-6 bg-hud-accent" />
      )}

      <div className="flex items-start gap-3 pl-1">
        {/* Agent icon */}
        <div className={cn(
          'w-8 h-8 flex items-center justify-center border',
          isActive ? 'border-hud-accent text-hud-accent' : 'border-hud-gray text-hud-text'
        )}>
          {session.agent === 'claude_sdk' ? (
            <Bot className="w-4 h-4" />
          ) : (
            <Cpu className="w-4 h-4" />
          )}
        </div>

        {/* Session info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <HUDMicro className={isActive ? 'text-hud-accent' : 'text-hud-white'}>
              {session.agent === 'claude_sdk' ? 'Claude SDK' : 'Pi SDK'}
            </HUDMicro>
            {hasUnread && (
              <Badge variant="accent" size="sm" pulse>
                {unreadCount}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2 mt-1">
            <StatusDot status={getStatusColor()} pulse={isStreaming} />
            <span className="font-mono text-3xs text-hud-text/70 truncate">
              {session.id.slice(0, 8)}
            </span>
          </div>
        </div>

        {/* Streaming indicator */}
        {isStreaming && (
          <Spinner size="sm" />
        )}

        {/* Delete button */}
        {showDelete && !isStreaming && (
          <IconButton
            icon={<Trash2 className="w-3.5 h-3.5" />}
            label="Delete session"
            variant="ghost"
            size="sm"
            className="text-hud-error"
            onClick={handleDelete}
          />
        )}

        {/* Chevron */}
        {!showDelete && (
          <ChevronRight className={cn(
            'w-4 h-4 transition-transform',
            isActive ? 'text-hud-accent rotate-90' : 'text-hud-text/30'
          )} />
        )}
      </div>
    </div>
  )
}
