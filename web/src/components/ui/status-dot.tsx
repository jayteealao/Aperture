// Shared connection-status indicator used across Sidebar, WorkspacePanel,
// and workspace grid tiles. Kept here so the colour map has one source of truth.

import { cn } from '@/utils/cn'

const STATUS_COLORS: Record<string, string> = {
  connected: 'bg-success',
  connecting: 'bg-warning animate-pulse',
  reconnecting: 'bg-warning animate-pulse',
  disconnected: 'bg-foreground/40',
  error: 'bg-danger',
  ended: 'bg-foreground/40',
}

export function StatusDot({ status }: { status: string }) {
  return (
    <span
      className={cn(
        'w-2 h-2 rounded-full shrink-0',
        STATUS_COLORS[status] ?? STATUS_COLORS.disconnected,
      )}
    />
  )
}
