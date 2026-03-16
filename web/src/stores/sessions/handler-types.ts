// Shared types for WebSocket message handler functions
import type { SessionsStore } from './index'

export type StoreGet = () => SessionsStore
export type StoreSet = (fn: (state: SessionsStore) => Partial<SessionsStore>) => void
