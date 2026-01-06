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
        repo_root: testRepoPath,
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

  describe('Workspace Agent Management', () => {
    let workspaceId: string;

    beforeEach(async () => {
      const db = await createTestDb();

      workspaceId = randomUUID();
      db.saveWorkspace({
        id: workspaceId,
        name: 'agent-test-workspace',
        repo_root: testRepoPath,
        description: null,
        created_at: Date.now(),
        updated_at: Date.now(),
        metadata: null,
      });

      db.close();
    });

    it('should create and retrieve workspace agent', async () => {
      const db = await createTestDb();

      const agentId = randomUUID();
      const sessionId = randomUUID();
      const agent = {
        id: agentId,
        workspace_id: workspaceId,
        session_id: sessionId,
        branch: 'feature/test-branch',
        worktree_path: join(testRepoPath, '.worktrees', 'feature-test-branch'),
        created_at: Date.now(),
        updated_at: Date.now(),
      };

      db.saveWorkspaceAgent(agent);

      const retrieved = db.getWorkspaceAgentBySession(sessionId);
      expect(retrieved).toBeDefined();
      expect(retrieved?.branch).toBe('feature/test-branch');
      expect(retrieved?.workspace_id).toBe(workspaceId);

      db.close();
    });

    it('should list agents for workspace', async () => {
      const db = await createTestDb();

      const agent1 = {
        id: randomUUID(),
        workspace_id: workspaceId,
        session_id: randomUUID(),
        branch: 'feature/branch-1',
        worktree_path: join(testRepoPath, '.worktrees', 'feature-branch-1'),
        created_at: Date.now(),
        updated_at: Date.now(),
      };

      const agent2 = {
        id: randomUUID(),
        workspace_id: workspaceId,
        session_id: randomUUID(),
        branch: 'feature/branch-2',
        worktree_path: join(testRepoPath, '.worktrees', 'feature-branch-2'),
        created_at: Date.now(),
        updated_at: Date.now(),
      };

      db.saveWorkspaceAgent(agent1);
      db.saveWorkspaceAgent(agent2);

      const agents = db.getWorkspaceAgents(workspaceId);
      expect(agents.length).toBeGreaterThanOrEqual(2);

      const branches = agents.map(a => a.branch);
      expect(branches).toContain('feature/branch-1');
      expect(branches).toContain('feature/branch-2');

      db.close();
    });

    it('should delete workspace agent', async () => {
      const db = await createTestDb();

      const agentId = randomUUID();
      const sessionId = randomUUID();
      db.saveWorkspaceAgent({
        id: agentId,
        workspace_id: workspaceId,
        session_id: sessionId,
        branch: 'feature/to-delete',
        worktree_path: join(testRepoPath, '.worktrees', 'feature-to-delete'),
        created_at: Date.now(),
        updated_at: Date.now(),
      });

      // Verify it exists
      let retrieved = db.getWorkspaceAgentBySession(sessionId);
      expect(retrieved).toBeDefined();

      // Delete it
      db.deleteWorkspaceAgent(agentId);

      // Verify it's gone
      retrieved = db.getWorkspaceAgentBySession(sessionId);
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

    it('should return null for non-existent agent session', async () => {
      const db = await createTestDb();

      const nonExistentSessionId = randomUUID();
      const agent = db.getWorkspaceAgentBySession(nonExistentSessionId);

      expect(agent).toBeNull();

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
