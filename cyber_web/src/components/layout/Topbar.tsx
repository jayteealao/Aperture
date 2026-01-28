import React from 'react'
import { Link, useLocation } from 'react-router-dom'
import { cn } from '@/utils/cn'
import { HUDLabel, HUDMicro, StatusDot, IconButton } from '@/components/ui'
import { useAppStore } from '@/stores'
import {
  Menu,
  X,
  Settings,
  HelpCircle,
  KeyRound,
  Layers,
  MessageSquare,
  PanelRight,
  Wifi,
  WifiOff,
} from 'lucide-react'

interface TopbarProps {
  className?: string
}

export function Topbar({ className }: TopbarProps) {
  const { isConnected, sidebarOpen, toggleSidebar, sdkPanelOpen, toggleSdkPanel } = useAppStore()
  const location = useLocation()

  const navItems = [
    { path: '/sessions', label: 'Sessions', icon: MessageSquare },
    { path: '/workspaces', label: 'Workspaces', icon: Layers },
    { path: '/credentials', label: 'Credentials', icon: KeyRound },
  ]

  return (
    <div className={cn('h-12 flex items-center justify-between px-4 bg-hud-black/50', className)}>
      {/* Left section */}
      <div className="flex items-center gap-4">
        {/* Menu toggle */}
        <IconButton
          icon={sidebarOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
          label={sidebarOpen ? 'Close sidebar' : 'Open sidebar'}
          variant="ghost"
          size="sm"
          onClick={toggleSidebar}
        />

        {/* Logo */}
        <Link to="/" className="flex items-center gap-3 group">
          <div className="relative w-8 h-8 flex items-center justify-center">
            {/* Aperture-like icon */}
            <div className="absolute inset-0 border border-hud-accent rounded-full opacity-50 group-hover:opacity-100 transition-opacity" />
            <div className="absolute inset-1 border border-hud-accent/50 rounded-full" />
            <div className="w-2 h-2 bg-hud-accent rounded-full animate-pulse" />
          </div>
          <div>
            <HUDLabel className="text-hud-accent group-hover:text-glow-accent transition-all">
              Aperture
            </HUDLabel>
            <HUDMicro>// Cyber</HUDMicro>
          </div>
        </Link>

        {/* Divider */}
        <div className="w-px h-6 bg-hud-gray" />

        {/* Navigation */}
        <nav className="flex items-center gap-1">
          {navItems.map(({ path, label, icon: Icon }) => {
            const isActive = location.pathname === path
            return (
              <Link
                key={path}
                to={path}
                className={cn(
                  'flex items-center gap-2 px-3 py-1.5 font-mono text-xs uppercase tracking-wider',
                  'transition-all duration-200',
                  isActive
                    ? 'text-hud-accent bg-hud-accent/10 border-b border-hud-accent'
                    : 'text-hud-text hover:text-hud-white hover:bg-hud-white/5'
                )}
              >
                <Icon className="w-3.5 h-3.5" />
                <span className="hidden md:inline">{label}</span>
              </Link>
            )
          })}
        </nav>
      </div>

      {/* Right section */}
      <div className="flex items-center gap-3">
        {/* Connection status */}
        <div className="flex items-center gap-2 px-3 py-1 border border-hud-gray/50">
          {isConnected ? (
            <>
              <Wifi className="w-3.5 h-3.5 text-hud-success" />
              <StatusDot status="connected" pulse />
              <HUDMicro className="text-hud-success">Connected</HUDMicro>
            </>
          ) : (
            <>
              <WifiOff className="w-3.5 h-3.5 text-hud-error" />
              <StatusDot status="error" />
              <HUDMicro className="text-hud-error">Offline</HUDMicro>
            </>
          )}
        </div>

        {/* Divider */}
        <div className="w-px h-6 bg-hud-gray" />

        {/* Actions */}
        <div className="flex items-center gap-1">
          <IconButton
            icon={<PanelRight className="w-4 h-4" />}
            label="Toggle control panel"
            variant={sdkPanelOpen ? 'outline' : 'ghost'}
            size="sm"
            onClick={toggleSdkPanel}
          />
          <Link to="/settings">
            <IconButton
              icon={<Settings className="w-4 h-4" />}
              label="Settings"
              variant="ghost"
              size="sm"
            />
          </Link>
          <Link to="/help">
            <IconButton
              icon={<HelpCircle className="w-4 h-4" />}
              label="Help"
              variant="ghost"
              size="sm"
            />
          </Link>
        </div>

        {/* Time display */}
        <TimeDisplay />
      </div>
    </div>
  )
}

function TimeDisplay() {
  const [time, setTime] = React.useState(new Date())

  React.useEffect(() => {
    const interval = setInterval(() => setTime(new Date()), 1000)
    return () => clearInterval(interval)
  }, [])

  return (
    <div className="font-mono text-2xs text-hud-text/70 tabular-nums">
      {time.toLocaleTimeString('en-US', { hour12: false })}
    </div>
  )
}
