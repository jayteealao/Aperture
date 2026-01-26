/**
 * Pi SDK Session
 * Manages Pi Coding Agent SDK interactions via library calls (no subprocess)
 */

import { EventEmitter } from 'events';
import type { Config } from './config.js';
import type { ApertureDatabase } from './database.js';
import type { AgentType, SessionConfig } from './agents/types.js';
import type {
  PiSessionConfig,
  PiThinkingLevel,
  PiSessionStats,
  PiModelInfo,
  PiSessionTree,
  PiWsMessage,
  PiEvent,
  PiSessionStatus,
  PiModelConfig,
  PiForkableEntry,
  PiSessionEntry,
} from './agents/pi-types.js';

// Re-export PiWsMessage for use in routes.ts
export type { PiWsMessage } from './agents/pi-types.js';

// Dynamic import types for Pi SDK
type CreateAgentSessionFn = typeof import('@mariozechner/pi-coding-agent')['createAgentSession'];
type AgentSession = Awaited<ReturnType<CreateAgentSessionFn>>['session'];

/**
 * PiSession class
 * Wraps Pi Coding Agent SDK for use in Aperture
 */
export class PiSession extends EventEmitter {
  public readonly id: string;
  public readonly agentType: AgentType = 'pi_sdk';
  public piSessionPath: string | null = null;

  private config: Config;
  private sessionConfig: SessionConfig;
  private piConfig: PiSessionConfig;
  private database?: ApertureDatabase;
  private resolvedApiKey?: string;
  private worktreePath?: string;

  private agentSession: AgentSession | null = null;
  private unsubscribe: (() => void) | null = null;
  private isShuttingDown = false;
  private lastActivityTime: number = Date.now();
  private idleTimer: NodeJS.Timeout | null = null;

  // Cached session info
  private cachedModels: PiModelInfo[] | null = null;
  private cachedStats: PiSessionStats | null = null;
  private currentModel: PiModelConfig | null = null;
  private currentThinkingLevel: PiThinkingLevel = 'off';
  private isCurrentlyStreaming = false;

  constructor(
    sessionConfig: SessionConfig,
    config: Config,
    database?: ApertureDatabase,
    resolvedApiKey?: string,
    cwd?: string
  ) {
    super();
    this.id = sessionConfig.id;
    this.sessionConfig = sessionConfig;
    this.config = config;
    this.database = database;
    this.piConfig = sessionConfig.pi || {};
    this.resolvedApiKey = resolvedApiKey;
    this.worktreePath = cwd;
    this.currentThinkingLevel = this.piConfig.thinkingLevel || 'off';
  }

  /**
   * Start the Pi session
   */
  async start(): Promise<void> {
    this.resetIdleTimer();

    // Dynamic import of Pi SDK
    const {
      createAgentSession,
      SessionManager,
      AuthStorage,
      ModelRegistry,
      DefaultResourceLoader,
      codingTools,
      readOnlyTools,
    } = await import('@mariozechner/pi-coding-agent');

    const cwd = this.worktreePath || process.cwd();

    // Set up auth storage
    const authStoragePath = this.piConfig.agentDir
      ? `${this.piConfig.agentDir}/auth.json`
      : undefined;
    const authStorage = new AuthStorage(authStoragePath ? { authPath: authStoragePath } : undefined);

    // Set runtime override if API key provided
    if (this.resolvedApiKey && this.sessionConfig.auth?.providerKey) {
      authStorage.setRuntimeOverride(this.sessionConfig.auth.providerKey, this.resolvedApiKey);
    }

    // Set up model registry
    const modelRegistry = new ModelRegistry({ authStorage });

    // Determine model
    let model = undefined;
    if (this.piConfig.model) {
      model = modelRegistry.getModel(this.piConfig.model.provider, this.piConfig.model.modelId);
      if (model) {
        this.currentModel = this.piConfig.model;
      }
    }

    // Set up session manager based on mode
    let sessionManager;
    switch (this.piConfig.sessionMode) {
      case 'inMemory':
        sessionManager = SessionManager.inMemory();
        break;
      case 'continueRecent':
        sessionManager = SessionManager.continueRecent(cwd);
        break;
      case 'open':
        if (this.piConfig.sessionPath) {
          sessionManager = SessionManager.open(this.piConfig.sessionPath);
        } else {
          sessionManager = SessionManager.create(cwd);
        }
        break;
      case 'create':
      default:
        sessionManager = SessionManager.create(cwd);
    }

    // Set up resource loader
    const resourceLoader = new DefaultResourceLoader({
      cwd,
      agentDir: this.piConfig.agentDir,
      systemPromptOverride: this.piConfig.systemPromptOverride
        ? () => this.piConfig.systemPromptOverride!
        : undefined,
    });
    await resourceLoader.reload();

    // Determine tools
    let tools = codingTools;
    if (this.piConfig.toolSet === 'readOnlyTools') {
      tools = readOnlyTools;
    }

    // Create agent session
    const { session, extensionsResult, modelFallbackMessage } = await createAgentSession({
      model,
      thinkingLevel: this.piConfig.thinkingLevel,
      tools,
      sessionManager,
      authStorage,
      modelRegistry,
      resourceLoader,
      cwd,
      agentDir: this.piConfig.agentDir,
    });

    this.agentSession = session;
    this.currentThinkingLevel = this.piConfig.thinkingLevel || 'off';

    // Store session path for resumption
    if (sessionManager && typeof sessionManager.getPath === 'function') {
      this.piSessionPath = sessionManager.getPath();
      if (this.database && this.piSessionPath) {
        this.database.updatePiSessionPath(this.id, this.piSessionPath);
        this.database.updateSdkConfig(this.id, JSON.stringify(this.piConfig));
      }
    }

    // Subscribe to events
    this.unsubscribe = session.subscribe((event: PiEvent) => {
      this.handlePiEvent(event);
    });

    // Emit init message for frontend
    const initMessage = {
      jsonrpc: '2.0' as const,
      method: 'session/update',
      params: {
        update: {
          sessionUpdate: 'init',
          sessionId: this.id,
          agentType: 'pi_sdk',
          config: this.piConfig,
          modelFallbackMessage,
          extensionsLoaded: extensionsResult?.loaded?.length || 0,
          thinkingLevel: this.currentThinkingLevel,
        },
      },
    };
    this.emit('message', initMessage);

    console.log(`[PiSession] Started session ${this.id} with Pi SDK`);
  }

  /**
   * Handle events from Pi SDK
   */
  private handlePiEvent(event: PiEvent): void {
    this.resetIdleTimer();
    this.emit('activity');

    // Emit first-class Pi message
    const piMessage: PiWsMessage = {
      kind: 'pi',
      sessionId: this.id,
      type: event.type,
      payload: event,
    };
    this.emit('pi_message', piMessage);

    // Also emit legacy JSON-RPC format for backwards compatibility
    switch (event.type) {
      case 'message_update':
        this.handleMessageUpdate(event);
        break;

      case 'tool_execution_start':
        this.emitSessionUpdate('tool_start', {
          toolName: event.toolName,
          toolCallId: event.toolCallId,
          input: event.input,
        });
        break;

      case 'tool_execution_update':
        this.emitSessionUpdate('tool_progress', {
          toolName: event.toolName,
          toolCallId: event.toolCallId,
          partialResult: event.partialResult,
        });
        break;

      case 'tool_execution_end':
        this.emitSessionUpdate('tool_end', {
          toolName: event.toolName,
          toolCallId: event.toolCallId,
          result: event.result,
          error: event.error,
          isError: event.isError,
        });
        break;

      case 'agent_start':
        this.isCurrentlyStreaming = true;
        this.emitSessionUpdate('agent_start', {});
        break;

      case 'agent_end':
        this.isCurrentlyStreaming = false;
        this.emitSessionUpdate('agent_end', {
          result: event.result,
          error: event.error,
        });
        break;

      case 'turn_start':
        this.emitSessionUpdate('turn_start', {
          turnIndex: event.turnIndex,
        });
        break;

      case 'turn_end':
        this.emitSessionUpdate('turn_end', {
          turnIndex: event.turnIndex,
          usage: event.usage,
          stopReason: event.stopReason,
        });
        // Update stats
        if (event.usage) {
          this.updateStats(event.usage);
        }
        break;

      case 'auto_compaction_start':
        this.emitSessionUpdate('compaction_start', {
          preTokens: event.preTokens,
        });
        break;

      case 'auto_compaction_end':
        this.emitSessionUpdate('compaction_end', {
          preTokens: event.preTokens,
          postTokens: event.postTokens,
        });
        break;

      case 'auto_retry_start':
        this.emitSessionUpdate('retry_start', {
          attempt: event.attempt,
          maxAttempts: event.maxAttempts,
          delayMs: event.delayMs,
          error: event.error,
        });
        break;

      case 'auto_retry_end':
        this.emitSessionUpdate('retry_end', {
          attempt: event.attempt,
          success: event.success,
        });
        break;

      case 'extension_error':
        this.emitSessionUpdate('extension_error', {
          extensionName: event.extensionName,
          error: event.error,
        });
        break;

      case 'message_start':
        this.emitSessionUpdate('message_start', {});
        break;

      case 'message_end':
        this.emitSessionUpdate('message_end', {});
        break;
    }
  }

  /**
   * Handle message_update events (streaming deltas)
   */
  private handleMessageUpdate(event: { type: 'message_update'; assistantMessageEvent: { type: string; delta?: string; toolCallId?: string; toolName?: string; inputJson?: string; error?: string } }): void {
    const msgEvent = event.assistantMessageEvent;

    switch (msgEvent.type) {
      case 'text_start':
        this.emitSessionUpdate('text_start', {});
        break;

      case 'text_delta':
        this.emitSessionUpdate('agent_message_chunk', {
          content: { type: 'text', text: msgEvent.delta },
        });
        break;

      case 'text_end':
        this.emitSessionUpdate('text_end', {});
        break;

      case 'thinking_start':
        this.emitSessionUpdate('thinking_start', {});
        break;

      case 'thinking_delta':
        this.emitSessionUpdate('agent_message_chunk', {
          content: { type: 'thinking', thinking: msgEvent.delta },
        });
        break;

      case 'thinking_end':
        this.emitSessionUpdate('thinking_end', {});
        break;

      case 'toolcall_start':
        this.emitSessionUpdate('tool_use_start', {
          id: msgEvent.toolCallId,
          name: msgEvent.toolName,
        });
        break;

      case 'toolcall_delta':
        this.emitSessionUpdate('tool_use_delta', {
          id: msgEvent.toolCallId,
          inputDelta: msgEvent.delta || msgEvent.inputJson,
        });
        break;

      case 'toolcall_end':
        this.emitSessionUpdate('tool_use_end', {
          id: msgEvent.toolCallId,
        });
        break;

      case 'error':
        this.emitSessionUpdate('error', {
          error: msgEvent.error,
        });
        break;

      case 'done':
        this.emitSessionUpdate('done', {});
        break;
    }
  }

  /**
   * Emit session update in JSON-RPC format
   */
  private emitSessionUpdate(updateType: string, data: Record<string, unknown>): void {
    this.emit('session_update', {
      update: {
        sessionUpdate: updateType,
        ...data,
      },
    });
  }

  /**
   * Update cached stats
   */
  private updateStats(usage: { inputTokens: number; outputTokens: number }): void {
    if (!this.cachedStats) {
      this.cachedStats = {
        inputTokens: 0,
        outputTokens: 0,
        totalCost: 0,
        turnCount: 0,
      };
    }
    this.cachedStats.inputTokens += usage.inputTokens;
    this.cachedStats.outputTokens += usage.outputTokens;
    this.cachedStats.turnCount += 1;
    // Cost calculation would require model pricing info
  }

  /**
   * Send a prompt to the agent
   */
  async sendPrompt(content: string): Promise<void> {
    if (!this.agentSession) {
      throw new Error('Session not started');
    }

    // Use streamingBehavior if agent is already streaming
    const options = this.agentSession.isStreaming
      ? { streamingBehavior: this.piConfig.streamingBehavior || 'followUp' as const }
      : undefined;

    try {
      await this.agentSession.prompt(content, options);
    } catch (error) {
      console.error(`[PiSession] Error sending prompt:`, error);
      this.emitSessionUpdate('error', {
        error: (error as Error).message,
      });
      throw error;
    }
  }

  /**
   * Steer the agent mid-run (interrupt and redirect)
   */
  async steer(content: string): Promise<void> {
    if (!this.agentSession) {
      throw new Error('Session not started');
    }
    this.agentSession.steer(content);
  }

  /**
   * Queue a follow-up message for when the agent finishes
   */
  async followUp(content: string): Promise<void> {
    if (!this.agentSession) {
      throw new Error('Session not started');
    }
    this.agentSession.followUp(content);
  }

  /**
   * Abort the current operation
   */
  async abort(): Promise<void> {
    if (this.agentSession) {
      this.agentSession.abort();
    }
  }

  /**
   * Set the model
   */
  async setModel(provider: string, modelId: string): Promise<void> {
    if (!this.agentSession) return;

    const { ModelRegistry, AuthStorage } = await import('@mariozechner/pi-coding-agent');
    const authStorage = new AuthStorage();
    const registry = new ModelRegistry({ authStorage });
    const model = registry.getModel(provider, modelId);

    if (model) {
      this.agentSession.setModel(model);
      this.currentModel = { provider: provider as PiModelConfig['provider'], modelId };
      this.emitSessionUpdate('model_changed', {
        provider,
        modelId,
      });
    }
  }

  /**
   * Cycle to the next model in the scoped models list
   */
  async cycleModel(): Promise<PiModelConfig | null> {
    if (!this.agentSession) return null;

    const result = this.agentSession.cycleModel();
    if (result) {
      this.currentModel = {
        provider: result.provider as PiModelConfig['provider'],
        modelId: result.modelId,
      };
      this.emitSessionUpdate('model_changed', {
        provider: result.provider,
        modelId: result.modelId,
      });
      return this.currentModel;
    }
    return null;
  }

  /**
   * Set thinking level
   */
  async setThinkingLevel(level: PiThinkingLevel): Promise<void> {
    // Pi SDK thinking level is set at session creation
    // Store for reference but note it may require session restart to take effect
    this.currentThinkingLevel = level;
    this.piConfig.thinkingLevel = level;

    if (this.database) {
      this.database.updateSdkConfig(this.id, JSON.stringify(this.piConfig));
    }
  }

  /**
   * Cycle through thinking levels
   */
  async cycleThinkingLevel(): Promise<PiThinkingLevel> {
    if (!this.agentSession) return 'off';

    this.agentSession.cycleThinkingLevel();
    // Get new level from session state
    const newLevel = (this.agentSession.state?.thinkingLevel || 'off') as PiThinkingLevel;
    this.currentThinkingLevel = newLevel;

    this.emitSessionUpdate('thinking_level_changed', {
      level: newLevel,
    });

    return newLevel;
  }

  /**
   * Compact the conversation context
   */
  async compact(instructions?: string): Promise<void> {
    if (!this.agentSession) return;

    this.emitSessionUpdate('compaction_start', { manual: true });
    await this.agentSession.compact(instructions);
    this.emitSessionUpdate('compaction_end', { manual: true });
  }

  /**
   * Fork the session at a specific entry
   */
  async fork(entryId: string): Promise<void> {
    if (!this.agentSession) return;

    await this.agentSession.fork(entryId);
    this.emitSessionUpdate('session_forked', { entryId });
  }

  /**
   * Navigate to a specific entry in the session tree
   */
  async navigateTree(entryId: string): Promise<void> {
    if (!this.agentSession) return;

    await this.agentSession.navigateTree(entryId);
    this.emitSessionUpdate('tree_navigated', { entryId });
  }

  /**
   * Start a new session (clear history)
   */
  async newSession(): Promise<void> {
    if (!this.agentSession) return;

    await this.agentSession.newSession();
    this.cachedStats = null;
    this.emitSessionUpdate('new_session', {});
  }

  /**
   * Get the session tree
   */
  async getSessionTree(): Promise<PiSessionTree | null> {
    if (!this.agentSession) return null;

    // Access session manager through the session
    const sessionManager = (this.agentSession as unknown as { sessionManager?: { getTree?: () => unknown; getPath?: () => string } }).sessionManager;
    if (!sessionManager || typeof sessionManager.getTree !== 'function') {
      return null;
    }

    const tree = sessionManager.getTree();
    if (!tree) return null;

    // Transform to our tree format
    const entries: PiSessionEntry[] = [];
    const branches: Record<string, string[]> = {};
    const labels: Record<string, string> = {};

    // Parse tree structure (implementation depends on Pi SDK internals)
    // This is a simplified version
    return {
      entries,
      leafId: '',
      branches,
      labels,
    };
  }

  /**
   * Get forkable entries (user messages that can be branched from)
   */
  async getForkableEntries(): Promise<PiForkableEntry[]> {
    if (!this.agentSession) return [];

    // Get messages from session state
    const messages = this.agentSession.state?.messages || [];
    const forkable: PiForkableEntry[] = [];

    for (const msg of messages) {
      if (msg.role === 'user' && typeof msg.content === 'string') {
        forkable.push({
          id: msg.id || `msg-${forkable.length}`,
          type: 'user_message',
          content: msg.content,
          timestamp: msg.timestamp || Date.now(),
        });
      }
    }

    return forkable;
  }

  /**
   * Get session stats
   */
  async getStats(): Promise<PiSessionStats | null> {
    if (!this.agentSession) return null;

    // Try to get stats from session
    if (typeof (this.agentSession as unknown as { getStats?: () => PiSessionStats }).getStats === 'function') {
      return (this.agentSession as unknown as { getStats: () => PiSessionStats }).getStats();
    }

    return this.cachedStats;
  }

  /**
   * Get available models
   */
  async getAvailableModels(): Promise<PiModelInfo[]> {
    if (this.cachedModels) return this.cachedModels;

    const { ModelRegistry, AuthStorage } = await import('@mariozechner/pi-coding-agent');
    const authStorage = new AuthStorage();
    const registry = new ModelRegistry({ authStorage });
    const available = registry.getAvailable();

    this.cachedModels = available.map((m: { provider: string; modelId: string; displayName?: string; supportsThinking?: boolean; contextWindow?: number; maxOutputTokens?: number }) => ({
      provider: m.provider as PiModelInfo['provider'],
      modelId: m.modelId,
      displayName: m.displayName || m.modelId,
      supportsThinking: m.supportsThinking || false,
      contextWindow: m.contextWindow,
      maxOutputTokens: m.maxOutputTokens,
    }));

    return this.cachedModels;
  }

  /**
   * Get current session status
   */
  getStatus(): PiSessionStatus {
    return {
      id: this.id,
      agent: 'pi_sdk',
      authMode: this.sessionConfig.auth?.mode || 'unknown',
      running: this.isCurrentlyStreaming,
      pendingRequests: 0,
      lastActivityTime: this.lastActivityTime,
      idleMs: Date.now() - this.lastActivityTime,
      piSessionPath: this.piSessionPath,
      isResumable: !this.isShuttingDown && !!this.piSessionPath,
      workingDirectory: this.worktreePath,
      thinkingLevel: this.currentThinkingLevel,
      currentModel: this.currentModel || undefined,
      isStreaming: this.agentSession?.isStreaming || false,
    };
  }

  /**
   * Reset idle timer
   */
  private resetIdleTimer(): void {
    this.lastActivityTime = Date.now();
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
    }
    this.idleTimer = setTimeout(() => {
      if (!this.isShuttingDown) {
        this.emit('idle');
      }
    }, this.config.sessionIdleTimeoutMs);
  }

  /**
   * Terminate the session
   */
  async terminate(): Promise<void> {
    this.isShuttingDown = true;

    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }

    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }

    if (this.agentSession) {
      this.agentSession.dispose();
      this.agentSession = null;
    }

    this.emit('exit', { code: 0, signal: null });
  }

  // =============================================================================
  // Stub methods for interface compatibility with SdkSession
  // =============================================================================

  /**
   * Cancel the current prompt (alias for abort)
   */
  async cancelPrompt(): Promise<void> {
    await this.abort();
  }

  /**
   * Interrupt the agent (steer with empty content)
   */
  async interrupt(): Promise<void> {
    if (this.agentSession?.isStreaming) {
      this.agentSession.steer('');
    }
  }

  /**
   * Respond to permission request
   * Pi SDK uses extension system for tool control, not explicit permissions
   */
  async respondToPermission(_toolCallId: string, _optionId: string, _answers?: Record<string, string>): Promise<void> {
    // No-op for Pi SDK - permissions handled differently
    console.log('[PiSession] respondToPermission called but Pi SDK does not use explicit permissions');
  }

  /**
   * Cancel permission request
   */
  async cancelPermission(_toolCallId: string): Promise<void> {
    // No-op for Pi SDK
  }

  /**
   * Set working directory path (for worktree support)
   */
  setWorktreePath(path: string): void {
    this.worktreePath = path;
  }
}
