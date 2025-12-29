import { spawn, ChildProcessWithoutNullStreams } from 'child_process';
import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import { config } from './config';
import { parseJsonRpcMessage, formatJsonRpcMessage, JsonRpcMessage, JsonRpcResponse } from './jsonrpc';
import { CliManager } from './cli';
import * as readline from 'readline';

export interface SessionOptions {
  apiKey?: string;
}

export class Session extends EventEmitter {
  public readonly id: string;
  private process: ChildProcessWithoutNullStreams | null = null;
  private pendingRequests = new Map<string | number, { resolve: (val: any) => void; reject: (err: any) => void; timer: NodeJS.Timeout }>();
  private readonly startTime: number;
  private lastActivityTime: number;

  constructor(private options: SessionOptions) {
    super();
    this.id = uuidv4();
    this.startTime = Date.now();
    this.lastActivityTime = Date.now();
  }

  async start() {
    const cliManager = CliManager.getInstance();
    const claudeExecutable = cliManager.getExecutablePath();

    const env: NodeJS.ProcessEnv = {
      ...process.env,
      // If we have a resolved path, set it. Otherwise let the adapter fallback or use vendored.
      ...(claudeExecutable ? { CLAUDE_CODE_EXECUTABLE: claudeExecutable } : {}),
      // Auth handling
      ...(this.options.apiKey ? { ANTHROPIC_API_KEY: this.options.apiKey } : {}),
      // Ensure we don't accidentally pass the host's key if not intended (though we filtered process.env,
      // standard practice is to be careful. The prompt says: "If no API key is provided, DO NOT set ANTHROPIC_API_KEY")
      // process.env above includes everything. We should sanitize if necessary, but the prompt says
      // "If env ANTHROPIC_API_KEY is present in the gateway... pass it through".
      // But also "If no API key is provided, DO NOT set ANTHROPIC_API_KEY".
      // If the gateway has it in env, it's passed via `...process.env`.
      // If the gateway DOES NOT have it, and user didn't provide it, it won't be in `...process.env` either.
      // Wait, if options.apiKey is undefined, we shouldn't overwrite if it exists in process.env?
      // The prompt says: "If env ANTHROPIC_API_KEY is present in the gateway (or passed per-session), pass it through".
      // So merging process.env is correct.
      // BUT "Subscription mode: If no API key is provided, DO NOT set ANTHROPIC_API_KEY".
      // This implies we should REMOVE it if we want to force subscription mode?
      // No, it says "If no API key is provided [by the user/env], DO NOT set it".
      // Basically, don't inject a default one if the user wants subscription.
      // If the HOST has an API Key, the session will inherit it.
      // If the user wants subscription mode, they probably shouldn't set the env var on the gateway.
    };

    // If we want to support subscription mode cleanly, we might want to ensure we don't leak the gateway's key
    // if the specific session didn't ask for it, OR we assume the gateway's key is the "default" key.
    // The prompt says: "If env ANTHROPIC_API_KEY is present in the gateway ... pass it through."
    // So if the gateway is configured with a key, all sessions use it unless overridden?
    // Or maybe the gateway shouldn't have it if we want subscription.
    // I will stick to: inherit process.env, and override with options.apiKey if present.

    // Command: "claude-code-acp" (from prompt)
    // The prompt says: "npm install ... and claude-code-acp as the command."
    // We assume `claude-code-acp` is in the path (npm install -g).
    // If not, we might need to find it. But let's assume it works.

    this.process = spawn('claude-code-acp', [], {
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    this.process.on('error', (err) => {
      console.error(`[Session ${this.id}] Spawn error:`, err);
      this.emit('error', err);
      this.close();
    });

    this.process.on('exit', (code, signal) => {
      console.log(`[Session ${this.id}] Exited with code ${code} signal ${signal}`);
      this.emit('exit', code, signal);
      this.close();
    });

    if (this.process.stdout) {
      const rl = readline.createInterface({ input: this.process.stdout, terminal: false });
      rl.on('line', (line) => {
        this.handleStdoutLine(line);
      });
    }

    if (this.process.stderr) {
      this.process.stderr.on('data', (data) => {
        console.error(`[Session ${this.id} stderr] ${data.toString()}`);
      });
    }
  }

  private handleStdoutLine(line: string) {
    this.lastActivityTime = Date.now();
    try {
      // 1. Broadcast raw line to listeners (SSE/WS will handle wrapping)
      this.emit('output', line);

      // 2. Parse for RPC handling
      const message = parseJsonRpcMessage(line);
      if (message) {
        // Check if it's a response to a pending request
        if ('id' in message && message.id !== undefined && message.id !== null) {
          const pending = this.pendingRequests.get(message.id);
          if (pending) {
             pending.resolve(message);
             this.pendingRequests.delete(message.id);
             clearTimeout(pending.timer);
          }
        }
      }
    } catch (err) {
      console.error(`[Session ${this.id}] Error handling line:`, err);
    }
  }

  async sendRpc(message: JsonRpcMessage, timeoutMs: number = 30000): Promise<JsonRpcResponse | null> {
    this.lastActivityTime = Date.now();
    if (!this.process || this.process.killed) {
      throw new Error('Session is closed');
    }

    const line = formatJsonRpcMessage(message);
    this.process.stdin.write(line + '\n');

    // If it's a notification, return null
    if (!('id' in message) || message.id === undefined || message.id === null) {
      return null;
    }

    // It's a request, wait for response
    return new Promise<JsonRpcResponse>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingRequests.delete(message.id!);
        reject(new Error('Request timed out'));
      }, timeoutMs);

      this.pendingRequests.set(message.id!, { resolve, reject, timer });
    });
  }

  sendRaw(message: JsonRpcMessage) {
    if (!this.process || this.process.killed) {
        throw new Error('Session is closed');
    }
    const line = formatJsonRpcMessage(message);
    this.process.stdin.write(line + '\n');
  }

  close() {
    if (this.process) {
      this.process.kill(); // SIGTERM
      this.process = null;
    }
    // Clean up pending requests
    for (const [id, req] of this.pendingRequests) {
      clearTimeout(req.timer);
      req.reject(new Error('Session closed'));
    }
    this.pendingRequests.clear();
    this.emit('close');
    this.removeAllListeners();
  }

  isIdle(timeoutMs: number): boolean {
    return (Date.now() - this.lastActivityTime) > timeoutMs;
  }
}
