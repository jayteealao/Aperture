// Secondary panel — shows sessions belonging to the active workspace.
// Slides in next to SidebarRail; can be dismissed and re-opened by clicking
// a workspace icon in the rail.

import { useNavigate } from 'react-router'
import { X, Plus } from 'lucide-react'
import { cn } from '@/utils/cn'
import { useAppStore } from '@/stores/app'
import { useSessionsStore } from '@/stores/sessions'
import { useWorkspaces } from '@/hooks/useWorkspaces'

// ── Status indicator ───────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  connected: 'bg-success',
  connecting: 'bg-warning animate-pulse',
  reconnecting: 'bg-warning animate-pulse',
  disconnected: 'bg-foreground/40',
  error: 'bg-danger',
  ended: 'bg-foreground/40',
}

function StatusDot({ status }: { status: string }) {
  return (
    <span
      className={cn(
        'w-2 h-2 rounded-full shrink-0',
        STATUS_COLORS[status] ?? STATUS_COLORS.disconnected,
      )}
    />
  )
}

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

  // Show all sessions — workspace selection changes the panel title only.
  // A workingDirectory-based filter was previously here but sessions rarely
  // carry that field, so every session was silently filtered out.
  // Scope filtering to workspace once sessions carry a reliable workspaceId.
  const panelSessions = sessions

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
                  navigate('/workspace')
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
          onClick={() => navigate('/sessions/new')}
          className="w-full flex items-center gap-2 px-2 py-2 rounded-lg text-xs text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
        >
          <Plus size={14} />
          <span>New session</span>
        </button>
      </div>
    </div>
  )
}
