import { useState, useEffect } from 'react'
import { useNavigate, useLocation, useSearchParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/api/client'
import { useSessionsStore } from '@/stores/sessions'
import { useToast } from '@/components/ui/Toast'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Dropdown } from '@/components/ui/Dropdown'
import { Card, CardHeader, CardContent, CardFooter } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Dialog, ConfirmDialog } from '@/components/ui/Dialog'
import { SkeletonCard } from '@/components/ui/Skeleton'
import { Spinner } from '@/components/ui/Spinner'
import { RepoSelector, type RepoSelection } from '@/components/session/RepoSelector'
import type { AgentType, AuthMode, Session } from '@/api/types'
import {
  Plus,
  Search,
  Trash2,
  Play,
  Clock,
  Cpu,
  RefreshCw,
  AlertCircle,
} from 'lucide-react'

export default function Sessions() {
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const queryClient = useQueryClient()
  const toast = useToast()

  const {
    sessions,
    addSession,
    removeSession,
    setActiveSession,
    connectSession,
  } = useSessionsStore()

  const [search, setSearch] = useState('')
  const [showNewSession, setShowNewSession] = useState(location.pathname.includes('/new'))
  const [deleteSessionId, setDeleteSessionId] = useState<string | null>(null)
  const [preselectedWorkspaceId, setPreselectedWorkspaceId] = useState<string | null>(null)

  // Sync with location and query params
  useEffect(() => {
    const isNewPath = location.pathname.includes('/new')
    setShowNewSession(isNewPath)

    // Check for preselected workspace from query param
    const workspaceId = searchParams.get('workspaceId')
    if (isNewPath && workspaceId) {
      setPreselectedWorkspaceId(workspaceId)
    } else {
      setPreselectedWorkspaceId(null)
    }
  }, [location.pathname, searchParams])

  // Fetch sessions from server
  const { isLoading, refetch } = useQuery({
    queryKey: ['sessions'],
    queryFn: async () => {
      const response = await api.listSessions()
      // Merge with local sessions
      for (const status of response.sessions) {
        const existing = sessions.find((s) => s.id === status.id)
        if (!existing) {
          await addSession({
            id: status.id,
            agent: status.agent,
            status,
          })
        }
      }
      return response
    },
    refetchInterval: 10000,
  })

  // Delete session mutation
  const deleteMutation = useMutation({
    mutationFn: async (sessionId: string) => {
      await api.deleteSession(sessionId)
      await removeSession(sessionId)
    },
    onSuccess: () => {
      toast.success('Session deleted')
      queryClient.invalidateQueries({ queryKey: ['sessions'] })
    },
    onError: (error) => {
      toast.error('Failed to delete session', error.message)
    },
  })

  // Filter sessions
  const filteredSessions = sessions.filter((s) => {
    if (!search) return true
    const query = search.toLowerCase()
    return (
      s.id.toLowerCase().includes(query) ||
      s.agent.toLowerCase().includes(query)
    )
  })

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold text-[var(--color-text-primary)]">Sessions</h2>
            <p className="text-[var(--color-text-secondary)]">
              Manage your agent sessions
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => refetch()}>
              <RefreshCw size={16} />
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                navigate('/sessions/new')
                setShowNewSession(true)
              }}
              leftIcon={<Plus size={18} />}
            >
              New Session
            </Button>
          </div>
        </div>

        {/* Search */}
        <div className="mb-6">
          <Input
            placeholder="Search sessions..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            leftIcon={<Search size={18} />}
          />
        </div>

        {/* Sessions Grid */}
        {isLoading ? (
          <div className="grid gap-4 md:grid-cols-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
        ) : filteredSessions.length === 0 ? (
          <Card variant="glass" padding="lg" className="text-center">
            <div className="py-8">
              <Cpu size={48} className="mx-auto text-[var(--color-text-muted)] mb-4" />
              <h3 className="text-lg font-semibold text-[var(--color-text-primary)]">
                No sessions yet
              </h3>
              <p className="text-[var(--color-text-secondary)] mb-4">
                Create your first session to start chatting with an AI agent
              </p>
              <Button
                variant="primary"
                onClick={() => setShowNewSession(true)}
                leftIcon={<Plus size={18} />}
              >
                Create Session
              </Button>
            </div>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {filteredSessions.map((session) => (
              <SessionCard
                key={session.id}
                session={session}
                onOpen={() => {
                  setActiveSession(session.id)
                  connectSession(session.id)
                  navigate('/workspace')
                }}
                onDelete={() => setDeleteSessionId(session.id)}
              />
            ))}
          </div>
        )}

        {/* New Session Dialog */}
        <NewSessionDialog
          open={showNewSession}
          onClose={() => {
            setShowNewSession(false)
            setPreselectedWorkspaceId(null)
            navigate('/sessions')
          }}
          onCreated={(session, shouldPromptSave, repoPath) => {
            setShowNewSession(false)
            setPreselectedWorkspaceId(null)
            navigate('/sessions')
            setActiveSession(session.id)
            connectSession(session.id)
            // If we should prompt to save, store in session storage for later
            if (shouldPromptSave && repoPath) {
              sessionStorage.setItem('pendingSaveRepo', JSON.stringify({ repoPath }))
            }
            navigate('/workspace')
          }}
          preselectedWorkspaceId={preselectedWorkspaceId}
        />

        {/* Delete Confirmation */}
        <ConfirmDialog
          open={!!deleteSessionId}
          onClose={() => setDeleteSessionId(null)}
          onConfirm={() => {
            if (deleteSessionId) {
              deleteMutation.mutate(deleteSessionId)
              setDeleteSessionId(null)
            }
          }}
          title="Delete Session"
          description="Are you sure you want to delete this session? This action cannot be undone."
          confirmText="Delete"
          variant="danger"
          loading={deleteMutation.isPending}
        />
      </div>
    </div>
  )
}

function SessionCard({
  session,
  onOpen,
  onDelete,
}: {
  session: Session
  onOpen: () => void
  onDelete: () => void
}) {
  const connections = useSessionsStore((s) => s.connections)
  const conn = connections[session.id]
  const isRunning = session.status?.running

  return (
    <Card variant="glass" hover onClick={onOpen}>
      <CardHeader
        title={
          <span className="font-mono text-sm">{session.id.slice(0, 12)}...</span>
        }
        subtitle={session.agent}
        action={
          <Badge variant={isRunning ? 'success' : 'default'}>
            {isRunning ? 'Running' : 'Stopped'}
          </Badge>
        }
      />
      <CardContent>
        <div className="flex items-center gap-4 text-sm text-[var(--color-text-secondary)]">
          <div className="flex items-center gap-1">
            <Clock size={14} />
            <span>{formatIdleTime(session.status?.idleMs || 0)}</span>
          </div>
          {conn?.status && (
            <Badge
              variant={
                conn.status === 'connected'
                  ? 'success'
                  : conn.status === 'error'
                  ? 'danger'
                  : 'default'
              }
              size="sm"
            >
              {conn.status}
            </Badge>
          )}
        </div>
      </CardContent>
      <CardFooter>
        <Button variant="ghost" size="sm" onClick={onOpen} leftIcon={<Play size={14} />}>
          Open
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={(e) => {
            e.stopPropagation()
            onDelete()
          }}
          className="text-danger hover:text-danger"
        >
          <Trash2 size={14} />
        </Button>
      </CardFooter>
    </Card>
  )
}

function NewSessionDialog({
  open,
  onClose,
  onCreated,
  preselectedWorkspaceId,
}: {
  open: boolean
  onClose: () => void
  onCreated: (session: Session, shouldPromptSave?: boolean, repoPath?: string) => void
  preselectedWorkspaceId?: string | null
}) {
  const toast = useToast()
  const queryClient = useQueryClient()
  const { addSession } = useSessionsStore()

  const [agentType, setAgentType] = useState<AgentType>('claude_sdk')
  const [authMode, setAuthMode] = useState<AuthMode>('oauth')
  const [apiKey, setApiKey] = useState('')
  const [repoSelection, setRepoSelection] = useState<RepoSelection | null>(null)
  const [isCreating, setIsCreating] = useState(false)
  const [creationStep, setCreationStep] = useState<string | null>(null)

  // Fetch workspace for preselected ID
  const { data: preselectedWorkspace } = useQuery({
    queryKey: ['workspace', preselectedWorkspaceId],
    queryFn: () => preselectedWorkspaceId ? api.getWorkspace(preselectedWorkspaceId) : null,
    enabled: !!preselectedWorkspaceId,
  })

  // Set preselected workspace when loaded
  useEffect(() => {
    if (preselectedWorkspace) {
      setRepoSelection({
        mode: 'workspace',
        workspaceId: preselectedWorkspace.id,
        workspace: preselectedWorkspace,
        repoPath: preselectedWorkspace.repoRoot,
      })
    }
  }, [preselectedWorkspace])

  // Reset state when dialog closes
  useEffect(() => {
    if (!open) {
      setAgentType('claude_sdk')
      setRepoSelection(null)
      setCreationStep(null)
      setApiKey('')
    }
  }, [open])

  const agentOptions = [
    { value: 'claude_sdk', label: 'Claude' },
    { value: 'pi_sdk', label: 'Pi' },
  ]

  const authOptions = [
    { value: 'oauth', label: 'OAuth (Pre-authenticated)' },
    { value: 'api_key', label: 'API Key' },
  ]

  async function handleCreate() {
    if (!repoSelection) {
      toast.error('Repository required', 'Please select a repository for this session')
      return
    }

    setIsCreating(true)
    let repoPath: string | undefined
    let workspaceId: string | undefined
    let shouldPromptSave = false

    try {
      // Handle different repo selection modes
      if (repoSelection.mode === 'workspace') {
        workspaceId = repoSelection.workspaceId
        repoPath = repoSelection.repoPath
      } else if (repoSelection.mode === 'browse' || repoSelection.mode === 'direct') {
        repoPath = repoSelection.repoPath
        shouldPromptSave = true // Prompt to save browsed repo
      } else if (repoSelection.mode === 'clone') {
        // Clone the repository first
        setCreationStep('Cloning repository...')
        const cloneResult = await api.cloneWorkspace({
          remoteUrl: repoSelection.cloneUrl!,
          targetDirectory: repoSelection.cloneTarget!,
        })
        workspaceId = cloneResult.workspace.id
        repoPath = cloneResult.workspace.repoRoot
        // Invalidate workspaces query to refresh the list
        queryClient.invalidateQueries({ queryKey: ['workspaces'] })
      } else if (repoSelection.mode === 'init') {
        // Initialize new repository
        setCreationStep('Initializing repository...')
        const initResult = await api.initRepo({
          path: repoSelection.initPath!,
          name: repoSelection.initName,
          createWorkspace: false, // Don't auto-create, let user decide
        })
        repoPath = initResult.path
        shouldPromptSave = true // Prompt to save initialized repo
      }

      // Create the session
      setCreationStep('Creating session...')
      const session = await api.createSession({
        agent: agentType,
        auth: {
          mode: authMode,
          apiKeyRef: authMode === 'api_key' ? 'inline' : 'none',
          apiKey: authMode === 'api_key' ? apiKey : undefined,
        },
        workspaceId,
        repoPath: workspaceId ? undefined : repoPath, // Only pass repoPath if no workspaceId
      })

      await addSession({
        id: session.id,
        agent: session.agent,
        status: session.status,
      })

      toast.success('Session created', `Session ${session.id.slice(0, 8)} is ready`)
      onCreated({ id: session.id, agent: session.agent, status: session.status }, shouldPromptSave, repoPath)
    } catch (error) {
      toast.error('Failed to create session', error instanceof Error ? error.message : 'Unknown error')
    } finally {
      setIsCreating(false)
      setCreationStep(null)
    }
  }

  const canCreate = repoSelection && (authMode !== 'api_key' || apiKey)

  return (
    <Dialog open={open} onClose={onClose} title="Create New Session" size="lg">
      <div className="space-y-4">
        {/* Agent Type */}
        <Dropdown
          label="Agent"
          options={agentOptions}
          value={agentType}
          onChange={(value) => setAgentType(value as AgentType)}
        />

        {/* Repository Selection */}
        <RepoSelector
          label="Repository"
          value={repoSelection}
          onChange={setRepoSelection}
          error={!repoSelection ? undefined : undefined}
        />

        {/* Info box about repo requirement */}
        {!repoSelection && (
          <div className="flex items-start gap-2 p-3 rounded-lg bg-accent/10 border border-accent/20">
            <AlertCircle size={16} className="text-accent shrink-0 mt-0.5" />
            <div className="text-xs text-[var(--color-text-secondary)]">
              <p>
                Sessions require a git repository. Select from your saved repos, browse for a local repo,
                clone from a URL, or initialize a new one.
              </p>
            </div>
          </div>
        )}

        <Dropdown
          label="Authentication"
          options={authOptions}
          value={authMode}
          onChange={(value) => setAuthMode(value as AuthMode)}
        />

        {authMode === 'api_key' && (
          <Input
            label="API Key"
            type="password"
            placeholder="Enter your API key"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            hint="Your key is sent securely to the gateway"
          />
        )}

        {/* Creation progress */}
        {creationStep && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-[var(--color-bg-tertiary)]">
            <Spinner size="sm" />
            <span className="text-sm text-[var(--color-text-secondary)]">{creationStep}</span>
          </div>
        )}

        <div className="flex justify-end gap-3 pt-4">
          <Button variant="ghost" onClick={onClose} disabled={isCreating}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={handleCreate}
            loading={isCreating}
            disabled={!canCreate}
          >
            Create Session
          </Button>
        </div>
      </div>
    </Dialog>
  )
}

function formatIdleTime(ms: number): string {
  const seconds = Math.floor(ms / 1000)
  if (seconds < 60) return `${seconds}s idle`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m idle`
  const hours = Math.floor(minutes / 60)
  return `${hours}h idle`
}
