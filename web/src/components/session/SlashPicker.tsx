import { memo } from 'react'
import { CheckCircle2, Loader2, SearchX, Sparkles, Star, Terminal, TriangleAlert } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import {
  Command,
  CommandGroup,
  CommandList,
} from '@/components/ui/command'
import { PopoverContent } from '@/components/ui/popover'
import type { SlashPickerEntry, SlashPickerSourceStatus } from '@/api/types'
import { cn } from '@/utils/cn'
import type { SlashPickerGroup } from './slash-picker-logic'

export interface SlashPickerProps {
  listId: string
  groups: SlashPickerGroup[]
  sourceStatuses: SlashPickerSourceStatus[]
  isLoading: boolean
  error: string | null
  query: string
  activeEntryId: string | null
  argumentHint: string | null
  onActiveEntryChange: (entryId: string | null) => void
  onSelect: (entry: SlashPickerEntry) => void
  onToggleFavorite?: (entry: SlashPickerEntry) => void
  favoriteToggleDisabled?: boolean
  onDismiss: () => void
}

export const SlashPicker = memo(function SlashPicker(props: SlashPickerProps) {
  return (
    <PopoverContent
      align="start"
      side="top"
      sideOffset={8}
      onOpenAutoFocus={(event) => event.preventDefault()}
      onCloseAutoFocus={(event) => event.preventDefault()}
      onEscapeKeyDown={(event) => {
        event.preventDefault()
        props.onDismiss()
      }}
      className="w-[var(--radix-popover-trigger-width)] max-w-[calc(100vw-1.5rem)] p-0"
      data-testid="slash-picker-popover"
    >
      <SlashPickerSurface {...props} />
    </PopoverContent>
  )
})

export const SlashPickerSurface = memo(function SlashPickerSurface({
  listId,
  groups,
  sourceStatuses,
  isLoading,
  error,
  query,
  activeEntryId,
  argumentHint,
  onActiveEntryChange,
  onSelect,
  onToggleFavorite,
  favoriteToggleDisabled = false,
}: SlashPickerProps) {
  const statusRows = sourceStatuses.filter((status) =>
    status.status === 'failed' || status.status === 'unavailable' || status.status === 'partial'
  )
  const hasEntries = groups.some((group) => group.entries.length > 0)
  const showEmpty = !hasEntries && !isLoading

  return (
    <Command
      shouldFilter={false}
      className="rounded-md border-0 bg-popover"
      data-testid="slash-picker"
    >
      <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
        <div className="min-w-0">
          <div className="truncate text-xs font-medium text-foreground">
            Commands and skills
          </div>
          <div className="truncate text-2xs text-muted-foreground">
            {query ? `Filtering by ${query}` : 'Select a slash entry'}
          </div>
        </div>
        {isLoading && (
          <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" aria-label="Loading entries" />
        )}
      </div>

      <div id={listId} role="listbox">
        <CommandList className="max-h-72 scroll-py-1 overflow-y-auto">
          {groups.map((group) => (
            <CommandGroup key={group.id} heading={group.label}>
              {group.entries.map(({ entry, isFavorite }) => (
                <SlashPickerRow
                  key={entry.id}
                  entry={entry}
                  listId={listId}
                  isActive={entry.id === activeEntryId}
                  isFavorite={isFavorite}
                  onActiveEntryChange={onActiveEntryChange}
                  onSelect={onSelect}
                  onToggleFavorite={onToggleFavorite}
                  favoriteToggleDisabled={favoriteToggleDisabled}
                />
              ))}
            </CommandGroup>
          ))}

          {statusRows.length > 0 && (
            <CommandGroup heading="Source status">
              {statusRows.map((status) => (
                <div
                  key={`${status.source}:${status.status}`}
                  className="flex items-start gap-2 rounded-sm px-2 py-1.5 text-xs text-muted-foreground"
                  role="status"
                >
                  <TriangleAlert className="mt-0.5 size-3.5 shrink-0 text-warning" />
                  <span className="min-w-0">
                    <span className="font-medium capitalize text-foreground">{status.source}</span>
                    <span>{' '}{statusLabel(status.status)}</span>
                    {status.message && <span>: {status.message}</span>}
                  </span>
                </div>
              ))}
            </CommandGroup>
          )}

          {error && (
            <div className="flex items-start gap-2 px-3 py-2 text-xs text-muted-foreground" role="status">
              <TriangleAlert className="mt-0.5 size-3.5 shrink-0 text-warning" />
              <span>{error}</span>
            </div>
          )}

          {showEmpty && (
            <div className="flex items-center gap-2 px-3 py-3 text-xs text-muted-foreground" role="status">
              <SearchX className="size-4 shrink-0" />
              <span>No commands found</span>
            </div>
          )}
        </CommandList>
      </div>

      {argumentHint && (
        <div className="border-t border-border px-3 py-2 text-2xs text-muted-foreground">
          Argument hint: <span className="font-mono text-foreground">{argumentHint}</span>
        </div>
      )}
    </Command>
  )
})

function SlashPickerRow({
  entry,
  listId,
  isActive,
  isFavorite,
  onActiveEntryChange,
  onSelect,
  onToggleFavorite,
  favoriteToggleDisabled,
}: {
  entry: SlashPickerEntry
  listId: string
  isActive: boolean
  isFavorite: boolean
  onActiveEntryChange: (entryId: string | null) => void
  onSelect: (entry: SlashPickerEntry) => void
  onToggleFavorite?: (entry: SlashPickerEntry) => void
  favoriteToggleDisabled: boolean
}) {
  const Icon = entry.type === 'skill' ? Sparkles : Terminal

  return (
    <div
      className="flex items-stretch gap-1 px-1"
      role="presentation"
      onMouseEnter={() => onActiveEntryChange(entry.id)}
    >
      <div
        id={getSlashPickerEntryDomId(listId, entry.id)}
        data-slash-picker-entry-id={getSlashPickerEntryDomId(listId, entry.id)}
        role="option"
        aria-selected={isActive}
        className={cn(
          'relative flex min-w-0 flex-1 cursor-pointer select-none items-start gap-2 rounded-sm px-2 py-2 text-sm outline-hidden',
          isActive && 'bg-accent text-accent-foreground'
        )}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => onSelect(entry)}
      >
        <Icon className="mt-0.5 size-4 shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <span className="truncate font-mono text-xs">{entry.token}</span>
            <Badge variant="outline" size="sm" className="shrink-0 px-1.5 py-0 text-[10px] capitalize">
              {entry.type}
            </Badge>
            <Badge variant="secondary" size="sm" className="shrink-0 px-1.5 py-0 text-[10px]">
              {entry.sourceLabel}
            </Badge>
            {isFavorite && (
              <Badge variant="accent" size="sm" className="shrink-0 px-1.5 py-0 text-[10px]">
                Favorite
              </Badge>
            )}
          </div>
          {(entry.description || entry.argumentHint) && (
            <div className="mt-0.5 flex min-w-0 items-center gap-1.5 text-2xs text-muted-foreground">
              {entry.description && <span className="truncate">{entry.description}</span>}
              {entry.argumentHint && (
                <span className="shrink-0 font-mono">{entry.argumentHint}</span>
              )}
            </div>
          )}
        </div>
        {isActive && <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden="true" />}
      </div>
      {onToggleFavorite && (
        <button
          type="button"
          tabIndex={-1}
          disabled={favoriteToggleDisabled}
          aria-label={`${isFavorite ? 'Remove' : 'Add'} ${entry.token} ${isFavorite ? 'from' : 'to'} favorites`}
          aria-pressed={isFavorite}
          title={favoriteToggleDisabled
            ? 'Favorites loading'
            : isFavorite ? 'Remove from favorites' : 'Add to favorites'}
          className={cn(
            'mt-1 flex size-7 shrink-0 items-center justify-center rounded-sm text-muted-foreground outline-hidden transition-colors hover:bg-accent hover:text-accent-foreground',
            isActive && 'text-accent-foreground',
            isFavorite && 'text-accent',
            favoriteToggleDisabled && 'cursor-not-allowed opacity-50 hover:bg-transparent hover:text-muted-foreground'
          )}
          onMouseDown={(event) => {
            event.preventDefault()
            event.stopPropagation()
          }}
          onClick={(event) => {
            event.preventDefault()
            event.stopPropagation()
            onToggleFavorite(entry)
          }}
        >
          <Star className={cn('size-4', isFavorite && 'fill-current')} aria-hidden="true" />
        </button>
      )}
    </div>
  )
}

function statusLabel(status: SlashPickerSourceStatus['status']): string {
  if (status === 'failed') return 'commands unavailable'
  if (status === 'unavailable') return 'unavailable'
  if (status === 'partial') return 'partially loaded'
  return status
}

export function getSlashPickerEntryDomId(listId: string, entryId: string): string {
  return `${listId}-entry-${entryId.replace(/[^a-zA-Z0-9_-]/g, '-')}`
}
