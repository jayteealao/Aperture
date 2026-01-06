import { useState, useEffect, useCallback } from 'react'
import { api } from '@/api/client'
import { useToast } from '@/components/ui/Toast'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Textarea } from '@/components/ui/Textarea'
import { Dialog } from '@/components/ui/Dialog'
import { Badge } from '@/components/ui/Badge'
import { Spinner } from '@/components/ui/Spinner'
import type { WorkspaceRecord, WorkspaceAgentRecord, WorktreeInfo } from '@/api/types'
import {
  GitBranch,
  Plus,
  Trash2,
  Folder,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  Lock,
  Activity,
} from 'lucide-react'
import { cn } from '@/utils/cn'

interface WorkspaceWithData extends WorkspaceRecord {
  agents: WorkspaceAgentRecord[]
  worktrees: WorktreeInfo[]
}

export default function Workspaces() {
  const toast = useToast()
  const [workspaces, setWorkspaces] = useState<WorkspaceWithData[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [showCreateDialog, setShowCreateDialog] = useState(false)

  const loadWorkspaces = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    else setRefreshing(true)

    try {
      const { workspaces: workspaceList } = await api.listWorkspaces()

      const workspacesWithData = await Promise.all(
        workspaceList.map(async (workspace) => {
          try {
            const [agentsData, worktreesData] = await Promise.all([
              api.listWorkspaceAgents(workspace.id),
              api.listWorkspaceWorktrees(workspace.id),
            ])

            return {
              ...workspace,
              agents: agentsData.agents || [],
              worktrees: worktreesData.worktrees || [],
            }
          } catch (err) {
            console.error(`Failed to load data for workspace ${workspace.id}:`, err)
            return {
              ...workspace,
              agents: [],
              worktrees: [],
            }
          }
        })
      )

      setWorkspaces(workspacesWithData)
    } catch (error) {
      toast.error(
        'Failed to load workspaces',
        error instanceof Error ? error.message : 'Unknown error'
      )
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [toast])

  useEffect(() => {
    loadWorkspaces()

    // Auto-refresh every 5 seconds
    const interval = setInterval(() => {
      loadWorkspaces(true)
    }, 5000)

    return () => clearInterval(interval)
  }, [loadWorkspaces])

  const handleDeleteWorkspace = async (workspace: WorkspaceWithData) => {
    if (
      !confirm(
        `Are you sure you want to delete workspace "${workspace.name}"?\n\nThis will remove all agents and their worktrees.`
      )
    ) {
      return
    }

    try {
      await api.deleteWorkspace(workspace.id)
      toast.success(`Workspace "${workspace.name}" deleted`)
      loadWorkspaces(true)
    } catch (error) {
      toast.error(
        'Failed to delete workspace',
        error instanceof Error ? error.message : 'Unknown error'
      )
    }
  }

  const handleDeleteAgent = async (workspace: WorkspaceWithData, agent: WorkspaceAgentRecord) => {
    if (
      !confirm(
        `Are you sure you want to remove agent on branch "${agent.branch}"?\n\nThis will remove the worktree.`
      )
    ) {
      return
    }

    try {
      await api.deleteWorkspaceAgent(workspace.id, agent.id)
      toast.success('Agent removed')
      loadWorkspaces(true)
    } catch (error) {
      toast.error(
        'Failed to remove agent',
        error instanceof Error ? error.message : 'Unknown error'
      )
    }
  }

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center">
          <Spinner size="lg" />
          <p className="mt-4 text-sm text-[var(--color-text-secondary)]">
            Loading workspaces...
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="px-6 py-4 border-b border-[var(--color-border)]">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-[var(--color-text-primary)] flex items-center gap-2">
              <GitBranch size={24} className="text-accent" />
              Workspaces
            </h1>
            <p className="text-sm text-[var(--color-text-secondary)] mt-1">
              Manage git worktrees and isolated agent environments
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => loadWorkspaces(true)}
              disabled={refreshing}
              leftIcon={<RefreshCw size={16} className={cn(refreshing && 'animate-spin')} />}
            >
              {refreshing ? 'Refreshing...' : 'Refresh'}
            </Button>
            <Button
              variant="primary"
              onClick={() => setShowCreateDialog(true)}
              leftIcon={<Plus size={18} />}
            >
              New Workspace
            </Button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {workspaces.length === 0 ? (
          <Card variant="glass" padding="lg" className="max-w-md mx-auto text-center">
            <div className="py-8">
              <Folder size={48} className="mx-auto text-[var(--color-text-muted)] mb-4" />
              <h3 className="text-lg font-semibold text-[var(--color-text-primary)]">
                No workspaces yet
              </h3>
              <p className="text-[var(--color-text-secondary)] mb-4">
                Create a workspace to enable multi-agent git worktree isolation
              </p>
              <Button
                variant="primary"
                onClick={() => setShowCreateDialog(true)}
                leftIcon={<Plus size={18} />}
              >
                Create Workspace
              </Button>
            </div>
          </Card>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
            {workspaces.map((workspace) => (
              <WorkspaceCard
                key={workspace.id}
                workspace={workspace}
                onDelete={() => handleDeleteWorkspace(workspace)}
                onDeleteAgent={(agent) => handleDeleteAgent(workspace, agent)}
                onRefresh={() => loadWorkspaces(true)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Create Dialog */}
      {showCreateDialog && (
        <CreateWorkspaceDialog
          onClose={() => setShowCreateDialog(false)}
          onSuccess={() => {
            setShowCreateDialog(false)
            loadWorkspaces(true)
          }}
        />
      )}
    </div>
  )
}

function WorkspaceCard({
  workspace,
  onDelete,
  onDeleteAgent,
  onRefresh,
}: {
  workspace: WorkspaceWithData
  onDelete: () => void
  onDeleteAgent: (agent: WorkspaceAgentRecord) => void
  onRefresh: () => void
}) {
  const [showAgents, setShowAgents] = useState(true)
  const [showWorktrees, setShowWorktrees] = useState(true)

  return (
    <Card variant="glass" padding="none" className="overflow-hidden hover:shadow-lg transition-shadow">
      {/* Header */}
      <div className="p-4 border-b border-[var(--color-border)]">
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <h3 className="text-lg font-semibold text-[var(--color-text-primary)] truncate">
              {workspace.name}
            </h3>
            <p className="text-xs font-mono text-[var(--color-text-muted)] mt-1">
              {workspace.id}
            </p>
          </div>
          <div className="flex items-center gap-1 ml-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={onRefresh}
              className="p-1.5"
              title="Refresh"
            >
              <RefreshCw size={14} />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={onDelete}
              className="p-1.5 text-danger hover:text-danger"
              title="Delete workspace"
            >
              <Trash2 size={14} />
            </Button>
          </div>
        </div>
      </div>

      {/* Info */}
      <div className="p-4 space-y-2 text-sm">
        <div className="flex items-start gap-2">
          <span className="text-[var(--color-text-muted)] min-w-[80px]">Repository:</span>
          <span className="text-[var(--color-text-secondary)] font-mono text-xs flex-1 break-all">
            {workspace.repoRoot}
          </span>
        </div>
        {workspace.description && (
          <div className="flex items-start gap-2">
            <span className="text-[var(--color-text-muted)] min-w-[80px]">Description:</span>
            <span className="text-[var(--color-text-secondary)] flex-1">
              {workspace.description}
            </span>
          </div>
        )}
        <div className="flex items-start gap-2">
          <span className="text-[var(--color-text-muted)] min-w-[80px]">Created:</span>
          <span className="text-[var(--color-text-secondary)] text-xs">
            {new Date(workspace.createdAt).toLocaleString()}
          </span>
        </div>
      </div>

      {/* Agents Section */}
      <div className="border-t border-[var(--color-border)]">
        <button
          onClick={() => setShowAgents(!showAgents)}
          className="w-full px-4 py-3 flex items-center justify-between hover:bg-[var(--color-surface)] transition-colors"
        >
          <div className="flex items-center gap-2">
            <Activity size={16} className="text-[var(--color-text-muted)]" />
            <span className="text-sm font-medium text-[var(--color-text-primary)]">
              Active Agents
            </span>
          </div>
          <Badge variant={workspace.agents.length > 0 ? 'success' : 'secondary'} size="sm">
            {workspace.agents.length}
          </Badge>
        </button>
        {showAgents && (
          <div className="px-4 pb-3">
            {workspace.agents.length > 0 ? (
              <div className="space-y-2">
                {workspace.agents.map((agent) => (
                  <div
                    key={agent.id}
                    className="flex items-center justify-between p-2 rounded-lg bg-[var(--color-bg-tertiary)]"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-success shrink-0" />
                        <span className="text-sm font-medium text-[var(--color-text-primary)] font-mono truncate">
                          {agent.branch}
                        </span>
                      </div>
                      <p className="text-xs text-[var(--color-text-muted)] font-mono mt-1 truncate">
                        {agent.worktreePath}
                      </p>
                      {agent.sessionId && (
                        <p className="text-2xs text-[var(--color-text-muted)] mt-1">
                          Session: {agent.sessionId.slice(0, 12)}...
                        </p>
                      )}
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onDeleteAgent(agent)}
                      className="ml-2 p-1.5 text-danger hover:text-danger shrink-0"
                    >
                      <Trash2 size={12} />
                    </Button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-[var(--color-text-muted)] text-center py-3">
                No active agents
              </p>
            )}
          </div>
        )}
      </div>

      {/* Worktrees Section */}
      <div className="border-t border-[var(--color-border)]">
        <button
          onClick={() => setShowWorktrees(!showWorktrees)}
          className="w-full px-4 py-3 flex items-center justify-between hover:bg-[var(--color-surface)] transition-colors"
        >
          <div className="flex items-center gap-2">
            <GitBranch size={16} className="text-[var(--color-text-muted)]" />
            <span className="text-sm font-medium text-[var(--color-text-primary)]">
              Git Worktrees
            </span>
          </div>
          <Badge variant="secondary" size="sm">
            {workspace.worktrees.length}
          </Badge>
        </button>
        {showWorktrees && (
          <div className="px-4 pb-3">
            {workspace.worktrees.length > 0 ? (
              <div className="space-y-2">
                {workspace.worktrees.map((worktree, idx) => (
                  <div
                    key={idx}
                    className="flex items-center gap-2 p-2 rounded-lg bg-[var(--color-bg-tertiary)]"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span
                          className={cn(
                            'w-2 h-2 rounded-full shrink-0',
                            worktree.isMain
                              ? 'bg-accent'
                              : worktree.isLocked
                                ? 'bg-warning'
                                : 'bg-success'
                          )}
                        />
                        <span className="text-sm font-medium text-[var(--color-text-primary)] font-mono truncate">
                          {worktree.branch}
                        </span>
                        {worktree.isMain && (
                          <Badge variant="accent" size="sm">
                            MAIN
                          </Badge>
                        )}
                        {worktree.isLocked && (
                          <Badge variant="warning" size="sm" className="flex items-center gap-1">
                            <Lock size={10} />
                            LOCKED
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-[var(--color-text-muted)] font-mono mt-1 truncate">
                        {worktree.path}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-[var(--color-text-muted)] text-center py-3">
                No worktrees
              </p>
            )}
          </div>
        )}
      </div>
    </Card>
  )
}

function CreateWorkspaceDialog({
  onClose,
  onSuccess,
}: {
  onClose: () => void
  onSuccess: () => void
}) {
  const toast = useToast()
  const [name, setName] = useState('')
  const [repoRoot, setRepoRoot] = useState('')
  const [description, setDescription] = useState('')
  const [creating, setCreating] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!name.trim() || !repoRoot.trim()) {
      toast.error('Validation error', 'Name and repository path are required')
      return
    }

    setCreating(true)

    try {
      await api.createWorkspace({
        name: name.trim(),
        repoRoot: repoRoot.trim(),
        description: description.trim() || undefined,
      })

      toast.success('Workspace created successfully!')
      onSuccess()
    } catch (error) {
      toast.error(
        'Failed to create workspace',
        error instanceof Error ? error.message : 'Unknown error'
      )
    } finally {
      setCreating(false)
    }
  }

  return (
    <Dialog onClose={onClose} title="Create Workspace" size="md">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-2">
              Workspace Name *
            </label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="my-project"
              required
              autoFocus
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-2">
              Repository Root Path *
            </label>
            <Input
              value={repoRoot}
              onChange={(e) => setRepoRoot(e.target.value)}
              placeholder="/path/to/repo"
              required
            />
            <p className="text-xs text-[var(--color-text-muted)] mt-1">
              Absolute path to a valid git repository
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-2">
              Description <span className="text-[var(--color-text-muted)]">(optional)</span>
            </label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Workspace for AI agent development"
              rows={3}
            />
          </div>

          <div className="flex items-start gap-2 p-3 rounded-lg bg-accent/10 border border-accent/20">
            <AlertCircle size={16} className="text-accent shrink-0 mt-0.5" />
            <div className="text-xs text-[var(--color-text-secondary)]">
              <p className="font-medium mb-1">About Workspaces</p>
              <p>
                Workspaces enable parallel agent sessions using git worktrees. Each session gets
                an isolated working directory, allowing multiple agents to work on different
                branches simultaneously.
              </p>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-4 border-t border-[var(--color-border)]">
          <Button variant="ghost" onClick={onClose} disabled={creating}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" loading={creating} disabled={creating}>
            {creating ? 'Creating...' : 'Create Workspace'}
          </Button>
        </div>
      </form>
    </Dialog>
  )
}
