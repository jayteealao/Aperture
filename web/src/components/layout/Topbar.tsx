import { useLocation } from 'react-router'
import { useAppStore } from '@/stores/app'
import { Menu, Wifi, WifiOff } from 'lucide-react'
import { Badge } from '@/components/ui/badge'

const pageTitles: Record<string, string> = {
  '/workspaces': 'Workspaces',
  '/credentials': 'Credentials',
  '/settings': 'Settings',
  '/help': 'Help',
}

export function Topbar() {
  const location = useLocation()
  const { setSidebarOpen, gatewayUrl, isConnected } = useAppStore()

  // /workspaces/:id pages show "Aperture" — the workspace name is in the page header
  const title = pageTitles[location.pathname] || 'Aperture'

  return (
    <header className="h-14 px-4 flex items-center justify-between border-b border-border bg-card">
      <div className="flex items-center gap-3">
        <button
          onClick={() => setSidebarOpen(true)}
          className="p-2 rounded-lg hover:bg-secondary md:hidden"
          aria-label="Open menu"
        >
          <Menu size={20} />
        </button>
        <h1 className="font-semibold text-foreground">{title}</h1>
      </div>

      <div className="flex items-center gap-3">
        <div className="hidden sm:flex items-center gap-2">
          <span className="text-xs font-mono text-foreground/40 truncate max-w-[200px]">
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
