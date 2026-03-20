import { Suspense, lazy, useEffect } from 'react'
import { Agentation } from 'agentation'
import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router'
import { useAppStore } from './stores/app'
import { Shell } from './components/layout/Shell'
import { Spinner } from './components/ui/Spinner'
import { getSingletonHighlighter } from './lib/shiki.bundle'

// Lazy load pages for code splitting
const Onboarding = lazy(() => import('./pages/Onboarding'))
const Workspaces = lazy(() => import('./pages/Workspaces'))
const WorkspaceView = lazy(() => import('./pages/WorkspaceView'))
const Credentials = lazy(() => import('./pages/Credentials'))
const Settings = lazy(() => import('./pages/Settings'))
const Help = lazy(() => import('./pages/Help'))

function LoadingFallback() {
  return (
    <div className="flex items-center justify-center min-h-screen bg-gradient-mesh">
      <div className="glass-card p-8 text-center animate-in">
        <Spinner size="lg" />
        <p className="mt-4 text-sm text-muted-foreground">Loading...</p>
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

// Redirect legacy /workspace and /workspace/:sessionId to workspace-scoped
// view. Reads activeWorkspaceId so users land back on their last workspace.
function WorkspaceRedirect() {
  const activeWorkspaceId = useAppStore((s) => s.activeWorkspaceId)
  if (activeWorkspaceId) {
    return <Navigate to={`/workspaces/${activeWorkspaceId}`} replace />
  }
  return <Navigate to="/workspaces" replace />
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

    // Pre-warm the Shiki singleton so the highlighter engine is ready before
    // the user sees their first code block, preventing FOUC / shimmer flash.
    void getSingletonHighlighter({ langs: [], themes: [] })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Apply theme class to body
  useEffect(() => {
    document.body.classList.remove('light', 'dark')
    document.body.classList.add(theme)
  }, [theme])

  return (
    <>
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
            {/* Canonical routes */}
            <Route index element={<Navigate to="/workspaces" replace />} />
            <Route path="workspaces" element={<Workspaces />} />
            <Route path="workspaces/:id" element={<WorkspaceView />} />
            <Route path="credentials" element={<Credentials />} />
            <Route path="settings" element={<Settings />} />
            <Route path="help" element={<Help />} />

            {/* Legacy redirects — kept so old bookmarks / history entries still work */}
            <Route path="workspace" element={<WorkspaceRedirect />} />
            <Route path="workspace/:sessionId" element={<WorkspaceRedirect />} />
            <Route path="sessions" element={<Navigate to="/workspaces" replace />} />
            <Route path="sessions/new" element={<Navigate to="/workspaces" replace />} />
          </Route>
        </Routes>
      </Suspense>
      {import.meta.env.DEV && <Agentation />}
    </>
  )
}
