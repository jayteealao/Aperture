import { ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import { createInterface } from 'readline';
import type { Config } from './config.js';
import type { AgentBackend, SessionConfig, AgentType } from './agents/index.js';
import {
  parseMessage,
  serializeMessage,
  isResponse,
  isRequest,
  type JsonRpcMessage,
  type JsonRpcResponse,
} from './jsonrpc.js';

interface PendingRequest {
  resolve: (response: JsonRpcResponse) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
}

/**
 * Manages a single ACP agent child process
 */
export class Session extends EventEmitter {
  public readonly id: string;
  public readonly agentType: AgentType;
  private child: ChildProcess | null = null;
  private config: Config;
  private backend: AgentBackend;
  private sessionConfig: SessionConfig;
  private resolvedApiKey?: string;
  private pendingRequests: Map<string | number, PendingRequest> = new Map();
  private stdinMutex: Promise<void> = Promise.resolve();
  private lastActivityTime: number = Date.now();
  private idleTimer: NodeJS.Timeout | null = null;
  private isShuttingDown = false;

  constructor(
    sessionConfig: SessionConfig,
    backend: AgentBackend,
    config: Config,
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
  }

  /**
   * Sends a JSON-RPC message to the child process
   * For requests (with id), returns a promise that resolves with the response
   * For notifications (no id), returns immediately
   */
  async send(message: JsonRpcMessage): Promise<JsonRpcResponse | null> {
    if (!this.child || this.isShuttingDown) {
      throw new Error('Session not running');
    }

    this.updateActivity();

    // Serialize and validate
    const serialized = serializeMessage(message);

    // Check message size
    if (Buffer.byteLength(serialized) > this.config.maxMessageSizeBytes) {
      throw new Error(`Message exceeds max size of ${this.config.maxMessageSizeBytes} bytes`);
    }

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

        // Write to stdin (with mutex to prevent interleaving)
        this.writeToStdin(serialized).catch((err) => {
          this.pendingRequests.delete(message.id!);
          clearTimeout(timer);
          reject(err);
        });
      });
    } else {
      // Notification or response - fire and forget
      await this.writeToStdin(serialized);
      return null;
    }
  }

  /**
   * Writes to stdin with mutex to prevent interleaving
   */
  private async writeToStdin(data: string): Promise<void> {
    // Wait for previous write to complete
    await this.stdinMutex;

    // Create new mutex promise
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
      releaseMutex();
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

      // Emit raw message for SSE/WS broadcast
      this.emit('message', message);

      // If this is a response, fulfill pending request
      if (isResponse(message)) {
        const pending = this.pendingRequests.get(message.id);
        if (pending) {
          clearTimeout(pending.timer);
          this.pendingRequests.delete(message.id);
          pending.resolve(message);
        }
      }
    } catch (err) {
      this.emit('error', new Error(`Failed to parse stdout: ${(err as Error).message}`));
    }
  }

  /**
   * Handles child process exit
   */
  private handleChildExit(code: number | null, signal: string | null): void {
    this.child = null;

    // Reject all pending requests
    for (const [id, pending] of this.pendingRequests) {
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

    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }

    // Reject all pending requests
    for (const [id, pending] of this.pendingRequests) {
      clearTimeout(pending.timer);
      pending.reject(new Error('Session terminated'));
    }
    this.pendingRequests.clear();

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
  } {
    return {
      id: this.id,
      agent: this.agentType,
      authMode: this.sessionConfig.auth.mode,
      running: this.child !== null && !this.isShuttingDown,
      pendingRequests: this.pendingRequests.size,
      lastActivityTime: this.lastActivityTime,
      idleMs: Date.now() - this.lastActivityTime,
    };
  }
}
