import { useEffect } from 'react'
import { useAppStore } from '@/stores/app'

/**
 * Returns the shared workspace list from the Zustand store.
 * Triggers a fetch on mount if the store is empty.
 * All consumers share the same data — mutations that call
 * `useAppStore.getState().fetchWorkspaces()` update every subscriber.
 */
export function useWorkspaces() {
  const workspaces = useAppStore((s) => s.workspaces)
  const loading = useAppStore((s) => s.workspacesLoading)
  const fetchWorkspaces = useAppStore((s) => s.fetchWorkspaces)

  useEffect(() => {
    if (workspaces.length === 0) {
      fetchWorkspaces()
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return { workspaces, loading }
}
