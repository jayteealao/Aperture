import type { FastifyInstance } from 'fastify';
import type { SessionManager } from './sessionManager.js';
import type { Config } from './config.js';
import type {
  SessionAuth,
  SdkSessionConfig,
  PiSessionConfig,
  PermissionMode,
  McpServerConfig,
  AgentType,
} from './agents/index.js';
import type { CredentialStore } from './credentials.js';
import type { ApertureDatabase } from './database.js';
import { SdkSession, type SdkWsMessage } from './sdk-session.js';
import { PiSession, type PiWsMessage } from './pi-session.js';
import { checkReadiness } from './claudeInstaller.js';
import { registerCredentialRoutes } from './routes/credentials.js';
import { registerWorkspaceRoutes } from './routes/workspaces.js';
import { registerDiscoveryRoutes } from './routes/discovery.js';

/**
 * Type guard to check if a session is a Pi SDK session
 */
function isPiSession(session: unknown): session is PiSession {
  return session !== null && typeof session === 'object' && session instanceof PiSession;
}

/**
 * Type guard to check if a session is a Claude SDK session
 */
function isSdkSession(session: unknown): session is SdkSession {
  return session !== null && typeof session === 'object' && session instanceof SdkSession;
}

interface CreateSessionBody {
  agent?: AgentType;
  auth?: SessionAuth;
  env?: Record<string, string>;
  workspaceId?: string; // Optional workspace ID for workspace-backed sessions
  repoPath?: string; // Optional repo path for sessions without workspace (no worktree isolation)
  sdk?: SdkSessionConfig; // Claude SDK-specific configuration
  pi?: PiSessionConfig; // Pi SDK-specific configuration
}

/**
 * Registers all HTTP and WebSocket routes
 */
export async function registerRoutes(
  fastify: FastifyInstance,
  sessionManager: SessionManager,
  config: Config,
  database?: ApertureDatabase,
  credentialStore?: CredentialStore
) {
  // Register credential management routes
  await registerCredentialRoutes(fastify, credentialStore);

  // Register workspace management routes
  await registerWorkspaceRoutes(fastify, database || null);

  // Register discovery routes
  await registerDiscoveryRoutes(fastify);

  // Health check - always returns 200
  fastify.get('/healthz', async () => {
    return { status: 'ok' };
  });

  // Readiness check - verifies runtime, child spawn, and claude executable
  fastify.get('/readyz', async (_request, reply) => {
    const readiness = await checkReadiness();

    if (!readiness.ready) {
      return reply.code(503).send({
        status: 'not ready',
        errors: readiness.errors,
      });
    }

    return {
      status: 'ready',
      claudePath: readiness.claudePath,
    };
  });

  // Create a new session
  fastify.post<{ Body: CreateSessionBody }>(
    '/v1/sessions',
    async (request, reply) => {
      try {
        const { agent, auth, env, workspaceId, repoPath, sdk, pi } = request.body || {};

        const session = await sessionManager.createSession({ agent, auth, env, workspaceId, repoPath, sdk, pi });

        return reply.code(201).send({
          id: session.id,
          agent: session.agentType,
          status: session.getStatus(),
        });
      } catch (err) {
        const error = err as Error;
        request.log.error(error, 'Failed to create session');

        // Return 400 for validation errors, 500 for internal errors
        const statusCode = error.message.includes('not supported') ||
          error.message.includes('required') ||
          error.message.includes('Invalid') ||
          error.message.includes('not allowed') ||
          error.message.includes('not enabled') ||
          error.message.includes('not found')
          ? 400
          : 500;

        return reply.code(statusCode).send({
          error: 'Failed to create session',
          message: error.message,
        });
      }
    }
  );

  // Get session status
  fastify.get<{ Params: { id: string } }>(
    '/v1/sessions/:id',
    async (request, reply) => {
      const session = sessionManager.getSession(request.params.id);

      if (!session) {
        return reply.code(404).send({
          error: 'Session not found',
        });
      }

      return session.getStatus();
    }
  );

  // Delete a session
  fastify.delete<{ Params: { id: string } }>(
    '/v1/sessions/:id',
    async (request, reply) => {
      try {
        await sessionManager.deleteSession(request.params.id);
        return reply.code(204).send();
      } catch (err) {
        return reply.code(404).send({
          error: 'Session not found',
        });
      }
    }
  );

  // List all sessions
  fastify.get('/v1/sessions', async () => {
    const sessions = sessionManager.getAllSessions();
    return {
      sessions: sessions.map((s) => s.getStatus()),
      total: sessions.length,
    };
  });

  // Get message history for a session
  fastify.get<{ Params: { id: string }; Querystring: { limit?: number; offset?: number } }>(
    '/v1/sessions/:id/messages',
    async (request, reply) => {
      if (!database) {
        return reply.code(503).send({
          error: 'Message persistence not enabled',
        });
      }

      const sessionRecord = database.getSession(request.params.id);
      if (!sessionRecord) {
        return reply.code(404).send({
          error: 'Session not found',
        });
      }

      const limit = request.query.limit || 1000;
      const offset = request.query.offset || 0;

      const messages = database.getMessages(request.params.id, limit, offset);
      const total = database.getMessageCount(request.params.id);

      return {
        messages,
        total,
        limit,
        offset,
      };
    }
  );

  // Get all sessions including ended ones (from database)
  fastify.get<{ Querystring: { status?: string; userId?: string } }>(
    '/v1/sessions/history',
    async (request, reply) => {
      if (!database) {
        return reply.code(503).send({
          error: 'Session persistence not enabled',
        });
      }

      const userId = request.query.userId; // Future: extract from auth
      const sessions = database.getAllSessions(userId);

      if (request.query.status) {
        const filtered = sessions.filter((s) => s.status === request.query.status);
        return {
          sessions: filtered,
          total: filtered.length,
        };
      }

      return {
        sessions,
        total: sessions.length,
      };
    }
  );

  // Get all resumable SDK sessions
  fastify.get('/v1/sessions/resumable', async () => {
    const resumableSessions = sessionManager.getResumableSessions();
    return {
      sessions: resumableSessions,
      total: resumableSessions.length,
    };
  });

  // Connect to a session (restores SDK session if needed)
  fastify.post<{ Params: { id: string } }>(
    '/v1/sessions/:id/connect',
    async (request, reply) => {
      const sessionId = request.params.id;

      // Check if session exists in memory
      let session: SdkSession | PiSession | undefined = sessionManager.getSession(sessionId);
      let restored = false;

      if (!session) {
        // Try to restore from database
        try {
          const restoredSession = await sessionManager.restoreSession(sessionId);
          if (restoredSession) {
            session = restoredSession;
            restored = true;
          }
        } catch (err) {
          const error = err as Error;
          if (error.message.includes('not found') || error.message.includes('has no SDK session ID') || error.message.includes('has no Pi session path')) {
            return reply.code(404).send({
              error: 'Session not found or not resumable',
              message: error.message,
            });
          }
          return reply.code(500).send({
            error: 'Failed to restore session',
            message: error.message,
          });
        }
      }

      if (!session) {
        return reply.code(404).send({
          error: 'Session not found',
        });
      }

      return {
        id: session.id,
        agent: session.agentType,
        status: session.getStatus(),
        restored,
      };
    }
  );

  // ===========================================================================
  // SDK Session Endpoints
  // ===========================================================================

  // Get session configuration
  fastify.get<{ Params: { id: string } }>(
    '/v1/sessions/:id/config',
    async (request, reply) => {
      const session = sessionManager.getSession(request.params.id);
      if (!session) {
        return reply.code(404).send({ error: 'Session not found' });
      }
      return session.getConfig();
    }
  );

  // Update session configuration
  fastify.patch<{ Params: { id: string }; Body: Partial<SdkSessionConfig> }>(
    '/v1/sessions/:id/config',
    async (request, reply) => {
      const session = sessionManager.getSession(request.params.id);
      if (!session) {
        return reply.code(404).send({ error: 'Session not found' });
      }
      session.updateConfig(request.body);
      return { success: true, config: session.getConfig() };
    }
  );

  // Resume a session
  fastify.post<{ Params: { id: string }; Body: { messageId?: string; fork?: boolean } }>(
    '/v1/sessions/:id/resume',
    async (request, reply) => {
      const session = sessionManager.getSession(request.params.id);
      if (!session) {
        return reply.code(404).send({ error: 'Session not found' });
      }
      const { messageId, fork } = request.body || {};
      session.updateConfig({
        resume: session.sdkSessionId ?? undefined,
        resumeSessionAt: messageId,
        forkSession: fork,
      });
      return { success: true, sessionId: session.id };
    }
  );

  // Rewind files to checkpoint
  fastify.post<{ Params: { id: string }; Body: { messageId: string; dryRun?: boolean } }>(
    '/v1/sessions/:id/rewind',
    async (request, reply) => {
      const session = sessionManager.getSession(request.params.id);
      if (!session) {
        return reply.code(404).send({ error: 'Session not found' });
      }
      try {
        const result = await session.rewindFiles(request.body.messageId, request.body.dryRun);
        return result;
      } catch (err) {
        return reply.code(400).send({ error: (err as Error).message });
      }
    }
  );

  // Get checkpoint message IDs
  fastify.get<{ Params: { id: string } }>(
    '/v1/sessions/:id/checkpoints',
    async (request, reply) => {
      const session = sessionManager.getSession(request.params.id);
      if (!session) {
        return reply.code(404).send({ error: 'Session not found' });
      }
      return { checkpoints: session.getCheckpointMessageIds() };
    }
  );

  // Get MCP server status
  fastify.get<{ Params: { id: string } }>(
    '/v1/sessions/:id/mcp/status',
    async (request, reply) => {
      const session = sessionManager.getSession(request.params.id);
      if (!session) {
        return reply.code(404).send({ error: 'Session not found' });
      }
      try {
        const status = await session.getMcpServerStatus();
        return { servers: status };
      } catch (err) {
        return reply.code(400).send({ error: (err as Error).message });
      }
    }
  );

  // Update MCP servers
  fastify.post<{ Params: { id: string }; Body: { servers: Record<string, McpServerConfig> } }>(
    '/v1/sessions/:id/mcp/servers',
    async (request, reply) => {
      const session = sessionManager.getSession(request.params.id);
      if (!session) {
        return reply.code(404).send({ error: 'Session not found' });
      }
      try {
        const result = await session.setMcpServers(request.body.servers);
        return result;
      } catch (err) {
        return reply.code(400).send({ error: (err as Error).message });
      }
    }
  );

  // Get account info
  fastify.get<{ Params: { id: string } }>(
    '/v1/sessions/:id/account',
    async (request, reply) => {
      const session = sessionManager.getSession(request.params.id);
      if (!session) {
        return reply.code(404).send({ error: 'Session not found' });
      }
      try {
        const info = await session.getAccountInfo();
        return info;
      } catch (err) {
        return reply.code(400).send({ error: (err as Error).message });
      }
    }
  );

  // Get supported models
  fastify.get<{ Params: { id: string } }>(
    '/v1/sessions/:id/models',
    async (request, reply) => {
      const session = sessionManager.getSession(request.params.id);
      if (!session) {
        return reply.code(404).send({ error: 'Session not found' });
      }
      try {
        const models = await session.getSupportedModels();
        return { models };
      } catch (err) {
        return reply.code(400).send({ error: (err as Error).message });
      }
    }
  );

  // Get supported commands/skills
  fastify.get<{ Params: { id: string } }>(
    '/v1/sessions/:id/commands',
    async (request, reply) => {
      const session = sessionManager.getSession(request.params.id);
      if (!session) {
        return reply.code(404).send({ error: 'Session not found' });
      }
      try {
        const commands = await session.getSupportedCommands();
        return { commands };
      } catch (err) {
        return reply.code(400).send({ error: (err as Error).message });
      }
    }
  );

  // Set permission mode
  fastify.post<{ Params: { id: string }; Body: { mode: PermissionMode } }>(
    '/v1/sessions/:id/permission-mode',
    async (request, reply) => {
      const session = sessionManager.getSession(request.params.id);
      if (!session) {
        return reply.code(404).send({ error: 'Session not found' });
      }
      try {
        await session.setPermissionMode(request.body.mode);
        return { success: true, mode: request.body.mode };
      } catch (err) {
        return reply.code(400).send({ error: (err as Error).message });
      }
    }
  );

  // Set model
  fastify.post<{ Params: { id: string }; Body: { model?: string } }>(
    '/v1/sessions/:id/model',
    async (request, reply) => {
      const session = sessionManager.getSession(request.params.id);
      if (!session) {
        return reply.code(404).send({ error: 'Session not found' });
      }
      try {
        await session.setModel(request.body.model);
        return { success: true, model: request.body.model };
      } catch (err) {
        return reply.code(400).send({ error: (err as Error).message });
      }
    }
  );

  // Set thinking token limit
  fastify.post<{ Params: { id: string }; Body: { tokens: number | null } }>(
    '/v1/sessions/:id/thinking-tokens',
    async (request, reply) => {
      const session = sessionManager.getSession(request.params.id);
      if (!session) {
        return reply.code(404).send({ error: 'Session not found' });
      }
      try {
        await session.setMaxThinkingTokens(request.body.tokens);
        return { success: true };
      } catch (err) {
        return reply.code(400).send({ error: (err as Error).message });
      }
    }
  );

  // Get session result/usage
  fastify.get<{ Params: { id: string } }>(
    '/v1/sessions/:id/result',
    async (request, reply) => {
      const session = sessionManager.getSession(request.params.id);
      if (!session) {
        return reply.code(404).send({ error: 'Session not found' });
      }
      const result = session.getLastResult();
      return result || { error: 'No result available' };
    }
  );

  // Get permission denials
  fastify.get<{ Params: { id: string } }>(
    '/v1/sessions/:id/permission-denials',
    async (request, reply) => {
      const session = sessionManager.getSession(request.params.id);
      if (!session) {
        return reply.code(404).send({ error: 'Session not found' });
      }
      return { denials: session.getPermissionDenials() };
    }
  );

  // Interrupt current query
  fastify.post<{ Params: { id: string } }>(
    '/v1/sessions/:id/interrupt',
    async (request, reply) => {
      const session = sessionManager.getSession(request.params.id);
      if (!session) {
        return reply.code(404).send({ error: 'Session not found' });
      }
      try {
        await session.interrupt();
        return { success: true };
      } catch (err) {
        return reply.code(400).send({ error: (err as Error).message });
      }
    }
  );

  // Server-Sent Events stream of session messages
  fastify.get<{ Params: { id: string } }>(
    '/v1/sessions/:id/events',
    async (request, reply) => {
      const session = sessionManager.getSession(request.params.id);

      if (!session) {
        return reply.code(404).send({
          error: 'Session not found',
        });
      }

      // Set up SSE
      reply.raw.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      });

      // Send initial connection event
      reply.raw.write(`data: ${JSON.stringify({ type: 'connected' })}\n\n`);

      // Forward session messages as SSE events
      const messageHandler = (message: unknown) => {
        reply.raw.write(`data: ${JSON.stringify(message)}\n\n`);
      };

      const errorHandler = (error: Error) => {
        reply.raw.write(
          `data: ${JSON.stringify({ type: 'error', message: error.message })}\n\n`
        );
      };

      const exitHandler = ({ code, signal }: { code: number | null; signal: string | null }) => {
        reply.raw.write(
          `data: ${JSON.stringify({ type: 'exit', code, signal })}\n\n`
        );
        reply.raw.end();
      };

      session.on('message', messageHandler);
      session.on('error', errorHandler);
      session.on('exit', exitHandler);

      // Clean up on client disconnect
      request.raw.on('close', () => {
        session.off('message', messageHandler);
        session.off('error', errorHandler);
        session.off('exit', exitHandler);
      });
    }
  );

  // WebSocket endpoint for bidirectional communication
  fastify.get<{ Params: { id: string } }>(
    '/v1/sessions/:id/ws',
    { websocket: true },
    (socket, request) => {
      const sessionId = (request.params as { id: string }).id;
      const session = sessionManager.getSession(sessionId);

      if (!session) {
        socket.close(1008, 'Session not found');
        return;
      }

      // Forward messages from session to WebSocket
      const messageHandler = (message: unknown) => {
        try {
          socket.send(JSON.stringify(message));
        } catch (err) {
          request.log.error(err, 'Failed to send WebSocket message');
        }
      };

      // Handle session/update notifications
      const sessionUpdateHandler = (params: unknown) => {
        try {
          socket.send(JSON.stringify({
            jsonrpc: '2.0',
            method: 'session/update',
            params,
          }));
        } catch (err) {
          request.log.error(err, 'Failed to send session update');
        }
      };

      // Handle permission requests
      const permissionRequestHandler = (request: {
        id: string | number;
        toolCallId: string;
        toolCall: unknown;
        options: unknown[];
      }) => {
        try {
          socket.send(JSON.stringify({
            jsonrpc: '2.0',
            method: 'session/request_permission',
            params: {
              toolCallId: request.toolCallId,
              toolCall: request.toolCall,
              options: request.options,
            },
          }));
        } catch (err) {
          console.error('Failed to send permission request', err);
        }
      };

      const exitHandler = ({ code, signal }: { code: number | null; signal: string | null }) => {
        socket.send(
          JSON.stringify({
            jsonrpc: '2.0',
            method: 'session/exit',
            params: { code, signal },
          })
        );
        socket.close(1000, 'Session ended');
      };

      session.on('message', messageHandler);
      session.on('session_update', sessionUpdateHandler);
      session.on('permission_request', permissionRequestHandler);
      session.on('exit', exitHandler);

      // Handle SDK-specific messages (Claude SDK)
      const sdkMessageHandler = (message: SdkWsMessage) => {
        try {
          socket.send(JSON.stringify(message));
        } catch (err) {
          request.log.error(err, 'Failed to send SDK WebSocket message');
        }
      };

      // Handle Pi SDK-specific messages
      const piMessageHandler = (message: PiWsMessage) => {
        try {
          socket.send(JSON.stringify(message));
        } catch (err) {
          request.log.error(err, 'Failed to send Pi WebSocket message');
        }
      };

      // Register handlers based on session type
      if (isSdkSession(session)) {
        session.on('sdk_message', sdkMessageHandler);
      } else if (isPiSession(session)) {
        session.on('pi_message', piMessageHandler);
      }

      // Handle messages from WebSocket (frontend) to agent
      socket.on('message', async (data: Buffer) => {
        try {
          const text = data.toString('utf-8');

          // Check message size
          if (text.length > config.maxMessageSizeBytes) {
            socket.send(
              JSON.stringify({
                jsonrpc: '2.0',
                error: {
                  code: -32000,
                  message: `Message exceeds max size of ${config.maxMessageSizeBytes} bytes`,
                },
                id: null,
              })
            );
            return;
          }

          // Parse the incoming message
          let parsed: unknown;
          try {
            parsed = JSON.parse(text);
          } catch {
            throw new Error('Invalid JSON');
          }

          const obj = parsed as Record<string, unknown>;

          // Handle message types
          if (obj.type === 'user_message' && typeof obj.content === 'string') {
            session.sendPrompt(obj.content).catch((err) => {
              request.log.error(err, 'Failed to send prompt');
              socket.send(JSON.stringify({
                jsonrpc: '2.0',
                method: 'session/error',
                params: { message: (err as Error).message },
              }));
            });
          } else if (obj.type === 'permission_response') {
            const toolCallId = obj.toolCallId as string;
            const optionId = obj.optionId as string;
            const answers = obj.answers as Record<string, string> | undefined;

            console.log('[WS] Received permission_response:', JSON.stringify({ toolCallId, optionId, answers }, null, 2));

            if (optionId) {
              await session.respondToPermission(toolCallId, optionId, answers);
            } else {
              await session.cancelPermission(toolCallId);
            }
          } else if (obj.type === 'cancel') {
            await session.cancelPrompt();
          } else if (obj.type === 'interrupt') {
            await session.interrupt();
          } else if (obj.type === 'set_permission_mode' && typeof obj.mode === 'string') {
            await session.setPermissionMode(obj.mode as PermissionMode);
          } else if (obj.type === 'set_model') {
            await session.setModel(obj.model as string | undefined);
          } else if (obj.type === 'set_thinking_tokens') {
            await session.setMaxThinkingTokens(obj.tokens as number | null);
          } else if (obj.type === 'rewind_files' && typeof obj.messageId === 'string') {
            const result = await session.rewindFiles(obj.messageId, obj.dryRun as boolean | undefined);
            socket.send(JSON.stringify({
              jsonrpc: '2.0',
              method: 'session/rewind_result',
              params: result,
            }));
          } else if (obj.type === 'get_mcp_status') {
            try {
              const status = await session.getMcpServerStatus();
              socket.send(JSON.stringify({
                jsonrpc: '2.0',
                method: 'session/mcp_status',
                params: { servers: status },
              }));
            } catch (err) {
              socket.send(JSON.stringify({
                jsonrpc: '2.0',
                method: 'session/mcp_status',
                params: { error: (err as Error).message },
              }));
            }
          } else if (obj.type === 'set_mcp_servers' && obj.servers) {
            try {
              const result = await session.setMcpServers(obj.servers as Record<string, McpServerConfig>);
              socket.send(JSON.stringify({
                jsonrpc: '2.0',
                method: 'session/mcp_servers_updated',
                params: result,
              }));
            } catch (err) {
              socket.send(JSON.stringify({
                jsonrpc: '2.0',
                method: 'session/mcp_servers_updated',
                params: { error: (err as Error).message },
              }));
            }
          } else if (obj.type === 'get_account_info') {
            try {
              const info = await session.getAccountInfo();
              socket.send(JSON.stringify({
                jsonrpc: '2.0',
                method: 'session/account_info',
                params: info,
              }));
            } catch (err) {
              socket.send(JSON.stringify({
                jsonrpc: '2.0',
                method: 'session/account_info',
                params: { error: (err as Error).message },
              }));
            }
          } else if (obj.type === 'get_supported_models') {
            try {
              const models = await session.getSupportedModels();
              socket.send(JSON.stringify({
                jsonrpc: '2.0',
                method: 'session/supported_models',
                params: { models },
              }));
            } catch (err) {
              socket.send(JSON.stringify({
                jsonrpc: '2.0',
                method: 'session/supported_models',
                params: { error: (err as Error).message },
              }));
            }
          } else if (obj.type === 'get_supported_commands') {
            try {
              const commands = await session.getSupportedCommands();
              socket.send(JSON.stringify({
                jsonrpc: '2.0',
                method: 'session/supported_commands',
                params: { commands },
              }));
            } catch (err) {
              socket.send(JSON.stringify({
                jsonrpc: '2.0',
                method: 'session/supported_commands',
                params: { error: (err as Error).message },
              }));
            }
          } else if (obj.type === 'update_config' && obj.config) {
            if (isSdkSession(session)) {
              session.updateConfig(obj.config as Partial<SdkSessionConfig>);
              socket.send(JSON.stringify({
                jsonrpc: '2.0',
                method: 'session/config_updated',
                params: { config: session.getConfig() },
              }));
            }
          }
          // ==================== Pi SDK Specific Handlers ====================
          else if (obj.type === 'pi_steer' && typeof obj.content === 'string') {
            // Steer the Pi agent mid-run (interrupt and redirect)
            if (isPiSession(session)) {
              await session.steer(obj.content);
            }
          } else if (obj.type === 'pi_follow_up' && typeof obj.content === 'string') {
            // Queue a follow-up message for when the Pi agent finishes
            if (isPiSession(session)) {
              await session.followUp(obj.content);
            }
          } else if (obj.type === 'pi_compact') {
            // Compact the conversation context (Pi SDK only)
            if (isPiSession(session)) {
              await session.compact(obj.instructions as string | undefined);
            }
          } else if (obj.type === 'pi_fork' && typeof obj.entryId === 'string') {
            // Fork the session at a specific entry (Pi SDK only)
            if (isPiSession(session)) {
              await session.fork(obj.entryId);
            }
          } else if (obj.type === 'pi_navigate' && typeof obj.entryId === 'string') {
            // Navigate to a specific entry in the session tree (Pi SDK only)
            if (isPiSession(session)) {
              await session.navigateTree(obj.entryId);
            }
          } else if (obj.type === 'pi_set_model') {
            // Set model (Pi SDK only - supports multiple providers)
            if (isPiSession(session) && obj.provider && obj.modelId) {
              await session.setModel(obj.provider as string, obj.modelId as string);
            }
          } else if (obj.type === 'pi_cycle_model') {
            // Cycle to next model (Pi SDK only)
            if (isPiSession(session)) {
              const result = await session.cycleModel();
              socket.send(JSON.stringify({
                jsonrpc: '2.0',
                method: 'pi/model_cycled',
                params: result,
              }));
            }
          } else if (obj.type === 'pi_set_thinking_level') {
            // Set thinking level (Pi SDK only)
            if (isPiSession(session) && obj.level) {
              await session.setThinkingLevel(obj.level as string);
              socket.send(JSON.stringify({
                jsonrpc: '2.0',
                method: 'pi/thinking_level_set',
                params: { level: obj.level },
              }));
            }
          } else if (obj.type === 'pi_cycle_thinking') {
            // Cycle thinking level (Pi SDK only)
            if (isPiSession(session)) {
              const newLevel = await session.cycleThinkingLevel();
              socket.send(JSON.stringify({
                jsonrpc: '2.0',
                method: 'pi/thinking_level_cycled',
                params: { level: newLevel },
              }));
            }
          } else if (obj.type === 'pi_new_session') {
            // Start a new session (Pi SDK only - clears context)
            if (isPiSession(session)) {
              await session.newSession();
            }
          } else if (obj.type === 'pi_get_tree') {
            // Get session tree (Pi SDK only)
            if (isPiSession(session)) {
              const tree = await session.getSessionTree();
              socket.send(JSON.stringify({
                jsonrpc: '2.0',
                method: 'pi/session_tree',
                params: { tree },
              }));
            }
          } else if (obj.type === 'pi_get_forkable') {
            // Get forkable entries (Pi SDK only)
            if (isPiSession(session)) {
              const entries = await session.getForkableEntries();
              socket.send(JSON.stringify({
                jsonrpc: '2.0',
                method: 'pi/forkable_entries',
                params: { entries },
              }));
            }
          } else if (obj.type === 'pi_get_stats') {
            // Get session stats (Pi SDK only)
            if (isPiSession(session)) {
              const stats = session.getStats();
              socket.send(JSON.stringify({
                jsonrpc: '2.0',
                method: 'pi/session_stats',
                params: { stats },
              }));
            }
          } else if (obj.type === 'pi_get_models') {
            // Get available models (Pi SDK only)
            if (isPiSession(session)) {
              const models = await session.getAvailableModels();
              socket.send(JSON.stringify({
                jsonrpc: '2.0',
                method: 'pi/available_models',
                params: { models },
              }));
            }
          } else {
            throw new Error('Unknown message type');
          }
        } catch (err) {
          const error = err as Error;
          request.log.error(error, 'Failed to process WebSocket message');
          socket.send(
            JSON.stringify({
              jsonrpc: '2.0',
              error: {
                code: -32700,
                message: `Parse error: ${error.message}`,
              },
              id: null,
            })
          );
        }
      });

      // Clean up on disconnect
      socket.on('close', () => {
        session.off('message', messageHandler);
        session.off('session_update', sessionUpdateHandler);
        session.off('permission_request', permissionRequestHandler);
        session.off('exit', exitHandler);
        if (isSdkSession(session)) {
          session.off('sdk_message', sdkMessageHandler);
        }
        if (isPiSession(session)) {
          session.off('pi_message', piMessageHandler);
        }
      });
    }
  );
}
