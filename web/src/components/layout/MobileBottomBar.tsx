import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/utils/cn'
import { CircleHelp, FolderRoot, KeyRound, MessageSquareText, Settings2, Plus, ArrowLeft, ChevronRight } from 'lucide-react'

type MobileSheet = 'workspaces' | 'sessions' | null

interface MobileBottomBarProps {
  openSheet: MobileSheet
  carousel?: {
    visible: boolean
    count: number
    index: number
  }
  onOpenWorkspaces: () => void
  onOpenSessions: () => void
  onOpenSettings: () => void
  onOpenCredentials: () => void
  onOpenHelp: () => void
  onCloseSheet: () => void
  onPrimaryAction?: () => void
  primaryActionLabel?: string
  onCarouselPrev?: () => void
  onCarouselNext?: () => void
  onCarouselSelect?: (index: number) => void
}

function NavButton({
  icon,
  label,
  onClick,
}: {
  icon: ReactNode
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex min-w-0 flex-1 items-center justify-center rounded-xl px-2 py-3 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground',
      )}
      aria-label={label}
    >
      <span>{icon}</span>
      <span className="sr-only">{label}</span>
    </button>
  )
}

export function MobileBottomBar({
  openSheet,
  carousel,
  onOpenWorkspaces,
  onOpenSessions,
  onOpenSettings,
  onOpenCredentials,
  onOpenHelp,
  onCloseSheet,
  onPrimaryAction,
  primaryActionLabel,
  onCarouselPrev,
  onCarouselNext,
  onCarouselSelect,
}: MobileBottomBarProps) {
  return (
    <div className="z-40 shrink-0 border-t border-border bg-card/95 backdrop-blur md:hidden">
      {openSheet === null && carousel?.visible && carousel.count > 1 && (
        <div className="mx-auto flex max-w-screen-sm items-center justify-between gap-3 border-b border-border/60 px-3 py-1.5">
          <Button
            variant="ghost"
            size="sm"
            className="px-2"
            onClick={onCarouselPrev}
            disabled={carousel.index === 0}
          >
            <ArrowLeft size={16} />
          </Button>
          <div className="flex items-center gap-2">
            {Array.from({ length: carousel.count }).map((_, index) => (
              <button
                key={index}
                type="button"
                onClick={() => onCarouselSelect?.(index)}
                className={cn(
                  'h-2.5 rounded-full transition-all',
                  index === carousel.index ? 'w-6 bg-accent' : 'w-2.5 bg-border',
                )}
                aria-label={`Go to item ${index + 1}`}
              />
            ))}
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="px-2"
            onClick={onCarouselNext}
            disabled={carousel.index === carousel.count - 1}
          >
            <ChevronRight size={16} />
          </Button>
        </div>
      )}
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
              icon={<FolderRoot size={18} />}
              label="Workspaces"
              onClick={onOpenWorkspaces}
            />
            <NavButton
              icon={<MessageSquareText size={18} />}
              label="Sessions"
              onClick={onOpenSessions}
            />
            <NavButton
              icon={<Settings2 size={18} />}
              label="Settings"
              onClick={onOpenSettings}
            />
            <NavButton
              icon={<KeyRound size={18} />}
              label="Credentials"
              onClick={onOpenCredentials}
            />
            <NavButton
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
