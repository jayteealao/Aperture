import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { spawn, type ChildProcess } from 'child_process';
import { GeminiBackend } from '../src/agents/gemini.js';
import type { SessionConfig, SessionAuth } from '../src/agents/types.js';
import { EventEmitter } from 'events';

// Mock child_process.spawn
vi.mock('child_process', async () => {
  const actual = await vi.importActual('child_process');
  return {
    ...actual,
    spawn: vi.fn(),
  };
});

const mockSpawn = spawn as unknown as ReturnType<typeof vi.fn>;

describe('Gemini CLI Backend', () => {
  let mockChild: Partial<ChildProcess & EventEmitter>;

  beforeEach(() => {
    // Create a mock child process
    mockChild = new EventEmitter() as Partial<ChildProcess & EventEmitter>;
    mockChild.stdin = {
      write: vi.fn(),
    } as any;
    mockChild.stdout = new EventEmitter() as any;
    mockChild.stderr = new EventEmitter() as any;
    mockChild.kill = vi.fn();

    mockSpawn.mockReturnValue(mockChild as ChildProcess);

    // Set gateway environment variables to test isolation
    process.env.GEMINI_API_KEY = 'sk-gemini-gateway-key';
  });

  afterEach(() => {
    vi.clearAllMocks();
    delete process.env.GEMINI_API_KEY;
  });

  describe('Auth mode validation', () => {
    const gemini = new GeminiBackend();

    it('should allow oauth mode when allowInteractiveAuth is true', () => {
      const auth: SessionAuth = {
        mode: 'oauth',
        providerKey: 'google',
        apiKeyRef: 'none',
      };

      // In hosted mode with allowInteractiveAuth=true, oauth should work
      expect(() => gemini.validateAuth(auth, true, true)).not.toThrow();
    });

    it('should block oauth mode in HOSTED_MODE when allowInteractiveAuth is false', () => {
      const auth: SessionAuth = {
        mode: 'oauth',
        providerKey: 'google',
        apiKeyRef: 'none',
      };

      expect(() => gemini.validateAuth(auth, true, false)).toThrow(
        'Gemini OAuth mode (interactive Google login) is disabled in hosted environments'
      );
    });

    it('should require vertexProjectId for vertex mode', () => {
      const auth: SessionAuth = {
        mode: 'vertex',
        providerKey: 'google',
        apiKeyRef: 'none',
        // Missing vertexProjectId
        vertexLocation: 'us-central1',
      };

      expect(() => gemini.validateAuth(auth, false, false)).toThrow(
        'vertexProjectId (GOOGLE_CLOUD_PROJECT) is required'
      );
    });

    it('should require vertexLocation for vertex mode', () => {
      const auth: SessionAuth = {
        mode: 'vertex',
        providerKey: 'google',
        apiKeyRef: 'none',
        vertexProjectId: 'my-project',
        // Missing vertexLocation
      };

      expect(() => gemini.validateAuth(auth, false, false)).toThrow(
        'vertexLocation (GOOGLE_CLOUD_LOCATION) is required'
      );
    });

    it('should allow valid vertex mode config', () => {
      const auth: SessionAuth = {
        mode: 'vertex',
        providerKey: 'google',
        apiKeyRef: 'none',
        vertexProjectId: 'my-project',
        vertexLocation: 'us-central1',
      };

      expect(() => gemini.validateAuth(auth, false, false)).not.toThrow();
    });

    it('should reject interactive mode for Gemini', () => {
      const auth: SessionAuth = {
        mode: 'interactive',
        providerKey: 'google',
        apiKeyRef: 'none',
      };

      expect(() => gemini.validateAuth(auth, false, false)).toThrow(
        'Gemini does not support auth.mode="interactive"'
      );
    });

    it('should require apiKey when apiKeyRef=inline', () => {
      const auth: SessionAuth = {
        mode: 'api_key',
        providerKey: 'google',
        apiKeyRef: 'inline',
        // Missing apiKey
      };

      expect(() => gemini.validateAuth(auth, false, false)).toThrow(
        'apiKey is required when apiKeyRef="inline"'
      );
    });

    it('should reject wrong provider for Gemini', () => {
      const auth: SessionAuth = {
        mode: 'api_key',
        providerKey: 'anthropic', // Wrong provider
        apiKeyRef: 'inline',
        apiKey: 'sk-test',
      };

      expect(() => gemini.validateAuth(auth, false, false)).toThrow(
        'only supports providerKey="google"'
      );
    });
  });

  describe('Environment variable isolation - OAuth mode', () => {
    it('should NOT forward gateway GEMINI_API_KEY in oauth mode', async () => {
      const gemini = new GeminiBackend();
      const config: SessionConfig = {
        id: 'test-session',
        agent: 'gemini',
        auth: {
          mode: 'oauth',
          providerKey: 'google',
          apiKeyRef: 'none',
        },
      };

      await gemini.spawn(config);

      expect(mockSpawn).toHaveBeenCalledWith('gemini', ['--experimental-acp'], expect.any(Object));

      const spawnCall = mockSpawn.mock.calls[0];
      const spawnedEnv = spawnCall[2].env;

      // CRITICAL: All Google API keys must be deleted in oauth mode
      expect(spawnedEnv.GEMINI_API_KEY).toBeUndefined();
      expect(spawnedEnv.GOOGLE_API_KEY).toBeUndefined();
      expect(spawnedEnv.GOOGLE_CLOUD_API_KEY).toBeUndefined();
    });

    it('should set HOME to Gemini cache directory in oauth mode', async () => {
      const customHomePath = '/custom/gemini/home';
      const gemini = new GeminiBackend(customHomePath);
      const config: SessionConfig = {
        id: 'test-session',
        agent: 'gemini',
        auth: {
          mode: 'oauth',
          providerKey: 'google',
          apiKeyRef: 'none',
        },
      };

      await gemini.spawn(config);

      const spawnCall = mockSpawn.mock.calls[0];
      const spawnedEnv = spawnCall[2].env;

      expect(spawnedEnv.HOME).toBe(customHomePath);
    });
  });

  describe('Environment variable isolation - API key mode', () => {
    it('should SET GEMINI_API_KEY in api_key mode with inline key', async () => {
      const gemini = new GeminiBackend();
      const config: SessionConfig = {
        id: 'test-session',
        agent: 'gemini',
        auth: {
          mode: 'api_key',
          providerKey: 'google',
          apiKeyRef: 'inline',
          apiKey: 'sk-gemini-session-key',
        },
      };

      const resolvedApiKey = 'sk-gemini-session-key';
      await gemini.spawn(config, resolvedApiKey);

      const spawnCall = mockSpawn.mock.calls[0];
      const spawnedEnv = spawnCall[2].env;

      // API key mode should set the session's API key, NOT gateway's
      expect(spawnedEnv.GEMINI_API_KEY).toBe('sk-gemini-session-key');
      expect(spawnedEnv.GEMINI_API_KEY).not.toBe('sk-gemini-gateway-key');

      // Other Google API keys should be deleted
      expect(spawnedEnv.GOOGLE_API_KEY).toBeUndefined();
      expect(spawnedEnv.GOOGLE_CLOUD_API_KEY).toBeUndefined();
    });

    it('should REJECT Google secret env vars in session env when auth.mode=oauth', async () => {
      const gemini = new GeminiBackend();
      const config: SessionConfig = {
        id: 'test-session',
        agent: 'gemini',
        auth: {
          mode: 'oauth',
          providerKey: 'google',
          apiKeyRef: 'none',
        },
        env: {
          GOOGLE_API_KEY: 'sneaky-key', // Should be rejected
        },
      };

      await expect(gemini.spawn(config)).rejects.toThrow(
        'Environment variable GOOGLE_API_KEY not allowed in oauth mode'
      );
    });

    it('should ALLOW Google env vars in session env when auth.mode=api_key', async () => {
      const gemini = new GeminiBackend();
      const config: SessionConfig = {
        id: 'test-session',
        agent: 'gemini',
        auth: {
          mode: 'api_key',
          providerKey: 'google',
          apiKeyRef: 'inline',
          apiKey: 'sk-gemini-session-key',
        },
        env: {
          CUSTOM_API_KEY: 'custom-value', // Allowed in api_key mode
        },
      };

      const resolvedApiKey = 'sk-gemini-session-key';
      await gemini.spawn(config, resolvedApiKey);

      const spawnCall = mockSpawn.mock.calls[0];
      const spawnedEnv = spawnCall[2].env;

      expect(spawnedEnv.CUSTOM_API_KEY).toBe('custom-value');
      expect(spawnedEnv.GEMINI_API_KEY).toBe('sk-gemini-session-key');
    });
  });

  describe('Environment variable isolation - Vertex AI mode', () => {
    it('should set GOOGLE_CLOUD_PROJECT and GOOGLE_CLOUD_LOCATION for vertex mode', async () => {
      const gemini = new GeminiBackend();
      const config: SessionConfig = {
        id: 'test-session',
        agent: 'gemini',
        auth: {
          mode: 'vertex',
          providerKey: 'google',
          apiKeyRef: 'none',
          vertexProjectId: 'my-gcp-project',
          vertexLocation: 'us-central1',
        },
      };

      await gemini.spawn(config);

      const spawnCall = mockSpawn.mock.calls[0];
      const spawnedEnv = spawnCall[2].env;

      expect(spawnedEnv.GOOGLE_CLOUD_PROJECT).toBe('my-gcp-project');
      expect(spawnedEnv.GOOGLE_CLOUD_LOCATION).toBe('us-central1');

      // API keys should be deleted in vertex mode
      expect(spawnedEnv.GEMINI_API_KEY).toBeUndefined();
      expect(spawnedEnv.GOOGLE_API_KEY).toBeUndefined();
    });

    it('should set GOOGLE_APPLICATION_CREDENTIALS if vertexCredentialsPath provided', async () => {
      const gemini = new GeminiBackend();
      const config: SessionConfig = {
        id: 'test-session',
        agent: 'gemini',
        auth: {
          mode: 'vertex',
          providerKey: 'google',
          apiKeyRef: 'none',
          vertexProjectId: 'my-gcp-project',
          vertexLocation: 'us-central1',
          vertexCredentialsPath: '/path/to/service-account.json',
        },
      };

      await gemini.spawn(config);

      const spawnCall = mockSpawn.mock.calls[0];
      const spawnedEnv = spawnCall[2].env;

      expect(spawnedEnv.GOOGLE_APPLICATION_CREDENTIALS).toBe('/path/to/service-account.json');
    });

    it('should NOT set GOOGLE_APPLICATION_CREDENTIALS if vertexCredentialsPath not provided', async () => {
      const gemini = new GeminiBackend();
      const config: SessionConfig = {
        id: 'test-session',
        agent: 'gemini',
        auth: {
          mode: 'vertex',
          providerKey: 'google',
          apiKeyRef: 'none',
          vertexProjectId: 'my-gcp-project',
          vertexLocation: 'us-central1',
          // No vertexCredentialsPath - should use ADC
        },
      };

      // Delete any existing GOOGLE_APPLICATION_CREDENTIALS from gateway env
      delete process.env.GOOGLE_APPLICATION_CREDENTIALS;

      await gemini.spawn(config);

      const spawnCall = mockSpawn.mock.calls[0];
      const spawnedEnv = spawnCall[2].env;

      // Should not have GOOGLE_APPLICATION_CREDENTIALS set
      expect(spawnedEnv.GOOGLE_APPLICATION_CREDENTIALS).toBeUndefined();
    });

    it('should REJECT Google Cloud env vars in session env when auth.mode=oauth', async () => {
      const gemini = new GeminiBackend();
      const config: SessionConfig = {
        id: 'test-session',
        agent: 'gemini',
        auth: {
          mode: 'oauth',
          providerKey: 'google',
          apiKeyRef: 'none',
        },
        env: {
          GOOGLE_CLOUD_PROJECT: 'sneaky-project', // Should be rejected
        },
      };

      await expect(gemini.spawn(config)).rejects.toThrow(
        'Environment variable GOOGLE_CLOUD_PROJECT not allowed in oauth mode'
      );
    });
  });

  describe('Spawn command', () => {
    it('should spawn gemini with --experimental-acp flag', async () => {
      const gemini = new GeminiBackend();
      const config: SessionConfig = {
        id: 'test-session',
        agent: 'gemini',
        auth: {
          mode: 'oauth',
          providerKey: 'google',
          apiKeyRef: 'none',
        },
      };

      await gemini.spawn(config);

      expect(mockSpawn).toHaveBeenCalledWith('gemini', ['--experimental-acp'], expect.any(Object));
    });

    it('should return gemini agent type', async () => {
      const gemini = new GeminiBackend();
      const config: SessionConfig = {
        id: 'test-session',
        agent: 'gemini',
        auth: {
          mode: 'oauth',
          providerKey: 'google',
          apiKeyRef: 'none',
        },
      };

      const result = await gemini.spawn(config);

      expect(result.agentType).toBe('gemini');
      expect(result.child).toBe(mockChild);
    });
  });

  describe('HOSTED_MODE enforcement', () => {
    it('should block oauth mode in HOSTED_MODE by default', () => {
      const gemini = new GeminiBackend();
      const auth: SessionAuth = {
        mode: 'oauth',
        providerKey: 'google',
        apiKeyRef: 'none',
      };

      // hostedMode=true, allowInteractiveAuth not provided (defaults to false)
      expect(() => gemini.validateAuth(auth, true)).toThrow(
        'Gemini OAuth mode (interactive Google login) is disabled'
      );
    });

    it('should allow api_key mode in HOSTED_MODE', () => {
      const gemini = new GeminiBackend();
      const auth: SessionAuth = {
        mode: 'api_key',
        providerKey: 'google',
        apiKeyRef: 'inline',
        apiKey: 'sk-test',
      };

      expect(() => gemini.validateAuth(auth, true, false)).not.toThrow();
    });

    it('should allow vertex mode in HOSTED_MODE', () => {
      const gemini = new GeminiBackend();
      const auth: SessionAuth = {
        mode: 'vertex',
        providerKey: 'google',
        apiKeyRef: 'none',
        vertexProjectId: 'my-project',
        vertexLocation: 'us-central1',
      };

      expect(() => gemini.validateAuth(auth, true, false)).not.toThrow();
    });
  });
});
