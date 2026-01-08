import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { randomUUID } from 'crypto';
import type { ApertureDatabase, WorkspaceRecord } from '../database.js';
import { createWorktreeManager } from '../workspaces/worktreeManager.js';
import { cloneRepository } from '../discovery/repoCloner.js';
import { validatePathExists } from '../discovery/pathValidation.js';

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

      // Verify it's a git repository
      const worktreeManager = createWorktreeManager();
      try {
        await worktreeManager.ensureRepoReady(repoRoot);
      } catch (error) {
        return reply.status(400).send({
          error: 'Invalid repository',
          message: `Path is not a valid git repository: ${repoRoot}`,
          details: String(error),
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

      database!.saveWorkspace(workspace);

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
      console.error('[Workspace API] Create workspace error:', error);
      return reply.status(500).send({
        error: 'Internal Server Error',
        message: 'Failed to create workspace',
        details: String(error),
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
    try {
      const { remoteUrl, targetDirectory, name } = request.body;

      // Validation
      if (!remoteUrl || typeof remoteUrl !== 'string') {
        return reply.status(400).send({
          error: 'INVALID_GIT_URL',
          message: 'Missing or invalid field: remoteUrl',
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
      } catch (error) {
        return reply.status(400).send({
          error: 'INVALID_PATH',
          message: `Target directory does not exist or is not accessible: ${targetDirectory}`,
        });
      }

      // Clone the repository
      let clonedPath: string;
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
      const duplicateWorkspace = existingWorkspaces.find(
        (w) => w.repo_root.toLowerCase() === clonedPath.toLowerCase()
      );

      if (duplicateWorkspace) {
        return reply.status(409).send({
          error: 'DUPLICATE_WORKSPACE',
          message: 'Workspace already exists for this repository',
          existingWorkspaceId: duplicateWorkspace.id,
        });
      }

      // Extract repo name from path for default workspace name
      const repoName = clonedPath.split(/[\/\\]/).pop() || 'repository';
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

      database!.saveWorkspace(workspace);

      return reply.status(201).send({
        workspace: {
          id: workspace.id,
          name: workspace.name,
          repoPath: workspace.repo_root,
          description: workspace.description,
          createdAt: new Date(workspace.created_at).toISOString(),
          updatedAt: new Date(workspace.updated_at).toISOString(),
        },
      });
    } catch (error) {
      console.error('[Workspace API] Clone workspace error:', error);
      return reply.status(500).send({
        error: 'Internal Server Error',
        message: 'Failed to clone repository and create workspace',
        details: String(error),
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
      console.error('[Workspace API] List workspaces error:', error);
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
        console.error('[Workspace API] Get workspace error:', error);
        return reply.status(500).send({
          error: 'Internal Server Error',
          message: 'Failed to get workspace',
        });
      }
    }
  );

  /**
   * GET /v1/workspaces/:id/agents
   * List all agents in a workspace
   */
  fastify.get<{ Params: { id: string } }>(
    '/v1/workspaces/:id/agents',
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

        const agents = database!.getWorkspaceAgents(id);

        return reply.send({
          agents: agents.map((a) => ({
            id: a.id,
            workspaceId: a.workspace_id,
            sessionId: a.session_id,
            branch: a.branch,
            worktreePath: a.worktree_path,
            createdAt: new Date(a.created_at).toISOString(),
            updatedAt: new Date(a.updated_at).toISOString(),
          })),
        });
      } catch (error) {
        console.error('[Workspace API] List agents error:', error);
        return reply.status(500).send({
          error: 'Internal Server Error',
          message: 'Failed to list workspace agents',
        });
      }
    }
  );

  /**
   * GET /v1/workspaces/:id/worktrees
   * List all worktrees in a workspace
   */
  fastify.get<{ Params: { id: string } }>(
    '/v1/workspaces/:id/worktrees',
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

        const worktreeManager = createWorktreeManager();
        const worktrees = await worktreeManager.listWorktrees(workspace.repo_root);

        return reply.send({
          worktrees: worktrees.map((w) => ({
            branch: w.branch,
            path: w.path,
            isMain: w.isMain,
            isLocked: w.isLocked,
          })),
        });
      } catch (error) {
        console.error('[Workspace API] List worktrees error:', error);
        return reply.status(500).send({
          error: 'Internal Server Error',
          message: 'Failed to list worktrees',
          details: String(error),
        });
      }
    }
  );

  /**
   * DELETE /v1/workspaces/:id
   * Delete a workspace and all its agents
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

        // Get all agents to clean up their worktrees
        const agents = database!.getWorkspaceAgents(id);
        const worktreeManager = createWorktreeManager();

        // Clean up worktrees for all agents
        for (const agent of agents) {
          try {
            await worktreeManager.removeWorktree(workspace.repo_root, agent.branch);
            console.log(`[Workspace API] Removed worktree for branch: ${agent.branch}`);
          } catch (error) {
            console.warn(
              `[Workspace API] Failed to remove worktree for branch ${agent.branch}:`,
              error
            );
            // Continue with deletion even if worktree removal fails
          }
        }

        // Delete workspace (cascade deletes agents via foreign key)
        database!.deleteWorkspace(id);

        return reply.status(204).send();
      } catch (error) {
        console.error('[Workspace API] Delete workspace error:', error);
        return reply.status(500).send({
          error: 'Internal Server Error',
          message: 'Failed to delete workspace',
          details: String(error),
        });
      }
    }
  );

  /**
   * DELETE /v1/workspaces/:id/agents/:agentId
   * Remove a specific agent from a workspace
   */
  fastify.delete<{ Params: { id: string; agentId: string } }>(
    '/v1/workspaces/:id/agents/:agentId',
    { preHandler: checkDatabase },
    async (request, reply) => {
      try {
        const { id, agentId } = request.params;

        // Verify workspace exists
        const workspace = database!.getWorkspace(id);
        if (!workspace) {
          return reply.status(404).send({
            error: 'Not Found',
            message: `Workspace not found: ${id}`,
          });
        }

        // Get agent
        const agents = database!.getWorkspaceAgents(id);
        const agent = agents.find((a) => a.id === agentId);

        if (!agent) {
          return reply.status(404).send({
            error: 'Not Found',
            message: `Agent not found: ${agentId}`,
          });
        }

        // Remove worktree
        const worktreeManager = createWorktreeManager();
        try {
          await worktreeManager.removeWorktree(workspace.repo_root, agent.branch);
          console.log(`[Workspace API] Removed worktree for agent ${agentId}`);
        } catch (error) {
          console.warn(`[Workspace API] Failed to remove worktree for agent ${agentId}:`, error);
          // Continue with deletion even if worktree removal fails
        }

        // Delete agent record
        database!.deleteWorkspaceAgent(agentId);

        return reply.status(204).send();
      } catch (error) {
        console.error('[Workspace API] Delete agent error:', error);
        return reply.status(500).send({
          error: 'Internal Server Error',
          message: 'Failed to delete agent',
          details: String(error),
        });
      }
    }
  );
}
