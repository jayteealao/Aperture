import { useState, useEffect, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/api/client'
import { cn } from '@/utils/cn'
import { Input, Button, Spinner } from '@/components/ui'
import type { WorkspaceRecord, DiscoveredRepo } from '@/api/types'
import {
  ChevronDown,
  Folder,
  FolderSearch,
  Download,
  FolderPlus,
  Check,
  GitBranch,
  ExternalLink,
} from 'lucide-react'

export type RepoSelectionMode = 'workspace' | 'browse' | 'clone' | 'init' | 'direct'

export interface RepoSelection {
  mode: RepoSelectionMode
  workspaceId?: string
  workspace?: WorkspaceRecord
  repoPath?: string
  cloneUrl?: string
  cloneTarget?: string
  initPath?: string
  initName?: string
}

interface RepoSelectorProps {
  value: RepoSelection | null
  onChange: (selection: RepoSelection | null) => void
  label?: string
  error?: string
}

export function RepoSelector({ value, onChange, label, error }: RepoSelectorProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [mode, setMode] = useState<'list' | 'browse' | 'clone' | 'init'>('list')
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Fetch workspaces
  const { data: workspacesData, isLoading: workspacesLoading } = useQuery({
    queryKey: ['workspaces'],
    queryFn: () => api.listWorkspaces(),
  })

  const workspaces = workspacesData?.workspaces ?? []

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
        setMode('list')
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleSelectWorkspace = (workspace: WorkspaceRecord) => {
    onChange({
      mode: 'workspace',
      workspaceId: workspace.id,
      workspace,
      repoPath: workspace.repoRoot,
    })
    setIsOpen(false)
    setMode('list')
  }

  const getDisplayValue = () => {
    if (!value) return 'Select a repository...'
    if (value.mode === 'workspace' && value.workspace) {
      return value.workspace.name
    }
    if (value.mode === 'browse' || value.mode === 'direct') {
      return value.repoPath || 'Local repository'
    }
    if (value.mode === 'clone') {
      return value.cloneUrl || 'Cloned repository'
    }
    if (value.mode === 'init') {
      return value.initName || value.initPath || 'New repository'
    }
    return 'Selected repository'
  }

  return (
    <div className="w-full">
      {label && (
        <label className="block text-sm font-medium text-hud-text mb-2">
          {label}
        </label>
      )}
      <div ref={dropdownRef} className="relative">
        {/* Trigger button */}
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className={cn(
            'w-full h-10 px-3 pr-10 text-sm text-left',
            'bg-hud-gray/30 text-hud-text',
            'border border-hud-gray/50',
            'focus:outline-none focus:border-hud-accent',
            'transition-all duration-200',
            error && 'border-hud-error focus:border-hud-error'
          )}
        >
          <div className="flex items-center gap-2 truncate">
            {value?.mode === 'workspace' && <GitBranch size={14} className="text-hud-accent shrink-0" />}
            {(value?.mode === 'browse' || value?.mode === 'direct') && <Folder size={14} className="text-hud-text/50 shrink-0" />}
            {value?.mode === 'clone' && <Download size={14} className="text-hud-text/50 shrink-0" />}
            {value?.mode === 'init' && <FolderPlus size={14} className="text-hud-text/50 shrink-0" />}
            <span className={cn(!value && 'text-hud-text/50')}>
              {getDisplayValue()}
            </span>
          </div>
          <ChevronDown
            size={18}
            className={cn(
              'absolute right-3 top-1/2 -translate-y-1/2 text-hud-text/50 transition-transform',
              isOpen && 'rotate-180'
            )}
          />
        </button>

        {/* Dropdown */}
        {isOpen && (
          <div className="absolute z-[100] w-full mt-2 py-2 bg-hud-black border border-hud-gray/50 shadow-xl max-h-80 overflow-y-auto">
            {mode === 'list' && (
              <RepoListView
                workspaces={workspaces}
                loading={workspacesLoading}
                selectedId={value?.workspaceId}
                onSelect={handleSelectWorkspace}
                onBrowse={() => setMode('browse')}
                onClone={() => setMode('clone')}
                onInit={() => setMode('init')}
              />
            )}
            {mode === 'browse' && (
              <BrowseRepoView
                onSelect={(repo) => {
                  onChange({
                    mode: 'browse',
                    repoPath: repo.path,
                  })
                  setIsOpen(false)
                  setMode('list')
                }}
                onBack={() => setMode('list')}
              />
            )}
            {mode === 'clone' && (
              <CloneRepoView
                onSelect={(url, target) => {
                  onChange({
                    mode: 'clone',
                    cloneUrl: url,
                    cloneTarget: target,
                  })
                  setIsOpen(false)
                  setMode('list')
                }}
                onBack={() => setMode('list')}
              />
            )}
            {mode === 'init' && (
              <InitRepoView
                onSelect={(path, name) => {
                  onChange({
                    mode: 'init',
                    initPath: path,
                    initName: name,
                  })
                  setIsOpen(false)
                  setMode('list')
                }}
                onBack={() => setMode('list')}
              />
            )}
          </div>
        )}
      </div>
      {error && <p className="mt-1 text-sm text-hud-error">{error}</p>}
    </div>
  )
}

// Sub-components for different views

function RepoListView({
  workspaces,
  loading,
  selectedId,
  onSelect,
  onBrowse,
  onClone,
  onInit,
}: {
  workspaces: WorkspaceRecord[]
  loading: boolean
  selectedId?: string
  onSelect: (workspace: WorkspaceRecord) => void
  onBrowse: () => void
  onClone: () => void
  onInit: () => void
}) {
  return (
    <>
      {/* Known workspaces */}
      {loading ? (
        <div className="px-4 py-3 text-center">
          <Spinner size="sm" />
        </div>
      ) : workspaces.length > 0 ? (
        <>
          <div className="px-3 py-1.5 text-xs font-medium text-hud-text/50 uppercase tracking-wide">
            Known Repositories
          </div>
          {workspaces.map((workspace) => (
            <button
              key={workspace.id}
              type="button"
              onClick={() => onSelect(workspace)}
              className={cn(
                'w-full px-3 py-2 text-left hover:bg-hud-gray/30 transition-colors',
                'flex items-center gap-3'
              )}
            >
              <GitBranch size={16} className="text-hud-accent shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-hud-text truncate">
                  {workspace.name}
                </div>
                <div className="text-xs text-hud-text/50 font-mono truncate">
                  {workspace.repoRoot}
                </div>
              </div>
              {selectedId === workspace.id && (
                <Check size={16} className="text-hud-success shrink-0" />
              )}
            </button>
          ))}
          <div className="my-2 border-t border-hud-gray/30" />
        </>
      ) : null}

      {/* Action buttons */}
      <button
        type="button"
        onClick={onBrowse}
        className="w-full px-3 py-2 text-left hover:bg-hud-gray/30 transition-colors flex items-center gap-3"
      >
        <FolderSearch size={16} className="text-hud-text/50" />
        <span className="text-sm text-hud-text">Browse local repo...</span>
      </button>
      <button
        type="button"
        onClick={onClone}
        className="w-full px-3 py-2 text-left hover:bg-hud-gray/30 transition-colors flex items-center gap-3"
      >
        <Download size={16} className="text-hud-text/50" />
        <span className="text-sm text-hud-text">Clone from URL...</span>
      </button>
      <button
        type="button"
        onClick={onInit}
        className="w-full px-3 py-2 text-left hover:bg-hud-gray/30 transition-colors flex items-center gap-3"
      >
        <FolderPlus size={16} className="text-hud-text/50" />
        <span className="text-sm text-hud-text">Initialize new repo...</span>
      </button>
    </>
  )
}

function BrowseRepoView({
  onSelect,
  onBack,
}: {
  onSelect: (repo: DiscoveredRepo) => void
  onBack: () => void
}) {
  const [scanPath, setScanPath] = useState('')
  const [isScanning, setIsScanning] = useState(false)
  const [discoveredRepos, setDiscoveredRepos] = useState<DiscoveredRepo[]>([])
  const [scanError, setScanError] = useState<string | null>(null)

  const handleScan = async () => {
    if (!scanPath.trim()) return

    setIsScanning(true)
    setScanError(null)

    try {
      const result = await api.discoverRepos(scanPath.trim())
      setDiscoveredRepos(result.repos)
      if (result.repos.length === 0) {
        setScanError(`No repositories found (scanned ${result.scannedDirectories} directories)`)
      }
    } catch (error) {
      setScanError(error instanceof Error ? error.message : 'Scan failed')
    } finally {
      setIsScanning(false)
    }
  }

  return (
    <div className="px-3 py-2">
      <div className="flex items-center gap-2 mb-3">
        <button
          type="button"
          onClick={onBack}
          className="text-sm text-hud-accent hover:underline"
        >
          &larr; Back
        </button>
        <span className="text-sm font-medium text-hud-text">
          Browse Local Repository
        </span>
      </div>

      <div className="flex gap-2 mb-3">
        <Input
          value={scanPath}
          onChange={(e) => setScanPath(e.target.value)}
          placeholder="Enter directory path to scan"
          className="flex-1"
          onKeyDown={(e) => e.key === 'Enter' && handleScan()}
        />
        <Button
          type="button"
          onClick={handleScan}
          disabled={isScanning || !scanPath.trim()}
        >
          {isScanning ? <Spinner size="sm" /> : 'Scan'}
        </Button>
      </div>

      {scanError && (
        <p className="text-sm text-hud-error mb-2">{scanError}</p>
      )}

      {discoveredRepos.length > 0 && (
        <div className="max-h-48 overflow-y-auto border border-hud-gray/30">
          {discoveredRepos.map((repo) => (
            <button
              key={repo.path}
              type="button"
              onClick={() => onSelect(repo)}
              className="w-full px-3 py-2 text-left hover:bg-hud-gray/30 transition-colors border-b border-hud-gray/30 last:border-b-0"
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-hud-text">
                  {repo.name}
                </span>
                {repo.hasOrigin && (
                  <ExternalLink size={12} className="text-hud-text/50" />
                )}
              </div>
              <div className="text-xs text-hud-text/50 font-mono truncate">
                {repo.path}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function CloneRepoView({
  onSelect,
  onBack,
}: {
  onSelect: (url: string, target: string) => void
  onBack: () => void
}) {
  const [cloneUrl, setCloneUrl] = useState('')
  const [targetDir, setTargetDir] = useState('')

  const isValid = cloneUrl.trim() && targetDir.trim()

  return (
    <div className="px-3 py-2">
      <div className="flex items-center gap-2 mb-3">
        <button
          type="button"
          onClick={onBack}
          className="text-sm text-hud-accent hover:underline"
        >
          &larr; Back
        </button>
        <span className="text-sm font-medium text-hud-text">
          Clone from URL
        </span>
      </div>

      <div className="space-y-3">
        <Input
          value={cloneUrl}
          onChange={(e) => setCloneUrl(e.target.value)}
          placeholder="https://github.com/user/repo.git"
          label="Repository URL"
        />
        <Input
          value={targetDir}
          onChange={(e) => setTargetDir(e.target.value)}
          placeholder="C:/Users/you/dev"
          label="Clone to directory"
        />
        <Button
          type="button"
          onClick={() => onSelect(cloneUrl.trim(), targetDir.trim())}
          disabled={!isValid}
          className="w-full"
        >
          Use This Repository
        </Button>
      </div>
    </div>
  )
}

function InitRepoView({
  onSelect,
  onBack,
}: {
  onSelect: (path: string, name: string) => void
  onBack: () => void
}) {
  const [initPath, setInitPath] = useState('')
  const [repoName, setRepoName] = useState('')

  const isValid = initPath.trim()

  return (
    <div className="px-3 py-2">
      <div className="flex items-center gap-2 mb-3">
        <button
          type="button"
          onClick={onBack}
          className="text-sm text-hud-accent hover:underline"
        >
          &larr; Back
        </button>
        <span className="text-sm font-medium text-hud-text">
          Initialize New Repository
        </span>
      </div>

      <div className="space-y-3">
        <Input
          value={initPath}
          onChange={(e) => setInitPath(e.target.value)}
          placeholder="C:/Users/you/projects/new-project"
          label="Directory path"
          hint="Will be created if it doesn't exist"
        />
        <Input
          value={repoName}
          onChange={(e) => setRepoName(e.target.value)}
          placeholder="new-project"
          label="Repository name (optional)"
          hint="Defaults to directory name"
        />
        <Button
          type="button"
          onClick={() => onSelect(initPath.trim(), repoName.trim())}
          disabled={!isValid}
          className="w-full"
        >
          Use This Repository
        </Button>
      </div>
    </div>
  )
}

export default RepoSelector
