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
  PermissionResponse,
  SdkContentBlock,
  SdkWsMessage,
} from '@/api/types'
import { isSdkWsMessage } from '@/api/types'
import type {
  PiSessionConfig,
  PiSessionStats,
  PiModelInfo,
  PiSessionTree,
  PiWsMessage,
  PiThinkingLevel,
  PiStreamingState,
  PiForkableEntry,
} from '@/api/pi-types'
import { isPiWsMessage } from '@/api/pi-types'
import { api } from '@/api/client'
import { wsManager } from '@/api/websocket'
import { DEFAULT_SDK_MODELS } from '@/utils/constants'

// Debounced persistence for high-frequency message updates (streaming)
const persistenceTimers: Record<string, ReturnType<typeof setTimeout>> = {}

function debouncedPersist(sessionId: string, messages: Message[], delayMs = 500): void {
  if (persistenceTimers[sessionId]) {
    clearTimeout(persistenceTimers[sessionId])
  }
  persistenceTimers[sessionId] = setTimeout(() => {
    idbSet(`messages:${sessionId}`, messages)
    delete persistenceTimers[sessionId]
  }, delayMs)
}

function flushPersist(sessionId: string, messages: Message[]): void {
  // Cancel any pending debounced persist and immediately save
  if (persistenceTimers[sessionId]) {
    clearTimeout(persistenceTimers[sessionId])
    delete persistenceTimers[sessionId]
  }
  idbSet(`messages:${sessionId}`, messages)
}

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
interface SdkStreamingState {
  messageId: string
  contentBlocks: SdkContentBlock[]
  currentBlockIndex: number
}

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

  // SDK State (Claude)
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

  // Pi SDK State
  piConfig: Record<string, PiSessionConfig>
  piStats: Record<string, PiSessionStats | null>
  piModels: Record<string, PiModelInfo[]>
  piSessionTree: Record<string, PiSessionTree | null>
  piForkableEntries: Record<string, PiForkableEntry[]>
  piThinkingLevel: Record<string, PiThinkingLevel>
  piLoading: Record<string, PiLoadingState>
  piErrors: Record<string, PiErrorState>
  piStreamingState: Record<string, PiStreamingState | null>

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

  // Actions - SDK State (Claude)
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

  // Actions - Pi SDK State
  setPiConfig: (sessionId: string, config: PiSessionConfig) => void
  setPiStats: (sessionId: string, stats: PiSessionStats | null) => void
  setPiModels: (sessionId: string, models: PiModelInfo[]) => void
  setPiSessionTree: (sessionId: string, tree: PiSessionTree | null) => void
  setPiForkableEntries: (sessionId: string, entries: PiForkableEntry[]) => void
  setPiThinkingLevel: (sessionId: string, level: PiThinkingLevel) => void
  setPiLoading: (sessionId: string, loading: Partial<PiLoadingState>) => void
  setPiErrors: (sessionId: string, errors: Partial<PiErrorState>) => void

  // Pi WebSocket Actions
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

  // WebSocket
  connectSession: (sessionId: string) => Promise<void>
  disconnectSession: (sessionId: string) => void
  sendMessage: (sessionId: string, content: string, images?: import('@/api/types').ImageAttachment[]) => Promise<void>
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

  // SDK initial state (Claude)
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
  sdkStreamingState: {},

  // Pi SDK initial state
  piConfig: {},
  piStats: {},
  piModels: {},
  piSessionTree: {},
  piForkableEntries: {},
  piThinkingLevel: {},
  piLoading: {},
  piErrors: {},
  piStreamingState: {},

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
      const newSdkStreamingState = { ...state.sdkStreamingState }
      delete newSdkStreamingState[sessionId]
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
        sdkStreamingState: newSdkStreamingState,
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
    // Debounce persistence for high-frequency streaming updates
    debouncedPersist(sessionId, get().messages[sessionId] || [])
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

  // Pi SDK actions
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

  // Pi WebSocket actions
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

  // WebSocket actions
  connectSession: async (sessionId) => {
    // First, try to restore/connect to the session on the backend
    // This handles SDK session resumption automatically
    try {
      const response = await api.connectSession(sessionId)
      if (response.restored) {
        console.log(`[Sessions] Restored SDK session ${sessionId}`)
        // Update local session status with the restored status
        get().updateSessionStatus(sessionId, response.status)
      }
    } catch (err) {
      // If the session can't be connected/restored, log but continue
      // The WebSocket connection will handle the error appropriately
      console.warn(`[Sessions] Failed to connect/restore session ${sessionId}:`, err)
    }

    const wsUrl = api.getWebSocketUrl(sessionId)

    // Message handler that routes SDK, Pi, and JSON-RPC messages
    const messageHandler = (sid: string, data: unknown) => {
      // Check if this is a first-class SDK message (Claude)
      if (isSdkWsMessage(data)) {
        handleSdkWebSocketMessage(sid, data, get, set)
        return
      }
      // Check if this is a first-class Pi message
      if (isPiWsMessage(data)) {
        handlePiWebSocketMessage(sid, data, get, set)
        return
      }
      // Otherwise treat as JSON-RPC message
      handleWebSocketMessage(sid, data as JsonRpcMessage, get, set)
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

  sendMessage: async (sessionId, content, images) => {
    // Build message content: include image content blocks if present
    const messageContent: string | ContentBlock[] = images && images.length > 0
      ? [
          ...images.map((img) => ({
            type: 'image' as const,
            mimeType: img.mimeType,
            data: img.data,
            filename: img.filename,
          })),
          { type: 'text' as const, text: content },
        ]
      : content

    // Add user message to store
    const userMessage: Message = {
      id: `msg-${Date.now()}`,
      sessionId,
      role: 'user',
      content: messageContent,
      timestamp: new Date().toISOString(),
    }
    await get().addMessage(sessionId, userMessage)

    // Send via WebSocket (images sent alongside content)
    const sent = wsManager.send(sessionId, {
      type: 'user_message',
      content,
      ...(images && images.length > 0 ? { images } : {}),
    })

    if (!sent) {
      throw new Error('Failed to send message - not connected')
    }
  },

  sendPermissionResponse: (sessionId, toolCallId, optionId, answers) => {
    const message: PermissionResponse = {
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
    // Restore sessions from local IndexedDB
    const allKeys = await idbKeys()
    const sessionKeys = allKeys.filter((k) => typeof k === 'string' && k.startsWith('session:'))

    const localSessions: Session[] = []
    for (const key of sessionKeys) {
      const session = await idbGet(key)
      if (session) {
        localSessions.push(session as Session)
      }
    }

    // Also fetch resumable sessions from the backend
    // These are SDK sessions that survived server restarts
    try {
      const resumableResponse = await api.listResumableSessions()
      for (const resumable of resumableResponse.sessions) {
        // Check if this session is already in local storage
        const exists = localSessions.find((s) => s.id === resumable.id)
        if (!exists) {
          // Add the resumable session to local list
          const session: Session = {
            id: resumable.id,
            agent: resumable.agent as Session['agent'],
            status: {
              id: resumable.id,
              agent: resumable.agent as Session['agent'],
              authMode: 'oauth', // SDK sessions typically use oauth
              running: false, // Not running yet - needs restore
              pendingRequests: 0,
              lastActivityTime: resumable.lastActivity,
              idleMs: Date.now() - resumable.lastActivity,
              acpSessionId: resumable.sdkSessionId ?? null,
              sdkSessionId: resumable.sdkSessionId ?? null,
              isResumable: true,
              workingDirectory: resumable.workingDirectory || undefined,
            },
          }
          localSessions.push(session)
          // Save to IndexedDB for consistency
          await idbSet(`session:${session.id}`, session)
          console.log(`[Sessions] Discovered resumable SDK session: ${session.id}`)
        }
      }
    } catch (err) {
      // Backend might not be available yet, that's okay
      console.warn('[Sessions] Failed to fetch resumable sessions from backend:', err)
    }

    if (localSessions.length > 0) {
      get().setSessions(localSessions)
    }

    // Restore active session
    const activeId = await idbGet('activeSessionId')
    if (activeId && typeof activeId === 'string') {
      const exists = localSessions.find((s) => s.id === activeId)
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
      sdkStreamingState: {},
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
    // Flush any pending debounced persistence
    flushPersist(sessionId, get().messages[sessionId] || [])
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

/**
 * Handle first-class SDK WebSocket messages
 * These messages use native content block arrays instead of JSON-RPC wrapped format
 */
function handleSdkWebSocketMessage(
  sessionId: string,
  message: SdkWsMessage,
  get: () => SessionsState,
  set: (fn: (state: SessionsState) => Partial<SessionsState>) => void
) {
  const { type, payload } = message
  const { activeSessionId } = get()
  const isActive = sessionId === activeSessionId

  switch (type) {
    case 'content_block_start': {
      const { index, contentBlock } = payload as { index: number; contentBlock: SdkContentBlock }

      // Debug: log thinking blocks
      if (contentBlock.type === 'thinking') {
        console.log('[SDK WS] content_block_start: thinking block received', { index, contentBlock })
      }

      // Initialize streaming state if this is the first block
      const currentState = get().sdkStreamingState[sessionId]
      if (!currentState) {
        const msgId = `msg-${Date.now()}`
        get().setStreaming(sessionId, true, msgId)

        // Create message with empty content blocks array
        get().addMessage(sessionId, {
          id: msgId,
          sessionId,
          role: 'assistant',
          content: [] as unknown as string, // Will be array of content blocks
          timestamp: new Date().toISOString(),
        })

        set((state) => ({
          sdkStreamingState: {
            ...state.sdkStreamingState,
            [sessionId]: {
              messageId: msgId,
              contentBlocks: [contentBlock],
              currentBlockIndex: index,
            },
          },
        }))
      } else {
        // Add new content block to streaming state
        set((state) => {
          const streamState = state.sdkStreamingState[sessionId]
          if (!streamState) return state
          const blocks = [...streamState.contentBlocks]
          blocks[index] = contentBlock
          return {
            sdkStreamingState: {
              ...state.sdkStreamingState,
              [sessionId]: {
                ...streamState,
                contentBlocks: blocks,
                currentBlockIndex: index,
              },
            },
          }
        })
      }
      break
    }

    case 'assistant_delta': {
      const { index, delta } = payload as { index: number; delta: { type: string; text?: string; thinking?: string; partial_json?: string } }

      set((state) => {
        const streamState = state.sdkStreamingState[sessionId]
        if (!streamState) return state

        const blocks = [...streamState.contentBlocks]
        const block = blocks[index]
        if (!block) return state

        // Apply delta to the current block
        if (delta.type === 'text_delta' && block.type === 'text') {
          blocks[index] = { ...block, text: (block.text || '') + (delta.text || '') }
        } else if (delta.type === 'thinking_delta' && block.type === 'thinking') {
          console.log('[SDK WS] thinking_delta received:', delta.thinking?.slice(0, 50))
          blocks[index] = { ...block, thinking: (block.thinking || '') + (delta.thinking || '') }
        } else if (delta.type === 'input_json_delta' && block.type === 'tool_use') {
          // Accumulate partial JSON - will be parsed when block stops
          const currentInput = typeof block.input === 'string' ? block.input : ''
          blocks[index] = { ...block, input: currentInput + (delta.partial_json || '') }
        }

        // Update the message content with current blocks
        const msgId = streamState.messageId
        const sessionMessages = state.messages[sessionId] || []
        const msgIndex = sessionMessages.findIndex((m) => m.id === msgId)
        if (msgIndex === -1) return { sdkStreamingState: { ...state.sdkStreamingState, [sessionId]: { ...streamState, contentBlocks: blocks } } }

        const updatedMessages = [...sessionMessages]
        updatedMessages[msgIndex] = {
          ...updatedMessages[msgIndex],
          content: blocks as unknown as ContentBlock[],
        }

        return {
          messages: { ...state.messages, [sessionId]: updatedMessages },
          sdkStreamingState: { ...state.sdkStreamingState, [sessionId]: { ...streamState, contentBlocks: blocks } },
        }
      })
      // Debounce persist during rapid streaming
      debouncedPersist(sessionId, get().messages[sessionId] || [])
      break
    }

    case 'content_block_stop': {
      const { index } = payload as { index: number }

      set((state) => {
        const streamState = state.sdkStreamingState[sessionId]
        if (!streamState) return state

        const blocks = [...streamState.contentBlocks]
        const block = blocks[index]

        // Parse tool_use input JSON if needed
        if (block?.type === 'tool_use' && typeof block.input === 'string') {
          try {
            blocks[index] = { ...block, input: JSON.parse(block.input) }
          } catch {
            // Keep as string if JSON parse fails
          }
        }

        // Update message with finalized blocks
        const msgId = streamState.messageId
        const sessionMessages = state.messages[sessionId] || []
        const msgIndex = sessionMessages.findIndex((m) => m.id === msgId)
        if (msgIndex === -1) return { sdkStreamingState: { ...state.sdkStreamingState, [sessionId]: { ...streamState, contentBlocks: blocks } } }

        const updatedMessages = [...sessionMessages]
        updatedMessages[msgIndex] = {
          ...updatedMessages[msgIndex],
          content: blocks as unknown as ContentBlock[],
        }

        return {
          messages: { ...state.messages, [sessionId]: updatedMessages },
          sdkStreamingState: { ...state.sdkStreamingState, [sessionId]: { ...streamState, contentBlocks: blocks } },
        }
      })
      // Debounce persist when content block finishes
      debouncedPersist(sessionId, get().messages[sessionId] || [])
      break
    }

    case 'assistant_message': {
      const { messageId, content } = payload as {
        messageId: string
        stopReason?: string
        usage?: { input_tokens: number; output_tokens: number }
        content: SdkContentBlock[]
      }

      // Complete message with all content blocks
      const streamState = get().sdkStreamingState[sessionId]
      if (streamState) {
        // Update the streaming message with final content
        get().updateMessage(sessionId, streamState.messageId, {
          content: content as unknown as ContentBlock[],
        })
      } else {
        // Create new message if no streaming state (shouldn't happen normally)
        const msgId = `msg-${messageId || Date.now()}`
        get().addMessage(sessionId, {
          id: msgId,
          sessionId,
          role: 'assistant',
          content: content as unknown as ContentBlock[],
          timestamp: new Date().toISOString(),
        })
      }

      // Force immediate persist on message completion (not debounced)
      flushPersist(sessionId, get().messages[sessionId] || [])

      // Clear streaming state
      set((state) => ({
        sdkStreamingState: { ...state.sdkStreamingState, [sessionId]: null },
      }))

      if (!isActive) {
        get().incrementUnread(sessionId)
      }
      break
    }

    case 'prompt_complete':
    case 'prompt_error': {
      // Stop streaming
      get().setStreaming(sessionId, false)

      // Flush any pending debounced persistence
      flushPersist(sessionId, get().messages[sessionId] || [])

      // Clear streaming state
      set((state) => ({
        sdkStreamingState: { ...state.sdkStreamingState, [sessionId]: null },
      }))

      // Update usage if available
      if (type === 'prompt_complete') {
        const result = payload as SessionResult
        get().setSdkUsage(sessionId, result)
      }
      break
    }

    case 'permission_request': {
      const params = payload as { toolCallId: string; toolCall: unknown; options: unknown[] }
      handlePermissionRequest(sessionId, params, get)
      break
    }

    default:
      // Unknown SDK message type - log for debugging
      console.log('[SDK WS] Unknown message type:', type, payload)
  }
}

/**
 * Handle first-class Pi WebSocket messages
 * These messages handle Pi SDK events and responses
 */
function handlePiWebSocketMessage(
  sessionId: string,
  message: PiWsMessage,
  get: () => SessionsState,
  set: (fn: (state: SessionsState) => Partial<SessionsState>) => void
) {
  const { type, payload } = message
  const { activeSessionId } = get()
  const isActive = sessionId === activeSessionId

  switch (type) {
    case 'message_update': {
      const event = payload as {
        assistantMessageEvent: {
          type: string
          delta?: string
          toolCallId?: string
          toolName?: string
          error?: string
        }
      }
      const msgEvent = event.assistantMessageEvent

      // Handle streaming text updates
      if (msgEvent.type === 'text_delta' && msgEvent.delta) {
        const currentState = get().piStreamingState[sessionId]
        if (!currentState) {
          // Initialize streaming state
          const msgId = `msg-${Date.now()}`
          get().setStreaming(sessionId, true, msgId)

          get().addMessage(sessionId, {
            id: msgId,
            sessionId,
            role: 'assistant',
            content: msgEvent.delta,
            timestamp: new Date().toISOString(),
          })

          set((state) => ({
            piStreamingState: {
              ...state.piStreamingState,
              [sessionId]: {
                messageId: msgId,
                contentBlocks: [{ type: 'text', text: msgEvent.delta || '' }],
                currentBlockIndex: 0,
                isStreaming: true,
              },
            },
          }))
        } else {
          // Append to existing message
          const msgId = currentState.messageId
          const messages = get().messages[sessionId] || []
          const msgIndex = messages.findIndex((m) => m.id === msgId)
          if (msgIndex !== -1) {
            const msg = messages[msgIndex]
            const updatedContent = (typeof msg.content === 'string' ? msg.content : '') + msgEvent.delta
            get().updateMessage(sessionId, msgId, { content: updatedContent })
            debouncedPersist(sessionId, get().messages[sessionId] || [])
          }
        }
      } else if (msgEvent.type === 'thinking_delta' && msgEvent.delta) {
        // Handle thinking deltas (similar to text but for thinking blocks)
        console.log('[Pi WS] thinking_delta:', msgEvent.delta?.slice(0, 50))
      } else if (msgEvent.type === 'done') {
        // Message complete
        get().setStreaming(sessionId, false)
        flushPersist(sessionId, get().messages[sessionId] || [])
        set((state) => ({
          piStreamingState: { ...state.piStreamingState, [sessionId]: null },
        }))
        if (!isActive) {
          get().incrementUnread(sessionId)
        }
      } else if (msgEvent.type === 'error') {
        console.error('[Pi WS] Error:', msgEvent.error)
        get().setStreaming(sessionId, false)
      }
      break
    }

    case 'agent_start': {
      get().setStreaming(sessionId, true)
      break
    }

    case 'agent_end': {
      get().setStreaming(sessionId, false)
      flushPersist(sessionId, get().messages[sessionId] || [])
      set((state) => ({
        piStreamingState: { ...state.piStreamingState, [sessionId]: null },
      }))
      break
    }

    case 'tool_execution_start': {
      const tool = payload as { toolName: string; toolCallId: string }
      console.log('[Pi WS] Tool execution start:', tool.toolName)
      break
    }

    case 'tool_execution_end': {
      const tool = payload as { toolName: string; toolCallId: string; result?: unknown; error?: string }
      console.log('[Pi WS] Tool execution end:', tool.toolName, tool.error ? `(error: ${tool.error})` : '')
      break
    }

    case 'auto_compaction_start': {
      const compaction = payload as { preTokens: number }
      console.log('[Pi WS] Compaction started, pre-tokens:', compaction.preTokens)
      break
    }

    case 'auto_compaction_end': {
      const compaction = payload as { preTokens: number; postTokens: number }
      console.log('[Pi WS] Compaction complete, saved tokens:', compaction.preTokens - compaction.postTokens)
      break
    }

    default:
      // Handle JSON-RPC responses for Pi-specific commands
      if (typeof payload === 'object' && payload !== null && 'method' in (payload as Record<string, unknown>)) {
        const rpcPayload = payload as { method: string; params: unknown }
        handlePiJsonRpcResponse(sessionId, rpcPayload.method, rpcPayload.params, get, set)
      } else {
        console.log('[Pi WS] Unknown message type:', type, payload)
      }
  }
}

/**
 * Handle Pi JSON-RPC responses
 */
function handlePiJsonRpcResponse(
  sessionId: string,
  method: string,
  params: unknown,
  get: () => SessionsState,
  _set: (fn: (state: SessionsState) => Partial<SessionsState>) => void
) {
  switch (method) {
    case 'pi/model_changed': {
      const model = params as { provider: string; modelId: string } | null
      if (model) {
        console.log('[Pi] Model changed to:', model.provider, model.modelId)
      }
      break
    }

    case 'pi/thinking_level_changed': {
      const level = params as { level: PiThinkingLevel }
      get().setPiThinkingLevel(sessionId, level.level)
      break
    }

    case 'pi/session_tree': {
      const tree = (params as { tree: PiSessionTree | null }).tree
      get().setPiSessionTree(sessionId, tree)
      get().setPiLoading(sessionId, { tree: false })
      break
    }

    case 'pi/forkable_entries': {
      const entries = (params as { entries: PiForkableEntry[] }).entries
      get().setPiForkableEntries(sessionId, entries)
      get().setPiLoading(sessionId, { forkable: false })
      break
    }

    case 'pi/session_stats': {
      const stats = (params as { stats: PiSessionStats | null }).stats
      get().setPiStats(sessionId, stats)
      get().setPiLoading(sessionId, { stats: false })
      break
    }

    case 'pi/available_models': {
      const data = params as { models?: PiModelInfo[]; error?: string }
      if (data.models) {
        get().setPiModels(sessionId, data.models)
      } else if (data.error) {
        get().setPiErrors(sessionId, { models: data.error })
      }
      get().setPiLoading(sessionId, { models: false })
      break
    }

    default:
      console.log('[Pi RPC] Unknown method:', method, params)
  }
}
