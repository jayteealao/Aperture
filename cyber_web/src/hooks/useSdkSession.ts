// Custom hook for SDK session operations

import { useCallback } from 'react'
import { useSessionsStore } from '@/stores/sessions'
import { wsManager } from '@/api/websocket'
import type {
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
    sdkCheckpoints,
    sdkLoading,
    sdkErrors,
    sdkRewindResult,
    setSdkLoading,
    setSdkRewindResult,
  } = useSessionsStore()

  // Get the session to check if it's an SDK session
  const session = sessions.find((s) => s.id === sessionId)
  const isSdkSession = session?.agent === 'claude_sdk'

  // Get SDK state for this session
  const config = sessionId ? sdkConfig[sessionId] : undefined
  const usage = sessionId ? sdkUsage[sessionId] : null
  const accountInfo = sessionId ? sdkAccountInfo[sessionId] : null
  const models = sessionId ? sdkModels[sessionId] || [] : []
  const commands = sessionId ? sdkCommands[sessionId] || [] : []
  const mcpStatus = sessionId ? sdkMcpStatus[sessionId] || [] : []
  const checkpoints = sessionId ? sdkCheckpoints[sessionId] || [] : []
  const loading = sessionId ? sdkLoading[sessionId] || {} : {}
  const errors = sessionId ? sdkErrors[sessionId] || {} : {}
  const rewindResult = sessionId ? sdkRewindResult[sessionId] : null

  // Helper to send SDK messages
  const sendSdkMessage = useCallback(
    (message: ExtendedOutboundMessage) => {
      if (!sessionId) return false
      return wsManager.send(sessionId, message)
    },
    [sessionId]
  )

  // SDK actions
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

  const updateConfig = useCallback(
    (configUpdates: Partial<SdkSessionConfig>) => {
      sendSdkMessage({ type: 'update_config', config: configUpdates })
    },
    [sendSdkMessage]
  )

  const getModels = useCallback(() => {
    if (sessionId) {
      setSdkLoading(sessionId, { models: true })
    }
    sendSdkMessage({ type: 'get_supported_models' })
  }, [sessionId, sendSdkMessage, setSdkLoading])

  const getCommands = useCallback(() => {
    if (sessionId) {
      setSdkLoading(sessionId, { commands: true })
    }
    sendSdkMessage({ type: 'get_supported_commands' })
  }, [sessionId, sendSdkMessage, setSdkLoading])

  const getMcpStatus = useCallback(() => {
    if (sessionId) {
      setSdkLoading(sessionId, { mcpStatus: true })
    }
    sendSdkMessage({ type: 'get_mcp_status' })
  }, [sessionId, sendSdkMessage, setSdkLoading])

  const setMcpServers = useCallback(
    (servers: Record<string, McpServerConfig>) => {
      sendSdkMessage({ type: 'set_mcp_servers', servers })
    },
    [sendSdkMessage]
  )

  const getAccountInfo = useCallback(() => {
    if (sessionId) {
      setSdkLoading(sessionId, { accountInfo: true })
    }
    sendSdkMessage({ type: 'get_account_info' })
  }, [sessionId, sendSdkMessage, setSdkLoading])

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

  // Auto-fetch removed: SDK info requires an active query which doesn't exist until
  // the user sends their first prompt. Components now show a "Send prompt first" message
  // instead of infinite loading spinners.

  return {
    // State
    isSdkSession,
    config,
    usage,
    accountInfo,
    models,
    commands,
    mcpStatus,
    checkpoints,
    loading,
    errors,
    rewindResult,

    // Actions
    setModel,
    setPermissionMode,
    interrupt,
    setThinkingTokens,
    updateConfig,
    getModels,
    getCommands,
    getMcpStatus,
    setMcpServers,
    getAccountInfo,
    rewindFiles,
    clearRewindResult,
  }
}
