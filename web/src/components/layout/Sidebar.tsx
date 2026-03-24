import { NavLink, useNavigate } from 'react-router'
import { cn } from '@/utils/cn'
import { useAppStore } from '@/stores/app'
import { useSessionsStore } from '@/stores/sessions'
import {
  Key,
  Settings,
  HelpCircle,
  Plus,
  X,
  Moon,
  Sun,
  Command,
  GitBranch,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { StatusDot } from '@/components/ui/status-dot'

interface SidebarProps {
  className?: string
}

export function Sidebar({ className }: SidebarProps) {
  const navigate = useNavigate()
  const { sidebarOpen, setSidebarOpen, theme, toggleTheme, toggleCommandPalette } = useAppStore()
  const { sessions, connections, activeSessionId, setActiveSession } = useSessionsStore()

  const navItems = [
    { to: '/workspaces', icon: GitBranch, label: 'Workspaces' },
    { to: '/credentials', icon: Key, label: 'Credentials' },
    { to: '/settings', icon: Settings, label: 'Settings' },
    { to: '/help', icon: HelpCircle, label: 'Help' },
  ]

  return (
    <>
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 w-64 flex flex-col md:hidden',
          'bg-card border-r border-border',
          'transform transition-transform duration-200 ease-out md:translate-x-0',
          !sidebarOpen && '-translate-x-full',
          className
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-accent flex items-center justify-center">
              <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="9" />
                <circle cx="12" cy="12" r="4" />
              </svg>
            </div>
            <span className="font-semibold text-foreground">Aperture</span>
          </div>
          <button
            onClick={() => setSidebarOpen(false)}
            className="p-1.5 rounded-lg hover:bg-secondary md:hidden"
            aria-label="Close sidebar"
          >
            <X size={18} />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto p-2">
          <div className="space-y-1">
            {navItems.map(({ to, icon: Icon, label }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-accent/10 text-accent'
                      : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
                  )
                }
                onClick={() => setSidebarOpen(false)}
              >
                <Icon size={18} />
                {label}
              </NavLink>
            ))}
          </div>

          {/* Sessions section */}
          <div className="mt-6">
            <div className="flex items-center justify-between px-3 mb-2">
              <span className="text-xs font-medium uppercase tracking-wider text-foreground/40">
                Sessions
              </span>
              <button
                onClick={() => {
                  navigate('/workspaces')
                  setSidebarOpen(false)
                }}
                className="p-1 rounded-sm hover:bg-secondary text-foreground/40 hover:text-foreground"
                aria-label="Create new session"
              >
                <Plus size={14} />
              </button>
            </div>
            <div className="space-y-1">
              {sessions.slice(0, 8).map((session) => {
                const conn = connections[session.id]
                const isActive = session.id === activeSessionId
                const hasUnread = conn?.hasUnread

                return (
                  <button
                    key={session.id}
                    onClick={() => {
                      setActiveSession(session.id)
                      navigate(session.workspaceId ? `/workspaces/${session.workspaceId}` : '/workspaces')
                      setSidebarOpen(false)
                    }}
                    title={session.title ? undefined : session.id}
                    className={cn(
                      'w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors',
                      isActive
                        ? 'bg-accent/10 text-accent'
                        : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
                    )}
                  >
                    <StatusDot status={conn?.status ?? 'disconnected'} />
                    <span className="truncate text-xs flex-1 text-left">
                      {session.title || 'New Session'}
                    </span>
                    {conn?.isStreaming && (
                      <span
                        aria-label="Responding"
                        className="w-2 h-2 rounded-full bg-success animate-pulse"
                        role="status"
                        title="Responding"
                      />
                    )}
                    {hasUnread && !conn?.isStreaming && (
                      <span
                        aria-label="Unread messages"
                        className="w-2 h-2 rounded-full bg-accent animate-pulse"
                        role="status"
                        title="Unread messages"
                      />
                    )}
                  </button>
                )
              })}
              {sessions.length === 0 && (
                <p className="px-3 py-2 text-xs text-foreground/40">
                  No active sessions
                </p>
              )}
              {sessions.length > 8 && (
                <button
                  onClick={() => {
                    navigate('/workspaces')
                    setSidebarOpen(false)
                  }}
                  className="w-full px-3 py-1 text-xs text-foreground/40 hover:text-muted-foreground"
                >
                  View all ({sessions.length})
                </button>
              )}
            </div>
          </div>
        </nav>

        {/* Footer */}
        <div className="p-3 border-t border-border">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={toggleTheme}
              className="flex-1 justify-start"
            >
              {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
              <span className="text-xs">{theme === 'dark' ? 'Light' : 'Dark'}</span>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={toggleCommandPalette}
              className="px-2"
              title="Command palette (Cmd+K)"
            >
              <Command size={16} />
            </Button>
          </div>
        </div>
      </aside>
    </>
  )
}
