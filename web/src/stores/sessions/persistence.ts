// IndexedDB persistence helpers for session/message storage

import { get as idbGet, set as idbSet, del as idbDel, keys as idbKeys } from 'idb-keyval'
import type { ConnectionState, Message, Session } from '@/api/types'

// Debounced persistence for high-frequency message updates (streaming)
const persistenceTimers: Record<string, ReturnType<typeof setTimeout>> = {}

export function debouncedPersist(sessionId: string, messages: Message[], delayMs = 500): void {
  if (persistenceTimers[sessionId]) {
    clearTimeout(persistenceTimers[sessionId])
  }
  persistenceTimers[sessionId] = setTimeout(() => {
    idbSet(`messages:${sessionId}`, messages)
    delete persistenceTimers[sessionId]
  }, delayMs)
}

export function flushPersist(sessionId: string, messages: Message[]): void {
  // Cancel any pending debounced persist and immediately save
  if (persistenceTimers[sessionId]) {
    clearTimeout(persistenceTimers[sessionId])
    delete persistenceTimers[sessionId]
  }
  idbSet(`messages:${sessionId}`, messages)
}

export function cancelAllPendingPersists(): void {
  for (const sessionId of Object.keys(persistenceTimers)) {
    clearTimeout(persistenceTimers[sessionId])
    delete persistenceTimers[sessionId]
  }
}

export function defaultConnectionState(): ConnectionState {
  return {
    status: 'disconnected',
    error: null,
    retryCount: 0,
    isStreaming: false,
    hasUnread: false,
    unreadCount: 0,
    lastActivity: Date.now(),
  }
}

export async function persistSession(session: Session): Promise<void> {
  await idbSet(`session:${session.id}`, session)
}

export async function removePersistedSession(sessionId: string): Promise<void> {
  await idbDel(`session:${sessionId}`)
  await idbDel(`messages:${sessionId}`)
  // Also clean up the new useChat persistence key
  await idbDel(`ui-messages:${sessionId}`)
}

export async function loadPersistedSessions(): Promise<Session[]> {
  const allKeys = await idbKeys()
  const sessionKeys = allKeys.filter((k) => typeof k === 'string' && k.startsWith('session:'))

  const sessions: Session[] = []
  for (const key of sessionKeys) {
    const session = await idbGet(key)
    if (session) {
      sessions.push(session as Session)
    }
  }
  return sessions
}

export async function loadPersistedActiveSessionId(): Promise<string | null> {
  const activeId = await idbGet('activeSessionId')
  if (activeId && typeof activeId === 'string') {
    return activeId
  }
  return null
}

export async function persistActiveSessionId(sessionId: string): Promise<void> {
  await idbSet('activeSessionId', sessionId)
}

export async function loadPersistedMessages(sessionId: string): Promise<Message[] | null> {
  const stored = await idbGet(`messages:${sessionId}`)
  if (stored && Array.isArray(stored)) {
    return stored as Message[]
  }
  return null
}

/** Clear only Aperture's keys from IndexedDB (not the entire default store) */
export async function clearAllPersisted(): Promise<void> {
  const allKeys = await idbKeys()
  const apertureKeys = allKeys.filter(
    (k) =>
      typeof k === 'string' &&
      (k.startsWith('session:') || k.startsWith('messages:') || k.startsWith('ui-messages:') || k === 'activeSessionId')
  )
  for (const key of apertureKeys) {
    await idbDel(key)
  }
}
