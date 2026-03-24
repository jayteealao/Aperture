// Session lifecycle slice — session list, active session, add/remove with cross-slice cleanup

import type { StateCreator } from 'zustand'
import type { Session, SessionStatus, ConnectionState } from '@/api/types'
import { wsManager } from '@/api/websocket'
import { api } from '@/api/client'
import { DEFAULT_SDK_MODELS } from '@/utils/constants'
import type { SessionsStore } from './index'
import {
  defaultConnectionState,
  persistSession,
  removePersistedSession,
  loadPersistedSessions,
  loadPersistedActiveSessionId,
  persistActiveSessionId,
  clearAllPersisted,
  cancelAllPendingPersists,
} from './persistence'
import { connectionSliceInitialState } from './connection-slice'
import { permissionSliceInitialState } from './permission-slice'
import { sdkSliceInitialState } from './sdk-slice'
import { piSliceInitialState } from './pi-slice'

export interface SessionSlice {
  sessions: Session[]
  activeSessionId: string | null

  setSessions: (sessions: Session[]) => void
  addSession: (session: Session) => Promise<void>
  removeSession: (sessionId: string) => Promise<void>
  updateSessionStatus: (sessionId: string, status: SessionStatus) => void
  updateSessionTitle: (sessionId: string, title: string) => void
  setActiveSession: (sessionId: string | null) => void
  getActiveSession: () => Session | null

  // Persistence
  restoreFromStorage: () => Promise<void>
  clearAll: () => Promise<void>
}

export const sessionSliceInitialState = {
  sessions: [] as Session[],
  activeSessionId: null as string | null,
}

export const createSessionSlice: StateCreator<SessionsStore, [], [], SessionSlice> = (set, get) => ({
  ...sessionSliceInitialState,

  setSessions: (sessions) => {
    const connections: Record<string, ConnectionState> = {}
    sessions.forEach((s) => {
      connections[s.id] = get().connections[s.id] || defaultConnectionState()
    })
    set({ sessions, connections })
  },

  addSession: async (session) => {
    set((state) => {
      const updates: Partial<SessionsStore> = {
        sessions: [...state.sessions.filter((s) => s.id !== session.id), session],
        connections: {
          ...state.connections,
          [session.id]: state.connections[session.id] || defaultConnectionState(),
        },
      }
      // Initialize SDK sessions with default models
      if (session.agent === 'claude_sdk') {
        updates.sdkModels = {
          ...state.sdkModels,
          [session.id]: [...DEFAULT_SDK_MODELS],
        }
      }
      return updates
    })
    // Persist to IndexedDB
    await persistSession(session)
  },

  removeSession: async (sessionId) => {
    wsManager.disconnect(sessionId)

    // Clean up all state — this is the orchestrator that fixes the Pi state leak bug.
    // The old monolithic store forgot to clean up Pi maps. Now each slice has a cleanup method.
    get().cleanupSdkState(sessionId)
    get().cleanupPiState(sessionId)
    get().cleanupConnection(sessionId)
    get().removePendingPermissionsForSession(sessionId)

    set((state) => ({
      sessions: state.sessions.filter((s) => s.id !== sessionId),
      activeSessionId: state.activeSessionId === sessionId ? null : state.activeSessionId,
    }))

    // Remove from IndexedDB
    await removePersistedSession(sessionId)
  },

  updateSessionStatus: (sessionId, status) => {
    set((state) => ({
      sessions: state.sessions.map((s) =>
        s.id === sessionId ? { ...s, status } : s
      ),
    }))
  },

  updateSessionTitle: (sessionId, title) => {
    set((state) => ({
      sessions: state.sessions.map((s) =>
        s.id === sessionId ? { ...s, title } : s
      ),
    }))
  },

  setActiveSession: (sessionId) => {
    set({ activeSessionId: sessionId })
    if (sessionId) {
      get().clearUnread(sessionId)
      persistActiveSessionId(sessionId)
    }
  },

  getActiveSession: () => {
    const { sessions, activeSessionId } = get()
    return sessions.find((s) => s.id === activeSessionId) || null
  },

  // Persistence
  restoreFromStorage: async () => {
    let sessionsFromServer: Session[] = []

    try {
      const response = await api.listSessions()
      sessionsFromServer = response.sessions
    } catch (err) {
      if (import.meta.env.DEV) {
        console.warn('[Sessions] Failed to fetch sessions from backend, falling back to IndexedDB:', err)
      }
    }

    const sessions = sessionsFromServer.length > 0
      ? sessionsFromServer
      : await loadPersistedSessions()

    if (sessions.length > 0) {
      get().setSessions(sessions)
      await Promise.all(sessions.map((session) => persistSession(session)))
    }

    // Restore active session
    const activeId = await loadPersistedActiveSessionId()
    if (activeId) {
      const exists = sessions.find((s) => s.id === activeId)
      if (exists) {
        set({ activeSessionId: activeId })
      }
    }
  },

  clearAll: async () => {
    wsManager.disconnectAll()
    // Cancel pending debounced persistence timers before clearing storage
    // to prevent stale data being written after the reset
    cancelAllPendingPersists()
    await clearAllPersisted()

    set({
      ...sessionSliceInitialState,
      ...connectionSliceInitialState,
      ...permissionSliceInitialState,
      ...sdkSliceInitialState,
      ...piSliceInitialState,
    })
  },
})
