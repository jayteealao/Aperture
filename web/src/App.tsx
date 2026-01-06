import { Suspense, lazy, useEffect } from 'react'
import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom'
import { useAppStore } from './stores/app'
import { Shell } from './components/layout/Shell'
import { Spinner } from './components/ui/Spinner'

// Lazy load pages for code splitting
const Onboarding = lazy(() => import('./pages/Onboarding'))
const Workspace = lazy(() => import('./pages/Workspace'))
const Workspaces = lazy(() => import('./pages/Workspaces'))
const Sessions = lazy(() => import('./pages/Sessions'))
const Credentials = lazy(() => import('./pages/Credentials'))
const Settings = lazy(() => import('./pages/Settings'))
const Help = lazy(() => import('./pages/Help'))

function LoadingFallback() {
  return (
    <div className="flex items-center justify-center min-h-screen bg-gradient-mesh">
      <div className="glass-card p-8 text-center animate-in">
        <Spinner size="lg" />
        <p className="mt-4 text-sm text-[var(--color-text-secondary)]">Loading...</p>
      </div>
    </div>
  )
}

function RequireConnection({ children }: { children: React.ReactNode }) {
  const isConnected = useAppStore((s) => s.isConnected)
  const location = useLocation()

  if (!isConnected) {
    return <Navigate to="/onboarding" state={{ from: location }} replace />
  }

  return <>{children}</>
}

export default function App() {
  const { theme, initFromStorage } = useAppStore()
  const navigate = useNavigate()
  const location = useLocation()

  // Initialize app state from storage on mount (only run once)
  useEffect(() => {
    const isConnected = initFromStorage()

    // Redirect to onboarding if not connected and not already there
    if (!isConnected && location.pathname !== '/onboarding') {
      navigate('/onboarding', { replace: true })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Apply theme class to body
  useEffect(() => {
    document.body.classList.remove('light', 'dark')
    document.body.classList.add(theme)
  }, [theme])

  return (
    <Suspense fallback={<LoadingFallback />}>
      <Routes>
        <Route path="/onboarding" element={<Onboarding />} />

        <Route
          path="/*"
          element={
            <RequireConnection>
              <Shell />
            </RequireConnection>
          }
        >
          <Route index element={<Navigate to="/workspace" replace />} />
          <Route path="workspace" element={<Workspace />} />
          <Route path="workspace/:sessionId" element={<Workspace />} />
          <Route path="workspaces" element={<Workspaces />} />
          <Route path="sessions" element={<Sessions />} />
          <Route path="sessions/new" element={<Sessions />} />
          <Route path="credentials" element={<Credentials />} />
          <Route path="settings" element={<Settings />} />
          <Route path="help" element={<Help />} />
        </Route>
      </Routes>
    </Suspense>
  )
}
