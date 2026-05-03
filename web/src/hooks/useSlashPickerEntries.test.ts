import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SlashPickerEntriesResponse } from '@/api/types'
import {
  clearSlashPickerEntriesCache,
  getCachedSlashPickerEntries,
  useSlashPickerEntries,
} from './useSlashPickerEntries'

function response(token: string): SlashPickerEntriesResponse {
  return {
    entries: [{
      id: `sdk:command:${token}`,
      token,
      name: token.replace(/^\//, ''),
      type: 'command',
      source: 'sdk',
      sourceLabel: 'SDK',
    }],
    sourceStatuses: [{ source: 'sdk', status: 'ready' }],
  }
}

describe('useSlashPickerEntries', () => {
  beforeEach(() => {
    clearSlashPickerEntriesCache()
  })

  it('does not fetch while disabled', () => {
    const fetcher = vi.fn()
    const { result } = renderHook(() => useSlashPickerEntries('session-1', false, fetcher))

    expect(fetcher).not.toHaveBeenCalled()
    expect(result.current.entries).toEqual([])
    expect(result.current.isLoading).toBe(false)
  })

  it('fetches and caches entries when enabled', async () => {
    const fetcher = vi.fn().mockResolvedValue(response('/security'))
    const { result } = renderHook(() => useSlashPickerEntries('session-1', true, fetcher))

    expect(result.current.isLoading).toBe(true)

    await waitFor(() => {
      expect(result.current.entries.map((entry) => entry.token)).toEqual(['/security'])
    })
    expect(result.current.hasCachedResult).toBe(true)
    expect(getCachedSlashPickerEntries('session-1')?.entries[0].token).toBe('/security')
  })

  it('returns cached entries immediately while refreshing on open', async () => {
    const firstFetcher = vi.fn().mockResolvedValue(response('/cached'))
    const first = renderHook(() => useSlashPickerEntries('session-1', true, firstFetcher))
    await waitFor(() => {
      expect(first.result.current.entries[0].token).toBe('/cached')
    })
    first.unmount()

    let resolveRefresh: (value: SlashPickerEntriesResponse) => void = () => {}
    const refreshPromise = new Promise<SlashPickerEntriesResponse>((resolve) => {
      resolveRefresh = resolve
    })
    const secondFetcher = vi.fn().mockReturnValue(refreshPromise)
    const second = renderHook(() => useSlashPickerEntries('session-1', true, secondFetcher))

    expect(second.result.current.entries[0].token).toBe('/cached')
    await waitFor(() => {
      expect(second.result.current.isLoading).toBe(true)
    })

    await act(async () => {
      resolveRefresh(response('/fresh'))
      await refreshPromise
    })

    await waitFor(() => {
      expect(second.result.current.entries[0].token).toBe('/fresh')
    })
  })

  it('keeps cached entries when refresh fails', async () => {
    const firstFetcher = vi.fn().mockResolvedValue(response('/cached'))
    const first = renderHook(() => useSlashPickerEntries('session-1', true, firstFetcher))
    await waitFor(() => {
      expect(first.result.current.entries[0].token).toBe('/cached')
    })
    first.unmount()

    const failingFetcher = vi.fn().mockRejectedValue(new Error('SDK unavailable'))
    const second = renderHook(() => useSlashPickerEntries('session-1', true, failingFetcher))

    await waitFor(() => {
      expect(second.result.current.error).toBe('SDK unavailable')
    })
    expect(second.result.current.entries[0].token).toBe('/cached')
    expect(second.result.current.hasCachedResult).toBe(true)
  })

  it('ignores stale refresh results after the session changes', async () => {
    let resolveSessionOne: (value: SlashPickerEntriesResponse) => void = () => {}
    let resolveSessionTwo: (value: SlashPickerEntriesResponse) => void = () => {}
    const sessionOnePromise = new Promise<SlashPickerEntriesResponse>((resolve) => {
      resolveSessionOne = resolve
    })
    const sessionTwoPromise = new Promise<SlashPickerEntriesResponse>((resolve) => {
      resolveSessionTwo = resolve
    })
    const fetcher = vi.fn((sessionId: string) =>
      sessionId === 'session-1' ? sessionOnePromise : sessionTwoPromise
    )

    const hook = renderHook(
      ({ sessionId }) => useSlashPickerEntries(sessionId, true, fetcher),
      { initialProps: { sessionId: 'session-1' } },
    )

    hook.rerender({ sessionId: 'session-2' })

    await act(async () => {
      resolveSessionTwo(response('/fresh'))
      await sessionTwoPromise
    })

    await waitFor(() => {
      expect(hook.result.current.entries[0].token).toBe('/fresh')
    })

    await act(async () => {
      resolveSessionOne(response('/stale'))
      await sessionOnePromise
    })

    expect(hook.result.current.entries[0].token).toBe('/fresh')
    expect(getCachedSlashPickerEntries('session-2')?.entries[0].token).toBe('/fresh')
    expect(getCachedSlashPickerEntries('session-1')).toBeNull()
  })
})
