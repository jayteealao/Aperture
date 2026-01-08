/**
 * Workspace types for git worktree management
 */

export interface WorktreeManagerInterface {
  ensureRepoReady(repoRoot: string): Promise<{ defaultBranch: string | null; remoteUrl: string | null }>;
  ensureWorktree(params: {
    repoRoot: string;
    branch: string;
    worktreeBaseDir: string;
    pathTemplate?: string;
  }): Promise<{ branch: string; worktreePath: string }>;
  listWorktrees(repoRoot: string): Promise<
    Array<{
      branch: string;
      path: string;
      isMain: boolean;
      isLocked: boolean;
    }>
  >;
  removeWorktree(repoRoot: string, branch: string): Promise<void>;
}

export interface WorkspaceConfig {
  id: string;
  repoRoot: string;
  worktreeBaseDir: string;
}
