import type {
  SDKMessage,
  SDKSession,
  SDKSessionOptions,
  SDKUserMessage,
  PermissionResult,
  PermissionUpdate,
} from '@anthropic-ai/claude-agent-sdk';
import {
  unstable_v2_createSession,
  unstable_v2_resumeSession,
} from '@anthropic-ai/claude-agent-sdk';

type WorkerInitMessage = {
  type: 'init';
  config: Record<string, unknown>;
  resumeId?: string;
};

type WorkerPromptMessage = {
  type: 'prompt';
  prompt: string | SDKUserMessage;
};

type WorkerPermissionResponseMessage = {
  type: 'permission_response';
  toolUseId: string;
  result: PermissionResult;
};

type WorkerRpcMessage = {
  type: 'rpc';
  requestId: number;
  method: string;
  args?: unknown[];
};

type WorkerWarmupMessage = {
  type: 'warmup';
};

type WorkerControlMessage =
  | { type: 'close' }
  | { type: 'interrupt' };

type ParentToWorkerMessage =
  | WorkerInitMessage
  | WorkerPromptMessage
  | WorkerPermissionResponseMessage
  | WorkerRpcMessage
  | WorkerWarmupMessage
  | WorkerControlMessage;

type WorkerToParentMessage =
  | { type: 'ready'; sessionId?: string }
  | { type: 'sdk_message'; message: SDKMessage }
  | {
      type: 'permission_request';
      toolName: string;
      input: Record<string, unknown>;
      toolUseId: string;
      suggestions?: PermissionUpdate[];
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

type RuntimeSessionWithQuery = SDKSession & {
  query?: {
    interrupt?: () => Promise<void>;
    setPermissionMode?: (mode: string) => Promise<void>;
    setModel?: (model?: string) => Promise<void>;
    setMaxThinkingTokens?: (tokens: number | null) => Promise<void>;
    supportedCommands?: () => Promise<unknown>;
    supportedModels?: () => Promise<unknown>;
    accountInfo?: () => Promise<unknown>;
    mcpServerStatus?: () => Promise<unknown>;
    rewindFiles?: (messageId: string, options?: { dryRun?: boolean }) => Promise<unknown>;
    setMcpServers?: (servers: Record<string, unknown>) => Promise<unknown>;
  };
};

const pendingPermissions = new Map<
  string,
  { resolve: (result: PermissionResult) => void; reject: (error: Error) => void }
>();

let runtimeSession: RuntimeSessionWithQuery | null = null;
let currentStream: AsyncGenerator<SDKMessage, void> | null = null;
let workerConfig: Record<string, unknown> | null = null;

function send(message: WorkerToParentMessage): void {
  if (process.send) {
    process.send(message);
  }
}

function createPermissionHandler() {
  return async (
    toolName: string,
    input: Record<string, unknown>,
    options: {
      signal: AbortSignal;
      suggestions?: PermissionUpdate[];
      blockedPath?: string;
      decisionReason?: string;
      toolUseID: string;
      agentID?: string;
    }
  ): Promise<PermissionResult> => {
    return new Promise<PermissionResult>((resolve, reject) => {
      const { toolUseID, signal, suggestions, blockedPath, decisionReason, agentID } = options;
      pendingPermissions.set(toolUseID, { resolve, reject });

      signal.addEventListener('abort', () => {
        pendingPermissions.delete(toolUseID);
        reject(new Error('Permission request aborted'));
      });

      send({
        type: 'permission_request',
        toolName,
        input,
        toolUseId: toolUseID,
        suggestions,
        blockedPath,
        decisionReason,
        agentId: agentID,
      });
    });
  };
}

function getCurrentQuery(): RuntimeSessionWithQuery['query'] | null {
  return runtimeSession?.query ?? null;
}

async function interruptCurrentPrompt(): Promise<void> {
  const query = getCurrentQuery();
  if (query?.interrupt) {
    await query.interrupt();
  }
  if (currentStream) {
    await currentStream.return?.(undefined);
    currentStream = null;
  }
}

function buildSessionOptions(config: Record<string, unknown>): SDKSessionOptions {
  const options = {
    ...config,
    env: process.env,
    canUseTool: createPermissionHandler(),
  };
  return options as SDKSessionOptions;
}

async function handlePrompt(prompt: string | SDKUserMessage): Promise<void> {
  if (!runtimeSession) {
    throw new Error('Worker runtime not initialized');
  }

  await runtimeSession.send(prompt);
  currentStream = runtimeSession.stream();

  try {
    for await (const message of currentStream) {
      send({ type: 'sdk_message', message });
    }
    send({ type: 'prompt_complete' });
  } finally {
    currentStream = null;
  }
}

async function handleRpc(requestId: number, method: string, args: unknown[] = []): Promise<void> {
  try {
    if (method === 'interrupt') {
      await interruptCurrentPrompt();
      send({ type: 'rpc_result', requestId, result: true });
      return;
    }

    const query = getCurrentQuery();
    if (!query) {
      throw new Error('No active query available');
    }

    const target = query as Record<string, (...params: unknown[]) => Promise<unknown>>;
    const fn = target[method];
    if (typeof fn !== 'function') {
      throw new Error(`Unsupported worker RPC: ${method}`);
    }

    const result = await fn.apply(query, args);
    send({ type: 'rpc_result', requestId, result });
  } catch (error) {
    send({
      type: 'rpc_error',
      requestId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

async function handleWarmup(): Promise<void> {
  if (!runtimeSession) {
    throw new Error('Worker runtime not initialized');
  }

  // Send a dummy prompt to bootstrap the SDK stream
  await runtimeSession.send('hi');
  currentStream = runtimeSession.stream();

  let gotInit = false;
  try {
    for await (const message of currentStream) {
      if (message.type === 'system' && (message as Record<string, unknown>).subtype === 'init') {
        gotInit = true;

        // Grab models, commands, and account info from the active query
        const query = getCurrentQuery();
        let models: unknown[] = [];
        let commands: unknown[] = [];
        let accountInfo: unknown | null = null;

        if (query) {
          try { models = (await query.supportedModels?.()) as unknown[] ?? []; } catch { /* ignore */ }
          try { commands = (await query.supportedCommands?.()) as unknown[] ?? []; } catch { /* ignore */ }
          try { accountInfo = (await query.accountInfo?.()) ?? null; } catch { /* ignore */ }
        }

        send({ type: 'warmup_done', models, commands, accountInfo });
        break;
      }
    }
  } finally {
    currentStream = null;
  }

  if (!gotInit) {
    throw new Error('Warmup stream ended without init message');
  }

  // Recreate the session fresh so the dummy prompt doesn't pollute real conversations
  runtimeSession.close();
  runtimeSession = unstable_v2_createSession(
    buildSessionOptions(workerConfig ?? {})
  ) as RuntimeSessionWithQuery;
}

process.on('message', async (message: ParentToWorkerMessage) => {
  try {
    switch (message.type) {
      case 'init': {
        workerConfig = message.config;
        const options = buildSessionOptions(message.config);
        runtimeSession = message.resumeId
          ? (unstable_v2_resumeSession(message.resumeId, options) as RuntimeSessionWithQuery)
          : (unstable_v2_createSession(options) as RuntimeSessionWithQuery);
        send({
          type: 'ready',
          sessionId: message.resumeId ? runtimeSession.sessionId : undefined,
        });
        break;
      }

      case 'prompt':
        await handlePrompt(message.prompt);
        break;

      case 'warmup':
        try {
          await handleWarmup();
        } catch (error) {
          send({
            type: 'warmup_error',
            error: error instanceof Error ? error.message : String(error),
          });
        }
        break;

      case 'permission_response': {
        const pending = pendingPermissions.get(message.toolUseId);
        if (pending) {
          pendingPermissions.delete(message.toolUseId);
          pending.resolve(message.result);
        }
        break;
      }

      case 'rpc':
        await handleRpc(message.requestId, message.method, message.args);
        break;

      case 'interrupt':
        await interruptCurrentPrompt();
        break;

      case 'close':
        await interruptCurrentPrompt();
        runtimeSession?.close();
        runtimeSession = null;
        process.exit(0);
        break;
    }
  } catch (error) {
    send({
      type: message.type === 'rpc' ? 'rpc_error' : 'prompt_failed',
      ...(message.type === 'rpc'
        ? { requestId: message.requestId }
        : {}),
      error: error instanceof Error ? error.message : String(error),
    } as WorkerToParentMessage);
  }
});

process.on('uncaughtException', (error) => {
  send({ type: 'worker_error', error: error.message });
});

process.on('unhandledRejection', (reason) => {
  send({
    type: 'worker_error',
    error: reason instanceof Error ? reason.message : String(reason),
  });
});
