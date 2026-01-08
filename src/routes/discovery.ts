import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { discoverRepositories } from '../discovery/repoDiscovery.js';
import { validatePathExists } from '../discovery/pathValidation.js';

interface ScanBody {
  path: string;
}

/**
 * Register discovery routes
 */
export async function registerDiscoveryRoutes(fastify: FastifyInstance) {
  /**
   * POST /v1/discovery/scan
   * Scan a directory for git repositories
   */
  fastify.post<{
    Body: ScanBody;
  }>('/v1/discovery/scan', async (request: FastifyRequest<{ Body: ScanBody }>, reply: FastifyReply) => {
    try {
      const { path } = request.body;

      // Validate input
      if (!path || typeof path !== 'string') {
        return reply.status(400).send({
          error: 'INVALID_REQUEST',
          message: 'Missing or invalid field: path',
        });
      }

      // Validate path exists
      let normalizedPath: string;
      try {
        normalizedPath = await validatePathExists(path);
      } catch (error) {
        return reply.status(400).send({
          error: 'INVALID_PATH',
          message: `Path does not exist or is not accessible: ${path}`,
        });
      }

      // Discover repositories
      const result = await discoverRepositories(normalizedPath);

      return reply.status(200).send(result);
    } catch (error) {
      console.error('[Discovery API] Scan error:', error);
      return reply.status(500).send({
        error: 'SCAN_FAILED',
        message: 'Failed to scan for repositories',
      });
    }
  });
}
