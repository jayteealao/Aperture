import { useCallback } from 'react'
import { useSessionsStore } from '@/stores/sessions'
import { wsManager } from '@/api/websocket'
import { api } from '@/api/client'
import type {
  ClaudeEffort,
  PermissionMode,
  SdkSessionConfig,
  McpServerConfig,
  ExtendedOutboundMessage,
} from '@/api/types'

export function useSdkSession(sessionId: string | null) {
  const {
    sessions,
    sdkConfig,
    sdkUsage,
    sdkAccountInfo,
    sdkModels,
    sdkCommands,
    sdkMcpStatus,
    sdkMcpUpdateResult,
    sdkCheckpoints,
    sdkAuthStatus,
    sdkRuntimeStatus,
    sdkRuntimeActivity,
    sdkLoading,
    sdkErrors,
    sdkRewindResult,
    markSdkHydrationRequested,
    markSdkHydrationStale,
    shouldHydrateSdkResource,
    setSdkLoading,
    setSdkRewindResult,
    setSdkMcpUpdateResult,
    clearSdkRuntimeActivity,
  } = useSessionsStore()

  const session = sessions.find((s) => s.id === sessionId)
  const isSdkSession = session?.agent === 'claude_sdk'

  const config = sessionId ? sdkConfig[sessionId] : undefined
  const usage = sessionId ? sdkUsage[sessionId] : null
  const accountInfo = sessionId ? sdkAccountInfo[sessionId] : null
  const models = sessionId ? sdkModels[sessionId] || [] : []
  const commands = sessionId ? sdkCommands[sessionId] || [] : []
  const mcpStatus = sessionId ? sdkMcpStatus[sessionId] || [] : []
  const mcpUpdateResult = sessionId ? sdkMcpUpdateResult[sessionId] : null
  const checkpoints = sessionId ? sdkCheckpoints[sessionId] || [] : []
  const authStatus = sessionId ? sdkAuthStatus[sessionId] : null
  const runtimeStatus = sessionId ? sdkRuntimeStatus[sessionId] : null
  const runtimeActivity = sessionId ? sdkRuntimeActivity[sessionId] || [] : []
  const loading = sessionId ? sdkLoading[sessionId] || {} : {}
  const errors = sessionId ? sdkErrors[sessionId] || {} : {}
  const rewindResult = sessionId ? sdkRewindResult[sessionId] : null

  const sendSdkMessage = useCallback(
    (message: ExtendedOutboundMessage) => {
      if (!sessionId) return false
      return wsManager.send(sessionId, message)
    },
    [sessionId]
  )

  const setModel = useCallback(
    (model?: string) => {
      sendSdkMessage({ type: 'set_model', model })
    },
    [sendSdkMessage]
  )

  const setPermissionMode = useCallback(
    (mode: PermissionMode) => {
      sendSdkMessage({ type: 'set_permission_mode', mode })
    },
    [sendSdkMessage]
  )

  const interrupt = useCallback(() => {
    sendSdkMessage({ type: 'interrupt' })
  }, [sendSdkMessage])

  const setThinkingTokens = useCallback(
    (tokens: number | null) => {
      sendSdkMessage({ type: 'set_thinking_tokens', tokens })
    },
    [sendSdkMessage]
  )

  const setEffort = useCallback(
    (effort: ClaudeEffort | undefined) => {
      sendSdkMessage({ type: 'update_config', config: { effort } })
    },
    [sendSdkMessage]
  )

  const updateConfig = useCallback(
    (configUpdates: Partial<SdkSessionConfig>) => {
      sendSdkMessage({ type: 'update_config', config: configUpdates })
    },
    [sendSdkMessage]
  )

  const getModels = useCallback(() => {
    if (sessionId) {
      markSdkHydrationRequested(sessionId, 'models')
      setSdkLoading(sessionId, { models: true })
    }
    sendSdkMessage({ type: 'get_supported_models' })
  }, [markSdkHydrationRequested, sessionId, sendSdkMessage, setSdkLoading])

  const getCommands = useCallback(() => {
    if (sessionId) {
      markSdkHydrationRequested(sessionId, 'commands')
      setSdkLoading(sessionId, { commands: true })
    }
    sendSdkMessage({ type: 'get_supported_commands' })
  }, [markSdkHydrationRequested, sessionId, sendSdkMessage, setSdkLoading])

  const getMcpStatus = useCallback(() => {
    if (sessionId) {
      markSdkHydrationRequested(sessionId, 'mcpStatus')
      setSdkLoading(sessionId, { mcpStatus: true })
    }
    sendSdkMessage({ type: 'get_mcp_status' })
  }, [markSdkHydrationRequested, sessionId, sendSdkMessage, setSdkLoading])

  const setMcpServers = useCallback(
    (servers: Record<string, McpServerConfig>) => {
      if (sessionId) {
        markSdkHydrationStale(sessionId, ['mcpStatus'])
        setSdkLoading(sessionId, { mcpUpdate: true })
        setSdkMcpUpdateResult(sessionId, null)
      }
      sendSdkMessage({ type: 'set_mcp_servers', servers })
    },
    [markSdkHydrationStale, sendSdkMessage, sessionId, setSdkLoading, setSdkMcpUpdateResult]
  )

  const getAccountInfo = useCallback(() => {
    if (sessionId) {
      markSdkHydrationRequested(sessionId, 'accountInfo')
      setSdkLoading(sessionId, { accountInfo: true })
    }
    sendSdkMessage({ type: 'get_account_info' })
  }, [markSdkHydrationRequested, sessionId, sendSdkMessage, setSdkLoading])

  const getCheckpoints = useCallback(async () => {
    if (!sessionId) {
      return
    }

    markSdkHydrationRequested(sessionId, 'checkpoints')
    setSdkLoading(sessionId, { checkpoints: true })
    try {
      const response = await api.getSessionCheckpoints(sessionId)
      useSessionsStore.getState().setSdkCheckpoints(sessionId, response.checkpoints)
      useSessionsStore.getState().markSdkHydrationFulfilled(sessionId, 'checkpoints')
      useSessionsStore.getState().setSdkLoading(sessionId, { checkpoints: false })
    } catch (error) {
      useSessionsStore.getState().markSdkHydrationFailed(sessionId, 'checkpoints')
      useSessionsStore.getState().setSdkLoading(sessionId, { checkpoints: false })
      useSessionsStore.getState().setSdkErrors(sessionId, {
        checkpoints: error instanceof Error ? error.message : 'Failed to load checkpoints',
      })
    }
  }, [markSdkHydrationRequested, sessionId, setSdkLoading])

  const rewindFiles = useCallback(
    (messageId: string, dryRun = false) => {
      if (sessionId) {
        setSdkRewindResult(sessionId, null)
      }
      sendSdkMessage({ type: 'rewind_files', messageId, dryRun })
    },
    [sessionId, sendSdkMessage, setSdkRewindResult]
  )

  const clearRewindResult = useCallback(() => {
    if (sessionId) {
      setSdkRewindResult(sessionId, null)
    }
  }, [sessionId, setSdkRewindResult])

  const clearRuntimeActivity = useCallback(() => {
    if (sessionId) {
      clearSdkRuntimeActivity(sessionId)
    }
  }, [clearSdkRuntimeActivity, sessionId])

  const clearMcpUpdateResult = useCallback(() => {
    if (sessionId) {
      setSdkMcpUpdateResult(sessionId, null)
    }
  }, [sessionId, setSdkMcpUpdateResult])

  const ensureModelsHydrated = useCallback(() => {
    if (!sessionId || !isSdkSession) {
      return
    }

    if (shouldHydrateSdkResource(sessionId, 'models')) {
      getModels()
    }
  }, [getModels, isSdkSession, sessionId, shouldHydrateSdkResource])

  const ensurePanelHydrated = useCallback(() => {
    if (!sessionId || !isSdkSession) {
      return
    }

    if (shouldHydrateSdkResource(sessionId, 'commands')) {
      getCommands()
    }
    if (shouldHydrateSdkResource(sessionId, 'mcpStatus')) {
      getMcpStatus()
    }
    if (shouldHydrateSdkResource(sessionId, 'accountInfo')) {
      getAccountInfo()
    }
    if (shouldHydrateSdkResource(sessionId, 'checkpoints')) {
      void getCheckpoints()
    }
  }, [
    getAccountInfo,
    getCheckpoints,
    getCommands,
    getMcpStatus,
    isSdkSession,
    sessionId,
    shouldHydrateSdkResource,
  ])

  return {
    // State
    isSdkSession,
    config,
    usage,
    accountInfo,
    models,
    commands,
    mcpStatus,
    mcpUpdateResult,
    checkpoints,
    authStatus,
    runtimeStatus,
    runtimeActivity,
    loading,
    errors,
    rewindResult,

    // Actions
    setModel,
    setPermissionMode,
    interrupt,
    setThinkingTokens,
    setEffort,
    updateConfig,
    getModels,
    getCommands,
    getMcpStatus,
    setMcpServers,
    getAccountInfo,
    getCheckpoints,
    rewindFiles,
    clearRewindResult,
    clearRuntimeActivity,
    clearMcpUpdateResult,
    ensureModelsHydrated,
    ensurePanelHydrated,
  }
}
