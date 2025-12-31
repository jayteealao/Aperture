import { Outlet } from 'react-router-dom'
import { useEffect } from 'react'
import { Sidebar } from './Sidebar'
import { Topbar } from './Topbar'
import { CommandPalette } from './CommandPalette'
import { ToastProvider } from '@/components/ui/Toast'
import { useAppStore } from '@/stores/app'
import { useSessionsStore } from '@/stores/sessions'
import { api } from '@/api/client'

export function Shell() {
  const { commandPaletteOpen, setCommandPaletteOpen, gatewayUrl, apiToken } = useAppStore()
  const { restoreFromStorage, sessions, connectSession } = useSessionsStore()

  // Restore sessions from storage on mount (only run once)
  useEffect(() => {
    restoreFromStorage()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Connect to active sessions when sessions list changes
  useEffect(() => {
    // Configure API client
    if (gatewayUrl && apiToken) {
      api.configure(gatewayUrl, apiToken)
    }

    // Connect to all sessions (up to a limit)
    const sessionsToConnect = sessions.slice(0, 5)
    sessionsToConnect.forEach((session) => {
      connectSession(session.id)
    })
    // sessions.length is intentionally used to avoid re-connecting on every session update
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessions.length, gatewayUrl, apiToken])

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
    <ToastProvider>
      <div className="h-screen flex bg-gradient-mesh overflow-hidden">
        <Sidebar />
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
      </div>
    </ToastProvider>
  )
}
