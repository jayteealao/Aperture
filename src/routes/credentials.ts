import type { FastifyInstance } from 'fastify';
import type { CredentialStore } from '../credentials.js';
import type { Provider } from '../agents/types.js';

interface StoreCredentialBody {
  provider: Provider;
  label: string;
  apiKey: string;
}

/**
 * Register credential management routes
 */
export async function registerCredentialRoutes(
  fastify: FastifyInstance,
  credentialStore?: CredentialStore
) {
  // Store a new credential
  fastify.post<{ Body: StoreCredentialBody }>(
    '/v1/credentials',
    async (request, reply) => {
      if (!credentialStore) {
        return reply.code(503).send({
          error: 'Credential storage not enabled',
          message: 'Set CREDENTIALS_MASTER_KEY environment variable to enable stored credentials',
        });
      }

      const { provider, label, apiKey } = request.body;

      if (!provider || !label || !apiKey) {
        return reply.code(400).send({
          error: 'Missing required fields',
          message: 'provider, label, and apiKey are required',
        });
      }

      if (provider !== 'anthropic' && provider !== 'openai') {
        return reply.code(400).send({
          error: 'Invalid provider',
          message: 'provider must be "anthropic" or "openai"',
        });
      }

      if (!label.trim()) {
        return reply.code(400).send({
          error: 'Invalid label',
          message: 'label cannot be empty',
        });
      }

      if (!apiKey.trim()) {
        return reply.code(400).send({
          error: 'Invalid API key',
          message: 'apiKey cannot be empty',
        });
      }

      try {
        const credential = await credentialStore.store(provider, label.trim(), apiKey.trim());

        return reply.code(201).send({
          id: credential.id,
          provider: credential.provider,
          label: credential.label,
          createdAt: credential.createdAt,
        });
      } catch (err) {
        const error = err as Error;
        request.log.error(error, 'Failed to store credential');
        return reply.code(500).send({
          error: 'Failed to store credential',
          message: error.message,
        });
      }
    }
  );

  // List all stored credentials (without API keys)
  fastify.get('/v1/credentials', async (request, reply) => {
    if (!credentialStore) {
      return reply.code(503).send({
        error: 'Credential storage not enabled',
        message: 'Set CREDENTIALS_MASTER_KEY environment variable to enable stored credentials',
      });
    }

    try {
      const credentials = credentialStore.list();

      return {
        credentials,
        total: credentials.length,
      };
    } catch (err) {
      const error = err as Error;
      request.log.error(error, 'Failed to list credentials');
      return reply.code(500).send({
        error: 'Failed to list credentials',
        message: error.message,
      });
    }
  });

  // Delete a credential
  fastify.delete<{ Params: { id: string } }>(
    '/v1/credentials/:id',
    async (request, reply) => {
      if (!credentialStore) {
        return reply.code(503).send({
          error: 'Credential storage not enabled',
          message: 'Set CREDENTIALS_MASTER_KEY environment variable to enable stored credentials',
        });
      }

      try {
        const deleted = await credentialStore.delete(request.params.id);

        if (!deleted) {
          return reply.code(404).send({
            error: 'Credential not found',
          });
        }

        return reply.code(204).send();
      } catch (err) {
        const error = err as Error;
        request.log.error(error, 'Failed to delete credential');
        return reply.code(500).send({
          error: 'Failed to delete credential',
          message: error.message,
        });
      }
    }
  );
}
