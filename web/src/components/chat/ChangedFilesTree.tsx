import { useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, FileCode2, Folder, FolderOpen } from 'lucide-react'
import type { TurnDiffFileSummary } from '@/api/types'
import { buildTurnDiffTree, type TurnDiffTreeDirectoryNode, type TurnDiffTreeFileNode } from '@/lib/turnDiffTree'
import { cn } from '@/utils/cn'

interface ChangedFilesTreeProps {
  files: TurnDiffFileSummary[]
  expandedAll?: boolean
  onFileSelect?: (path: string) => void
}

function DiffStat({ additions, deletions }: { additions: number; deletions: number }) {
  return (
    <span className="shrink-0 text-2xs text-muted-foreground">
      <span className="text-emerald-400">+{additions}</span> <span className="text-rose-400">-{deletions}</span>
    </span>
  )
}

function FileRow({
  node,
  depth,
  onSelect,
}: {
  node: TurnDiffTreeFileNode
  depth: number
  onSelect?: (path: string) => void
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect?.(node.path)}
      className="flex w-full min-w-0 items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-secondary/60"
      style={{ paddingLeft: `${depth * 14 + 8}px` }}
    >
      <FileCode2 className="size-3.5 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1 truncate text-xs text-foreground">{node.name}</span>
      <DiffStat additions={node.additions} deletions={node.deletions} />
    </button>
  )
}

function DirectoryRow({
  node,
  depth,
  expandedAll,
  onSelect,
}: {
  node: TurnDiffTreeDirectoryNode
  depth: number
  expandedAll?: boolean
  onSelect?: (path: string) => void
}) {
  const [isExpanded, setIsExpanded] = useState(expandedAll ?? false)
  const expanded = expandedAll ?? isExpanded

  return (
    <div className="min-w-0">
      <button
        type="button"
        onClick={() => setIsExpanded((value) => !value)}
        className="flex w-full min-w-0 items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-secondary/60"
        style={{ paddingLeft: `${depth * 14 + 8}px` }}
      >
        {expanded ? <ChevronDown className="size-3.5 shrink-0" /> : <ChevronRight className="size-3.5 shrink-0" />}
        {expanded ? (
          <FolderOpen className="size-3.5 shrink-0 text-muted-foreground" />
        ) : (
          <Folder className="size-3.5 shrink-0 text-muted-foreground" />
        )}
        <span className="min-w-0 flex-1 truncate text-xs font-medium text-foreground">{node.name}</span>
        <DiffStat additions={node.additions} deletions={node.deletions} />
      </button>
      {expanded && (
        <div className="min-w-0">
          {node.children.map((child) =>
            child.type === 'directory' ? (
              <DirectoryRow
                key={child.path}
                node={child}
                depth={depth + 1}
                expandedAll={expandedAll}
                onSelect={onSelect}
              />
            ) : (
              <FileRow key={child.path} node={child} depth={depth + 1} onSelect={onSelect} />
            )
          )}
        </div>
      )}
    </div>
  )
}

export function ChangedFilesTree({ files, expandedAll, onFileSelect }: ChangedFilesTreeProps) {
  const tree = useMemo(() => buildTurnDiffTree(files), [files])

  return (
    <div className={cn('min-w-0 space-y-0.5')}>
      {tree.map((node) =>
        node.type === 'directory' ? (
          <DirectoryRow
            key={node.path}
            node={node}
            depth={0}
            expandedAll={expandedAll}
            onSelect={onFileSelect}
          />
        ) : (
          <FileRow key={node.path} node={node} depth={0} onSelect={onFileSelect} />
        )
      )}
    </div>
  )
}
