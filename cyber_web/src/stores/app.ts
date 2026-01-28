// Global app state store

import { create } from 'zustand'
import { api } from '@/api/client'

type Theme = 'light' | 'dark'

interface AppState {
  // Connection
  gatewayUrl: string
  apiToken: string
  isConnected: boolean

  // Theme
  theme: Theme

  // UI state
  sidebarOpen: boolean
  commandPaletteOpen: boolean
  sdkPanelOpen: boolean

  // Actions
  setGatewayUrl: (url: string) => void
  setApiToken: (token: string) => void
  setConnected: (connected: boolean) => void
  setTheme: (theme: Theme) => void
  toggleTheme: () => void
  setSidebarOpen: (open: boolean) => void
  toggleSidebar: () => void
  setCommandPaletteOpen: (open: boolean) => void
  toggleCommandPalette: () => void
  setSdkPanelOpen: (open: boolean) => void
  toggleSdkPanel: () => void

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

export const useAppStore = create<AppState>((set, get) => ({
  // Initial state
  gatewayUrl: '',
  apiToken: '',
  isConnected: false,
  theme: 'dark',
  sidebarOpen: true,
  commandPaletteOpen: false,
  sdkPanelOpen: true,

  // Actions
  setGatewayUrl: (url) => {
    set({ gatewayUrl: url })
    localStorage.setItem(STORAGE_KEYS.gatewayUrl, url)
  },

  setApiToken: (token) => {
    set({ apiToken: token })
    // Use sessionStorage by default for security
    sessionStorage.setItem(STORAGE_KEYS.apiToken, token)
  },

  setConnected: (connected) => {
    set({ isConnected: connected })
    localStorage.setItem(STORAGE_KEYS.isConnected, String(connected))
  },

  setTheme: (theme) => {
    set({ theme })
    localStorage.setItem(STORAGE_KEYS.theme, theme)
  },

  toggleTheme: () => {
    const newTheme = get().theme === 'dark' ? 'light' : 'dark'
    get().setTheme(newTheme)
  },

  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),

  setCommandPaletteOpen: (open) => set({ commandPaletteOpen: open }),
  toggleCommandPalette: () => set((s) => ({ commandPaletteOpen: !s.commandPaletteOpen })),

  setSdkPanelOpen: (open) => set({ sdkPanelOpen: open }),
  toggleSdkPanel: () => set((s) => ({ sdkPanelOpen: !s.sdkPanelOpen })),

  initFromStorage: () => {
    const gatewayUrl = localStorage.getItem(STORAGE_KEYS.gatewayUrl) || 'http://localhost:8080'
    const apiToken = sessionStorage.getItem(STORAGE_KEYS.apiToken) || ''
    const theme = (localStorage.getItem(STORAGE_KEYS.theme) as Theme) || 'dark'
    const isConnected = localStorage.getItem(STORAGE_KEYS.isConnected) === 'true' && !!apiToken

    set({ gatewayUrl, apiToken, theme, isConnected })

    // Configure API client
    if (gatewayUrl && apiToken) {
      api.configure(gatewayUrl, apiToken)
    }

    return isConnected
  },

  saveToStorage: () => {
    const { gatewayUrl, apiToken, theme, isConnected } = get()
    localStorage.setItem(STORAGE_KEYS.gatewayUrl, gatewayUrl)
    sessionStorage.setItem(STORAGE_KEYS.apiToken, apiToken)
    localStorage.setItem(STORAGE_KEYS.theme, theme)
    localStorage.setItem(STORAGE_KEYS.isConnected, String(isConnected))
  },

  clearStorage: () => {
    localStorage.removeItem(STORAGE_KEYS.gatewayUrl)
    localStorage.removeItem(STORAGE_KEYS.theme)
    localStorage.removeItem(STORAGE_KEYS.isConnected)
    sessionStorage.removeItem(STORAGE_KEYS.apiToken)
    set({
      gatewayUrl: 'http://localhost:8080',
      apiToken: '',
      isConnected: false,
    })
  },
}))
