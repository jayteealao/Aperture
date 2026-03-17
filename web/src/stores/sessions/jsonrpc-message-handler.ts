// JSON-RPC message handler — routes SDK control-plane events (models, config,
// checkpoints, permissions, usage) to the appropriate store slices.

import type {
  JsonRpcMessage,
  SdkSessionConfig,
  SessionResult,
  AccountInfo,
  ModelInfo,
  SlashCommand,
  McpServerStatus,
  RewindFilesResult,
  PermissionMode,
} from '@/api/types'
import type { StoreGet, StoreSet } from './handler-types'

export function handleJsonRpcMessage(
  sessionId: string,
  data: unknown,
  get: StoreGet,
  _set: StoreSet,
) {
  const msg = data as JsonRpcMessage
  const { activeSessionId } = get()
  const isActive = sessionId === activeSessionId

  if (msg.method === 'session/update') {
    const params = msg.params as { update: { sessionUpdate: string; [key: string]: unknown } } | undefined
    handleSessionUpdate(sessionId, params, get, isActive)
  } else if (msg.method === 'session/request_permission') {
    const params = msg.params as { toolCallId: string; toolCall: unknown; options: unknown[] }
    get().setStreaming(sessionId, false)
    get().addPendingPermission(sessionId, { toolCallId: params.toolCallId, toolCall: params.toolCall, options: params.options })
    if (!isActive) {
      get().incrementUnread(sessionId)
    }
  } else if (msg.method === 'session/exit') {
    get().setStreaming(sessionId, false)
    get().updateConnection(sessionId, { status: 'ended' })
  } else if (msg.method === 'session/error') {
    const params = msg.params as { message?: string } | undefined
    console.error('[WS] Session error:', params?.message)
  } else if (msg.method === 'session/supported_models') {
    const params = msg.params as { models?: ModelInfo[]; error?: string }
    if (params.error) {
      get().setSdkErrors(sessionId, { models: params.error })
    } else if (params.models) {
      get().setSdkModels(sessionId, params.models)
      get().setSdkErrors(sessionId, { models: undefined })
    }
    get().setSdkLoading(sessionId, { models: false })
  } else if (msg.method === 'session/supported_commands') {
    const params = msg.params as { commands?: SlashCommand[]; error?: string }
    if (params.error) {
      get().setSdkErrors(sessionId, { commands: params.error })
    } else if (params.commands) {
      get().setSdkCommands(sessionId, params.commands)
      get().setSdkErrors(sessionId, { commands: undefined })
    }
    get().setSdkLoading(sessionId, { commands: false })
  } else if (msg.method === 'session/mcp_status') {
    const params = msg.params as { servers?: McpServerStatus[]; error?: string }
    if (params.error) {
      get().setSdkErrors(sessionId, { mcpStatus: params.error })
    } else if (params.servers) {
      get().setSdkMcpStatus(sessionId, params.servers)
      get().setSdkErrors(sessionId, { mcpStatus: undefined })
    }
    get().setSdkLoading(sessionId, { mcpStatus: false })
  } else if (msg.method === 'session/account_info') {
    const params = msg.params as (AccountInfo & { error?: string }) | { error: string }
    if ('error' in params && params.error) {
      get().setSdkErrors(sessionId, { accountInfo: params.error })
    } else {
      get().setSdkAccountInfo(sessionId, params as AccountInfo)
      get().setSdkErrors(sessionId, { accountInfo: undefined })
    }
    get().setSdkLoading(sessionId, { accountInfo: false })
  } else if (msg.method === 'session/config_updated') {
    const params = msg.params as { config: SdkSessionConfig }
    get().setSdkConfig(sessionId, params.config)
    get().setSdkLoading(sessionId, { config: false })
  } else if (msg.method === 'session/checkpoints') {
    const params = msg.params as { checkpoints: string[] }
    get().setSdkCheckpoints(sessionId, params.checkpoints)
    get().setSdkLoading(sessionId, { checkpoints: false })
  } else if (msg.method === 'session/rewind_result') {
    const params = msg.params as RewindFilesResult
    get().setSdkRewindResult(sessionId, params)
  } else if (msg.method === 'session/usage_update') {
    const params = msg.params as SessionResult
    get().setSdkUsage(sessionId, params)
  } else if (msg.result) {
    const result = msg.result as { stopReason?: string }
    if (result.stopReason) {
      get().setStreaming(sessionId, false)
    }
  }
}

function handleSessionUpdate(
  sessionId: string,
  params: { update: { sessionUpdate: string; [key: string]: unknown } } | undefined,
  get: StoreGet,
  isActive: boolean,
) {
  const update = params?.update
  if (!update) return

  const updateType = update.sessionUpdate

  if (updateType === 'agent_message_chunk') {
    if (!get().connections[sessionId]?.isStreaming) {
      get().setStreaming(sessionId, true)
    }
    if (!isActive) {
      get().incrementUnread(sessionId)
    }
  } else if (updateType === 'prompt_complete' || updateType === 'prompt_error') {
    get().setStreaming(sessionId, false)
  } else if (updateType === 'config_changed') {
    const currentConfig = get().sdkConfig[sessionId] || {}
    const newConfig: SdkSessionConfig = { ...currentConfig }
    if ('model' in update) newConfig.model = update.model as string | undefined
    if ('permissionMode' in update) newConfig.permissionMode = update.permissionMode as PermissionMode
    get().setSdkConfig(sessionId, newConfig)
  }
}
