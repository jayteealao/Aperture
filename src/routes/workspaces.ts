import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { randomUUID } from 'crypto';
import { resolve, normalize } from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { rm } from 'fs/promises';
import type { ApertureDatabase, WorkspaceRecord } from '../database.js';
import { cloneRepository } from '../discovery/repoCloner.js';
import { validatePathExists } from '../discovery/pathValidation.js';

const execFileAsync = promisify(execFile);

/**
 * Normalize a repository path for comparison
 */
function normalizeRepoPath(p: string): string {
  return resolve(normalize(p))
    .replace(/[\\/]+$/, '')  // Remove trailing slashes
    .toLowerCase();  // Case-insensitive for cross-platform
}

/**
 * Validates a git URL to prevent SSRF attacks.
 * Only allows HTTPS and SSH (git@) URLs, and blocks internal network addresses.
 */
function validateGitUrl(url: string): { valid: boolean; error?: string } {
  const httpsPattern = /^https:\/\/[^/]+\/.+$/;
  const sshPattern = /^git@[^:]+:.+$/;

  if (!httpsPattern.test(url) && !sshPattern.test(url)) {
    return { valid: false, error: 'Only HTTPS and SSH git URLs are allowed' };
  }

  // For HTTPS URLs, check for internal IPs and localhost
  if (url.startsWith('https://')) {
    try {
      const urlObj = new URL(url);
      const hostname = urlObj.hostname.toLowerCase();

      if (
        hostname === 'localhost' ||
        /^127\./.test(hostname) ||
        /^10\./.test(hostname) ||
        /^172\.(1[6-9]|2[0-9]|3[01])\./.test(hostname) ||
        /^192\.168\./.test(hostname) ||
        /^169\.254\./.test(hostname) ||
        /^0\./.test(hostname)
      ) {
        return { valid: false, error: 'Internal network URLs are not allowed' };
      }
    } catch {
      return { valid: false, error: 'Invalid URL format' };
    }
  }

  return { valid: true };
}

export async function registerWorkspaceRoutes(
  fastify: FastifyInstance,
  database: ApertureDatabase | null
) {
  // Middleware to check if database is available
  const checkDatabase = async (_request: FastifyRequest, reply: FastifyReply) => {
    if (!database) {
      return reply.status(503).send({
        error: 'Service Unavailable',
        message: 'Workspace features require database support',
      });
    }
  };

  /**
   * POST /v1/workspaces
   * Create a new workspace
   */
  fastify.post<{
    Body: { name?: string; repoRoot?: string; description?: string };
  }>('/v1/workspaces', { preHandler: checkDatabase }, async (request, reply) => {
    try {
      const { name, repoRoot, description } = request.body;

      // Validation
      if (!name || typeof name !== 'string') {
        return reply.status(400).send({ error: 'Missing or invalid field: name' });
      }

      if (!repoRoot || typeof repoRoot !== 'string') {
        return reply.status(400).send({ error: 'Missing or invalid field: repoRoot' });
      }

      // Verify it's a git repository using git CLI
      try {
        await execFileAsync('git', ['rev-parse', '--git-dir'], { cwd: repoRoot });
      } catch (error) {
        fastify.log.error({ err: error }, 'Invalid repository path');
        return reply.status(400).send({
          error: 'INVALID_REPOSITORY',
          message: `Path is not a valid git repository: ${repoRoot}`,
        });
      }

      // Create workspace record
      const workspace: WorkspaceRecord = {
        id: randomUUID(),
        name,
        repo_root: repoRoot,
        description: description || null,
        created_at: Date.now(),
        updated_at: Date.now(),
        metadata: null,
      };

      try {
        database!.saveWorkspace(workspace);
      } catch (err: unknown) {
        const error = err as { code?: string };
        if (error.code === 'SQLITE_CONSTRAINT_UNIQUE' || error.code === 'SQLITE_CONSTRAINT') {
          return reply.status(409).send({
            error: 'DUPLICATE_WORKSPACE',
            message: 'A workspace already exists for this repository path',
          });
        }
        throw err;
      }

      return reply.status(201).send({
        workspace: {
          id: workspace.id,
          name: workspace.name,
          repoRoot: workspace.repo_root,
          description: workspace.description,
          createdAt: new Date(workspace.created_at).toISOString(),
          updatedAt: new Date(workspace.updated_at).toISOString(),
        },
      });
    } catch (error) {
      fastify.log.error({ err: error }, 'Create workspace failed');
      return reply.status(500).send({
        error: 'CREATE_WORKSPACE_FAILED',
        message: 'Failed to create workspace',
      });
    }
  });

  /**
   * POST /v1/workspaces/clone
   * Clone a remote repository and create a workspace
   */
  fastify.post<{
    Body: { remoteUrl?: string; targetDirectory?: string; name?: string };
  }>('/v1/workspaces/clone', { preHandler: checkDatabase }, async (request, reply) => {
    const { remoteUrl, targetDirectory, name } = request.body;

    // Validation (before clone, no cleanup needed)
    if (!remoteUrl || typeof remoteUrl !== 'string') {
      return reply.status(400).send({
        error: 'INVALID_GIT_URL',
        message: 'Missing or invalid field: remoteUrl',
      });
    }

    // Validate git URL to prevent SSRF attacks
    const urlValidation = validateGitUrl(remoteUrl);
    if (!urlValidation.valid) {
      return reply.status(400).send({
        error: 'INVALID_GIT_URL',
        message: urlValidation.error,
      });
    }

    if (!targetDirectory || typeof targetDirectory !== 'string') {
      return reply.status(400).send({
        error: 'INVALID_PATH',
        message: 'Missing or invalid field: targetDirectory',
      });
    }

    // Validate target directory exists and is accessible
    try {
      await validatePathExists(targetDirectory);
    } catch {
      return reply.status(400).send({
        error: 'INVALID_PATH',
        message: `Target directory does not exist or is not accessible: ${targetDirectory}`,
      });
    }

    // Track cloned path for cleanup on failure
    let clonedPath: string | undefined;

    try {
      // Clone the repository
      try {
        clonedPath = await cloneRepository({
          remoteUrl,
          targetDirectory,
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';

        // Check for specific error types
        if (errorMessage.includes('authentication') || errorMessage.includes('auth')) {
          return reply.status(401).send({
            error: 'AUTH_REQUIRED',
            message: 'Authentication required for this repository',
          });
        }

        if (errorMessage.includes('not found') || errorMessage.includes('404')) {
          return reply.status(404).send({
            error: 'REPO_NOT_FOUND',
            message: `Repository not found: ${remoteUrl}`,
          });
        }

        return reply.status(500).send({
          error: 'CLONE_FAILED',
          message: `Clone failed: ${errorMessage}`,
        });
      }

      // Check if workspace already exists for this repo path
      const existingWorkspaces = database!.getAllWorkspaces();
      const normalizedClonedPath = normalizeRepoPath(clonedPath);
      const duplicateWorkspace = existingWorkspaces.find(
        (w) => normalizeRepoPath(w.repo_root) === normalizedClonedPath
      );

      if (duplicateWorkspace) {
        // Clean up cloned directory since we can't use it
        if (clonedPath) {
          try {
            await rm(clonedPath, { recursive: true, force: true });
            fastify.log.info({ path: clonedPath }, 'Cleaned up duplicate clone');
          } catch (cleanupError) {
            fastify.log.error({ err: cleanupError, path: clonedPath }, 'Failed to cleanup duplicate clone');
          }
        }
        return reply.status(409).send({
          error: 'DUPLICATE_WORKSPACE',
          message: 'Workspace already exists for this repository',
          existingWorkspaceId: duplicateWorkspace.id,
        });
      }

      // Extract repo name from path for default workspace name
      const repoName = clonedPath.split(/[/\\]/).pop() || 'repository';
      const workspaceName = name || repoName;

      // Create workspace record
      const workspace: WorkspaceRecord = {
        id: randomUUID(),
        name: workspaceName,
        repo_root: clonedPath,
        description: `Cloned from ${remoteUrl}`,
        created_at: Date.now(),
        updated_at: Date.now(),
        metadata: null,
      };

      try {
        database!.saveWorkspace(workspace);
      } catch (err: unknown) {
        const error = err as { code?: string };
        if (error.code === 'SQLITE_CONSTRAINT_UNIQUE' || error.code === 'SQLITE_CONSTRAINT') {
          return reply.status(409).send({
            error: 'DUPLICATE_WORKSPACE',
            message: 'A workspace already exists for this repository path',
          });
        }
        throw err;
      }

      return reply.status(201).send({
        workspace: {
          id: workspace.id,
          name: workspace.name,
          repoRoot: workspace.repo_root,
          description: workspace.description,
          createdAt: new Date(workspace.created_at).toISOString(),
          updatedAt: new Date(workspace.updated_at).toISOString(),
        },
      });
    } catch (error) {
      // Cleanup cloned directory on any failure after clone succeeded
      if (clonedPath) {
        try {
          await rm(clonedPath, { recursive: true, force: true });
          fastify.log.info({ path: clonedPath }, 'Cleaned up failed clone');
        } catch (cleanupError) {
          fastify.log.error({ err: cleanupError, path: clonedPath }, 'Failed to cleanup clone');
        }
      }

      fastify.log.error({ err: error }, 'Clone workspace failed');
      return reply.status(500).send({
        error: 'CLONE_WORKSPACE_FAILED',
        message: 'Failed to clone repository and create workspace',
      });
    }
  });

  /**
   * POST /v1/workspaces/init
   * Initialize a new git repository and optionally create a workspace
   */
  fastify.post<{
    Body: { path?: string; name?: string; createWorkspace?: boolean };
  }>('/v1/workspaces/init', { preHandler: checkDatabase }, async (request, reply) => {
    const { path: targetPath, name, createWorkspace = false } = request.body;

    // Validation
    if (!targetPath || typeof targetPath !== 'string') {
      return reply.status(400).send({
        error: 'INVALID_PATH',
        message: 'Missing or invalid field: path',
      });
    }

    const { resolve: resolvePath, join } = await import('path');
    const { stat, mkdir } = await import('fs/promises');

    const resolvedPath = resolvePath(targetPath);

    try {
      // Check if directory exists
      try {
        const pathStat = await stat(resolvedPath);
        if (!pathStat.isDirectory()) {
          return reply.status(400).send({
            error: 'INVALID_PATH',
            message: `Path exists but is not a directory: ${resolvedPath}`,
          });
        }
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
          // Create directory if it doesn't exist
          await mkdir(resolvedPath, { recursive: true });
          fastify.log.info({ path: resolvedPath }, 'Created directory');
        } else {
          throw error;
        }
      }

      // Check if already a git repository
      try {
        await stat(join(resolvedPath, '.git'));
        return reply.status(400).send({
          error: 'ALREADY_INITIALIZED',
          message: `Directory is already a git repository: ${resolvedPath}`,
        });
      } catch {
        // Not a git repo, continue with init
      }

      // Run git init (execFile avoids shell injection)
      try {
        await execFileAsync('git', ['init'], { cwd: resolvedPath });
        fastify.log.info({ path: resolvedPath }, 'Initialized git repository');
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        return reply.status(500).send({
          error: 'GIT_INIT_FAILED',
          message: `Failed to initialize git repository: ${errorMessage}`,
        });
      }

      // Optionally create workspace record
      if (createWorkspace) {
        const repoName = resolvedPath.split(/[/\\]/).pop() || 'repository';
        const workspaceName = name || repoName;

        const workspace: WorkspaceRecord = {
          id: randomUUID(),
          name: workspaceName,
          repo_root: resolvedPath,
          description: 'Newly initialized repository',
          created_at: Date.now(),
          updated_at: Date.now(),
          metadata: null,
        };

        try {
          database!.saveWorkspace(workspace);
        } catch (err: unknown) {
          const error = err as { code?: string };
          if (error.code === 'SQLITE_CONSTRAINT_UNIQUE' || error.code === 'SQLITE_CONSTRAINT') {
            return reply.status(409).send({
              error: 'DUPLICATE_WORKSPACE',
              message: 'A workspace already exists for this repository path',
            });
          }
          throw err;
        }

        return reply.status(201).send({
          path: resolvedPath,
          workspace: {
            id: workspace.id,
            name: workspace.name,
            repoRoot: workspace.repo_root,
            description: workspace.description,
            createdAt: new Date(workspace.created_at).toISOString(),
            updatedAt: new Date(workspace.updated_at).toISOString(),
          },
        });
      }

      return reply.status(201).send({
        path: resolvedPath,
        workspace: null,
      });
    } catch (error) {
      fastify.log.error({ err: error }, 'Init repository failed');
      return reply.status(500).send({
        error: 'INIT_FAILED',
        message: 'Failed to initialize repository',
      });
    }
  });

  /**
   * GET /v1/workspaces
   * List all workspaces
   */
  fastify.get('/v1/workspaces', { preHandler: checkDatabase }, async (_request, reply) => {
    try {
      const workspaces = database!.getAllWorkspaces();

      return reply.send({
        workspaces: workspaces.map((w) => ({
          id: w.id,
          name: w.name,
          repoRoot: w.repo_root,
          description: w.description,
          createdAt: new Date(w.created_at).toISOString(),
          updatedAt: new Date(w.updated_at).toISOString(),
        })),
      });
    } catch (error) {
      fastify.log.error({ err: error }, 'List workspaces failed');
      return reply.status(500).send({
        error: 'Internal Server Error',
        message: 'Failed to list workspaces',
      });
    }
  });

  /**
   * GET /v1/workspaces/:id
   * Get a specific workspace
   */
  fastify.get<{ Params: { id: string } }>(
    '/v1/workspaces/:id',
    { preHandler: checkDatabase },
    async (request, reply) => {
      try {
        const { id } = request.params;
        const workspace = database!.getWorkspace(id);

        if (!workspace) {
          return reply.status(404).send({
            error: 'Not Found',
            message: `Workspace not found: ${id}`,
          });
        }

        return reply.send({
          workspace: {
            id: workspace.id,
            name: workspace.name,
            repoRoot: workspace.repo_root,
            description: workspace.description,
            createdAt: new Date(workspace.created_at).toISOString(),
            updatedAt: new Date(workspace.updated_at).toISOString(),
          },
        });
      } catch (error) {
        fastify.log.error({ err: error }, 'Get workspace failed');
        return reply.status(500).send({
          error: 'Internal Server Error',
          message: 'Failed to get workspace',
        });
      }
    }
  );

  /**
   * GET /v1/workspaces/:id/checkouts
   * List all checkouts (clones) for a workspace
   */
  fastify.get<{ Params: { id: string } }>(
    '/v1/workspaces/:id/checkouts',
    { preHandler: checkDatabase },
    async (request, reply) => {
      try {
        const { id } = request.params;

        // Verify workspace exists
        const workspace = database!.getWorkspace(id);
        if (!workspace) {
          return reply.status(404).send({
            error: 'Not Found',
            message: `Workspace not found: ${id}`,
          });
        }

        const repos = database!.getManagedRepos(id);

        return reply.send({
          checkouts: repos.map((r) => ({
            id: r.id,
            workspaceId: r.workspace_id,
            sessionId: r.session_id,
            path: r.path,
            name: r.name,
            cloneSource: r.clone_source,
            createdAt: new Date(r.created_at).toISOString(),
            updatedAt: r.updated_at ? new Date(r.updated_at).toISOString() : null,
          })),
        });
      } catch (error) {
        fastify.log.error({ err: error }, 'List checkouts failed');
        return reply.status(500).send({
          error: 'Internal Server Error',
          message: 'Failed to list workspace checkouts',
        });
      }
    }
  );

  /**
   * DELETE /v1/workspaces/:id
   * Delete a workspace and clean up its clones
   */
  fastify.delete<{ Params: { id: string } }>(
    '/v1/workspaces/:id',
    { preHandler: checkDatabase },
    async (request, reply) => {
      try {
        const { id } = request.params;

        // Verify workspace exists
        const workspace = database!.getWorkspace(id);
        if (!workspace) {
          return reply.status(404).send({
            error: 'Not Found',
            message: `Workspace not found: ${id}`,
          });
        }

        // Clean up managed repo clones
        const repos = database!.getManagedRepos(id);
        for (const repo of repos) {
          if (repo.clone_source !== 'external') {
            try {
              await rm(repo.path, { recursive: true, force: true });
              fastify.log.info({ path: repo.path }, 'Removed clone directory');
            } catch (error) {
              fastify.log.warn({ err: error, path: repo.path }, 'Failed to remove clone directory');
            }
          }
        }

        // Delete workspace (managed_repos are cleaned up separately since no FK cascade)
        for (const repo of repos) {
          database!.deleteManagedRepo(repo.id);
        }
        database!.deleteWorkspace(id);

        return reply.status(204).send();
      } catch (error) {
        fastify.log.error({ err: error }, 'Delete workspace failed');
        return reply.status(500).send({
          error: 'DELETE_WORKSPACE_FAILED',
          message: 'Failed to delete workspace',
        });
      }
    }
  );

  /**
   * DELETE /v1/workspaces/:id/checkouts/:repoId
   * Remove a specific checkout from a workspace
   */
  fastify.delete<{ Params: { id: string; repoId: string } }>(
    '/v1/workspaces/:id/checkouts/:repoId',
    { preHandler: checkDatabase },
    async (request, reply) => {
      try {
        const { id, repoId } = request.params;

        // Verify workspace exists
        const workspace = database!.getWorkspace(id);
        if (!workspace) {
          return reply.status(404).send({
            error: 'Not Found',
            message: `Workspace not found: ${id}`,
          });
        }

        // Get managed repo and verify it belongs to this workspace
        const repo = database!.getManagedRepo(repoId);
        if (!repo || repo.workspace_id !== id) {
          return reply.status(404).send({
            error: 'Not Found',
            message: `Checkout not found: ${repoId}`,
          });
        }

        // Remove clone directory (only for non-external repos)
        if (repo.clone_source !== 'external') {
          try {
            await rm(repo.path, { recursive: true, force: true });
            fastify.log.info({ path: repo.path }, 'Removed checkout directory');
          } catch (error) {
            fastify.log.warn({ err: error, path: repo.path }, 'Failed to remove checkout directory');
          }
        }

        // Delete managed repo record
        database!.deleteManagedRepo(repoId);

        return reply.status(204).send();
      } catch (error) {
        fastify.log.error({ err: error }, 'Delete checkout failed');
        return reply.status(500).send({
          error: 'DELETE_CHECKOUT_FAILED',
          message: 'Failed to delete checkout',
        });
      }
    }
  );
}
