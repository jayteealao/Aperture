import Fastify from 'fastify';
import fastifyWebsocket from '@fastify/websocket';
import fastifyCors from '@fastify/cors';
import fastifyRateLimit from '@fastify/rate-limit';
import { loadConfig } from './config.js';
import { SessionManager } from './sessionManager.js';
import { createAuthMiddleware, redactHeaders } from './auth.js';
import { registerRoutes } from './routes.js';
import { verifyClaudeInstallation } from './claudeInstaller.js';

async function main() {
  // Load configuration (fails fast if APERTURE_API_TOKEN is missing)
  const config = loadConfig();

  console.log('🚀 Starting Aperture Gateway...');
  console.log(`📡 Port: ${config.port}`);
  console.log(`🔒 Authentication: enabled`);

  // Verify Claude Code CLI installation
  const claudePath = await verifyClaudeInstallation();

  // Create Fastify instance
  const fastify = Fastify({
    logger: {
      level: config.logLevel,
      serializers: {
        req(request) {
          return {
            method: request.method,
            url: request.url,
            headers: redactHeaders(request.headers as Record<string, unknown>),
          };
        },
      },
    },
  });

  // Register plugins
  await fastify.register(fastifyWebsocket);
  await fastify.register(fastifyCors, {
    origin: true, // Adjust in production
  });

  await fastify.register(fastifyRateLimit, {
    max: config.rateLimitMax,
    timeWindow: config.rateLimitWindowMs,
  });

  // Create session manager
  const sessionManager = new SessionManager(config, claudePath);

  // Register authentication middleware for all routes except health checks
  fastify.addHook('onRequest', async (request, reply) => {
    // Skip auth for health checks
    if (request.url === '/healthz' || request.url === '/readyz') {
      return;
    }

    const authMiddleware = createAuthMiddleware(config.apiToken);
    await authMiddleware(request, reply);
  });

  // Register routes
  await registerRoutes(fastify, sessionManager, config);

  // Graceful shutdown
  const shutdown = async () => {
    console.log('\n🛑 Shutting down...');
    await sessionManager.terminateAll();
    await fastify.close();
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  // Start server
  try {
    await fastify.listen({
      port: config.port,
      host: config.host,
    });

    console.log('✅ Aperture Gateway is running');
    console.log(`📍 Listening on http://${config.host}:${config.port}`);
    console.log(`📊 Max sessions: ${config.maxConcurrentSessions}`);
    console.log(`⏱️  Session idle timeout: ${config.sessionIdleTimeoutMs}ms`);
    console.log(`📦 Max message size: ${config.maxMessageSizeBytes} bytes`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
