import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { cn } from '@/utils/cn'
import { useAppStore } from '@/stores/app'
import { useSessionsStore } from '@/stores/sessions'
import {
  Search,
  MessageSquare,
  Folder,
  Key,
  Settings,
  HelpCircle,
  Plus,
  Moon,
  Sun,
  LogOut,
  GitBranch,
} from 'lucide-react'

interface CommandItem {
  id: string
  title: string
  subtitle?: string
  icon: React.ReactNode
  action: () => void
  keywords?: string[]
}

interface CommandPaletteProps {
  open: boolean
  onClose: () => void
}

export function CommandPalette({ open, onClose }: CommandPaletteProps) {
  const navigate = useNavigate()
  const { theme, setTheme, clearStorage } = useAppStore()
  const { sessions, setActiveSession } = useSessionsStore()
  const [search, setSearch] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)

  // Build command list
  const commands = useMemo<CommandItem[]>(() => {
    const items: CommandItem[] = [
      {
        id: 'workspace',
        title: 'Go to Workspace',
        icon: <MessageSquare size={18} />,
        action: () => {
          navigate('/workspace')
          onClose()
        },
        keywords: ['chat', 'home'],
      },
      {
        id: 'sessions',
        title: 'View Sessions',
        icon: <Folder size={18} />,
        action: () => {
          navigate('/sessions')
          onClose()
        },
        keywords: ['list', 'manage'],
      },
      {
        id: 'workspaces',
        title: 'Manage Workspaces',
        icon: <GitBranch size={18} />,
        action: () => {
          navigate('/workspaces')
          onClose()
        },
        keywords: ['repos', 'git'],
      },
      {
        id: 'new-session',
        title: 'New Session',
        subtitle: 'Create a new agent session',
        icon: <Plus size={18} />,
        action: () => {
          navigate('/sessions/new')
          onClose()
        },
        keywords: ['create', 'start'],
      },
      {
        id: 'credentials',
        title: 'Manage Credentials',
        icon: <Key size={18} />,
        action: () => {
          navigate('/credentials')
          onClose()
        },
        keywords: ['api', 'keys', 'secrets'],
      },
      {
        id: 'settings',
        title: 'Settings',
        icon: <Settings size={18} />,
        action: () => {
          navigate('/settings')
          onClose()
        },
        keywords: ['preferences', 'config'],
      },
      {
        id: 'help',
        title: 'Help & Documentation',
        icon: <HelpCircle size={18} />,
        action: () => {
          navigate('/help')
          onClose()
        },
        keywords: ['docs', 'support'],
      },
      {
        id: 'theme',
        title: `Switch to ${theme === 'dark' ? 'Light' : 'Dark'} Theme`,
        icon: theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />,
        action: () => {
          setTheme(theme === 'dark' ? 'light' : 'dark')
          onClose()
        },
        keywords: ['mode', 'appearance'],
      },
      {
        id: 'logout',
        title: 'Disconnect & Clear Data',
        subtitle: 'Clear all local data and reconnect',
        icon: <LogOut size={18} />,
        action: () => {
          clearStorage()
          navigate('/onboarding')
          onClose()
        },
        keywords: ['logout', 'reset', 'clear'],
      },
    ]

    // Add session shortcuts
    sessions.slice(0, 5).forEach((session) => {
      items.push({
        id: `session-${session.id}`,
        title: `Switch to ${session.id.slice(0, 8)}`,
        subtitle: session.agent,
        icon: <MessageSquare size={18} />,
        action: () => {
          setActiveSession(session.id)
          navigate('/workspace')
          onClose()
        },
        keywords: ['session', session.agent, session.id],
      })
    })

    return items
  }, [theme, sessions, navigate, onClose, setTheme, clearStorage, setActiveSession])

  // Filter commands
  const filteredCommands = useMemo(() => {
    if (!search) return commands

    const query = search.toLowerCase()
    return commands.filter((cmd) => {
      const searchText = [cmd.title, cmd.subtitle, ...(cmd.keywords || [])].join(' ').toLowerCase()
      return searchText.includes(query)
    })
  }, [commands, search])

  // Reset selection when search changes
  useEffect(() => {
    setSelectedIndex(0)
  }, [search])

  // Reset when opening
  useEffect(() => {
    if (open) {
      setSearch('')
      setSelectedIndex(0)
    }
  }, [open])

  // Keyboard navigation
  useEffect(() => {
    if (!open) return

    function handleKeyDown(e: KeyboardEvent) {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault()
          setSelectedIndex((i) => Math.min(i + 1, filteredCommands.length - 1))
          break
        case 'ArrowUp':
          e.preventDefault()
          setSelectedIndex((i) => Math.max(i - 1, 0))
          break
        case 'Enter':
          e.preventDefault()
          if (filteredCommands[selectedIndex]) {
            filteredCommands[selectedIndex].action()
          }
          break
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [open, filteredCommands, selectedIndex])

  if (!open) return null

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50 bg-hud-black/80 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Palette */}
      <div className="fixed inset-x-4 top-[20%] z-50 mx-auto max-w-lg">
        <div className="bg-hud-black border border-hud-accent/50 shadow-2xl shadow-hud-accent/10 overflow-hidden">
          {/* Search input */}
          <div className="flex items-center gap-3 px-4 py-3 border-b border-hud-gray/30">
            <Search size={20} className="text-hud-text/50" />
            <input
              type="text"
              placeholder="Type a command or search..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="flex-1 bg-transparent text-hud-text placeholder:text-hud-text/50 outline-none"
              autoFocus
            />
            <kbd className="px-2 py-0.5 text-xs font-mono bg-hud-gray/30 text-hud-text/50">
              esc
            </kbd>
          </div>

          {/* Results */}
          <div className="max-h-80 overflow-y-auto p-2">
            {filteredCommands.length === 0 ? (
              <p className="py-8 text-center text-sm text-hud-text/50">
                No commands found
              </p>
            ) : (
              filteredCommands.map((cmd, index) => (
                <button
                  key={cmd.id}
                  onClick={cmd.action}
                  onMouseEnter={() => setSelectedIndex(index)}
                  className={cn(
                    'w-full flex items-center gap-3 px-3 py-2 text-left transition-colors',
                    selectedIndex === index
                      ? 'bg-hud-accent/20 text-hud-accent'
                      : 'text-hud-text/70 hover:bg-hud-gray/30'
                  )}
                >
                  <span className="shrink-0">{cmd.icon}</span>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{cmd.title}</p>
                    {cmd.subtitle && (
                      <p className="text-xs text-hud-text/50 truncate">
                        {cmd.subtitle}
                      </p>
                    )}
                  </div>
                </button>
              ))
            )}
          </div>

          {/* Footer hint */}
          <div className="px-4 py-2 border-t border-hud-gray/30 flex items-center gap-4 text-xs text-hud-text/50">
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 bg-hud-gray/30">↑↓</kbd>
              navigate
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 bg-hud-gray/30">↵</kbd>
              select
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 bg-hud-gray/30">esc</kbd>
              close
            </span>
          </div>
        </div>
      </div>
    </>
  )
}
