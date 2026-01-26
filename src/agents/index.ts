export * from './types.js';
export * from './sdk-types.js';
export * from './pi-types.js';
export { ClaudeSdkBackend } from './claude-sdk.js';
export { PiSdkBackend } from './pi-sdk.js';

import { ClaudeSdkBackend } from './claude-sdk.js';
import { PiSdkBackend } from './pi-sdk.js';
import type { AgentType, SdkAgentBackend } from './types.js';

/**
 * Check if a backend is SDK-based (no spawn method)
 */
export function isSdkBackend(backend: SdkAgentBackend): backend is SdkAgentBackend {
  return backend.type === 'claude_sdk' || backend.type === 'pi_sdk';
}

/**
 * Check if a backend is specifically Pi SDK
 */
export function isPiSdkBackend(backend: SdkAgentBackend): backend is SdkAgentBackend {
  return backend.type === 'pi_sdk';
}

/**
 * Get agent backend by type
 */
export function getAgentBackend(type: AgentType): SdkAgentBackend {
  switch (type) {
    case 'claude_sdk':
      return new ClaudeSdkBackend();
    case 'pi_sdk':
      return new PiSdkBackend();
    default:
      throw new Error(`Unknown agent type: ${type}`);
  }
}
