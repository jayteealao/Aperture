import { describe, it, expect } from 'vitest';
import { ClaudeSdkBackend } from '../src/agents/claude-sdk.js';
import type { SessionAuth } from '../src/agents/types.js';

describe('ClaudeSdkBackend', () => {
  const backend = new ClaudeSdkBackend();

  it('should have correct name and type', () => {
    expect(backend.name).toBe('Claude');
    expect(backend.type).toBe('claude_sdk');
  });

  describe('validateAuth', () => {
    it('should validate API key mode requires apiKey when apiKeyRef=inline', () => {
      const auth: SessionAuth = {
        mode: 'api_key',
        providerKey: 'anthropic',
        apiKeyRef: 'inline',
        // Missing apiKey
      };

      expect(() => backend.validateAuth(auth, false)).toThrow('apiKey is required');
    });

    it('should reject apiKey when apiKeyRef is not inline', () => {
      const auth: SessionAuth = {
        mode: 'api_key',
        providerKey: 'anthropic',
        apiKeyRef: 'none',
        apiKey: 'sk-ant-test', // Should not be allowed
      };

      expect(() => backend.validateAuth(auth, false)).toThrow(
        'apiKey can only be provided when apiKeyRef="inline"'
      );
    });

    it('should allow api_key mode with valid inline key', () => {
      const auth: SessionAuth = {
        mode: 'api_key',
        providerKey: 'anthropic',
        apiKeyRef: 'inline',
        apiKey: 'sk-ant-test',
      };

      expect(() => backend.validateAuth(auth, false)).not.toThrow();
    });

    it('should allow oauth mode', () => {
      const auth: SessionAuth = {
        mode: 'oauth',
        providerKey: 'anthropic',
        apiKeyRef: 'none',
      };

      expect(() => backend.validateAuth(auth, false)).not.toThrow();
    });

    it('should allow oauth mode in hosted mode (with warning)', () => {
      const auth: SessionAuth = {
        mode: 'oauth',
        providerKey: 'anthropic',
        apiKeyRef: 'none',
      };

      // Should not throw, just logs a warning
      expect(() => backend.validateAuth(auth, true)).not.toThrow();
    });

    it('should reject wrong provider', () => {
      const auth = {
        mode: 'api_key' as const,
        providerKey: 'openai' as 'anthropic', // Wrong provider (type cast to test runtime check)
        apiKeyRef: 'inline' as const,
        apiKey: 'sk-test',
      };

      expect(() => backend.validateAuth(auth, false)).toThrow('only supports providerKey="anthropic"');
    });

    it('should require storedCredentialId when apiKeyRef=stored', () => {
      const auth: SessionAuth = {
        mode: 'api_key',
        providerKey: 'anthropic',
        apiKeyRef: 'stored',
        // Missing storedCredentialId
      };

      expect(() => backend.validateAuth(auth, false)).toThrow(
        'storedCredentialId is required when apiKeyRef="stored"'
      );
    });

    it('should allow stored credential reference', () => {
      const auth: SessionAuth = {
        mode: 'api_key',
        providerKey: 'anthropic',
        apiKeyRef: 'stored',
        storedCredentialId: 'cred-123',
      };

      expect(() => backend.validateAuth(auth, false)).not.toThrow();
    });
  });
});
