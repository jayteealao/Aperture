// SDK state slice — Claude SDK session config, usage, models, commands, MCP, checkpoints, account

import type { StateCreator } from 'zustand'
import type {
  SdkSessionConfig,
  SessionResult,
  AccountInfo,
  ModelInfo,
  SlashCommand,
  McpServerStatus,
  RewindFilesResult,
  SdkAuthStatus,
  SdkRuntimeStatus,
  SdkRuntimeActivityEntry,
  SdkMcpUpdateResult,
} from '@/api/types'
import type { SessionsStore } from './index'
import { cleanupSessionState } from './cleanup-helper'

const MAX_RUNTIME_ACTIVITY_ENTRIES = 50

// SDK session state
interface SdkLoadingState {
  config?: boolean
  models?: boolean
  commands?: boolean
  mcpStatus?: boolean
  mcpUpdate?: boolean
  accountInfo?: boolean
  checkpoints?: boolean
}

interface SdkErrorState {
  models?: string
  commands?: string
  mcpStatus?: string
  mcpUpdate?: string
  accountInfo?: string
  checkpoints?: string
}

export interface SdkSlice {
  // State
  sdkConfig: Record<string, SdkSessionConfig>
  sdkUsage: Record<string, SessionResult | null>
  sdkAccountInfo: Record<string, AccountInfo | null>
  sdkModels: Record<string, ModelInfo[]>
  sdkCommands: Record<string, SlashCommand[]>
  sdkMcpStatus: Record<string, McpServerStatus[]>
  sdkMcpUpdateResult: Record<string, SdkMcpUpdateResult | null>
  sdkCheckpoints: Record<string, string[]>
  sdkAuthStatus: Record<string, SdkAuthStatus | null>
  sdkRuntimeStatus: Record<string, SdkRuntimeStatus | null>
  sdkRuntimeActivity: Record<string, SdkRuntimeActivityEntry[]>
  sdkLoading: Record<string, SdkLoadingState>
  sdkErrors: Record<string, SdkErrorState>
  sdkRewindResult: Record<string, RewindFilesResult | null>

  // Actions
  setSdkConfig: (sessionId: string, config: SdkSessionConfig) => void
  setSdkUsage: (sessionId: string, usage: SessionResult | null) => void
  setSdkAccountInfo: (sessionId: string, info: AccountInfo | null) => void
  setSdkModels: (sessionId: string, models: ModelInfo[]) => void
  setSdkCommands: (sessionId: string, commands: SlashCommand[]) => void
  setSdkMcpStatus: (sessionId: string, status: McpServerStatus[]) => void
  setSdkMcpUpdateResult: (sessionId: string, result: SdkMcpUpdateResult | null) => void
  setSdkCheckpoints: (sessionId: string, checkpoints: string[]) => void
  setSdkAuthStatus: (sessionId: string, status: SdkAuthStatus | null) => void
  setSdkRuntimeStatus: (sessionId: string, status: SdkRuntimeStatus | null) => void
  addSdkRuntimeActivity: (sessionId: string, activity: SdkRuntimeActivityEntry) => void
  clearSdkRuntimeActivity: (sessionId: string) => void
  setSdkLoading: (sessionId: string, loading: Partial<SdkLoadingState>) => void
  setSdkErrors: (sessionId: string, errors: Partial<SdkErrorState>) => void
  setSdkRewindResult: (sessionId: string, result: RewindFilesResult | null) => void

  // Cleanup (called by removeSession)
  cleanupSdkState: (sessionId: string) => void
}

export const sdkSliceInitialState = {
  sdkConfig: {} as Record<string, SdkSessionConfig>,
  sdkUsage: {} as Record<string, SessionResult | null>,
  sdkAccountInfo: {} as Record<string, AccountInfo | null>,
  sdkModels: {} as Record<string, ModelInfo[]>,
  sdkCommands: {} as Record<string, SlashCommand[]>,
  sdkMcpStatus: {} as Record<string, McpServerStatus[]>,
  sdkMcpUpdateResult: {} as Record<string, SdkMcpUpdateResult | null>,
  sdkCheckpoints: {} as Record<string, string[]>,
  sdkAuthStatus: {} as Record<string, SdkAuthStatus | null>,
  sdkRuntimeStatus: {} as Record<string, SdkRuntimeStatus | null>,
  sdkRuntimeActivity: {} as Record<string, SdkRuntimeActivityEntry[]>,
  sdkLoading: {} as Record<string, SdkLoadingState>,
  sdkErrors: {} as Record<string, SdkErrorState>,
  sdkRewindResult: {} as Record<string, RewindFilesResult | null>,
}

export const createSdkSlice: StateCreator<SessionsStore, [], [], SdkSlice> = (set) => ({
  ...sdkSliceInitialState,

  setSdkConfig: (sessionId, config) => {
    set((state) => ({
      sdkConfig: { ...state.sdkConfig, [sessionId]: config },
    }))
  },

  setSdkUsage: (sessionId, usage) => {
    set((state) => ({
      sdkUsage: { ...state.sdkUsage, [sessionId]: usage },
    }))
  },

  setSdkAccountInfo: (sessionId, info) => {
    set((state) => ({
      sdkAccountInfo: { ...state.sdkAccountInfo, [sessionId]: info },
    }))
  },

  setSdkModels: (sessionId, models) => {
    set((state) => ({
      sdkModels: { ...state.sdkModels, [sessionId]: models },
    }))
  },

  setSdkCommands: (sessionId, commands) => {
    set((state) => ({
      sdkCommands: { ...state.sdkCommands, [sessionId]: commands },
    }))
  },

  setSdkMcpStatus: (sessionId, status) => {
    set((state) => ({
      sdkMcpStatus: { ...state.sdkMcpStatus, [sessionId]: status },
    }))
  },

  setSdkMcpUpdateResult: (sessionId, result) => {
    set((state) => ({
      sdkMcpUpdateResult: { ...state.sdkMcpUpdateResult, [sessionId]: result },
    }))
  },

  setSdkCheckpoints: (sessionId, checkpoints) => {
    set((state) => ({
      sdkCheckpoints: { ...state.sdkCheckpoints, [sessionId]: checkpoints },
    }))
  },

  setSdkAuthStatus: (sessionId, status) => {
    set((state) => ({
      sdkAuthStatus: { ...state.sdkAuthStatus, [sessionId]: status },
    }))
  },

  setSdkRuntimeStatus: (sessionId, status) => {
    set((state) => ({
      sdkRuntimeStatus: { ...state.sdkRuntimeStatus, [sessionId]: status },
    }))
  },

  addSdkRuntimeActivity: (sessionId, activity) => {
    set((state) => {
      const currentEntries = state.sdkRuntimeActivity[sessionId] || []
      const nextEntries = [...currentEntries, activity].slice(-MAX_RUNTIME_ACTIVITY_ENTRIES)
      return {
        sdkRuntimeActivity: { ...state.sdkRuntimeActivity, [sessionId]: nextEntries },
      }
    })
  },

  clearSdkRuntimeActivity: (sessionId) => {
    set((state) => ({
      sdkRuntimeActivity: { ...state.sdkRuntimeActivity, [sessionId]: [] },
    }))
  },

  setSdkLoading: (sessionId, loading) => {
    set((state) => ({
      sdkLoading: {
        ...state.sdkLoading,
        [sessionId]: { ...state.sdkLoading[sessionId], ...loading },
      },
    }))
  },

  setSdkErrors: (sessionId, errors) => {
    set((state) => ({
      sdkErrors: {
        ...state.sdkErrors,
        [sessionId]: { ...state.sdkErrors[sessionId], ...errors },
      },
    }))
  },

  setSdkRewindResult: (sessionId, result) => {
    set((state) => ({
      sdkRewindResult: { ...state.sdkRewindResult, [sessionId]: result },
    }))
  },

  cleanupSdkState: (sessionId) => {
    set((state) => cleanupSessionState(state, sdkSliceInitialState, sessionId))
  },
})
