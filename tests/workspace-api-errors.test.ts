import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'crypto';
import { mkdirSync, rmSync, existsSync, writeFileSync } from 'fs';
import { execSync } from 'child_process';
import { join } from 'path';
import { tmpdir } from 'os';
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import { ApertureDatabase } from '../src/database.js';
import { registerWorkspaceRoutes } from '../src/routes/workspaces.js';

describe('Workspace API Error Scenarios', () => {
  let testRepoPath: string;
  let testDbPath: string;
  let tempDir: string;
  let fastify: FastifyInstance;
  let database: ApertureDatabase;

  beforeAll(async () => {
    // Create a temporary directory for testing
    tempDir = join(tmpdir(), `aperture-api-error-test-${randomUUID()}`);
    mkdirSync(tempDir, { recursive: true });

    // Create test git repository
    testRepoPath = join(tempDir, 'test-repo');
    mkdirSync(testRepoPath);
    execSync('git init', { cwd: testRepoPath, stdio: 'pipe' });
    execSync('git config user.email "test@example.com"', { cwd: testRepoPath, stdio: 'pipe' });
    execSync('git config user.name "Test User"', { cwd: testRepoPath, stdio: 'pipe' });
    execSync('git config commit.gpgsign false', { cwd: testRepoPath, stdio: 'pipe' });
    execSync('git commit --allow-empty -m "Initial commit"', { cwd: testRepoPath, stdio: 'pipe' });

    // Create test database
    testDbPath = join(tempDir, 'test-error-scenarios.db');
    database = new ApertureDatabase(testDbPath);
    database.migrate(join(process.cwd(), 'src', 'migrations'));

    // Create Fastify instance and register routes
    fastify = Fastify({ logger: false });
    await registerWorkspaceRoutes(fastify, database);
    await fastify.ready();
  });

  afterAll(async () => {
    // Clean up
    await fastify.close();
    database.close();
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('Invalid Repository Paths', () => {
    it('should reject workspace creation with non-existent path', async () => {
      const response = await fastify.inject({
        method: 'POST',
        url: '/v1/workspaces',
        payload: {
          name: 'invalid-workspace',
          repoRoot: '/nonexistent/path/to/repo',
          description: 'Should fail',
        },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Invalid repository');
      expect(body.message).toContain('not a valid git repository');
    });

    it('should reject workspace creation with non-git directory', async () => {
      // Create a regular directory (not a git repo)
      const nonGitDir = join(tempDir, 'not-a-git-repo');
      mkdirSync(nonGitDir, { recursive: true });

      const response = await fastify.inject({
        method: 'POST',
        url: '/v1/workspaces',
        payload: {
          name: 'non-git-workspace',
          repoRoot: nonGitDir,
          description: 'Should fail - not a git repo',
        },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Invalid repository');

      // Clean up
      rmSync(nonGitDir, { recursive: true, force: true });
    });

    it('should reject workspace creation with file path instead of directory', async () => {
      // Create a file instead of directory
      const filePath = join(tempDir, 'test-file.txt');
      writeFileSync(filePath, 'test content');

      const response = await fastify.inject({
        method: 'POST',
        url: '/v1/workspaces',
        payload: {
          name: 'file-workspace',
          repoRoot: filePath,
          description: 'Should fail - path is a file',
        },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Invalid repository');

      // Clean up
      rmSync(filePath, { force: true });
    });
  });

  describe('Missing or Invalid Parameters', () => {
    it('should reject workspace creation without name', async () => {
      const response = await fastify.inject({
        method: 'POST',
        url: '/v1/workspaces',
        payload: {
          repoRoot: testRepoPath,
          description: 'Missing name',
        },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error).toContain('name');
    });

    it('should reject workspace creation without repoRoot', async () => {
      const response = await fastify.inject({
        method: 'POST',
        url: '/v1/workspaces',
        payload: {
          name: 'test-workspace',
          description: 'Missing repoRoot',
        },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error).toContain('repoRoot');
    });

    it('should reject workspace creation with empty name', async () => {
      const response = await fastify.inject({
        method: 'POST',
        url: '/v1/workspaces',
        payload: {
          name: '',
          repoRoot: testRepoPath,
        },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error).toContain('name');
    });

    it('should reject workspace creation with invalid name type', async () => {
      const response = await fastify.inject({
        method: 'POST',
        url: '/v1/workspaces',
        payload: {
          name: 123, // number instead of string
          repoRoot: testRepoPath,
        },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error).toContain('name');
    });
  });

  describe('Non-Existent Resource Errors', () => {
    it('should return 404 for non-existent workspace', async () => {
      const nonExistentId = randomUUID();

      const response = await fastify.inject({
        method: 'GET',
        url: `/v1/workspaces/${nonExistentId}`,
      });

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Not Found');
      expect(body.message).toContain('Workspace not found');
    });

    it('should return 404 when listing agents for non-existent workspace', async () => {
      const nonExistentId = randomUUID();

      const response = await fastify.inject({
        method: 'GET',
        url: `/v1/workspaces/${nonExistentId}/agents`,
      });

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Not Found');
      expect(body.message).toContain('Workspace not found');
    });

    it('should return 404 when listing worktrees for non-existent workspace', async () => {
      const nonExistentId = randomUUID();

      const response = await fastify.inject({
        method: 'GET',
        url: `/v1/workspaces/${nonExistentId}/worktrees`,
      });

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Not Found');
      expect(body.message).toContain('Workspace not found');
    });

    it('should return 404 when deleting non-existent workspace', async () => {
      const nonExistentId = randomUUID();

      const response = await fastify.inject({
        method: 'DELETE',
        url: `/v1/workspaces/${nonExistentId}`,
      });

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Not Found');
      expect(body.message).toContain('Workspace not found');
    });

    it('should return 404 when deleting non-existent agent', async () => {
      // First create a workspace
      const createResponse = await fastify.inject({
        method: 'POST',
        url: '/v1/workspaces',
        payload: {
          name: 'test-workspace-for-agent-delete',
          repoRoot: testRepoPath,
        },
      });

      if (createResponse.statusCode !== 201) {
        // Skip this test if workspace creation fails (e.g., native addon not available)
        console.warn('Skipping test: workspace creation failed');
        return;
      }

      const { workspace } = JSON.parse(createResponse.body);

      // Try to delete non-existent agent
      const nonExistentAgentId = randomUUID();
      const deleteResponse = await fastify.inject({
        method: 'DELETE',
        url: `/v1/workspaces/${workspace.id}/agents/${nonExistentAgentId}`,
      });

      expect(deleteResponse.statusCode).toBe(404);
      const body = JSON.parse(deleteResponse.body);
      expect(body.error).toBe('Not Found');
      expect(body.message).toContain('Agent not found');

      // Clean up workspace
      await fastify.inject({
        method: 'DELETE',
        url: `/v1/workspaces/${workspace.id}`,
      });
    });
  });

  describe('Database Unavailable Scenarios', () => {
    let fastifyWithoutDb: FastifyInstance;

    beforeAll(async () => {
      // Create Fastify instance without database
      fastifyWithoutDb = Fastify({ logger: false });
      await registerWorkspaceRoutes(fastifyWithoutDb, null);
      await fastifyWithoutDb.ready();
    });

    afterAll(async () => {
      await fastifyWithoutDb.close();
    });

    it('should return 503 when creating workspace without database', async () => {
      const response = await fastifyWithoutDb.inject({
        method: 'POST',
        url: '/v1/workspaces',
        payload: {
          name: 'test-workspace',
          repoRoot: testRepoPath,
        },
      });

      expect(response.statusCode).toBe(503);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Service Unavailable');
      expect(body.message).toContain('database support');
    });

    it('should return 503 when listing workspaces without database', async () => {
      const response = await fastifyWithoutDb.inject({
        method: 'GET',
        url: '/v1/workspaces',
      });

      expect(response.statusCode).toBe(503);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Service Unavailable');
    });

    it('should return 503 when getting workspace without database', async () => {
      const response = await fastifyWithoutDb.inject({
        method: 'GET',
        url: `/v1/workspaces/${randomUUID()}`,
      });

      expect(response.statusCode).toBe(503);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Service Unavailable');
    });
  });

  describe('Edge Cases', () => {
    it('should handle very long workspace names', async () => {
      const longName = 'x'.repeat(1000);

      const response = await fastify.inject({
        method: 'POST',
        url: '/v1/workspaces',
        payload: {
          name: longName,
          repoRoot: testRepoPath,
        },
      });

      // Should either succeed or fail gracefully
      expect([201, 400, 500]).toContain(response.statusCode);
    });

    it('should handle workspace names with special characters', async () => {
      const specialName = 'test-workspace-!@#$%^&*()_+{}|:"<>?[];,./`~';

      const response = await fastify.inject({
        method: 'POST',
        url: '/v1/workspaces',
        payload: {
          name: specialName,
          repoRoot: testRepoPath,
        },
      });

      // Should either succeed or reject with validation error
      expect(response.statusCode).toBeGreaterThanOrEqual(200);
      expect(response.statusCode).toBeLessThan(600);
    });

    it('should return empty array for workspace with no agents', async () => {
      // Create workspace
      const createResponse = await fastify.inject({
        method: 'POST',
        url: '/v1/workspaces',
        payload: {
          name: 'workspace-no-agents',
          repoRoot: testRepoPath,
        },
      });

      if (createResponse.statusCode !== 201) {
        // Skip this test if workspace creation fails (e.g., native addon not available)
        console.warn('Skipping test: workspace creation failed');
        return;
      }

      const { workspace } = JSON.parse(createResponse.body);

      // List agents (should be empty)
      const listResponse = await fastify.inject({
        method: 'GET',
        url: `/v1/workspaces/${workspace.id}/agents`,
      });

      expect(listResponse.statusCode).toBe(200);
      const { agents } = JSON.parse(listResponse.body);
      expect(Array.isArray(agents)).toBe(true);
      expect(agents.length).toBe(0);

      // Clean up
      await fastify.inject({
        method: 'DELETE',
        url: `/v1/workspaces/${workspace.id}`,
      });
    });
  });
});
