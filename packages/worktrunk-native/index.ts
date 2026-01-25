// Generated TypeScript bindings for worktrunk-native

export interface EnsureRepoReadyParams {
  repoRoot: string;
}

export interface EnsureRepoReadyResult {
  isGitRepo: boolean;
  defaultBranch: string | null;
}

export interface EnsureWorktreeParams {
  repoRoot: string;
  branch: string;
  worktreeBaseDir: string;
  pathTemplate?: string;
}

export interface EnsureWorktreeResult {
  branch: string;
  worktreePath: string;
}

export interface WorktreeInfo {
  branch: string;
  path: string;
  isMain: boolean;
  isLocked: boolean;
}

export interface ListWorktreesParams {
  repoRoot: string;
}

export interface RemoveWorktreeParams {
  repoRoot: string;
  branch: string;
}

// Lazy-load native module (avoids top-level await for CJS compatibility)
// @ts-ignore
let nativeBinding: typeof import('./worktrunk-native.node') | null = null;

async function getNativeBinding() {
  if (!nativeBinding) {
    // @ts-ignore
    nativeBinding = await import('./worktrunk-native.node');
  }
  return nativeBinding;
}

/**
 * Ensure a repository is ready and return basic info
 * @throws {Error} If the path is not a git repository
 */
export async function ensureRepoReady(
  params: EnsureRepoReadyParams
): Promise<EnsureRepoReadyResult> {
  const binding = await getNativeBinding();
  return binding.ensureRepoReady(params);
}

/**
 * Ensure a worktree exists for the given branch (idempotent)
 * If the worktree already exists, returns the existing path
 * @throws {Error} If worktree creation fails
 */
export async function ensureWorktree(
  params: EnsureWorktreeParams
): Promise<EnsureWorktreeResult> {
  const binding = await getNativeBinding();
  return binding.ensureWorktree(params);
}

/**
 * List all worktrees in a repository
 * @throws {Error} If the repository cannot be accessed
 */
export async function listWorktrees(
  params: ListWorktreesParams
): Promise<WorktreeInfo[]> {
  const binding = await getNativeBinding();
  return binding.listWorktrees(params);
}

/**
 * Remove a worktree by branch name
 * @throws {Error} If the worktree doesn't exist or cannot be removed
 */
export async function removeWorktree(
  params: RemoveWorktreeParams
): Promise<void> {
  const binding = await getNativeBinding();
  return binding.removeWorktree(params);
}

// Export error class for better error handling
export class WorktreeError extends Error {
  constructor(
    message: string,
    public code?: string,
    public details?: unknown
  ) {
    super(message);
    this.name = 'WorktreeError';
  }
}
