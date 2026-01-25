/**
 * Hook Manager for Claude SDK
 *
 * Manages hook lifecycle and provides a programmatic interface
 * for registering and executing hooks.
 */

import type { HookEvent } from '../agents/sdk-types.js';

/**
 * Hook output returned from a hook handler
 */
export interface HookOutput {
  continue?: boolean;
  suppressOutput?: boolean;
  stopReason?: string;
  decision?: 'approve' | 'block';
  systemMessage?: string;
  reason?: string;

  // PreToolUse specific
  permissionDecision?: 'allow' | 'deny' | 'ask';
  updatedInput?: Record<string, unknown>;
  additionalContext?: string;

  // PostToolUse specific
  updatedMCPToolOutput?: unknown;
}

/**
 * Async hook output for long-running hooks
 */
export interface AsyncHookOutput {
  async: true;
  asyncTimeout?: number;
}

export type HookJSONOutput = HookOutput | AsyncHookOutput;

/**
 * Hook input types for different events
 */
export interface PreToolUseInput {
  hook_event_name: 'PreToolUse';
  tool_name: string;
  tool_input: unknown;
  tool_use_id: string;
}

export interface PostToolUseInput {
  hook_event_name: 'PostToolUse';
  tool_name: string;
  tool_input: unknown;
  tool_response: unknown;
  tool_use_id: string;
}

export interface PostToolUseFailureInput {
  hook_event_name: 'PostToolUseFailure';
  tool_name: string;
  tool_input: unknown;
  tool_use_id: string;
  error: string;
  is_interrupt?: boolean;
}

export interface UserPromptSubmitInput {
  hook_event_name: 'UserPromptSubmit';
  prompt: string;
}

export interface SessionStartInput {
  hook_event_name: 'SessionStart';
  source?: 'startup' | 'resume' | 'clear' | 'compact';
  agent_type?: string;
  model?: string;
}

export interface SessionEndInput {
  hook_event_name: 'SessionEnd';
  reason?: 'clear' | 'logout' | 'prompt_input_exit' | 'other' | 'bypass_permissions_disabled';
}

export interface NotificationInput {
  hook_event_name: 'Notification';
  message: string;
  title?: string;
  notification_type: string;
}

export interface PermissionRequestInput {
  hook_event_name: 'PermissionRequest';
  tool_name: string;
  tool_input: unknown;
  permission_suggestions?: unknown[];
}

export interface SetupInput {
  hook_event_name: 'Setup';
  trigger: 'init' | 'maintenance';
}

export interface SubagentStartInput {
  hook_event_name: 'SubagentStart';
  agent_id: string;
  agent_type: string;
}

export interface SubagentStopInput {
  hook_event_name: 'SubagentStop';
  stop_hook_active: boolean;
  agent_id: string;
  agent_transcript_path?: string;
}

export interface PreCompactInput {
  hook_event_name: 'PreCompact';
  trigger: 'manual' | 'auto';
  custom_instructions?: string;
}

export interface StopInput {
  hook_event_name: 'Stop';
  stop_hook_active: boolean;
}

export type HookInput =
  | PreToolUseInput
  | PostToolUseInput
  | PostToolUseFailureInput
  | UserPromptSubmitInput
  | SessionStartInput
  | SessionEndInput
  | NotificationInput
  | PermissionRequestInput
  | SetupInput
  | SubagentStartInput
  | SubagentStopInput
  | PreCompactInput
  | StopInput;

/**
 * Hook callback function signature
 */
export type HookCallback = (
  input: HookInput,
  toolUseID: string | undefined,
  options: { signal: AbortSignal }
) => Promise<HookJSONOutput>;

/**
 * Hook definition for registration
 */
export interface HookDefinition {
  event: HookEvent;
  matcher?: string;
  timeout?: number;
  handler: (input: HookInput, toolUseID: string | undefined) => Promise<HookJSONOutput>;
}

/**
 * Hook callback matcher for SDK configuration
 */
export interface HookCallbackMatcher {
  matcher?: string;
  timeout?: number;
  hooks: HookCallback[];
}

/**
 * Manages hook registration and execution for Claude SDK sessions
 */
export class HookManager {
  private hooks: Map<HookEvent, HookDefinition[]> = new Map();

  /**
   * Register a hook for a specific event
   */
  register(definition: HookDefinition): void {
    const existing = this.hooks.get(definition.event) || [];
    existing.push(definition);
    this.hooks.set(definition.event, existing);
  }

  /**
   * Unregister a hook by event and handler reference
   */
  unregister(event: HookEvent, handler: HookDefinition['handler']): boolean {
    const existing = this.hooks.get(event) || [];
    const filtered = existing.filter(h => h.handler !== handler);
    if (filtered.length === existing.length) {
      return false; // Handler not found
    }
    this.hooks.set(event, filtered);
    return true;
  }

  /**
   * Unregister all hooks for an event
   */
  unregisterAll(event: HookEvent): void {
    this.hooks.delete(event);
  }

  /**
   * Clear all registered hooks
   */
  clear(): void {
    this.hooks.clear();
  }

  /**
   * Check if any hooks are registered for an event
   */
  hasHooks(event: HookEvent): boolean {
    const hooks = this.hooks.get(event);
    return hooks !== undefined && hooks.length > 0;
  }

  /**
   * Get the number of hooks registered for an event
   */
  getHookCount(event: HookEvent): number {
    return this.hooks.get(event)?.length || 0;
  }

  /**
   * Get all registered events
   */
  getRegisteredEvents(): HookEvent[] {
    return Array.from(this.hooks.keys());
  }

  /**
   * Execute all hooks for an event
   * Returns the combined output from all hooks
   */
  async execute(
    event: HookEvent,
    input: HookInput,
    toolUseID?: string,
    signal?: AbortSignal
  ): Promise<HookJSONOutput[]> {
    const definitions = this.hooks.get(event) || [];
    const results: HookJSONOutput[] = [];

    for (const definition of definitions) {
      // Check if matcher applies
      if (definition.matcher && !this.matchesPattern(input, definition.matcher)) {
        continue;
      }

      try {
        // Execute with timeout if specified
        const result = await this.executeWithTimeout(
          definition.handler,
          input,
          toolUseID,
          definition.timeout,
          signal
        );
        results.push(result);

        // Check if we should stop processing more hooks
        if (result && 'continue' in result && result.continue === false) {
          break;
        }
      } catch (error) {
        console.error(`[HookManager] Hook execution error for ${event}:`, error);
        // Continue with other hooks
      }
    }

    return results;
  }

  /**
   * Execute a hook handler with optional timeout
   */
  private async executeWithTimeout(
    handler: HookDefinition['handler'],
    input: HookInput,
    toolUseID: string | undefined,
    timeout?: number,
    signal?: AbortSignal
  ): Promise<HookJSONOutput> {
    if (!timeout) {
      return handler(input, toolUseID);
    }

    return Promise.race([
      handler(input, toolUseID),
      new Promise<HookJSONOutput>((_, reject) => {
        const timeoutId = setTimeout(() => {
          reject(new Error(`Hook timed out after ${timeout}ms`));
        }, timeout * 1000);

        // Clean up timeout if aborted
        signal?.addEventListener('abort', () => {
          clearTimeout(timeoutId);
          reject(new Error('Hook aborted'));
        });
      }),
    ]);
  }

  /**
   * Check if input matches a pattern
   * Supports patterns like "Bash(git*)" for tool matching
   */
  private matchesPattern(input: HookInput, pattern: string): boolean {
    // Extract tool name from input if present
    const toolName = 'tool_name' in input ? input.tool_name : undefined;

    if (!toolName) {
      // Non-tool hooks match if pattern is empty or matches event name
      return !pattern || pattern === input.hook_event_name;
    }

    // Parse pattern: "ToolName(argPattern)" or just "ToolName"
    const match = pattern.match(/^(\w+)(?:\(([^)]*)\))?$/);
    if (!match) {
      return false;
    }

    const [, patternToolName, argPattern] = match;

    // Check tool name match
    if (patternToolName !== toolName && patternToolName !== '*') {
      return false;
    }

    // If no arg pattern, match is successful
    if (!argPattern) {
      return true;
    }

    // Check argument pattern (simple glob-style matching)
    const toolInput = 'tool_input' in input ? input.tool_input : undefined;
    if (!toolInput || typeof toolInput !== 'object') {
      return false;
    }

    // For command tools like Bash, check the 'command' field
    const command = (toolInput as Record<string, unknown>).command;
    if (typeof command === 'string') {
      return this.globMatch(command, argPattern);
    }

    return false;
  }

  /**
   * Simple glob matching (supports * wildcard)
   */
  private globMatch(text: string, pattern: string): boolean {
    const regexPattern = pattern
      .replace(/[.+^${}()|[\]\\]/g, '\\$&') // Escape regex special chars
      .replace(/\*/g, '.*') // Convert * to .*
      .replace(/\?/g, '.'); // Convert ? to .

    const regex = new RegExp(`^${regexPattern}$`);
    return regex.test(text);
  }

  /**
   * Convert registered hooks to SDK hook callback matchers format
   */
  getCallbackMatchers(): Partial<Record<HookEvent, HookCallbackMatcher[]>> {
    const result: Partial<Record<HookEvent, HookCallbackMatcher[]>> = {};

    for (const [event, definitions] of this.hooks) {
      result[event] = definitions.map(d => ({
        matcher: d.matcher,
        timeout: d.timeout,
        hooks: [this.wrapHandler(d.handler)],
      }));
    }

    return result;
  }

  /**
   * Wrap a handler function to match the SDK callback signature
   */
  private wrapHandler(handler: HookDefinition['handler']): HookCallback {
    return async (input, toolUseID, _options) => {
      return handler(input, toolUseID);
    };
  }
}

/**
 * Create a new HookManager instance
 */
export function createHookManager(): HookManager {
  return new HookManager();
}
