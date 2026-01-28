import React from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { cn } from '@/utils/cn'
import {
  HUDLabel,
  HUDMicro,
  HUDTitle,
  HUDSeparator,
  Card,
  Button,
  IconButton,
  Badge,
  StatusDot,
  Input,
  Select,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogBody,
  DialogFooter,
  ConfirmDialog,
  Spinner,
  Skeleton,
} from '@/components/ui'
import { Shell, Topbar, Sidebar } from '@/components/layout'
import { useSessionsStore, useAppStore } from '@/stores'
import { api } from '@/api/client'
import type { Session, CreateSessionRequest, AgentType, Credential } from '@/api/types'
import {
  Plus,
  Bot,
  Cpu,
  Trash2,
  RefreshCw,
  Clock,
} from 'lucide-react'

export function SessionsPage() {
  const [searchParams] = useSearchParams()
  const showNewDialog = searchParams.get('new') === 'true'
  const { sidebarOpen } = useAppStore()
  const { sessions, connections, setActiveSession, removeSession, disconnectSession, connectSession } =
    useSessionsStore()
  const navigate = useNavigate()

  const [isNewDialogOpen, setIsNewDialogOpen] = React.useState(showNewDialog)
  const [deleteSession, setDeleteSession] = React.useState<Session | null>(null)
  const [isLoading, setIsLoading] = React.useState(false)

  // Refresh sessions on mount
  React.useEffect(() => {
    refreshSessions()
  }, [])

  const refreshSessions = async () => {
    setIsLoading(true)
    try {
      // Sessions are loaded from store which fetches from IndexedDB and backend
    } catch (error) {
      console.error('Failed to refresh sessions:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleSelectSession = async (session: Session) => {
    setActiveSession(session.id)
    // Connect WebSocket
    await connectSession(session.id)
    navigate(`/workspace/${session.id}`)
  }

  const handleDeleteSession = async () => {
    if (!deleteSession) return
    try {
      disconnectSession(deleteSession.id)
      await api.deleteSession(deleteSession.id)
      await removeSession(deleteSession.id)
      setDeleteSession(null)
    } catch (error) {
      console.error('Failed to delete session:', error)
    }
  }

  return (
    <Shell
      sidebarOpen={sidebarOpen}
      rightPanelOpen={false}
      topbar={<Topbar />}
      sidebar={<Sidebar />}
    >
      <div className="flex-1 overflow-auto p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <HUDTitle>Session Control</HUDTitle>
            <HUDMicro className="mt-1">Manage active agent sessions</HUDMicro>
          </div>
          <div className="flex items-center gap-3">
            <IconButton
              icon={<RefreshCw className="w-4 h-4" />}
              label="Refresh"
              variant="outline"
              onClick={refreshSessions}
            />
            <Button
              variant="primary"
              icon={<Plus className="w-4 h-4" />}
              onClick={() => setIsNewDialogOpen(true)}
            >
              New Session
            </Button>
          </div>
        </div>

        <HUDSeparator />

        {/* Sessions Grid */}
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-6">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} variant="rectangular" height={180} />
            ))}
          </div>
        ) : sessions.length === 0 ? (
          <EmptyState onCreateNew={() => setIsNewDialogOpen(true)} />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-6">
            {sessions.map((session) => (
              <SessionCard
                key={session.id}
                session={session}
                connection={connections[session.id]}
                onSelect={() => handleSelectSession(session)}
                onDelete={() => setDeleteSession(session)}
              />
            ))}
          </div>
        )}
      </div>

      {/* New Session Dialog */}
      <NewSessionDialog
        open={isNewDialogOpen}
        onOpenChange={setIsNewDialogOpen}
        onSuccess={(session) => {
          setIsNewDialogOpen(false)
          handleSelectSession(session)
        }}
      />

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={!!deleteSession}
        onOpenChange={(open) => !open && setDeleteSession(null)}
        title="Delete Session"
        description={`Are you sure you want to delete session ${deleteSession?.id.slice(0, 8)}? This action cannot be undone.`}
        confirmLabel="Delete"
        variant="danger"
        onConfirm={handleDeleteSession}
      />
    </Shell>
  )
}

interface SessionCardProps {
  session: Session
  connection?: {
    status: string
    isStreaming: boolean
    hasUnread: boolean
    unreadCount: number
  }
  onSelect: () => void
  onDelete: () => void
}

function SessionCard({ session, connection, onSelect, onDelete }: SessionCardProps) {
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

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp)
    return date.toLocaleString()
  }

  return (
    <Card
      variant={hasUnread ? 'accent' : 'bordered'}
      corners
      className="cursor-pointer hover:border-hud-accent/50 transition-colors"
      onClick={onSelect}
    >
      <div className="flex items-start justify-between">
        {/* Agent icon and type */}
        <div className="flex items-center gap-3">
          <div
            className={cn(
              'w-12 h-12 flex items-center justify-center border',
              session.agent === 'claude_sdk' ? 'border-hud-info' : 'border-hud-success'
            )}
          >
            {session.agent === 'claude_sdk' ? (
              <Bot className="w-6 h-6 text-hud-info" />
            ) : (
              <Cpu className="w-6 h-6 text-hud-success" />
            )}
          </div>
          <div>
            <HUDLabel className="text-hud-white">
              {session.agent === 'claude_sdk' ? 'Claude SDK' : 'Pi SDK'}
            </HUDLabel>
            <HUDMicro className="block mt-0.5">{session.id.slice(0, 12)}</HUDMicro>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          {hasUnread && (
            <Badge variant="accent" size="sm" pulse>
              {unreadCount}
            </Badge>
          )}
          <IconButton
            icon={<Trash2 className="w-4 h-4" />}
            label="Delete session"
            variant="ghost"
            size="sm"
            className="text-hud-error opacity-0 group-hover:opacity-100"
            onClick={(e) => {
              e.stopPropagation()
              onDelete()
            }}
          />
        </div>
      </div>

      <HUDSeparator className="my-3" />

      {/* Status */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <StatusDot status={getStatusColor()} pulse={isStreaming} />
          <HUDMicro>{status.toUpperCase()}</HUDMicro>
          {isStreaming && <Spinner size="sm" />}
        </div>

        <div className="flex items-center gap-1 text-hud-text/50">
          <Clock className="w-3 h-3" />
          <HUDMicro>{formatTime(session.status.lastActivityTime)}</HUDMicro>
        </div>
      </div>

      {/* Working directory */}
      {session.status.workingDirectory && (
        <div className="mt-2 font-mono text-3xs text-hud-text/50 truncate">
          {session.status.workingDirectory}
        </div>
      )}
    </Card>
  )
}

function EmptyState({ onCreateNew }: { onCreateNew: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-16">
      <div className="w-20 h-20 mb-6 relative">
        <div className="absolute inset-0 border border-hud-gray rounded-full" />
        <div className="absolute inset-2 border border-dashed border-hud-gray/50 rounded-full" />
        <div className="absolute inset-0 flex items-center justify-center">
          <Bot className="w-8 h-8 text-hud-text/30" />
        </div>
      </div>
      <HUDTitle className="text-lg text-hud-text">No Active Sessions</HUDTitle>
      <HUDMicro className="mt-2 mb-6">Create a new session to get started</HUDMicro>
      <Button variant="primary" icon={<Plus className="w-4 h-4" />} onClick={onCreateNew}>
        Create Session
      </Button>
    </div>
  )
}

interface NewSessionDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: (session: Session) => void
}

function NewSessionDialog({ open, onOpenChange, onSuccess }: NewSessionDialogProps) {
  const { addSession } = useSessionsStore()
  const [agentType, setAgentType] = React.useState<AgentType>('claude_sdk')
  const [credentials, setCredentials] = React.useState<Credential[]>([])
  const [selectedCredential, setSelectedCredential] = React.useState('')
  const [repoPath, setRepoPath] = React.useState('')
  const [isLoading, setIsLoading] = React.useState(false)
  const [error, setError] = React.useState('')

  // Load credentials on open
  React.useEffect(() => {
    if (open) {
      loadCredentials()
    }
  }, [open])

  const loadCredentials = async () => {
    try {
      const response = await api.listCredentials()
      setCredentials(response.credentials)
    } catch (error) {
      console.error('Failed to load credentials:', error)
    }
  }

  const handleCreate = async () => {
    setIsLoading(true)
    setError('')

    try {
      const request: CreateSessionRequest = {
        agent: agentType,
        auth: selectedCredential
          ? { mode: 'api_key', apiKeyRef: 'stored', storedCredentialId: selectedCredential }
          : { mode: 'oauth' },
        repoPath: repoPath || undefined,
      }

      const session = await api.createSession(request)
      await addSession(session)
      onSuccess(session)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create session')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md">
        <DialogHeader onClose={() => onOpenChange(false)}>New Session</DialogHeader>
        <DialogBody className="space-y-4">
          {/* Agent Type */}
          <Select
            label="Agent Type"
            value={agentType}
            onChange={(v) => setAgentType(v as AgentType)}
            options={[
              {
                value: 'claude_sdk',
                label: 'Claude SDK',
                description: 'Anthropic Claude Agent SDK',
              },
              {
                value: 'pi_sdk',
                label: 'Pi SDK',
                description: 'Pi Coding Agent SDK',
              },
            ]}
          />

          {/* Credentials */}
          <Select
            label="Authentication"
            value={selectedCredential}
            onChange={setSelectedCredential}
            placeholder="Use OAuth (default)"
            options={[
              { value: '', label: 'Use OAuth (default)' },
              ...credentials.map((c) => ({
                value: c.id,
                label: c.label,
                description: c.provider,
              })),
            ]}
          />

          {/* Repository Path */}
          <Input
            label="Repository Path (Optional)"
            value={repoPath}
            onChange={(e) => setRepoPath(e.target.value)}
            placeholder="/path/to/repository"
            hint="Working directory for the session"
          />

          {/* Error */}
          {error && (
            <div className="p-3 bg-hud-error/10 border border-hud-error/30 text-sm text-hud-error">
              {error}
            </div>
          )}
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="primary" onClick={handleCreate} loading={isLoading}>
            Create Session
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
