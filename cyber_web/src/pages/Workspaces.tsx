import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '@/api/client'
import {
  useToast,
  Button,
  Card,
  Input,
  Textarea,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogBody,
  DialogFooter,
  Badge,
  Spinner,
  GridContainer,
  HUDTitle,
  HUDLabel,
} from '@/components/ui'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import type { WorkspaceRecord, WorkspaceAgentRecord, WorktreeInfo, DiscoveredRepo } from '@/api/types'
import {
  GitBranch,
  Plus,
  Trash2,
  Folder,
  RefreshCw,
  AlertCircle,
  Lock,
  Activity,
  FolderSearch,
  Download,
  ExternalLink,
  Play,
} from 'lucide-react'
import { cn } from '@/utils/cn'

interface WorkspaceWithData extends WorkspaceRecord {
  agents: WorkspaceAgentRecord[]
  worktrees: WorktreeInfo[]
}

export function WorkspacesPage() {
  const navigate = useNavigate()
  const { addToast } = useToast()
  const toastRef = useRef(addToast)
  toastRef.current = addToast
  const [workspaces, setWorkspaces] = useState<WorkspaceWithData[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [confirmDialog, setConfirmDialog] = useState<{
    title: string; message: string; confirmLabel: string; onConfirm: () => void
  } | null>(null)

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
      console.error('Failed to load workspaces:', error)
      toastRef.current({
        title: 'Failed to load workspaces',
        message: 'Please check your connection and try again.',
        variant: 'error',
      })
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    loadWorkspaces()

    // Auto-refresh every 5 seconds
    const interval = setInterval(() => {
      loadWorkspaces(true)
    }, 5000)

    return () => clearInterval(interval)
  }, [loadWorkspaces])

  const handleDeleteWorkspace = (workspace: WorkspaceWithData) => {
    setConfirmDialog({
      title: 'Delete Workspace',
      message: `Are you sure you want to delete workspace "${workspace.name}"? This will remove all agents and their worktrees.`,
      confirmLabel: 'Delete',
      onConfirm: async () => {
        try {
          await api.deleteWorkspace(workspace.id)
          addToast({ title: 'Success', message: `Workspace "${workspace.name}" deleted`, variant: 'success' })
          loadWorkspaces(true)
        } catch (error) {
          console.error('Failed to delete workspace:', error)
          addToast({
            title: 'Failed to delete workspace',
            message: 'Please check your connection and try again.',
            variant: 'error',
          })
        }
      },
    })
  }

  const handleDeleteAgent = (workspace: WorkspaceWithData, agent: WorkspaceAgentRecord) => {
    setConfirmDialog({
      title: 'Remove Agent',
      message: `Are you sure you want to remove the agent on branch "${agent.branch}"? This will remove the worktree.`,
      confirmLabel: 'Remove',
      onConfirm: async () => {
        try {
          await api.deleteWorkspaceAgent(workspace.id, agent.id)
          addToast({ message: 'Agent removed', variant: 'success' })
          loadWorkspaces(true)
        } catch (error) {
          console.error('Failed to remove agent:', error)
          addToast({
            title: 'Failed to remove agent',
            message: 'Please check your connection and try again.',
            variant: 'error',
          })
        }
      },
    })
  }

  if (loading) {
    return (
      <GridContainer className="h-full flex items-center justify-center" showGrid>
        <div className="text-center">
          <Spinner size="lg" />
          <p className="mt-4 text-sm text-hud-text/50">
            Loading workspaces...
          </p>
        </div>
      </GridContainer>
    )
  }

  return (
    <GridContainer className="h-full flex flex-col" showGrid>
      {/* Header */}
      <div className="px-6 py-4 border-b border-hud-gray/30">
        <div className="flex items-center justify-between">
          <div>
            <HUDTitle className="text-2xl flex items-center gap-2">
              <GitBranch size={24} className="text-hud-accent" />
              Workspaces
            </HUDTitle>
            <HUDLabel className="mt-1">
              Manage git worktrees and isolated agent environments
            </HUDLabel>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={() => loadWorkspaces(true)}
              disabled={refreshing}
              icon={<RefreshCw size={16} className={cn(refreshing && 'animate-spin')} />}
            >
              {refreshing ? 'Refreshing...' : 'Refresh'}
            </Button>
            <Button
              variant="primary"
              onClick={() => setShowCreateDialog(true)}
              icon={<Plus size={18} />}
            >
              New Workspace
            </Button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {workspaces.length === 0 ? (
          <Card variant="bordered" corners className="max-w-md mx-auto text-center p-8">
            <Folder size={48} className="mx-auto text-hud-text/30 mb-4" />
            <HUDTitle className="text-lg">No workspaces yet — create one to get started</HUDTitle>
            <p className="text-hud-text/50 mb-4">
              Create a workspace to enable multi-agent git worktree isolation
            </p>
            <Button
              variant="primary"
              onClick={() => setShowCreateDialog(true)}
              icon={<Plus size={18} />}
            >
              Create Workspace
            </Button>
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
                onNewSession={() => navigate(`/sessions/new?workspaceId=${workspace.id}`)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Create Dialog */}
      <CreateWorkspaceDialog
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
        onSuccess={() => {
          setShowCreateDialog(false)
          loadWorkspaces(true)
        }}
      />

      {/* Confirm Dialog */}
      {confirmDialog && (
        <ConfirmDialog
          open={!!confirmDialog}
          onOpenChange={(open) => { if (!open) setConfirmDialog(null) }}
          title={confirmDialog.title}
          message={confirmDialog.message}
          confirmLabel={confirmDialog.confirmLabel}
          variant="danger"
          onConfirm={confirmDialog.onConfirm}
        />
      )}
    </GridContainer>
  )
}

function WorkspaceCard({
  workspace,
  onDelete,
  onDeleteAgent,
  onRefresh,
  onNewSession,
}: {
  workspace: WorkspaceWithData
  onDelete: () => void
  onDeleteAgent: (agent: WorkspaceAgentRecord) => void
  onRefresh: () => void
  onNewSession: () => void
}) {
  const [showAgents, setShowAgents] = useState(true)
  const [showWorktrees, setShowWorktrees] = useState(true)

  return (
    <Card variant="bordered" corners className="overflow-hidden hover:border-hud-accent/50 transition-colors">
      {/* Header */}
      <div className="p-4 border-b border-hud-gray/30">
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <h3 className="text-lg font-semibold text-hud-text truncate">
              {workspace.name}
            </h3>
            <p className="text-xs font-mono text-hud-text/30 mt-1">
              {workspace.id}
            </p>
          </div>
          <div className="flex items-center gap-1 ml-2">
            <Button
              variant="primary"
              onClick={onNewSession}
              className="p-1.5"
              title="New Session"
            >
              <Play size={14} />
            </Button>
            <Button
              variant="outline"
              onClick={onRefresh}
              className="p-1.5"
              title="Refresh"
            >
              <RefreshCw size={14} />
            </Button>
            <Button
              variant="outline"
              onClick={onDelete}
              className="p-1.5 text-hud-error border-hud-error hover:bg-hud-error/10"
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
          <span className="text-hud-text/50 min-w-[80px]">Repository:</span>
          <span className="text-hud-text/70 font-mono text-xs flex-1 break-all">
            {workspace.repoRoot}
          </span>
        </div>
        {workspace.description && (
          <div className="flex items-start gap-2">
            <span className="text-hud-text/50 min-w-[80px]">Description:</span>
            <span className="text-hud-text/70 flex-1">
              {workspace.description}
            </span>
          </div>
        )}
        <div className="flex items-start gap-2">
          <span className="text-hud-text/50 min-w-[80px]">Created:</span>
          <span className="text-hud-text/70 text-xs">
            {new Date(workspace.createdAt).toLocaleString()}
          </span>
        </div>
      </div>

      {/* Agents Section */}
      <div className="border-t border-hud-gray/30">
        <button
          onClick={() => setShowAgents(!showAgents)}
          className="w-full px-4 py-3 flex items-center justify-between hover:bg-hud-gray/10 transition-colors"
        >
          <div className="flex items-center gap-2">
            <Activity size={16} className="text-hud-text/50" />
            <span className="text-sm font-medium text-hud-text">
              Active Agents
            </span>
          </div>
          <Badge variant={workspace.agents.length > 0 ? 'success' : 'default'}>
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
                    className="flex items-center justify-between p-2 bg-hud-gray/20 border border-hud-gray/30"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-hud-success shrink-0" />
                        <span className="text-sm font-medium text-hud-text font-mono truncate">
                          {agent.branch}
                        </span>
                      </div>
                      <p className="text-xs text-hud-text/50 font-mono mt-1 truncate">
                        {agent.worktreePath}
                      </p>
                      {agent.sessionId && (
                        <p className="text-2xs text-hud-text/30 mt-1">
                          Session: {agent.sessionId.slice(0, 12)}...
                        </p>
                      )}
                    </div>
                    <Button
                      variant="outline"
                      onClick={() => onDeleteAgent(agent)}
                      className="ml-2 p-1.5 text-hud-error border-hud-error shrink-0"
                    >
                      <Trash2 size={12} />
                    </Button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-hud-text/30 text-center py-3">
                No active agents
              </p>
            )}
          </div>
        )}
      </div>

      {/* Worktrees Section */}
      <div className="border-t border-hud-gray/30">
        <button
          onClick={() => setShowWorktrees(!showWorktrees)}
          className="w-full px-4 py-3 flex items-center justify-between hover:bg-hud-gray/10 transition-colors"
        >
          <div className="flex items-center gap-2">
            <GitBranch size={16} className="text-hud-text/50" />
            <span className="text-sm font-medium text-hud-text">
              Git Worktrees
            </span>
          </div>
          <Badge variant="default">
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
                    className="flex items-center gap-2 p-2 bg-hud-gray/20 border border-hud-gray/30"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span
                          className={cn(
                            'w-2 h-2 rounded-full shrink-0',
                            worktree.isMain
                              ? 'bg-hud-accent'
                              : worktree.isLocked
                                ? 'bg-yellow-400'
                                : 'bg-hud-success'
                          )}
                        />
                        <span className="text-sm font-medium text-hud-text font-mono truncate">
                          {worktree.branch}
                        </span>
                        {worktree.isMain && (
                          <Badge variant="accent">MAIN</Badge>
                        )}
                        {worktree.isLocked && (
                          <Badge variant="warning" className="flex items-center gap-1">
                            <Lock size={10} />
                            LOCKED
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-hud-text/50 font-mono mt-1 truncate">
                        {worktree.path}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-hud-text/30 text-center py-3">
                No worktrees
              </p>
            )}
          </div>
        )}
      </div>
    </Card>
  )
}

type CreateMode = 'manual' | 'browse' | 'clone'

function CreateWorkspaceDialog({
  open,
  onOpenChange,
  onSuccess,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
}) {
  const { addToast } = useToast()
  const [mode, setMode] = useState<CreateMode>('manual')
  const [name, setName] = useState('')
  const [repoRoot, setRepoRoot] = useState('')
  const [description, setDescription] = useState('')
  const [creating, setCreating] = useState(false)

  // Browse mode state
  const [scanPath, setScanPath] = useState('')
  const [discoveredRepos, setDiscoveredRepos] = useState<DiscoveredRepo[]>([])
  const [isScanning, setIsScanning] = useState(false)
  const [selectedRepo, setSelectedRepo] = useState<DiscoveredRepo | null>(null)

  // Clone mode state
  const [cloneUrl, setCloneUrl] = useState('')
  const [targetDirectory, setTargetDirectory] = useState('')

  const resetState = () => {
    setName('')
    setRepoRoot('')
    setDescription('')
    setScanPath('')
    setDiscoveredRepos([])
    setSelectedRepo(null)
    setCloneUrl('')
    setTargetDirectory('')
  }

  const handleClose = () => {
    onOpenChange(false)
  }

  const handleScan = async () => {
    if (!scanPath.trim()) {
      addToast({ title: 'Validation error', message: 'Please enter a directory path to scan', variant: 'error' })
      return
    }

    setIsScanning(true)
    try {
      const result = await api.discoverRepos(scanPath.trim())
      setDiscoveredRepos(result.repos)
      if (result.repos.length === 0) {
        addToast({ title: 'No repositories found', message: `Scanned ${result.scannedDirectories} directories`, variant: 'info' })
      }
    } catch (error) {
      console.error('Scan failed:', error)
      addToast({
        title: 'Scan failed',
        message: 'Could not scan the directory. Please verify the path exists and try again.',
        variant: 'error',
      })
    } finally {
      setIsScanning(false)
    }
  }

  const handleSelectRepo = (repo: DiscoveredRepo) => {
    setSelectedRepo(repo)
    setRepoRoot(repo.path)
    setName(repo.name)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setCreating(true)

    try {
      if (mode === 'clone') {
        if (!cloneUrl.trim() || !targetDirectory.trim()) {
          addToast({ title: 'Validation error', message: 'Clone URL and target directory are required', variant: 'error' })
          setCreating(false)
          return
        }

        await api.cloneWorkspace({
          remoteUrl: cloneUrl.trim(),
          targetDirectory: targetDirectory.trim(),
          name: name.trim() || undefined,
        })

        addToast({ message: 'Repository cloned and workspace created!', variant: 'success' })
      } else {
        if (!name.trim() || !repoRoot.trim()) {
          addToast({ title: 'Validation error', message: 'Name and repository path are required', variant: 'error' })
          setCreating(false)
          return
        }

        await api.createWorkspace({
          name: name.trim(),
          repoRoot: repoRoot.trim(),
          description: description.trim() || undefined,
        })

        addToast({ message: 'Workspace created successfully!', variant: 'success' })
      }

      resetState()
      onSuccess()
    } catch (error) {
      console.error('Failed to create workspace:', error)
      addToast({
        title: 'Failed to create workspace',
        message: 'Please verify the repository path and try again.',
        variant: 'error',
      })
    } finally {
      setCreating(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <DialogHeader onClose={handleClose}>Create Workspace</DialogHeader>
        <DialogBody>
          <div className="space-y-4">
            {/* Mode selector */}
            <div className="flex gap-2 p-1 bg-hud-gray/20 border border-hud-gray/30">
              <button
                type="button"
                onClick={() => setMode('manual')}
                className={cn(
                  'flex-1 flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium transition-colors',
                  mode === 'manual'
                    ? 'bg-hud-accent text-hud-black'
                    : 'text-hud-text/70 hover:text-hud-text'
                )}
              >
                <Folder size={16} />
                Manual Path
              </button>
              <button
                type="button"
                onClick={() => setMode('browse')}
                className={cn(
                  'flex-1 flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium transition-colors',
                  mode === 'browse'
                    ? 'bg-hud-accent text-hud-black'
                    : 'text-hud-text/70 hover:text-hud-text'
                )}
              >
                <FolderSearch size={16} />
                Browse Local
              </button>
              <button
                type="button"
                onClick={() => setMode('clone')}
                className={cn(
                  'flex-1 flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium transition-colors',
                  mode === 'clone'
                    ? 'bg-hud-accent text-hud-black'
                    : 'text-hud-text/70 hover:text-hud-text'
                )}
              >
                <Download size={16} />
                Clone URL
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {mode === 'manual' && (
                <>
                  <Input
                    label="Workspace Name *"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="my-project"
                    required
                    autoFocus
                  />
                  <Input
                    label="Repository Root Path *"
                    value={repoRoot}
                    onChange={(e) => setRepoRoot(e.target.value)}
                    placeholder="/path/to/repo"
                    required
                    hint="Absolute path to a valid git repository"
                  />
                  <Textarea
                    label="Description (optional)"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Workspace for AI agent development"
                    rows={3}
                  />
                </>
              )}

              {mode === 'browse' && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-hud-text mb-2">
                      Directory to Scan
                    </label>
                    <div className="flex gap-2">
                      <Input
                        value={scanPath}
                        onChange={(e) => setScanPath(e.target.value)}
                        placeholder="C:/Users/you/dev"
                        className="flex-1"
                      />
                      <Button
                        type="button"
                        onClick={handleScan}
                        disabled={isScanning}
                        variant="outline"
                      >
                        {isScanning ? <Spinner size="sm" /> : 'Scan'}
                      </Button>
                    </div>
                    <p className="text-xs text-hud-text/50 mt-1">
                      Scans up to 3 levels deep for git repositories
                    </p>
                  </div>

                  {discoveredRepos.length > 0 && (
                    <div>
                      <label className="block text-sm font-medium text-hud-text mb-2">
                        Found Repositories ({discoveredRepos.length})
                      </label>
                      <div className="max-h-48 overflow-y-auto space-y-2 border border-hud-gray/30 p-2">
                        {discoveredRepos.map((repo) => (
                          <div
                            key={repo.path}
                            onClick={() => handleSelectRepo(repo)}
                            className={cn(
                              'p-2 cursor-pointer transition-colors',
                              selectedRepo?.path === repo.path
                                ? 'bg-hud-accent/20 border border-hud-accent/40'
                                : 'bg-hud-gray/20 hover:bg-hud-gray/30'
                            )}
                          >
                            <div className="flex items-center justify-between">
                              <span className="font-medium text-hud-text">
                                {repo.name}
                              </span>
                              {repo.hasOrigin && (
                                <ExternalLink size={14} className="text-hud-text/50" />
                              )}
                            </div>
                            <p className="text-xs text-hud-text/50 font-mono truncate">
                              {repo.path}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {selectedRepo && (
                    <Input
                      label="Workspace Name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder={selectedRepo.name}
                    />
                  )}
                </>
              )}

              {mode === 'clone' && (
                <>
                  <Input
                    label="Repository URL *"
                    value={cloneUrl}
                    onChange={(e) => setCloneUrl(e.target.value)}
                    placeholder="https://github.com/user/repo.git"
                    required
                    autoFocus
                    hint="HTTPS or SSH URL (uses system credential helpers for auth)"
                  />
                  <Input
                    label="Clone To Directory *"
                    value={targetDirectory}
                    onChange={(e) => setTargetDirectory(e.target.value)}
                    placeholder="C:/Users/you/dev"
                    required
                    hint="Repository will be cloned as a subdirectory here"
                  />
                  <Input
                    label="Workspace Name (optional)"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Auto-detected from URL"
                  />
                </>
              )}

              <div className="flex items-start gap-2 p-3 bg-hud-accent/10 border border-hud-accent/20">
                <AlertCircle size={16} className="text-hud-accent shrink-0 mt-0.5" />
                <div className="text-xs text-hud-text/70">
                  <p className="font-medium mb-1">About Workspaces</p>
                  <p>
                    Workspaces enable parallel agent sessions using git worktrees. Each session gets
                    an isolated working directory, allowing multiple agents to work on different
                    branches simultaneously.
                  </p>
                </div>
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={handleClose} disabled={creating}>
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  loading={creating}
                  disabled={creating || (mode === 'browse' && !selectedRepo)}
                >
                  {creating
                    ? mode === 'clone'
                      ? 'Cloning...'
                      : 'Creating...'
                    : mode === 'clone'
                      ? 'Clone & Create'
                      : 'Create Workspace'}
                </Button>
              </DialogFooter>
            </form>
          </div>
        </DialogBody>
      </DialogContent>
    </Dialog>
  )
}

export default WorkspacesPage
