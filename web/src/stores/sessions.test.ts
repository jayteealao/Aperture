import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Session } from '@/api/types'

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
      messages: {
        [sessionId]: [
          {
            id: 'msg-1',
            sessionId,
            role: 'assistant',
            content: 'hello',
            timestamp: '2026-03-14T12:00:00.000Z',
          },
        ],
      },
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
      piStreamingState: {
        [sessionId]: {
          messageId: 'msg-1',
          contentBlocks: [{ type: 'text', text: 'hello' }],
          currentBlockIndex: 0,
          isStreaming: true,
        },
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
    expect(state.piStreamingState[sessionId]).toBeUndefined()
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
      sdkStreamingState: {
        'sdk-1': { messageId: 'msg-1', contentBlocks: [], currentBlockIndex: 0 },
      },
      piConfig: { 'pi-1': { thinkingLevel: 'high' } },
      piStats: {
        'pi-1': { inputTokens: 1, outputTokens: 1, totalCost: 0.2, turnCount: 1 },
      },
      piStreamingState: {
        'pi-1': {
          messageId: 'msg-2',
          contentBlocks: [],
          currentBlockIndex: 0,
          isStreaming: true,
        },
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
    expect(state.sdkStreamingState).toEqual({})
    expect(state.piConfig).toEqual({})
    expect(state.piStats).toEqual({})
    expect(state.piModels).toEqual({})
    expect(state.piSessionTree).toEqual({})
    expect(state.piForkableEntries).toEqual({})
    expect(state.piThinkingLevel).toEqual({})
    expect(state.piLoading).toEqual({})
    expect(state.piErrors).toEqual({})
    expect(state.piStreamingState).toEqual({})
  })
})
