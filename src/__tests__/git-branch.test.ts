import { describe, expect, it } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { getCurrentBranch } from '../git-diff.js'

const exec = promisify(execFile)

async function makeTempDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'aperture-git-branch-'))
}

async function initGitRepo(dir: string): Promise<void> {
  await exec('git', ['init'], { cwd: dir })
  await exec('git', ['config', 'user.email', 'test@test.com'], { cwd: dir })
  await exec('git', ['config', 'user.name', 'Test'], { cwd: dir })
}

async function makeCommit(dir: string): Promise<string> {
  const { stdout } = await exec('git', ['commit', '--allow-empty', '-m', 'init'], { cwd: dir })
  return stdout.trim()
}

describe('getCurrentBranch', () => {
  it('returns branch name on a normal checkout', async () => {
    const dir = await makeTempDir()
    try {
      await initGitRepo(dir)
      await makeCommit(dir)
      const branch = await getCurrentBranch(dir)
      // git init creates either 'main' or 'master' depending on config
      expect(branch).toMatch(/^(main|master)$/)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('returns short SHA on detached HEAD', async () => {
    const dir = await makeTempDir()
    try {
      await initGitRepo(dir)
      await makeCommit(dir)
      // Get the commit SHA
      const { stdout: sha } = await exec('git', ['rev-parse', 'HEAD'], { cwd: dir })
      // Checkout detached
      await exec('git', ['checkout', 'HEAD', '--detach'], { cwd: dir })
      const branch = await getCurrentBranch(dir)
      expect(branch).toBe(sha.trim().slice(0, 7))
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('returns null for a non-git directory', async () => {
    const dir = await makeTempDir()
    try {
      const branch = await getCurrentBranch(dir)
      expect(branch).toBeNull()
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('returns null for an empty repo with no commits', async () => {
    const dir = await makeTempDir()
    try {
      await initGitRepo(dir)
      const branch = await getCurrentBranch(dir)
      expect(branch).toBeNull()
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('returns branch names with slashes and hyphens', async () => {
    const dir = await makeTempDir()
    try {
      await initGitRepo(dir)
      await makeCommit(dir)
      await exec('git', ['checkout', '-b', 'feature/some-thing'], { cwd: dir })
      const branch = await getCurrentBranch(dir)
      expect(branch).toBe('feature/some-thing')
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  // GB-3: Unicode branch names
  it('returns branch names with unicode characters', async () => {
    const dir = await makeTempDir()
    try {
      await initGitRepo(dir)
      await makeCommit(dir)
      await exec('git', ['checkout', '-b', 'feature/über-alles'], { cwd: dir })
      const branch = await getCurrentBranch(dir)
      expect(branch).toBe('feature/über-alles')
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  // GB-4: Branch name output sanitization (newlines)
  it('returns clean branch name without embedded whitespace', async () => {
    const dir = await makeTempDir()
    try {
      await initGitRepo(dir)
      await makeCommit(dir)
      await exec('git', ['checkout', '-b', 'release/v1.0.0'], { cwd: dir })
      const branch = await getCurrentBranch(dir)
      expect(branch).toBe('release/v1.0.0')
      expect(branch).not.toMatch(/\s/)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  // GB-5: Very long branch names
  it('handles very long branch names', async () => {
    const dir = await makeTempDir()
    try {
      await initGitRepo(dir)
      await makeCommit(dir)
      const longName = 'feature/' + 'a'.repeat(100)
      await exec('git', ['checkout', '-b', longName], { cwd: dir })
      const branch = await getCurrentBranch(dir)
      expect(branch).toBe(longName)
      expect(branch!.length).toBeGreaterThan(100)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})
