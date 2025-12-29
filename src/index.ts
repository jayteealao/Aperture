import fastify from 'fastify';
import fastifyWebsocket from '@fastify/websocket';
import cors from '@fastify/cors';
import { config } from './config';
import { authMiddleware } from './auth';
import { registerRoutes } from './routes';
import { CliManager } from './cli';

async function main() {
  const server = fastify({
    logger: config.NODE_ENV === 'development',
    bodyLimit: config.MAX_MESSAGE_SIZE,
  });

  // Register plugins
  await server.register(cors);
  await server.register(fastifyWebsocket);

  // Auth Middleware
  // We apply it globally, but exclude /healthz and /readyz maybe?
  // Or just apply to /v1
  server.addHook('preHandler', async (req, reply) => {
    if (req.url === '/healthz' || req.url === '/readyz') return;
    await authMiddleware(req, reply);
  });

  // Register Routes
  await registerRoutes(server);

  // Initialize CLI Manager (check/install)
  // We can do this in background or await it.
  // Prompt says: "At session creation (or at server boot; your choice)"
  // Server boot is safer to ensure it's ready.
  console.log('Initializing Claude Code CLI...');
  try {
    await CliManager.getInstance().ensureClaudeCodeInstalled();
  } catch (e) {
    console.error('Failed to initialize Claude Code CLI:', e);
    // Proceed anyway as per requirements (fallback to vendored)
  }

  // Start server
  try {
    await server.listen({ port: config.PORT, host: config.HOST });
    console.log(`Server listening at http://${config.HOST}:${config.PORT}`);
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
}

main();
