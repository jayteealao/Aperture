import { readdir, access } from 'fs/promises';
import { join, basename, resolve } from 'path';
import type { DiscoveredRepo, DiscoveryResult } from '../types/discovery.js';
import { createWorktreeManager } from '../workspaces/worktreeManager.js';

const EXCLUDED_DIRS = ['node_modules', 'vendor', '.cache', 'target', 'dist', '.git'];
const MAX_DEPTH = 3;
const MAX_REPOS = 500; // Memory safety limit

/**
 * Discover git repositories in the given root path
 */
export async function discoverRepositories(
  rootPath: string,
  abortSignal?: AbortSignal
): Promise<DiscoveryResult> {
  const repos: DiscoveredRepo[] = [];
  const errors: Array<{ path: string; error: string }> = [];
  let scannedCount = 0;

  // Normalize and validate path (Windows-safe)
  const normalizedRoot = resolve(rootPath);

  const queue: Array<{ path: string; depth: number }> = [
    { path: normalizedRoot, depth: 0 }
  ];

  const worktreeManager = createWorktreeManager();

  while (queue.length > 0 && repos.length < MAX_REPOS) {
    if (abortSignal?.aborted) break;

    const { path: currentPath, depth } = queue.shift()!;
    scannedCount++;

    if (depth > MAX_DEPTH) continue;

    try {
      // Fast check: skip expensive ensureRepoReady if no .git directory
      const gitDir = join(currentPath, '.git');
      let hasGitDir = false;
      try {
        await access(gitDir);
        hasGitDir = true;
      } catch {
        // Not a git repo, continue to scan subdirectories
      }

      if (hasGitDir) {
        // Only call ensureRepoReady for full validation if .git exists
        const repoInfo = await worktreeManager.ensureRepoReady(currentPath)
          .then(result => ({
            isGitRepo: true,
            remoteUrl: result.remoteUrl,
          }))
          .catch(() => ({ isGitRepo: false, remoteUrl: null }));

        if (repoInfo.isGitRepo) {
          repos.push({
            path: currentPath,
            name: basename(currentPath),
            remoteUrl: repoInfo.remoteUrl ?? undefined,
            hasOrigin: !!repoInfo.remoteUrl,
          });
          continue; // Don't descend into repos
        }
      }

      // List subdirectories
      const entries = await readdir(currentPath, { withFileTypes: true });

      for (const entry of entries) {
        if (!entry.isDirectory() || entry.isSymbolicLink()) continue;
        if (entry.name.startsWith('.')) continue;
        if (EXCLUDED_DIRS.includes(entry.name)) continue;

        queue.push({
          path: join(currentPath, entry.name),
          depth: depth + 1
        });
      }
    } catch (err) {
      errors.push({
        path: currentPath,
        error: err instanceof Error ? err.message : 'Unknown error'
      });
    }
  }

  return { repos, scannedDirectories: scannedCount, errors };
}
