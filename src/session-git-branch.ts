import { getCurrentBranch } from './git-diff.js'

/**
 * Per-session git branch tracker with concurrency guard.
 * Extracts the shared emitGitBranchUpdate logic from SdkSession and PiSession.
 */
export class GitBranchTracker {
  private _lastBranch: string | null = null
  private _inFlight = false

  get current(): string | null {
    return this._lastBranch
  }

  async refresh(
    workingDir: string | undefined,
    emitUpdate: (type: string, data: Record<string, unknown>) => void,
  ): Promise<void> {
    if (!workingDir || this._inFlight) return
    this._inFlight = true
    try {
      const gitBranch = await getCurrentBranch(workingDir)
      const normalized = gitBranch ?? null
      if (normalized === this._lastBranch) return
      this._lastBranch = normalized
      emitUpdate('git_branch', { gitBranch: normalized })
    } catch {
      // Non-critical — branch info is best-effort
    } finally {
      this._inFlight = false
    }
  }
}
