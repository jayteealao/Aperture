import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router'
import { api } from '@/api/client'
import { useToast } from '@/components/ui/Toast'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Textarea } from '@/components/ui/Textarea'
import { Dialog } from '@/components/ui/Dialog'
import { Badge } from '@/components/ui/Badge'
import { Spinner } from '@/components/ui/Spinner'
import type { WorkspaceRecord, CheckoutRecord, DiscoveredRepo } from '@/api/types'
import {
  GitBranch,
  Plus,
  Trash2,
  Folder,
  RefreshCw,
  AlertCircle,
  FolderSearch,
  Download,
  ExternalLink,
  Play,
} from 'lucide-react'
import { cn } from '@/utils/cn'

interface WorkspaceWithData extends WorkspaceRecord {
  checkouts: CheckoutRecord[]
}

export default function Workspaces() {
  const navigate = useNavigate()
  const toast = useToast()
  const toastRef = useRef<typeof toast>(toast)
  toastRef.current = toast
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
            const checkoutsData = await api.listWorkspaceCheckouts(workspace.id)

            return {
              ...workspace,
              checkouts: checkoutsData.checkouts || [],
            }
          } catch (err) {
            console.error(`Failed to load data for workspace ${workspace.id}:`, err)
            return {
              ...workspace,
              checkouts: [],
            }
          }
        })
      )

      setWorkspaces(workspacesWithData)
    } catch (error) {
      toastRef.current.error(
        'Failed to load workspaces',
        error instanceof Error ? error.message : 'Unknown error'
      )
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

  const handleDeleteWorkspace = async (workspace: WorkspaceWithData) => {
    if (
      !confirm(
        `Are you sure you want to delete workspace "${workspace.name}"?\n\nThis will remove all checkouts and their clone directories.`
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

  const handleDeleteCheckout = async (workspace: WorkspaceWithData, checkout: CheckoutRecord) => {
    if (
      !confirm(
        `Are you sure you want to remove checkout "${checkout.name}"?\n\nThis will delete the clone directory.`
      )
    ) {
      return
    }

    try {
      await api.deleteWorkspaceCheckout(workspace.id, checkout.id)
      toast.success('Checkout removed')
      loadWorkspaces(true)
    } catch (error) {
      toast.error(
        'Failed to remove checkout',
        error instanceof Error ? error.message : 'Unknown error'
      )
    }
  }

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center">
          <Spinner size="lg" />
          <p className="mt-4 text-sm text-(--color-text-secondary)">
            Loading workspaces...
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="px-6 py-4 border-b border-(--color-border)">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-(--color-text-primary) flex items-center gap-2">
              <GitBranch size={24} className="text-accent" />
              Workspaces
            </h1>
            <p className="text-sm text-(--color-text-secondary) mt-1">
              Manage repositories and isolated agent environments
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
              <Folder size={48} className="mx-auto text-(--color-text-muted) mb-4" />
              <h3 className="text-lg font-semibold text-(--color-text-primary)">
                No workspaces yet
              </h3>
              <p className="text-(--color-text-secondary) mb-4">
                Create a workspace to enable multi-agent isolated environments
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
                onDeleteCheckout={(checkout) => handleDeleteCheckout(workspace, checkout)}
                onRefresh={() => loadWorkspaces(true)}
                onNewSession={() => navigate(`/sessions/new?workspaceId=${workspace.id}`)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Create Dialog */}
      {showCreateDialog && (
        <CreateWorkspaceDialog
          open={showCreateDialog}
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
  onDeleteCheckout,
  onRefresh,
  onNewSession,
}: {
  workspace: WorkspaceWithData
  onDelete: () => void
  onDeleteCheckout: (checkout: CheckoutRecord) => void
  onRefresh: () => void
  onNewSession: () => void
}) {
  const [showCheckouts, setShowCheckouts] = useState(true)

  return (
    <Card variant="glass" padding="none" className="overflow-hidden hover:shadow-lg transition-shadow">
      {/* Header */}
      <div className="p-4 border-b border-(--color-border)">
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <h3 className="text-lg font-semibold text-(--color-text-primary) truncate">
              {workspace.name}
            </h3>
            <p className="text-xs font-mono text-(--color-text-muted) mt-1">
              {workspace.id}
            </p>
          </div>
          <div className="flex items-center gap-1 ml-2">
            <Button
              variant="primary"
              size="sm"
              onClick={onNewSession}
              className="p-1.5"
              title="New Session"
            >
              <Play size={14} />
            </Button>
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
          <span className="text-(--color-text-muted) min-w-[80px]">Repository:</span>
          <span className="text-(--color-text-secondary) font-mono text-xs flex-1 break-all">
            {workspace.repoRoot}
          </span>
        </div>
        {workspace.description && (
          <div className="flex items-start gap-2">
            <span className="text-(--color-text-muted) min-w-[80px]">Description:</span>
            <span className="text-(--color-text-secondary) flex-1">
              {workspace.description}
            </span>
          </div>
        )}
        <div className="flex items-start gap-2">
          <span className="text-(--color-text-muted) min-w-[80px]">Created:</span>
          <span className="text-(--color-text-secondary) text-xs">
            {new Date(workspace.createdAt).toLocaleString()}
          </span>
        </div>
      </div>

      {/* Checkouts Section */}
      <div className="border-t border-(--color-border)">
        <button
          onClick={() => setShowCheckouts(!showCheckouts)}
          className="w-full px-4 py-3 flex items-center justify-between hover:bg-(--color-surface) transition-colors"
        >
          <div className="flex items-center gap-2">
            <GitBranch size={16} className="text-(--color-text-muted)" />
            <span className="text-sm font-medium text-(--color-text-primary)">
              Checkouts
            </span>
          </div>
          <Badge variant={workspace.checkouts.length > 0 ? 'success' : 'default'} size="sm">
            {workspace.checkouts.length}
          </Badge>
        </button>
        {showCheckouts && (
          <div className="px-4 pb-3">
            {workspace.checkouts.length > 0 ? (
              <div className="space-y-2">
                {workspace.checkouts.map((checkout) => (
                  <div
                    key={checkout.id}
                    className="flex items-center justify-between p-2 rounded-lg bg-(--color-bg-tertiary)"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-success shrink-0" />
                        <span className="text-sm font-medium text-(--color-text-primary) font-mono truncate">
                          {checkout.name}
                        </span>
                        <Badge variant="default" size="sm">
                          {checkout.cloneSource}
                        </Badge>
                      </div>
                      <p className="text-xs text-(--color-text-muted) font-mono mt-1 truncate">
                        {checkout.path}
                      </p>
                      {checkout.sessionId && (
                        <p className="text-2xs text-(--color-text-muted) mt-1">
                          Session: {checkout.sessionId.slice(0, 12)}...
                        </p>
                      )}
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onDeleteCheckout(checkout)}
                      className="ml-2 p-1.5 text-danger hover:text-danger shrink-0"
                    >
                      <Trash2 size={12} />
                    </Button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-(--color-text-muted) text-center py-3">
                No checkouts
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
  onClose,
  onSuccess,
}: {
  open: boolean
  onClose: () => void
  onSuccess: () => void
}) {
  const toast = useToast()
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

  const handleScan = async () => {
    if (!scanPath.trim()) {
      toast.error('Validation error', 'Please enter a directory path to scan')
      return
    }

    setIsScanning(true)
    try {
      const result = await api.discoverRepos(scanPath.trim())
      setDiscoveredRepos(result.repos)
      if (result.repos.length === 0) {
        toast.info('No repositories found', `Scanned ${result.scannedDirectories} directories`)
      }
    } catch (error) {
      toast.error(
        'Scan failed',
        error instanceof Error ? error.message : 'Unknown error'
      )
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
        // Clone mode: clone and create workspace
        if (!cloneUrl.trim() || !targetDirectory.trim()) {
          toast.error('Validation error', 'Clone URL and target directory are required')
          setCreating(false)
          return
        }

        await api.cloneWorkspace({
          remoteUrl: cloneUrl.trim(),
          targetDirectory: targetDirectory.trim(),
          name: name.trim() || undefined,
        })

        toast.success('Repository cloned and workspace created!')
      } else {
        // Manual or Browse mode: create from existing repo
        if (!name.trim() || !repoRoot.trim()) {
          toast.error('Validation error', 'Name and repository path are required')
          setCreating(false)
          return
        }

        await api.createWorkspace({
          name: name.trim(),
          repoRoot: repoRoot.trim(),
          description: description.trim() || undefined,
        })

        toast.success('Workspace created successfully!')
      }

      resetState()
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
    <Dialog open={open} onClose={onClose} title="Create Workspace" size="lg">
      <div className="space-y-4">
        {/* Mode selector */}
        <div className="flex gap-2 p-1 bg-(--color-bg-tertiary) rounded-lg">
          <button
            type="button"
            onClick={() => setMode('manual')}
            className={cn(
              'flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors',
              mode === 'manual'
                ? 'bg-(--color-surface) text-(--color-text-primary) shadow-xs'
                : 'text-(--color-text-secondary) hover:text-(--color-text-primary)'
            )}
          >
            <Folder size={16} />
            Manual Path
          </button>
          <button
            type="button"
            onClick={() => setMode('browse')}
            className={cn(
              'flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors',
              mode === 'browse'
                ? 'bg-(--color-surface) text-(--color-text-primary) shadow-xs'
                : 'text-(--color-text-secondary) hover:text-(--color-text-primary)'
            )}
          >
            <FolderSearch size={16} />
            Browse Local
          </button>
          <button
            type="button"
            onClick={() => setMode('clone')}
            className={cn(
              'flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors',
              mode === 'clone'
                ? 'bg-(--color-surface) text-(--color-text-primary) shadow-xs'
                : 'text-(--color-text-secondary) hover:text-(--color-text-primary)'
            )}
          >
            <Download size={16} />
            Clone URL
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === 'manual' && (
            <>
              <div>
                <label className="block text-sm font-medium text-(--color-text-primary) mb-2">
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
                <label className="block text-sm font-medium text-(--color-text-primary) mb-2">
                  Repository Root Path *
                </label>
                <Input
                  value={repoRoot}
                  onChange={(e) => setRepoRoot(e.target.value)}
                  placeholder="/path/to/repo"
                  required
                />
                <p className="text-xs text-(--color-text-muted) mt-1">
                  Absolute path to a valid git repository
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-(--color-text-primary) mb-2">
                  Description <span className="text-(--color-text-muted)">(optional)</span>
                </label>
                <Textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Workspace for AI agent development"
                  rows={3}
                />
              </div>
            </>
          )}

          {mode === 'browse' && (
            <>
              <div>
                <label className="block text-sm font-medium text-(--color-text-primary) mb-2">
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
                    variant="secondary"
                  >
                    {isScanning ? <Spinner size="sm" /> : 'Scan'}
                  </Button>
                </div>
                <p className="text-xs text-(--color-text-muted) mt-1">
                  Scans up to 3 levels deep for git repositories
                </p>
              </div>

              {discoveredRepos.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-(--color-text-primary) mb-2">
                    Found Repositories ({discoveredRepos.length})
                  </label>
                  <div className="max-h-48 overflow-y-auto space-y-2 border border-(--color-border) rounded-lg p-2">
                    {discoveredRepos.map((repo) => (
                      <div
                        key={repo.path}
                        onClick={() => handleSelectRepo(repo)}
                        className={cn(
                          'p-2 rounded-lg cursor-pointer transition-colors',
                          selectedRepo?.path === repo.path
                            ? 'bg-accent/20 border border-accent/40'
                            : 'bg-(--color-bg-tertiary) hover:bg-(--color-surface)'
                        )}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-(--color-text-primary)">
                            {repo.name}
                          </span>
                          {repo.hasOrigin && (
                            <ExternalLink size={14} className="text-(--color-text-muted)" />
                          )}
                        </div>
                        <p className="text-xs text-(--color-text-muted) font-mono truncate">
                          {repo.path}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {selectedRepo && (
                <div>
                  <label className="block text-sm font-medium text-(--color-text-primary) mb-2">
                    Workspace Name
                  </label>
                  <Input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder={selectedRepo.name}
                  />
                </div>
              )}
            </>
          )}

          {mode === 'clone' && (
            <>
              <div>
                <label className="block text-sm font-medium text-(--color-text-primary) mb-2">
                  Repository URL *
                </label>
                <Input
                  value={cloneUrl}
                  onChange={(e) => setCloneUrl(e.target.value)}
                  placeholder="https://github.com/user/repo.git"
                  required
                  autoFocus
                />
                <p className="text-xs text-(--color-text-muted) mt-1">
                  HTTPS or SSH URL (uses system credential helpers for auth)
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-(--color-text-primary) mb-2">
                  Clone To Directory *
                </label>
                <Input
                  value={targetDirectory}
                  onChange={(e) => setTargetDirectory(e.target.value)}
                  placeholder="C:/Users/you/dev"
                  required
                />
                <p className="text-xs text-(--color-text-muted) mt-1">
                  Repository will be cloned as a subdirectory here
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-(--color-text-primary) mb-2">
                  Workspace Name <span className="text-(--color-text-muted)">(optional)</span>
                </label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Auto-detected from URL"
                />
              </div>
            </>
          )}

          <div className="flex items-start gap-2 p-3 rounded-lg bg-accent/10 border border-accent/20">
            <AlertCircle size={16} className="text-accent shrink-0 mt-0.5" />
            <div className="text-xs text-(--color-text-secondary)">
              <p className="font-medium mb-1">About Workspaces</p>
              <p>
                Workspaces enable parallel agent sessions using local clones. Each session gets
                an isolated copy of the repository, allowing multiple agents to work independently
                and simultaneously.
              </p>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t border-(--color-border)">
            <Button variant="ghost" onClick={onClose} disabled={creating}>
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
          </div>
        </form>
      </div>
    </Dialog>
  )
}
