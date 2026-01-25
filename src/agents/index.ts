export * from './types.js';
export * from './sdk-types.js';
export { ClaudeBackend } from './claude.js';
export { ClaudeSdkBackend } from './claude-sdk.js';
export { CodexBackend } from './codex.js';
export { GeminiBackend } from './gemini.js';

import { ClaudeBackend } from './claude.js';
import { ClaudeSdkBackend } from './claude-sdk.js';
import { CodexBackend } from './codex.js';
import { GeminiBackend } from './gemini.js';
import type { AgentBackend, AgentType, SdkAgentBackend } from './types.js';

/**
 * Check if a backend is SDK-based (no spawn method)
 */
export function isSdkBackend(backend: AgentBackend | SdkAgentBackend): backend is SdkAgentBackend {
  return backend.type === 'claude_sdk';
}

/**
 * Get agent backend by type
 */
export function getAgentBackend(
  type: AgentType,
  claudeCodeExecutable?: string,
  geminiHomePath?: string
): AgentBackend | SdkAgentBackend {
  switch (type) {
    case 'claude_acp':
      return new ClaudeBackend(claudeCodeExecutable);
    case 'claude_sdk':
      return new ClaudeSdkBackend();
    case 'codex':
      return new CodexBackend();
    case 'gemini':
      return new GeminiBackend(geminiHomePath);
    default:
      throw new Error(`Unknown agent type: ${type}`);
  }
}
