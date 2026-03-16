// Combined sessions store — composed from focused slices
//
// The old monolithic sessions.ts (1,460 lines) is split into:
//   session-slice    — session list, active session, add/remove, restore
//   connection-slice — WS connection lifecycle, status, message routing
//   message-slice    — TEMPORARY: messages for legacy path (deleted in Phase 8)
//   permission-slice — pending permission requests (SDK only)
//   sdk-slice        — SDK config/usage/models/commands/mcp/checkpoints/account
//   pi-slice         — Pi config/stats/models/tree/forkable/thinking/commands
//   persistence      — IndexedDB helpers (standalone, not a slice)
//
// All consumers continue importing { useSessionsStore } from '@/stores/sessions'
// The API surface is identical — no breaking changes.

import { create } from 'zustand'
import { createSessionSlice, type SessionSlice } from './session-slice'
import { createConnectionSlice, type ConnectionSlice } from './connection-slice'
import { createMessageSlice, type MessageSlice } from './message-slice'
import { createPermissionSlice, type PermissionSlice } from './permission-slice'
import { createSdkSlice, type SdkSlice } from './sdk-slice'
import { createPiSlice, type PiSlice } from './pi-slice'

// Combined store type — used by all slices as the StateCreator generic parameter.
// MessageSlice is included during the feature flag period.
// After flag removal (Phase 8), delete MessageSlice and message-slice.ts.
export type SessionsStore =
  SessionSlice &
  ConnectionSlice &
  MessageSlice &
  PermissionSlice &
  SdkSlice &
  PiSlice

export const useSessionsStore = create<SessionsStore>()((...args) => ({
  ...createSessionSlice(...args),
  ...createConnectionSlice(...args),
  ...createMessageSlice(...args),
  ...createPermissionSlice(...args),
  ...createSdkSlice(...args),
  ...createPiSlice(...args),
}))
