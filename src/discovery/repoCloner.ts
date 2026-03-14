import { join, resolve } from 'path';
import { existsSync } from 'fs';
import { randomUUID } from 'crypto';
import { execFile } from 'child_process';
import { promisify } from 'util';
import type { CloneProgress } from '../types/discovery.js';

const execFileAsync = promisify(execFile);

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
  const match = url.match(/\/([^/]+?)(\.git)?$/);
  return match?.[1] ?? 'repository';
}

/**
 * Generate a unique path by appending a UUID suffix
 */
function generateUniquePath(dir: string, baseName: string): string {
  const suffix = randomUUID().slice(0, 8);
  return join(dir, `${baseName}-${suffix}`);
}

/**
 * Clone a repository to the specified directory
 */
export async function cloneRepository(options: CloneOptions): Promise<string> {
  const { remoteUrl, targetDirectory } = options;

  // Extract repo name from URL
  const repoName = extractRepoName(remoteUrl);
  let targetPath = join(resolve(targetDirectory), repoName);

  // Handle existing directory
  if (existsSync(targetPath)) {
    targetPath = generateUniquePath(targetDirectory, repoName);
  }

  // Clone via git CLI (no shell interpolation, safe from injection)
  await execFileAsync('git', ['clone', remoteUrl, targetPath]);

  return targetPath;
}
