import { useCallback, useEffect, useMemo, useState } from 'react'
import { get as idbGet, set as idbSet } from 'idb-keyval'
import type { SlashPickerEntry } from '@/api/types'

export interface SlashPickerFavoriteRecord {
  entryId: string
  token: string
  name: string
  source: SlashPickerEntry['source']
  sourceLabel: string
  type: SlashPickerEntry['type']
  namespace?: string
  argumentHint?: string
  origin?: SlashPickerEntry['origin']
  updatedAt: number
}

export interface SlashPickerFavoritesStorage {
  get: () => Promise<unknown>
  set: (records: SlashPickerFavoriteRecord[]) => Promise<void>
}

export interface UseSlashPickerFavoritesState {
  favoriteEntryIds: string[]
  favoriteEntriesById: Record<string, SlashPickerFavoriteRecord>
  isLoaded: boolean
  error: string | null
  isFavorite: (entryId: string) => boolean
  toggleFavorite: (entry: SlashPickerEntry) => void
}

const SLASH_PICKER_FAVORITES_KEY = 'slash-picker:favorites:v1'

const defaultSlashPickerFavoritesStorage: SlashPickerFavoritesStorage = {
  get: () => idbGet(SLASH_PICKER_FAVORITES_KEY),
  set: (records) => idbSet(SLASH_PICKER_FAVORITES_KEY, records),
}

export function parseSlashPickerFavoriteRecords(value: unknown): SlashPickerFavoriteRecord[] {
  if (!Array.isArray(value)) return []

  const seen = new Set<string>()
  const records: SlashPickerFavoriteRecord[] = []

  for (const item of value) {
    if (!isFavoriteRecordCandidate(item) || seen.has(item.entryId)) continue
    seen.add(item.entryId)
    records.push({
      entryId: item.entryId,
      token: item.token,
      name: item.name,
      source: item.source,
      sourceLabel: item.sourceLabel,
      type: item.type,
      namespace: typeof item.namespace === 'string' ? item.namespace : undefined,
      argumentHint: typeof item.argumentHint === 'string' ? item.argumentHint : undefined,
      origin: isRecordObject(item.origin) ? item.origin as SlashPickerEntry['origin'] : undefined,
      updatedAt: typeof item.updatedAt === 'number' ? item.updatedAt : 0,
    })
  }

  return records
}

export function createSlashPickerFavoriteRecord(
  entry: SlashPickerEntry,
  updatedAt = Date.now()
): SlashPickerFavoriteRecord {
  return {
    entryId: entry.id,
    token: entry.token,
    name: entry.name,
    source: entry.source,
    sourceLabel: entry.sourceLabel,
    type: entry.type,
    namespace: entry.namespace,
    argumentHint: entry.argumentHint,
    origin: entry.origin,
    updatedAt,
  }
}

export function toggleSlashPickerFavoriteRecord(
  records: SlashPickerFavoriteRecord[],
  entry: SlashPickerEntry,
  updatedAt = Date.now()
): SlashPickerFavoriteRecord[] {
  if (records.some((record) => record.entryId === entry.id)) {
    return records.filter((record) => record.entryId !== entry.id)
  }

  return [
    createSlashPickerFavoriteRecord(entry, updatedAt),
    ...records,
  ]
}

export function useSlashPickerFavorites(
  storage: SlashPickerFavoritesStorage = defaultSlashPickerFavoritesStorage
): UseSlashPickerFavoritesState {
  const [records, setRecords] = useState<SlashPickerFavoriteRecord[]>([])
  const [isLoaded, setIsLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let isActive = true

    void storage.get()
      .then((value) => {
        if (!isActive) return
        setRecords(parseSlashPickerFavoriteRecords(value))
      })
      .catch(() => {
        if (!isActive) return
        setRecords([])
        setError('Could not load slash picker favorites.')
      })
      .finally(() => {
        if (isActive) setIsLoaded(true)
      })

    return () => {
      isActive = false
    }
  }, [storage])

  const favoriteEntriesById = useMemo(
    () => Object.fromEntries(records.map((record) => [record.entryId, record])),
    [records],
  )
  const favoriteEntryIds = useMemo(
    () => records.map((record) => record.entryId),
    [records],
  )
  const isFavorite = useCallback(
    (entryId: string) => Boolean(favoriteEntriesById[entryId]),
    [favoriteEntriesById],
  )
  const toggleFavorite = useCallback((entry: SlashPickerEntry) => {
    if (!isLoaded) return
    setError(null)
    setRecords((currentRecords) => {
      const nextRecords = toggleSlashPickerFavoriteRecord(currentRecords, entry)
      void storage.set(nextRecords).catch(() => {
        setError('Could not save slash picker favorites.')
        setRecords((latestRecords) => latestRecords === nextRecords ? currentRecords : latestRecords)
      })
      return nextRecords
    })
  }, [isLoaded, storage])

  return {
    favoriteEntryIds,
    favoriteEntriesById,
    isLoaded,
    error,
    isFavorite,
    toggleFavorite,
  }
}

function isFavoriteRecordCandidate(value: unknown): value is SlashPickerFavoriteRecord {
  if (!isRecordObject(value)) return false
  return (
    typeof value.entryId === 'string' &&
    typeof value.token === 'string' &&
    typeof value.name === 'string' &&
    (value.source === 'sdk' || value.source === 'project' || value.source === 'global') &&
    typeof value.sourceLabel === 'string' &&
    (value.type === 'command' || value.type === 'skill')
  )
}

function isRecordObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
