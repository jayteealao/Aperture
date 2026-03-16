// Permission state slice — manages pending permission requests (SDK only)

import type { StateCreator } from 'zustand'
import type { SessionsStore } from './index'

export interface PermissionSlice {
  pendingPermissions: Record<string, {
    toolCallId: string
    toolCall: unknown
    options: unknown[]
  }>

  addPendingPermission: (sessionId: string, permission: { toolCallId: string; toolCall: unknown; options: unknown[] }) => void
  removePendingPermission: (sessionId: string, toolCallId: string) => void
  removePendingPermissionsForSession: (sessionId: string) => void
}

export const permissionSliceInitialState = {
  pendingPermissions: {} as PermissionSlice['pendingPermissions'],
}

export const createPermissionSlice: StateCreator<SessionsStore, [], [], PermissionSlice> = (set) => ({
  ...permissionSliceInitialState,

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

  removePendingPermissionsForSession: (sessionId) => {
    set((state) => ({
      pendingPermissions: Object.fromEntries(
        Object.entries(state.pendingPermissions).filter(([key]) => !key.startsWith(`${sessionId}:`))
      ),
    }))
  },
})
