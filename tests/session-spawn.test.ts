import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { spawn, type ChildProcess } from 'child_process';
import { ClaudeBackend } from '../src/agents/claude.js';
import { CodexBackend } from '../src/agents/codex.js';
import type { SessionConfig } from '../src/agents/types.js';
import { EventEmitter } from 'events';

// Mock child_process.spawn
vi.mock('child_process', () => ({
  spawn: vi.fn(),
}));

const mockSpawn = spawn as unknown as ReturnType<typeof vi.fn>;

describe('Session spawn - Environment variable isolation', () => {
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
    process.env.ANTHROPIC_API_KEY = 'sk-ant-gateway-key';
    process.env.OPENAI_API_KEY = 'sk-openai-gateway-key';
  });

  afterEach(() => {
    vi.clearAllMocks();
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.OPENAI_API_KEY;
  });

  describe('ClaudeBackend environment isolation', () => {
    it('should NOT forward gateway ANTHROPIC_API_KEY in interactive mode', async () => {
      const claude = new ClaudeBackend();
      const config: SessionConfig = {
        id: 'test-session',
        agent: 'claude_code',
        auth: {
          mode: 'interactive',
          providerKey: 'anthropic',
          apiKeyRef: 'none',
        },
      };

      await claude.spawn(config);

      expect(mockSpawn).toHaveBeenCalledWith('claude-code-acp', [], expect.any(Object));

      // Extract the env passed to spawn
      const spawnCall = mockSpawn.mock.calls[0];
      const spawnOptions = spawnCall[2];
      const spawnedEnv = spawnOptions.env;

      // CRITICAL: ANTHROPIC_API_KEY must be deleted in interactive mode
      expect(spawnedEnv.ANTHROPIC_API_KEY).toBeUndefined();
    });

    it('should SET ANTHROPIC_API_KEY in api_key mode with inline key', async () => {
      const claude = new ClaudeBackend();
      const config: SessionConfig = {
        id: 'test-session',
        agent: 'claude_code',
        auth: {
          mode: 'api_key',
          providerKey: 'anthropic',
          apiKeyRef: 'inline',
          apiKey: 'sk-ant-session-key',
        },
      };

      const resolvedApiKey = 'sk-ant-session-key';
      await claude.spawn(config, resolvedApiKey);

      const spawnCall = mockSpawn.mock.calls[0];
      const spawnedEnv = spawnCall[2].env;

      // API key mode should set the session's API key, NOT gateway's
      expect(spawnedEnv.ANTHROPIC_API_KEY).toBe('sk-ant-session-key');
      expect(spawnedEnv.ANTHROPIC_API_KEY).not.toBe('sk-ant-gateway-key');
    });

    it('should REJECT *_API_KEY in session env when auth.mode=interactive', async () => {
      const claude = new ClaudeBackend();
      const config: SessionConfig = {
        id: 'test-session',
        agent: 'claude_code',
        auth: {
          mode: 'interactive',
          providerKey: 'anthropic',
          apiKeyRef: 'none',
        },
        env: {
          MY_API_KEY: 'sneaky-key', // Should be rejected
        },
      };

      await expect(claude.spawn(config)).rejects.toThrow(
        'Environment variable MY_API_KEY not allowed in interactive mode'
      );
    });

    it('should ALLOW *_API_KEY in session env when auth.mode=api_key', async () => {
      const claude = new ClaudeBackend();
      const config: SessionConfig = {
        id: 'test-session',
        agent: 'claude_code',
        auth: {
          mode: 'api_key',
          providerKey: 'anthropic',
          apiKeyRef: 'inline',
          apiKey: 'sk-ant-session-key',
        },
        env: {
          CUSTOM_API_KEY: 'custom-value', // Allowed in api_key mode
        },
      };

      const resolvedApiKey = 'sk-ant-session-key';
      await claude.spawn(config, resolvedApiKey);

      const spawnCall = mockSpawn.mock.calls[0];
      const spawnedEnv = spawnCall[2].env;

      expect(spawnedEnv.CUSTOM_API_KEY).toBe('custom-value');
      expect(spawnedEnv.ANTHROPIC_API_KEY).toBe('sk-ant-session-key');
    });
  });

  describe('CodexBackend environment isolation', () => {
    it('should NOT forward gateway OPENAI_API_KEY in interactive mode', async () => {
      const codex = new CodexBackend();
      const config: SessionConfig = {
        id: 'test-session',
        agent: 'codex',
        auth: {
          mode: 'interactive',
          providerKey: 'openai',
          apiKeyRef: 'none',
        },
      };

      await codex.spawn(config);

      const spawnCall = mockSpawn.mock.calls[0];
      const spawnedEnv = spawnCall[2].env;

      // CRITICAL: Both OPENAI_API_KEY and CODEX_API_KEY must be deleted
      expect(spawnedEnv.OPENAI_API_KEY).toBeUndefined();
      expect(spawnedEnv.CODEX_API_KEY).toBeUndefined();
    });

    it('should SET OPENAI_API_KEY in api_key mode', async () => {
      const codex = new CodexBackend();
      const config: SessionConfig = {
        id: 'test-session',
        agent: 'codex',
        auth: {
          mode: 'api_key',
          providerKey: 'openai',
          apiKeyRef: 'inline',
          apiKey: 'sk-openai-session-key',
        },
      };

      const resolvedApiKey = 'sk-openai-session-key';
      await codex.spawn(config, resolvedApiKey);

      const spawnCall = mockSpawn.mock.calls[0];
      const spawnedEnv = spawnCall[2].env;

      expect(spawnedEnv.OPENAI_API_KEY).toBe('sk-openai-session-key');
      expect(spawnedEnv.OPENAI_API_KEY).not.toBe('sk-openai-gateway-key');
    });

    it('should REJECT *_API_KEY in session env when auth.mode=interactive', async () => {
      const codex = new CodexBackend();
      const config: SessionConfig = {
        id: 'test-session',
        agent: 'codex',
        auth: {
          mode: 'interactive',
          providerKey: 'openai',
          apiKeyRef: 'none',
        },
        env: {
          SECRET_API_KEY: 'sneaky-value',
        },
      };

      await expect(codex.spawn(config)).rejects.toThrow(
        'Environment variable SECRET_API_KEY not allowed in interactive mode'
      );
    });
  });

  describe('Cross-environment contamination', () => {
    it('should NOT leak gateway env vars between sessions', async () => {
      const claude = new ClaudeBackend();

      // Session 1: interactive mode (should delete API key)
      const config1: SessionConfig = {
        id: 'session-1',
        agent: 'claude_code',
        auth: { mode: 'interactive', providerKey: 'anthropic', apiKeyRef: 'none' },
      };

      await claude.spawn(config1);
      const spawn1Env = mockSpawn.mock.calls[0][2].env;

      // Session 2: api_key mode (should use session key)
      const config2: SessionConfig = {
        id: 'session-2',
        agent: 'claude_code',
        auth: {
          mode: 'api_key',
          providerKey: 'anthropic',
          apiKeyRef: 'inline',
          apiKey: 'sk-ant-session2',
        },
      };

      await claude.spawn(config2, 'sk-ant-session2');
      const spawn2Env = mockSpawn.mock.calls[1][2].env;

      // Session 1 should not have API key
      expect(spawn1Env.ANTHROPIC_API_KEY).toBeUndefined();

      // Session 2 should have its own API key
      expect(spawn2Env.ANTHROPIC_API_KEY).toBe('sk-ant-session2');

      // Neither should have the gateway API key
      expect(spawn1Env.ANTHROPIC_API_KEY).not.toBe('sk-ant-gateway-key');
      expect(spawn2Env.ANTHROPIC_API_KEY).not.toBe('sk-ant-gateway-key');
    });
  });
});
