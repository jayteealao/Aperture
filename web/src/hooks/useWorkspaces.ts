import { useState, useEffect } from 'react'
import { api } from '@/api/client'
import type { WorkspaceRecord } from '@/api/types'

/**
 * Fetches the workspace list once on mount.
 * Both SidebarRail and WorkspacePanel consume this hook independently;
 * a shared store would be the next step if workspace mutations need to
 * propagate in real-time across components.
 */
export function useWorkspaces() {
  const [workspaces, setWorkspaces] = useState<WorkspaceRecord[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    api
      .listWorkspaces()
      .then(({ workspaces: ws }) => {
        if (!cancelled) setWorkspaces(ws)
      })
      .catch(() => {
        // Gateway may not yet be reachable on first render — fail silently
        // and leave workspaces as [] so the rail renders without crashing.
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [])

  return { workspaces, loading }
}
