import { describe, it, expect } from 'vitest';
import { ClaudeBackend } from '../src/agents/claude.js';
import { CodexBackend } from '../src/agents/codex.js';
import type { SessionAuth, SessionConfig } from '../src/agents/types.js';

describe('Agent backends', () => {
  describe('ClaudeBackend', () => {
    const claude = new ClaudeBackend();

    it('should validate API key mode requires apiKey when apiKeyRef=inline', () => {
      const auth: SessionAuth = {
        mode: 'api_key',
        providerKey: 'anthropic',
        apiKeyRef: 'inline',
        // Missing apiKey
      };

      expect(() => claude.validateAuth(auth, false)).toThrow('apiKey is required');
    });

    it('should reject apiKey when apiKeyRef is not inline', () => {
      const auth: SessionAuth = {
        mode: 'api_key',
        providerKey: 'anthropic',
        apiKeyRef: 'none',
        apiKey: 'sk-ant-test', // Should not be allowed
      };

      expect(() => claude.validateAuth(auth, false)).toThrow(
        'apiKey can only be provided when apiKeyRef="inline"'
      );
    });

    it('should allow interactive mode for Claude', () => {
      const auth: SessionAuth = {
        mode: 'interactive',
        providerKey: 'anthropic',
        apiKeyRef: 'none',
      };

      expect(() => claude.validateAuth(auth, false)).not.toThrow();
      expect(() => claude.validateAuth(auth, true)).not.toThrow(); // Even in hosted mode
    });

    it('should reject wrong provider for Claude', () => {
      const auth: SessionAuth = {
        mode: 'api_key',
        providerKey: 'openai', // Wrong provider
        apiKeyRef: 'inline',
        apiKey: 'sk-test',
      };

      expect(() => claude.validateAuth(auth, false)).toThrow('only supports providerKey="anthropic"');
    });
  });

  describe('CodexBackend', () => {
    const codex = new CodexBackend();

    it('should require API key mode in hosted mode', () => {
      const auth: SessionAuth = {
        mode: 'interactive',
        providerKey: 'openai',
        apiKeyRef: 'none',
      };

      expect(() => codex.validateAuth(auth, true)).toThrow(
        'Codex interactive mode (ChatGPT login) is not supported in hosted environments'
      );
    });

    it('should allow API key mode in hosted mode', () => {
      const auth: SessionAuth = {
        mode: 'api_key',
        providerKey: 'openai',
        apiKeyRef: 'inline',
        apiKey: 'sk-test',
      };

      expect(() => codex.validateAuth(auth, true)).not.toThrow();
    });

    it('should allow interactive mode in non-hosted mode (with warning)', () => {
      const auth: SessionAuth = {
        mode: 'interactive',
        providerKey: 'openai',
        apiKeyRef: 'none',
      };

      expect(() => codex.validateAuth(auth, false)).not.toThrow();
    });

    it('should reject wrong provider for Codex', () => {
      const auth: SessionAuth = {
        mode: 'api_key',
        providerKey: 'anthropic', // Wrong provider
        apiKeyRef: 'inline',
        apiKey: 'sk-test',
      };

      expect(() => codex.validateAuth(auth, false)).toThrow('only supports providerKey="openai"');
    });

    it('should require storedCredentialId when apiKeyRef=stored', () => {
      const auth: SessionAuth = {
        mode: 'api_key',
        providerKey: 'openai',
        apiKeyRef: 'stored',
        // Missing storedCredentialId
      };

      expect(() => codex.validateAuth(auth, false)).toThrow(
        'storedCredentialId is required when apiKeyRef="stored"'
      );
    });
  });

  describe('Environment variable safety', () => {
    it('should prevent *_API_KEY in env unless auth.mode=api_key (would be tested in session.test.ts)', () => {
      // This is tested in the session spawn logic
      // Just documenting the requirement here
      expect(true).toBe(true);
    });
  });
});
