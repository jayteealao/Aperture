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
const SDK_HYDRATION_RESOURCES = ['models', 'commands', 'mcpStatus', 'accountInfo', 'checkpoints'] as const
type SdkHydrationResource = (typeof SDK_HYDRATION_RESOURCES)[number]

type HydrationStatus = 'idle' | 'requested' | 'fulfilled' | 'failed'

interface SdkResourceHydrationState {
  status: HydrationStatus
  stale: boolean
  connectionEpoch: number
}

interface SdkHydrationState {
  connectionEpoch: number
  resources: Partial<Record<SdkHydrationResource, SdkResourceHydrationState>>
}

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
  sdkHydration: Record<string, SdkHydrationState>
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
  markSdkHydrationRequested: (sessionId: string, resource: SdkHydrationResource) => void
  markSdkHydrationFulfilled: (sessionId: string, resource: SdkHydrationResource) => void
  markSdkHydrationFailed: (sessionId: string, resource: SdkHydrationResource) => void
  markSdkHydrationStale: (sessionId: string, resources?: SdkHydrationResource[]) => void
  markSdkHydrationConnected: (sessionId: string) => void
  shouldHydrateSdkResource: (sessionId: string, resource: SdkHydrationResource) => boolean
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
  sdkHydration: {} as Record<string, SdkHydrationState>,
  sdkLoading: {} as Record<string, SdkLoadingState>,
  sdkErrors: {} as Record<string, SdkErrorState>,
  sdkRewindResult: {} as Record<string, RewindFilesResult | null>,
}

export const createSdkSlice: StateCreator<SessionsStore, [], [], SdkSlice> = (set, get) => ({
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

  markSdkHydrationRequested: (sessionId, resource) => {
    patchHydrationResource(set, sessionId, resource, { status: 'requested', stale: false })
  },

  markSdkHydrationFulfilled: (sessionId, resource) => {
    patchHydrationResource(set, sessionId, resource, { status: 'fulfilled', stale: false })
  },

  markSdkHydrationFailed: (sessionId, resource) => {
    patchHydrationResource(set, sessionId, resource, { status: 'failed', stale: false })
  },

  markSdkHydrationStale: (sessionId, resources = [...SDK_HYDRATION_RESOURCES]) => {
    set((state) => {
      const hydration = state.sdkHydration[sessionId] ?? EMPTY_HYDRATION
      const nextResources = { ...hydration.resources }
      for (const resource of resources) {
        const current = nextResources[resource]
        if (current?.stale) continue
        nextResources[resource] = {
          ...(current ?? DEFAULT_RESOURCE(hydration.connectionEpoch)),
          stale: true,
        }
      }
      return {
        sdkHydration: {
          ...state.sdkHydration,
          [sessionId]: { connectionEpoch: hydration.connectionEpoch, resources: nextResources },
        },
      }
    })
  },

  markSdkHydrationConnected: (sessionId) => {
    set((state) => {
      const previous = state.sdkHydration[sessionId] ?? EMPTY_HYDRATION
      const nextEpoch = previous.connectionEpoch + 1
      const nextResources: SdkHydrationState['resources'] = {}
      for (const resource of SDK_HYDRATION_RESOURCES) {
        nextResources[resource] = {
          ...(previous.resources[resource] ?? DEFAULT_RESOURCE(nextEpoch)),
          stale: true,
          connectionEpoch: nextEpoch,
        }
      }
      return {
        sdkHydration: {
          ...state.sdkHydration,
          [sessionId]: { connectionEpoch: nextEpoch, resources: nextResources },
        },
      }
    })
  },

  shouldHydrateSdkResource: (sessionId, resource) => {
    const state = get()
    if (state.sdkLoading[sessionId]?.[resource]) {
      return false
    }
    const resourceState = state.sdkHydration[sessionId]?.resources[resource]
    if (!resourceState) {
      return true
    }
    if (resourceState.stale) {
      return true
    }
    // Don't auto-retry failures; wait for reconnect (which sets stale: true)
    if (resourceState.status === 'failed') {
      return false
    }
    return resourceState.status !== 'fulfilled'
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

const EMPTY_HYDRATION: SdkHydrationState = { connectionEpoch: 0, resources: {} }

function DEFAULT_RESOURCE(epoch: number): SdkResourceHydrationState {
  return { status: 'idle', stale: true, connectionEpoch: epoch }
}

type SetFn = Parameters<typeof createSdkSlice>[0]

function patchHydrationResource(
  set: SetFn,
  sessionId: string,
  resource: SdkHydrationResource,
  patch: Partial<SdkResourceHydrationState>,
) {
  set((state) => {
    const hydration = state.sdkHydration[sessionId] ?? EMPTY_HYDRATION
    const current = hydration.resources[resource] ?? DEFAULT_RESOURCE(hydration.connectionEpoch)
    return {
      sdkHydration: {
        ...state.sdkHydration,
        [sessionId]: {
          connectionEpoch: hydration.connectionEpoch,
          resources: {
            ...hydration.resources,
            [resource]: { ...current, ...patch, connectionEpoch: hydration.connectionEpoch },
          },
        },
      },
    }
  })
}
