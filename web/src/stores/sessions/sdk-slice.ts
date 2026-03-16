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
  SdkContentBlock,
} from '@/api/types'
import type { SessionsStore } from './index'
import { cleanupSessionState } from './cleanup-helper'

// SDK session state
interface SdkLoadingState {
  config?: boolean
  models?: boolean
  commands?: boolean
  mcpStatus?: boolean
  accountInfo?: boolean
  checkpoints?: boolean
}

interface SdkErrorState {
  models?: string
  commands?: string
  mcpStatus?: string
  accountInfo?: string
}

// SDK streaming state for tracking content blocks during streaming
export interface SdkStreamingState {
  messageId: string
  contentBlocks: SdkContentBlock[]
  currentBlockIndex: number
}

export interface SdkSlice {
  // State
  sdkConfig: Record<string, SdkSessionConfig>
  sdkUsage: Record<string, SessionResult | null>
  sdkAccountInfo: Record<string, AccountInfo | null>
  sdkModels: Record<string, ModelInfo[]>
  sdkCommands: Record<string, SlashCommand[]>
  sdkMcpStatus: Record<string, McpServerStatus[]>
  sdkCheckpoints: Record<string, string[]>
  sdkLoading: Record<string, SdkLoadingState>
  sdkErrors: Record<string, SdkErrorState>
  sdkRewindResult: Record<string, RewindFilesResult | null>
  sdkStreamingState: Record<string, SdkStreamingState | null>

  // Actions
  setSdkConfig: (sessionId: string, config: SdkSessionConfig) => void
  setSdkUsage: (sessionId: string, usage: SessionResult | null) => void
  setSdkAccountInfo: (sessionId: string, info: AccountInfo | null) => void
  setSdkModels: (sessionId: string, models: ModelInfo[]) => void
  setSdkCommands: (sessionId: string, commands: SlashCommand[]) => void
  setSdkMcpStatus: (sessionId: string, status: McpServerStatus[]) => void
  setSdkCheckpoints: (sessionId: string, checkpoints: string[]) => void
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
  sdkCheckpoints: {} as Record<string, string[]>,
  sdkLoading: {} as Record<string, SdkLoadingState>,
  sdkErrors: {} as Record<string, SdkErrorState>,
  sdkRewindResult: {} as Record<string, RewindFilesResult | null>,
  sdkStreamingState: {} as Record<string, SdkStreamingState | null>,
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

  setSdkCheckpoints: (sessionId, checkpoints) => {
    set((state) => ({
      sdkCheckpoints: { ...state.sdkCheckpoints, [sessionId]: checkpoints },
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
