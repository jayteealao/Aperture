import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SessionRecord } from '../database.js';
import { SdkSession } from '../sdk-session.js';
import { SessionManager } from '../sessionManager.js';

function createSessionRecord(overrides: Partial<SessionRecord> = {}): SessionRecord {
  return {
    id: 'session-1',
    agent: 'claude_sdk',
    auth_mode: 'oauth',
    acp_session_id: null,
    created_at: 1,
    last_activity_at: 2,
    ended_at: null,
    status: 'idle',
    metadata: null,
    user_id: null,
    sdk_session_id: 'claude-session-1',
    sdk_config: null,
    is_resumable: 1,
    working_directory: 'C:\\Users\\jayte\\.aperture\\workspaces\\Crumb\\session-1',
    workspace_id: 'workspace-1',
    pi_session_path: null,
    ...overrides,
  };
}

function createDatabase(record: SessionRecord) {
  return {
    getResumableSessions: vi.fn(() => [record]),
    updateSessionStatus: vi.fn(),
    endSession: vi.fn(),
    markNonResumable: vi.fn(),
    getSession: vi.fn((id: string) => (id === record.id ? record : null)),
    saveSession: vi.fn(),
    updateSessionActivity: vi.fn(),
  };
}

function createLogger() {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
}

describe('SessionManager Claude restore lifecycle', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('keeps resumable Claude sessions idle on startup when provider resume resolves in the checkout cwd', async () => {
    const record = createSessionRecord();
    const database = createDatabase(record);
    const logger = createLogger();
    const manager = new SessionManager({} as never, logger as never, database as never);

    const canResumeSpy = vi.spyOn(SdkSession, 'canResumeProviderSession').mockResolvedValue(true);

    await manager.restoreSessions();

    expect(canResumeSpy).toHaveBeenCalledWith(
      'claude-session-1',
      'C:\\Users\\jayte\\.aperture\\workspaces\\Crumb\\session-1'
    );
    expect(database.updateSessionStatus).toHaveBeenCalledWith('session-1', 'idle', expect.any(Number), null);
    expect(database.endSession).not.toHaveBeenCalled();
    expect(database.markNonResumable).not.toHaveBeenCalled();
  });

  it('downgrades startup sessions to history-only when provider resume no longer resolves', async () => {
    const record = createSessionRecord();
    const database = createDatabase(record);
    const logger = createLogger();
    const manager = new SessionManager({} as never, logger as never, database as never);

    vi.spyOn(SdkSession, 'canResumeProviderSession').mockResolvedValue(false);

    await manager.restoreSessions();

    expect(database.endSession).toHaveBeenCalledWith('session-1', expect.any(Number));
    expect(database.markNonResumable).toHaveBeenCalledWith('session-1');
    expect(database.updateSessionStatus).not.toHaveBeenCalled();
  });

  it('marks a session history-only and throws when a direct restore is attempted after provider resume stops resolving', async () => {
    const record = createSessionRecord({
      id: 'session-restore',
      sdk_session_id: 'claude-session-restore',
      working_directory: 'C:\\Users\\jayte\\.aperture\\workspaces\\Crumb\\session-restore',
    });
    const database = createDatabase(record);
    const logger = createLogger();
    const manager = new SessionManager({} as never, logger as never, database as never);

    const canResumeSpy = vi.spyOn(SdkSession, 'canResumeProviderSession').mockResolvedValue(false);

    await expect(manager.restoreSession('session-restore')).rejects.toThrow(
      'Claude provider session can no longer be resumed for session-restore'
    );

    expect(canResumeSpy).toHaveBeenCalledWith(
      'claude-session-restore',
      'C:\\Users\\jayte\\.aperture\\workspaces\\Crumb\\session-restore'
    );
    expect(database.endSession).toHaveBeenCalledWith('session-restore', expect.any(Number));
    expect(database.markNonResumable).toHaveBeenCalledWith('session-restore');
  });
});
