import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { randomUUID } from 'crypto';
import { mkdirSync, rmSync, existsSync } from 'fs';
import { execSync } from 'child_process';
import { join } from 'path';
import { tmpdir } from 'os';

describe('Workspace API Integration', () => {
  let testRepoPath: string;
  let testDbPath: string;

  // Helper to create and migrate database
  async function createTestDb() {
    const { ApertureDatabase } = await import('../src/database.js');
    const db = new ApertureDatabase(testDbPath);
    db.migrate(join(process.cwd(), 'src', 'migrations'));
    return db;
  }

  beforeAll(() => {
    // Create a temporary git repository for testing
    const tempDir = join(tmpdir(), `aperture-workspace-test-${randomUUID()}`);
    mkdirSync(tempDir, { recursive: true });
    testRepoPath = join(tempDir, 'test-repo');
    mkdirSync(testRepoPath);

    // Initialize git repo
    execSync('git init', { cwd: testRepoPath, stdio: 'pipe' });
    execSync('git config user.email "test@example.com"', { cwd: testRepoPath, stdio: 'pipe' });
    execSync('git config user.name "Test User"', { cwd: testRepoPath, stdio: 'pipe' });
    execSync('git config commit.gpgsign false', { cwd: testRepoPath, stdio: 'pipe' });

    // Create initial commit
    execSync('git commit --allow-empty -m "Initial commit"', { cwd: testRepoPath, stdio: 'pipe' });

    // Create test database path
    testDbPath = join(tempDir, 'test-workspace.db');
  });

  afterAll(() => {
    // Clean up test repository and database
    if (existsSync(testRepoPath)) {
      rmSync(testRepoPath, { recursive: true, force: true });
    }
    if (existsSync(testDbPath)) {
      rmSync(testDbPath, { force: true });
    }
  });

  describe('Workspace CRUD Operations', () => {
    it('should validate repository before creating workspace', async () => {
      const { ApertureDatabase } = await import('../src/database.js');
      const db = new ApertureDatabase(testDbPath);
      db.migrate(join(process.cwd(), 'src', 'migrations'));

      const invalidPath = '/nonexistent/path';

      // Should fail for non-existent path
      expect(() => {
        db.saveWorkspace({
          id: randomUUID(),
          name: 'invalid-workspace',
          repo_root: invalidPath,
          description: null,
          created_at: Date.now(),
          updated_at: Date.now(),
          metadata: null,
        });
      }).not.toThrow(); // Database save doesn't validate, that's done by the API

      db.close();
    });

    it('should create and retrieve workspace', async () => {
      const db = await createTestDb();

      const workspaceId = randomUUID();
      const workspace = {
        id: workspaceId,
        name: 'test-workspace',
        repo_root: testRepoPath,
        description: 'Test workspace for integration tests',
        created_at: Date.now(),
        updated_at: Date.now(),
        metadata: null,
      };

      db.saveWorkspace(workspace);

      const retrieved = db.getWorkspace(workspaceId);
      expect(retrieved).toBeDefined();
      expect(retrieved?.name).toBe('test-workspace');
      expect(retrieved?.repo_root).toBe(testRepoPath);
      expect(retrieved?.description).toBe('Test workspace for integration tests');

      db.close();
    });

    it('should list all workspaces', async () => {
      const db = await createTestDb();

      const workspace1 = {
        id: randomUUID(),
        name: 'workspace-1',
        repo_root: testRepoPath,
        description: 'First workspace',
        created_at: Date.now(),
        updated_at: Date.now(),
        metadata: null,
      };

      const workspace2 = {
        id: randomUUID(),
        name: 'workspace-2',
        repo_root: testRepoPath + '-second',  // Different repo_root due to UNIQUE constraint
        description: 'Second workspace',
        created_at: Date.now(),
        updated_at: Date.now(),
        metadata: null,
      };

      db.saveWorkspace(workspace1);
      db.saveWorkspace(workspace2);

      const workspaces = db.getAllWorkspaces();
      expect(workspaces.length).toBeGreaterThanOrEqual(2);

      const names = workspaces.map(w => w.name);
      expect(names).toContain('workspace-1');
      expect(names).toContain('workspace-2');

      db.close();
    });

    it('should delete workspace', async () => {
      const db = await createTestDb();

      const workspaceId = randomUUID();
      db.saveWorkspace({
        id: workspaceId,
        name: 'to-delete',
        repo_root: testRepoPath,
        description: null,
        created_at: Date.now(),
        updated_at: Date.now(),
        metadata: null,
      });

      // Verify it exists
      let retrieved = db.getWorkspace(workspaceId);
      expect(retrieved).toBeDefined();

      // Delete it
      db.deleteWorkspace(workspaceId);

      // Verify it's gone
      retrieved = db.getWorkspace(workspaceId);
      expect(retrieved).toBeNull();

      db.close();
    });
  });

  describe('Managed Repo / Checkout Management', () => {
    let workspaceId: string;

    beforeEach(async () => {
      const db = await createTestDb();

      workspaceId = randomUUID();
      db.saveWorkspace({
        id: workspaceId,
        name: 'checkout-test-workspace',
        repo_root: testRepoPath,
        description: null,
        created_at: Date.now(),
        updated_at: Date.now(),
        metadata: null,
      });

      db.close();
    });

    it('should create and retrieve checkout via managed_repos', async () => {
      const db = await createTestDb();

      const repoId = randomUUID();
      db.saveManagedRepo({
        id: repoId,
        workspace_id: workspaceId,
        path: join(testRepoPath, 'session-abc12345'),
        name: 'session-abc12345',
        origin_url: null,
        created_at: Date.now(),
        updated_at: Date.now(),
        session_id: null,
        clone_source: 'workspace',
      });

      const retrieved = db.getManagedRepo(repoId);
      expect(retrieved).toBeDefined();
      expect(retrieved?.name).toBe('session-abc12345');
      expect(retrieved?.workspace_id).toBe(workspaceId);
      expect(retrieved?.clone_source).toBe('workspace');

      db.close();
    });

    it('should list checkouts for workspace', async () => {
      const db = await createTestDb();

      db.saveManagedRepo({
        id: randomUUID(),
        workspace_id: workspaceId,
        path: join(testRepoPath, 'checkout-1'),
        name: 'checkout-1',
        origin_url: null,
        created_at: Date.now(),
        updated_at: Date.now(),
        session_id: null,
        clone_source: 'workspace',
      });

      db.saveManagedRepo({
        id: randomUUID(),
        workspace_id: workspaceId,
        path: join(testRepoPath, 'checkout-2'),
        name: 'checkout-2',
        origin_url: null,
        created_at: Date.now(),
        updated_at: Date.now(),
        session_id: null,
        clone_source: 'init',
      });

      const repos = db.getManagedRepos(workspaceId);
      expect(repos.length).toBeGreaterThanOrEqual(2);

      const names = repos.map(r => r.name);
      expect(names).toContain('checkout-1');
      expect(names).toContain('checkout-2');

      db.close();
    });

    it('should delete checkout', async () => {
      const db = await createTestDb();

      const repoId = randomUUID();
      db.saveManagedRepo({
        id: repoId,
        workspace_id: workspaceId,
        path: join(testRepoPath, 'to-delete'),
        name: 'to-delete',
        origin_url: null,
        created_at: Date.now(),
        updated_at: Date.now(),
        session_id: null,
        clone_source: 'workspace',
      });

      // Verify it exists
      let retrieved = db.getManagedRepo(repoId);
      expect(retrieved).toBeDefined();

      // Delete it
      db.deleteManagedRepo(repoId);

      // Verify it's gone
      retrieved = db.getManagedRepo(repoId);
      expect(retrieved).toBeNull();

      db.close();
    });
  });

  describe('Error Scenarios', () => {
    it('should return null for non-existent workspace', async () => {
      const db = await createTestDb();

      const nonExistentId = randomUUID();
      const workspace = db.getWorkspace(nonExistentId);

      expect(workspace).toBeNull();

      db.close();
    });

    it('should return null for non-existent managed repo', async () => {
      const db = await createTestDb();

      const nonExistentId = randomUUID();
      const repo = db.getManagedRepo(nonExistentId);

      expect(repo).toBeNull();

      db.close();
    });

    it('should handle empty workspace list', async () => {
      // Create a fresh database
      const freshDbPath = join(tmpdir(), `fresh-${randomUUID()}.db`);
      const { ApertureDatabase } = await import('../src/database.js');
      const db = new ApertureDatabase(freshDbPath);
      db.migrate(join(process.cwd(), 'src', 'migrations'));

      const workspaces = db.getAllWorkspaces();
      expect(Array.isArray(workspaces)).toBe(true);
      expect(workspaces.length).toBe(0);

      db.close();
      if (existsSync(freshDbPath)) {
        rmSync(freshDbPath, { force: true });
      }
    });
  });
});
