// Global app state store

import { create } from 'zustand'
import { api } from '@/api/client'
import type { WorkspaceRecord } from '@/api/types'

type Theme = 'light' | 'dark'

interface AppState {
  // Connection
  gatewayUrl: string
  apiToken: string
  isConnected: boolean

  // Theme
  theme: Theme

  // UI state
  commandPaletteOpen: boolean
  sdkPanelOpen: boolean

  // Workspace rail state
  workspaces: WorkspaceRecord[]
  workspacesLoading: boolean
  activeWorkspaceId: string | null
  workspacePanelOpen: boolean
  mobileCarousel: {
    visible: boolean
    count: number
    index: number
  }

  // Actions
  setGatewayUrl: (url: string) => void
  setApiToken: (token: string) => void
  setConnected: (connected: boolean) => void
  setTheme: (theme: Theme) => void
  toggleTheme: () => void
  setCommandPaletteOpen: (open: boolean) => void
  toggleCommandPalette: () => void
  setSdkPanelOpen: (open: boolean) => void
  toggleSdkPanel: () => void
  fetchWorkspaces: () => Promise<void>
  setActiveWorkspaceId: (id: string | null) => void
  setWorkspacePanelOpen: (open: boolean) => void
  setMobileCarousel: (state: { visible: boolean; count: number; index: number }) => void

  // Initialization
  initFromStorage: () => boolean
  saveToStorage: () => void
  clearStorage: () => void
}

const STORAGE_KEYS = {
  gatewayUrl: 'aperture:gatewayUrl',
  apiToken: 'aperture:apiToken',
  theme: 'aperture:theme',
  isConnected: 'aperture:isConnected',
}

function safeGet(storage: Storage | undefined, key: string): string | null {
  try {
    return storage?.getItem(key) ?? null
  } catch (error) {
    console.warn(`[AppStore] Failed to read ${key} from storage`, error)
    return null
  }
}

function safeSet(storage: Storage | undefined, key: string, value: string): void {
  try {
    storage?.setItem(key, value)
  } catch (error) {
    console.warn(`[AppStore] Failed to persist ${key} to storage`, error)
  }
}

function safeRemove(storage: Storage | undefined, key: string): void {
  try {
    storage?.removeItem(key)
  } catch (error) {
    console.warn(`[AppStore] Failed to remove ${key} from storage`, error)
  }
}

export const useAppStore = create<AppState>((set, get) => ({
  // Initial state
  gatewayUrl: '',
  apiToken: '',
  isConnected: false,
  theme: 'dark',
  commandPaletteOpen: false,
  sdkPanelOpen: true,
  workspaces: [],
  workspacesLoading: false,
  activeWorkspaceId: null,
  workspacePanelOpen: false,
  mobileCarousel: {
    visible: false,
    count: 0,
    index: 0,
  },

  // Actions
  setGatewayUrl: (url) => {
    set({ gatewayUrl: url })
    safeSet(globalThis.localStorage, STORAGE_KEYS.gatewayUrl, url)
  },

  setApiToken: (token) => {
    set({ apiToken: token })
    // Use sessionStorage by default for security
    safeSet(globalThis.sessionStorage, STORAGE_KEYS.apiToken, token)
  },

  setConnected: (connected) => {
    set({ isConnected: connected })
    safeSet(globalThis.localStorage, STORAGE_KEYS.isConnected, String(connected))
  },

  setTheme: (theme) => {
    set({ theme })
    safeSet(globalThis.localStorage, STORAGE_KEYS.theme, theme)
  },

  toggleTheme: () => {
    const newTheme = get().theme === 'dark' ? 'light' : 'dark'
    get().setTheme(newTheme)
  },

  setCommandPaletteOpen: (open) => set({ commandPaletteOpen: open }),
  toggleCommandPalette: () => set((s) => ({ commandPaletteOpen: !s.commandPaletteOpen })),

  setSdkPanelOpen: (open) => set({ sdkPanelOpen: open }),
  toggleSdkPanel: () => set((s) => ({ sdkPanelOpen: !s.sdkPanelOpen })),

  fetchWorkspaces: async () => {
    set({ workspacesLoading: true })
    try {
      const { workspaces } = await api.listWorkspaces()
      set({ workspaces, workspacesLoading: false })
    } catch {
      set({ workspacesLoading: false })
    }
  },

  setActiveWorkspaceId: (id) => set({ activeWorkspaceId: id }),
  setWorkspacePanelOpen: (open) => set({ workspacePanelOpen: open }),
  setMobileCarousel: (mobileCarousel) => set({ mobileCarousel }),

  initFromStorage: () => {
    const gatewayUrl = safeGet(globalThis.localStorage, STORAGE_KEYS.gatewayUrl) || 'http://localhost:8080'
    const apiToken = safeGet(globalThis.sessionStorage, STORAGE_KEYS.apiToken) || ''
    const theme = (safeGet(globalThis.localStorage, STORAGE_KEYS.theme) as Theme | null) || 'dark'
    const isConnected = safeGet(globalThis.localStorage, STORAGE_KEYS.isConnected) === 'true' && !!apiToken

    set({ gatewayUrl, apiToken, theme, isConnected })

    // Configure API client
    api.configure(gatewayUrl, apiToken)

    return isConnected
  },

  saveToStorage: () => {
    const { gatewayUrl, apiToken, theme, isConnected } = get()
    safeSet(globalThis.localStorage, STORAGE_KEYS.gatewayUrl, gatewayUrl)
    safeSet(globalThis.sessionStorage, STORAGE_KEYS.apiToken, apiToken)
    safeSet(globalThis.localStorage, STORAGE_KEYS.theme, theme)
    safeSet(globalThis.localStorage, STORAGE_KEYS.isConnected, String(isConnected))
  },

  clearStorage: () => {
    safeRemove(globalThis.localStorage, STORAGE_KEYS.gatewayUrl)
    safeRemove(globalThis.localStorage, STORAGE_KEYS.theme)
    safeRemove(globalThis.localStorage, STORAGE_KEYS.isConnected)
    safeRemove(globalThis.sessionStorage, STORAGE_KEYS.apiToken)
    set({
      gatewayUrl: 'http://localhost:8080',
      apiToken: '',
      isConnected: false,
    })
  },
}))
