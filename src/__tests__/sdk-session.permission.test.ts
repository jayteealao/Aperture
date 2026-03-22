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

describe('SdkSession permission response mapping', () => {
  it('returns original sdk suggestions for allow_always', async () => {
    const session = createTestHarness();
    const resolve = vi.fn();
    const suggestion: PermissionUpdate = {
      type: 'setMode',
      mode: 'acceptEdits',
      destination: 'session',
    };

    session.pendingPermissions.set('tool-1', {
      toolName: 'Write',
      toolInput: {},
      toolUseID: 'tool-1',
      resolve,
      signal: new AbortController().signal,
      options: [],
      sdkSuggestions: [suggestion],
    });
    await session.respondToPermission('tool-1', 'allow_always');

    expect(resolve).toHaveBeenCalledWith({
      behavior: 'allow',
      updatedPermissions: [suggestion],
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

    session.pendingPermissions.set('tool-1', {
      toolName: 'Write',
      toolInput: {},
      toolUseID: 'tool-1',
      resolve,
      signal: new AbortController().signal,
      options: [],
      sdkSuggestions: suggestions,
    });
    await session.respondToPermission('tool-1', 'suggestion_1', { answer: 'ok' });

    expect(resolve).toHaveBeenCalledWith({
      behavior: 'allow',
      updatedInput: { answer: 'ok' },
      updatedPermissions: [suggestions[1]],
    } satisfies PermissionResult);
  });

  it('does not include toolUseID in deny results', async () => {
    const session = createTestHarness();
    const resolve = vi.fn();

    session.pendingPermissions.set('tool-1', {
      toolName: 'Write',
      toolInput: {},
      toolUseID: 'tool-1',
      resolve,
      signal: new AbortController().signal,
      options: [],
      sdkSuggestions: [],
    });
    await session.respondToPermission('tool-1', 'deny');

    expect(resolve).toHaveBeenCalledWith({
      behavior: 'deny',
      message: 'User denied permission',
    } satisfies PermissionResult);
  });
});
