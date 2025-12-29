import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { SessionManager } from './sessionManager';
import { JsonRpcMessage, parseJsonRpcMessage, formatJsonRpcMessage } from './jsonrpc';
import { z } from 'zod';
import { CliManager } from './cli';

// Helper to validate request body
const CreateSessionSchema = z.object({
  apiKey: z.string().optional(),
});

export async function registerRoutes(fastify: FastifyInstance) {
  const sessionManager = SessionManager.getInstance();
  const cliManager = CliManager.getInstance();

  // Health
  fastify.get('/healthz', async () => {
    return { status: 'ok' };
  });

  fastify.get('/readyz', async (req, reply) => {
    try {
      // Check if we can execute node (basic runtime check)
      // Check if we have located/installed claude code
      // We don't want to trigger install here if it takes too long,
      // but we should check if we are "ready" to spawn.
      // If install is in progress, maybe we are not ready?
      // For now, simple check:
      return {
        status: 'ready',
        claudeExecutable: cliManager.getExecutablePath() || 'pending/default',
        sessions: sessionManager.stats
      };
    } catch (e) {
      reply.code(503).send({ status: 'not_ready', error: String(e) });
    }
  });

  // Create Session
  fastify.post('/v1/sessions', async (req, reply) => {
    const body = CreateSessionSchema.safeParse(req.body);
    if (!body.success) {
      return reply.code(400).send({ error: 'Invalid body', details: body.error });
    }

    try {
      const session = await sessionManager.createSession({ apiKey: body.data.apiKey });
      return { id: session.id };
    } catch (e) {
      return reply.code(500).send({ error: String(e) });
    }
  });

  // Terminate Session
  fastify.delete('/v1/sessions/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const success = sessionManager.terminateSession(id);
    if (!success) {
      return reply.code(404).send({ error: 'Session not found' });
    }
    return { status: 'terminated' };
  });

  // RPC Call (HTTP)
  fastify.post('/v1/sessions/:id/rpc', async (req, reply) => {
    const { id } = req.params as { id: string };
    const session = sessionManager.getSession(id);
    if (!session) {
      return reply.code(404).send({ error: 'Session not found' });
    }

    const message = req.body as JsonRpcMessage;
    // Basic validation
    if (!message || message.jsonrpc !== '2.0') {
      return reply.code(400).send({ error: 'Invalid JSON-RPC' });
    }

    try {
      const response = await session.sendRpc(message);
      if (response) {
        return response;
      } else {
        return reply.code(202).send({ status: 'accepted' }); // Notification
      }
    } catch (e) {
        // If it was a timeout or internal error
      return reply.code(500).send({ error: String(e) });
    }
  });

  // SSE Events
  fastify.get('/v1/sessions/:id/events', async (req, reply) => {
    const { id } = req.params as { id: string };
    const session = sessionManager.getSession(id);
    if (!session) {
      return reply.code(404).send({ error: 'Session not found' });
    }

    // Set headers for SSE
    reply.raw.setHeader('Content-Type', 'text/event-stream');
    reply.raw.setHeader('Cache-Control', 'no-cache');
    reply.raw.setHeader('Connection', 'keep-alive');
    reply.raw.flushHeaders();

    const handler = (line: string) => {
      reply.raw.write(`data: ${line}\n\n`);
    };

    const closeHandler = () => {
        reply.raw.write('event: error\ndata: Session closed\n\n');
        reply.raw.end();
    };

    session.on('output', handler);
    session.on('close', closeHandler);

    // Clean up listener when client disconnects
    req.raw.on('close', () => {
      session.off('output', handler);
      session.off('close', closeHandler);
    });
  });

  // Login Assist (Instructions)
  fastify.post('/v1/sessions/:id/login', async (req, reply) => {
      const { id } = req.params as { id: string };
      const session = sessionManager.getSession(id);
      if (!session) {
          return reply.code(404).send({ error: 'Session not found' });
      }

      return {
          message: "To authenticate with a subscription (headless):",
          steps: [
              "1. Exec into the container: docker exec -it <container_id> /bin/bash",
              "2. Run: claude login",
              "3. Follow the URL to authenticate in your browser.",
              "4. Copy the code back to the terminal.",
              "5. Verify with: claude user"
          ],
          note: "This state is persisted in the Docker volume mounted at ~/.claude"
      };
  });

  // WebSocket
  fastify.register(async (instance) => {
    instance.get('/v1/sessions/:id/ws', { websocket: true }, (connection: any, req) => {
      const { id } = (req.params as { id: string });
      const session = sessionManager.getSession(id);

      if (!session) {
        connection.socket.close(1008, 'Session not found');
        return;
      }

      const outputHandler = (line: string) => {
        if (connection.socket.readyState === connection.socket.OPEN) {
          connection.socket.send(line);
        }
      };

      const closeHandler = () => {
          if (connection.socket.readyState === connection.socket.OPEN) {
              connection.socket.close(1000, 'Session ended');
          }
      };

      session.on('output', outputHandler);
      session.on('close', closeHandler);

      connection.socket.on('message', async (data: any) => {
        try {
          const text = data.toString();
          const message = parseJsonRpcMessage(text);
          if (message) {
             session.sendRaw(message);
          }
        } catch (e) {
          console.error('WS Message error', e);
        }
      });

      connection.socket.on('close', () => {
        session.off('output', outputHandler);
        session.off('close', closeHandler);
      });
    });
  });
}
