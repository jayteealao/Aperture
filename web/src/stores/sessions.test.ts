import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Session, ConnectionState } from '@/api/types'
import { handleJsonRpcMessage } from './sessions/jsonrpc-message-handler'

vi.mock('idb-keyval', () => ({
  get: vi.fn(),
  set: vi.fn(),
  del: vi.fn(),
  clear: vi.fn(),
  keys: vi.fn(async () => []),
}))

vi.mock('@/api/client', () => ({
  api: {
    connectSession: vi.fn(),
    getWebSocketUrl: vi.fn(),
    listResumableSessions: vi.fn(async () => ({ sessions: [] })),
  },
}))

const websocketMocks = vi.hoisted(() => ({
  disconnect: vi.fn(),
  disconnectAll: vi.fn(),
}))

vi.mock('@/api/websocket', () => ({
  wsManager: {
    connect: vi.fn(),
    disconnect: websocketMocks.disconnect,
    disconnectAll: websocketMocks.disconnectAll,
    emitUIChunk: vi.fn(),
    send: vi.fn(),
  },
}))

import { useSessionsStore } from './sessions'

const initialState = useSessionsStore.getState()

function makeSession(id: string, agent: Session['agent']): Session {
  return {
    id,
    agent,
    status: {
      id,
      agent,
      authMode: 'api_key',
      running: false,
      pendingRequests: 0,
      lastActivityTime: Date.now(),
      idleMs: 0,
      acpSessionId: null,
      sdkSessionId: null,
    },
  }
}

// Convenience wrappers matching StoreGet / StoreSet signatures
const storeGet = () => useSessionsStore.getState()
const storeSet: Parameters<typeof handleJsonRpcMessage>[3] = (fn) =>
  useSessionsStore.setState(fn)

const FIXED_TIMESTAMP = 1_700_000_000_000

function makeConnection(overrides: Partial<ConnectionState> = {}): ConnectionState {
  return {
    status: 'connected',
    error: null,
    retryCount: 0,
    isStreaming: false,
    hasUnread: false,
    unreadCount: 0,
    lastActivity: FIXED_TIMESTAMP,
    ...overrides,
  }
}

describe('useSessionsStore connection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    useSessionsStore.setState(initialState, true)
  })

  it('updateConnection is a no-op after cleanupConnection removes the entry', () => {
    const sessionId = 'ghost-1'
    useSessionsStore.setState((state) => ({
      ...state,
      sessions: [makeSession(sessionId, 'claude_sdk')],
      connections: { [sessionId]: makeConnection({ status: 'connected' }) },
    }))

    useSessionsStore.getState().cleanupConnection(sessionId)
    expect(useSessionsStore.getState().connections[sessionId]).toBeUndefined()

    // Simulate a delayed WS status callback arriving after cleanup
    useSessionsStore.getState().updateConnection(sessionId, { status: 'error', error: 'stale' })

    // Must remain absent — not resurrected by the delayed update
    expect(useSessionsStore.getState().connections[sessionId]).toBeUndefined()
  })

  it('setStreaming is a no-op after session is removed', async () => {
    const sessionId = 'ghost-2'
    useSessionsStore.setState((state) => ({
      ...state,
      sessions: [makeSession(sessionId, 'claude_sdk')],
      connections: { [sessionId]: makeConnection({ isStreaming: true }) },
    }))

    await useSessionsStore.getState().removeSession(sessionId)
    expect(useSessionsStore.getState().connections[sessionId]).toBeUndefined()

    useSessionsStore.getState().setStreaming(sessionId, false)

    expect(useSessionsStore.getState().connections[sessionId]).toBeUndefined()
  })

  it('session/error JSON-RPC message clears streaming and sets error status', () => {
    const sessionId = 'err-1'
    useSessionsStore.setState((state) => ({
      ...state,
      sessions: [makeSession(sessionId, 'claude_sdk')],
      connections: { [sessionId]: makeConnection({ isStreaming: true }) },
    }))

    handleJsonRpcMessage(
      sessionId,
      { jsonrpc: '2.0', method: 'session/error', params: { message: 'Server crashed' } },
      storeGet,
      storeSet,
    )

    const conn = useSessionsStore.getState().connections[sessionId]
    expect(conn?.status).toBe('error')
    expect(conn?.error).toBe('Server crashed')
    expect(conn?.isStreaming).toBe(false)
  })

  it('session/error uses fallback message when params.message is absent', () => {
    const sessionId = 'err-2'
    useSessionsStore.setState((state) => ({
      ...state,
      sessions: [makeSession(sessionId, 'claude_sdk')],
      connections: { [sessionId]: makeConnection() },
    }))

    handleJsonRpcMessage(sessionId, { jsonrpc: '2.0', method: 'session/error' }, storeGet, storeSet)

    expect(useSessionsStore.getState().connections[sessionId]?.error).toBe('Session error')
  })

  it('session/exit JSON-RPC message clears streaming and sets status to ended', () => {
    const sessionId = 'exit-1'
    useSessionsStore.setState((state) => ({
      ...state,
      sessions: [makeSession(sessionId, 'claude_sdk')],
      connections: { [sessionId]: makeConnection({ isStreaming: true }) },
    }))

    handleJsonRpcMessage(
      sessionId,
      { jsonrpc: '2.0', method: 'session/exit', params: { exitCode: 0 } },
      storeGet,
      storeSet,
    )

    const conn = useSessionsStore.getState().connections[sessionId]
    expect(conn?.status).toBe('ended')
    expect(conn?.isStreaming).toBe(false)
  })

  it('handleJsonRpcMessage ignores non-object frames', () => {
    const sessionId = 'malformed-1'
    useSessionsStore.setState((state) => ({
      ...state,
      sessions: [makeSession(sessionId, 'claude_sdk')],
      connections: { [sessionId]: makeConnection() },
    }))

    // None of these should throw or mutate state
    expect(() => handleJsonRpcMessage(sessionId, null, storeGet, storeSet)).not.toThrow()
    expect(() => handleJsonRpcMessage(sessionId, 'ping', storeGet, storeSet)).not.toThrow()
    expect(() => handleJsonRpcMessage(sessionId, 42, storeGet, storeSet)).not.toThrow()

    expect(useSessionsStore.getState().connections[sessionId]?.status).toBe('connected')
  })

  // TS-1: incrementUnread ghost guard
  it('incrementUnread is a no-op after cleanupConnection removes the entry', () => {
    const sessionId = 'ghost-3'
    useSessionsStore.setState((state) => ({
      ...state,
      sessions: [makeSession(sessionId, 'claude_sdk')],
      connections: { [sessionId]: makeConnection() },
    }))

    useSessionsStore.getState().cleanupConnection(sessionId)
    expect(useSessionsStore.getState().connections[sessionId]).toBeUndefined()

    useSessionsStore.getState().incrementUnread(sessionId)

    expect(useSessionsStore.getState().connections[sessionId]).toBeUndefined()
  })

  // TS-2: session/request_permission
  it('session/request_permission clears streaming, adds pending permission, increments unread for inactive session', () => {
    const sessionId = 'perm-1'
    useSessionsStore.setState((state) => ({
      ...state,
      sessions: [makeSession(sessionId, 'claude_sdk')],
      connections: { [sessionId]: makeConnection({ isStreaming: true }) },
      activeSessionId: 'other-session',
    }))

    handleJsonRpcMessage(
      sessionId,
      {
        jsonrpc: '2.0',
        method: 'session/request_permission',
        params: { toolCallId: 'tool-1', toolCall: { name: 'Bash' }, options: [] },
      },
      storeGet,
      storeSet,
    )

    const conn = useSessionsStore.getState().connections[sessionId]
    expect(conn?.isStreaming).toBe(false)
    expect(conn?.hasUnread).toBe(true)
    expect(useSessionsStore.getState().pendingPermissions[`${sessionId}:tool-1`]).toBeDefined()
  })

  it('session/request_permission does not increment unread for the active session', () => {
    const sessionId = 'perm-2'
    useSessionsStore.setState((state) => ({
      ...state,
      sessions: [makeSession(sessionId, 'claude_sdk')],
      connections: { [sessionId]: makeConnection({ isStreaming: true }) },
      activeSessionId: sessionId,
    }))

    handleJsonRpcMessage(
      sessionId,
      {
        jsonrpc: '2.0',
        method: 'session/request_permission',
        params: { toolCallId: 'tool-2', toolCall: { name: 'Bash' }, options: [] },
      },
      storeGet,
      storeSet,
    )

    const conn = useSessionsStore.getState().connections[sessionId]
    expect(conn?.isStreaming).toBe(false)
    expect(conn?.hasUnread).toBe(false)
    expect(useSessionsStore.getState().pendingPermissions[`${sessionId}:tool-2`]).toBeDefined()
  })
})

// TS-3: handleSessionUpdate sub-type coverage
describe('useSessionsStore session/update sub-types', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    useSessionsStore.setState(initialState, true)
  })

  it('agent_message_chunk starts streaming and increments unread for inactive session', () => {
    const sessionId = 'upd-1'
    useSessionsStore.setState((state) => ({
      ...state,
      sessions: [makeSession(sessionId, 'claude_sdk')],
      connections: { [sessionId]: makeConnection({ isStreaming: false }) },
      activeSessionId: 'other-session',
    }))

    handleJsonRpcMessage(
      sessionId,
      {
        jsonrpc: '2.0',
        method: 'session/update',
        params: { update: { sessionUpdate: 'agent_message_chunk', content: 'hello' } },
      },
      storeGet,
      storeSet,
    )

    const conn = useSessionsStore.getState().connections[sessionId]
    expect(conn?.isStreaming).toBe(true)
    expect(conn?.hasUnread).toBe(true)
  })

  it('agent_message_chunk does not increment unread for the active session', () => {
    const sessionId = 'upd-2'
    useSessionsStore.setState((state) => ({
      ...state,
      sessions: [makeSession(sessionId, 'claude_sdk')],
      connections: { [sessionId]: makeConnection({ isStreaming: false }) },
      activeSessionId: sessionId,
    }))

    handleJsonRpcMessage(
      sessionId,
      {
        jsonrpc: '2.0',
        method: 'session/update',
        params: { update: { sessionUpdate: 'agent_message_chunk', content: 'hello' } },
      },
      storeGet,
      storeSet,
    )

    const conn = useSessionsStore.getState().connections[sessionId]
    expect(conn?.isStreaming).toBe(true)
    expect(conn?.hasUnread).toBe(false)
  })

  it('prompt_complete stops streaming', () => {
    const sessionId = 'upd-3'
    useSessionsStore.setState((state) => ({
      ...state,
      sessions: [makeSession(sessionId, 'claude_sdk')],
      connections: { [sessionId]: makeConnection({ isStreaming: true }) },
    }))

    handleJsonRpcMessage(
      sessionId,
      {
        jsonrpc: '2.0',
        method: 'session/update',
        params: { update: { sessionUpdate: 'prompt_complete' } },
      },
      storeGet,
      storeSet,
    )

    expect(useSessionsStore.getState().connections[sessionId]?.isStreaming).toBe(false)
  })

  it('prompt_error stops streaming', () => {
    const sessionId = 'upd-4'
    useSessionsStore.setState((state) => ({
      ...state,
      sessions: [makeSession(sessionId, 'claude_sdk')],
      connections: { [sessionId]: makeConnection({ isStreaming: true }) },
    }))

    handleJsonRpcMessage(
      sessionId,
      {
        jsonrpc: '2.0',
        method: 'session/update',
        params: { update: { sessionUpdate: 'prompt_error' } },
      },
      storeGet,
      storeSet,
    )

    expect(useSessionsStore.getState().connections[sessionId]?.isStreaming).toBe(false)
  })

  it('init seeds sdk config including effort', () => {
    const sessionId = 'upd-init'
    useSessionsStore.setState((state) => ({
      ...state,
      sessions: [makeSession(sessionId, 'claude_sdk')],
      connections: { [sessionId]: makeConnection() },
    }))

    handleJsonRpcMessage(
      sessionId,
      {
        jsonrpc: '2.0',
        method: 'session/update',
        params: {
          update: {
            sessionUpdate: 'init',
            config: {
              model: 'claude-sonnet',
              permissionMode: 'plan',
              maxThinkingTokens: 8000,
              effort: 'high',
            },
          },
        },
      },
      storeGet,
      storeSet,
    )

    expect(useSessionsStore.getState().sdkConfig[sessionId]).toEqual({
      model: 'claude-sonnet',
      permissionMode: 'plan',
      maxThinkingTokens: 8000,
      effort: 'high',
    })
  })

  it('config_changed merges effort and thinking token updates', () => {
    const sessionId = 'upd-config'
    useSessionsStore.setState((state) => ({
      ...state,
      sessions: [makeSession(sessionId, 'claude_sdk')],
      connections: { [sessionId]: makeConnection() },
      sdkConfig: {
        [sessionId]: {
          model: 'claude-sonnet',
          permissionMode: 'default',
        },
      },
    }))

    handleJsonRpcMessage(
      sessionId,
      {
        jsonrpc: '2.0',
        method: 'session/update',
        params: {
          update: {
            sessionUpdate: 'config_changed',
            effort: 'max',
            maxThinkingTokens: 16000,
          },
        },
      },
      storeGet,
      storeSet,
    )

    expect(useSessionsStore.getState().sdkConfig[sessionId]).toEqual({
      model: 'claude-sonnet',
      permissionMode: 'default',
      effort: 'max',
      maxThinkingTokens: 16000,
    })
  })
})

describe('useSessionsStore cleanup', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useSessionsStore.setState(initialState, true)
  })

  it('removeSession clears Pi state and pending permissions', async () => {
    const sessionId = 'pi-1'

    useSessionsStore.setState((state) => ({
      ...state,
      sessions: [makeSession(sessionId, 'pi_sdk')],
      activeSessionId: sessionId,
      connections: {
        [sessionId]: {
          status: 'connected',
          error: null,
          retryCount: 0,
          isStreaming: true,
          hasUnread: true,
          unreadCount: 1,
          lastActivity: Date.now(),
        },
      },
      pendingPermissions: {
        [`${sessionId}:tool-1`]: {
          toolCallId: 'tool-1',
          toolCall: { name: 'AskUserQuestion' },
          options: [],
        },
      },
      piConfig: {
        [sessionId]: { thinkingLevel: 'medium' },
      },
      piStats: {
        [sessionId]: {
          inputTokens: 1,
          outputTokens: 2,
          totalCost: 0.1,
          turnCount: 1,
        },
      },
      piModels: {
        [sessionId]: [
          {
            provider: 'anthropic',
            modelId: 'claude-sonnet',
            displayName: 'Claude Sonnet',
            supportsThinking: true,
          },
        ],
      },
      piSessionTree: {
        [sessionId]: {
          entries: [],
          leafId: 'leaf-1',
          branches: {},
          labels: {},
        },
      },
      piForkableEntries: {
        [sessionId]: [
          {
            id: 'entry-1',
            type: 'user_message',
            content: 'hello',
            timestamp: Date.now(),
          },
        ],
      },
      piThinkingLevel: {
        [sessionId]: 'medium',
      },
      piLoading: {
        [sessionId]: { models: true },
      },
      piErrors: {
        [sessionId]: { models: 'boom' },
      },
    }))

    await useSessionsStore.getState().removeSession(sessionId)

    const state = useSessionsStore.getState()
    expect(websocketMocks.disconnect).toHaveBeenCalledWith(sessionId)
    expect(state.sessions).toEqual([])
    expect(state.activeSessionId).toBeNull()
    expect(state.connections[sessionId]).toBeUndefined()
    expect(state.pendingPermissions[`${sessionId}:tool-1`]).toBeUndefined()
    expect(state.piConfig[sessionId]).toBeUndefined()
    expect(state.piStats[sessionId]).toBeUndefined()
    expect(state.piModels[sessionId]).toBeUndefined()
    expect(state.piSessionTree[sessionId]).toBeUndefined()
    expect(state.piForkableEntries[sessionId]).toBeUndefined()
    expect(state.piThinkingLevel[sessionId]).toBeUndefined()
    expect(state.piLoading[sessionId]).toBeUndefined()
    expect(state.piErrors[sessionId]).toBeUndefined()
  })

  it('clearAll clears both SDK and Pi session state', async () => {
    useSessionsStore.setState((state) => ({
      ...state,
      sessions: [makeSession('sdk-1', 'claude_sdk'), makeSession('pi-1', 'pi_sdk')],
      activeSessionId: 'pi-1',
      connections: {
        'pi-1': {
          status: 'connected',
          error: null,
          retryCount: 0,
          isStreaming: true,
          hasUnread: false,
          unreadCount: 0,
          lastActivity: Date.now(),
        },
      },
      pendingPermissions: {
        'pi-1:tool-1': { toolCallId: 'tool-1', toolCall: {}, options: [] },
      },
      sdkConfig: { 'sdk-1': { model: 'claude-3-7-sonnet' } },
      piConfig: { 'pi-1': { thinkingLevel: 'high' } },
      piStats: {
        'pi-1': { inputTokens: 1, outputTokens: 1, totalCost: 0.2, turnCount: 1 },
      },
    }))

    await useSessionsStore.getState().clearAll()

    const state = useSessionsStore.getState()
    expect(websocketMocks.disconnectAll).toHaveBeenCalled()
    expect(state.sessions).toEqual([])
    expect(state.activeSessionId).toBeNull()
    expect(state.connections).toEqual({})
    expect(state.pendingPermissions).toEqual({})
    expect(state.sdkConfig).toEqual({})
    expect(state.piConfig).toEqual({})
    expect(state.piStats).toEqual({})
    expect(state.piModels).toEqual({})
    expect(state.piSessionTree).toEqual({})
    expect(state.piForkableEntries).toEqual({})
    expect(state.piThinkingLevel).toEqual({})
    expect(state.piLoading).toEqual({})
    expect(state.piErrors).toEqual({})
  })
})
