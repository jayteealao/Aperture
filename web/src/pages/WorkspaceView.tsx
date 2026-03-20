// Workspace detail view at /workspaces/:id.
// Sessions shown are scoped to this workspace (matched by workingDirectory).
// "Add session" only asks for agent type + auth — the repo is the workspace's
// repoRoot, determined by the workspaceId passed to createSession.

import { useState, useEffect } from 'react'
import { useParams } from 'react-router'
import { cn } from '@/utils/cn'
import { api } from '@/api/client'
import { useWorkspaces } from '@/hooks/useWorkspaces'
import { useSessionsStore } from '@/stores/sessions'
import { useAppStore } from '@/stores/app'
import { WorkspaceChatPane } from '@/components/session/WorkspaceChatPane'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { InputField } from '@/components/ui/input-field'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from 'sonner'
import type { AgentType, AuthMode, Session } from '@/api/types'
import { Plus } from 'lucide-react'

// ── AddSessionDialog ───────────────────────────────────────────────────────
// Focused dialog: only agent type + auth. Repo is already known from the
// workspace context — showing a RepoSelector here would be misleading.

function AgentCard({
  label,
  description,
  selected,
  onClick,
}: {
  label: string
  description: string
  selected: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'p-4 rounded-xl border-2 text-left transition-colors w-full',
        selected
          ? 'border-accent bg-accent/10 text-foreground'
          : 'border-border hover:border-accent/40 text-muted-foreground hover:text-foreground',
      )}
    >
      <p className="font-semibold text-sm">{label}</p>
      <p className="text-xs mt-0.5 opacity-70">{description}</p>
    </button>
  )
}

function AddSessionDialog({
  open,
  workspaceId,
  onClose,
  onCreated,
}: {
  open: boolean
  workspaceId: string
  onClose: () => void
  onCreated: (session: Session) => void
}) {
  const { addSession } = useSessionsStore()
  const [agentType, setAgentType] = useState<AgentType>('claude_sdk')
  const [authMode, setAuthMode] = useState<AuthMode>('oauth')
  const [apiKey, setApiKey] = useState('')
  const [isCreating, setIsCreating] = useState(false)

  useEffect(() => {
    if (!open) {
      setAgentType('claude_sdk')
      setAuthMode('oauth')
      setApiKey('')
    }
  }, [open])

  async function handleCreate() {
    setIsCreating(true)
    try {
      const session = await api.createSession({
        agent: agentType,
        auth: {
          mode: authMode,
          apiKeyRef: authMode === 'api_key' ? 'inline' : 'none',
          apiKey: authMode === 'api_key' ? apiKey : undefined,
        },
        workspaceId,
      })
      await addSession({ id: session.id, agent: session.agent, status: session.status, workspaceId })
      toast.success('Session created', { description: `Session ${session.id.slice(0, 8)} ready` })
      onCreated({ id: session.id, agent: session.agent, status: session.status, workspaceId })
    } catch (err) {
      toast.error('Failed to create session', {
        description: err instanceof Error ? err.message : 'Unknown error',
      })
    } finally {
      setIsCreating(false)
    }
  }

  const canCreate = authMode !== 'api_key' || !!apiKey.trim()

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New Session</DialogTitle>
        </DialogHeader>

        <div className="space-y-5 pt-1">
          {/* Agent type */}
          <div className="space-y-1.5">
            <p className="text-sm font-medium text-muted-foreground">Agent</p>
            <div className="grid grid-cols-2 gap-3">
              <AgentCard
                label="Claude SDK"
                description="Claude AI via Anthropic SDK"
                selected={agentType === 'claude_sdk'}
                onClick={() => setAgentType('claude_sdk')}
              />
              <AgentCard
                label="Pi"
                description="Pi agent runtime"
                selected={agentType === 'pi_sdk'}
                onClick={() => setAgentType('pi_sdk')}
              />
            </div>
          </div>

          {/* Auth */}
          <div className="space-y-1.5">
            <p className="text-sm font-medium text-muted-foreground">Authentication</p>
            <Select value={authMode} onValueChange={(v) => setAuthMode(v as AuthMode)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="oauth">OAuth (pre-authenticated)</SelectItem>
                <SelectItem value="api_key">API Key</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {authMode === 'api_key' && (
            <InputField
              label="API Key"
              type="password"
              placeholder="Enter your API key"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              hint="Sent securely to the gateway"
            />
          )}

          <div className="flex justify-end gap-3 pt-2">
            <Button variant="ghost" onClick={onClose} disabled={isCreating}>
              Cancel
            </Button>
            <Button
              variant="default"
              onClick={handleCreate}
              loading={isCreating}
              disabled={!canCreate}
            >
              Create Session
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ── WorkspaceView ──────────────────────────────────────────────────────────

export default function WorkspaceView() {
  const { id } = useParams<{ id: string }>()
  const { workspaces, loading: workspacesLoading } = useWorkspaces()
  const sessions = useSessionsStore((s) => s.sessions)
  const { setActiveWorkspaceId, setWorkspacePanelOpen } = useAppStore()

  const [showAddSession, setShowAddSession] = useState(false)

  // Keep rail + panel in sync when navigating directly to this URL.
  useEffect(() => {
    if (!id) return
    setActiveWorkspaceId(id)
    setWorkspacePanelOpen(true)
  }, [id, setActiveWorkspaceId, setWorkspacePanelOpen])

  const workspace = workspaces.find((w) => w.id === id) ?? null

  // Filter: prefer the frontend-only workspaceId (set at creation, persisted in
  // IndexedDB). Fall back to workingDirectory prefix match for sessions that
  // predate the workspaceId field or were restored from the backend API.
  const workspaceSessions = id
    ? sessions.filter((s) =>
        s.workspaceId === id ||
        (s.status.workingDirectory != null &&
          workspace != null &&
          s.status.workingDirectory.startsWith(workspace.repoRoot)),
      )
    : []

  const handleSessionCreated = () => {
    setShowAddSession(false)
    // The new session appears automatically — addSession updates the store,
    // workspaceSessions re-derives, and the new pane mounts + auto-connects.
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Session grid or empty state */}
      {workspaceSessions.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <button
            onClick={() => setShowAddSession(true)}
            className={cn(
              'flex flex-col items-center justify-center gap-3',
              'w-48 h-48 rounded-2xl',
              'border-2 border-dashed border-border',
              'hover:border-accent/50 hover:bg-accent/5',
              'text-muted-foreground/60 hover:text-accent',
              'transition-colors',
            )}
          >
            <Plus size={28} />
            <span className="text-sm font-medium">New session</span>
          </button>
        </div>
      ) : (
        <div className="flex-1 flex gap-3 p-3 overflow-x-auto min-h-0">
          {workspaceSessions.map((session) => (
            <div
              key={session.id}
              className="min-w-[480px] flex-1 flex flex-col rounded-xl border border-border bg-card overflow-hidden"
            >
              <WorkspaceChatPane sessionId={session.id} />
            </div>
          ))}
          {/* Add-session pane */}
          <button
            onClick={() => setShowAddSession(true)}
            className={cn(
              'min-w-[140px] w-36 shrink-0 flex flex-col items-center justify-center gap-2',
              'rounded-xl border-2 border-dashed border-border',
              'hover:border-accent/50 hover:bg-accent/5',
              'text-muted-foreground/50 hover:text-accent',
              'transition-colors',
            )}
          >
            <Plus size={20} />
            <span className="text-xs font-medium">New session</span>
          </button>
        </div>
      )}

      {/* Add session dialog — scoped to this workspace */}
      {id && (
        <AddSessionDialog
          open={showAddSession}
          workspaceId={id}
          onClose={() => setShowAddSession(false)}
          onCreated={handleSessionCreated}
        />
      )}
    </div>
  )
}
