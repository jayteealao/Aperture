import { useLocation, useParams, Link } from 'react-router'
import { useAppStore } from '@/stores/app'
import { useWorkspaces } from '@/hooks/useWorkspaces'
import { Wifi, WifiOff, ChevronRight } from 'lucide-react'
import { Badge } from '@/components/ui/badge'

const pageTitles: Record<string, string> = {
  '/workspaces': 'Workspaces',
  '/credentials': 'Credentials',
  '/settings': 'Settings',
  '/help': 'Help',
}

export function Topbar() {
  const location = useLocation()
  const params = useParams<{ id: string }>()
  const { gatewayUrl, isConnected } = useAppStore()
  const { workspaces } = useWorkspaces()

  const staticTitle = pageTitles[location.pathname]
  const isWorkspaceDetail = location.pathname.startsWith('/workspaces/') && params.id
  const workspace = isWorkspaceDetail
    ? workspaces.find((w) => w.id === params.id)
    : null

  return (
    <header className="h-14 px-4 flex items-center justify-between border-b border-border bg-card">
      <div className="flex min-w-0 items-center gap-1.5">
        {isWorkspaceDetail ? (
          <>
            <Link
              to="/workspaces"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Workspaces
            </Link>
            <ChevronRight size={14} className="text-muted-foreground shrink-0" />
            <span className="text-sm font-semibold text-foreground truncate">
              {workspace?.name ?? params.id}
            </span>
          </>
        ) : (
          <h1 className="text-sm font-semibold text-foreground">
            {staticTitle || 'Aperture'}
          </h1>
        )}
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
