// Secondary panel — shows sessions belonging to the active workspace.
// Slides in next to SidebarRail; can be dismissed and re-opened by clicking
// a workspace icon in the rail.

import { useNavigate } from 'react-router'
import { X, Plus, ChevronDown, History } from 'lucide-react'
import { cn } from '@/utils/cn'
import { useAppStore } from '@/stores/app'
import { useSessionsStore } from '@/stores/sessions'
import { useWorkspaces } from '@/hooks/useWorkspaces'
import { StatusDot } from '@/components/ui/status-dot'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import type { Session } from '@/api/types'

function compareSessionCreatedAt(left: Session, right: Session) {
  return (left.createdAt ?? 0) - (right.createdAt ?? 0)
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

  // Filter by canonical server-owned workspaceId.
  // Shows all sessions when no workspace is selected.
  const workspaceSessions = (
    activeWorkspaceId
      ? sessions.filter((s) => s.workspaceId === activeWorkspaceId)
      : sessions
  ).slice().sort(compareSessionCreatedAt)

  const liveSessions = workspaceSessions.filter(
    (session) => session.status.running || !!session.status.isResumable,
  )
  const historicalSessions = workspaceSessions.filter(
    (session) => !session.status.running && !session.status.isResumable,
  )

  const workspaceName =
    workspace?.name ||
    workspace?.repoRoot.split(/[/\\]/).filter(Boolean).pop() ||
    'Sessions'

  return (
    <div
      className={cn(
        'hidden md:flex flex-col border-r border-border bg-card/60 shrink-0',
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
        {liveSessions.length === 0 && historicalSessions.length === 0 ? (
          <p className="px-2 py-3 text-xs text-foreground/40">No sessions yet</p>
        ) : (
          <div className="space-y-2">
            <Collapsible defaultOpen className="group rounded-lg border border-border/60 bg-background/20">
              <CollapsibleTrigger className="flex w-full items-center gap-2 px-2 py-2 text-left hover:bg-secondary/50 transition-colors">
                <span className="text-xs font-medium uppercase tracking-wider text-foreground/40">
                  Live
                </span>
                <span className="ml-auto rounded-full border border-border px-1.5 py-0.5 text-2xs text-muted-foreground">
                  {liveSessions.length}
                </span>
                <ChevronDown
                  size={14}
                  className="text-foreground/40 transition-transform group-data-[state=open]:rotate-180"
                />
              </CollapsibleTrigger>
              <CollapsibleContent className="overflow-hidden data-[state=open]:animate-collapsible-down data-[state=closed]:animate-collapsible-up">
                <div className="space-y-0.5 px-2 pb-2">
                  {liveSessions.length === 0 ? (
                    <p className="px-2 py-2 text-xs text-foreground/40">No live sessions</p>
                  ) : (
                    liveSessions.map((session) => {
                      const conn = connections[session.id]
                      const isActive = session.id === activeSessionId

                      return (
                        <button
                          key={session.id}
                          onClick={() => {
                            setActiveSession(session.id)
                            if (activeWorkspaceId) {
                              navigate(`/workspaces/${activeWorkspaceId}`)
                            }
                          }}
                          title={session.title ? undefined : session.id}
                          className={cn(
                            'w-full flex items-center gap-2 px-2 py-2 rounded-lg text-sm transition-colors',
                            isActive
                              ? 'bg-accent/10 text-accent'
                              : 'text-muted-foreground hover:bg-secondary hover:text-foreground',
                          )}
                        >
                          <StatusDot status={conn?.status ?? 'disconnected'} />
                          <span className="truncate text-xs flex-1 text-left">
                            {session.title || 'New Session'}
                          </span>
                          {conn?.isStreaming && (
                            <span className="w-2 h-2 rounded-full bg-success animate-pulse shrink-0" />
                          )}
                        </button>
                      )
                    })
                  )}
                </div>
              </CollapsibleContent>
            </Collapsible>

            <Collapsible defaultOpen className="group rounded-lg border border-border/60 bg-background/20">
              <CollapsibleTrigger className="flex w-full items-center gap-2 px-2 py-2 text-left hover:bg-secondary/50 transition-colors">
                <History size={13} className="text-foreground/40" />
                <span className="text-xs font-medium uppercase tracking-wider text-foreground/40">
                  Previous
                </span>
                <span className="ml-auto rounded-full border border-border px-1.5 py-0.5 text-2xs text-muted-foreground">
                  {historicalSessions.length}
                </span>
                <ChevronDown
                  size={14}
                  className="text-foreground/40 transition-transform group-data-[state=open]:rotate-180"
                />
              </CollapsibleTrigger>
              <CollapsibleContent className="overflow-hidden data-[state=open]:animate-collapsible-down data-[state=closed]:animate-collapsible-up">
                <div className="space-y-0.5 px-2 pb-2">
                  {historicalSessions.length === 0 ? (
                    <p className="px-2 py-2 text-xs text-foreground/40">No previous sessions</p>
                  ) : (
                    historicalSessions.map((session) => (
                      <button
                        key={session.id}
                        onClick={() => {
                          setActiveSession(session.id)
                          if (activeWorkspaceId) {
                            navigate(`/workspaces/${activeWorkspaceId}`)
                          }
                        }}
                        title={session.title ? undefined : session.id}
                        className={cn(
                          'w-full flex items-center gap-2 rounded-lg px-2 py-2 text-left transition-colors',
                          session.id === activeSessionId
                            ? 'bg-accent/10 text-accent'
                            : 'text-muted-foreground hover:bg-secondary hover:text-foreground',
                        )}
                      >
                        <span className="w-2 h-2 rounded-full bg-foreground/20 shrink-0" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs">{session.title || 'New Session'}</p>
                          <p className="text-2xs uppercase tracking-wide text-foreground/35">
                            History only
                          </p>
                        </div>
                      </button>
                    ))
                  )}
                </div>
              </CollapsibleContent>
            </Collapsible>
          </div>
        )}
      </nav>

      {/* Footer */}
      <div className="p-2 border-t border-border shrink-0">
        <button
          onClick={() => {
            // Navigate to the workspace view and open the AddSessionDialog via modal param
            if (activeWorkspaceId) {
              navigate(`/workspaces/${activeWorkspaceId}?modal=new-session`)
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
