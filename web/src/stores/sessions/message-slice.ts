// Message state slice — TEMPORARY
// Retained during feature flag period for ChatViewLegacy.
// After flag removal (Phase 8), this entire slice is deleted —
// useChat owns message state via WsToUIChunkTranslator.

import type { StateCreator } from 'zustand'
import { get as idbGet, set as idbSet, del as idbDel } from 'idb-keyval'
import type { Message } from '@/api/types'
import type { SessionsStore } from './index'
import { debouncedPersist } from './persistence'

export interface MessageSlice {
  messages: Record<string, Message[]>

  addMessage: (sessionId: string, message: Message) => Promise<void>
  addUserMessageOnly: (sessionId: string, content: string) => Promise<void>
  updateMessage: (sessionId: string, messageId: string, updates: Partial<Message>) => void
  loadMessagesForSession: (sessionId: string) => Promise<void>
  clearMessages: (sessionId: string) => void
}

export const messageSliceInitialState = {
  messages: {} as Record<string, Message[]>,
}

export const createMessageSlice: StateCreator<SessionsStore, [], [], MessageSlice> = (set, get) => ({
  ...messageSliceInitialState,

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
      id: crypto.randomUUID(),
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
          [sessionId]: stored as Message[],
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
})
