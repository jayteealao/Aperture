import { join, resolve } from 'path';
import { existsSync } from 'fs';
import type { CloneProgress } from '../types/discovery.js';

/**
 * Type definition for the native clone function
 */
interface NativeCloneModule {
  cloneRepository(
    url: string,
    targetPath: string,
    progressCallback: (progress: { phase: string; current: number; total: number; percent: number }) => void
  ): string;
}

export interface CloneOptions {
  remoteUrl: string;
  targetDirectory: string;
  onProgress?: (progress: CloneProgress) => void;
}

/**
 * Extract repository name from a git URL
 */
function extractRepoName(url: string): string {
  // Handle various URL formats:
  // https://github.com/user/repo.git
  // git@github.com:user/repo.git
  // ssh://git@github.com/user/repo.git
  const match = url.match(/\/([^\/]+?)(\.git)?$/);
  return match?.[1] ?? 'repository';
}

/**
 * Find an available path by appending -1, -2, etc.
 */
function findAvailablePath(dir: string, baseName: string): string {
  let counter = 1;
  let candidate = join(dir, `${baseName}-${counter}`);
  while (existsSync(candidate)) {
    counter++;
    candidate = join(dir, `${baseName}-${counter}`);
  }
  return candidate;
}

/**
 * Clone a repository to the specified directory
 */
export async function cloneRepository(options: CloneOptions): Promise<string> {
  const { remoteUrl, targetDirectory, onProgress } = options;

  // Lazy load the native module
  let nativeModule: NativeCloneModule;
  try {
    const nativePath = new URL('../../packages/worktrunk-native/index.js', import.meta.url).pathname;
    nativeModule = await import(nativePath) as NativeCloneModule;
  } catch (error) {
    throw new Error(
      `Failed to load worktrunk-native addon. Make sure it's built: pnpm -C packages/worktrunk-native build\nError: ${error}`
    );
  }

  // Extract repo name from URL
  const repoName = extractRepoName(remoteUrl);
  let targetPath = join(resolve(targetDirectory), repoName);

  // Handle existing directory
  if (existsSync(targetPath)) {
    targetPath = findAvailablePath(targetDirectory, repoName);
  }

  // Execute clone with progress callback
  const progressCallback = onProgress
    ? (progress: { phase: string; current: number; total: number; percent: number }) => {
        onProgress({
          phase: progress.phase as CloneProgress['phase'],
          current: progress.current,
          total: progress.total,
          percent: progress.percent,
        });
      }
    : () => {};

  const resultPath = nativeModule.cloneRepository(remoteUrl, targetPath, progressCallback);

  return resultPath;
}
