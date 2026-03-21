import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { cn } from '@/utils/cn'
import { ArrowLeft, ChevronRight, FolderPlus, History, Plus, Wifi, WifiOff } from 'lucide-react'
import type { Session, WorkspaceRecord } from '@/api/types'

interface MobileNavSheetProps {
  kind: 'workspaces' | 'sessions'
  open: boolean
  title: string
  workspaces?: WorkspaceRecord[]
  sessions?: Session[]
  activeWorkspaceId?: string | null
  activeSessionId?: string | null
  onClose: () => void
  onWorkspaceSelect: (workspaceId: string) => void
  onSessionSelect: (sessionId: string) => void
  onPrimaryAction?: () => void
  primaryActionLabel?: string
}

function SheetHeader({
  title,
  onBack,
  onPrimaryAction,
  primaryActionLabel,
}: {
  title: string
  onBack: () => void
  onPrimaryAction?: () => void
  primaryActionLabel?: string
}) {
  return (
    <DialogHeader className="space-y-0 border-b border-border px-4 py-3">
      <div className="flex items-center justify-between gap-3 pr-0">
        <Button variant="ghost" size="sm" className="px-2" onClick={onBack}>
          <ArrowLeft size={16} />
          <span>Back</span>
        </Button>
        <DialogTitle className="text-base">{title}</DialogTitle>
        {onPrimaryAction && primaryActionLabel ? (
          <Button variant="ghost" size="sm" className="px-2" onClick={onPrimaryAction}>
            {primaryActionLabel === 'New' ? <Plus size={16} /> : <FolderPlus size={16} />}
            <span>{primaryActionLabel}</span>
          </Button>
        ) : (
          <div className="w-14 shrink-0" />
        )}
      </div>
    </DialogHeader>
  )
}

export function MobileNavSheet({
  kind,
  open,
  title,
  workspaces = [],
  sessions = [],
  activeWorkspaceId = null,
  activeSessionId = null,
  onClose,
  onWorkspaceSelect,
  onSessionSelect,
  onPrimaryAction,
  primaryActionLabel,
}: MobileNavSheetProps) {
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent
        hideClose
        className={cn(
          'top-auto bottom-0 left-0 right-0 z-50 mx-0 w-auto max-w-none translate-x-0 translate-y-0 rounded-b-none rounded-t-3xl p-0',
          'h-[min(70dvh,34rem)] border border-border bg-card shadow-2xl',
          'data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom',
          'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
        )}
      >
        <SheetHeader
          title={title}
          onBack={onClose}
          onPrimaryAction={onPrimaryAction}
          primaryActionLabel={primaryActionLabel}
        />

        <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-3">
          {kind === 'workspaces' ? (
            <div className="space-y-2">
              {workspaces.length === 0 ? (
                <p className="px-3 py-6 text-center text-sm text-muted-foreground">
                  No workspaces yet
                </p>
              ) : (
                workspaces.map((workspace) => {
                  const isActive = workspace.id === activeWorkspaceId
                  return (
                    <button
                      key={workspace.id}
                      onClick={() => onWorkspaceSelect(workspace.id)}
                      className={cn(
                        'flex w-full items-center gap-3 rounded-2xl border px-4 py-3 text-left transition-colors',
                        isActive
                          ? 'border-accent bg-accent/10 text-foreground'
                          : 'border-border bg-background/40 text-foreground hover:bg-secondary',
                      )}
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold">{workspace.name}</p>
                        <p className="truncate text-xs text-muted-foreground">{workspace.repoRoot}</p>
                      </div>
                      <ChevronRight size={16} className="shrink-0 text-muted-foreground" />
                    </button>
                  )
                })
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {sessions.length === 0 ? (
                <p className="px-3 py-6 text-center text-sm text-muted-foreground">
                  No sessions for this workspace
                </p>
              ) : (
                <>
                  <div className="space-y-2">
                    <p className="px-2 text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
                      Live
                    </p>
                    {sessions
                      .filter((session) => session.status.running || !!session.status.isResumable)
                      .map((session) => (
                        <button
                          key={session.id}
                          onClick={() => onSessionSelect(session.id)}
                          className={cn(
                            'flex w-full items-center gap-3 rounded-2xl border px-4 py-3 text-left transition-colors',
                            session.id === activeSessionId
                              ? 'border-accent bg-accent/10 text-foreground'
                              : 'border-border bg-background/40 text-foreground hover:bg-secondary',
                          )}
                        >
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-success/10 text-success">
                            <Wifi size={14} />
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="truncate font-mono text-sm">{session.id.slice(0, 8)}</p>
                            <p className="truncate text-xs text-muted-foreground">
                              {session.status.workingDirectory ?? 'Workspace session'}
                            </p>
                          </div>
                          <ChevronRight size={16} className="shrink-0 text-muted-foreground" />
                        </button>
                      ))}
                  </div>

                  <div className="space-y-2">
                    <p className="flex items-center gap-2 px-2 text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
                      <History size={12} />
                      Previous
                    </p>
                    {sessions
                      .filter((session) => !session.status.running && !session.status.isResumable)
                      .map((session) => (
                        <button
                          key={session.id}
                          onClick={() => onSessionSelect(session.id)}
                          className={cn(
                            'flex w-full items-center gap-3 rounded-2xl border px-4 py-3 text-left transition-colors',
                            session.id === activeSessionId
                              ? 'border-accent bg-accent/10 text-foreground'
                              : 'border-border bg-background/40 text-foreground hover:bg-secondary',
                          )}
                        >
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                            <WifiOff size={14} />
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="truncate font-mono text-sm">{session.id.slice(0, 8)}</p>
                            <p className="truncate text-xs text-muted-foreground">History only</p>
                          </div>
                          <ChevronRight size={16} className="shrink-0 text-muted-foreground" />
                        </button>
                      ))}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
