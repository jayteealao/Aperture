// Sessions state store

import { create } from 'zustand'
import { get as idbGet, set as idbSet, del as idbDel, clear as idbClear, keys as idbKeys } from 'idb-keyval'
import type {
  Session,
  SessionStatus,
  Message,
  ConnectionState,
  ConnectionStatus,
  JsonRpcMessage,
  ContentBlock,
  SdkSessionConfig,
  SessionResult,
  AccountInfo,
  ModelInfo,
  SlashCommand,
  McpServerStatus,
  RewindFilesResult,
  PermissionMode,
} from '@/api/types'
import { api } from '@/api/client'
import { wsManager } from '@/api/websocket'
import { DEFAULT_SDK_MODELS } from '@/utils/constants'

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

interface SessionsState {
  // Data
  sessions: Session[]
  messages: Record<string, Message[]>
  connections: Record<string, ConnectionState>
  activeSessionId: string | null

  // Pending permission requests
  pendingPermissions: Record<string, {
    toolCallId: string
    toolCall: unknown
    options: unknown[]
  }>

  // SDK State
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

  // Actions - Sessions
  setSessions: (sessions: Session[]) => void
  addSession: (session: Session) => Promise<void>
  removeSession: (sessionId: string) => Promise<void>
  updateSessionStatus: (sessionId: string, status: SessionStatus) => void
  setActiveSession: (sessionId: string | null) => void
  getActiveSession: () => Session | null

  // Actions - Messages
  addMessage: (sessionId: string, message: Message) => Promise<void>
  addUserMessageOnly: (sessionId: string, content: string) => Promise<void>
  updateMessage: (sessionId: string, messageId: string, updates: Partial<Message>) => void
  loadMessagesForSession: (sessionId: string) => Promise<void>
  clearMessages: (sessionId: string) => void

  // Actions - Connections
  updateConnection: (sessionId: string, updates: Partial<ConnectionState>) => void
  setStreaming: (sessionId: string, isStreaming: boolean, streamMessageId?: string) => void
  incrementUnread: (sessionId: string) => void
  clearUnread: (sessionId: string) => void

  // Actions - Permissions
  addPendingPermission: (sessionId: string, permission: { toolCallId: string; toolCall: unknown; options: unknown[] }) => void
  removePendingPermission: (sessionId: string, toolCallId: string) => void

  // Actions - SDK State
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

  // WebSocket
  connectSession: (sessionId: string) => void
  disconnectSession: (sessionId: string) => void
  sendMessage: (sessionId: string, content: string) => Promise<void>
  sendPermissionResponse: (sessionId: string, toolCallId: string, optionId: string | null, answers?: Record<string, string>) => void
  cancelPrompt: (sessionId: string) => void

  // Persistence
  restoreFromStorage: () => Promise<void>
  clearAll: () => Promise<void>
}

// Initialize default connection state
const defaultConnectionState = (): ConnectionState => ({
  status: 'disconnected',
  error: null,
  retryCount: 0,
  isStreaming: false,
  hasUnread: false,
  unreadCount: 0,
  lastActivity: Date.now(),
})

export const useSessionsStore = create<SessionsState>((set, get) => ({
  // Initial state
  sessions: [],
  messages: {},
  connections: {},
  activeSessionId: null,
  pendingPermissions: {},

  // SDK initial state
  sdkConfig: {},
  sdkUsage: {},
  sdkAccountInfo: {},
  sdkModels: {},
  sdkCommands: {},
  sdkMcpStatus: {},
  sdkCheckpoints: {},
  sdkLoading: {},
  sdkErrors: {},
  sdkRewindResult: {},

  // Sessions actions
  setSessions: (sessions) => {
    const connections: Record<string, ConnectionState> = {}
    sessions.forEach((s) => {
      connections[s.id] = get().connections[s.id] || defaultConnectionState()
    })
    set({ sessions, connections })
  },

  addSession: async (session) => {
    set((state) => {
      const updates: Partial<SessionsState> = {
        sessions: [...state.sessions.filter((s) => s.id !== session.id), session],
        connections: {
          ...state.connections,
          [session.id]: state.connections[session.id] || defaultConnectionState(),
        },
      }
      // Initialize SDK sessions with default models
      if (session.agent === 'claude_sdk') {
        updates.sdkModels = {
          ...state.sdkModels,
          [session.id]: [...DEFAULT_SDK_MODELS],
        }
      }
      return updates
    })
    // Persist to IndexedDB
    await idbSet(`session:${session.id}`, session)
  },

  removeSession: async (sessionId) => {
    wsManager.disconnect(sessionId)
    set((state) => {
      const newConnections = { ...state.connections }
      delete newConnections[sessionId]
      const newMessages = { ...state.messages }
      delete newMessages[sessionId]
      // Clean up SDK state
      const newSdkConfig = { ...state.sdkConfig }
      delete newSdkConfig[sessionId]
      const newSdkUsage = { ...state.sdkUsage }
      delete newSdkUsage[sessionId]
      const newSdkAccountInfo = { ...state.sdkAccountInfo }
      delete newSdkAccountInfo[sessionId]
      const newSdkModels = { ...state.sdkModels }
      delete newSdkModels[sessionId]
      const newSdkCommands = { ...state.sdkCommands }
      delete newSdkCommands[sessionId]
      const newSdkMcpStatus = { ...state.sdkMcpStatus }
      delete newSdkMcpStatus[sessionId]
      const newSdkCheckpoints = { ...state.sdkCheckpoints }
      delete newSdkCheckpoints[sessionId]
      const newSdkLoading = { ...state.sdkLoading }
      delete newSdkLoading[sessionId]
      const newSdkErrors = { ...state.sdkErrors }
      delete newSdkErrors[sessionId]
      const newSdkRewindResult = { ...state.sdkRewindResult }
      delete newSdkRewindResult[sessionId]
      return {
        sessions: state.sessions.filter((s) => s.id !== sessionId),
        connections: newConnections,
        messages: newMessages,
        activeSessionId: state.activeSessionId === sessionId ? null : state.activeSessionId,
        sdkConfig: newSdkConfig,
        sdkUsage: newSdkUsage,
        sdkAccountInfo: newSdkAccountInfo,
        sdkModels: newSdkModels,
        sdkCommands: newSdkCommands,
        sdkMcpStatus: newSdkMcpStatus,
        sdkCheckpoints: newSdkCheckpoints,
        sdkLoading: newSdkLoading,
        sdkErrors: newSdkErrors,
        sdkRewindResult: newSdkRewindResult,
      }
    })
    // Remove from IndexedDB
    await idbDel(`session:${sessionId}`)
    await idbDel(`messages:${sessionId}`)
  },

  updateSessionStatus: (sessionId, status) => {
    set((state) => ({
      sessions: state.sessions.map((s) =>
        s.id === sessionId ? { ...s, status } : s
      ),
    }))
  },

  setActiveSession: (sessionId) => {
    set({ activeSessionId: sessionId })
    if (sessionId) {
      get().clearUnread(sessionId)
      idbSet('activeSessionId', sessionId)
    }
  },

  getActiveSession: () => {
    const { sessions, activeSessionId } = get()
    return sessions.find((s) => s.id === activeSessionId) || null
  },

  // Messages actions
  addMessage: async (sessionId, message) => {
    set((state) => ({
      messages: {
        ...state.messages,
        [sessionId]: [...(state.messages[sessionId] || []), message],
      },
    }))
    // Persist to IndexedDB
    const messages = get().messages[sessionId] || []
    await idbSet(`messages:${sessionId}`, messages)
  },

  addUserMessageOnly: async (sessionId, content) => {
    // Add user message to store without sending via WebSocket
    // Used for injecting answer messages before permission responses
    const userMessage: Message = {
      id: `msg-${Date.now()}`,
      sessionId,
      role: 'user',
      content,
      timestamp: new Date().toISOString(),
    }
    await get().addMessage(sessionId, userMessage)
  },

  updateMessage: (sessionId, messageId, updates) => {
    set((state) => {
      const sessionMessages = state.messages[sessionId] || []
      const index = sessionMessages.findIndex((m) => m.id === messageId)
      if (index === -1) return state

      const updatedMessages = [...sessionMessages]
      updatedMessages[index] = { ...updatedMessages[index], ...updates }

      return {
        messages: {
          ...state.messages,
          [sessionId]: updatedMessages,
        },
      }
    })
  },

  loadMessagesForSession: async (sessionId) => {
    const stored = await idbGet(`messages:${sessionId}`)
    if (stored && Array.isArray(stored)) {
      set((state) => ({
        messages: {
          ...state.messages,
          [sessionId]: stored,
        },
      }))
    }
  },

  clearMessages: (sessionId) => {
    set((state) => {
      const newMessages = { ...state.messages }
      delete newMessages[sessionId]
      return { messages: newMessages }
    })
    idbDel(`messages:${sessionId}`)
  },

  // Connection actions
  updateConnection: (sessionId, updates) => {
    set((state) => ({
      connections: {
        ...state.connections,
        [sessionId]: {
          ...defaultConnectionState(),
          ...state.connections[sessionId],
          ...updates,
          lastActivity: Date.now(),
        },
      },
    }))
  },

  setStreaming: (sessionId, isStreaming, streamMessageId) => {
    get().updateConnection(sessionId, {
      isStreaming,
      currentStreamMessageId: streamMessageId,
    })
  },

  incrementUnread: (sessionId) => {
    const { activeSessionId, connections } = get()
    if (sessionId === activeSessionId) return

    const conn = connections[sessionId] || defaultConnectionState()
    get().updateConnection(sessionId, {
      hasUnread: true,
      unreadCount: conn.unreadCount + 1,
    })
  },

  clearUnread: (sessionId) => {
    get().updateConnection(sessionId, {
      hasUnread: false,
      unreadCount: 0,
    })
  },

  // Permissions
  addPendingPermission: (sessionId, permission) => {
    set((state) => ({
      pendingPermissions: {
        ...state.pendingPermissions,
        [`${sessionId}:${permission.toolCallId}`]: permission,
      },
    }))
  },

  removePendingPermission: (sessionId, toolCallId) => {
    set((state) => {
      const newPermissions = { ...state.pendingPermissions }
      delete newPermissions[`${sessionId}:${toolCallId}`]
      return { pendingPermissions: newPermissions }
    })
  },

  // SDK State actions
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

  // WebSocket actions
  connectSession: (sessionId) => {
    const wsUrl = api.getWebSocketUrl(sessionId)

    const messageHandler = (sid: string, data: JsonRpcMessage) => {
      handleWebSocketMessage(sid, data, get, set)
    }

    const statusHandler = (sid: string, status: ConnectionStatus, error?: string) => {
      get().updateConnection(sid, { status, error: error || null })
    }

    wsManager.connect(sessionId, wsUrl, messageHandler, statusHandler)
  },

  disconnectSession: (sessionId) => {
    wsManager.disconnect(sessionId)
    get().updateConnection(sessionId, { status: 'disconnected' })
  },

  sendMessage: async (sessionId, content) => {
    // Add user message to store
    const userMessage: Message = {
      id: `msg-${Date.now()}`,
      sessionId,
      role: 'user',
      content,
      timestamp: new Date().toISOString(),
    }
    await get().addMessage(sessionId, userMessage)

    // Send via WebSocket
    const sent = wsManager.send(sessionId, {
      type: 'user_message',
      content,
    })

    if (!sent) {
      throw new Error('Failed to send message - not connected')
    }
  },

  sendPermissionResponse: (sessionId, toolCallId, optionId, answers) => {
    const message = {
      type: 'permission_response',
      toolCallId,
      optionId,
      ...(answers && { answers }),
    }
    console.log('[WS] Sending permission response:', message)
    wsManager.send(sessionId, message)
    get().removePendingPermission(sessionId, toolCallId)
  },

  cancelPrompt: (sessionId) => {
    wsManager.send(sessionId, { type: 'cancel' })
    get().setStreaming(sessionId, false)
  },

  // Persistence
  restoreFromStorage: async () => {
    // Restore sessions
    const allKeys = await idbKeys()
    const sessionKeys = allKeys.filter((k) => typeof k === 'string' && k.startsWith('session:'))

    const sessions: Session[] = []
    for (const key of sessionKeys) {
      const session = await idbGet(key)
      if (session) {
        sessions.push(session as Session)
      }
    }

    if (sessions.length > 0) {
      get().setSessions(sessions)
    }

    // Restore active session
    const activeId = await idbGet('activeSessionId')
    if (activeId && typeof activeId === 'string') {
      const exists = sessions.find((s) => s.id === activeId)
      if (exists) {
        set({ activeSessionId: activeId })
        await get().loadMessagesForSession(activeId)
      }
    }
  },

  clearAll: async () => {
    wsManager.disconnectAll()
    await idbClear()
    set({
      sessions: [],
      messages: {},
      connections: {},
      activeSessionId: null,
      pendingPermissions: {},
      sdkConfig: {},
      sdkUsage: {},
      sdkAccountInfo: {},
      sdkModels: {},
      sdkCommands: {},
      sdkMcpStatus: {},
      sdkCheckpoints: {},
      sdkLoading: {},
      sdkErrors: {},
      sdkRewindResult: {},
    })
  },
}))

// WebSocket message handler
function handleWebSocketMessage(
  sessionId: string,
  data: JsonRpcMessage,
  get: () => SessionsState,
  _set: (fn: (state: SessionsState) => Partial<SessionsState>) => void
) {
  const { activeSessionId } = get()
  const isActive = sessionId === activeSessionId

  if (data.method === 'session/update') {
    handleSessionUpdate(sessionId, data.params as { update: { sessionUpdate: string; content?: ContentBlock } }, get, isActive)
  } else if (data.method === 'session/request_permission') {
    handlePermissionRequest(sessionId, data.params as { toolCallId: string; toolCall: unknown; options: unknown[] }, get)
  } else if (data.method === 'session/exit') {
    get().setStreaming(sessionId, false)
    get().updateConnection(sessionId, { status: 'ended' })
  } else if (data.method === 'session/error') {
    const params = data.params as { message?: string }
    console.error('[WS] Session error:', params?.message)
  } else if (data.method === 'session/supported_models') {
    console.log('[WS] Received session/supported_models:', data.params)
    const params = data.params as { models?: ModelInfo[]; error?: string }
    if (params.error) {
      get().setSdkErrors(sessionId, { models: params.error })
    } else if (params.models) {
      get().setSdkModels(sessionId, params.models)
      get().setSdkErrors(sessionId, { models: undefined })
    }
    get().setSdkLoading(sessionId, { models: false })
  } else if (data.method === 'session/supported_commands') {
    const params = data.params as { commands?: SlashCommand[]; error?: string }
    if (params.error) {
      get().setSdkErrors(sessionId, { commands: params.error })
    } else if (params.commands) {
      get().setSdkCommands(sessionId, params.commands)
      get().setSdkErrors(sessionId, { commands: undefined })
    }
    get().setSdkLoading(sessionId, { commands: false })
  } else if (data.method === 'session/mcp_status') {
    const params = data.params as { servers?: McpServerStatus[]; error?: string }
    if (params.error) {
      get().setSdkErrors(sessionId, { mcpStatus: params.error })
    } else if (params.servers) {
      get().setSdkMcpStatus(sessionId, params.servers)
      get().setSdkErrors(sessionId, { mcpStatus: undefined })
    }
    get().setSdkLoading(sessionId, { mcpStatus: false })
  } else if (data.method === 'session/account_info') {
    const params = data.params as (AccountInfo & { error?: string }) | { error: string }
    if ('error' in params && params.error) {
      get().setSdkErrors(sessionId, { accountInfo: params.error })
    } else {
      get().setSdkAccountInfo(sessionId, params as AccountInfo)
      get().setSdkErrors(sessionId, { accountInfo: undefined })
    }
    get().setSdkLoading(sessionId, { accountInfo: false })
  } else if (data.method === 'session/config_updated') {
    const params = data.params as { config: SdkSessionConfig }
    get().setSdkConfig(sessionId, params.config)
    get().setSdkLoading(sessionId, { config: false })
  } else if (data.method === 'session/checkpoints') {
    const params = data.params as { checkpoints: string[] }
    get().setSdkCheckpoints(sessionId, params.checkpoints)
    get().setSdkLoading(sessionId, { checkpoints: false })
  } else if (data.method === 'session/rewind_result') {
    const params = data.params as RewindFilesResult
    get().setSdkRewindResult(sessionId, params)
  } else if (data.method === 'session/usage_update') {
    const params = data.params as SessionResult
    get().setSdkUsage(sessionId, params)
  } else if (data.result) {
    // Response to a prompt - streaming finished
    const result = data.result as { stopReason?: string }
    if (result.stopReason) {
      get().setStreaming(sessionId, false)
    }
  }
}

function handleSessionUpdate(
  sessionId: string,
  params: { update: { sessionUpdate: string; content?: ContentBlock; [key: string]: unknown } },
  get: () => SessionsState,
  isActive: boolean
) {
  const update = params?.update
  if (!update) return

  const updateType = update.sessionUpdate

  if (updateType === 'agent_message_chunk') {
    const { connections } = get()
    const conn = connections[sessionId]

    // Start streaming if not already
    if (!conn?.isStreaming) {
      const msgId = `msg-${Date.now()}`
      get().setStreaming(sessionId, true, msgId)
      get().addMessage(sessionId, {
        id: msgId,
        sessionId,
        role: 'assistant',
        content: '',
        timestamp: new Date().toISOString(),
      })
    }

    // Append content
    const content = update.content
    if (content?.type === 'text' && content.text) {
      const streamMsgId = get().connections[sessionId]?.currentStreamMessageId
      if (streamMsgId) {
        const sessionMessages = get().messages[sessionId] || []
        const currentMsg = sessionMessages.find((m) => m.id === streamMsgId)
        if (currentMsg) {
          const currentContent = typeof currentMsg.content === 'string' ? currentMsg.content : ''
          get().updateMessage(sessionId, streamMsgId, {
            content: currentContent + content.text,
          })
        }
      }
    }

    if (!isActive) {
      get().incrementUnread(sessionId)
    }
  } else if (updateType === 'prompt_complete' || updateType === 'prompt_error') {
    // Stop streaming when prompt finishes
    get().setStreaming(sessionId, false)
  } else if (updateType === 'config_changed') {
    // Handle config changes (model, permissionMode, etc.)
    const currentConfig = get().sdkConfig[sessionId] || {}
    const newConfig: SdkSessionConfig = { ...currentConfig }
    if ('model' in update) newConfig.model = update.model as string | undefined
    if ('permissionMode' in update) newConfig.permissionMode = update.permissionMode as PermissionMode
    get().setSdkConfig(sessionId, newConfig)
  }
}

function handlePermissionRequest(
  sessionId: string,
  params: { toolCallId: string; toolCall: unknown; options: unknown[] },
  get: () => SessionsState
) {
  const { toolCallId, toolCall, options } = params

  // Reset streaming state so next response creates a new message bubble
  get().setStreaming(sessionId, false)

  get().addPendingPermission(sessionId, { toolCallId, toolCall, options })

  if (sessionId !== get().activeSessionId) {
    get().incrementUnread(sessionId)
  }
}
