// Pi state slice — Pi SDK session config, stats, models, tree, forkable, thinking, WS commands

import type { StateCreator } from 'zustand'
import type {
  PiSessionConfig,
  PiSessionStats,
  PiModelInfo,
  PiSessionTree,
  PiThinkingLevel,
  PiForkableEntry,
} from '@/api/pi-types'
import { wsManager } from '@/api/websocket'
import type { SessionsStore } from './index'
import { cleanupSessionState } from './cleanup-helper'

// Pi SDK loading state
interface PiLoadingState {
  config?: boolean
  models?: boolean
  stats?: boolean
  tree?: boolean
  forkable?: boolean
}

// Pi SDK error state
interface PiErrorState {
  models?: string
  stats?: string
  tree?: string
}

export interface PiSlice {
  // State
  piConfig: Record<string, PiSessionConfig>
  piStats: Record<string, PiSessionStats | null>
  piModels: Record<string, PiModelInfo[]>
  piSessionTree: Record<string, PiSessionTree | null>
  piForkableEntries: Record<string, PiForkableEntry[]>
  piThinkingLevel: Record<string, PiThinkingLevel>
  piLoading: Record<string, PiLoadingState>
  piErrors: Record<string, PiErrorState>

  // Setters
  setPiConfig: (sessionId: string, config: PiSessionConfig) => void
  setPiStats: (sessionId: string, stats: PiSessionStats | null) => void
  setPiModels: (sessionId: string, models: PiModelInfo[]) => void
  setPiSessionTree: (sessionId: string, tree: PiSessionTree | null) => void
  setPiForkableEntries: (sessionId: string, entries: PiForkableEntry[]) => void
  setPiThinkingLevel: (sessionId: string, level: PiThinkingLevel) => void
  setPiLoading: (sessionId: string, loading: Partial<PiLoadingState>) => void
  setPiErrors: (sessionId: string, errors: Partial<PiErrorState>) => void

  // Pi WebSocket commands
  piSteer: (sessionId: string, content: string) => void
  piFollowUp: (sessionId: string, content: string) => void
  piCompact: (sessionId: string, instructions?: string) => void
  piFork: (sessionId: string, entryId: string) => void
  piNavigate: (sessionId: string, entryId: string) => void
  piSetModel: (sessionId: string, provider: string, modelId: string) => void
  piCycleModel: (sessionId: string) => void
  piSetThinkingLevel: (sessionId: string, level: PiThinkingLevel) => void
  piCycleThinking: (sessionId: string) => void
  piNewSession: (sessionId: string) => void
  piGetTree: (sessionId: string) => void
  piGetForkable: (sessionId: string) => void
  piGetStats: (sessionId: string) => void
  piGetModels: (sessionId: string) => void

  // Cleanup (called by removeSession)
  cleanupPiState: (sessionId: string) => void
}

export const piSliceInitialState = {
  piConfig: {} as Record<string, PiSessionConfig>,
  piStats: {} as Record<string, PiSessionStats | null>,
  piModels: {} as Record<string, PiModelInfo[]>,
  piSessionTree: {} as Record<string, PiSessionTree | null>,
  piForkableEntries: {} as Record<string, PiForkableEntry[]>,
  piThinkingLevel: {} as Record<string, PiThinkingLevel>,
  piLoading: {} as Record<string, PiLoadingState>,
  piErrors: {} as Record<string, PiErrorState>,
}

export const createPiSlice: StateCreator<SessionsStore, [], [], PiSlice> = (set, get) => ({
  ...piSliceInitialState,

  // Setters
  setPiConfig: (sessionId, config) => {
    set((state) => ({
      piConfig: { ...state.piConfig, [sessionId]: config },
    }))
  },

  setPiStats: (sessionId, stats) => {
    set((state) => ({
      piStats: { ...state.piStats, [sessionId]: stats },
    }))
  },

  setPiModels: (sessionId, models) => {
    set((state) => ({
      piModels: { ...state.piModels, [sessionId]: models },
    }))
  },

  setPiSessionTree: (sessionId, tree) => {
    set((state) => ({
      piSessionTree: { ...state.piSessionTree, [sessionId]: tree },
    }))
  },

  setPiForkableEntries: (sessionId, entries) => {
    set((state) => ({
      piForkableEntries: { ...state.piForkableEntries, [sessionId]: entries },
    }))
  },

  setPiThinkingLevel: (sessionId, level) => {
    set((state) => ({
      piThinkingLevel: { ...state.piThinkingLevel, [sessionId]: level },
    }))
  },

  setPiLoading: (sessionId, loading) => {
    set((state) => ({
      piLoading: {
        ...state.piLoading,
        [sessionId]: { ...state.piLoading[sessionId], ...loading },
      },
    }))
  },

  setPiErrors: (sessionId, errors) => {
    set((state) => ({
      piErrors: {
        ...state.piErrors,
        [sessionId]: { ...state.piErrors[sessionId], ...errors },
      },
    }))
  },

  // Pi WebSocket commands
  piSteer: (sessionId, content) => {
    wsManager.send(sessionId, { type: 'pi_steer', content })
  },

  piFollowUp: (sessionId, content) => {
    wsManager.send(sessionId, { type: 'pi_follow_up', content })
  },

  piCompact: (sessionId, instructions) => {
    wsManager.send(sessionId, { type: 'pi_compact', instructions })
  },

  piFork: (sessionId, entryId) => {
    wsManager.send(sessionId, { type: 'pi_fork', entryId })
  },

  piNavigate: (sessionId, entryId) => {
    wsManager.send(sessionId, { type: 'pi_navigate', entryId })
  },

  piSetModel: (sessionId, provider, modelId) => {
    wsManager.send(sessionId, { type: 'pi_set_model', provider, modelId })
  },

  piCycleModel: (sessionId) => {
    wsManager.send(sessionId, { type: 'pi_cycle_model' })
  },

  piSetThinkingLevel: (sessionId, level) => {
    wsManager.send(sessionId, { type: 'pi_set_thinking_level', level })
  },

  piCycleThinking: (sessionId) => {
    wsManager.send(sessionId, { type: 'pi_cycle_thinking' })
  },

  piNewSession: (sessionId) => {
    wsManager.send(sessionId, { type: 'pi_new_session' })
  },

  piGetTree: (sessionId) => {
    get().setPiLoading(sessionId, { tree: true })
    wsManager.send(sessionId, { type: 'pi_get_tree' })
  },

  piGetForkable: (sessionId) => {
    get().setPiLoading(sessionId, { forkable: true })
    wsManager.send(sessionId, { type: 'pi_get_forkable' })
  },

  piGetStats: (sessionId) => {
    get().setPiLoading(sessionId, { stats: true })
    wsManager.send(sessionId, { type: 'pi_get_stats' })
  },

  piGetModels: (sessionId) => {
    get().setPiLoading(sessionId, { models: true })
    wsManager.send(sessionId, { type: 'pi_get_models' })
  },

  // Cleanup — fixes the Pi state leak bug in the old monolithic store
  cleanupPiState: (sessionId) => {
    set((state) => cleanupSessionState(state, piSliceInitialState, sessionId))
  },
})
