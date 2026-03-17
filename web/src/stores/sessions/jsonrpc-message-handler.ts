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
  if (typeof data !== 'object' || data === null) return
  const msg = data as JsonRpcMessage

  if (msg.method === 'session/update') {
    const params = msg.params as { update: { sessionUpdate: string; [key: string]: unknown } } | undefined
    handleSessionUpdate(sessionId, params, get)
  } else if (msg.method === 'session/request_permission') {
    const params = msg.params as { toolCallId: string; toolCall: unknown; options: unknown[] }
    const { activeSessionId } = get()
    get().setStreaming(sessionId, false)
    get().addPendingPermission(sessionId, { toolCallId: params.toolCallId, toolCall: params.toolCall, options: params.options })
    if (sessionId !== activeSessionId) {
      get().incrementUnread(sessionId)
    }
  } else if (msg.method === 'session/exit') {
    get().setStreaming(sessionId, false)
    get().updateConnection(sessionId, { status: 'ended' })
  } else if (msg.method === 'session/error') {
    const params = msg.params as { message?: string } | undefined
    if (import.meta.env.DEV) {
      console.error('[WS] Session error:', params?.message)
    }
    get().setStreaming(sessionId, false)
    // Sanitize: only accept a string ≤200 chars to prevent server-side error
    // internals (stack traces, paths) from being stored verbatim in client state.
    const rawMessage = typeof params?.message === 'string' ? params.message : null
    const safeError = rawMessage !== null && rawMessage.length <= 200 ? rawMessage : 'Session error'
    get().updateConnection(sessionId, {
      status: 'error',
      error: safeError,
    })
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
) {
  const update = params?.update
  if (!update) return

  // Snapshot activeSessionId once at the top — before any writes — so that
  // all branches in this function use a consistent value. Capturing after a
  // store write would expose a race if any subscriber mutates activeSessionId
  // as a side-effect (e.g. an auto-focus that switches sessions on permission).
  const { activeSessionId } = get()
  const updateType = update.sessionUpdate

  if (updateType === 'agent_message_chunk') {
    // Streaming flag for legacy JSON-RPC sessions (non-SDK/Pi agents).
    // SDK and Pi sessions receive this via their own message handlers.
    if (!get().connections[sessionId]?.isStreaming) {
      get().setStreaming(sessionId, true)
    }
    if (sessionId !== activeSessionId) {
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
