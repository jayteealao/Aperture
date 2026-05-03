import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '@/api/client'
import type { SlashPickerEntriesResponse, SlashPickerEntry, SlashPickerSourceStatus } from '@/api/types'

export interface UseSlashPickerEntriesState {
  entries: SlashPickerEntry[]
  sourceStatuses: SlashPickerSourceStatus[]
  isLoading: boolean
  error: string | null
  hasCachedResult: boolean
  refresh: () => Promise<void>
}

export type SlashPickerEntriesFetcher = (sessionId: string) => Promise<SlashPickerEntriesResponse>

const EMPTY_RESPONSE: SlashPickerEntriesResponse = {
  entries: [],
  sourceStatuses: [],
}

const slashPickerEntriesCache = new Map<string, SlashPickerEntriesResponse>()

const defaultSlashPickerEntriesFetcher: SlashPickerEntriesFetcher = (sessionId) =>
  api.getSlashPickerEntries(sessionId)

export function clearSlashPickerEntriesCache(sessionId?: string) {
  if (sessionId) {
    slashPickerEntriesCache.delete(sessionId)
    return
  }
  slashPickerEntriesCache.clear()
}

export function getCachedSlashPickerEntries(sessionId: string): SlashPickerEntriesResponse | null {
  return slashPickerEntriesCache.get(sessionId) ?? null
}

export function useSlashPickerEntries(
  sessionId: string | null,
  enabled: boolean,
  fetcher: SlashPickerEntriesFetcher = defaultSlashPickerEntriesFetcher
): UseSlashPickerEntriesState {
  const cached = sessionId ? slashPickerEntriesCache.get(sessionId) : undefined
  const requestIdRef = useRef(0)
  const activeSessionIdRef = useRef(sessionId)
  const [state, setState] = useState<Omit<UseSlashPickerEntriesState, 'refresh'>>({
    entries: cached?.entries ?? [],
    sourceStatuses: cached?.sourceStatuses ?? [],
    isLoading: false,
    error: null,
    hasCachedResult: Boolean(cached),
  })

  useEffect(() => {
    activeSessionIdRef.current = sessionId
  }, [sessionId])

  const refresh = useCallback(async () => {
    if (!sessionId) return

    const requestId = requestIdRef.current + 1
    requestIdRef.current = requestId
    const refreshSessionId = sessionId
    const isCurrentRequest = () =>
      requestIdRef.current === requestId && activeSessionIdRef.current === refreshSessionId

    const existing = slashPickerEntriesCache.get(sessionId)
    setState({
      entries: existing?.entries ?? EMPTY_RESPONSE.entries,
      sourceStatuses: existing?.sourceStatuses ?? EMPTY_RESPONSE.sourceStatuses,
      isLoading: true,
      error: null,
      hasCachedResult: Boolean(existing),
    })

    try {
      const response = await fetcher(refreshSessionId)
      if (!isCurrentRequest()) return
      slashPickerEntriesCache.set(refreshSessionId, response)
      setState({
        entries: response.entries,
        sourceStatuses: response.sourceStatuses,
        isLoading: false,
        error: null,
        hasCachedResult: true,
      })
    } catch (error) {
      if (!isCurrentRequest()) return
      const nextCached = slashPickerEntriesCache.get(refreshSessionId)
      setState({
        entries: nextCached?.entries ?? EMPTY_RESPONSE.entries,
        sourceStatuses: nextCached?.sourceStatuses ?? EMPTY_RESPONSE.sourceStatuses,
        isLoading: false,
        error: error instanceof Error ? error.message : 'Failed to load slash picker entries',
        hasCachedResult: Boolean(nextCached),
      })
    }
  }, [fetcher, sessionId])

  useEffect(() => {
    if (!sessionId) {
      requestIdRef.current += 1
      setState({
        entries: EMPTY_RESPONSE.entries,
        sourceStatuses: EMPTY_RESPONSE.sourceStatuses,
        isLoading: false,
        error: null,
        hasCachedResult: false,
      })
      return
    }

    if (!enabled) {
      requestIdRef.current += 1
      const existing = slashPickerEntriesCache.get(sessionId)
      if (existing) {
        setState({
          entries: existing.entries,
          sourceStatuses: existing.sourceStatuses,
          isLoading: false,
          error: null,
          hasCachedResult: true,
        })
      }
      return
    }

    void refresh()
    return () => {
      requestIdRef.current += 1
    }
  }, [enabled, refresh, sessionId])

  return {
    ...state,
    refresh,
  }
}
