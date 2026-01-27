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
  // Note: In Pi SDK 0.50.0, API keys are configured via ~/.pi/agent/auth.json
  // or environment variables in models.json headers, not via runtime override
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
    _resolvedApiKey?: string, // Unused in Pi SDK 0.50.0 - keys via auth.json or env vars
    cwd?: string
  ) {
    super();
    this.id = sessionConfig.id;
    this.sessionConfig = sessionConfig;
    this.config = config;
    this.database = database;
    this.piConfig = sessionConfig.pi || {};
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

    // Set up auth storage (0.50.0: takes path string directly, defaults to ~/.pi/agent)
    const authStoragePath = this.piConfig.agentDir
      ? `${this.piConfig.agentDir}/auth.json`
      : undefined;
    const authStorage = new AuthStorage(authStoragePath);

    // Set up model registry (0.50.0: takes authStorage directly)
    const modelRegistry = new ModelRegistry(authStorage);

    // Determine model (0.50.0: use getAvailable and find)
    let model = undefined;
    if (this.piConfig.model) {
      const availableModels = modelRegistry.getAvailable();
      model = availableModels.find(
        (m: { api: string; id: string }) =>
          m.api === this.piConfig.model!.provider && m.id === this.piConfig.model!.modelId
      );
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

    // Store session path for resumption (0.50.0: access path from session state)
    const sessionPath = (session.state as { sessionPath?: string } | undefined)?.sessionPath;
    if (sessionPath) {
      this.piSessionPath = sessionPath;
      if (this.database) {
        this.database.updatePiSessionPath(this.id, this.piSessionPath);
        this.database.updateSdkConfig(this.id, JSON.stringify(this.piConfig));
      }
    }

    // Subscribe to events (0.50.0: event shape may differ, handle safely)
    this.unsubscribe = session.subscribe((event: unknown) => {
      this.handlePiEvent(event as PiEvent);
    });

    // Emit init message for frontend (0.50.0: extensionsResult renamed to packagesResult)
    const packagesLoaded = extensionsResult
      ? (Array.isArray(extensionsResult) ? extensionsResult.length : 0)
      : 0;
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
          extensionsLoaded: packagesLoaded,
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

    // Handle local side effects only (no legacy emitSessionUpdate — pi_message is the canonical path)
    switch (event.type) {
      case 'agent_start':
        this.isCurrentlyStreaming = true;
        break;

      case 'agent_end':
        this.isCurrentlyStreaming = false;
        break;

      case 'turn_end':
        if (event.usage) {
          this.updateStats(event.usage);
        }
        break;
    }
  }

  /**
   * Emit session update in JSON-RPC format
   * Used by non-streaming methods (compact, fork, setModel, etc.)
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
   * Send a prompt to the agent, optionally with image attachments
   */
  async sendPrompt(content: string, images?: import('./agents/types.js').ImageAttachment[]): Promise<void> {
    if (!this.agentSession) {
      throw new Error('Session not started');
    }

    // Build prompt options
    const options: Record<string, unknown> = {};

    // Use streamingBehavior if agent is already streaming
    if (this.agentSession.isStreaming) {
      options.streamingBehavior = this.piConfig.streamingBehavior || 'followUp';
    }

    // Attach images if provided (Pi SDK format: { type: 'image', data, mimeType })
    if (images && images.length > 0) {
      options.images = images.map((img) => ({
        type: 'image' as const,
        data: img.data,
        mimeType: img.mimeType,
      }));
    }

    try {
      await this.agentSession.prompt(
        content,
        Object.keys(options).length > 0 ? options : undefined,
      );
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
   * Set the model (0.50.0: use getAvailable and find)
   */
  async setModel(provider: string, modelId: string): Promise<void> {
    if (!this.agentSession) return;

    const { ModelRegistry, AuthStorage } = await import('@mariozechner/pi-coding-agent');
    const authStorage = new AuthStorage();
    const registry = new ModelRegistry(authStorage);
    const availableModels = registry.getAvailable();
    const model = availableModels.find(
      (m: { api: string; id: string }) => m.api === provider && m.id === modelId
    );

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
   * Cycle to the next model in the scoped models list (0.50.0: returns Promise)
   */
  async cycleModel(): Promise<PiModelConfig | null> {
    if (!this.agentSession) return null;

    const result = await this.agentSession.cycleModel();
    if (result) {
      // 0.50.0: Model uses 'api' and 'id' properties
      const model = result as { api?: string; id?: string; provider?: string; modelId?: string };
      const provider = model.api || model.provider || '';
      const modelId = model.id || model.modelId || '';
      this.currentModel = {
        provider: provider as PiModelConfig['provider'],
        modelId,
      };
      this.emitSessionUpdate('model_changed', {
        provider,
        modelId,
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
   * 0.50.0: UserMessage no longer has 'id' property
   */
  async getForkableEntries(): Promise<PiForkableEntry[]> {
    if (!this.agentSession) return [];

    // Get messages from session state
    const messages = this.agentSession.state?.messages || [];
    const forkable: PiForkableEntry[] = [];

    let index = 0;
    for (const msg of messages) {
      if (msg.role === 'user' && typeof msg.content === 'string') {
        const msgWithMeta = msg as { content: string; timestamp?: number };
        forkable.push({
          id: `msg-${index}`,
          type: 'user_message',
          content: msgWithMeta.content,
          timestamp: msgWithMeta.timestamp || Date.now(),
        });
      }
      index++;
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
   * Get available models (0.50.0: Model uses 'api' and 'id' properties)
   */
  async getAvailableModels(): Promise<PiModelInfo[]> {
    if (this.cachedModels) return this.cachedModels;

    const { ModelRegistry, AuthStorage } = await import('@mariozechner/pi-coding-agent');
    const authStorage = new AuthStorage();
    const registry = new ModelRegistry(authStorage);
    const available = registry.getAvailable();

    // 0.50.0: Model<Api> has 'api' (provider), 'id' (modelId), 'displayName', etc.
    const models: PiModelInfo[] = available.map((m: {
      api: string;
      id: string;
      displayName?: string;
      supportsThinking?: boolean;
      contextWindow?: number;
      maxOutputTokens?: number;
    }) => ({
      provider: m.api as PiModelInfo['provider'],
      modelId: m.id,
      displayName: m.displayName || m.id,
      supportsThinking: m.supportsThinking || false,
      contextWindow: m.contextWindow,
      maxOutputTokens: m.maxOutputTokens,
    }));
    this.cachedModels = models;

    return models;
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
