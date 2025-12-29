import { describe, it, expect, vi } from 'vitest';
import { createAuthMiddleware, redactHeaders } from '../src/auth.js';
import type { FastifyRequest, FastifyReply } from 'fastify';

describe('Authentication middleware', () => {
  const mockReply = () => {
    const reply = {
      code: vi.fn().mockReturnThis(),
      send: vi.fn().mockReturnThis(),
    };
    return reply as unknown as FastifyReply;
  };

  describe('createAuthMiddleware', () => {
    it('should accept valid bearer token', async () => {
      const middleware = createAuthMiddleware('secret-token');
      const request = {
        headers: {
          authorization: 'Bearer secret-token',
        },
      } as FastifyRequest;
      const reply = mockReply();

      await middleware(request, reply);

      expect(reply.code).not.toHaveBeenCalled();
      expect(reply.send).not.toHaveBeenCalled();
    });

    it('should reject missing authorization header', async () => {
      const middleware = createAuthMiddleware('secret-token');
      const request = {
        headers: {},
      } as FastifyRequest;
      const reply = mockReply();

      await middleware(request, reply);

      expect(reply.code).toHaveBeenCalledWith(401);
      expect(reply.send).toHaveBeenCalledWith({
        error: 'Unauthorized',
        message: 'Missing Authorization header',
      });
    });

    it('should reject invalid bearer format', async () => {
      const middleware = createAuthMiddleware('secret-token');
      const request = {
        headers: {
          authorization: 'Invalid format',
        },
      } as FastifyRequest;
      const reply = mockReply();

      await middleware(request, reply);

      expect(reply.code).toHaveBeenCalledWith(401);
      expect(reply.send).toHaveBeenCalledWith({
        error: 'Unauthorized',
        message: 'Invalid Authorization header format. Expected: Bearer <token>',
      });
    });

    it('should reject invalid token', async () => {
      const middleware = createAuthMiddleware('secret-token');
      const request = {
        headers: {
          authorization: 'Bearer wrong-token',
        },
      } as FastifyRequest;
      const reply = mockReply();

      await middleware(request, reply);

      expect(reply.code).toHaveBeenCalledWith(401);
      expect(reply.send).toHaveBeenCalledWith({
        error: 'Unauthorized',
        message: 'Invalid token',
      });
    });
  });

  describe('redactHeaders', () => {
    it('should redact authorization header', () => {
      const headers = {
        authorization: 'Bearer secret-token',
        'content-type': 'application/json',
      };

      const redacted = redactHeaders(headers);

      expect(redacted.authorization).toBe('[REDACTED]');
      expect(redacted['content-type']).toBe('application/json');
    });

    it('should not modify headers without authorization', () => {
      const headers = {
        'content-type': 'application/json',
      };

      const redacted = redactHeaders(headers);

      expect(redacted).toEqual(headers);
    });
  });
});
