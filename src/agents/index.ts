export * from './types.js';
export { ClaudeBackend } from './claude.js';
export { CodexBackend } from './codex.js';

import { ClaudeBackend } from './claude.js';
import { CodexBackend } from './codex.js';
import type { AgentBackend, AgentType } from './types.js';

/**
 * Get agent backend by type
 */
export function getAgentBackend(
  type: AgentType,
  claudeCodeExecutable?: string
): AgentBackend {
  switch (type) {
    case 'claude_code':
      return new ClaudeBackend(claudeCodeExecutable);
    case 'codex':
      return new CodexBackend();
    default:
      throw new Error(`Unknown agent type: ${type}`);
  }
}
