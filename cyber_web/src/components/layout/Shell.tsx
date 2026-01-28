import React from 'react'
import { cn } from '@/utils/cn'
import { GridContainer } from '@/components/ui'

interface ShellProps {
  children: React.ReactNode
  sidebar?: React.ReactNode
  topbar?: React.ReactNode
  rightPanel?: React.ReactNode
  sidebarOpen?: boolean
  rightPanelOpen?: boolean
  className?: string
}

export function Shell({
  children,
  sidebar,
  topbar,
  rightPanel,
  sidebarOpen = true,
  rightPanelOpen = false,
  className,
}: ShellProps) {
  return (
    <GridContainer
      className={cn('h-screen flex flex-col overflow-hidden', className)}
      showGrid
      showVignette
    >
      {/* Topbar */}
      {topbar && (
        <header className="shrink-0 border-b border-hud-gray/50 relative z-20">
          {topbar}
        </header>
      )}

      {/* Main content area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar */}
        {sidebar && (
          <aside
            className={cn(
              'shrink-0 border-r border-hud-gray/50 relative z-10',
              'transition-all duration-300 ease-out',
              sidebarOpen ? 'w-64' : 'w-0 overflow-hidden'
            )}
          >
            {sidebar}
          </aside>
        )}

        {/* Main content */}
        <main className="flex-1 flex flex-col overflow-hidden relative">
          {children}
        </main>

        {/* Right panel (SDK/Pi control panel) */}
        {rightPanel && (
          <aside
            className={cn(
              'shrink-0 border-l border-hud-gray/50 relative z-10',
              'transition-all duration-300 ease-out',
              rightPanelOpen ? 'w-80' : 'w-0 overflow-hidden'
            )}
          >
            {rightPanel}
          </aside>
        )}
      </div>

      {/* Decorative corner elements */}
      <div className="fixed top-0 left-0 w-8 h-8 pointer-events-none z-50">
        <div className="absolute top-2 left-2 w-4 h-px bg-hud-accent" />
        <div className="absolute top-2 left-2 w-px h-4 bg-hud-accent" />
      </div>
      <div className="fixed top-0 right-0 w-8 h-8 pointer-events-none z-50">
        <div className="absolute top-2 right-2 w-4 h-px bg-hud-accent" />
        <div className="absolute top-2 right-2 w-px h-4 bg-hud-accent" />
      </div>
      <div className="fixed bottom-0 left-0 w-8 h-8 pointer-events-none z-50">
        <div className="absolute bottom-2 left-2 w-4 h-px bg-hud-text/30" />
        <div className="absolute bottom-2 left-2 w-px h-4 bg-hud-text/30" />
      </div>
      <div className="fixed bottom-0 right-0 w-8 h-8 pointer-events-none z-50">
        <div className="absolute bottom-2 right-2 w-4 h-px bg-hud-text/30" />
        <div className="absolute bottom-2 right-2 w-px h-4 bg-hud-text/30" />
      </div>
    </GridContainer>
  )
}
