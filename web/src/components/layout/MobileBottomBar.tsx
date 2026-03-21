import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/utils/cn'
import { CircleHelp, FolderRoot, KeyRound, MessageSquareText, Settings2, Plus, ArrowLeft } from 'lucide-react'

type MobileSheet = 'workspaces' | 'sessions' | null

interface MobileBottomBarProps {
  activePath: string
  openSheet: MobileSheet
  onOpenWorkspaces: () => void
  onOpenSessions: () => void
  onOpenSettings: () => void
  onOpenCredentials: () => void
  onOpenHelp: () => void
  onCloseSheet: () => void
  onPrimaryAction?: () => void
  primaryActionLabel?: string
}

function NavButton({
  active,
  icon,
  label,
  onClick,
}: {
  active: boolean
  icon: ReactNode
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-xl px-2 py-2 text-[11px] font-medium transition-colors',
        active ? 'bg-accent/10 text-accent' : 'text-muted-foreground hover:bg-secondary hover:text-foreground',
      )}
    >
      <span>{icon}</span>
      <span className="truncate">{label}</span>
    </button>
  )
}

export function MobileBottomBar({
  activePath,
  openSheet,
  onOpenWorkspaces,
  onOpenSessions,
  onOpenSettings,
  onOpenCredentials,
  onOpenHelp,
  onCloseSheet,
  onPrimaryAction,
  primaryActionLabel,
}: MobileBottomBarProps) {
  const isSettings = activePath.startsWith('/settings')
  const isCredentials = activePath.startsWith('/credentials')
  const isHelp = activePath.startsWith('/help')

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card/95 backdrop-blur md:hidden">
      <div className="mx-auto flex max-w-screen-sm items-center gap-2 px-3 py-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))]">
        {openSheet ? (
          <>
            <Button variant="ghost" size="sm" className="px-2" onClick={onCloseSheet}>
              <ArrowLeft size={16} />
              <span>Back</span>
            </Button>
            <div className="flex-1 text-center text-sm font-medium text-foreground">
              {openSheet === 'workspaces' ? 'Workspaces' : 'Sessions'}
            </div>
            {onPrimaryAction && primaryActionLabel ? (
              <Button variant="ghost" size="sm" className="px-2" onClick={onPrimaryAction}>
                <Plus size={16} />
                <span>{primaryActionLabel}</span>
              </Button>
            ) : (
              <div className="w-14 shrink-0" />
            )}
          </>
        ) : (
          <>
            <NavButton
              active={activePath.startsWith('/workspaces')}
              icon={<FolderRoot size={18} />}
              label="Workspaces"
              onClick={onOpenWorkspaces}
            />
            <NavButton
              active={activePath.startsWith('/workspaces/')}
              icon={<MessageSquareText size={18} />}
              label="Sessions"
              onClick={onOpenSessions}
            />
            <NavButton
              active={isSettings}
              icon={<Settings2 size={18} />}
              label="Settings"
              onClick={onOpenSettings}
            />
            <NavButton
              active={isCredentials}
              icon={<KeyRound size={18} />}
              label="Credentials"
              onClick={onOpenCredentials}
            />
            <NavButton
              active={isHelp}
              icon={<CircleHelp size={18} />}
              label="Help"
              onClick={onOpenHelp}
            />
          </>
        )}
      </div>
    </div>
  )
}
