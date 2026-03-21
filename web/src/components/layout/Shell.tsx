import { Outlet, useLocation, useNavigate } from 'react-router'
import { useEffect, useMemo, useState } from 'react'
import { Sidebar } from './Sidebar'
import { SidebarRail } from './SidebarRail'
import { WorkspacePanel } from './WorkspacePanel'
import { Topbar } from './Topbar'
import { MobileBottomBar } from './MobileBottomBar'
import { MobileNavSheet } from './MobileNavSheet'
import { CommandPalette } from './CommandPalette'
import { Toaster } from '@/components/ui/Toaster'
import { useAppStore } from '@/stores/app'
import { useSessionsStore } from '@/stores/sessions'
import { api } from '@/api/client'
import { useWorkspaces } from '@/hooks/useWorkspaces'

export function Shell() {
  const navigate = useNavigate()
  const {
    commandPaletteOpen,
    setCommandPaletteOpen,
    setWorkspacePanelOpen,
    setActiveWorkspaceId,
    activeWorkspaceId,
    gatewayUrl,
    apiToken,
  } = useAppStore()
  const { restoreFromStorage, sessions, activeSessionId, setActiveSession } = useSessionsStore()
  const { workspaces } = useWorkspaces()
  const location = useLocation()
  const [mobileSheet, setMobileSheet] = useState<'workspaces' | 'sessions' | null>(null)

  useEffect(() => {
    if (gatewayUrl && apiToken) {
      api.configure(gatewayUrl, apiToken)
    }
  }, [gatewayUrl, apiToken])

  // Restore sessions from storage on mount (only run once)
  useEffect(() => {
    restoreFromStorage()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Close the workspace panel when navigating away from a workspace detail page.
  // Opening is handled by WorkspaceView's own mount effect (setWorkspacePanelOpen(true)).
  useEffect(() => {
    if (!location.pathname.startsWith('/workspaces/')) {
      setWorkspacePanelOpen(false)
    }
  }, [location.pathname, setWorkspacePanelOpen])

  useEffect(() => {
    setMobileSheet(null)
  }, [location.pathname])

  // Keyboard shortcuts
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Command palette: Cmd+K or Ctrl+K
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setCommandPaletteOpen(!commandPaletteOpen)
      }
      // Close command palette: Escape
      if (e.key === 'Escape' && commandPaletteOpen) {
        setCommandPaletteOpen(false)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [commandPaletteOpen, setCommandPaletteOpen])

  const mobileSessions = useMemo(() => {
    if (!activeWorkspaceId) {
      return sessions
    }
    return sessions.filter((session) => session.workspaceId === activeWorkspaceId)
  }, [activeWorkspaceId, sessions])

  return (
    <div className="h-screen flex bg-gradient-mesh overflow-hidden">
      {/* Legacy mobile drawer is kept mounted but no longer triggered by the shell. */}
      <Sidebar />
      {/* Desktop: narrow icon rail + closable workspace context panel */}
      <SidebarRail />
      <WorkspacePanel />
      <div className="flex-1 flex flex-col min-w-0">
        <Topbar />
        <main className="flex-1 overflow-hidden pb-[calc(4.5rem+env(safe-area-inset-bottom))] md:pb-0">
          <Outlet />
        </main>
      </div>
      <MobileNavSheet
        kind="workspaces"
        open={mobileSheet === 'workspaces'}
        title="Workspaces"
        workspaces={workspaces}
        activeWorkspaceId={activeWorkspaceId}
        onClose={() => setMobileSheet(null)}
        onWorkspaceSelect={(workspaceId) => {
          setActiveWorkspaceId(workspaceId)
          navigate(`/workspaces/${workspaceId}`)
          setMobileSheet(null)
        }}
        onSessionSelect={() => {}}
        onPrimaryAction={() => {
          navigate('/workspaces?modal=new-workspace')
          setMobileSheet(null)
        }}
        primaryActionLabel="New"
      />
      <MobileNavSheet
        kind="sessions"
        open={mobileSheet === 'sessions'}
        title="Sessions"
        sessions={mobileSessions}
        activeWorkspaceId={activeWorkspaceId}
        activeSessionId={activeSessionId}
        onClose={() => setMobileSheet(null)}
        onWorkspaceSelect={() => {}}
        onSessionSelect={(sessionId) => {
          const session = sessions.find((item) => item.id === sessionId)
          setActiveSession(sessionId)
          if (session?.workspaceId) {
            setActiveWorkspaceId(session.workspaceId)
            navigate(`/workspaces/${session.workspaceId}`)
          } else {
            navigate('/workspaces')
          }
          setMobileSheet(null)
        }}
        onPrimaryAction={
          activeWorkspaceId
            ? () => {
                navigate(`/workspaces/${activeWorkspaceId}?modal=new-session`)
                setMobileSheet(null)
              }
            : undefined
        }
        primaryActionLabel={activeWorkspaceId ? 'New' : undefined}
      />
      <MobileBottomBar
        activePath={location.pathname}
        openSheet={mobileSheet}
        onOpenWorkspaces={() => setMobileSheet('workspaces')}
        onOpenSessions={() => setMobileSheet('sessions')}
        onOpenSettings={() => {
          setMobileSheet(null)
          navigate('/settings')
        }}
        onOpenCredentials={() => {
          setMobileSheet(null)
          navigate('/credentials')
        }}
        onOpenHelp={() => {
          setMobileSheet(null)
          navigate('/help')
        }}
        onCloseSheet={() => setMobileSheet(null)}
        onPrimaryAction={
          mobileSheet === 'workspaces'
            ? () => {
                navigate('/workspaces?modal=new-workspace')
                setMobileSheet(null)
              }
            : mobileSheet === 'sessions' && activeWorkspaceId
              ? () => {
                  navigate(`/workspaces/${activeWorkspaceId}?modal=new-session`)
                  setMobileSheet(null)
                }
              : undefined
        }
        primaryActionLabel={
          mobileSheet === 'workspaces'
            ? 'New'
            : mobileSheet === 'sessions' && activeWorkspaceId
              ? 'New'
              : undefined
        }
      />
      <CommandPalette
        open={commandPaletteOpen}
        onClose={() => setCommandPaletteOpen(false)}
      />
      <Toaster />
    </div>
  )
}
