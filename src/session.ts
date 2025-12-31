import { ChildProcess, spawn } from 'child_process';
import { EventEmitter } from 'events';
import { createInterface } from 'readline';
import { readFile, writeFile } from 'fs/promises';
import type { Config } from './config.js';
import type { AgentBackend, SessionConfig, AgentType } from './agents/index.js';
import type { ApertureDatabase } from './database.js';
import {
  parseMessage,
  serializeMessage,
  isResponse,
  isRequest,
  isNotification,
  type JsonRpcMessage,
  type JsonRpcResponse,
  type JsonRpcRequest,
  type JsonRpcNotification,
} from './jsonrpc.js';
import type {
  InitializeResult,
  NewSessionParams,
  NewSessionResult,
  PromptParams,
  PromptResult,
  CancelParams,
  SessionUpdateParams,
  RequestPermissionParams,
  RequestPermissionResult,
  ContentBlock,
  AgentCapabilities,
  FsReadTextFileParams,
  FsReadTextFileResult,
  FsWriteTextFileParams,
  FsWriteTextFileResult,
  TerminalCreateParams,
  TerminalCreateResult,
  TerminalOutputParams,
  TerminalOutputResult,
  TerminalKillParams,
  TerminalKillResult,
  TerminalWaitForExitParams,
  TerminalWaitForExitResult,
  TerminalReleaseParams,
  TerminalReleaseResult,
} from './acp/types.js';

interface PendingRequest {
  resolve: (response: JsonRpcResponse) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
}

// Pending permission request from agent
interface PendingPermission {
  requestId: string | number;
  params: RequestPermissionParams;
}

// Managed terminal process
interface ManagedTerminal {
  id: string;
  process: ChildProcess;
  output: string;
  truncated: boolean;
  exitCode: number | null;
  signal: string | null;
  exited: boolean;
  outputByteLimit: number;
  waitResolvers: Array<(result: { exitCode: number | null; signal: string | null }) => void>;
}

/**
 * Manages a single ACP agent child process
 */
export class Session extends EventEmitter {
  public readonly id: string;
  public readonly agentType: AgentType;
  public acpSessionId: string | null = null;
  public agentCapabilities: AgentCapabilities | null = null;
  private child: ChildProcess | null = null;
  private config: Config;
  private backend: AgentBackend;
  private sessionConfig: SessionConfig;
  private resolvedApiKey?: string;
  private pendingRequests: Map<string | number, PendingRequest> = new Map();
  private pendingPermissions: Map<string, PendingPermission> = new Map();
  private terminals: Map<string, ManagedTerminal> = new Map();
  private terminalIdCounter = 0;
  private stdinMutex: Promise<void> = Promise.resolve();
  private lastActivityTime: number = Date.now();
  private idleTimer: NodeJS.Timeout | null = null;
  private isShuttingDown = false;
  private requestIdCounter = 100; // Start at 100 to avoid conflicts with init

  constructor(
    sessionConfig: SessionConfig,
    backend: AgentBackend,
    config: Config,
    _database?: ApertureDatabase,
    resolvedApiKey?: string
  ) {
    super();
    this.id = sessionConfig.id;
    this.agentType = sessionConfig.agent;
    this.sessionConfig = sessionConfig;
    this.backend = backend;
    this.config = config;
    this.resolvedApiKey = resolvedApiKey;
  }

  /**
   * Starts the agent child process
   */
  async start(): Promise<void> {
    if (this.child) {
      throw new Error('Session already started');
    }

    // Spawn the agent via backend
    const spawnResult = await this.backend.spawn(this.sessionConfig, this.resolvedApiKey);
    this.child = spawnResult.child;

    // Handle child exit
    this.child.on('exit', (code, signal) => {
      this.handleChildExit(code, signal);
    });

    this.child.on('error', (err) => {
      this.emit('error', err);
    });

    // Set up stdout line reader
    if (this.child.stdout) {
      const rl = createInterface({
        input: this.child.stdout,
        crlfDelay: Infinity,
      });

      rl.on('line', (line) => {
        this.handleStdoutLine(line);
      });
    }

    // Forward stderr to logs
    if (this.child.stderr) {
      const stderrRl = createInterface({
        input: this.child.stderr,
        crlfDelay: Infinity,
      });

      stderrRl.on('line', (line) => {
        this.emit('stderr', line);
      });
    }

    // Start idle timer
    this.resetIdleTimer();

    // Initialize ACP protocol
    await this.initializeAcp();
  }

  /**
   * Initializes the ACP protocol with the agent
   */
  private async initializeAcp(): Promise<void> {
    // Send initialize request
    // Note: claude-code-acp expects protocolVersion as NUMBER despite ACP spec saying string
    const initParams = {
      protocolVersion: 1,
      clientInfo: {
        name: 'aperture-gateway',
        version: '1.0.0',
      },
      clientCapabilities: {
        fs: {
          readTextFile: true,
          writeTextFile: true,
        },
        terminal: true,
      },
    };

    const initResponse = await this.sendRequest<InitializeResult>('initialize', initParams, 1);

    if ('error' in initResponse && initResponse.error) {
      throw new Error(`ACP initialize failed: ${initResponse.error.message}`);
    }

    // Store agent capabilities
    if (initResponse.result) {
      this.agentCapabilities = initResponse.result.agentCapabilities || null;
    }

    // Create a new ACP session
    const sessionParams: NewSessionParams = {
      cwd: process.cwd(),
      mcpServers: [],
    };

    const sessionResponse = await this.sendRequest<NewSessionResult>('session/new', sessionParams, 2);

    if ('error' in sessionResponse && sessionResponse.error) {
      throw new Error(`ACP session/new failed: ${sessionResponse.error.message}`);
    }

    // Store the ACP session ID
    if (sessionResponse.result?.sessionId) {
      this.acpSessionId = sessionResponse.result.sessionId;
    } else {
      this.acpSessionId = this.id;
    }
  }

  /**
   * Sends a prompt to the agent (session/prompt)
   */
  async sendPrompt(content: string): Promise<PromptResult | null> {
    if (!this.acpSessionId) {
      throw new Error('Session not initialized');
    }

    const params: PromptParams = {
      sessionId: this.acpSessionId,
      prompt: [
        {
          type: 'text',
          text: content,
        },
      ],
    };

    const response = await this.sendRequest<PromptResult>('session/prompt', params);

    if ('error' in response && response.error) {
      throw new Error(`session/prompt failed: ${response.error.message}`);
    }

    return response.result || null;
  }

  /**
   * Sends a prompt with content blocks to the agent
   */
  async sendPromptBlocks(blocks: ContentBlock[]): Promise<PromptResult | null> {
    if (!this.acpSessionId) {
      throw new Error('Session not initialized');
    }

    const params: PromptParams = {
      sessionId: this.acpSessionId,
      prompt: blocks,
    };

    const response = await this.sendRequest<PromptResult>('session/prompt', params);

    if ('error' in response && response.error) {
      throw new Error(`session/prompt failed: ${response.error.message}`);
    }

    return response.result || null;
  }

  /**
   * Cancels the current prompt (session/cancel notification)
   */
  async cancelPrompt(): Promise<void> {
    if (!this.acpSessionId) {
      return;
    }

    const params: CancelParams = {
      sessionId: this.acpSessionId,
    };

    await this.sendNotification('session/cancel', params);
  }

  /**
   * Responds to a permission request from the agent
   */
  async respondToPermission(toolCallId: string, optionId: string): Promise<void> {
    const pending = this.pendingPermissions.get(toolCallId);
    if (!pending) {
      throw new Error(`No pending permission request for toolCallId: ${toolCallId}`);
    }

    const result: RequestPermissionResult = {
      outcome: { outcome: 'selected', optionId },
    };

    await this.sendResponse(pending.requestId, result);
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

    const result: RequestPermissionResult = {
      outcome: { outcome: 'cancelled' },
    };

    await this.sendResponse(pending.requestId, result);
    this.pendingPermissions.delete(toolCallId);
  }

  /**
   * Sends a JSON-RPC request and waits for response
   */
  private async sendRequest<R>(method: string, params: unknown, id?: number): Promise<JsonRpcResponse & { result?: R }> {
    const requestId = id ?? this.requestIdCounter++;

    const message: JsonRpcMessage = {
      jsonrpc: '2.0',
      method,
      params,
      id: requestId,
    };

    return this.send(message) as Promise<JsonRpcResponse & { result?: R }>;
  }

  /**
   * Sends a JSON-RPC notification (no response expected)
   */
  private async sendNotification(method: string, params: unknown): Promise<void> {
    const message: JsonRpcMessage = {
      jsonrpc: '2.0',
      method,
      params,
    };

    await this.send(message);
  }

  /**
   * Sends a JSON-RPC response to an agent request
   */
  private async sendResponse(id: string | number, result: unknown): Promise<void> {
    const message = {
      jsonrpc: '2.0' as const,
      id,
      result,
    };

    await this.writeMessage(message);
  }

  /**
   * Sends a JSON-RPC error response to an agent request
   */
  private async sendErrorResponse(id: string | number, code: number, message: string): Promise<void> {
    const response = {
      jsonrpc: '2.0' as const,
      id,
      error: { code, message },
    };

    await this.writeMessage(response);
  }

  /**
   * Sends a JSON-RPC message to the child process
   */
  async send(message: JsonRpcMessage): Promise<JsonRpcResponse | null> {
    if (!this.child || this.isShuttingDown) {
      throw new Error('Session not running');
    }

    this.updateActivity();

    if (isRequest(message) && message.id !== undefined && message.id !== null) {
      // This is a request - wait for response
      return new Promise<JsonRpcResponse>((resolve, reject) => {
        const timer = setTimeout(() => {
          this.pendingRequests.delete(message.id!);
          reject(new Error('Request timeout'));
        }, this.config.rpcRequestTimeoutMs);

        this.pendingRequests.set(message.id!, {
          resolve,
          reject,
          timer,
        });

        this.writeMessage(message).catch((err) => {
          this.pendingRequests.delete(message.id!);
          clearTimeout(timer);
          reject(err);
        });
      });
    } else {
      // Notification - fire and forget
      await this.writeMessage(message);
      return null;
    }
  }

  /**
   * Writes a message to the child process
   */
  private async writeMessage(message: unknown): Promise<void> {
    const serialized = serializeMessage(message as JsonRpcMessage);

    // Check message size
    if (Buffer.byteLength(serialized) > this.config.maxMessageSizeBytes) {
      throw new Error(`Message exceeds max size of ${this.config.maxMessageSizeBytes} bytes`);
    }

    await this.writeToStdin(serialized);
  }

  /**
   * Writes to stdin with mutex to prevent interleaving
   */
  private async writeToStdin(data: string): Promise<void> {
    await this.stdinMutex;

    let releaseMutex: () => void;
    this.stdinMutex = new Promise((resolve) => {
      releaseMutex = resolve;
    });

    try {
      if (!this.child || !this.child.stdin) {
        throw new Error('Child process stdin not available');
      }

      return new Promise<void>((resolve, reject) => {
        this.child!.stdin!.write(data, (err) => {
          if (err) {
            reject(err);
          } else {
            resolve();
          }
          releaseMutex();
        });
      });
    } catch (err) {
      releaseMutex!();
      throw err;
    }
  }

  /**
   * Handles a line from child stdout
   */
  private handleStdoutLine(line: string): void {
    this.updateActivity();

    try {
      const message = parseMessage(line);

      // Handle different message types
      if (isResponse(message)) {
        // Response to our request
        if (message.id !== null) {
          const pending = this.pendingRequests.get(message.id);
          if (pending) {
            clearTimeout(pending.timer);
            this.pendingRequests.delete(message.id);
            pending.resolve(message);
          }
        }
      } else if (isRequest(message)) {
        // Request from agent - handle it
        this.handleAgentRequest(message);
      } else if (isNotification(message)) {
        // Notification from agent (e.g., session/update)
        this.handleAgentNotification(message);
      }

      // Always emit raw message for WebSocket broadcast
      this.emit('message', message);

    } catch (err) {
      this.emit('error', new Error(`Failed to parse stdout: ${(err as Error).message}`));
    }
  }

  /**
   * Handles requests from the agent (session/request_permission, fs/*, terminal/*)
   */
  private handleAgentRequest(message: JsonRpcRequest): void {
    const method = message.method;
    const id = message.id;

    if (id === undefined || id === null) {
      return; // Not a valid request
    }

    switch (method) {
      case 'session/request_permission': {
        const params = message.params as RequestPermissionParams;
        const toolCallId = params.toolCall?.toolCallId;

        if (toolCallId) {
          this.pendingPermissions.set(toolCallId, {
            requestId: id,
            params,
          });
        }

        // Emit for UI to handle
        this.emit('permission_request', {
          id,
          toolCallId,
          toolCall: params.toolCall,
          options: params.options,
        });
        break;
      }

      case 'fs/read_text_file':
        this.handleFsReadTextFile(id, message.params as FsReadTextFileParams);
        break;

      case 'fs/write_text_file':
        this.handleFsWriteTextFile(id, message.params as FsWriteTextFileParams);
        break;

      case 'terminal/create':
        this.handleTerminalCreate(id, message.params as TerminalCreateParams);
        break;

      case 'terminal/output':
        this.handleTerminalOutput(id, message.params as TerminalOutputParams);
        break;

      case 'terminal/kill':
        this.handleTerminalKill(id, message.params as TerminalKillParams);
        break;

      case 'terminal/wait_for_exit':
        this.handleTerminalWaitForExit(id, message.params as TerminalWaitForExitParams);
        break;

      case 'terminal/release':
        this.handleTerminalRelease(id, message.params as TerminalReleaseParams);
        break;

      default:
        // Unknown method
        this.sendErrorResponse(id, -32601, `Method not found: ${method}`);
    }
  }

  /**
   * Handles notifications from the agent (session/update)
   */
  private handleAgentNotification(message: JsonRpcNotification): void {
    const method = message.method;

    if (method === 'session/update') {
      const params = message.params as SessionUpdateParams;

      // Emit specific update type for easier handling
      this.emit('session_update', params);

      // Also emit the specific update type
      const updateType = params.update?.sessionUpdate;
      if (updateType) {
        this.emit(`update:${updateType}`, params.update);
      }
    }
  }

  /**
   * Handles child process exit
   */
  private handleChildExit(code: number | null, signal: string | null): void {
    this.child = null;

    // Reject all pending requests
    for (const [_id, pending] of this.pendingRequests) {
      clearTimeout(pending.timer);
      pending.reject(new Error(`Child process exited (code: ${code}, signal: ${signal})`));
    }
    this.pendingRequests.clear();

    // Stop idle timer
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }

    this.emit('exit', { code, signal });
  }

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

    // Send cancel notification if we have an active session
    if (this.acpSessionId && this.child) {
      try {
        await this.cancelPrompt();
      } catch {
        // Ignore errors during shutdown
      }
    }

    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }

    // Reject all pending requests
    for (const [_id, pending] of this.pendingRequests) {
      clearTimeout(pending.timer);
      pending.reject(new Error('Session terminated'));
    }
    this.pendingRequests.clear();

    // Kill all managed terminals
    this.terminateAllTerminals();

    if (this.child) {
      this.child.kill('SIGTERM');

      // Force kill after 5 seconds
      setTimeout(() => {
        if (this.child) {
          this.child.kill('SIGKILL');
        }
      }, 5000);
    }
  }

  // =============================================================================
  // File System Handlers
  // =============================================================================

  /**
   * Handles fs/read_text_file request
   */
  private async handleFsReadTextFile(id: string | number, params: FsReadTextFileParams): Promise<void> {
    try {
      const content = await readFile(params.path, 'utf-8');

      // Handle line offset and limit if specified
      let result = content;
      if (params.line !== undefined || params.limit !== undefined) {
        const lines = content.split('\n');
        const startLine = params.line ?? 0;
        const limit = params.limit ?? lines.length;
        result = lines.slice(startLine, startLine + limit).join('\n');
      }

      const response: FsReadTextFileResult = { content: result };
      await this.sendResponse(id, response);
    } catch (err) {
      const error = err as NodeJS.ErrnoException;
      await this.sendErrorResponse(id, -32000, `Failed to read file: ${error.message}`);
    }
  }

  /**
   * Handles fs/write_text_file request
   */
  private async handleFsWriteTextFile(id: string | number, params: FsWriteTextFileParams): Promise<void> {
    try {
      await writeFile(params.path, params.content, 'utf-8');
      const response: FsWriteTextFileResult = {};
      await this.sendResponse(id, response);
    } catch (err) {
      const error = err as NodeJS.ErrnoException;
      await this.sendErrorResponse(id, -32000, `Failed to write file: ${error.message}`);
    }
  }

  // =============================================================================
  // Terminal Handlers
  // =============================================================================

  /**
   * Handles terminal/create request
   */
  private async handleTerminalCreate(id: string | number, params: TerminalCreateParams): Promise<void> {
    try {
      const terminalId = `term-${++this.terminalIdCounter}`;
      const outputByteLimit = params.outputByteLimit ?? 1024 * 1024; // Default 1MB

      const child = spawn(params.command, params.args ?? [], {
        cwd: params.cwd ?? process.cwd(),
        env: { ...process.env, ...params.env },
        shell: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      const terminal: ManagedTerminal = {
        id: terminalId,
        process: child,
        output: '',
        truncated: false,
        exitCode: null,
        signal: null,
        exited: false,
        outputByteLimit,
        waitResolvers: [],
      };

      // Capture stdout
      if (child.stdout) {
        child.stdout.on('data', (data: Buffer) => {
          if (!terminal.truncated) {
            const newData = data.toString();
            if (Buffer.byteLength(terminal.output + newData) > terminal.outputByteLimit) {
              terminal.output = terminal.output + newData.slice(0, terminal.outputByteLimit - Buffer.byteLength(terminal.output));
              terminal.truncated = true;
            } else {
              terminal.output += newData;
            }
          }
        });
      }

      // Capture stderr
      if (child.stderr) {
        child.stderr.on('data', (data: Buffer) => {
          if (!terminal.truncated) {
            const newData = data.toString();
            if (Buffer.byteLength(terminal.output + newData) > terminal.outputByteLimit) {
              terminal.output = terminal.output + newData.slice(0, terminal.outputByteLimit - Buffer.byteLength(terminal.output));
              terminal.truncated = true;
            } else {
              terminal.output += newData;
            }
          }
        });
      }

      // Handle exit
      child.on('exit', (code, signal) => {
        terminal.exitCode = code;
        terminal.signal = signal;
        terminal.exited = true;

        // Resolve all waiters
        for (const resolver of terminal.waitResolvers) {
          resolver({ exitCode: code, signal });
        }
        terminal.waitResolvers = [];
      });

      child.on('error', (err) => {
        terminal.exited = true;
        terminal.exitCode = -1;
        terminal.output += `\nProcess error: ${err.message}`;

        // Resolve all waiters with error
        for (const resolver of terminal.waitResolvers) {
          resolver({ exitCode: -1, signal: null });
        }
        terminal.waitResolvers = [];
      });

      this.terminals.set(terminalId, terminal);

      const response: TerminalCreateResult = { terminalId };
      await this.sendResponse(id, response);
    } catch (err) {
      const error = err as Error;
      await this.sendErrorResponse(id, -32000, `Failed to create terminal: ${error.message}`);
    }
  }

  /**
   * Handles terminal/output request
   */
  private async handleTerminalOutput(id: string | number, params: TerminalOutputParams): Promise<void> {
    const terminal = this.terminals.get(params.terminalId);
    if (!terminal) {
      await this.sendErrorResponse(id, -32000, `Terminal not found: ${params.terminalId}`);
      return;
    }

    const response: TerminalOutputResult = {
      output: terminal.output,
      truncated: terminal.truncated,
      exitStatus: terminal.exited ? {
        exitCode: terminal.exitCode,
        signal: terminal.signal,
      } : undefined,
    };
    await this.sendResponse(id, response);
  }

  /**
   * Handles terminal/kill request
   */
  private async handleTerminalKill(id: string | number, params: TerminalKillParams): Promise<void> {
    const terminal = this.terminals.get(params.terminalId);
    if (!terminal) {
      await this.sendErrorResponse(id, -32000, `Terminal not found: ${params.terminalId}`);
      return;
    }

    if (!terminal.exited) {
      terminal.process.kill('SIGTERM');
      // Force kill after 5 seconds
      setTimeout(() => {
        if (!terminal.exited) {
          terminal.process.kill('SIGKILL');
        }
      }, 5000);
    }

    const response: TerminalKillResult = {};
    await this.sendResponse(id, response);
  }

  /**
   * Handles terminal/wait_for_exit request
   */
  private async handleTerminalWaitForExit(id: string | number, params: TerminalWaitForExitParams): Promise<void> {
    const terminal = this.terminals.get(params.terminalId);
    if (!terminal) {
      await this.sendErrorResponse(id, -32000, `Terminal not found: ${params.terminalId}`);
      return;
    }

    if (terminal.exited) {
      const response: TerminalWaitForExitResult = {
        exitCode: terminal.exitCode,
        signal: terminal.signal,
      };
      await this.sendResponse(id, response);
      return;
    }

    // Wait for exit
    const result = await new Promise<{ exitCode: number | null; signal: string | null }>((resolve) => {
      terminal.waitResolvers.push(resolve);
    });

    const response: TerminalWaitForExitResult = {
      exitCode: result.exitCode,
      signal: result.signal,
    };
    await this.sendResponse(id, response);
  }

  /**
   * Handles terminal/release request
   */
  private async handleTerminalRelease(id: string | number, params: TerminalReleaseParams): Promise<void> {
    const terminal = this.terminals.get(params.terminalId);
    if (!terminal) {
      await this.sendErrorResponse(id, -32000, `Terminal not found: ${params.terminalId}`);
      return;
    }

    // Kill if still running
    if (!terminal.exited) {
      terminal.process.kill('SIGKILL');
    }

    // Remove from map
    this.terminals.delete(params.terminalId);

    const response: TerminalReleaseResult = {};
    await this.sendResponse(id, response);
  }

  /**
   * Terminates all managed terminals
   */
  private terminateAllTerminals(): void {
    for (const [_id, terminal] of this.terminals) {
      if (!terminal.exited) {
        terminal.process.kill('SIGKILL');
      }
    }
    this.terminals.clear();
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
  } {
    return {
      id: this.id,
      agent: this.agentType,
      authMode: this.sessionConfig.auth.mode,
      running: this.child !== null && !this.isShuttingDown,
      pendingRequests: this.pendingRequests.size,
      lastActivityTime: this.lastActivityTime,
      idleMs: Date.now() - this.lastActivityTime,
      acpSessionId: this.acpSessionId,
    };
  }
}
