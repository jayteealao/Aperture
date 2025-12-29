import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Session } from '../src/session';
import { spawn } from 'child_process';
import { EventEmitter } from 'events';

// Mock child_process.spawn
vi.mock('child_process', () => {
  return {
    spawn: vi.fn(),
  };
});

// Mock config
vi.mock('../src/config', () => ({
  config: {
    CLAUDE_CODE_EXECUTABLE: undefined,
    SESSION_TIMEOUT_MS: 1000,
  }
}));

// Mock CliManager
vi.mock('../src/cli', () => ({
  CliManager: {
    getInstance: () => ({
      getExecutablePath: () => '/usr/bin/claude'
    })
  }
}));

describe('Session', () => {
  let mockProcess: any;

  beforeEach(() => {
    mockProcess = new EventEmitter();
    mockProcess.stdin = { write: vi.fn() };
    mockProcess.stdout = new EventEmitter();
    (mockProcess.stdout as any).resume = vi.fn();
    (mockProcess.stdout as any).pause = vi.fn();
    (mockProcess.stdout as any).setEncoding = vi.fn();

    mockProcess.stderr = new EventEmitter();
    (mockProcess.stderr as any).resume = vi.fn();
    (mockProcess.stderr as any).pause = vi.fn();
    (mockProcess.stderr as any).setEncoding = vi.fn();
    mockProcess.kill = vi.fn();
    (spawn as any).mockReturnValue(mockProcess);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should spawn process on start', async () => {
    const session = new Session({});
    await session.start();
    expect(spawn).toHaveBeenCalledWith('claude-code-acp', [], expect.objectContaining({
      env: expect.objectContaining({ CLAUDE_CODE_EXECUTABLE: '/usr/bin/claude' })
    }));
  });

  it('should handle RPC request and response', async () => {
    const session = new Session({});
    await session.start();

    const request = { jsonrpc: '2.0', method: 'ping', id: 1 } as any;
    const responsePromise = session.sendRpc(request);

    // Simulate child process responding
    const responseStr = JSON.stringify({ jsonrpc: '2.0', result: 'pong', id: 1 });
    mockProcess.stdout.emit('data', responseStr + '\n');

    const response = await responsePromise;
    expect(response).toEqual({ jsonrpc: '2.0', result: 'pong', id: 1 });
  });

  it('should timeout if no response', async () => {
    const session = new Session({});
    await session.start();

    const request = { jsonrpc: '2.0', method: 'ping', id: 2 } as any;
    await expect(session.sendRpc(request, 100)).rejects.toThrow('Request timed out');
  });

  it('should emit output event for every line', () => new Promise<void>((resolve) => {
    const session = new Session({});
    session.start();

    session.on('output', (line) => {
      expect(line).toContain('log');
      resolve();
    });

    const log = JSON.stringify({ jsonrpc: '2.0', method: 'log', params: 'msg' });
    mockProcess.stdout.emit('data', log + '\n');
  }));
});
