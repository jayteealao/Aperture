import { useLocation } from 'react-router-dom'
import { useAppStore } from '@/stores/app'
import { Menu, Wifi, WifiOff } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'

const pageTitles: Record<string, string> = {
  '/workspace': 'Workspace',
  '/sessions': 'Sessions',
  '/sessions/new': 'New Session',
  '/credentials': 'Credentials',
  '/settings': 'Settings',
  '/help': 'Help',
}

export function Topbar() {
  const location = useLocation()
  const { setSidebarOpen, gatewayUrl, isConnected } = useAppStore()

  const title = pageTitles[location.pathname] || 'Aperture'

  return (
    <header className="h-14 px-4 flex items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-bg-secondary)]">
      <div className="flex items-center gap-3">
        <button
          onClick={() => setSidebarOpen(true)}
          className="p-2 rounded-lg hover:bg-[var(--color-surface)] lg:hidden"
          aria-label="Open menu"
        >
          <Menu size={20} />
        </button>
        <h1 className="font-semibold text-[var(--color-text-primary)]">{title}</h1>
      </div>

      <div className="flex items-center gap-3">
        <div className="hidden sm:flex items-center gap-2">
          <span className="text-xs font-mono text-[var(--color-text-muted)] truncate max-w-[200px]">
            {gatewayUrl || 'Not connected'}
          </span>
        </div>
        <Badge variant={isConnected ? 'success' : 'danger'} size="sm">
          {isConnected ? (
            <>
              <Wifi size={12} />
              <span>Online</span>
            </>
          ) : (
            <>
              <WifiOff size={12} />
              <span>Offline</span>
            </>
          )}
        </Badge>
      </div>
    </header>
  )
}
