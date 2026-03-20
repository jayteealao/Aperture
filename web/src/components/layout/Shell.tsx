import { Outlet, useLocation } from 'react-router'
import { useEffect } from 'react'
import { Sidebar } from './Sidebar'
import { SidebarRail } from './SidebarRail'
import { WorkspacePanel } from './WorkspacePanel'
import { Topbar } from './Topbar'
import { CommandPalette } from './CommandPalette'
import { Toaster } from '@/components/ui/Toaster'
import { useAppStore } from '@/stores/app'
import { useSessionsStore } from '@/stores/sessions'
import { api } from '@/api/client'

export function Shell() {
  const { commandPaletteOpen, setCommandPaletteOpen, setWorkspacePanelOpen, gatewayUrl, apiToken } = useAppStore()
  const { restoreFromStorage } = useSessionsStore()
  const location = useLocation()

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

  return (
    <div className="h-screen flex bg-gradient-mesh overflow-hidden">
      {/* Mobile overlay drawer — hidden on lg+, opened via Topbar hamburger */}
      <Sidebar />
      {/* Desktop: narrow icon rail + closable workspace context panel */}
      <SidebarRail />
      <WorkspacePanel />
      <div className="flex-1 flex flex-col min-w-0">
        <Topbar />
        <main className="flex-1 overflow-hidden">
          <Outlet />
        </main>
      </div>
      <CommandPalette
        open={commandPaletteOpen}
        onClose={() => setCommandPaletteOpen(false)}
      />
      <Toaster />
    </div>
  )
}
