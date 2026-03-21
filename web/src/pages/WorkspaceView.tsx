// Workspace detail view at /workspaces/:id.
// Sessions shown are scoped to this workspace by canonical workspaceId.
// "Add session" only asks for agent type + auth — the repo is the workspace's
// repoRoot, determined by the workspaceId passed to createSession.

import { useState, useEffect, useMemo, useRef } from 'react'
import { useParams, useSearchParams } from 'react-router'
import { cn } from '@/utils/cn'
import { api } from '@/api/client'
import { useSessionsStore } from '@/stores/sessions'
import { useAppStore } from '@/stores/app'
import { WorkspaceChatPane } from '@/components/session/WorkspaceChatPane'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { InputField } from '@/components/ui/input-field'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from 'sonner'
import type { AgentType, AuthMode, Session } from '@/api/types'
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react'

// ── AddSessionDialog ───────────────────────────────────────────────────────
// Focused dialog: only agent type + auth. Repo is already known from the
// workspace context — showing a RepoSelector here would be misleading.

function AgentCard({
  label,
  description,
  selected,
  onClick,
}: {
  label: string
  description: string
  selected: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'p-4 rounded-xl border-2 text-left transition-colors w-full',
        selected
          ? 'border-accent bg-accent/10 text-foreground'
          : 'border-border hover:border-accent/40 text-muted-foreground hover:text-foreground',
      )}
    >
      <p className="font-semibold text-sm">{label}</p>
      <p className="text-xs mt-0.5 opacity-70">{description}</p>
    </button>
  )
}

function AddSessionDialog({
  open,
  workspaceId,
  onClose,
  onCreated,
}: {
  open: boolean
  workspaceId: string
  onClose: () => void
  onCreated: (session: Session) => void
}) {
  const { addSession } = useSessionsStore()
  const [agentType, setAgentType] = useState<AgentType>('claude_sdk')
  const [authMode, setAuthMode] = useState<AuthMode>('oauth')
  const [apiKey, setApiKey] = useState('')
  const [isCreating, setIsCreating] = useState(false)

  useEffect(() => {
    if (!open) {
      setAgentType('claude_sdk')
      setAuthMode('oauth')
      setApiKey('')
    }
  }, [open])

  async function handleCreate() {
    setIsCreating(true)
    try {
      const session = await api.createSession({
        agent: agentType,
        auth: {
          mode: authMode,
          apiKeyRef: authMode === 'api_key' ? 'inline' : 'none',
          apiKey: authMode === 'api_key' ? apiKey : undefined,
        },
        workspaceId,
      })
      const nextSession = { id: session.id, agent: session.agent, status: session.status, workspaceId: session.workspaceId ?? workspaceId }
      await addSession(nextSession)
      toast.success('Session created', { description: `Session ${session.id.slice(0, 8)} ready` })
      onCreated(nextSession)
    } catch (err) {
      toast.error('Failed to create session', {
        description: err instanceof Error ? err.message : 'Unknown error',
      })
    } finally {
      setIsCreating(false)
    }
  }

  const canCreate = authMode !== 'api_key' || !!apiKey.trim()

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New Session</DialogTitle>
        </DialogHeader>

        <div className="space-y-5 pt-1">
          {/* Agent type */}
          <div className="space-y-1.5">
            <p className="text-sm font-medium text-muted-foreground">Agent</p>
            <div className="grid grid-cols-2 gap-3">
              <AgentCard
                label="Claude SDK"
                description="Claude AI via Anthropic SDK"
                selected={agentType === 'claude_sdk'}
                onClick={() => setAgentType('claude_sdk')}
              />
              <AgentCard
                label="Pi"
                description="Pi agent runtime"
                selected={agentType === 'pi_sdk'}
                onClick={() => setAgentType('pi_sdk')}
              />
            </div>
          </div>

          {/* Auth */}
          <div className="space-y-1.5">
            <p className="text-sm font-medium text-muted-foreground">Authentication</p>
            <Select value={authMode} onValueChange={(v) => setAuthMode(v as AuthMode)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="oauth">OAuth (pre-authenticated)</SelectItem>
                <SelectItem value="api_key">API Key</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {authMode === 'api_key' && (
            <InputField
              label="API Key"
              type="password"
              placeholder="Enter your API key"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              hint="Sent securely to the gateway"
            />
          )}

          <div className="flex justify-end gap-3 pt-2">
            <Button variant="ghost" onClick={onClose} disabled={isCreating}>
              Cancel
            </Button>
            <Button
              variant="default"
              onClick={handleCreate}
              loading={isCreating}
              disabled={!canCreate}
            >
              Create Session
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ── WorkspaceView ──────────────────────────────────────────────────────────

export default function WorkspaceView() {
  const { id } = useParams<{ id: string }>()
  const [searchParams, setSearchParams] = useSearchParams()
  const sessions = useSessionsStore((s) => s.sessions)
  const addSession = useSessionsStore((s) => s.addSession)
  const activeSessionId = useSessionsStore((s) => s.activeSessionId)
  const setActiveSession = useSessionsStore((s) => s.setActiveSession)
  const { setActiveWorkspaceId, setWorkspacePanelOpen } = useAppStore()

  const [showAddSession, setShowAddSession] = useState(false)
  const mobileScrollRef = useRef<HTMLDivElement | null>(null)
  const [mobileIndex, setMobileIndex] = useState(0)

  // Keep rail + panel in sync when navigating directly to this URL.
  useEffect(() => {
    if (!id) return
    setActiveWorkspaceId(id)
    setWorkspacePanelOpen(true)
  }, [id, setActiveWorkspaceId, setWorkspacePanelOpen])

  useEffect(() => {
    if (searchParams.get('modal') === 'new-session') {
      setShowAddSession(true)
    }
  }, [searchParams])

  useEffect(() => {
    if (!id) return

    let cancelled = false

    void (async () => {
      try {
        const response = await api.listWorkspaceCheckouts(id)
        const sessionIds = Array.from(
          new Set(
            response.checkouts
              .map((checkout) => checkout.sessionId)
              .filter((sessionId): sessionId is string => !!sessionId),
          ),
        )

        const existingById = new Map(sessions.map((session) => [session.id, session]))
        const missingOrStale = sessionIds.filter((sessionId) => {
          const existing = existingById.get(sessionId)
          return !existing || existing.workspaceId !== id
        })

        if (missingOrStale.length === 0) {
          return
        }

        const loadedSessions = await Promise.all(
          missingOrStale.map(async (sessionId) => {
            try {
              return await api.getSession(sessionId)
            } catch {
              return null
            }
          }),
        )

        for (const session of loadedSessions) {
          if (!session || cancelled) continue
          await addSession({
            ...session,
            workspaceId: session.workspaceId ?? id,
          })
        }
      } catch (error) {
        if (import.meta.env.DEV) {
          console.warn('[WorkspaceView] Failed to hydrate workspace sessions from checkouts', error)
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [id, sessions, addSession])

  const workspaceSessions = id
    ? sessions.filter((s) => s.workspaceId === id)
    : []

  const liveWorkspaceSessions = workspaceSessions.filter(
    (session) =>
      session.status.running ||
      !!session.status.isResumable,
  )

  const historicalWorkspaceSessions = workspaceSessions.filter(
    (session) =>
      !session.status.running &&
      !session.status.isResumable,
  )

  const selectedHistoricalSession =
    historicalWorkspaceSessions.find((session) => session.id === activeSessionId) ?? null

  const visibleWorkspaceSessions = selectedHistoricalSession
    ? [...liveWorkspaceSessions, selectedHistoricalSession]
    : liveWorkspaceSessions

  const mobileItems = useMemo(
    () => [
      ...visibleWorkspaceSessions.map((session) => ({
        kind: 'session' as const,
        key: session.id,
        session,
      })),
      {
        kind: 'new' as const,
        key: 'new-session',
      },
    ],
    [visibleWorkspaceSessions],
  )

  useEffect(() => {
    if (mobileItems.length <= 1) {
      setMobileIndex(0)
      return
    }

    const activeIndex = visibleWorkspaceSessions.findIndex((session) => session.id === activeSessionId)
    if (activeIndex >= 0) {
      setMobileIndex(activeIndex)
    }
  }, [activeSessionId, mobileItems.length, visibleWorkspaceSessions])

  const scrollToMobileItem = (nextIndex: number) => {
    const container = mobileScrollRef.current
    if (!container) return
    const clamped = Math.max(0, Math.min(nextIndex, mobileItems.length - 1))
    const child = container.children.item(clamped) as HTMLElement | null
    if (!child) return
    child.scrollIntoView({ behavior: 'smooth', inline: 'start', block: 'nearest' })
    setMobileIndex(clamped)
    const target = mobileItems[clamped]
    if (target?.kind === 'session') {
      setActiveSession(target.session.id)
    }
  }

  const handleMobileScroll = () => {
    const container = mobileScrollRef.current
    if (!container) return
    const children = Array.from(container.children) as HTMLElement[]
    if (children.length === 0) return
    const viewportCenter = container.scrollLeft + container.clientWidth / 2
    let bestIndex = 0
    let bestDistance = Number.POSITIVE_INFINITY

    children.forEach((child, index) => {
      const center = child.offsetLeft + child.clientWidth / 2
      const distance = Math.abs(center - viewportCenter)
      if (distance < bestDistance) {
        bestDistance = distance
        bestIndex = index
      }
    })

    if (bestIndex !== mobileIndex) {
      setMobileIndex(bestIndex)
      const target = mobileItems[bestIndex]
      if (target?.kind === 'session') {
        setActiveSession(target.session.id)
      }
    }
  }

  const handleSessionCreated = () => {
    setShowAddSession(false)
    if (searchParams.get('modal') === 'new-session') {
      setSearchParams({}, { replace: true })
    }
    // The new session appears automatically — addSession updates the store,
    // workspaceSessions re-derives, and the new pane mounts + auto-connects.
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Mobile session carousel */}
      <div className="relative flex flex-1 flex-col min-h-0 md:hidden">
          <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-6 bg-gradient-to-r from-background to-transparent" />
          <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-8 bg-gradient-to-l from-background to-transparent" />

          <div
            ref={mobileScrollRef}
            onScroll={handleMobileScroll}
            className="flex flex-1 snap-x snap-mandatory gap-3 overflow-x-auto px-3 py-3 min-h-0 scroll-smooth"
          >
            {mobileItems.map((item) =>
              item.kind === 'session' ? (
                <div
                  key={item.key}
                  className="w-[calc(100vw-1.5rem)] shrink-0 snap-center rounded-xl border border-border bg-card overflow-hidden"
                >
                  <WorkspaceChatPane sessionId={item.session.id} />
                </div>
              ) : (
                <button
                  key={item.key}
                  onClick={() => setShowAddSession(true)}
                  className={cn(
                    'w-[calc(100vw-4rem)] shrink-0 snap-center rounded-2xl border-2 border-dashed border-border',
                    'flex flex-col items-center justify-center gap-3 bg-card/50 text-muted-foreground/60',
                    'hover:border-accent/50 hover:bg-accent/5 hover:text-accent transition-colors',
                  )}
                >
                  <Plus size={28} />
                  <span className="text-sm font-medium">New session</span>
                </button>
              ),
            )}
          </div>

          {mobileItems.length > 1 && (
            <div className="flex items-center justify-between gap-3 px-4 pb-3 pt-1">
              <Button
                variant="ghost"
                size="sm"
                className="px-2"
                onClick={() => scrollToMobileItem(mobileIndex - 1)}
                disabled={mobileIndex === 0}
              >
                <ChevronLeft size={16} />
              </Button>
              <div className="flex items-center gap-2">
                {mobileItems.map((item, index) => (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => scrollToMobileItem(index)}
                    className={cn(
                      'h-2.5 rounded-full transition-all',
                      index === mobileIndex ? 'w-6 bg-accent' : 'w-2.5 bg-border',
                    )}
                    aria-label={`Go to item ${index + 1}`}
                  />
                ))}
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="px-2"
                onClick={() => scrollToMobileItem(mobileIndex + 1)}
                disabled={mobileIndex === mobileItems.length - 1}
              >
                <ChevronRight size={16} />
              </Button>
            </div>
          )}
      </div>

      {/* Desktop session grid or empty state */}
      <div className="hidden md:flex md:flex-1 md:flex-col md:min-h-0">
      {visibleWorkspaceSessions.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="flex flex-col items-center justify-center gap-4 text-center">
            {historicalWorkspaceSessions.length > 0 && (
              <div className="max-w-sm space-y-1">
                <p className="text-sm font-medium text-foreground">
                  No live sessions in this workspace
                </p>
                <p className="text-xs text-muted-foreground">
                  Previous sessions have moved into the workspace sidebar. Start a new session to open a live pane here.
                </p>
              </div>
            )}
            <button
              onClick={() => setShowAddSession(true)}
              className={cn(
                'flex flex-col items-center justify-center gap-3',
                'w-48 h-48 rounded-2xl',
                'border-2 border-dashed border-border',
                'hover:border-accent/50 hover:bg-accent/5',
                'text-muted-foreground/60 hover:text-accent',
                'transition-colors',
              )}
            >
              <Plus size={28} />
              <span className="text-sm font-medium">New session</span>
            </button>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col min-h-0">
          <div className="flex flex-1 gap-3 p-3 overflow-x-auto min-h-0">
            {visibleWorkspaceSessions.map((session) => (
              <div
                key={session.id}
                className="min-w-[480px] flex-1 h-full min-h-0 flex flex-col rounded-xl border border-border bg-card overflow-hidden"
              >
                <WorkspaceChatPane sessionId={session.id} />
              </div>
            ))}
            <button
              onClick={() => setShowAddSession(true)}
              className={cn(
                'min-w-[140px] w-36 h-full shrink-0 flex flex-col items-center justify-center gap-2',
                'rounded-xl border-2 border-dashed border-border',
                'hover:border-accent/50 hover:bg-accent/5',
                'text-muted-foreground/50 hover:text-accent',
                'transition-colors',
              )}
            >
              <Plus size={20} />
              <span className="text-xs font-medium">New session</span>
            </button>
          </div>
        </div>
      )}
      </div>

      {/* Add session dialog — scoped to this workspace */}
      {id && (
        <AddSessionDialog
          open={showAddSession}
          workspaceId={id}
          onClose={() => {
            setShowAddSession(false)
            if (searchParams.get('modal') === 'new-session') {
              setSearchParams({}, { replace: true })
            }
          }}
          onCreated={handleSessionCreated}
        />
      )}
    </div>
  )
}
