import type { AgentType, SlashPickerEntry, SlashPickerEntrySource } from '@/api/types'

export interface SlashPickerTrigger {
  isOpen: boolean
  query: string
}

export interface SlashPickerInsertion {
  value: string
  argumentHint: string | null
  shouldSubmit: false
}

export interface SlashPickerGroupedEntry {
  entry: SlashPickerEntry
  isFavorite: boolean
}

export interface SlashPickerGroup {
  id: 'favorites' | SlashPickerEntrySource
  label: string
  entries: SlashPickerGroupedEntry[]
}

export type SlashPickerMoveDirection = 'next' | 'previous'

const SOURCE_LABELS: Record<SlashPickerEntrySource, string> = {
  sdk: 'SDK',
  project: 'Project',
  global: 'Global',
}

const SOURCE_ORDER: SlashPickerEntrySource[] = ['sdk', 'project', 'global']

export function isSlashPickerTrigger(value: string): boolean {
  return /^\/\S*$/.test(value)
}

export function getSlashPickerQuery(value: string): string {
  if (!isSlashPickerTrigger(value)) return ''
  return value.slice(1)
}

export function getSlashPickerTrigger(value: string): SlashPickerTrigger {
  return {
    isOpen: isSlashPickerTrigger(value),
    query: getSlashPickerQuery(value),
  }
}

export function isClaudeSdkSlashPickerEligible(value: string, agent: AgentType): boolean {
  return agent === 'claude_sdk' && isSlashPickerTrigger(value)
}

export function filterSlashPickerEntries(
  entries: SlashPickerEntry[],
  query: string
): SlashPickerEntry[] {
  const normalizedQuery = query.trim().toLocaleLowerCase()
  if (!normalizedQuery) return entries

  return entries.filter((entry) =>
    entry.name.toLocaleLowerCase().includes(normalizedQuery)
  )
}

export function groupSlashPickerEntries(
  entries: SlashPickerEntry[],
  favoriteEntryIds: string[] = []
): SlashPickerGroup[] {
  const favoriteIds = new Set(favoriteEntryIds)
  const entriesById = new Map(entries.map((entry) => [entry.id, entry]))
  const groups: SlashPickerGroup[] = []

  const favoriteEntries = favoriteEntryIds
    .map((entryId) => entriesById.get(entryId))
    .filter((entry): entry is SlashPickerEntry => Boolean(entry))
  if (favoriteEntries.length > 0) {
    groups.push({
      id: 'favorites',
      label: 'Favorites',
      entries: favoriteEntries.map((entry) => ({ entry, isFavorite: true })),
    })
  }

  for (const source of SOURCE_ORDER) {
    const sourceEntries = entries.filter((entry) => entry.source === source && !favoriteIds.has(entry.id))
    if (sourceEntries.length === 0) continue
    groups.push({
      id: source,
      label: SOURCE_LABELS[source],
      entries: sourceEntries.map((entry) => ({ entry, isFavorite: false })),
    })
  }

  return groups
}

export function getSlashPickerSelectableEntryIds(groups: SlashPickerGroup[]): string[] {
  return groups.flatMap((group) => group.entries.map(({ entry }) => entry.id))
}

export function getNextSlashPickerActiveEntryId(
  groups: SlashPickerGroup[],
  currentEntryId: string | null,
  direction: SlashPickerMoveDirection
): string | null {
  const entryIds = getSlashPickerSelectableEntryIds(groups)
  if (entryIds.length === 0) return null

  const currentIndex = currentEntryId ? entryIds.indexOf(currentEntryId) : -1
  if (currentIndex === -1) {
    return direction === 'next' ? entryIds[0] : entryIds[entryIds.length - 1]
  }

  const offset = direction === 'next' ? 1 : -1
  const nextIndex = (currentIndex + offset + entryIds.length) % entryIds.length
  return entryIds[nextIndex]
}

export function buildSlashInsertion(entry: SlashPickerEntry): SlashPickerInsertion {
  const argumentHint = entry.argumentHint?.trim() || null
  return {
    value: entry.token,
    argumentHint,
    shouldSubmit: false,
  }
}
