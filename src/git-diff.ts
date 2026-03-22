import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from 'fs/promises';
import os from 'os';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

export interface TurnDiffFileSummary {
  path: string;
  additions: number;
  deletions: number;
}

export interface RepoBaselineSnapshotFile {
  path: string;
  existed: boolean;
  snapshotPath?: string;
}

export interface RepoBaselineSnapshot {
  repoRoot: string;
  headSha: string | null;
  files: RepoBaselineSnapshotFile[];
  capturedAt: number;
  snapshotRoot: string;
}

export interface CompletedTurnDiff {
  patchText: string;
  files: TurnDiffFileSummary[];
  additions: number;
  deletions: number;
  headSha: string | null;
}

interface GitStatusEntry {
  path: string;
  originalPath?: string;
}

async function execGit(args: string[], cwd: string): Promise<{ stdout: string; stderr: string }> {
  return execFileAsync('git', args, { cwd, encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 });
}

async function execGitBuffer(args: string[], cwd: string): Promise<Buffer> {
  const result = await execFileAsync('git', args, { cwd, encoding: 'buffer', maxBuffer: 20 * 1024 * 1024 });
  return result.stdout as Buffer;
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

async function getRepoRoot(cwd: string): Promise<string | null> {
  try {
    const { stdout } = await execGit(['rev-parse', '--show-toplevel'], cwd);
    return stdout.trim() || null;
  } catch {
    return null;
  }
}

async function getHeadSha(repoRoot: string): Promise<string | null> {
  try {
    const { stdout } = await execGit(['rev-parse', 'HEAD'], repoRoot);
    return stdout.trim() || null;
  } catch {
    return null;
  }
}

function parseStatusPorcelain(stdout: Buffer): GitStatusEntry[] {
  const tokens = stdout.toString('utf8').split('\0').filter(Boolean);
  const entries: GitStatusEntry[] = [];

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token.length < 4) {
      continue;
    }

    const statusX = token[0];
    const statusY = token[1];
    const filePath = token.slice(3);

    if (statusX === 'R' || statusX === 'C' || statusY === 'R' || statusY === 'C') {
      const renamedTo = tokens[index + 1];
      entries.push({ path: renamedTo || filePath, originalPath: filePath });
      index += 1;
      continue;
    }

    entries.push({ path: filePath });
  }

  return entries;
}

async function listDirtyFiles(repoRoot: string): Promise<GitStatusEntry[]> {
  try {
    const stdout = await execGitBuffer(['status', '--porcelain=v1', '-z', '--untracked-files=all'], repoRoot);
    return parseStatusPorcelain(stdout);
  } catch {
    return [];
  }
}

async function ensureParentDir(filePath: string): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
}

async function createEmptyFile(filePath: string): Promise<void> {
  await ensureParentDir(filePath);
  await writeFile(filePath, '');
}

async function tryReadHeadFile(repoRoot: string, headSha: string, relativePath: string): Promise<Buffer | null> {
  try {
    return await execGitBuffer(['show', `${headSha}:${relativePath}`], repoRoot);
  } catch {
    return null;
  }
}

async function countPatchStats(patchText: string): Promise<{ files: TurnDiffFileSummary[]; additions: number; deletions: number }> {
  const files: TurnDiffFileSummary[] = [];
  let current: TurnDiffFileSummary | null = null;
  let additions = 0;
  let deletions = 0;

  for (const line of patchText.split('\n')) {
    if (line.startsWith('diff --git ')) {
      if (current) {
        files.push(current);
      }
      const match = line.match(/^diff --git a\/(.+?) b\/(.+)$/);
      const filePath = match?.[2] || match?.[1];
      current = filePath ? { path: filePath, additions: 0, deletions: 0 } : null;
      continue;
    }

    if (!current) {
      continue;
    }

    if (line.startsWith('+++ ') || line.startsWith('--- ') || line.startsWith('@@')) {
      continue;
    }

    if (line.startsWith('+')) {
      current.additions += 1;
      additions += 1;
      continue;
    }

    if (line.startsWith('-')) {
      current.deletions += 1;
      deletions += 1;
    }
  }

  if (current) {
    files.push(current);
  }

  files.sort((left, right) => left.path.localeCompare(right.path));
  return { files, additions, deletions };
}

function appendPatch(patches: string[], patchText: string): void {
  const trimmed = patchText.replace(/\r\n/g, '\n').trim();
  if (!trimmed) {
    return;
  }
  patches.push(trimmed);
}

async function buildFilePatch(
  repoRoot: string,
  relativePath: string,
  beforeContent: Buffer | null,
  afterContent: Buffer | null
): Promise<string> {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'aperture-turn-diff-'));
  const beforePath = path.join(tempRoot, '__before__', relativePath);
  const afterPath = path.join(tempRoot, '__after__', relativePath);

  try {
    if (beforeContent !== null) {
      await ensureParentDir(beforePath);
      await writeFile(beforePath, beforeContent);
    } else {
      await createEmptyFile(beforePath);
    }

    if (afterContent !== null) {
      await ensureParentDir(afterPath);
      await writeFile(afterPath, afterContent);
    } else {
      await createEmptyFile(afterPath);
    }

    const args = [
      'diff',
      '--no-index',
      '--no-ext-diff',
      '--binary',
      '--src-prefix=a/',
      '--dst-prefix=b/',
      beforePath,
      afterPath,
    ];

    try {
      const { stdout } = await execGit(args, repoRoot);
      return rewritePatchPaths(stdout, relativePath, beforeContent === null, afterContent === null);
    } catch (error) {
      const stdout = (error as { stdout?: string }).stdout;
      if (typeof stdout === 'string') {
        return rewritePatchPaths(stdout, relativePath, beforeContent === null, afterContent === null);
      }
      throw error;
    }
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
}

function rewritePatchPaths(patchText: string, relativePath: string, beforeMissing: boolean, afterMissing: boolean): string {
  const normalized = relativePath.replace(/\\/g, '/');
  return patchText
    .replace(/^diff --git .+$/m, `diff --git a/${normalized} b/${normalized}`)
    .replace(/^--- .+$/m, beforeMissing ? '--- /dev/null' : `--- a/${normalized}`)
    .replace(/^\+\+\+ .+$/m, afterMissing ? '+++ /dev/null' : `+++ b/${normalized}`);
}

export async function captureRepoBaselineSnapshot(cwd: string): Promise<RepoBaselineSnapshot | null> {
  const repoRoot = await getRepoRoot(cwd);
  if (!repoRoot) {
    return null;
  }

  const headSha = await getHeadSha(repoRoot);
  const dirtyEntries = await listDirtyFiles(repoRoot);
  const snapshotRoot = await mkdtemp(path.join(os.tmpdir(), 'aperture-turn-baseline-'));
  const files: RepoBaselineSnapshotFile[] = [];

  for (const entry of dirtyEntries) {
    const absolutePath = path.join(repoRoot, entry.path);
    const snapshotPath = path.join(snapshotRoot, entry.path);
    const exists = await pathExists(absolutePath);

    if (exists) {
      await ensureParentDir(snapshotPath);
      const content = await readFile(absolutePath);
      await writeFile(snapshotPath, content);
      files.push({ path: entry.path.replace(/\\/g, '/'), existed: true, snapshotPath });
    } else {
      files.push({ path: entry.path.replace(/\\/g, '/'), existed: false });
    }
  }

  return {
    repoRoot,
    headSha,
    files,
    capturedAt: Date.now(),
    snapshotRoot,
  };
}

export async function computeCompletedTurnDiff(
  cwd: string,
  baseline: RepoBaselineSnapshot | null
): Promise<CompletedTurnDiff | null> {
  const repoRoot = await getRepoRoot(cwd);
  if (!repoRoot) {
    return null;
  }

  const effectiveBaseline = baseline && path.resolve(baseline.repoRoot) === path.resolve(repoRoot)
    ? baseline
    : await captureRepoBaselineSnapshot(cwd);

  if (!effectiveBaseline) {
    return null;
  }

  const currentHeadSha = await getHeadSha(repoRoot);
  const dirtyEntries = await listDirtyFiles(repoRoot);
  const candidatePaths = new Set<string>();

  for (const file of effectiveBaseline.files) {
    candidatePaths.add(file.path);
  }
  for (const entry of dirtyEntries) {
    candidatePaths.add(entry.path.replace(/\\/g, '/'));
  }

  const baselineFiles = new Map(effectiveBaseline.files.map((file) => [file.path, file]));
  const patches: string[] = [];

  for (const relativePath of candidatePaths) {
    const baselineFile = baselineFiles.get(relativePath);
    let beforeContent: Buffer | null = null;
    if (baselineFile) {
      if (baselineFile.existed && baselineFile.snapshotPath) {
        beforeContent = await readFile(baselineFile.snapshotPath);
      }
    } else if (effectiveBaseline.headSha) {
      beforeContent = await tryReadHeadFile(repoRoot, effectiveBaseline.headSha, relativePath);
    }

    const currentAbsolutePath = path.join(repoRoot, relativePath);
    const afterContent = await pathExists(currentAbsolutePath)
      ? await readFile(currentAbsolutePath)
      : null;

    const beforeExists = beforeContent !== null;
    const afterExists = afterContent !== null;
    const identical = beforeExists === afterExists &&
      (!beforeExists || Buffer.compare(beforeContent!, afterContent!) === 0);

    if (identical) {
      continue;
    }

    const patch = await buildFilePatch(repoRoot, relativePath, beforeContent, afterContent);
    appendPatch(patches, patch);
  }

  const patchText = patches.join('\n\n');
  const stats = await countPatchStats(patchText);
  return {
    patchText,
    files: stats.files,
    additions: stats.additions,
    deletions: stats.deletions,
    headSha: currentHeadSha,
  };
}

export async function disposeRepoBaselineSnapshot(snapshot: RepoBaselineSnapshot | null): Promise<void> {
  if (!snapshot) {
    return;
  }
  await rm(snapshot.snapshotRoot, { recursive: true, force: true });
}
