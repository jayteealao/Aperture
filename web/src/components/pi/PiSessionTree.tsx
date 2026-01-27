/**
 * Pi SDK Session Tree
 * Visualizes the conversation tree structure with branches
 */

import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Spinner } from '@/components/ui/Spinner'
import { usePiSession } from '@/hooks/usePiSession'
import type { PiSessionTree as PiSessionTreeType, PiSessionEntry } from '@/api/pi-types'

interface PiSessionTreeProps {
  sessionId: string
  onNavigate?: (entryId: string) => void
}

export function PiSessionTree({ sessionId, onNavigate }: PiSessionTreeProps) {
  const { sessionTree, isLoading, isPiSession, refreshTree, navigate } = usePiSession(sessionId)

  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set())

  if (!isPiSession) {
    return null
  }

  const handleNavigate = (entryId: string) => {
    navigate(entryId)
    onNavigate?.(entryId)
  }

  const toggleExpanded = (nodeId: string) => {
    setExpandedNodes((prev) => {
      const next = new Set(prev)
      if (next.has(nodeId)) {
        next.delete(nodeId)
      } else {
        next.add(nodeId)
      }
      return next
    })
  }

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium">Session Tree</h3>
        <Button onClick={refreshTree} size="sm" variant="ghost" disabled={isLoading.tree}>
          {isLoading.tree ? <Spinner className="h-4 w-4" /> : 'Refresh'}
        </Button>
      </div>

      {sessionTree ? (
        <div className="space-y-1">
          <TreeNode
            tree={sessionTree}
            entryId={sessionTree.entries[0]?.id || null}
            expandedNodes={expandedNodes}
            onToggle={toggleExpanded}
            onNavigate={handleNavigate}
            currentLeafId={sessionTree.leafId}
            depth={0}
          />
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">No session tree available. Click Refresh to load.</p>
      )}
    </Card>
  )
}

interface TreeNodeProps {
  tree: PiSessionTreeType
  entryId: string | null
  expandedNodes: Set<string>
  onToggle: (nodeId: string) => void
  onNavigate: (entryId: string) => void
  currentLeafId: string
  depth: number
}

function TreeNode({ tree, entryId, expandedNodes, onToggle, onNavigate, currentLeafId, depth }: TreeNodeProps) {
  if (!entryId) {
    return null
  }

  const entry = tree.entries.find((e) => e.id === entryId)
  if (!entry) {
    return null
  }

  const childIds = tree.branches[entryId] || []
  const hasChildren = childIds.length > 0
  const isExpanded = expandedNodes.has(entryId)
  const isCurrentLeaf = entryId === currentLeafId
  const label = tree.labels[entryId]

  return (
    <div className="relative">
      {/* Connection line */}
      {depth > 0 && (
        <div
          className="absolute -left-4 top-0 w-4 border-l-2 border-b-2 border-border"
          style={{ height: '1.25rem' }}
        />
      )}

      <div className="flex items-center gap-1.5" style={{ paddingLeft: depth * 16 }}>
        {/* Expand/collapse button */}
        {hasChildren && (
          <button
            onClick={() => onToggle(entryId)}
            className="w-4 h-4 flex items-center justify-center text-muted-foreground hover:text-foreground"
          >
            {isExpanded ? (
              <ChevronDownIcon className="h-3 w-3" />
            ) : (
              <ChevronRightIcon className="h-3 w-3" />
            )}
          </button>
        )}
        {!hasChildren && <div className="w-4" />}

        {/* Node type icon */}
        <NodeTypeIcon type={entry.type} />

        {/* Node content */}
        <button
          onClick={() => onNavigate(entryId)}
          className={`flex-1 text-left text-sm truncate px-1.5 py-0.5 rounded ${
            isCurrentLeaf ? 'bg-primary/10 text-primary font-medium' : 'hover:bg-muted'
          }`}
          title={`Navigate to ${entry.type}`}
        >
          {label || getEntryLabel(entry)}
        </button>

        {/* Current indicator */}
        {isCurrentLeaf && (
          <Badge variant="default" className="text-xs">
            Current
          </Badge>
        )}

        {/* Branch indicator */}
        {hasChildren && childIds.length > 1 && (
          <Badge variant="outline" className="text-xs">
            {childIds.length} branches
          </Badge>
        )}
      </div>

      {/* Children */}
      {hasChildren && isExpanded && (
        <div className="ml-2 pl-2 border-l border-border">
          {childIds.map((childId) => (
            <TreeNode
              key={childId}
              tree={tree}
              entryId={childId}
              expandedNodes={expandedNodes}
              onToggle={onToggle}
              onNavigate={onNavigate}
              currentLeafId={currentLeafId}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function getEntryLabel(entry: PiSessionEntry): string {
  switch (entry.type) {
    case 'message':
      const msgData = entry.data as { role?: string; content?: string }
      if (msgData.role === 'user') {
        return `User: ${(msgData.content || '').slice(0, 30)}...`
      }
      return `Assistant message`
    case 'thinking_level_change':
      const thinkingData = entry.data as { level?: string }
      return `Thinking: ${thinkingData.level}`
    case 'model_change':
      const modelData = entry.data as { provider?: string; modelId?: string }
      return `Model: ${modelData.provider}/${modelData.modelId}`
    case 'compaction':
      return 'Context compacted'
    case 'branch_summary':
      return 'Branch summary'
    case 'label':
      return entry.data as string || 'Label'
    default:
      return entry.type
  }
}

function NodeTypeIcon({ type }: { type: string }) {
  const className = 'h-3.5 w-3.5 text-muted-foreground'

  switch (type) {
    case 'message':
      return (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={className}
        >
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
      )
    case 'thinking_level_change':
      return (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={className}
        >
          <circle cx="12" cy="12" r="10" />
          <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
          <path d="M12 17h.01" />
        </svg>
      )
    case 'model_change':
      return (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={className}
        >
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <path d="M8 8h8" />
          <path d="M8 12h8" />
          <path d="M8 16h4" />
        </svg>
      )
    case 'compaction':
      return (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={className}
        >
          <path d="M17 12H3" />
          <path d="m11 18-6-6 6-6" />
          <path d="M21 6v12" />
        </svg>
      )
    default:
      return (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={className}
        >
          <circle cx="12" cy="12" r="10" />
        </svg>
      )
  }
}

function ChevronDownIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  )
}

function ChevronRightIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <polyline points="9 18 15 12 9 6" />
    </svg>
  )
}
