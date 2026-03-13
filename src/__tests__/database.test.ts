import { describe, it, expect, beforeEach } from 'vitest';
import { randomUUID } from 'crypto';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { ApertureDatabase } from '../database.js';
import type { ManagedRepoRecord } from '../database.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(__dirname, '..', 'migrations');

describe('ApertureDatabase - Managed Repos', () => {
  let db: ApertureDatabase;

  beforeEach(() => {
    // Use in-memory database for fast, isolated tests
    db = new ApertureDatabase(':memory:');
    db.migrate(migrationsDir);
  });

  function createRepo(overrides: Partial<ManagedRepoRecord> = {}): ManagedRepoRecord {
    return {
      id: randomUUID(),
      workspace_id: 'default',
      path: `/tmp/test-repo-${randomUUID().substring(0, 8)}`,
      name: `test-repo-${randomUUID().substring(0, 8)}`,
      origin_url: null,
      created_at: Date.now(),
      session_id: null,
      ...overrides,
    };
  }

  describe('saveManagedRepo', () => {
    it('saves a new managed repo', () => {
      const repo = createRepo();
      db.saveManagedRepo(repo);

      const result = db.getManagedRepo(repo.id);
      expect(result).not.toBeNull();
      expect(result!.id).toBe(repo.id);
      expect(result!.name).toBe(repo.name);
      expect(result!.path).toBe(repo.path);
    });

    it('upserts on duplicate ID', () => {
      const repo = createRepo();
      db.saveManagedRepo(repo);

      const updated = { ...repo, name: 'updated-name' };
      db.saveManagedRepo(updated);

      const result = db.getManagedRepo(repo.id);
      expect(result!.name).toBe('updated-name');
    });
  });

  describe('getManagedRepo', () => {
    it('returns null for non-existent ID', () => {
      const result = db.getManagedRepo('non-existent');
      expect(result).toBeNull();
    });
  });

  describe('getManagedRepos', () => {
    it('returns repos for a workspace ordered by created_at DESC', () => {
      const repo1 = createRepo({ workspace_id: 'ws1', created_at: 1000 });
      const repo2 = createRepo({ workspace_id: 'ws1', created_at: 2000 });
      const repo3 = createRepo({ workspace_id: 'ws2', created_at: 3000 });

      db.saveManagedRepo(repo1);
      db.saveManagedRepo(repo2);
      db.saveManagedRepo(repo3);

      const ws1Repos = db.getManagedRepos('ws1');
      expect(ws1Repos).toHaveLength(2);
      // Most recent first
      expect(ws1Repos[0].id).toBe(repo2.id);
      expect(ws1Repos[1].id).toBe(repo1.id);

      const ws2Repos = db.getManagedRepos('ws2');
      expect(ws2Repos).toHaveLength(1);
    });

    it('defaults to "default" workspace', () => {
      const repo = createRepo({ workspace_id: 'default' });
      db.saveManagedRepo(repo);

      const result = db.getManagedRepos();
      expect(result).toHaveLength(1);
    });

    it('returns empty array when no repos exist', () => {
      const result = db.getManagedRepos('non-existent');
      expect(result).toEqual([]);
    });
  });

  describe('getManagedRepoByPath', () => {
    it('finds a repo by path', () => {
      const repo = createRepo({ path: '/specific/path' });
      db.saveManagedRepo(repo);

      const result = db.getManagedRepoByPath('/specific/path');
      expect(result).not.toBeNull();
      expect(result!.id).toBe(repo.id);
    });

    it('returns null for non-existent path', () => {
      const result = db.getManagedRepoByPath('/does/not/exist');
      expect(result).toBeNull();
    });
  });

  describe('deleteManagedRepo', () => {
    it('deletes a repo by ID', () => {
      const repo = createRepo();
      db.saveManagedRepo(repo);
      expect(db.getManagedRepo(repo.id)).not.toBeNull();

      db.deleteManagedRepo(repo.id);
      expect(db.getManagedRepo(repo.id)).toBeNull();
    });

    it('does not throw when deleting non-existent repo', () => {
      expect(() => db.deleteManagedRepo('non-existent')).not.toThrow();
    });
  });

  describe('updateManagedRepoSession', () => {
    // Helper to create a session row for FK constraint satisfaction
    function createSession(sessionId: string): void {
      db.saveSession({
        id: sessionId,
        agent: 'claude_sdk',
        auth_mode: 'oauth',
        acp_session_id: null,
        created_at: Date.now(),
        last_activity_at: Date.now(),
        ended_at: null,
        status: 'active',
        metadata: null,
        user_id: null,
        sdk_session_id: null,
        sdk_config: null,
        is_resumable: 0,
        working_directory: null,
        pi_session_path: null,
      });
    }

    it('associates a session with a repo', () => {
      const repo = createRepo();
      db.saveManagedRepo(repo);

      const sessionId = randomUUID();
      createSession(sessionId);
      db.updateManagedRepoSession(repo.id, sessionId);

      const result = db.getManagedRepo(repo.id);
      expect(result!.session_id).toBe(sessionId);
    });

    it('clears session association with null', () => {
      const repo = createRepo();
      db.saveManagedRepo(repo);

      // First associate a session
      const sessionId = randomUUID();
      createSession(sessionId);
      db.updateManagedRepoSession(repo.id, sessionId);
      expect(db.getManagedRepo(repo.id)!.session_id).toBe(sessionId);

      // Then clear it
      db.updateManagedRepoSession(repo.id, null);

      const result = db.getManagedRepo(repo.id);
      expect(result!.session_id).toBeNull();
    });
  });
});
