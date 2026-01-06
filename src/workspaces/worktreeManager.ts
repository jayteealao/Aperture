import type { WorktreeManagerInterface } from './types.js';

/**
 * WorktreeManager implementation using the native addon
 */
export class WorktreeManagerNative implements WorktreeManagerInterface {
  private nativeModule: any;

  constructor() {
    // Lazy-load the native module to avoid issues if it's not built
    this.nativeModule = null;
  }

  private async ensureNativeModule() {
    if (!this.nativeModule) {
      try {
        // Try to load the native module
        const nativePath = new URL('../../../packages/worktrunk-native/index.ts', import.meta.url).pathname;
        this.nativeModule = await import(nativePath);
      } catch (error) {
        throw new Error(
          `Failed to load worktrunk-native addon. Make sure it's built: pnpm -C packages/worktrunk-native build\nError: ${error}`
        );
      }
    }
    return this.nativeModule;
  }

  async ensureRepoReady(repoRoot: string): Promise<{ defaultBranch: string | null }> {
    const native = await this.ensureNativeModule();
    const result = await native.ensureRepoReady({ repoRoot });
    if (!result.isGitRepo) {
      throw new Error(`Not a git repository: ${repoRoot}`);
    }
    return { defaultBranch: result.defaultBranch };
  }

  async ensureWorktree(params: {
    repoRoot: string;
    branch: string;
    worktreeBaseDir: string;
    pathTemplate?: string;
  }): Promise<{ branch: string; worktreePath: string }> {
    const native = await this.ensureNativeModule();
    return await native.ensureWorktree(params);
  }

  async listWorktrees(
    repoRoot: string
  ): Promise<
    Array<{
      branch: string;
      path: string;
      isMain: boolean;
      isLocked: boolean;
    }>
  > {
    const native = await this.ensureNativeModule();
    return await native.listWorktrees({ repoRoot });
  }

  async removeWorktree(repoRoot: string, branch: string): Promise<void> {
    const native = await this.ensureNativeModule();
    await native.removeWorktree({ repoRoot, branch });
  }
}

/**
 * Stub implementation for when the native addon is not available
 */
export class WorktreeManagerStub implements WorktreeManagerInterface {
  async ensureRepoReady(_repoRoot: string): Promise<{ defaultBranch: string | null }> {
    console.warn('[WorktreeManagerStub] ensureRepoReady called - native addon not available');
    return { defaultBranch: null };
  }

  async ensureWorktree(_params: {
    repoRoot: string;
    branch: string;
    worktreeBaseDir: string;
    pathTemplate?: string;
  }): Promise<{ branch: string; worktreePath: string }> {
    throw new Error('WorktreeManager native addon not available');
  }

  async listWorktrees(
    _repoRoot: string
  ): Promise<
    Array<{
      branch: string;
      path: string;
      isMain: boolean;
      isLocked: boolean;
    }>
  > {
    return [];
  }

  async removeWorktree(_repoRoot: string, _branch: string): Promise<void> {
    console.warn('[WorktreeManagerStub] removeWorktree called - native addon not available');
  }
}

/**
 * Create a WorktreeManager instance
 * Falls back to stub if native addon is not available
 */
export function createWorktreeManager(): WorktreeManagerInterface {
  try {
    return new WorktreeManagerNative();
  } catch (error) {
    console.warn('[createWorktreeManager] Native addon not available, using stub:', error);
    return new WorktreeManagerStub();
  }
}
