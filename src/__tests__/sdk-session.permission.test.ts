import { describe, expect, it, vi } from 'vitest';
import type { PermissionResult, PermissionUpdate } from '@anthropic-ai/claude-agent-sdk';
import { SdkSession } from '../sdk-session.js';

function createSession() {
  return new SdkSession(
    {
      id: 'session-1',
      agent: 'claude_sdk',
      auth: { mode: 'oauth' },
      sdk: { model: 'sonnet' },
    } as never,
    {
      sessionIdleTimeoutMs: 60_000,
    } as never
  );
}

function createTestHarness() {
  const session = createSession();
  const sessionAny = session as any;
  vi.spyOn(sessionAny, 'usesWorkerRuntime').mockReturnValue(false);
  return sessionAny as {
    pendingPermissions: Map<string, unknown>;
    respondToPermission: (toolCallId: string, optionId: string, answers?: Record<string, string>) => Promise<void>;
  };
}

function makePending(
  resolve: ReturnType<typeof vi.fn>,
  overrides: { toolInput?: Record<string, unknown>; sdkSuggestions?: PermissionUpdate[] } = {}
) {
  return {
    toolName: 'Write',
    toolInput: overrides.toolInput ?? { file_path: '/tmp/test.txt', content: 'hello' },
    toolUseID: 'tool-1',
    resolve,
    signal: new AbortController().signal,
    options: [],
    sdkSuggestions: overrides.sdkSuggestions ?? [],
  };
}

describe('SdkSession permission response mapping', () => {
  it('returns original sdk suggestions for allow_always', async () => {
    const session = createTestHarness();
    const resolve = vi.fn();
    const toolInput = { file_path: '/tmp/test.txt', content: 'hello' };
    const suggestion: PermissionUpdate = {
      type: 'setMode',
      mode: 'acceptEdits',
      destination: 'session',
    };

    session.pendingPermissions.set('tool-1', makePending(resolve, { toolInput, sdkSuggestions: [suggestion] }));
    await session.respondToPermission('tool-1', 'allow_always');

    expect(resolve).toHaveBeenCalledWith({
      behavior: 'allow',
      updatedInput: toolInput,
      updatedPermissions: [suggestion],
    } satisfies PermissionResult);
  });

  it('echoes updatedInput from pending toolInput for plain allow', async () => {
    const session = createTestHarness();
    const resolve = vi.fn();
    const toolInput = { file_path: '/tmp/test.txt', content: 'hello' };

    session.pendingPermissions.set('tool-1', makePending(resolve, { toolInput }));
    await session.respondToPermission('tool-1', 'allow');

    expect(resolve).toHaveBeenCalledWith({
      behavior: 'allow',
      updatedInput: toolInput,
    } satisfies PermissionResult);
  });

  it('returns only the selected sdk suggestion for suggestion_n', async () => {
    const session = createTestHarness();
    const resolve = vi.fn();
    const suggestions: PermissionUpdate[] = [
      {
        type: 'setMode',
        mode: 'acceptEdits',
        destination: 'session',
      },
      {
        type: 'addDirectories',
        directories: ['C:\\work'],
        destination: 'session',
      },
    ];

    session.pendingPermissions.set('tool-1', makePending(resolve, { sdkSuggestions: suggestions }));
    await session.respondToPermission('tool-1', 'suggestion_1', { answer: 'ok' });

    expect(resolve).toHaveBeenCalledWith({
      behavior: 'allow',
      updatedInput: { answer: 'ok' },
      updatedPermissions: [suggestions[1]],
    } satisfies PermissionResult);
  });

  it('echoes toolInput for suggestion_n when no answers provided', async () => {
    const session = createTestHarness();
    const resolve = vi.fn();
    const toolInput = { file_path: '/tmp/out.txt', content: 'data' };
    const suggestions: PermissionUpdate[] = [
      {
        type: 'setMode',
        mode: 'acceptEdits',
        destination: 'session',
      },
    ];

    session.pendingPermissions.set('tool-1', makePending(resolve, { toolInput, sdkSuggestions: suggestions }));
    await session.respondToPermission('tool-1', 'suggestion_0');

    expect(resolve).toHaveBeenCalledWith({
      behavior: 'allow',
      updatedInput: toolInput,
      updatedPermissions: [suggestions[0]],
    } satisfies PermissionResult);
  });

  it('does not include toolUseID in deny results', async () => {
    const session = createTestHarness();
    const resolve = vi.fn();

    session.pendingPermissions.set('tool-1', makePending(resolve));
    await session.respondToPermission('tool-1', 'deny');

    expect(resolve).toHaveBeenCalledWith({
      behavior: 'deny',
      message: 'User denied permission',
    } satisfies PermissionResult);
  });
});
