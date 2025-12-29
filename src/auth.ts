import { FastifyRequest, FastifyReply } from 'fastify';
import { config } from './config';

export const authMiddleware = async (req: FastifyRequest, reply: FastifyReply) => {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    reply.code(401).send({ error: 'Missing Authorization header' });
    return;
  }

  const [scheme, token] = authHeader.split(' ');

  if (scheme !== 'Bearer' || token !== config.APERTURE_API_TOKEN) {
    reply.code(403).send({ error: 'Invalid API token' });
    return;
  }
};
