import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// In-memory store simulating idb-keyval
const store = new Map<string, unknown>()

vi.mock('idb-keyval', () => ({
  get: vi.fn((key: string) => Promise.resolve(store.get(key))),
  set: vi.fn((key: string, value: unknown) => {
    store.set(key, value)
    return Promise.resolve()
  }),
  del: vi.fn((key: string) => {
    store.delete(key)
    return Promise.resolve()
  }),
  keys: vi.fn(() => Promise.resolve([...store.keys()])),
}))

import { get as idbGet, set as idbSet, del as idbDel } from 'idb-keyval'
import {
  debouncedPersist,
  flushPersist,
  cancelAllPendingPersists,
  persistSession,
  removePersistedSession,
  loadPersistedSessions,
  loadPersistedActiveSessionId,
  persistActiveSessionId,
  loadPersistedMessages,
  clearAllPersisted,
  defaultConnectionState,
} from './persistence'
import type { Session, Message } from '@/api/types'

function makeSession(id: string): Session {
  return {
    id,
    name: `Session ${id}`,
    status: 'idle',
    createdAt: '2026-01-01T00:00:00.000Z',
    workingDir: '/tmp/test',
  } as Session
}

function makeMessages(count: number): Message[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `msg-${i}`,
    role: 'user' as const,
    content: `Message ${i}`,
    timestamp: '2026-01-01T00:00:00.000Z',
  })) as Message[]
}

beforeEach(() => {
  store.clear()
  vi.clearAllMocks()
})

afterEach(() => {
  vi.useRealTimers()
})

// ---------------------------------------------------------------------------
// defaultConnectionState
// ---------------------------------------------------------------------------
describe('defaultConnectionState', () => {
  it('returns a disconnected state with sensible defaults', () => {
    const state = defaultConnectionState()
    expect(state.status).toBe('disconnected')
    expect(state.error).toBeNull()
    expect(state.retryCount).toBe(0)
    expect(state.isStreaming).toBe(false)
    expect(state.hasUnread).toBe(false)
    expect(state.unreadCount).toBe(0)
    expect(typeof state.lastActivity).toBe('number')
  })

  it('returns a fresh object on each call', () => {
    const a = defaultConnectionState()
    const b = defaultConnectionState()
    expect(a).not.toBe(b)
  })
})

// ---------------------------------------------------------------------------
// debouncedPersist
// ---------------------------------------------------------------------------
describe('debouncedPersist', () => {
  it('does not write immediately', () => {
    vi.useFakeTimers()
    const messages = makeMessages(2)
    debouncedPersist('s1', messages, 500)
    expect(idbSet).not.toHaveBeenCalled()
  })

  it('writes after the delay has elapsed', () => {
    vi.useFakeTimers()
    const messages = makeMessages(2)
    debouncedPersist('s1', messages, 500)
    vi.advanceTimersByTime(500)
    expect(idbSet).toHaveBeenCalledWith('messages:s1', messages)
  })

  it('resets the timer when called a second time before the delay', () => {
    vi.useFakeTimers()
    const first = makeMessages(1)
    const second = makeMessages(3)

    debouncedPersist('s1', first, 500)
    vi.advanceTimersByTime(300)
    // Timer should not have fired yet — reset it with the second call
    debouncedPersist('s1', second, 500)
    vi.advanceTimersByTime(300)
    // Only 300 ms has passed since the second call; should not have fired
    expect(idbSet).not.toHaveBeenCalled()

    vi.advanceTimersByTime(200)
    // Now 500 ms since the second call — should fire with the second payload
    expect(idbSet).toHaveBeenCalledTimes(1)
    expect(idbSet).toHaveBeenCalledWith('messages:s1', second)
  })

  it('handles multiple independent session IDs independently', () => {
    vi.useFakeTimers()
    const msgsA = makeMessages(1)
    const msgsB = makeMessages(2)

    debouncedPersist('a', msgsA, 500)
    debouncedPersist('b', msgsB, 500)

    vi.advanceTimersByTime(500)

    expect(idbSet).toHaveBeenCalledWith('messages:a', msgsA)
    expect(idbSet).toHaveBeenCalledWith('messages:b', msgsB)
    expect(idbSet).toHaveBeenCalledTimes(2)
  })
})

// ---------------------------------------------------------------------------
// flushPersist
// ---------------------------------------------------------------------------
describe('flushPersist', () => {
  it('writes immediately without waiting for a delay', () => {
    vi.useFakeTimers()
    const messages = makeMessages(2)
    flushPersist('s1', messages)
    expect(idbSet).toHaveBeenCalledWith('messages:s1', messages)
  })

  it('cancels a pending debounced write for the same session', () => {
    vi.useFakeTimers()
    const debounced = makeMessages(1)
    const flushed = makeMessages(3)

    debouncedPersist('s1', debounced, 500)
    // Before the timer fires, flush with a new payload
    flushPersist('s1', flushed)

    // Advance past the original debounce delay — timer must have been cancelled
    vi.advanceTimersByTime(600)

    expect(idbSet).toHaveBeenCalledTimes(1)
    expect(idbSet).toHaveBeenCalledWith('messages:s1', flushed)
  })

  it('does not cancel pending persists for other sessions', () => {
    vi.useFakeTimers()
    const msgsA = makeMessages(1)
    const msgsB = makeMessages(2)

    debouncedPersist('a', msgsA, 500)
    flushPersist('b', msgsB)

    vi.advanceTimersByTime(500)

    // 'b' flushed immediately, 'a' fired after its timer
    expect(idbSet).toHaveBeenCalledWith('messages:b', msgsB)
    expect(idbSet).toHaveBeenCalledWith('messages:a', msgsA)
  })
})

// ---------------------------------------------------------------------------
// cancelAllPendingPersists
// ---------------------------------------------------------------------------
describe('cancelAllPendingPersists', () => {
  it('prevents all pending debounced writes from executing', () => {
    vi.useFakeTimers()
    debouncedPersist('s1', makeMessages(1), 500)
    debouncedPersist('s2', makeMessages(2), 500)
    debouncedPersist('s3', makeMessages(3), 500)

    cancelAllPendingPersists()
    vi.advanceTimersByTime(1000)

    expect(idbSet).not.toHaveBeenCalled()
  })

  it('is safe to call when there are no pending persists', () => {
    vi.useFakeTimers()
    expect(() => cancelAllPendingPersists()).not.toThrow()
  })

  it('only cancels timers that were pending at call time', () => {
    vi.useFakeTimers()
    debouncedPersist('s1', makeMessages(1), 500)
    cancelAllPendingPersists()

    // Schedule a new persist after cancellation
    const messages = makeMessages(2)
    debouncedPersist('s2', messages, 500)
    vi.advanceTimersByTime(500)

    // The new one should still fire
    expect(idbSet).toHaveBeenCalledTimes(1)
    expect(idbSet).toHaveBeenCalledWith('messages:s2', messages)
  })
})

// ---------------------------------------------------------------------------
// persistSession / loadPersistedSessions
// ---------------------------------------------------------------------------
describe('persistSession / loadPersistedSessions', () => {
  it('round-trips a single session', async () => {
    const session = makeSession('abc')
    await persistSession(session)
    const sessions = await loadPersistedSessions()
    expect(sessions).toHaveLength(1)
    expect(sessions[0]).toEqual(session)
  })

  it('round-trips multiple sessions', async () => {
    const s1 = makeSession('s1')
    const s2 = makeSession('s2')
    await persistSession(s1)
    await persistSession(s2)
    const sessions = await loadPersistedSessions()
    const ids = sessions.map((s) => s.id).sort()
    expect(ids).toEqual(['s1', 's2'])
  })

  it('returns an empty array when no sessions are stored', async () => {
    const sessions = await loadPersistedSessions()
    expect(sessions).toEqual([])
  })

  it('ignores non-session keys during load', async () => {
    store.set('messages:xyz', [])
    store.set('activeSessionId', 's1')
    await persistSession(makeSession('s1'))
    const sessions = await loadPersistedSessions()
    expect(sessions).toHaveLength(1)
    expect(sessions[0].id).toBe('s1')
  })
})

// ---------------------------------------------------------------------------
// removePersistedSession
// ---------------------------------------------------------------------------
describe('removePersistedSession', () => {
  it('removes the session, messages, and ui-messages keys', async () => {
    store.set('session:s1', makeSession('s1'))
    store.set('messages:s1', makeMessages(2))
    store.set('ui-messages:s1', [])

    await removePersistedSession('s1')

    expect(idbDel).toHaveBeenCalledWith('session:s1')
    expect(idbDel).toHaveBeenCalledWith('messages:s1')
    expect(idbDel).toHaveBeenCalledWith('ui-messages:s1')
    expect(store.has('session:s1')).toBe(false)
    expect(store.has('messages:s1')).toBe(false)
    expect(store.has('ui-messages:s1')).toBe(false)
  })

  it('does not affect keys for other sessions', async () => {
    store.set('session:s1', makeSession('s1'))
    store.set('session:s2', makeSession('s2'))
    store.set('messages:s2', makeMessages(1))

    await removePersistedSession('s1')

    expect(store.has('session:s2')).toBe(true)
    expect(store.has('messages:s2')).toBe(true)
  })

  it('is safe to call when the session does not exist', async () => {
    await expect(removePersistedSession('nonexistent')).resolves.toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// persistActiveSessionId / loadPersistedActiveSessionId
// ---------------------------------------------------------------------------
describe('persistActiveSessionId / loadPersistedActiveSessionId', () => {
  it('round-trips the active session ID', async () => {
    await persistActiveSessionId('abc-123')
    const id = await loadPersistedActiveSessionId()
    expect(id).toBe('abc-123')
  })

  it('returns null when no active session ID is stored', async () => {
    const id = await loadPersistedActiveSessionId()
    expect(id).toBeNull()
  })

  it('returns null when the stored value is not a string', async () => {
    store.set('activeSessionId', 42)
    const id = await loadPersistedActiveSessionId()
    expect(id).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// loadPersistedMessages
// ---------------------------------------------------------------------------
describe('loadPersistedMessages', () => {
  it('returns stored messages for a session', async () => {
    const messages = makeMessages(3)
    store.set('messages:s1', messages)
    const result = await loadPersistedMessages('s1')
    expect(result).toEqual(messages)
  })

  it('returns null when no messages are stored', async () => {
    const result = await loadPersistedMessages('missing')
    expect(result).toBeNull()
  })

  it('returns null when the stored value is not an array', async () => {
    store.set('messages:s1', { not: 'an array' })
    const result = await loadPersistedMessages('s1')
    expect(result).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// clearAllPersisted
// ---------------------------------------------------------------------------
describe('clearAllPersisted', () => {
  it('removes all aperture-owned keys', async () => {
    store.set('session:s1', makeSession('s1'))
    store.set('messages:s1', makeMessages(1))
    store.set('ui-messages:s1', [])
    store.set('activeSessionId', 's1')

    await clearAllPersisted()

    expect(store.has('session:s1')).toBe(false)
    expect(store.has('messages:s1')).toBe(false)
    expect(store.has('ui-messages:s1')).toBe(false)
    expect(store.has('activeSessionId')).toBe(false)
  })

  it('leaves non-aperture keys untouched', async () => {
    store.set('session:s1', makeSession('s1'))
    store.set('some-other-app:data', { foo: 'bar' })
    store.set('unrelated-key', 123)

    await clearAllPersisted()

    expect(store.has('session:s1')).toBe(false)
    expect(store.has('some-other-app:data')).toBe(true)
    expect(store.has('unrelated-key')).toBe(true)
  })

  it('is safe to call on an empty store', async () => {
    await expect(clearAllPersisted()).resolves.toBeUndefined()
  })

  it('removes keys across all aperture namespaces in one call', async () => {
    for (let i = 0; i < 5; i++) {
      store.set(`session:s${i}`, makeSession(`s${i}`))
      store.set(`messages:s${i}`, makeMessages(1))
      store.set(`ui-messages:s${i}`, [])
    }
    store.set('activeSessionId', 's0')

    await clearAllPersisted()

    expect(store.size).toBe(0)
  })
})
