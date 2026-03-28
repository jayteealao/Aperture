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
  SdkRuntimeActivityEntry,
  SdkRuntimeActivityKind,
  SdkRuntimeActivitySeverity,
  SdkMcpUpdateResult,
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
  } else if (msg.method === 'session/mcp_servers_updated') {
    const params = msg.params as Partial<SdkMcpUpdateResult> & { error?: string }
    const result: SdkMcpUpdateResult = {
      added: Array.isArray(params.added) ? params.added : [],
      removed: Array.isArray(params.removed) ? params.removed : [],
      errors: typeof params.errors === 'object' && params.errors !== null
        ? params.errors as Record<string, string>
        : {},
      error: typeof params.error === 'string' ? params.error : undefined,
      updatedAt: Date.now(),
    }

    get().setSdkMcpUpdateResult(sessionId, result)
    get().setSdkLoading(sessionId, { mcpUpdate: false })
    get().setSdkErrors(sessionId, { mcpUpdate: result.error, mcpStatus: undefined })
    applyMcpUpdateToStatus(sessionId, result, get)

    if ((result.error || Object.keys(result.errors).length > 0) && sessionId !== get().activeSessionId) {
      get().incrementUnread(sessionId)
    }
  } else if (msg.method === 'session/account_info') {
    const params = msg.params as
      | (AccountInfo & { error?: string })
      | { accountInfo?: AccountInfo; error?: string }
      | { error: string }
    if ('error' in params && params.error) {
      get().setSdkErrors(sessionId, { accountInfo: params.error })
    } else {
      const accountInfo = 'accountInfo' in params && params.accountInfo ? params.accountInfo : params as AccountInfo
      get().setSdkAccountInfo(sessionId, accountInfo)
      get().setSdkErrors(sessionId, { accountInfo: undefined })
    }
    get().setSdkLoading(sessionId, { accountInfo: false })
  } else if (msg.method === 'session/title_changed') {
    const params = msg.params as { title: string }
    get().updateSessionTitle(sessionId, params.title)
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
      if (sessionId !== activeSessionId) {
        get().incrementUnread(sessionId)
      }
    }
  } else if (updateType === 'prompt_complete' || updateType === 'prompt_error') {
    get().setStreaming(sessionId, false)
  } else if (updateType === 'init' && typeof update.config === 'object' && update.config !== null) {
    get().setSdkConfig(sessionId, update.config as SdkSessionConfig)
  } else if (updateType === 'config_changed') {
    const currentConfig = get().sdkConfig[sessionId] || {}
    const newConfig: SdkSessionConfig = { ...currentConfig }
    if ('model' in update) newConfig.model = update.model as string | undefined
    if ('permissionMode' in update) newConfig.permissionMode = update.permissionMode as PermissionMode
    if ('maxThinkingTokens' in update) newConfig.maxThinkingTokens = update.maxThinkingTokens as number | undefined
    if ('effort' in update) newConfig.effort = update.effort as SdkSessionConfig['effort']
    get().setSdkConfig(sessionId, newConfig)
  } else if (updateType === 'auth_status') {
    get().setSdkAuthStatus(sessionId, {
      isAuthenticating: Boolean(update.isAuthenticating),
      output: typeof update.output === 'string' ? update.output : undefined,
      error: typeof update.error === 'string' ? update.error : undefined,
      updatedAt: Date.now(),
    })
    if (typeof update.error === 'string' && update.error && sessionId !== activeSessionId) {
      get().incrementUnread(sessionId)
    }
  } else if (updateType === 'status') {
    const status = typeof update.status === 'string' ? update.status : 'unknown'
    get().setSdkRuntimeStatus(sessionId, {
      status,
      updatedAt: Date.now(),
    })
  } else if (isRuntimeActivityType(updateType)) {
    const activity = createRuntimeActivityEntry(sessionId, updateType, update)
    get().addSdkRuntimeActivity(sessionId, activity)
    if (updateType === 'task_notification' && sessionId !== activeSessionId) {
      get().incrementUnread(sessionId)
    }
  } else if (
    updateType === 'user_message' ||
    updateType === 'tool_call' ||
    updateType === 'thinking' ||
    updateType === 'agent_message_complete' ||
    updateType === 'agent_message_delta' ||
    updateType === 'content_block_start' ||
    updateType === 'content_block_stop' ||
    updateType === 'system' ||
    updateType === 'sdk_message'
  ) {
    if (updateType === 'system') {
      get().addSdkRuntimeActivity(sessionId, createRuntimeActivityEntry(sessionId, 'system', update))
    }
    // Intentionally ignore transcript-owned or debug-only events here.
  }
}

function applyMcpUpdateToStatus(sessionId: string, result: SdkMcpUpdateResult, get: StoreGet) {
  if (result.error) {
    return
  }

  const current = get().sdkMcpStatus[sessionId] || []
  const next = current
    .filter((server) => !result.removed.includes(server.name))
    .map((server) => {
      const error = result.errors[server.name]
      if (!error) {
        return server
      }
      return {
        ...server,
        status: 'failed' as const,
        error,
      }
    })

  for (const name of result.added) {
    if (!next.some((server) => server.name === name)) {
      next.push({ name, status: 'pending' })
    }
  }

  for (const [name, error] of Object.entries(result.errors)) {
    if (!next.some((server) => server.name === name)) {
      next.push({ name, status: 'failed', error })
    }
  }

  get().setSdkMcpStatus(sessionId, next)
}

function isRuntimeActivityType(updateType: string): updateType is Exclude<SdkRuntimeActivityKind, 'system'> {
  return updateType === 'tool_progress'
    || updateType === 'task_notification'
    || updateType === 'hook_started'
    || updateType === 'hook_progress'
    || updateType === 'hook_response'
    || updateType === 'compact_boundary'
}

function createRuntimeActivityEntry(
  sessionId: string,
  kind: SdkRuntimeActivityKind,
  payload: Record<string, unknown>,
): SdkRuntimeActivityEntry {
  return {
    id: `${kind}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    sessionId,
    kind,
    timestamp: Date.now(),
    severity: getRuntimeActivitySeverity(kind, payload),
    payload,
  }
}

function getRuntimeActivitySeverity(
  kind: SdkRuntimeActivityKind,
  payload: Record<string, unknown>,
): SdkRuntimeActivitySeverity {
  if (kind === 'hook_response') {
    const outcome = typeof payload.outcome === 'string' ? payload.outcome : ''
    const exitCode = typeof payload.exitCode === 'number' ? payload.exitCode : 0
    return outcome === 'success' && exitCode === 0 ? 'success' : 'danger'
  }

  if (kind === 'task_notification') {
    const status = typeof payload.status === 'string' ? payload.status.toLowerCase() : ''
    if (status.includes('error') || status.includes('fail')) return 'danger'
    if (status.includes('complete') || status.includes('success')) return 'success'
  }

  if (kind === 'compact_boundary') {
    return 'warning'
  }

  if (kind === 'system') {
    return 'warning'
  }

  return 'default'
}
