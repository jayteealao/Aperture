import { EventEmitter } from 'events';
import type { Config } from './config.js';
import type { ApertureDatabase } from './database.js';
import type { AgentType, SessionConfig } from './agents/index.js';
import type {
  SdkSessionConfig,
  PermissionMode,
  McpServerConfig,
  McpServerStatus,
  McpSetServersResult,
  AccountInfo,
  SlashCommand,
  ModelInfo,
  RewindFilesResult,
  SessionResult,
  PermissionDenial,
  PermissionOption,
  PermissionContext,
  ResultSubtype,
  ModelUsage,
} from './agents/sdk-types.js';
import type {
  Query,
  Options,
  SDKMessage,
  SDKAssistantMessage,
  SDKResultMessage,
  SDKSystemMessage,
  PermissionResult,
  CanUseTool,
  PermissionUpdate as SDKPermissionUpdate,
  SDKPermissionDenial,
} from '@anthropic-ai/claude-agent-sdk';
import { query as sdkQuery } from '@anthropic-ai/claude-agent-sdk';

// Pending permission request from SDK
interface PendingPermission {
  toolName: string;
  toolInput: Record<string, unknown>;
  toolUseID: string;
  resolve: (result: PermissionResult) => void;
  signal: AbortSignal;
}

// SDK WebSocket message (first-class, no JSON-RPC wrapper)
export interface SdkWsMessage {
  kind: 'sdk';
  sessionId: string;
  type: string;
  payload: unknown;
}

// SDK content block types
export interface SdkTextBlock {
  type: 'text';
  text: string;
}

export interface SdkThinkingBlock {
  type: 'thinking';
  thinking: string;
  signature?: string;
}

export interface SdkToolUseBlock {
  type: 'tool_use';
  id: string;
  name: string;
  input: unknown;
}

export interface SdkToolResultBlock {
  type: 'tool_result';
  tool_use_id: string;
  content: string;
  is_error?: boolean;
}

export type SdkContentBlock = SdkTextBlock | SdkThinkingBlock | SdkToolUseBlock | SdkToolResultBlock;

/**
 * Manages a single Claude SDK session (non-process based)
 * Provides the same event interface as Session for frontend compatibility
 *
 * Features:
 * - MCP server configuration and management
 * - Session resumption, forking, and persistence
 * - File checkpointing and rewind
 * - Enhanced permission handling with suggestions
 * - Budget and limit controls
 * - Model management with fallback
 * - Hook system integration
 * - Subagent support
 * - Sandbox configuration
 * - Structured output
 * - Usage and cost tracking
 */
export class SdkSession extends EventEmitter {
  public readonly id: string;
  public readonly agentType: AgentType;
  public sdkSessionId: string | null = null;
  private config: Config;
  private sessionConfig: SessionConfig;
  private sdkConfig: SdkSessionConfig;
  private database?: ApertureDatabase;
  private resolvedApiKey?: string;
  private worktreePath?: string;
  private abortController: AbortController | null = null;
  private currentQuery: Query | null = null;
  private pendingPermissions: Map<string, PendingPermission> = new Map();
  private lastActivityTime: number = Date.now();
  private idleTimer: NodeJS.Timeout | null = null;
  private isShuttingDown = false;
  private isProcessing = false;

  // Result tracking
  private permissionDenials: PermissionDenial[] = [];
  private lastResult: SessionResult | null = null;
  private messageUuids: Map<string, string> = new Map();

  // Cached session info (persists after query completes)
  private cachedModels: ModelInfo[] | null = null;
  private cachedAccountInfo: AccountInfo | null = null;
  private cachedMcpStatus: McpServerStatus[] | null = null;
  private cachedCommands: SlashCommand[] | null = null;

  constructor(
    sessionConfig: SessionConfig,
    config: Config,
    database?: ApertureDatabase,
    resolvedApiKey?: string,
    cwd?: string
  ) {
    super();
    this.id = sessionConfig.id;
    this.agentType = sessionConfig.agent;
    this.sessionConfig = sessionConfig;
    this.config = config;
    this.database = database;
    this.sdkConfig = sessionConfig.sdk || {};
    this.resolvedApiKey = resolvedApiKey;
    if (cwd) {
      this.worktreePath = cwd;
    }
  }

  /**
   * Set the worktree path for this session
   * Must be called before start() if needed
   */
  setWorktreePath(path: string): void {
    this.worktreePath = path;
  }

  /**
   * Update SDK configuration dynamically
   */
  updateConfig(config: Partial<SdkSessionConfig>): void {
    this.sdkConfig = { ...this.sdkConfig, ...config };
  }

  /**
   * Get current SDK configuration
   */
  getConfig(): SdkSessionConfig {
    return { ...this.sdkConfig };
  }

  /**
   * Starts the SDK session (no process to spawn, but we initialize state)
   */
  async start(): Promise<void> {
    // Start idle timer
    this.resetIdleTimer();

    // SDK sessions don't have an init phase like process-based sessions.
    // The session is "ready" immediately - actual initialization happens on first prompt.
    // We emit an init-like message for frontend compatibility.
    this.sdkSessionId = this.id;

    // Emit a synthetic init message for frontend compatibility
    const initMessage = {
      jsonrpc: '2.0' as const,
      method: 'session/update',
      params: {
        update: {
          sessionUpdate: 'init',
          sessionId: this.id,
          agentType: 'claude_sdk',
          config: {
            permissionMode: this.sdkConfig.permissionMode || 'default',
            model: this.sdkConfig.model,
            maxTurns: this.sdkConfig.maxTurns,
            maxBudgetUsd: this.sdkConfig.maxBudgetUsd,
            enableFileCheckpointing: this.sdkConfig.enableFileCheckpointing ?? true,
          },
        },
      },
    };
    this.emit('message', initMessage);
    this.emit('session_update', initMessage.params);
  }

  /**
   * Build SDK options from configuration
   */
  private buildOptions(): Options {
    const env: Record<string, string | undefined> = { ...process.env };
    if (this.resolvedApiKey) {
      env.ANTHROPIC_API_KEY = this.resolvedApiKey;
    }

    // Merge session env with SDK env
    if (this.sessionConfig.env) {
      Object.assign(env, this.sessionConfig.env);
    }

    const options: Options = {
      cwd: this.worktreePath || process.cwd(),
      abortController: this.abortController!,
      canUseTool: this.createCanUseTool(),
      env,
      includePartialMessages: true,
      stderr: (data: string) => this.emit('stderr', data),

      // Session resumption: auto-continue when resuming within the same Aperture session
      resume: this.sdkConfig.resume || (this.sdkSessionId !== this.id ? this.sdkSessionId ?? undefined : undefined),
      resumeSessionAt: this.sdkConfig.resumeSessionAt,
      forkSession: this.sdkConfig.forkSession,
      continue: this.sdkConfig.continue ?? (this.sdkSessionId !== this.id ? true : undefined),
      persistSession: this.sdkConfig.persistSession ?? true,

      // File checkpointing
      enableFileCheckpointing: this.sdkConfig.enableFileCheckpointing ?? true,

      // Permissions
      permissionMode: this.sdkConfig.permissionMode,
      allowedTools: this.sdkConfig.allowedTools,
      disallowedTools: this.sdkConfig.disallowedTools,
      allowDangerouslySkipPermissions: this.sdkConfig.allowDangerouslySkipPermissions,

      // Limits
      maxBudgetUsd: this.sdkConfig.maxBudgetUsd,
      maxTurns: this.sdkConfig.maxTurns,
      maxThinkingTokens: this.sdkConfig.maxThinkingTokens,

      // Model
      model: this.sdkConfig.model,
      fallbackModel: this.sdkConfig.fallbackModel,
      betas: this.sdkConfig.betas as Options['betas'],

      // MCP
      mcpServers: this.sdkConfig.mcpServers as Options['mcpServers'],

      // Agents
      agent: this.sdkConfig.agent,
      agents: this.sdkConfig.agents as Options['agents'],

      // Sandbox
      sandbox: this.sdkConfig.sandbox as Options['sandbox'],

      // Plugins
      plugins: this.sdkConfig.plugins as Options['plugins'],

      // Output
      outputFormat: this.sdkConfig.outputFormat as Options['outputFormat'],

      // System prompt
      systemPrompt: this.sdkConfig.systemPrompt as Options['systemPrompt'],

      // Advanced
      additionalDirectories: this.sdkConfig.additionalDirectories,
      settingSources: this.sdkConfig.settingSources,
    };

    return options;
  }

  /**
   * Creates the canUseTool callback for permission handling
   * Enhanced to surface SDK suggestions and context
   */
  private createCanUseTool(): CanUseTool {
    return async (
      toolName: string,
      input: Record<string, unknown>,
      options: {
        signal: AbortSignal;
        suggestions?: SDKPermissionUpdate[];
        blockedPath?: string;
        decisionReason?: string;
        toolUseID: string;
        agentID?: string;
      }
    ): Promise<PermissionResult> => {
      return new Promise<PermissionResult>((resolve, reject) => {
        const { toolUseID, signal, suggestions, blockedPath, decisionReason, agentID } = options;

        // Store the pending permission
        this.pendingPermissions.set(toolUseID, {
          toolName,
          toolInput: input,
          toolUseID,
          resolve,
          signal,
        });

        // Handle abort
        signal.addEventListener('abort', () => {
          this.pendingPermissions.delete(toolUseID);
          reject(new Error('Permission request aborted'));
        });

        // Translate SDK suggestions to frontend-friendly options
        const permissionOptions = this.translatePermissionSuggestions(suggestions);

        // Build context for frontend (suggestions already translated to permissionOptions)
        const context: PermissionContext = {
          blockedPath,
          decisionReason,
          agentID,
        };

        // Debug: Log the permission request details
        console.log('[SDK-Session] Permission request for tool:', toolName);
        console.log('[SDK-Session] Tool input:', JSON.stringify(input, null, 2));
        if (suggestions?.length) {
          console.log('[SDK-Session] Suggestions:', JSON.stringify(suggestions, null, 2));
        }

        // Emit permission request event for frontend
        this.emit('permission_request', {
          id: toolUseID,
          toolCallId: toolUseID,
          toolCall: {
            toolCallId: toolUseID,
            name: toolName,
            rawInput: input,
            title: toolName,
          },
          options: permissionOptions,
          context,
        });

        // Also emit as session update for message history
        const updateMessage = {
          jsonrpc: '2.0' as const,
          method: 'session/request_permission',
          params: {
            toolCallId: toolUseID,
            toolCall: {
              toolCallId: toolUseID,
              name: toolName,
              rawInput: input,
              title: toolName,
            },
            options: permissionOptions,
            context,
          },
        };
        this.emit('message', updateMessage);
      });
    };
  }

  /**
   * Translate SDK permission suggestions to frontend-friendly options
   */
  private translatePermissionSuggestions(suggestions?: SDKPermissionUpdate[]): PermissionOption[] {
    const defaultOptions: PermissionOption[] = [
      { optionId: 'allow', name: 'Allow', kind: 'allow' },
      { optionId: 'allow_always', name: 'Always Allow', kind: 'allow_always' },
      { optionId: 'deny', name: 'Deny', kind: 'deny' },
    ];

    if (!suggestions || suggestions.length === 0) {
      return defaultOptions;
    }

    // Add SDK-suggested options before defaults
    const suggestedOptions: PermissionOption[] = suggestions.map((s, i) => {
      const kind = 'behavior' in s ? s.behavior : 'allow';
      return {
        optionId: `suggestion_${i}`,
        name: this.formatSuggestionName(s),
        kind,
      };
    });

    return [...suggestedOptions, ...defaultOptions];
  }

  /**
   * Format a permission suggestion into a human-readable name
   */
  private formatSuggestionName(suggestion: SDKPermissionUpdate): string {
    const behavior = 'behavior' in suggestion ? suggestion.behavior : undefined;
    const action = behavior === 'allow' ? 'Allow' : behavior === 'deny' ? 'Deny' : 'Set';
    const scope = suggestion.destination === 'session' ? 'this session' :
      suggestion.destination === 'projectSettings' ? 'this project' :
        suggestion.destination === 'userSettings' ? 'always' : 'locally';

    if (suggestion.type === 'setMode') {
      return `Set mode to ${suggestion.mode} for ${scope}`;
    }
    if (suggestion.type === 'addDirectories' || suggestion.type === 'removeDirectories') {
      return `${suggestion.type === 'addDirectories' ? 'Add' : 'Remove'} directories for ${scope}`;
    }
    // addRules, replaceRules, removeRules
    return `${action} for ${scope}`;
  }

  /**
   * Proactively cache session info when query starts
   * Emits messages so frontend receives the data
   * Captures query reference to avoid race conditions with finally block
   */
  private async cacheSessionInfo(): Promise<void> {
    // Capture query reference to avoid race condition where currentQuery
    // becomes null in the finally block before Promise.allSettled completes
    const query = this.currentQuery;
    if (!query) {
      console.log('[SDK-Session] cacheSessionInfo: No query available');
      return;
    }

    console.log('[SDK-Session] cacheSessionInfo: Fetching session info...');

    const [models, accountInfo, mcpStatus, commands] = await Promise.allSettled([
      query.supportedModels(),
      query.accountInfo(),
      query.mcpServerStatus(),
      query.supportedCommands(),
    ]);

    // Emit models or error
    if (models.status === 'fulfilled') {
      console.log('[SDK-Session] Models loaded:', models.value.length);
      this.cachedModels = models.value;
      this.emit('message', {
        jsonrpc: '2.0',
        method: 'session/supported_models',
        params: { models: models.value },
      });
    } else {
      console.log('[SDK-Session] Models failed:', models.reason);
      this.emit('message', {
        jsonrpc: '2.0',
        method: 'session/supported_models',
        params: { error: models.reason?.message || 'Failed to load models' },
      });
    }

    // Emit account info or error
    if (accountInfo.status === 'fulfilled') {
      this.cachedAccountInfo = accountInfo.value;
      this.emit('message', {
        jsonrpc: '2.0',
        method: 'session/account_info',
        params: accountInfo.value,
      });
    } else {
      this.emit('message', {
        jsonrpc: '2.0',
        method: 'session/account_info',
        params: { error: accountInfo.reason?.message || 'Failed to load account info' },
      });
    }

    // Emit MCP status or error
    if (mcpStatus.status === 'fulfilled') {
      this.cachedMcpStatus = mcpStatus.value;
      this.emit('message', {
        jsonrpc: '2.0',
        method: 'session/mcp_status',
        params: { servers: mcpStatus.value },
      });
    } else {
      this.emit('message', {
        jsonrpc: '2.0',
        method: 'session/mcp_status',
        params: { error: mcpStatus.reason?.message || 'Failed to load MCP status' },
      });
    }

    // Emit commands or error
    if (commands.status === 'fulfilled') {
      this.cachedCommands = commands.value;
      this.emit('message', {
        jsonrpc: '2.0',
        method: 'session/supported_commands',
        params: { commands: commands.value },
      });
    } else {
      this.emit('message', {
        jsonrpc: '2.0',
        method: 'session/supported_commands',
        params: { error: commands.reason?.message || 'Failed to load commands' },
      });
    }
  }

  /**
   * Sends a prompt to the agent
   */
  async sendPrompt(content: string): Promise<void> {
    if (this.isShuttingDown) {
      throw new Error('Session is shutting down');
    }

    if (this.isProcessing) {
      throw new Error('A prompt is already being processed');
    }

    this.isProcessing = true;
    this.updateActivity();

    // Reset per-prompt state
    this.permissionDenials = [];

    // Create new abort controller for this prompt
    this.abortController = new AbortController();

    try {
      // Build options from config
      const options = this.buildOptions();

      // Start the query
      this.currentQuery = sdkQuery({ prompt: content, options });

      // Proactively cache session info when query starts
      this.cacheSessionInfo().catch((err) => {
        console.warn('[SDK-Session] Failed to cache session info:', err);
      });

      // Process messages from the async iterator
      for await (const message of this.currentQuery) {
        this.updateActivity();
        this.processSDKMessage(message);
      }

      // Query completed successfully
      this.isProcessing = false;

    } catch (error) {
      this.isProcessing = false;

      if (error instanceof Error && error.name === 'AbortError') {
        // Cancelled by user, not an error
        return;
      }

      this.emit('error', error);
      throw error;
    } finally {
      this.currentQuery = null;
      this.abortController = null;
    }
  }

  /**
   * Process an SDK message and translate to ACP-like format
   */
  private processSDKMessage(message: SDKMessage): void {
    // Update session ID if available and persist to database
    if ('session_id' in message && message.session_id) {
      const newSessionId = message.session_id;
      if (this.sdkSessionId !== newSessionId) {
        this.sdkSessionId = newSessionId;
        // Persist SDK session ID to database for resumption
        if (this.database) {
          this.database.updateSdkSessionId(this.id, newSessionId);
          // Also persist current SDK config
          this.database.updateSdkConfig(this.id, JSON.stringify(this.sdkConfig));
          console.log(`[SDK-Session] Persisted SDK session ID: ${newSessionId}`);
        }
      }
    }

    // Store message UUID for checkpointing
    if ('uuid' in message && message.uuid) {
      this.messageUuids.set(message.uuid, message.type);
    }

    switch (message.type) {
      case 'system':
        this.handleSystemMessage(message);
        break;

      case 'assistant':
        this.handleAssistantMessage(message as SDKAssistantMessage);
        break;

      case 'stream_event':
        this.handleStreamEvent(message);
        break;

      case 'result':
        this.handleResultMessage(message as SDKResultMessage);
        break;

      case 'user':
        // User messages are echoed back - emit for completeness
        this.emitSessionUpdate('user_message', {
          content: message.message,
        });
        break;

      case 'tool_progress':
        this.emitSessionUpdate('tool_progress', {
          toolUseId: message.tool_use_id,
          toolName: message.tool_name,
          elapsedSeconds: message.elapsed_time_seconds,
        });
        break;

      case 'auth_status':
        this.emitSessionUpdate('auth_status', {
          isAuthenticating: message.isAuthenticating,
          output: message.output,
          error: message.error,
        });
        break;

      default:
        // Forward unknown message types
        this.emitSessionUpdate('sdk_message', { raw: message });
    }
  }

  /**
   * Handle system messages from SDK
   */
  private handleSystemMessage(message: SDKMessage): void {
    if (message.type !== 'system') return;

    // Type assertion needed because SDK has multiple system message types
    // with different subtypes but TypeScript only knows about SDKSystemMessage
    const sysMessage = message as SDKSystemMessage & {
      subtype: string;
      status?: string;
      hook_id?: string;
      hook_name?: string;
      hook_event?: string;
      stdout?: string;
      stderr?: string;
      output?: string;
      outcome?: string;
      exit_code?: number;
      task_id?: string;
      output_file?: string;
      summary?: string;
      compact_metadata?: { trigger: string; pre_tokens: number };
    };

    const subtype = sysMessage.subtype as string;
    switch (subtype) {
      case 'init':
        this.emitSessionUpdate('init', {
          sessionId: this.sdkSessionId,
          tools: sysMessage.tools,
          model: sysMessage.model,
          cwd: sysMessage.cwd,
          permissionMode: sysMessage.permissionMode,
          mcpServers: sysMessage.mcp_servers,
          agents: sysMessage.agents,
        });
        break;

      case 'status':
        this.emitSessionUpdate('status', {
          status: sysMessage.status,
        });
        break;

      case 'hook_started':
        this.emitSessionUpdate('hook_started', {
          hookId: sysMessage.hook_id,
          hookName: sysMessage.hook_name,
          hookEvent: sysMessage.hook_event,
        });
        break;

      case 'hook_progress':
        this.emitSessionUpdate('hook_progress', {
          hookId: sysMessage.hook_id,
          stdout: sysMessage.stdout,
          stderr: sysMessage.stderr,
          output: sysMessage.output,
        });
        break;

      case 'hook_response':
        this.emitSessionUpdate('hook_response', {
          hookId: sysMessage.hook_id,
          outcome: sysMessage.outcome,
          exitCode: sysMessage.exit_code,
        });
        break;

      case 'task_notification':
        this.emitSessionUpdate('task_notification', {
          taskId: sysMessage.task_id,
          status: sysMessage.status,
          outputFile: sysMessage.output_file,
          summary: sysMessage.summary,
        });
        break;

      case 'compact_boundary':
        this.emitSessionUpdate('compact_boundary', {
          trigger: sysMessage.compact_metadata?.trigger,
          preTokens: sysMessage.compact_metadata?.pre_tokens,
        });
        break;

      default:
        // Forward other system messages
        this.emitSessionUpdate('system', sysMessage);
    }
  }

  /**
   * Handle assistant messages from SDK
   * Emits both legacy format (for backward compatibility) and first-class SDK message
   */
  private handleAssistantMessage(message: SDKAssistantMessage): void {
    const betaMessage = message.message;

    // Build native content blocks array
    const contentBlocks: SdkContentBlock[] = betaMessage.content.map((block: (typeof betaMessage.content)[number]) => {
      if (block.type === 'text') {
        return { type: 'text' as const, text: block.text };
      } else if (block.type === 'tool_use') {
        return { type: 'tool_use' as const, id: block.id, name: block.name, input: block.input };
      } else if (block.type === 'thinking') {
        return { type: 'thinking' as const, thinking: block.thinking, signature: (block as { signature?: string }).signature };
      }
      // Fallback for unknown block types
      return { type: 'text' as const, text: JSON.stringify(block) };
    });

    // Emit first-class SDK message with all content blocks
    this.emitSdkMessage('assistant_message', {
      messageId: message.uuid,
      stopReason: betaMessage.stop_reason,
      usage: betaMessage.usage,
      content: contentBlocks,
    });

    // Also emit legacy format for backward compatibility
    for (const block of betaMessage.content) {
      if (block.type === 'text') {
        this.emitSessionUpdate('agent_message_chunk', {
          content: {
            type: 'text',
            text: block.text,
          },
        });
      } else if (block.type === 'tool_use') {
        this.emitSessionUpdate('tool_call', {
          content: {
            type: 'tool_use',
            toolCallId: block.id,
            name: block.name,
            input: block.input,
          },
        });
      } else if (block.type === 'thinking') {
        this.emitSessionUpdate('thinking', {
          content: {
            type: 'thinking',
            thinking: block.thinking,
          },
        });
      }
    }

    // Emit message complete with usage tracking
    this.emitSessionUpdate('agent_message_complete', {
      messageId: message.uuid,
      stopReason: betaMessage.stop_reason,
      usage: betaMessage.usage,
    });
  }

  /**
   * Handle streaming events (partial messages)
   * Emits both SDK-native and legacy formats
   */
  private handleStreamEvent(message: SDKMessage): void {
    if (message.type !== 'stream_event') return;

    const event = message.event;

    // Forward relevant stream events
    if (event.type === 'content_block_delta') {
      const delta = event.delta;

      // Emit first-class SDK delta
      this.emitSdkMessage('assistant_delta', {
        index: event.index,
        delta,
      });

      // Also emit legacy format
      if (delta.type === 'text_delta') {
        this.emitSessionUpdate('agent_message_delta', {
          content: {
            type: 'text_delta',
            text: delta.text,
          },
        });
      } else if (delta.type === 'input_json_delta') {
        this.emitSessionUpdate('agent_message_delta', {
          content: {
            type: 'input_json_delta',
            partialJson: delta.partial_json,
          },
        });
      } else if (delta.type === 'thinking_delta') {
        this.emitSessionUpdate('agent_message_delta', {
          content: {
            type: 'thinking_delta',
            thinking: delta.thinking,
          },
        });
      }
    } else if (event.type === 'content_block_start') {
      // Emit first-class SDK block start
      this.emitSdkMessage('content_block_start', {
        index: event.index,
        contentBlock: event.content_block,
      });

      // Also emit legacy format
      this.emitSessionUpdate('content_block_start', {
        index: event.index,
        contentBlock: event.content_block,
      });
    } else if (event.type === 'content_block_stop') {
      // Emit first-class SDK block stop
      this.emitSdkMessage('content_block_stop', {
        index: event.index,
      });

      // Also emit legacy format
      this.emitSessionUpdate('content_block_stop', {
        index: event.index,
      });
    }
  }

  /**
   * Handle result messages from SDK with full tracking
   */
  private handleResultMessage(message: SDKResultMessage): void {
    // Track permission denials - SDK type doesn't have message, we provide a default
    if ('permission_denials' in message && message.permission_denials) {
      const denials = message.permission_denials as SDKPermissionDenial[];
      this.permissionDenials.push(...denials.map(d => ({
        toolName: d.tool_name,
        toolInput: d.tool_input,
        message: `Permission denied for ${d.tool_name}`,
      })));
    }

    // Extract model usage
    const modelUsage: Record<string, ModelUsage> = {};
    if ('modelUsage' in message && message.modelUsage) {
      const rawUsage = message.modelUsage as Record<string, {
        inputTokens?: number;
        outputTokens?: number;
        cacheReadInputTokens?: number;
        cacheCreationInputTokens?: number;
        webSearchRequests?: number;
        costUSD?: number;
        contextWindow?: number;
        maxOutputTokens?: number;
      }>;
      for (const [model, usage] of Object.entries(rawUsage)) {
        modelUsage[model] = {
          inputTokens: usage.inputTokens || 0,
          outputTokens: usage.outputTokens || 0,
          cacheReadInputTokens: usage.cacheReadInputTokens || 0,
          cacheCreationInputTokens: usage.cacheCreationInputTokens || 0,
          webSearchRequests: usage.webSearchRequests || 0,
          costUSD: usage.costUSD || 0,
          contextWindow: usage.contextWindow,
          maxOutputTokens: usage.maxOutputTokens,
        };
      }
    }

    // Store result
    this.lastResult = {
      success: message.subtype === 'success',
      result: message.subtype === 'success' ? message.result : undefined,
      errors: message.subtype !== 'success' ? message.errors : undefined,
      subtype: message.subtype as ResultSubtype,
      numTurns: message.num_turns,
      durationMs: message.duration_ms,
      durationApiMs: message.duration_api_ms,
      totalCostUsd: message.total_cost_usd,
      usage: modelUsage,
      structuredOutput: 'structured_output' in message ? message.structured_output : undefined,
      permissionDenials: this.permissionDenials,
    };

    if (message.subtype === 'success') {
      const payload = {
        result: message.result,
        numTurns: message.num_turns,
        durationMs: message.duration_ms,
        durationApiMs: message.duration_api_ms,
        totalCostUsd: message.total_cost_usd,
        usage: message.usage,
        modelUsage,
        structuredOutput: 'structured_output' in message ? message.structured_output : undefined,
        permissionDenials: this.permissionDenials,
      };

      // Emit first-class SDK message
      this.emitSdkMessage('prompt_complete', payload);

      // Also emit legacy format
      this.emitSessionUpdate('prompt_complete', payload);
    } else {
      const payload = {
        subtype: message.subtype,
        errors: message.errors,
        numTurns: message.num_turns,
        durationMs: message.duration_ms,
        durationApiMs: message.duration_api_ms,
        totalCostUsd: message.total_cost_usd,
        modelUsage,
        permissionDenials: this.permissionDenials,
      };

      // Emit first-class SDK message
      this.emitSdkMessage('prompt_error', payload);

      // Also emit legacy format
      this.emitSessionUpdate('prompt_error', payload);
    }
  }

  /**
   * Emit a session update event (legacy JSON-RPC format for backward compatibility)
   */
  private emitSessionUpdate(updateType: string, data: Record<string, unknown>): void {
    const params = {
      update: {
        sessionUpdate: updateType,
        ...data,
      },
    };

    // Emit as session_update for direct handlers
    this.emit('session_update', params);

    // Also emit as message for WebSocket broadcast
    this.emit('message', {
      jsonrpc: '2.0',
      method: 'session/update',
      params,
    });
  }

  /**
   * Emit a first-class SDK message (no JSON-RPC wrapper)
   * These messages use the 'kind: sdk' discriminator for frontend routing
   */
  private emitSdkMessage(type: string, payload: unknown): void {
    const message: SdkWsMessage = {
      kind: 'sdk',
      sessionId: this.id,
      type,
      payload,
    };
    this.emit('sdk_message', message);
  }

  // ===========================================================================
  // Query Control Methods
  // ===========================================================================

  /**
   * Interrupt the current query gracefully
   */
  async interrupt(): Promise<void> {
    if (this.currentQuery) {
      await this.currentQuery.interrupt();
    }
  }

  /**
   * Set permission mode for the current query
   */
  async setPermissionMode(mode: PermissionMode): Promise<void> {
    if (this.currentQuery) {
      await this.currentQuery.setPermissionMode(mode);
    }
    this.sdkConfig.permissionMode = mode;
    this.emitSessionUpdate('config_changed', { permissionMode: mode });
  }

  /**
   * Set model for the current query
   */
  async setModel(model?: string): Promise<void> {
    if (this.currentQuery) {
      await this.currentQuery.setModel(model);
    }
    this.sdkConfig.model = model;
    this.emitSessionUpdate('config_changed', { model });
  }

  /**
   * Set max thinking tokens for the current query
   */
  async setMaxThinkingTokens(tokens: number | null): Promise<void> {
    if (this.currentQuery) {
      await this.currentQuery.setMaxThinkingTokens(tokens);
    }
    this.sdkConfig.maxThinkingTokens = tokens ?? undefined;
    this.emitSessionUpdate('config_changed', { maxThinkingTokens: tokens });
  }

  // ===========================================================================
  // Info Retrieval Methods
  // ===========================================================================

  /**
   * Get supported slash commands/skills
   */
  async getSupportedCommands(): Promise<SlashCommand[]> {
    if (this.currentQuery) {
      const commands = await this.currentQuery.supportedCommands();
      this.cachedCommands = commands;
      return commands;
    }
    if (this.cachedCommands) {
      return this.cachedCommands;
    }
    throw new Error('No active query - send a prompt first');
  }

  /**
   * Get supported models
   */
  async getSupportedModels(): Promise<ModelInfo[]> {
    if (this.currentQuery) {
      const models = await this.currentQuery.supportedModels();
      this.cachedModels = models;
      return models;
    }
    if (this.cachedModels) {
      return this.cachedModels;
    }
    throw new Error('No active query - send a prompt first');
  }

  /**
   * Get account information
   */
  async getAccountInfo(): Promise<AccountInfo> {
    if (this.currentQuery) {
      const accountInfo = await this.currentQuery.accountInfo();
      this.cachedAccountInfo = accountInfo;
      return accountInfo;
    }
    if (this.cachedAccountInfo) {
      return this.cachedAccountInfo;
    }
    throw new Error('No active query - send a prompt first');
  }

  /**
   * Get MCP server status
   */
  async getMcpServerStatus(): Promise<McpServerStatus[]> {
    if (this.currentQuery) {
      const mcpStatus = await this.currentQuery.mcpServerStatus();
      this.cachedMcpStatus = mcpStatus;
      return mcpStatus;
    }
    if (this.cachedMcpStatus) {
      return this.cachedMcpStatus;
    }
    throw new Error('No active query - send a prompt first');
  }

  // ===========================================================================
  // File Checkpointing
  // ===========================================================================

  /**
   * Rewind files to a checkpoint
   */
  async rewindFiles(messageId: string, dryRun = false): Promise<RewindFilesResult> {
    if (!this.currentQuery) {
      throw new Error('No active query - send a prompt first');
    }
    if (!this.sdkConfig.enableFileCheckpointing) {
      return { canRewind: false, error: 'File checkpointing not enabled' };
    }
    return this.currentQuery.rewindFiles(messageId, { dryRun });
  }

  /**
   * Get list of available checkpoint message IDs
   */
  getCheckpointMessageIds(): string[] {
    return Array.from(this.messageUuids.keys());
  }

  // ===========================================================================
  // MCP Management
  // ===========================================================================

  /**
   * Set MCP servers dynamically
   */
  async setMcpServers(servers: Record<string, McpServerConfig>): Promise<McpSetServersResult> {
    if (!this.currentQuery) {
      throw new Error('No active query - send a prompt first');
    }
    const result = await this.currentQuery.setMcpServers(servers as Parameters<Query['setMcpServers']>[0]);
    // Update local config
    this.sdkConfig.mcpServers = { ...this.sdkConfig.mcpServers, ...servers };
    return result;
  }

  // ===========================================================================
  // Result Tracking
  // ===========================================================================

  /**
   * Get the last result from a completed prompt
   */
  getLastResult(): SessionResult | null {
    return this.lastResult;
  }

  /**
   * Get permission denials from the current/last prompt
   */
  getPermissionDenials(): PermissionDenial[] {
    return [...this.permissionDenials];
  }

  // ===========================================================================
  // Permission Response
  // ===========================================================================

  /**
   * Responds to a permission request
   */
  async respondToPermission(
    toolCallId: string,
    optionId: string,
    answers?: Record<string, string>
  ): Promise<void> {
    const pending = this.pendingPermissions.get(toolCallId);
    if (!pending) {
      throw new Error(`No pending permission request for toolCallId: ${toolCallId}`);
    }

    let result: PermissionResult;

    if (optionId === 'allow' || optionId === 'allow_always' || optionId.startsWith('suggestion_')) {
      result = {
        behavior: 'allow',
        toolUseID: toolCallId,
        ...(answers && { updatedInput: answers }),
      };
    } else {
      result = {
        behavior: 'deny',
        message: 'User denied permission',
        toolUseID: toolCallId,
      };
    }

    pending.resolve(result);
    this.pendingPermissions.delete(toolCallId);
  }

  /**
   * Cancels a permission request
   */
  async cancelPermission(toolCallId: string): Promise<void> {
    const pending = this.pendingPermissions.get(toolCallId);
    if (!pending) {
      throw new Error(`No pending permission request for toolCallId: ${toolCallId}`);
    }

    pending.resolve({
      behavior: 'deny',
      message: 'Permission request cancelled',
      interrupt: true,
      toolUseID: toolCallId,
    });

    this.pendingPermissions.delete(toolCallId);
  }

  /**
   * Cancels the current prompt
   */
  async cancelPrompt(): Promise<void> {
    if (this.abortController) {
      this.abortController.abort();
    }

    if (this.currentQuery) {
      this.currentQuery.close();
    }

    // Cancel all pending permissions
    for (const [toolCallId, pending] of this.pendingPermissions) {
      pending.resolve({
        behavior: 'deny',
        message: 'Prompt cancelled',
        interrupt: true,
        toolUseID: toolCallId,
      });
    }
    this.pendingPermissions.clear();

    this.isProcessing = false;
  }

  // ===========================================================================
  // Activity & Lifecycle
  // ===========================================================================

  /**
   * Updates last activity time and resets idle timer
   */
  private updateActivity(): void {
    this.lastActivityTime = Date.now();
    this.resetIdleTimer();
    this.emit('activity');
  }

  /**
   * Resets the idle timeout timer
   */
  private resetIdleTimer(): void {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
    }

    this.idleTimer = setTimeout(() => {
      const idle = Date.now() - this.lastActivityTime;
      if (idle >= this.config.sessionIdleTimeoutMs) {
        this.emit('idle');
        this.terminate();
      }
    }, this.config.sessionIdleTimeoutMs);
  }

  /**
   * Gracefully terminates the session
   */
  async terminate(): Promise<void> {
    if (this.isShuttingDown) {
      return;
    }

    this.isShuttingDown = true;

    // Cancel any active prompt
    await this.cancelPrompt();

    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }

    this.emit('exit', { code: 0, signal: null });
  }

  /**
   * Gets session status
   */
  getStatus(): {
    id: string;
    agent: AgentType;
    authMode: string;
    running: boolean;
    pendingRequests: number;
    lastActivityTime: number;
    idleMs: number;
    acpSessionId: string | null;
    sdkSessionId: string | null;
    isResumable: boolean;
    config: SdkSessionConfig;
    lastResult: SessionResult | null;
    workingDirectory: string | undefined;
  } {
    return {
      id: this.id,
      agent: this.agentType,
      authMode: this.sessionConfig.auth.mode,
      running: !this.isShuttingDown,
      pendingRequests: this.pendingPermissions.size,
      lastActivityTime: this.lastActivityTime,
      idleMs: Date.now() - this.lastActivityTime,
      acpSessionId: this.sdkSessionId, // Backward compat
      sdkSessionId: this.sdkSessionId, // Explicit field
      isResumable: !this.isShuttingDown && !!this.sdkSessionId,
      config: this.sdkConfig,
      lastResult: this.lastResult,
      workingDirectory: this.worktreePath,
    };
  }

  /**
   * Get the working directory for this session
   */
  getWorkingDirectory(): string | undefined {
    return this.worktreePath;
  }
}
