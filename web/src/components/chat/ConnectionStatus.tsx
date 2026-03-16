import { cn } from '@/utils/cn'

const statusColors: Record<string, string> = {
  connected: 'bg-success',
  connecting: 'bg-warning animate-pulse',
  reconnecting: 'bg-warning animate-pulse',
  disconnected: 'bg-(--color-text-muted)',
  error: 'bg-danger',
  ended: 'bg-(--color-text-muted)',
}

const statusLabels: Record<string, string> = {
  connected: 'Connected',
  connecting: 'Connecting…',
  reconnecting: 'Reconnecting…',
  disconnected: 'Disconnected',
  error: 'Connection error',
  ended: 'Session ended',
}

export function ConnectionStatus({ status }: { status: string }) {
  return (
    <span
      className={cn(
        'w-2.5 h-2.5 rounded-full shrink-0',
        statusColors[status] || statusColors.disconnected,
      )}
      title={statusLabels[status] || status}
    />
  )
}
