// Secondary panel — shows sessions belonging to the active workspace.
// Slides in next to SidebarRail; can be dismissed and re-opened by clicking
// a workspace icon in the rail.

import { useNavigate } from 'react-router'
import { X, Plus } from 'lucide-react'
import { cn } from '@/utils/cn'
import { useAppStore } from '@/stores/app'
import { useSessionsStore } from '@/stores/sessions'
import { useWorkspaces } from '@/hooks/useWorkspaces'
import { StatusDot } from '@/components/ui/status-dot'

// ── WorkspacePanel ─────────────────────────────────────────────────────────

export function WorkspacePanel() {
  const navigate = useNavigate()
  const { workspacePanelOpen, setWorkspacePanelOpen, activeWorkspaceId } =
    useAppStore()
  const { sessions, connections, activeSessionId, setActiveSession } =
    useSessionsStore()
  const { workspaces } = useWorkspaces()

  // Derive active workspace record from the shared list (title only)
  const workspace = workspaces.find((w) => w.id === activeWorkspaceId) ?? null

  // Filter by workspaceId (set at creation, persisted in IndexedDB), with a
  // workingDirectory fallback for sessions that predate the field.
  // Shows all sessions when no workspace is selected.
  const panelSessions = activeWorkspaceId
    ? sessions.filter((s) =>
        s.workspaceId === activeWorkspaceId ||
        (s.status.workingDirectory != null &&
          workspace != null &&
          s.status.workingDirectory.startsWith(workspace.repoRoot)),
      )
    : sessions

  const workspaceName =
    workspace?.name ||
    workspace?.repoRoot.split(/[/\\]/).filter(Boolean).pop() ||
    'Sessions'

  return (
    <div
      className={cn(
        'hidden lg:flex flex-col border-r border-border bg-card/60 shrink-0',
        'transition-[width] duration-200 ease-out overflow-hidden',
        workspacePanelOpen ? 'w-60' : 'w-0',
      )}
    >
      {/* Header */}
      <div className="h-14 px-3 flex items-center justify-between border-b border-border shrink-0">
        <span
          className="font-medium text-sm text-foreground truncate"
          title={workspace?.repoRoot}
        >
          {workspaceName}
        </span>
        <button
          onClick={() => setWorkspacePanelOpen(false)}
          className="p-1.5 rounded-md hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors shrink-0"
          aria-label="Close panel"
        >
          <X size={14} />
        </button>
      </div>

      {/* Session list */}
      <nav className="flex-1 overflow-y-auto p-2 space-y-0.5">
        <div className="px-2 py-1.5">
          <span className="text-xs font-medium uppercase tracking-wider text-foreground/40">
            Sessions
          </span>
        </div>

        {panelSessions.length === 0 ? (
          <p className="px-2 py-3 text-xs text-foreground/40">
            No sessions yet
          </p>
        ) : (
          panelSessions.map((session) => {
            const conn = connections[session.id]
            const isActive = session.id === activeSessionId

            return (
              <button
                key={session.id}
                onClick={() => {
                  setActiveSession(session.id)
                  // Stay in the workspace-scoped view — the pane auto-connects
                  if (activeWorkspaceId) {
                    navigate(`/workspaces/${activeWorkspaceId}`)
                  }
                }}
                className={cn(
                  'w-full flex items-center gap-2 px-2 py-2 rounded-lg text-sm transition-colors',
                  isActive
                    ? 'bg-accent/10 text-accent'
                    : 'text-muted-foreground hover:bg-secondary hover:text-foreground',
                )}
              >
                <StatusDot status={conn?.status ?? 'disconnected'} />
                <span className="truncate font-mono text-xs flex-1 text-left">
                  {session.id.slice(0, 8)}
                </span>
                {conn?.isStreaming && (
                  <span className="w-2 h-2 rounded-full bg-success animate-pulse shrink-0" />
                )}
              </button>
            )
          })
        )}
      </nav>

      {/* Footer */}
      <div className="p-2 border-t border-border shrink-0">
        <button
          onClick={() => {
            // Navigate to the workspace view where AddSessionDialog lives
            if (activeWorkspaceId) {
              navigate(`/workspaces/${activeWorkspaceId}`)
            } else {
              navigate('/workspaces')
            }
          }}
          className="w-full flex items-center gap-2 px-2 py-2 rounded-lg text-xs text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
        >
          <Plus size={14} />
          <span>New session</span>
        </button>
      </div>
    </div>
  )
}
