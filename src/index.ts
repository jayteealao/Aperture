import Fastify from 'fastify';
import fastifyWebsocket from '@fastify/websocket';
import fastifyCors from '@fastify/cors';
import fastifyRateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { loadConfig } from './config.js';
import { SessionManager } from './sessionManager.js';
import { CredentialStore } from './credentials.js';
import { ApertureDatabase } from './database.js';
import { createAuthMiddleware, redactHeaders } from './auth.js';
import { registerRoutes } from './routes.js';
import { verifyClaudeInstallation } from './claudeInstaller.js';

async function main() {
  // Load configuration (fails fast if APERTURE_API_TOKEN is missing)
  const config = loadConfig();

  console.log('🚀 Starting Aperture Gateway...');
  console.log(`📡 Port: ${config.port}`);
  console.log(`🔒 Authentication: enabled`);
  console.log(`🏠 Hosted mode: ${config.hostedMode ? 'enabled' : 'disabled'}`);
  if (config.autoInstallClaude) {
    console.log('🔧 Auto-install Claude CLI: enabled');
  }

  // Initialize credential store if master key is provided
  let credentialStore: CredentialStore | undefined;
  if (config.credentialsMasterKey) {
    console.log('🔐 Initializing credential store...');
    credentialStore = new CredentialStore(
      config.credentialsMasterKey,
      config.credentialsStorePath
    );
    await credentialStore.init();
  } else {
    console.warn('⚠️  Credential storage disabled (no CREDENTIALS_MASTER_KEY set)');
    console.warn('⚠️  Only inline API keys can be used for sessions');
  }

  // Initialize database
  console.log('💾 Initializing database...');
  const database = new ApertureDatabase(config.databasePath);
  const migrationsDir = join(dirname(fileURLToPath(import.meta.url)), 'migrations');
  database.migrate(migrationsDir);
  console.log('✅ Database initialized');

  // Verify Claude Code CLI installation (with optional auto-install)
  // Prefer explicit config over auto-detection (auto-detection returns Unix-style paths on Windows/Git Bash)
  const autoDetectedClaudePath = await verifyClaudeInstallation(config.autoInstallClaude);
  const claudePath = config.claudeCodeExecutable || autoDetectedClaudePath;
  if (config.claudeCodeExecutable) {
    console.log(`✓ Using configured Claude Code CLI: ${config.claudeCodeExecutable}`);
  }

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

  // Serve static files from frontend build output
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  await fastify.register(fastifyStatic, {
    root: join(__dirname, '..', 'web', 'dist'),
    prefix: '/',
  });

  // Create session manager
  const sessionManager = new SessionManager(config, database, claudePath, credentialStore);

  // Restore sessions from database
  await sessionManager.restoreSessions();

  // Register authentication middleware for all routes except health checks and static files
  fastify.addHook('onRequest', async (request, reply) => {
    // Skip auth for health checks
    if (request.url === '/healthz' || request.url === '/readyz') {
      return;
    }
    // Skip auth for static files (frontend)
    if (request.url === '/' || request.url.startsWith('/assets/')) {
      return;
    }

    const authMiddleware = createAuthMiddleware(config.apiToken);
    await authMiddleware(request, reply);
  });

  // Register routes
  await registerRoutes(fastify, sessionManager, config, database, credentialStore);

  // Graceful shutdown
  const shutdown = async () => {
    console.log('\n🛑 Shutting down...');
    await sessionManager.terminateAll();
    database.close();
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
