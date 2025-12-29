import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { SessionManager } from './sessionManager.js';
import type { Config } from './config.js';
import type { SessionAuth, AgentType } from './agents/index.js';
import type { CredentialStore } from './credentials.js';
import { parseMessage, validateJsonRpcMessage, type JsonRpcMessage } from './jsonrpc.js';
import { checkReadiness } from './claudeInstaller.js';
import { registerCredentialRoutes } from './routes/credentials.js';

interface CreateSessionBody {
  agent?: AgentType;
  auth?: SessionAuth;
  env?: Record<string, string>;
}

interface SendRpcBody {
  message: unknown;
}

/**
 * Registers all HTTP and WebSocket routes
 */
export async function registerRoutes(
  fastify: FastifyInstance,
  sessionManager: SessionManager,
  config: Config,
  credentialStore?: CredentialStore
) {
  // Register credential management routes
  await registerCredentialRoutes(fastify, credentialStore);
  // Health check - always returns 200
  fastify.get('/healthz', async () => {
    return { status: 'ok' };
  });

  // Readiness check - verifies runtime, child spawn, and claude executable
  fastify.get('/readyz', async (request, reply) => {
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
        const { agent, auth, env } = request.body || {};

        const session = await sessionManager.createSession({ agent, auth, env });

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

  // Send JSON-RPC message to a session
  fastify.post<{ Params: { id: string }; Body: SendRpcBody }>(
    '/v1/sessions/:id/rpc',
    async (request, reply) => {
      const session = sessionManager.getSession(request.params.id);

      if (!session) {
        return reply.code(404).send({
          error: 'Session not found',
        });
      }

      const { message } = request.body;

      // Validate JSON-RPC message
      if (!validateJsonRpcMessage(message)) {
        return reply.code(400).send({
          error: 'Invalid JSON-RPC message',
        });
      }

      try {
        const response = await session.send(message as JsonRpcMessage);

        if (response) {
          // Request with id - return response
          return response;
        } else {
          // Notification - return 202 Accepted
          return reply.code(202).send({
            status: 'accepted',
          });
        }
      } catch (err) {
        const error = err as Error;
        request.log.error(error, 'Failed to send RPC message');
        return reply.code(500).send({
          error: 'Failed to send message',
          message: error.message,
        });
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
      const messageHandler = (message: JsonRpcMessage) => {
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
    (connection, request) => {
      const sessionId = (request.params as { id: string }).id;
      const session = sessionManager.getSession(sessionId);

      if (!session) {
        connection.socket.close(1008, 'Session not found');
        return;
      }

      // Forward messages from child to WebSocket
      const messageHandler = (message: JsonRpcMessage) => {
        try {
          connection.socket.send(JSON.stringify(message));
        } catch (err) {
          request.log.error(err, 'Failed to send WebSocket message');
        }
      };

      const exitHandler = ({ code, signal }: { code: number | null; signal: string | null }) => {
        connection.socket.send(
          JSON.stringify({
            jsonrpc: '2.0',
            method: 'session/exit',
            params: { code, signal },
          })
        );
        connection.socket.close(1000, 'Session ended');
      };

      session.on('message', messageHandler);
      session.on('exit', exitHandler);

      // Handle messages from WebSocket to child
      connection.socket.on('message', async (data: Buffer) => {
        try {
          const text = data.toString('utf-8');

          // Check message size
          if (text.length > config.maxMessageSizeBytes) {
            connection.socket.send(
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

          const message = parseMessage(text);
          await session.send(message);
        } catch (err) {
          const error = err as Error;
          request.log.error(error, 'Failed to process WebSocket message');
          connection.socket.send(
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
      connection.socket.on('close', () => {
        session.off('message', messageHandler);
        session.off('exit', exitHandler);
      });
    }
  );
}
