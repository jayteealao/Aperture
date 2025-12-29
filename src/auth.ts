import type { FastifyRequest, FastifyReply } from 'fastify';

/**
 * Bearer token authentication middleware
 * Supports both Authorization header and query param (for WebSocket)
 */
export function createAuthMiddleware(apiToken: string) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const authHeader = request.headers.authorization;
    const queryToken = (request.query as Record<string, string>)?.token;

    // Check Authorization header first
    if (authHeader) {
      const parts = authHeader.split(' ');
      if (parts.length !== 2 || parts[0] !== 'Bearer') {
        return reply.code(401).send({
          error: 'Unauthorized',
          message: 'Invalid Authorization header format. Expected: Bearer <token>',
        });
      }

      const token = parts[1];
      if (token !== apiToken) {
        return reply.code(401).send({
          error: 'Unauthorized',
          message: 'Invalid token',
        });
      }

      // Token is valid, continue
      return;
    }

    // Fallback to query param (for WebSocket connections)
    if (queryToken) {
      if (queryToken !== apiToken) {
        return reply.code(401).send({
          error: 'Unauthorized',
          message: 'Invalid token',
        });
      }

      // Token is valid, continue
      return;
    }

    // No auth provided
    return reply.code(401).send({
      error: 'Unauthorized',
      message: 'Missing Authorization header or token query parameter',
    });
  };
}

/**
 * Redacts sensitive headers for logging
 */
export function redactHeaders(headers: Record<string, unknown>): Record<string, unknown> {
  const redacted = { ...headers };
  if (redacted.authorization) {
    redacted.authorization = '[REDACTED]';
  }
  return redacted;
}
