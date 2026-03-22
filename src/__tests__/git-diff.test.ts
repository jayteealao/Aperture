import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm, writeFile } from 'fs/promises';
import os from 'os';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import {
  captureRepoBaselineSnapshot,
  computeCompletedTurnDiff,
  disposeRepoBaselineSnapshot,
} from '../git-diff.js';

const execFileAsync = promisify(execFile);

async function git(args: string[], cwd: string): Promise<void> {
  await execFileAsync('git', args, { cwd });
}

describe('git-diff turn summaries', () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })));
    tempDirs.length = 0;
  });

  it('computes net changes relative to a dirty baseline snapshot', async () => {
    const repoDir = await mkdtemp(path.join(os.tmpdir(), 'aperture-git-diff-test-'));
    tempDirs.push(repoDir);

    await git(['init'], repoDir);
    await git(['config', 'user.email', 'test@example.com'], repoDir);
    await git(['config', 'user.name', 'Test User'], repoDir);

    await writeFile(path.join(repoDir, 'file.txt'), 'hello\nworld\n');
    await git(['add', 'file.txt'], repoDir);
    await git(['commit', '-m', 'initial'], repoDir);

    await writeFile(path.join(repoDir, 'file.txt'), 'dirty start\nworld\n');
    const baseline = await captureRepoBaselineSnapshot(repoDir);

    await writeFile(path.join(repoDir, 'file.txt'), 'after turn\nworld\n');
    await writeFile(path.join(repoDir, 'new.txt'), 'brand new\n');

    const result = await computeCompletedTurnDiff(repoDir, baseline);
    await disposeRepoBaselineSnapshot(baseline);

    expect(result).not.toBeNull();
    expect(result?.files.map((file) => file.path)).toEqual(['file.txt', 'new.txt']);
    expect(result?.patchText).toContain('diff --git a/file.txt b/file.txt');
    expect(result?.patchText).toContain('diff --git a/new.txt b/new.txt');
    expect(result?.patchText).not.toContain('hello');
    expect(result?.patchText).toContain('dirty start');
    expect(result?.patchText).toContain('after turn');
  });
});
