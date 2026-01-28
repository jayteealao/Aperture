import React from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { ToastProvider } from '@/components/ui'
import { useAppStore } from '@/stores'
import { useSessionsStore } from '@/stores'
import {
  OnboardingPage,
  SessionsPage,
  WorkspacePage,
  CredentialsPage,
  SettingsPage,
  HelpPage,
} from '@/pages'

function App() {
  const { initFromStorage, isConnected, theme } = useAppStore()
  const { restoreFromStorage } = useSessionsStore()
  const [isInitialized, setIsInitialized] = React.useState(false)

  // Initialize app state on mount
  React.useEffect(() => {
    const init = async () => {
      const wasConnected = initFromStorage()
      if (wasConnected) {
        await restoreFromStorage()
      }
      setIsInitialized(true)
    }
    init()
  }, [])

  // Apply theme class to document
  React.useEffect(() => {
    document.documentElement.classList.remove('light', 'dark')
    document.documentElement.classList.add(theme)
  }, [theme])

  // Show loading state during initialization
  if (!isInitialized) {
    return (
      <div className="min-h-screen bg-hud-black flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 mx-auto mb-4 relative">
            <div className="absolute inset-0 border border-hud-accent rounded-full animate-pulse" />
            <div className="absolute inset-2 border border-dashed border-hud-accent/50 rounded-full animate-spin-slow" />
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-3 h-3 bg-hud-accent rounded-full" />
            </div>
          </div>
          <p className="font-mono text-xs text-hud-text uppercase tracking-widest">
            Initializing...
          </p>
        </div>
      </div>
    )
  }

  return (
    <ToastProvider>
      <Routes>
        {/* Redirect root to onboarding or sessions based on connection status */}
        <Route
          path="/"
          element={
            isConnected ? <Navigate to="/sessions" replace /> : <OnboardingPage />
          }
        />

        {/* Main routes */}
        <Route path="/sessions" element={<SessionsPage />} />
        <Route path="/workspace/:sessionId" element={<WorkspacePage />} />
        <Route path="/credentials" element={<CredentialsPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/help" element={<HelpPage />} />

        {/* Workspaces route - redirect to sessions for now */}
        <Route path="/workspaces" element={<Navigate to="/sessions" replace />} />

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </ToastProvider>
  )
}

export default App
