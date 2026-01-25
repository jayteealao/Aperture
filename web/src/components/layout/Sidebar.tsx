import { NavLink, useNavigate } from 'react-router-dom'
import { cn } from '@/utils/cn'
import { useAppStore } from '@/stores/app'
import { useSessionsStore } from '@/stores/sessions'
import {
  MessageSquare,
  Folder,
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
import { Button } from '@/components/ui/Button'

interface SidebarProps {
  className?: string
}

export function Sidebar({ className }: SidebarProps) {
  const navigate = useNavigate()
  const { sidebarOpen, setSidebarOpen, theme, toggleTheme, toggleCommandPalette } = useAppStore()
  const { sessions, connections, activeSessionId, setActiveSession } = useSessionsStore()

  const navItems = [
    { to: '/workspace', icon: MessageSquare, label: 'Workspace' },
    { to: '/workspaces', icon: GitBranch, label: 'Workspaces' },
    { to: '/sessions', icon: Folder, label: 'Sessions' },
    { to: '/credentials', icon: Key, label: 'Credentials' },
    { to: '/settings', icon: Settings, label: 'Settings' },
    { to: '/help', icon: HelpCircle, label: 'Help' },
  ]

  return (
    <>
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed lg:static inset-y-0 left-0 z-50 w-64 flex flex-col',
          'bg-[var(--color-bg-secondary)] border-r border-[var(--color-border)]',
          'transform transition-transform duration-200 ease-out lg:translate-x-0',
          !sidebarOpen && '-translate-x-full',
          className
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-[var(--color-border)]">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-accent flex items-center justify-center">
              <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="9" />
                <circle cx="12" cy="12" r="4" />
              </svg>
            </div>
            <span className="font-semibold text-[var(--color-text-primary)]">Aperture</span>
          </div>
          <button
            onClick={() => setSidebarOpen(false)}
            className="p-1.5 rounded-lg hover:bg-[var(--color-surface)] lg:hidden"
            aria-label="Close sidebar"
          >
            <X size={18} />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto p-2">
          {/* New Session button */}
          <Button
            variant="primary"
            className="w-full mb-3 justify-start"
            onClick={() => {
              navigate('/sessions/new')
              setSidebarOpen(false)
            }}
            leftIcon={<Plus size={18} />}
          >
            New Session
          </Button>

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
                      : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-surface)] hover:text-[var(--color-text-primary)]'
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
              <span className="text-xs font-medium uppercase tracking-wider text-[var(--color-text-muted)]">
                Sessions
              </span>
              <button
                onClick={() => {
                  navigate('/sessions/new')
                  setSidebarOpen(false)
                }}
                className="p-1 rounded hover:bg-[var(--color-surface)] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
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
                      navigate('/workspace')
                      setSidebarOpen(false)
                    }}
                    className={cn(
                      'w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors',
                      isActive
                        ? 'bg-accent/10 text-accent'
                        : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-surface)] hover:text-[var(--color-text-primary)]'
                    )}
                  >
                    <StatusDot status={conn?.status || 'disconnected'} />
                    <span className="truncate font-mono text-xs flex-1 text-left">
                      {session.id.slice(0, 8)}
                    </span>
                    {hasUnread && (
                      <span className="w-2 h-2 rounded-full bg-accent animate-pulse" />
                    )}
                  </button>
                )
              })}
              {sessions.length === 0 && (
                <p className="px-3 py-2 text-xs text-[var(--color-text-muted)]">
                  No active sessions
                </p>
              )}
              {sessions.length > 8 && (
                <button
                  onClick={() => {
                    navigate('/sessions')
                    setSidebarOpen(false)
                  }}
                  className="w-full px-3 py-1 text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]"
                >
                  View all ({sessions.length})
                </button>
              )}
            </div>
          </div>
        </nav>

        {/* Footer */}
        <div className="p-3 border-t border-[var(--color-border)]">
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

function StatusDot({ status }: { status: string }) {
  const colors: Record<string, string> = {
    connected: 'bg-success',
    connecting: 'bg-warning animate-pulse',
    reconnecting: 'bg-warning animate-pulse',
    disconnected: 'bg-[var(--color-text-muted)]',
    error: 'bg-danger',
    ended: 'bg-[var(--color-text-muted)]',
  }

  return <span className={cn('w-2 h-2 rounded-full shrink-0', colors[status] || colors.disconnected)} />
}
