import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { SlashPickerEntry } from '@/api/types'
import {
  createSlashPickerFavoriteRecord,
  parseSlashPickerFavoriteRecords,
  toggleSlashPickerFavoriteRecord,
  useSlashPickerFavorites,
  type SlashPickerFavoriteRecord,
  type SlashPickerFavoritesStorage,
} from './useSlashPickerFavorites'

function entry(overrides: Partial<SlashPickerEntry>): SlashPickerEntry {
  return {
    id: 'sdk:command:security',
    token: '/security',
    name: 'security',
    type: 'command',
    source: 'sdk',
    sourceLabel: 'SDK',
    ...overrides,
  }
}

function memoryStorage(initial: unknown): SlashPickerFavoritesStorage & {
  saved: SlashPickerFavoriteRecord[] | null
} {
  return {
    saved: null,
    get: vi.fn().mockResolvedValue(initial),
    set: vi.fn(async function set(this: { saved: SlashPickerFavoriteRecord[] | null }, records: SlashPickerFavoriteRecord[]) {
      this.saved = records
    }),
  }
}

describe('slash picker favorite records', () => {
  it('creates source-specific snapshots from entries', () => {
    expect(createSlashPickerFavoriteRecord(entry({
      id: 'project:command:security',
      source: 'project',
      sourceLabel: 'Project',
      argumentHint: '[path]',
      namespace: 'reviews',
      origin: { path: '.claude/commands/security.md' },
    }), 123)).toEqual({
      entryId: 'project:command:security',
      token: '/security',
      name: 'security',
      source: 'project',
      sourceLabel: 'Project',
      type: 'command',
      namespace: 'reviews',
      argumentHint: '[path]',
      origin: { path: '.claude/commands/security.md' },
      updatedAt: 123,
    })
  })

  it('toggles favorites and keeps newly pinned entries first', () => {
    const sdk = entry({ id: 'sdk:security', source: 'sdk', sourceLabel: 'SDK' })
    const project = entry({ id: 'project:security', source: 'project', sourceLabel: 'Project' })

    const withSdk = toggleSlashPickerFavoriteRecord([], sdk, 1)
    const withBoth = toggleSlashPickerFavoriteRecord(withSdk, project, 2)
    expect(withBoth.map((record) => record.entryId)).toEqual(['project:security', 'sdk:security'])

    expect(toggleSlashPickerFavoriteRecord(withBoth, sdk, 3).map((record) => record.entryId)).toEqual([
      'project:security',
    ])
  })

  it('drops corrupt and duplicate persisted records', () => {
    expect(parseSlashPickerFavoriteRecords([
      createSlashPickerFavoriteRecord(entry({ id: 'sdk:security' }), 1),
      createSlashPickerFavoriteRecord(entry({ id: 'sdk:security' }), 2),
      { entryId: 'broken' },
      null,
    ]).map((record) => record.entryId)).toEqual(['sdk:security'])
  })
})

describe('useSlashPickerFavorites', () => {
  it('loads persisted favorites', async () => {
    const storage = memoryStorage([
      createSlashPickerFavoriteRecord(entry({ id: 'global:review', source: 'global', sourceLabel: 'Global' }), 1),
    ])

    const { result } = renderHook(() => useSlashPickerFavorites(storage))

    await waitFor(() => {
      expect(result.current.isLoaded).toBe(true)
    })

    expect(result.current.favoriteEntryIds).toEqual(['global:review'])
    expect(result.current.isFavorite('global:review')).toBe(true)
  })

  it('pins and unpins a source-specific entry', async () => {
    const storage = memoryStorage([])
    const { result } = renderHook(() => useSlashPickerFavorites(storage))
    const projectEntry = entry({ id: 'project:security', source: 'project', sourceLabel: 'Project' })

    await waitFor(() => {
      expect(result.current.isLoaded).toBe(true)
    })

    act(() => {
      result.current.toggleFavorite(projectEntry)
    })

    expect(result.current.favoriteEntryIds).toEqual(['project:security'])
    expect(storage.saved?.[0]).toMatchObject({
      entryId: 'project:security',
      source: 'project',
      sourceLabel: 'Project',
    })

    act(() => {
      result.current.toggleFavorite(projectEntry)
    })

    expect(result.current.favoriteEntryIds).toEqual([])
    expect(storage.saved).toEqual([])
  })

  it('ignores toggle requests until persisted favorites finish loading', async () => {
    let resolveLoad: (value: unknown) => void = () => undefined
    const storage: SlashPickerFavoritesStorage = {
      get: vi.fn(() => new Promise((resolve) => {
        resolveLoad = resolve
      })),
      set: vi.fn(),
    }
    const { result } = renderHook(() => useSlashPickerFavorites(storage))

    act(() => {
      result.current.toggleFavorite(entry({ id: 'sdk:security' }))
    })

    expect(result.current.favoriteEntryIds).toEqual([])
    expect(storage.set).not.toHaveBeenCalled()

    act(() => {
      resolveLoad([])
    })

    await waitFor(() => {
      expect(result.current.isLoaded).toBe(true)
    })
  })

  it('reverts optimistic favorite state when persistence fails', async () => {
    const storage: SlashPickerFavoritesStorage = {
      get: vi.fn().mockResolvedValue([]),
      set: vi.fn().mockRejectedValue(new Error('quota exceeded')),
    }
    const { result } = renderHook(() => useSlashPickerFavorites(storage))

    await waitFor(() => {
      expect(result.current.isLoaded).toBe(true)
    })

    act(() => {
      result.current.toggleFavorite(entry({ id: 'sdk:security' }))
    })

    await waitFor(() => {
      expect(result.current.error).toBe('Could not save slash picker favorites.')
      expect(result.current.favoriteEntryIds).toEqual([])
    })
  })
})
