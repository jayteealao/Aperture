import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { tmpdir } from 'os';
import { mkdtemp, rm } from 'fs/promises';
import { join } from 'path';
import { execSync } from 'child_process';
import {
  ensureRepoReady,
  ensureWorktree,
  listWorktrees,
  removeWorktree,
} from '../index';

describe('Worktrunk Native Addon - Integration Tests', () => {
  let tempDir: string;
  let repoRoot: string;

  beforeEach(async () => {
    // Create temp directory
    tempDir = await mkdtemp(join(tmpdir(), 'worktrunk-test-'));
    repoRoot = join(tempDir, 'repo');

    // Initialize git repo
    execSync(`git init "${repoRoot}"`, { stdio: 'pipe' });
    execSync(`git config user.email "test@example.com"`, {
      cwd: repoRoot,
      stdio: 'pipe',
    });
    execSync(`git config user.name "Test User"`, {
      cwd: repoRoot,
      stdio: 'pipe',
    });
    // Disable commit signing for tests
    execSync(`git config commit.gpgsign false`, {
      cwd: repoRoot,
      stdio: 'pipe',
    });

    // Create initial commit
    execSync(`echo "# Test Repo" > README.md`, {
      cwd: repoRoot,
      stdio: 'pipe',
      shell: '/bin/bash',
    });
    execSync(`git add README.md`, { cwd: repoRoot, stdio: 'pipe' });
    execSync(`git commit -m "Initial commit"`, {
      cwd: repoRoot,
      stdio: 'pipe',
    });
  });

  afterEach(async () => {
    if (tempDir) {
      try {
        await rm(tempDir, { recursive: true, force: true });
      } catch (e) {
        console.warn('Failed to clean up temp dir:', e);
      }
    }
  });

  describe('ensureRepoReady', () => {
    it('should validate a git repository', async () => {
      const result = await ensureRepoReady({ repoRoot });

      expect(result.isGitRepo).toBe(true);
      expect(result.defaultBranch).toBeTruthy();
      expect(['main', 'master']).toContain(result.defaultBranch);
    });

    it('should fail on non-git directory', async () => {
      const nonGitDir = join(tempDir, 'not-a-repo');
      await expect(ensureRepoReady({ repoRoot: nonGitDir })).rejects.toThrow();
    });
  });

  describe('ensureWorktree', () => {
    it('should create a new worktree', async () => {
      const result = await ensureWorktree({
        repoRoot,
        branch: 'agent/alice',
        worktreeBaseDir: join(repoRoot, '.worktrees'),
      });

      expect(result.branch).toBe('agent/alice');
      expect(result.worktreePath).toContain('agent/alice');
      expect(result.worktreePath).toContain('.worktrees');
    });

    it('should be idempotent (create same worktree twice)', async () => {
      const result1 = await ensureWorktree({
        repoRoot,
        branch: 'agent/alice',
        worktreeBaseDir: join(repoRoot, '.worktrees'),
      });

      const result2 = await ensureWorktree({
        repoRoot,
        branch: 'agent/alice',
        worktreeBaseDir: join(repoRoot, '.worktrees'),
      });

      expect(result2.worktreePath).toBe(result1.worktreePath);
      expect(result2.branch).toBe(result1.branch);
    });

    it('should create distinct worktrees for different branches', async () => {
      const alice = await ensureWorktree({
        repoRoot,
        branch: 'agent/alice',
        worktreeBaseDir: join(repoRoot, '.worktrees'),
      });

      const bob = await ensureWorktree({
        repoRoot,
        branch: 'agent/bob',
        worktreeBaseDir: join(repoRoot, '.worktrees'),
      });

      expect(alice.worktreePath).not.toBe(bob.worktreePath);
      expect(alice.branch).toBe('agent/alice');
      expect(bob.branch).toBe('agent/bob');
    });

    it('should support custom path templates', async () => {
      const result = await ensureWorktree({
        repoRoot,
        branch: 'feature/test',
        worktreeBaseDir: join(repoRoot, '.worktrees'),
        pathTemplate: '{repoRoot}/.wt/{branch}',
      });

      expect(result.worktreePath).toContain('.wt/feature/test');
    });
  });

  describe('listWorktrees', () => {
    it('should list main worktree', async () => {
      const worktrees = await listWorktrees({ repoRoot });

      expect(worktrees.length).toBeGreaterThanOrEqual(1);

      const mainWorktree = worktrees.find((w) => w.isMain);
      expect(mainWorktree).toBeDefined();
      expect(mainWorktree?.path).toBe(repoRoot);
    });

    it('should list all worktrees including created ones', async () => {
      await ensureWorktree({
        repoRoot,
        branch: 'agent/alice',
        worktreeBaseDir: join(repoRoot, '.worktrees'),
      });

      await ensureWorktree({
        repoRoot,
        branch: 'agent/bob',
        worktreeBaseDir: join(repoRoot, '.worktrees'),
      });

      const worktrees = await listWorktrees({ repoRoot });

      expect(worktrees.length).toBeGreaterThanOrEqual(3); // main + alice + bob

      const aliceWorktree = worktrees.find((w) => w.branch === 'agent/alice');
      expect(aliceWorktree).toBeDefined();
      expect(aliceWorktree?.isMain).toBe(false);

      const bobWorktree = worktrees.find((w) => w.branch === 'agent/bob');
      expect(bobWorktree).toBeDefined();
      expect(bobWorktree?.isMain).toBe(false);
    });
  });

  describe('removeWorktree', () => {
    it('should remove a worktree', async () => {
      await ensureWorktree({
        repoRoot,
        branch: 'agent/alice',
        worktreeBaseDir: join(repoRoot, '.worktrees'),
      });

      let worktrees = await listWorktrees({ repoRoot });
      const initialCount = worktrees.length;
      expect(worktrees.some((w) => w.branch === 'agent/alice')).toBe(true);

      await removeWorktree({ repoRoot, branch: 'agent/alice' });

      worktrees = await listWorktrees({ repoRoot });
      expect(worktrees.length).toBe(initialCount - 1);
      expect(worktrees.some((w) => w.branch === 'agent/alice')).toBe(false);
    });

    it('should fail when removing non-existent worktree', async () => {
      await expect(
        removeWorktree({ repoRoot, branch: 'non-existent' })
      ).rejects.toThrow();
    });
  });

  describe('End-to-End Workflow', () => {
    it('should support full create-list-remove workflow', async () => {
      // Create multiple worktrees
      const branches = ['agent/1', 'agent/2', 'agent/3'];
      for (const branch of branches) {
        await ensureWorktree({
          repoRoot,
          branch,
          worktreeBaseDir: join(repoRoot, '.worktrees'),
        });
      }

      // List all
      let worktrees = await listWorktrees({ repoRoot });
      expect(worktrees.length).toBeGreaterThanOrEqual(4); // main + 3 agents

      // Remove one
      await removeWorktree({ repoRoot, branch: 'agent/2' });

      worktrees = await listWorktrees({ repoRoot });
      expect(worktrees.some((w) => w.branch === 'agent/1')).toBe(true);
      expect(worktrees.some((w) => w.branch === 'agent/2')).toBe(false);
      expect(worktrees.some((w) => w.branch === 'agent/3')).toBe(true);
    });
  });
});
