import { EventEmitter } from 'events';
import { fork, type ChildProcess } from 'child_process';
import { randomUUID } from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';
import type { Config } from './config.js';
import type { ApertureDatabase, MessageRecord } from './database.js';
import type { AgentType, SessionConfig } from './agents/index.js';
import type {
  SdkSessionConfig,
  ClaudeEffort,
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
  SDKSession as ClaudeV2Session,
  SDKSessionOptions,
  SDKMessage,
  SDKAssistantMessage,
  SDKResultMessage,
  SDKSystemMessage,
  SDKUserMessage,
  PermissionResult,
  CanUseTool,
  PermissionUpdate as SDKPermissionUpdate,
  SDKPermissionDenial,
} from '@anthropic-ai/claude-agent-sdk';
import {
  getSessionInfo,
  unstable_v2_createSession,
  unstable_v2_resumeSession,
  renameSession as sdkRenameSession,
} from '@anthropic-ai/claude-agent-sdk';
import { generateConversationTitle } from './title-generator.js';
import {
  captureRepoBaselineSnapshot,
  computeCompletedTurnDiff,
  disposeRepoBaselineSnapshot,
  type RepoBaselineSnapshot,
} from './git-diff.js';

// Pending permission request from SDK
interface PendingPermission {
  toolName: string;
  toolInput: Record<string, unknown>;
  toolUseID: string;
  resolve: (result: PermissionResult) => void;
  signal: AbortSignal;
  options?: PermissionOption[];
  context?: PermissionContext;
  sdkSuggestions?: SDKPermissionUpdate[];
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

interface ClaudeV2SessionWithQuery extends ClaudeV2Session {
  query?: Query;
}

interface WorkerRpcPending {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
}

interface ActiveTurnState {
  userMessageRecordId: string;
  promptText: string;
  checkpointId: string | null;
  providerSessionId: string | null;
  workingDirectory: string | null;
  startedAt: number;
  baseline: RepoBaselineSnapshot | null;
  lastAssistantMessageId: string | null;
}

type SdkWorkerMessage =
  | { type: 'ready'; sessionId?: string }
  | { type: 'sdk_message'; message: SDKMessage }
  | {
      type: 'permission_request';
      toolName: string;
      input: Record<string, unknown>;
      toolUseId: string;
      suggestions?: SDKPermissionUpdate[];
      blockedPath?: string;
      decisionReason?: string;
      agentId?: string;
    }
  | { type: 'prompt_complete' }
  | { type: 'prompt_failed'; error: string }
  | { type: 'rpc_result'; requestId: number; result: unknown }
  | { type: 'rpc_error'; requestId: number; error: string }
  | { type: 'warmup_done'; models: unknown[]; commands: unknown[]; accountInfo: unknown | null }
  | { type: 'warmup_error'; error: string }
  | { type: 'worker_error'; error: string };

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
  private workingDir?: string;
  private runtimeSession: ClaudeV2SessionWithQuery | null = null;
  private workerProcess: ChildProcess | null = null;
  private workerReady: Promise<void> | null = null;
  private workerReadyResolve: (() => void) | null = null;
  private workerReadyReject: ((error: Error) => void) | null = null;
  private workerPromptPromise: Promise<void> | null = null;
  private workerPromptResolve: (() => void) | null = null;
  private workerPromptReject: ((error: Error) => void) | null = null;
  private workerRpcId = 0;
  private pendingWorkerRpc: Map<number, WorkerRpcPending> = new Map();
  private workerWarmupResolve: (() => void) | null = null;
  private workerWarmupReject: ((error: Error) => void) | null = null;
  private abortController: AbortController | null = null;
  private currentQuery: Query | null = null;
  private currentStream: AsyncGenerator<SDKMessage, void> | null = null;
  private pendingPermissions: Map<string, PendingPermission> = new Map();
  // Tools the user approved via "Always Allow" during this session.
  // Checked in canUseTool before prompting — mirrors Clay's session.allowedTools pattern.
  private sessionAllowedTools: Set<string> = new Set();
  private lastActivityTime: number = Date.now();
  private idleTimer: NodeJS.Timeout | null = null;
  private isShuttingDown = false;
  private isProcessing = false;
  private hasStartedConversation = false;
  private needsRuntimeRefreshBeforePrompt = false;
  private suppressNextWorkerExit = false;

  // Result tracking
  private permissionDenials: PermissionDenial[] = [];
  private lastResult: SessionResult | null = null;
  private messageUuids: Map<string, string> = new Map();
  private checkpointMessageIds: string[] = [];
  private checkpointMessageIdSet: Set<string> = new Set();
  private activeTurn: ActiveTurnState | null = null;

  // Title generation
  private hasGeneratedTitle = false;

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
      this.workingDir = cwd;
    }

    // If session already has a title in the database, don't regenerate
    if (database) {
      const record = database.getSession(sessionConfig.id);
      if (record?.title) {
        this.hasGeneratedTitle = true;
      }
    }
  }

  /**
   * Set the working directory for this session
   * Must be called before start() if needed
   */
  setWorkingDirectory(path: string): void {
    this.workingDir = path;
  }

  private usesWorkerRuntime(): boolean {
    return Boolean(this.workingDir && path.resolve(this.workingDir) !== process.cwd());
  }

  private getWorkerModulePath(): string {
    const currentFile = fileURLToPath(import.meta.url);
    const ext = path.extname(currentFile) === '.ts' ? '.ts' : '.js';
    return fileURLToPath(new URL(`./sdk-session-worker${ext}`, import.meta.url));
  }

  /**
   * Update SDK configuration dynamically
   */
  updateConfig(config: Partial<SdkSessionConfig>): void {
    this.sdkConfig = { ...this.sdkConfig, ...config };
    this.markRuntimeRefreshNeeded(config);
    this.persistSdkConfig();
  }

  /**
   * Get current SDK configuration
   */
  getConfig(): SdkSessionConfig {
    return { ...this.sdkConfig };
  }

  async applyConfigUpdate(config: Partial<SdkSessionConfig>): Promise<SdkSessionConfig> {
    if ('permissionMode' in config && config.permissionMode !== undefined) {
      await this.setPermissionMode(config.permissionMode);
    }

    if ('model' in config) {
      await this.setModel(config.model);
    }

    if ('maxThinkingTokens' in config) {
      await this.setMaxThinkingTokens(config.maxThinkingTokens ?? null);
    }

    if ('effort' in config) {
      await this.setEffort(config.effort);
    }

    const passthroughConfig = { ...config };
    delete passthroughConfig.permissionMode;
    delete passthroughConfig.model;
    delete passthroughConfig.maxThinkingTokens;
    delete passthroughConfig.effort;

    if (Object.keys(passthroughConfig).length > 0) {
      this.updateConfig(passthroughConfig);
    }

    return this.getConfig();
  }

  /**
   * Starts the SDK session (no process to spawn, but we initialize state)
   */
  async start(): Promise<void> {
    if (this.usesWorkerRuntime()) {
      await this.ensureWorkerRuntime();
    } else if (!this.runtimeSession) {
      this.createOrResumeRuntimeSession();
    }

    // Start idle timer
    this.resetIdleTimer();

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
            ...this.sdkConfig,
            permissionMode: this.sdkConfig.permissionMode || 'default',
            model: this.sdkConfig.model,
            maxTurns: this.sdkConfig.maxTurns,
            maxBudgetUsd: this.sdkConfig.maxBudgetUsd,
            maxThinkingTokens: this.sdkConfig.maxThinkingTokens,
            effort: this.sdkConfig.effort,
            enableFileCheckpointing: this.sdkConfig.enableFileCheckpointing ?? true,
          },
        },
      },
    };
    this.emit('message', initMessage);
    this.emit('session_update', initMessage.params);

    // Run warmup in background — don't block session start, but pre-fetch
    // models/commands/accountInfo so they're available before the first prompt
    this.warmup().catch((err) => {
      console.log(`[SDK-Session] Warmup error: ${err instanceof Error ? err.message : String(err)}`);
    });
  }

  private buildWorkerConfig(): Record<string, unknown> {
    return {
      model: this.sdkConfig.model,
      allowedTools: this.sdkConfig.allowedTools,
      disallowedTools: this.sdkConfig.disallowedTools,
      permissionMode: this.sdkConfig.permissionMode,
      systemPrompt: this.sdkConfig.systemPrompt,
      maxThinkingTokens: this.sdkConfig.maxThinkingTokens,
      effort: this.sdkConfig.effort,
      mcpServers: this.sdkConfig.mcpServers,
      additionalDirectories: this.sdkConfig.additionalDirectories,
      settingSources: this.sdkConfig.settingSources,
      sandbox: this.sdkConfig.sandbox,
      agents: this.sdkConfig.agents,
      agent: this.sdkConfig.agent,
      outputFormat: this.sdkConfig.outputFormat,
      fallbackModel: this.sdkConfig.fallbackModel,
      allowDangerouslySkipPermissions: this.sdkConfig.allowDangerouslySkipPermissions,
      plugins: this.sdkConfig.plugins,
      betas: this.sdkConfig.betas,
      extraArgs: {
        ...(this.sdkConfig.extraArgs || {}),
        'replay-user-messages': null,
      },
    };
  }

  private async ensureWorkerRuntime(): Promise<void> {
    if (this.workerProcess && this.workerReady) {
      await this.workerReady;
      return;
    }

    const workerEnv: NodeJS.ProcessEnv = { ...process.env };
    if (this.sessionConfig.env) {
      Object.assign(workerEnv, this.sessionConfig.env);
    }
    if (this.resolvedApiKey) {
      workerEnv.ANTHROPIC_API_KEY = this.resolvedApiKey;
    }

    const workerPath = this.getWorkerModulePath();
    const child = fork(workerPath, [], {
      cwd: this.workingDir || process.cwd(),
      env: workerEnv,
      stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    });

    this.workerProcess = child;
    this.workerReady = new Promise<void>((resolve, reject) => {
      this.workerReadyResolve = resolve;
      this.workerReadyReject = reject;
    });

    child.on('message', (message: SdkWorkerMessage) => {
      this.handleWorkerMessage(message);
    });

    child.stderr?.on('data', (chunk) => {
      this.emit('stderr', chunk.toString());
    });

    child.on('exit', (code, signal) => {
      const error = code === 0 || this.isShuttingDown
        ? null
        : new Error(`SDK worker exited unexpectedly (${code ?? 'null'}${signal ? `, ${signal}` : ''})`);

      this.workerProcess = null;
      this.workerReady = null;
      this.runtimeSession = null;
      this.currentQuery = null;
      this.currentStream = null;

      if (error) {
        this.workerReadyReject?.(error);
        this.workerPromptReject?.(error);
        for (const pending of this.pendingWorkerRpc.values()) {
          pending.reject(error);
        }
        this.pendingWorkerRpc.clear();
        this.emit('error', error);
      }

      this.workerReadyResolve = null;
      this.workerReadyReject = null;
      this.workerPromptPromise = null;
      this.workerPromptResolve = null;
      this.workerPromptReject = null;
      if (this.suppressNextWorkerExit) {
        this.suppressNextWorkerExit = false;
      } else {
        this.emit('exit', { code, signal });
      }
    });

    child.send({
      type: 'init',
      config: this.buildWorkerConfig(),
      resumeId: this.sdkConfig.resume || this.sdkSessionId || undefined,
    });

    await this.workerReady;
  }

  private handleWorkerMessage(message: SdkWorkerMessage): void {
    switch (message.type) {
      case 'ready':
        if (message.sessionId && this.sdkSessionId !== message.sessionId) {
          this.sdkSessionId = message.sessionId;
          this.persistRuntimeSessionId();
        }
        this.workerReadyResolve?.();
        this.workerReadyResolve = null;
        this.workerReadyReject = null;
        break;

      case 'sdk_message':
        this.updateActivity();
        this.processSDKMessage(message.message);
        break;

      case 'permission_request':
        this.handleWorkerPermissionRequest(message);
        break;

      case 'prompt_complete':
        this.workerPromptResolve?.();
        this.workerPromptPromise = null;
        this.workerPromptResolve = null;
        this.workerPromptReject = null;
        break;

      case 'prompt_failed': {
        const error = new Error(message.error);
        this.workerPromptReject?.(error);
        this.workerPromptPromise = null;
        this.workerPromptResolve = null;
        this.workerPromptReject = null;
        break;
      }

      case 'rpc_result': {
        const pending = this.pendingWorkerRpc.get(message.requestId);
        if (pending) {
          this.pendingWorkerRpc.delete(message.requestId);
          pending.resolve(message.result);
        }
        break;
      }

      case 'rpc_error': {
        const pending = this.pendingWorkerRpc.get(message.requestId);
        if (pending) {
          this.pendingWorkerRpc.delete(message.requestId);
          pending.reject(new Error(message.error));
        }
        break;
      }

      case 'warmup_done':
        this.cachedModels = message.models as ModelInfo[];
        this.cachedCommands = message.commands as SlashCommand[];
        this.cachedAccountInfo = message.accountInfo as AccountInfo | null;
        this.workerWarmupResolve?.();
        this.workerWarmupResolve = null;
        this.workerWarmupReject = null;
        break;

      case 'warmup_error':
        this.workerWarmupReject?.(new Error(message.error));
        this.workerWarmupResolve = null;
        this.workerWarmupReject = null;
        break;

      case 'worker_error':
        this.emit('error', new Error(message.error));
        break;
    }
  }

  private handleWorkerPermissionRequest(message: Extract<SdkWorkerMessage, { type: 'permission_request' }>): void {
    // Auto-approve if bypassPermissions or tool was previously "Always Allowed"
    if (
      this.sdkConfig.permissionMode === 'bypassPermissions' ||
      this.sessionAllowedTools.has(message.toolName)
    ) {
      const autoResult: PermissionResult = { behavior: 'allow' };
      this.workerProcess?.send({
        type: 'permission_response',
        toolUseId: message.toolUseId,
        result: autoResult,
      });
      return;
    }

    const permissionOptions = this.translatePermissionSuggestions(message.suggestions);
    const context: PermissionContext = {
      blockedPath: message.blockedPath,
      decisionReason: message.decisionReason,
      agentID: message.agentId,
    };

    this.pendingPermissions.set(message.toolUseId, {
      toolName: message.toolName,
      toolInput: message.input,
      toolUseID: message.toolUseId,
      resolve: () => {},
      signal: new AbortController().signal,
      options: permissionOptions,
      context,
      sdkSuggestions: message.suggestions,
    });

    this.emit('permission_request', {
      id: message.toolUseId,
      toolCallId: message.toolUseId,
      toolCall: {
        toolCallId: message.toolUseId,
        name: message.toolName,
        rawInput: message.input,
        title: message.toolName,
      },
      options: permissionOptions,
      context,
    });

    this.emitSessionUpdate('request_permission', {
      toolCallId: message.toolUseId,
      toolCall: {
        toolCallId: message.toolUseId,
        name: message.toolName,
        rawInput: message.input,
        title: message.toolName,
      },
      options: permissionOptions,
      context,
    });
  }

  private async callWorkerRpc<T>(method: string, ...args: unknown[]): Promise<T> {
    await this.ensureWorkerRuntime();

    const requestId = ++this.workerRpcId;
    const result = new Promise<T>((resolve, reject) => {
      this.pendingWorkerRpc.set(requestId, {
        resolve: (value) => resolve(value as T),
        reject,
      });
    });

    this.workerProcess?.send({
      type: 'rpc',
      requestId,
      method,
      args,
    });

    return result;
  }

  /**
   * Build SDK options from configuration
   */
  private buildRuntimeOptions(): Options {
    const env: Record<string, string | undefined> = { ...process.env };
    if (this.resolvedApiKey) {
      env.ANTHROPIC_API_KEY = this.resolvedApiKey;
    }

    // Merge session env with SDK env
    if (this.sessionConfig.env) {
      Object.assign(env, this.sessionConfig.env);
    }

    const options: Options = {
      cwd: this.workingDir || process.cwd(),
      canUseTool: this.createCanUseTool(),
      env,
      includePartialMessages: true,
      stderr: (data: string) => this.emit('stderr', data),

      // Session resumption: auto-continue when resuming within the same Aperture session
      resume: this.sdkConfig.resume || this.sdkSessionId || undefined,
      resumeSessionAt: this.sdkConfig.resumeSessionAt,
      forkSession: this.sdkConfig.forkSession,
      continue: this.sdkConfig.continue ?? (this.sdkSessionId ? true : undefined),
      persistSession: this.sdkConfig.persistSession ?? true,

      // File checkpointing
      enableFileCheckpointing: this.sdkConfig.enableFileCheckpointing ?? true,
      extraArgs: {
        ...(this.sdkConfig.extraArgs || {}),
        'replay-user-messages': null,
      } as Options['extraArgs'],

      // Permissions
      permissionMode: this.sdkConfig.permissionMode,
      allowedTools: this.sdkConfig.allowedTools,
      disallowedTools: this.sdkConfig.disallowedTools,
      allowDangerouslySkipPermissions: this.sdkConfig.allowDangerouslySkipPermissions,

      // Limits
      maxBudgetUsd: this.sdkConfig.maxBudgetUsd,
      maxTurns: this.sdkConfig.maxTurns,
      maxThinkingTokens: this.sdkConfig.maxThinkingTokens,
      effort: this.sdkConfig.effort,

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

  private getRuntimeSessionOptions(): SDKSessionOptions {
    return this.buildRuntimeOptions() as unknown as SDKSessionOptions;
  }

  private createOrResumeRuntimeSession(): void {
    const options = this.getRuntimeSessionOptions();
    const resumeId = this.sdkConfig.resume || this.sdkSessionId || undefined;

    if (this.runtimeSession) {
      this.runtimeSession.close();
    }

    this.runtimeSession = resumeId
      ? (unstable_v2_resumeSession(resumeId, options) as ClaudeV2SessionWithQuery)
      : (unstable_v2_createSession(options) as ClaudeV2SessionWithQuery);

    this.currentQuery = this.runtimeSession.query ?? null;
    this.currentStream = null;
    this.hasStartedConversation = Boolean(resumeId);

    if (resumeId) {
      const resumedSessionId = this.runtimeSession.sessionId || resumeId;
      if (this.sdkSessionId !== resumedSessionId) {
        this.sdkSessionId = resumedSessionId;
        this.persistRuntimeSessionId();
      }
    }
  }

  /**
   * Warmup: sends a dummy prompt to bootstrap the SDK, fetching models,
   * commands, and account info before the user's first real prompt.
   * After warmup, recreates a fresh session so the dummy doesn't pollute history.
   */
  private async warmup(): Promise<void> {
    // Skip warmup for resumed sessions — they already have an active conversation
    if (this.sdkConfig.resume || this.sdkSessionId) {
      return;
    }

    if (this.usesWorkerRuntime()) {
      await this.warmupViaWorker();
    } else {
      await this.warmupDirect();
    }

    // Emit cached data so frontend gets it immediately
    this.emitWarmupData();
  }

  private async warmupDirect(): Promise<void> {
    if (!this.runtimeSession) {
      return;
    }

    try {
      // Send a dummy prompt to bootstrap the stream
      await this.runtimeSession.send('hi');
      const stream = this.runtimeSession.stream();

      let gotInit = false;
      for await (const message of stream) {
        if (message.type === 'system' && (message as Record<string, unknown>).subtype === 'init') {
          gotInit = true;

          // Grab models, commands, and account info from the active query
          const query = this.runtimeSession.query;
          if (query) {
            try { this.cachedModels = await query.supportedModels() as ModelInfo[]; } catch { /* ignore */ }
            try { this.cachedCommands = await query.supportedCommands() as SlashCommand[]; } catch { /* ignore */ }
            try { this.cachedAccountInfo = await query.accountInfo() as AccountInfo; } catch { /* ignore */ }
          }

          break;
        }
      }

      if (!gotInit) {
        console.log('[SDK-Session] Warmup stream ended without init message');
      }
    } catch (error) {
      // Suppress AbortError and log others
      if (error instanceof Error && error.name !== 'AbortError') {
        console.log(`[SDK-Session] Warmup failed: ${error.message}`);
      }
    }

    // Recreate a fresh session so the dummy prompt doesn't pollute real conversations
    this.createOrResumeRuntimeSession();
  }

  private async warmupViaWorker(): Promise<void> {
    await this.ensureWorkerRuntime();

    const warmupPromise = new Promise<void>((resolve, reject) => {
      this.workerWarmupResolve = resolve;
      this.workerWarmupReject = reject;
    });

    this.workerProcess?.send({ type: 'warmup' });

    try {
      await warmupPromise;
    } catch (error) {
      console.log(`[SDK-Session] Worker warmup failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private emitWarmupData(): void {
    if (this.cachedModels) {
      this.emit('message', {
        jsonrpc: '2.0',
        method: 'session/supported_models',
        params: { models: this.cachedModels },
      });
    }
    if (this.cachedCommands) {
      this.emit('message', {
        jsonrpc: '2.0',
        method: 'session/supported_commands',
        params: { commands: this.cachedCommands },
      });
    }
    if (this.cachedAccountInfo) {
      this.emit('message', {
        jsonrpc: '2.0',
        method: 'session/account_info',
        params: this.cachedAccountInfo,
      });
    }
  }

  /**
   * Generate an AI-powered session title from the first user prompt and
   * assistant response, then persist and broadcast it.
   */
  private async generateTitle(): Promise<void> {
    if (this.hasGeneratedTitle) return;

    try {
      // Load the most recent user + assistant exchange from the database.
      // Scan backwards through the last 100 messages so resumed sessions
      // always get the most-recent exchange as context.
      const recentMessages = this.database?.getMessages(this.id, 100) ?? [];
      const lastUser = [...recentMessages].reverse().find((m) => m.role === 'user');
      const lastAssistant = [...recentMessages].reverse().find((m) => m.role === 'assistant');

      if (!lastUser) return;

      const title = await generateConversationTitle({
        userText: lastUser.content.trim().substring(0, 300),
        assistantText: lastAssistant?.content.trim().substring(0, 300),
        anthropicApiKey: this.resolvedApiKey || process.env.ANTHROPIC_API_KEY,
        openRouterApiKey: process.env.OPENROUTER_API_KEY,
      });

      if (!title) return;

      this.database?.updateSessionTitle(this.id, title);

      // Mark generated only after successful persistence — failed attempts
      // automatically retry on the next message completion.
      this.hasGeneratedTitle = true;

      // Sync to SDK backend (best-effort)
      if (this.sdkSessionId) {
        try { await sdkRenameSession(this.sdkSessionId, title); } catch { /* best-effort */ }
      }

      this.emit('message', {
        jsonrpc: '2.0',
        method: 'session/title_changed',
        params: { title },
      });
    } catch (error) {
      console.log(`[SDK-Session] Title generation failed (will retry): ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private persistSdkConfig(): void {
    if (!this.database) {
      return;
    }
    this.database.updateSdkConfig(this.id, JSON.stringify(this.sdkConfig));
  }

  private persistRuntimeSessionId(): void {
    if (this.sdkSessionId) {
      this.sdkConfig.resume = this.sdkSessionId;
      this.sdkConfig.continue = true;
    }

    if (!this.database || !this.sdkSessionId) {
      return;
    }

    this.database.updateSdkSessionId(this.id, this.sdkSessionId);
    this.persistSdkConfig();
    console.log(`[SDK-Session] Persisted SDK session ID: ${this.sdkSessionId}`);
  }

  static async canResumeProviderSession(
    sdkSessionId: string,
    workingDirectory?: string
  ): Promise<boolean> {
    try {
      const info = await getSessionInfo(
        sdkSessionId,
        workingDirectory ? { dir: workingDirectory } : undefined
      );
      return Boolean(info);
    } catch {
      return false;
    }
  }

  private shouldRefreshRuntimeSessionBeforePrompt(): boolean {
    if (this.usesWorkerRuntime()) {
      return !this.workerProcess ||
        this.needsRuntimeRefreshBeforePrompt ||
        Boolean(this.sdkConfig.resumeSessionAt || this.sdkConfig.forkSession);
    }

    if (!this.runtimeSession) {
      return true;
    }

    return this.needsRuntimeRefreshBeforePrompt ||
      Boolean(this.sdkConfig.resumeSessionAt || this.sdkConfig.forkSession);
  }

  private async refreshRuntimeSessionForPrompt(): Promise<void> {
    if (this.usesWorkerRuntime()) {
      await this.resetWorkerRuntimeForRefresh();
      await this.ensureWorkerRuntime();
    } else {
      this.createOrResumeRuntimeSession();
    }
    this.needsRuntimeRefreshBeforePrompt = false;
  }

  private async resetWorkerRuntimeForRefresh(): Promise<void> {
    const child = this.workerProcess;
    if (!child) {
      return;
    }

    this.suppressNextWorkerExit = true;
    await new Promise<void>((resolve) => {
      let resolved = false;
      const finish = () => {
        if (!resolved) {
          resolved = true;
          resolve();
        }
      };

      child.once('exit', finish);
      try {
        child.send({ type: 'close' });
      } catch {
        finish();
      }

      setTimeout(() => {
        if (child.exitCode === null && child.signalCode === null) {
          child.kill();
        }
        finish();
      }, 250);
    });
  }

  private markRuntimeRefreshNeeded(config: Partial<SdkSessionConfig>): void {
    if (!this.hasStartedConversation && Object.keys(config).length > 0) {
      this.needsRuntimeRefreshBeforePrompt = true;
    }
  }

  private recordCheckpointMessageId(messageId: string | null): void {
    if (!messageId || this.checkpointMessageIdSet.has(messageId)) {
      return;
    }

    this.checkpointMessageIdSet.add(messageId);
    this.checkpointMessageIds.push(messageId);
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
      // Auto-approve if permission mode bypasses all prompts
      if (this.sdkConfig.permissionMode === 'bypassPermissions') {
        return { behavior: 'allow' };
      }

      // Auto-approve if the user previously clicked "Always Allow" for this tool
      if (this.sessionAllowedTools.has(toolName)) {
        return { behavior: 'allow' };
      }

      return new Promise<PermissionResult>((resolve, reject) => {
        const { toolUseID, signal, suggestions, blockedPath, decisionReason, agentID } = options;

        // Translate SDK suggestions to frontend-friendly options
        const permissionOptions = this.translatePermissionSuggestions(suggestions);

        // Build context for frontend (suggestions already translated to permissionOptions)
        const context: PermissionContext = {
          blockedPath,
          decisionReason,
          agentID,
        };

        // Store the pending permission
        this.pendingPermissions.set(toolUseID, {
          toolName,
          toolInput: input,
          toolUseID,
          resolve,
          signal,
          options: permissionOptions,
          context,
          sdkSuggestions: suggestions,
        });

        // Handle abort
        signal.addEventListener('abort', () => {
          this.pendingPermissions.delete(toolUseID);
          reject(new Error('Permission request aborted'));
        });

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
   * Sends a prompt to the agent, optionally with image attachments
   */
  async sendPrompt(content: string, images?: import('./agents/types.js').ImageAttachment[]): Promise<void> {
    if (this.isShuttingDown) {
      throw new Error('Session is shutting down');
    }

    if (this.isProcessing) {
      throw new Error('A prompt is already being processed');
    }

    this.isProcessing = true;
    this.updateActivity();
    const userMessageRecordId = this.persistUserPrompt(content, images);

    // Reset per-prompt state
    this.permissionDenials = [];
    this.activeTurn = {
      userMessageRecordId,
      promptText: content,
      checkpointId: null,
      providerSessionId: this.sdkSessionId,
      workingDirectory: this.workingDir || null,
      startedAt: Date.now(),
      baseline: this.workingDir ? await captureRepoBaselineSnapshot(this.workingDir) : null,
      lastAssistantMessageId: null,
    };

    try {
      if (this.usesWorkerRuntime()) {
        if (this.shouldRefreshRuntimeSessionBeforePrompt()) {
          await this.refreshRuntimeSessionForPrompt();
        } else {
          await this.ensureWorkerRuntime();
        }
      } else if (this.shouldRefreshRuntimeSessionBeforePrompt()) {
        await this.refreshRuntimeSessionForPrompt();
      }

      if (!this.usesWorkerRuntime() && !this.runtimeSession) {
        this.createOrResumeRuntimeSession();
      }

      // Build the prompt: plain string or SDKUserMessage with image content blocks
      let prompt: string | SDKUserMessage;
      if (images && images.length > 0) {
        type ImageMediaType = 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';
        // Build a MessageParam with text + image content blocks
        const contentBlocks: Array<
          | { type: 'text'; text: string }
          | { type: 'image'; source: { type: 'base64'; media_type: ImageMediaType; data: string } }
        > = [];

        // Add images first so the model sees them before the text
        for (const img of images) {
          contentBlocks.push({
            type: 'image',
            source: {
              type: 'base64',
              media_type: img.mimeType as ImageMediaType,
              data: img.data,
            },
          });
        }

        // Add the text content
        if (content) {
          contentBlocks.push({ type: 'text', text: content });
        }

        const userMessage: SDKUserMessage = {
          type: 'user',
          message: {
            role: 'user',
            content: contentBlocks,
          },
          parent_tool_use_id: null,
          session_id: this.sdkSessionId || this.id,
        };
        prompt = userMessage;
      } else {
        prompt = content;
      }

      if (this.usesWorkerRuntime()) {
        this.workerPromptPromise = new Promise<void>((resolve, reject) => {
          this.workerPromptResolve = resolve;
          this.workerPromptReject = reject;
        });
        this.workerProcess?.send({
          type: 'prompt',
          prompt,
        });
        this.hasStartedConversation = true;
        await this.workerPromptPromise;
      } else {
        this.abortController = new AbortController();

        await this.runtimeSession!.send(prompt);
        this.hasStartedConversation = true;
        this.currentStream = this.runtimeSession!.stream();

        // Process messages from the async iterator
        for await (const message of this.currentStream) {
          this.updateActivity();
          this.processSDKMessage(message);
        }
      }

      // Query completed successfully
      this.isProcessing = false;
      this.sdkConfig.resumeSessionAt = undefined;
      this.sdkConfig.forkSession = undefined;

    } catch (error) {
      this.isProcessing = false;

      await this.disposeActiveTurn();

      if (error instanceof Error && error.name === 'AbortError') {
        // Cancelled by user, not an error
        return;
      }

      this.emit('error', error);
      throw error;
    } finally {
      this.currentStream = null;
      this.abortController = null;
      this.workerPromptPromise = null;
      this.workerPromptResolve = null;
      this.workerPromptReject = null;
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
        this.persistRuntimeSessionId();
      }
      if (this.activeTurn) {
        this.activeTurn.providerSessionId = newSessionId;
      }
    }

    // Store message UUID for checkpointing
    if ('uuid' in message && message.uuid) {
      this.messageUuids.set(message.uuid, message.type);
      if (message.type === 'user' && this.activeTurn && !this.activeTurn.checkpointId) {
        this.activeTurn.checkpointId = message.uuid;
      }
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

    this.persistAssistantMessage(message.uuid, contentBlocks, message.parent_tool_use_id);
    if (this.activeTurn) {
      this.activeTurn.lastAssistantMessageId = message.uuid || null;
    }

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

    this.recordCheckpointMessageId(this.activeTurn?.checkpointId ?? null);

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
      this.logEvent('prompt_complete', payload);

      // Also emit legacy format
      this.emitSessionUpdate('prompt_complete', payload);
      void this.persistTurnDiffSummary(false);

      // Generate AI title on first successful prompt completion.
      // Context is loaded from the DB inside generateTitle — no need to
      // thread activeTurn fields through here.
      if (!this.hasGeneratedTitle) {
        void this.generateTitle();
      }
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
      this.logEvent('prompt_error', payload);

      // Also emit legacy format
      this.emitSessionUpdate('prompt_error', payload);
      void this.persistTurnDiffSummary(true);
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
    this.logEvent(`session_update:${updateType}`, data);
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
    this.logEvent(`sdk:${type}`, payload);
  }

  private persistUserPrompt(
    content: string,
    images?: import('./agents/types.js').ImageAttachment[]
  ): string {
    const messageId = randomUUID();
    if (!this.database) {
      return messageId;
    }

    const contentBlocks: Array<Record<string, unknown>> = [];
    if (images?.length) {
      for (const image of images) {
        contentBlocks.push({
          type: 'image',
          mimeType: image.mimeType,
          data: image.data,
          filename: image.filename,
        });
      }
    }
    if (content) {
      contentBlocks.push({ type: 'text', text: content });
    }

    this.database.saveMessage({
      id: messageId,
      session_id: this.id,
      role: 'user',
      content,
      timestamp: Date.now(),
      metadata: JSON.stringify({
        contentBlocks: contentBlocks.length > 0 ? contentBlocks : [{ type: 'text', text: content }],
      }),
    });
    return messageId;
  }

  private persistAssistantMessage(
    messageId: string | undefined,
    contentBlocks: SdkContentBlock[],
    parentToolUseId: string | null | undefined
  ): void {
    if (!this.database) {
      return;
    }

    const textContent = contentBlocks
      .filter((block): block is SdkTextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('');

    const record: MessageRecord = {
      id: messageId || randomUUID(),
      session_id: this.id,
      role: 'assistant',
      content: textContent,
      timestamp: Date.now(),
      metadata: JSON.stringify({
        contentBlocks,
        parentToolUseId: parentToolUseId ?? null,
      }),
    };
    this.database.upsertMessage(record);
  }

  private logEvent(eventType: string, eventData: unknown): void {
    if (!this.database) {
      return;
    }

    this.database.logEvent(this.id, eventType, {
      payload: eventData,
      claudeSessionId: this.sdkSessionId,
      timestamp: Date.now(),
    });
  }

  private async disposeActiveTurn(): Promise<void> {
    if (!this.activeTurn) {
      return;
    }
    await disposeRepoBaselineSnapshot(this.activeTurn.baseline);
    this.activeTurn = null;
  }

  private async persistTurnDiffSummary(partial: boolean): Promise<void> {
    if (!this.database || !this.activeTurn || !this.workingDir) {
      await this.disposeActiveTurn();
      return;
    }

    try {
      const assistantMessageId =
        this.database.getLatestAssistantMessageId(this.id, this.activeTurn.startedAt) ||
        this.activeTurn.lastAssistantMessageId;

      if (!assistantMessageId) {
        return;
      }

      const completed = await computeCompletedTurnDiff(this.workingDir, this.activeTurn.baseline);
      if (!completed || completed.files.length === 0) {
        return;
      }

      this.database.saveTurnDiffSummary({
        id: randomUUID(),
        session_id: this.id,
        user_message_id: this.activeTurn.userMessageRecordId,
        assistant_message_id: assistantMessageId,
        checkpoint_id: this.activeTurn.checkpointId,
        provider_session_id: this.activeTurn.providerSessionId,
        working_directory: this.activeTurn.workingDirectory || this.workingDir,
        turn_started_at: this.activeTurn.startedAt,
        turn_completed_at: Date.now(),
        git_base_head: this.activeTurn.baseline?.headSha || null,
        git_head_at_completion: completed.headSha,
        file_count: completed.files.length,
        additions: completed.additions,
        deletions: completed.deletions,
        files_json: JSON.stringify(completed.files),
        patch_text: completed.patchText,
        metadata: JSON.stringify({
          partial,
          promptText: this.activeTurn.promptText,
        }),
      });
    } catch (error) {
      console.error('[SDK-Session] Failed to persist turn diff summary:', error);
    } finally {
      await this.disposeActiveTurn();
    }
  }

  // ===========================================================================
  // Query Control Methods
  // ===========================================================================

  /**
   * Interrupt the current query gracefully
   */
  async interrupt(): Promise<void> {
    if (this.usesWorkerRuntime()) {
      await this.callWorkerRpc<boolean>('interrupt');
      return;
    }
    if (this.currentQuery && this.isProcessing) {
      await this.currentQuery.interrupt();
    }
    if (this.currentStream) {
      await this.currentStream.return?.(undefined);
    }
  }

  /**
   * Set permission mode for the current query
   */
  async setPermissionMode(mode: PermissionMode): Promise<void> {
    // Always update the local config first — this is the source of truth for
    // createCanUseTool auto-approve checks and future session/query creation.
    this.sdkConfig.permissionMode = mode;

    // Clear the session allow-list when switching to a stricter mode so
    // previously "Always Allowed" tools don't leak through.
    if (mode === 'default' || mode === 'plan') {
      this.sessionAllowedTools.clear();
    }

    this.markRuntimeRefreshNeeded({ permissionMode: mode });

    if (this.usesWorkerRuntime() && this.hasStartedConversation) {
      try {
        await this.callWorkerRpc('setPermissionMode', mode);
      } catch (err: unknown) {
        // Log the failure so it's visible — the local config is already
        // updated, so the next canUseTool check will use the new mode.
        console.warn('[SdkSession] Worker setPermissionMode RPC failed, will apply on next prompt:', err);
      }
    } else if (this.currentQuery && this.hasStartedConversation) {
      await this.currentQuery.setPermissionMode(mode);
    }

    this.persistSdkConfig();
    this.emitSessionUpdate('config_changed', { permissionMode: mode });
  }

  /**
   * Set model for the current query
   */
  async setModel(model?: string): Promise<void> {
    this.markRuntimeRefreshNeeded({ model });
    if (this.usesWorkerRuntime() && this.hasStartedConversation) {
      try {
        await this.callWorkerRpc('setModel', model);
      } catch {
        // Fall back to updating local config for the next prompt if the runtime cannot mutate live state.
      }
    } else if (this.currentQuery && this.hasStartedConversation) {
      await this.currentQuery.setModel(model);
    }
    this.sdkConfig.model = model;
    this.persistSdkConfig();
    this.emitSessionUpdate('config_changed', { model });
  }

  /**
   * Set max thinking tokens for the current query
   */
  async setMaxThinkingTokens(tokens: number | null): Promise<void> {
    this.markRuntimeRefreshNeeded({ maxThinkingTokens: tokens ?? undefined });
    if (this.usesWorkerRuntime() && this.hasStartedConversation) {
      try {
        await this.callWorkerRpc('setMaxThinkingTokens', tokens);
      } catch {
        // Fall back to updating local config for the next prompt if the runtime cannot mutate live state.
      }
    } else if (this.currentQuery && this.hasStartedConversation) {
      await this.currentQuery.setMaxThinkingTokens(tokens);
    }
    this.sdkConfig.maxThinkingTokens = tokens ?? undefined;
    this.persistSdkConfig();
    this.emitSessionUpdate('config_changed', { maxThinkingTokens: tokens });
  }

  /**
   * Set effort for subsequent prompts
   */
  async setEffort(effort?: ClaudeEffort): Promise<void> {
    this.markRuntimeRefreshNeeded({ effort });
    if (this.usesWorkerRuntime() && this.hasStartedConversation) {
      try {
        await this.callWorkerRpc('setEffort', effort);
      } catch {
        // Fall back to updating local config for the next prompt if the runtime cannot mutate live state.
      }
    } else if (this.currentQuery && this.hasStartedConversation) {
      const effortSetter = (this.currentQuery as Query & {
        setEffort?: (value?: ClaudeEffort) => Promise<void>;
      }).setEffort;
      if (effortSetter) {
        await effortSetter.call(this.currentQuery, effort);
      }
    }
    this.sdkConfig.effort = effort;
    this.persistSdkConfig();
    this.emitSessionUpdate('config_changed', { effort });
  }

  // ===========================================================================
  // Info Retrieval Methods
  // ===========================================================================

  /**
   * Get supported slash commands/skills
   */
  async getSupportedCommands(): Promise<SlashCommand[]> {
    if (this.usesWorkerRuntime() && this.hasStartedConversation) {
      const commands = await this.callWorkerRpc<SlashCommand[]>('supportedCommands');
      this.cachedCommands = commands;
      return commands;
    }
    if (this.currentQuery && this.hasStartedConversation) {
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
    if (this.usesWorkerRuntime() && this.hasStartedConversation) {
      const models = await this.callWorkerRpc<ModelInfo[]>('supportedModels');
      this.cachedModels = models;
      return models;
    }
    if (this.currentQuery && this.hasStartedConversation) {
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
    if (this.usesWorkerRuntime() && this.hasStartedConversation) {
      const accountInfo = await this.callWorkerRpc<AccountInfo>('accountInfo');
      this.cachedAccountInfo = accountInfo;
      return accountInfo;
    }
    if (this.currentQuery && this.hasStartedConversation) {
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
    if (this.usesWorkerRuntime() && this.hasStartedConversation) {
      const mcpStatus = await this.callWorkerRpc<McpServerStatus[]>('mcpServerStatus');
      this.cachedMcpStatus = mcpStatus;
      return mcpStatus;
    }
    if (this.currentQuery && this.hasStartedConversation) {
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
    if (this.usesWorkerRuntime()) {
      return this.callWorkerRpc<RewindFilesResult>('rewindFiles', messageId, { dryRun });
    }
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
    return [...this.checkpointMessageIds];
  }

  // ===========================================================================
  // MCP Management
  // ===========================================================================

  /**
   * Set MCP servers dynamically
   */
  async setMcpServers(servers: Record<string, McpServerConfig>): Promise<McpSetServersResult> {
    // Update local config first so future turns always see the new MCP set.
    this.sdkConfig.mcpServers = { ...this.sdkConfig.mcpServers, ...servers };

    if (this.usesWorkerRuntime() && this.hasStartedConversation) {
      return this.callWorkerRpc<McpSetServersResult>('setMcpServers', servers as Record<string, unknown>);
    }

    if (!this.currentQuery || !this.hasStartedConversation) {
      return {
        added: Object.keys(servers),
        removed: [],
        errors: {},
      };
    }

    return this.currentQuery.setMcpServers(servers as Parameters<Query['setMcpServers']>[0]);
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

  getPendingPermissions(): Array<{
    toolCallId: string;
    toolCall: { toolCallId: string; name: string; rawInput: unknown; title: string };
    options: PermissionOption[];
    context?: PermissionContext;
  }> {
    return Array.from(this.pendingPermissions.values()).map((pending) => ({
      toolCallId: pending.toolUseID,
      toolCall: {
        toolCallId: pending.toolUseID,
        name: pending.toolName,
        rawInput: pending.toolInput,
        title: pending.toolName,
      },
      options: pending.options || [],
      context: pending.context,
    }));
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
    const updatedInput = answers && Object.keys(answers).length > 0 ? answers : undefined;

    if (optionId === 'allow') {
      result = {
        behavior: 'allow',
        ...(updatedInput && { updatedInput }),
      };
    } else if (optionId === 'allow_always') {
      // Remember this tool for the rest of the session so future calls auto-approve
      // without prompting. This is the application-level allow-list (like Clay's
      // session.allowedTools). The SDK's updatedPermissions is also passed when
      // suggestions are available, but it alone is insufficient — the SDK may not
      // honour it for all tool types, so we double up with our own check.
      this.sessionAllowedTools.add(pending.toolName);
      result = {
        behavior: 'allow',
        ...(updatedInput && { updatedInput }),
        ...(pending.sdkSuggestions?.length ? { updatedPermissions: pending.sdkSuggestions } : {}),
      };
    } else if (optionId.startsWith('suggestion_')) {
      const suggestionIndex = Number.parseInt(optionId.slice('suggestion_'.length), 10);
      const selectedSuggestion = Number.isNaN(suggestionIndex)
        ? undefined
        : pending.sdkSuggestions?.[suggestionIndex];

      result = {
        behavior: 'allow',
        ...(updatedInput && { updatedInput }),
        ...(selectedSuggestion ? { updatedPermissions: [selectedSuggestion] } : {}),
      };
    } else {
      result = {
        behavior: 'deny',
        message: 'User denied permission',
      };
    }

    pending.resolve(result);
    this.pendingPermissions.delete(toolCallId);
    if (this.usesWorkerRuntime()) {
      await this.ensureWorkerRuntime();
      this.workerProcess?.send({
        type: 'permission_response',
        toolUseId: toolCallId,
        result,
      });
    }
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
    });

    this.pendingPermissions.delete(toolCallId);
    if (this.usesWorkerRuntime()) {
      await this.ensureWorkerRuntime();
      this.workerProcess?.send({
        type: 'permission_response',
        toolUseId: toolCallId,
        result: {
          behavior: 'deny',
          message: 'Permission request cancelled',
          interrupt: true,
        },
      });
    }
  }

  /**
   * Cancels the current prompt
   */
  async cancelPrompt(): Promise<void> {
    if (this.usesWorkerRuntime()) {
      await this.ensureWorkerRuntime();
      this.workerProcess?.send({ type: 'interrupt' });
    }
    if (this.abortController) {
      this.abortController.abort();
    }

    if (this.currentQuery) {
      await this.currentQuery.interrupt();
    }

    if (this.currentStream) {
      await this.currentStream.return?.(undefined);
    }

    // Cancel all pending permissions
    if (this.usesWorkerRuntime() && this.workerProcess) {
      // In worker mode pending.resolve is a no-op placeholder; unblock the
      // worker's own pendingPermissions map by sending explicit deny responses.
      for (const [toolCallId] of this.pendingPermissions) {
        this.workerProcess.send({
          type: 'permission_response',
          toolUseId: toolCallId,
          result: { behavior: 'deny', message: 'Prompt cancelled', interrupt: true },
        });
      }
    } else {
      for (const [, pending] of this.pendingPermissions) {
        pending.resolve({
          behavior: 'deny',
          message: 'Prompt cancelled',
          interrupt: true,
        });
      }
    }
    this.pendingPermissions.clear();

    this.isProcessing = false;
    this.currentStream = null;
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

    if (this.workerProcess) {
      this.workerProcess.send({ type: 'close' });
      this.workerProcess = null;
      this.workerReady = null;
      this.pendingWorkerRpc.clear();
    }

    if (this.runtimeSession) {
      this.runtimeSession.close();
      this.runtimeSession = null;
      this.currentQuery = null;
      this.currentStream = null;
    }

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
    const effectiveSdkSessionId = this.sdkSessionId || this.sdkConfig.resume || null;

    return {
      id: this.id,
      agent: this.agentType,
      authMode: this.sessionConfig.auth.mode,
      running: this.isProcessing,
      pendingRequests: this.pendingPermissions.size,
      lastActivityTime: this.lastActivityTime,
      idleMs: Date.now() - this.lastActivityTime,
      acpSessionId: effectiveSdkSessionId, // Backward compat
      sdkSessionId: effectiveSdkSessionId, // Explicit field
      isResumable: !this.isShuttingDown,
      config: this.sdkConfig,
      lastResult: this.lastResult,
      workingDirectory: this.workingDir,
    };
  }

  /**
   * Get the working directory for this session
   */
  getWorkingDirectory(): string | undefined {
    return this.workingDir;
  }
}
