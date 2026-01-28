/**
 * Hook for Pi SDK session operations
 * Provides convenient access to Pi-specific session features
 */

import { useCallback, useMemo } from 'react'
import { useSessionsStore } from '@/stores/sessions'
import type {
  PiSessionConfig,
  PiSessionStats,
  PiModelInfo,
  PiSessionTree,
  PiThinkingLevel,
  PiForkableEntry,
} from '@/api/pi-types'

export interface UsePiSessionReturn {
  // State
  config: PiSessionConfig | undefined
  stats: PiSessionStats | null
  models: PiModelInfo[]
  sessionTree: PiSessionTree | null
  forkableEntries: PiForkableEntry[]
  thinkingLevel: PiThinkingLevel
  isLoading: {
    config?: boolean
    models?: boolean
    stats?: boolean
    tree?: boolean
    forkable?: boolean
  }
  errors: {
    models?: string
    stats?: string
    tree?: string
  }

  // Actions - Streaming Control
  steer: (content: string) => void
  followUp: (content: string) => void

  // Actions - Context Management
  compact: (instructions?: string) => void
  newSession: () => void

  // Actions - Branching
  fork: (entryId: string) => void
  navigate: (entryId: string) => void
  refreshTree: () => void
  refreshForkable: () => void

  // Actions - Model/Thinking
  setModel: (provider: string, modelId: string) => void
  cycleModel: () => void
  setThinkingLevel: (level: PiThinkingLevel) => void
  cycleThinking: () => void

  // Actions - Info
  refreshStats: () => void
  refreshModels: () => void

  // Computed
  isPiSession: boolean
  hasTree: boolean
  canFork: boolean
}

/**
 * Hook for managing Pi SDK session state and actions
 *
 * @param sessionId - The session ID to manage (or null for no session)
 * @returns Pi session state and action methods
 *
 * @example
 * ```tsx
 * function PiSessionControls({ sessionId }) {
 *   const {
 *     thinkingLevel,
 *     models,
 *     cycleModel,
 *     cycleThinking,
 *     steer,
 *     compact,
 *   } = usePiSession(sessionId)
 *
 *   return (
 *     <div>
 *       <button onClick={cycleModel}>Cycle Model</button>
 *       <button onClick={cycleThinking}>
 *         Thinking: {thinkingLevel}
 *       </button>
 *       <button onClick={() => compact()}>Compact Context</button>
 *     </div>
 *   )
 * }
 * ```
 */
export function usePiSession(sessionId: string | null): UsePiSessionReturn {
  const {
    sessions,
    piConfig,
    piStats,
    piModels,
    piSessionTree,
    piForkableEntries,
    piThinkingLevel,
    piLoading,
    piErrors,
    piSteer,
    piFollowUp,
    piCompact,
    piFork,
    piNavigate,
    piSetModel,
    piCycleModel,
    piSetThinkingLevel,
    piCycleThinking,
    piNewSession,
    piGetTree,
    piGetForkable,
    piGetStats,
    piGetModels,
  } = useSessionsStore()

  // Check if this is a Pi session
  const session = sessions.find((s) => s.id === sessionId)
  const isPiSession = session?.agent === 'pi_sdk'

  // Get state for this session
  const config = sessionId ? piConfig[sessionId] : undefined
  const stats = sessionId ? piStats[sessionId] ?? null : null
  const models = sessionId ? piModels[sessionId] ?? [] : []
  const sessionTree = sessionId ? piSessionTree[sessionId] ?? null : null
  const forkableEntries = sessionId ? piForkableEntries[sessionId] ?? [] : []
  const thinkingLevel = sessionId ? piThinkingLevel[sessionId] ?? 'off' : 'off'
  const isLoading = sessionId ? piLoading[sessionId] ?? {} : {}
  const errors = sessionId ? piErrors[sessionId] ?? {} : {}

  // Streaming control actions
  const steer = useCallback(
    (content: string) => {
      if (sessionId && isPiSession) {
        piSteer(sessionId, content)
      }
    },
    [sessionId, isPiSession, piSteer]
  )

  const followUp = useCallback(
    (content: string) => {
      if (sessionId && isPiSession) {
        piFollowUp(sessionId, content)
      }
    },
    [sessionId, isPiSession, piFollowUp]
  )

  // Context management actions
  const compact = useCallback(
    (instructions?: string) => {
      if (sessionId && isPiSession) {
        piCompact(sessionId, instructions)
      }
    },
    [sessionId, isPiSession, piCompact]
  )

  const newSession = useCallback(() => {
    if (sessionId && isPiSession) {
      piNewSession(sessionId)
    }
  }, [sessionId, isPiSession, piNewSession])

  // Branching actions
  const fork = useCallback(
    (entryId: string) => {
      if (sessionId && isPiSession) {
        piFork(sessionId, entryId)
      }
    },
    [sessionId, isPiSession, piFork]
  )

  const navigate = useCallback(
    (entryId: string) => {
      if (sessionId && isPiSession) {
        piNavigate(sessionId, entryId)
      }
    },
    [sessionId, isPiSession, piNavigate]
  )

  const refreshTree = useCallback(() => {
    if (sessionId && isPiSession) {
      piGetTree(sessionId)
    }
  }, [sessionId, isPiSession, piGetTree])

  const refreshForkable = useCallback(() => {
    if (sessionId && isPiSession) {
      piGetForkable(sessionId)
    }
  }, [sessionId, isPiSession, piGetForkable])

  // Model/Thinking actions
  const setModel = useCallback(
    (provider: string, modelId: string) => {
      if (sessionId && isPiSession) {
        piSetModel(sessionId, provider, modelId)
      }
    },
    [sessionId, isPiSession, piSetModel]
  )

  const cycleModel = useCallback(() => {
    if (sessionId && isPiSession) {
      piCycleModel(sessionId)
    }
  }, [sessionId, isPiSession, piCycleModel])

  const setThinkingLevel = useCallback(
    (level: PiThinkingLevel) => {
      if (sessionId && isPiSession) {
        piSetThinkingLevel(sessionId, level)
      }
    },
    [sessionId, isPiSession, piSetThinkingLevel]
  )

  const cycleThinking = useCallback(() => {
    if (sessionId && isPiSession) {
      piCycleThinking(sessionId)
    }
  }, [sessionId, isPiSession, piCycleThinking])

  // Info refresh actions
  const refreshStats = useCallback(() => {
    if (sessionId && isPiSession) {
      piGetStats(sessionId)
    }
  }, [sessionId, isPiSession, piGetStats])

  const refreshModels = useCallback(() => {
    if (sessionId && isPiSession) {
      piGetModels(sessionId)
    }
  }, [sessionId, isPiSession, piGetModels])

  // Computed values
  const hasTree = sessionTree !== null && sessionTree.entries.length > 0
  const canFork = forkableEntries.length > 0

  return useMemo(
    () => ({
      // State
      config,
      stats,
      models,
      sessionTree,
      forkableEntries,
      thinkingLevel,
      isLoading,
      errors,

      // Actions
      steer,
      followUp,
      compact,
      newSession,
      fork,
      navigate,
      refreshTree,
      refreshForkable,
      setModel,
      cycleModel,
      setThinkingLevel,
      cycleThinking,
      refreshStats,
      refreshModels,

      // Computed
      isPiSession,
      hasTree,
      canFork,
    }),
    [
      config,
      stats,
      models,
      sessionTree,
      forkableEntries,
      thinkingLevel,
      isLoading,
      errors,
      steer,
      followUp,
      compact,
      newSession,
      fork,
      navigate,
      refreshTree,
      refreshForkable,
      setModel,
      cycleModel,
      setThinkingLevel,
      cycleThinking,
      refreshStats,
      refreshModels,
      isPiSession,
      hasTree,
      canFork,
    ]
  )
}
