import { describe, expect, it, vi } from 'vitest';
import { SdkSession } from '../sdk-session.js';

function createDatabaseMock() {
  return {
    getSession: vi.fn(() => null),
    logEvent: vi.fn(),
    saveMessage: vi.fn(),
    updateSdkConfig: vi.fn(),
    updateSdkSessionId: vi.fn(),
  };
}

function createSession(database = createDatabaseMock()) {
  return new SdkSession(
    {
      id: 'session-1',
      agent: 'claude_sdk',
      auth: { mode: 'oauth' },
      sdk: { model: 'claude-3-7-sonnet' },
    } as never,
    {
      sessionIdleTimeoutMs: 60_000,
    } as never,
    database as never,
  );
}

describe('SdkSession transport/runtime correctness', () => {
  it('emits warmup account info using the canonical direct payload shape', () => {
    const session = createSession();
    const sessionAny = session as any;
    const onMessage = vi.fn();
    session.on('message', onMessage);

    sessionAny.cachedAccountInfo = {
      emailAddress: 'user@example.com',
      organizationName: 'Aperture',
    };

    sessionAny.emitWarmupData();

    expect(onMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'session/account_info',
        params: {
          emailAddress: 'user@example.com',
          organizationName: 'Aperture',
        },
      }),
    );
  });

  it('returns only rewindable checkpoint ids from the checkpoint API', () => {
    const session = createSession();
    const sessionAny = session as any;

    sessionAny.messageUuids.set('assistant-1', 'assistant');
    sessionAny.messageUuids.set('user-1', 'user');
    sessionAny.messageUuids.set('assistant-2', 'assistant');
    sessionAny.recordCheckpointMessageId('user-1');

    expect(session.getCheckpointMessageIds()).toEqual(['user-1']);
  });

  it('applies config updates through the canonical session path and persists them', async () => {
    const database = createDatabaseMock();
    const session = createSession(database);
    const sessionAny = session as any;

    vi.spyOn(sessionAny, 'usesWorkerRuntime').mockReturnValue(false);

    await session.applyConfigUpdate({
      model: 'claude-3-7-opus',
      effort: 'high',
      systemPrompt: 'Be precise',
    });

    expect(session.getConfig()).toMatchObject({
      model: 'claude-3-7-opus',
      effort: 'high',
      systemPrompt: 'Be precise',
    });
    expect(database.updateSdkConfig).toHaveBeenCalled();
  });

  it('refreshes the prepared runtime before the first prompt after config changes', async () => {
    const session = createSession();
    const sessionAny = session as any;
    const runtime = {
      send: vi.fn(async () => {}),
      stream: vi.fn(async function* () {}),
    };

    vi.spyOn(sessionAny, 'usesWorkerRuntime').mockReturnValue(false);
    sessionAny.runtimeSession = runtime;
    sessionAny.currentQuery = {};
    sessionAny.hasStartedConversation = false;

    await session.setModel('claude-3-7-opus');

    const refreshSpy = vi.spyOn(sessionAny, 'refreshRuntimeSessionForPrompt').mockImplementation(async () => {
      sessionAny.needsRuntimeRefreshBeforePrompt = false;
      sessionAny.runtimeSession = runtime;
    });

    await session.sendPrompt('hello');

    expect(refreshSpy).toHaveBeenCalledTimes(1);
    expect(runtime.send).toHaveBeenCalledWith('hello');
  });
});
