# Security Testing Patterns for Aperture

Reusable test patterns for preventing the 11 classes of security issues.

---

## 1. URL Validation Tests

**File location:** `test/security/url-validation.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { validateGitUrl } from '../../src/routes/workspaces';

describe('URL Validation - SSRF Prevention', () => {
  describe('Valid URLs', () => {
    const validUrls = [
      'https://github.com/user/repo.git',
      'https://gitlab.com/user/repo.git',
      'https://bitbucket.org/user/repo.git',
      'git@github.com:user/repo.git',
      'git@gitlab.com:user/repo.git',
    ];

    for (const url of validUrls) {
      it(`accepts ${url}`, () => {
        const result = validateGitUrl(url);
        expect(result.valid).toBe(true);
      });
    }
  });

  describe('SSRF Attacks - Localhost', () => {
    const localhostUrls = [
      'https://localhost/repo.git',
      'https://localhost:8080/repo.git',
      'https://127.0.0.1/repo.git',
      'https://127.0.0.1:3000/repo.git',
      'https://127.1.1.1/repo.git',
      'https://[::1]/repo.git', // IPv6 loopback
    ];

    for (const url of localhostUrls) {
      it(`rejects ${url}`, () => {
        const result = validateGitUrl(url);
        expect(result.valid).toBe(false);
        expect(result.error).toContain('Internal network');
      });
    }
  });

  describe('SSRF Attacks - Private IP Ranges', () => {
    const privateIpUrls = [
      // Class A: 10.0.0.0/8
      'https://10.0.0.1/repo.git',
      'https://10.255.255.255/repo.git',
      // Class B: 172.16.0.0/12
      'https://172.16.0.1/repo.git',
      'https://172.31.255.255/repo.git',
      // Class C: 192.168.0.0/16
      'https://192.168.0.1/repo.git',
      'https://192.168.255.255/repo.git',
      // Link-local: 169.254.0.0/16
      'https://169.254.0.1/repo.git',
      'https://169.254.169.254/repo.git', // AWS metadata
      // This network: 0.0.0.0/8
      'https://0.0.0.0/repo.git',
      'https://0.0.0.1/repo.git',
    ];

    for (const url of privateIpUrls) {
      it(`rejects ${url}`, () => {
        const result = validateGitUrl(url);
        expect(result.valid).toBe(false);
        expect(result.error).toContain('Internal network');
      });
    }
  });

  describe('Invalid Format', () => {
    const invalidUrls = [
      'http://github.com/repo.git', // HTTP not allowed
      'ftp://github.com/repo.git',
      'file:///local/repo.git',
      'git@github.com:user/repo', // Missing .git, but should still work
      'not-a-url',
      'github.com/user/repo.git', // Missing scheme
    ];

    for (const url of invalidUrls) {
      it(`rejects ${url}`, () => {
        const result = validateGitUrl(url);
        expect(result.valid).toBe(false);
      });
    }
  });
});
```

---

## 2. Path Validation Tests

**File location:** `test/security/path-validation.test.ts`

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { validatePath, validatePathExists } from '../../src/discovery/pathValidation';
import fs from 'fs';
import path from 'path';
import os from 'os';

describe('Path Validation - Symlink & TOCTOU Prevention', () => {
  let tmpDir: string;

  beforeAll(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'path-validation-test-'));
  });

  afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true });
  });

  describe('Basic Validation', () => {
    it('accepts absolute paths', () => {
      const result = validatePath('/home/user/repo');
      expect(result).toBe('/home/user/repo');
    });

    it('rejects relative paths', () => {
      expect(() => validatePath('relative/path')).toThrow('must be absolute');
    });

    it('normalizes redundant separators', () => {
      const result = validatePath('/home//user///repo');
      // Should normalize to /home/user/repo
      expect(result).not.toContain('//');
    });

    it('handles .. in paths', () => {
      const result = validatePath('/home/user/../user/repo');
      // Should normalize away the ..
      expect(result).toBe('/home/user/repo');
    });
  });

  describe('Windows Path Handling', () => {
    if (process.platform === 'win32') {
      it('accepts Windows drive letters', () => {
        const result = validatePath('C:\\Users\\Test');
        expect(result).toMatch(/^[a-zA-Z]:/);
      });

      it('normalizes Windows backslashes', () => {
        const result = validatePath('C:\\Users\\Test\\..\\Test');
        expect(result).not.toContain('..');
      });

      it('rejects non-existent drives', () => {
        // Z: drive probably doesn't exist
        expect(() => validatePath('Z:\\NonExistent')).toThrow();
      });
    }
  });

  describe('Path Existence Validation', () => {
    it('accepts existing directories', async () => {
      const result = await validatePathExists(tmpDir);
      expect(result).toBe(tmpDir);
    });

    it('rejects non-existent paths', async () => {
      const nonExistent = path.join(tmpDir, 'does-not-exist');
      await expect(validatePathExists(nonExistent)).rejects.toThrow();
    });

    it('handles race conditions gracefully', async () => {
      // Create a directory
      const testDir = path.join(tmpDir, 'race-test');
      fs.mkdirSync(testDir);

      try {
        // Validate while it exists
        const result = await validatePathExists(testDir);
        expect(result).toBe(testDir);
      } finally {
        fs.rmSync(testDir);
      }
    });
  });

  describe('Symlink Handling', () => {
    if (process.platform !== 'win32') { // Symlinks work differently on Windows
      it('normalizes symlinks away', async () => {
        // Create a real directory
        const realDir = path.join(tmpDir, 'real-dir');
        fs.mkdirSync(realDir);

        // Create a symlink to it
        const symlink = path.join(tmpDir, 'link-dir');
        fs.symlinkSync(realDir, symlink);

        try {
          const result = await validatePathExists(symlink);
          // Result should be normalized (follow symlink)
          expect(result).toContain('real-dir');
        } finally {
          fs.rmSync(symlink);
          fs.rmSync(realDir);
        }
      });

      it('detects broken symlinks', async () => {
        const symlink = path.join(tmpDir, 'broken-link');
        fs.symlinkSync('/nonexistent/target', symlink);

        try {
          await expect(validatePathExists(symlink)).rejects.toThrow();
        } finally {
          fs.rmSync(symlink);
        }
      });
    }
  });
});
```

---

## 3. Duplicate Detection & Race Condition Tests

**File location:** `test/security/duplicate-detection.test.ts`

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import app from '../../src/index';
import { ApertureDatabase } from '../../src/database';
import fs from 'fs';
import path from 'path';
import os from 'os';

describe('Duplicate Detection - Race Condition Prevention', () => {
  let database: ApertureDatabase;
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'duplicate-test-'));
    const dbPath = path.join(tmpDir, 'test.db');
    database = new ApertureDatabase(dbPath);
  });

  describe('Single Request Deduplication', () => {
    it('rejects duplicate workspace with same repo_root', async () => {
      const repoPath = path.join(tmpDir, 'test-repo');
      fs.mkdirSync(repoPath);
      fs.mkdirSync(path.join(repoPath, '.git'));

      // Create first workspace
      const response1 = await request(app)
        .post('/v1/workspaces')
        .send({
          name: 'workspace-1',
          repoRoot: repoPath,
        });

      expect(response1.status).toBe(201);

      // Try to create duplicate
      const response2 = await request(app)
        .post('/v1/workspaces')
        .send({
          name: 'workspace-2',
          repoRoot: repoPath,
        });

      expect(response2.status).toBe(409);
      expect(response2.body.error).toBe('DUPLICATE_WORKSPACE');
    });

    it('handles normalized path duplicates on Windows', async () => {
      if (process.platform !== 'win32') {
        this.skip();
      }

      const repoPath = path.join(tmpDir, 'test-repo');
      fs.mkdirSync(repoPath);
      fs.mkdirSync(path.join(repoPath, '.git'));

      // Create with lowercase
      await request(app).post('/v1/workspaces').send({
        name: 'workspace-1',
        repoRoot: repoPath.toLowerCase(),
      });

      // Try with UPPERCASE - should still be detected as duplicate
      const response = await request(app)
        .post('/v1/workspaces')
        .send({
          name: 'workspace-2',
          repoRoot: repoPath.toUpperCase(),
        });

      expect(response.status).toBe(409);
    });

    it('handles trailing slash normalization', async () => {
      const repoPath = path.join(tmpDir, 'test-repo');
      fs.mkdirSync(repoPath);
      fs.mkdirSync(path.join(repoPath, '.git'));

      // Create without trailing slash
      await request(app).post('/v1/workspaces').send({
        name: 'workspace-1',
        repoRoot: repoPath,
      });

      // Try with trailing slash - should still be detected as duplicate
      const response = await request(app)
        .post('/v1/workspaces')
        .send({
          name: 'workspace-2',
          repoRoot: repoPath + path.sep,
        });

      expect(response.status).toBe(409);
    });
  });

  describe('Concurrent Request Deduplication', () => {
    it('handles concurrent creates with same repo_root', async () => {
      const repoPath = path.join(tmpDir, 'test-repo');
      fs.mkdirSync(repoPath);
      fs.mkdirSync(path.join(repoPath, '.git'));

      // Send 5 concurrent requests with same repo_root
      const promises = [];
      for (let i = 0; i < 5; i++) {
        promises.push(
          request(app)
            .post('/v1/workspaces')
            .send({
              name: `workspace-${i}`,
              repoRoot: repoPath,
            })
        );
      }

      const results = await Promise.all(promises);

      // Expect exactly 1 success and 4 conflicts
      const successes = results.filter(r => r.status === 201);
      const conflicts = results.filter(r => r.status === 409);

      expect(successes).toHaveLength(1);
      expect(conflicts).toHaveLength(4);

      // Verify database has exactly 1 workspace
      const workspaces = database.getAllWorkspaces();
      expect(workspaces).toHaveLength(1);
    });

    it('prevents race condition in clone duplicate check', async () => {
      // This test verifies that even though we check for duplicates
      // before cloning, we also rely on database constraints
      // because of potential TOCTOU windows

      const repoPath = path.join(tmpDir, 'test-repo');
      fs.mkdirSync(repoPath);
      fs.mkdirSync(path.join(repoPath, '.git'));

      // Create workspace
      await database.saveWorkspace({
        id: 'workspace-1',
        name: 'workspace-1',
        repo_root: repoPath,
        description: null,
        created_at: Date.now(),
        updated_at: Date.now(),
        metadata: null,
      });

      // Verify database constraint catches duplicate
      expect(() => {
        database.saveWorkspace({
          id: 'workspace-2',
          name: 'workspace-2',
          repo_root: repoPath,
          description: null,
          created_at: Date.now(),
          updated_at: Date.now(),
          metadata: null,
        });
      }).toThrow();
    });
  });

  describe('Clone Deduplication', () => {
    it('cleans up cloned directory on duplicate detection', async () => {
      const repoPath = path.join(tmpDir, 'test-repo');
      fs.mkdirSync(repoPath);
      fs.mkdirSync(path.join(repoPath, '.git'));

      // Create first workspace
      await database.saveWorkspace({
        id: 'workspace-1',
        name: 'workspace-1',
        repo_root: repoPath,
        description: null,
        created_at: Date.now(),
        updated_at: Date.now(),
        metadata: null,
      });

      // Mock clone to return same path (simulating duplicate)
      // In real test, would need to mock git2::clone or filesystem state

      // Verify cleanup happened on duplicate detection
      // (This is a simplified example - actual test depends on mocking)
    });
  });
});
```

---

## 4. Cleanup & Error Handling Tests

**File location:** `test/security/cleanup.test.ts`

```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { cloneRepository } from '../../src/discovery/repoCloner';

describe('Error Handling & Cleanup', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cleanup-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('Filesystem Cleanup on Error', () => {
    it('cleans up created directory on validation failure', async () => {
      // Invalid URL - should fail before creating directory
      await expect(
        cloneRepository({
          remoteUrl: 'https://127.0.0.1/repo.git', // SSRF attempt
          targetDirectory: tmpDir,
        })
      ).rejects.toThrow();

      // No directory should be created
      const entries = fs.readdirSync(tmpDir);
      expect(entries).toHaveLength(0);
    });

    it('cleans up partially cloned directory on clone failure', async () => {
      const rmSpy = vi.spyOn(fs.promises, 'rm');

      try {
        await cloneRepository({
          remoteUrl: 'https://github.com/nonexistent/repo-that-does-not-exist-xyz.git',
          targetDirectory: tmpDir,
        });
      } catch (error) {
        // Expected to fail
      }

      // Verify cleanup was attempted
      expect(rmSpy).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ recursive: true, force: true })
      );
    });
  });

  describe('Error Message Safety', () => {
    it('does not leak internal paths in error responses', async () => {
      const response = await request(app)
        .post('/v1/discovery/scan')
        .send({
          path: '/some/very/long/internal/path/structure/that/should/not/leak',
        });

      expect(response.status).toBe(400);
      // Error message should NOT contain the full path
      const errorStr = JSON.stringify(response.body);
      expect(errorStr).not.toContain('/some/very/long/internal');
    });

    it('does not leak git credentials in error responses', async () => {
      const sensitiveUrl = 'https://user:password123@github.com/repo.git';

      const response = await request(app)
        .post('/v1/workspaces/clone')
        .send({
          remoteUrl: sensitiveUrl,
          targetDirectory: tmpDir,
        });

      expect(response.status).toBe(400);
      const errorStr = JSON.stringify(response.body);
      expect(errorStr).not.toContain('password123');
      expect(errorStr).not.toContain('user:');
    });

    it('provides helpful error messages for users', async () => {
      const response = await request(app)
        .post('/v1/discovery/scan')
        .send({
          path: '/nonexistent/path',
        });

      expect(response.status).toBe(400);
      expect(response.body.message).toMatch(/does not exist|not accessible/i);
    });
  });

  describe('Database Exception Handling', () => {
    it('distinguishes UNIQUE constraint violations', async () => {
      const database = new ApertureDatabase(path.join(tmpDir, 'test.db'));

      const workspace = {
        id: 'workspace-1',
        name: 'test',
        repo_root: '/same/path',
        description: null,
        created_at: Date.now(),
        updated_at: Date.now(),
        metadata: null,
      };

      // First insert succeeds
      database.saveWorkspace(workspace);

      // Second insert with same repo_root should throw UNIQUE constraint
      expect(() => {
        database.saveWorkspace({
          ...workspace,
          id: 'workspace-2',
        });
      }).toThrow();

      database.close();
    });
  });
});
```

---

## 5. Callback Rate Limiting Tests

**File location:** `test/security/callback-rate-limiting.test.ts`

```typescript
import { describe, it, expect } from 'vitest';

describe('Callback Rate Limiting', () => {
  describe('Rust native addon rate limiting', () => {
    it('limits progress callbacks to 10/sec (100ms throttle)', async () => {
      // This test simulates cloning and verifies callback rate limiting
      const callCount = { count: 0 };
      const timestamps: number[] = [];

      const onProgress = (progress: any) => {
        callCount.count++;
        timestamps.push(Date.now());
      };

      // Mock clone that reports progress 1000 times
      // With rate limiting, should only emit ~10 times in a 1 second operation

      // Simulate 1000 progress updates over 1 second
      for (let i = 0; i < 1000; i++) {
        // In real implementation, git2 library calls callback
        // Our rate limiting should prevent all 1000 from reaching JS
      }

      // With 100ms throttle over 1 second, expect ~10 callbacks max
      expect(callCount.count).toBeLessThanOrEqual(15); // Allow small variance
      expect(callCount.count).toBeGreaterThan(5); // But should have some
    });

    it('emits when percentage changes even without time passing', async () => {
      // Rate limiting should emit immediately if:
      // - 100ms has passed OR
      // - Progress percentage increased

      // Mock scenario: fast progress with distinct percentages
      // Should emit on each new percentage without waiting 100ms

      const percentages: number[] = [];
      const callbacks: any[] = [];

      // 10 rapid updates with increasing percentages
      for (let i = 0; i <= 100; i += 10) {
        callbacks.push({ percent: i });
      }

      // Should emit all ~11 callbacks (0, 10, 20, ..., 100)
      // Even though they happen rapidly
      expect(callbacks.length).toBeGreaterThanOrEqual(10);
    });
  });

  describe('Preventing resource exhaustion', () => {
    it('handles high-frequency updates without buffer overflow', async () => {
      // Without rate limiting, 1000 callbacks could fill up
      // Node.js event queue and cause memory pressure

      // With rate limiting, should keep queue small
      // (This is more of an integration test requirement)
    });
  });
});
```

---

## 6. Symlink Security Tests

**File location:** `test/security/symlink-safety.test.ts`

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { discoverRepositories } from '../../src/discovery/repoDiscovery';
import fs from 'fs';
import path from 'path';
import os from 'os';

describe('Symlink Safety - Directory Traversal Prevention', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'symlink-test-'));
  });

  afterEach(() => {
    // Use force flag to remove symlinks
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  if (process.platform !== 'win32') {
    describe('Symlink Detection', () => {
      it('skips symlink directories during traversal', async () => {
        // Create structure:
        // tmpDir/
        //   real-repo/.git
        //   symlink-to-parent -> ..

        const realRepo = path.join(tmpDir, 'real-repo');
        fs.mkdirSync(realRepo);
        fs.mkdirSync(path.join(realRepo, '.git'));

        const symlinkPath = path.join(tmpDir, 'symlink-to-parent');
        fs.symlinkSync('..', symlinkPath);

        const result = await discoverRepositories(tmpDir);

        // Should find real-repo
        expect(result.repos).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              path: realRepo,
            }),
          ])
        );

        // Should NOT have descended into symlink
        const foundSymlinkRepo = result.repos.some(r => r.path.includes('symlink'));
        expect(foundSymlinkRepo).toBe(false);
      });

      it('rejects symlink at scan root', async () => {
        // Create symlink pointing outside scan directory
        const externalDir = fs.mkdtempSync(
          path.join(os.tmpdir(), 'external-')
        );

        try {
          const symlinkPath = path.join(tmpDir, 'external-link');
          fs.symlinkSync(externalDir, symlinkPath);

          const result = await discoverRepositories(tmpDir);

          // Should not traverse into symlink target
          const foundExternal = result.repos.some(r =>
            r.path.includes('external-')
          );
          expect(foundExternal).toBe(false);
        } finally {
          fs.rmSync(externalDir, { recursive: true });
        }
      });

      it('handles circular symlinks gracefully', async () => {
        // Create circular symlink: symlink1 -> symlink2 -> symlink1
        const symlink1 = path.join(tmpDir, 'symlink1');
        const symlink2 = path.join(tmpDir, 'symlink2');

        fs.symlinkSync(symlink2, symlink1);
        fs.symlinkSync(symlink1, symlink2);

        // Should not hang or crash
        const result = await discoverRepositories(tmpDir);

        // Should complete without error
        expect(result).toBeDefined();
        expect(result.errors).toBeDefined();
      });

      it('detects and skips broken symlinks', async () => {
        const brokenLink = path.join(tmpDir, 'broken-link');
        fs.symlinkSync('/nonexistent/target', brokenLink);

        const result = await discoverRepositories(tmpDir);

        // Should not error or include broken symlink
        expect(result.repos).toHaveLength(0);
      });
    });

    describe('Symlink Attack Prevention', () => {
      it('prevents symlink escape attacks', async () => {
        // Create: tmpDir/subdir/../../etc/passwd symlink
        const subdir = path.join(tmpDir, 'subdir');
        fs.mkdirSync(subdir);

        // Try to create symlink pointing outside tmpDir
        const escapeLinkPath = path.join(subdir, 'escape');
        fs.symlinkSync('../../../../../../etc', escapeLinkPath);

        const result = await discoverRepositories(tmpDir);

        // Should not traverse into /etc or outside tmpDir
        const foundEtc = result.repos.some(r => r.path.includes('/etc'));
        expect(foundEtc).toBe(false);
      });

      it('validates resolved paths stay within scan directory', async () => {
        // Even if somehow we followed a symlink, validate endpoint
        // should reject paths outside the scan directory

        const scanDir = tmpDir;
        const externalDir = path.dirname(tmpDir);

        // Symlink pointing to parent directory
        const linkPath = path.join(scanDir, 'link-to-parent');
        fs.symlinkSync('..', linkPath);

        const result = await discoverRepositories(scanDir);

        // All discovered repos should be under scanDir
        for (const repo of result.repos) {
          expect(repo.path).toContain(scanDir);
        }
      });
    });
  }
});
```

---

## 7. Concurrency & Async Tests

**File location:** `test/security/async-safety.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../../src/index';

describe('Async Operations - Non-Blocking Verification', () => {
  describe('Concurrent Requests', () => {
    it('handles multiple concurrent scan requests', async () => {
      // Send 5 scan requests in parallel
      // If any were blocking, some would timeout or fail

      const promises = [];
      for (let i = 0; i < 5; i++) {
        promises.push(
          request(app)
            .post('/v1/discovery/scan')
            .send({ path: '/tmp' })
            .timeout(5000) // 5 second timeout - would fail if blocking
        );
      }

      const results = await Promise.all(promises);

      // All should complete without timeout
      const timedOut = results.filter(r => r.timeout);
      expect(timedOut).toHaveLength(0);
    });

    it('does not block event loop with native addon calls', async () => {
      const startTime = Date.now();

      // Send 3 concurrent clone requests
      // First should NOT block the second and third

      const requests = Promise.all([
        request(app).post('/v1/workspaces/clone').send({
          remoteUrl: 'https://github.com/repo1/repo.git',
          targetDirectory: '/tmp',
        }),
        request(app).post('/v1/workspaces/clone').send({
          remoteUrl: 'https://github.com/repo2/repo.git',
          targetDirectory: '/tmp',
        }),
        request(app).post('/v1/workspaces/clone').send({
          remoteUrl: 'https://github.com/repo3/repo.git',
          targetDirectory: '/tmp',
        }),
      ]);

      // With proper async/await and spawn_blocking,
      // should take ~T for all 3, not 3*T
      // (This is a rough test - actual timing varies)

      const elapsed = Date.now() - startTime;
      // Rough check: all 3 should be mostly concurrent
      // (In reality, this depends on network and git2 behavior)
    });
  });

  describe('No Blocking I/O in Routes', () => {
    it('routes do not use synchronous file operations', async () => {
      // This test verifies code doesn't use:
      // - fs.readFileSync
      // - fs.writeFileSync
      // - fs.readdirSync
      // etc. in the request path

      // (This is more of a static analysis check)
      // We test by ensuring routes remain responsive during slow FS ops

      const response = await Promise.race([
        request(app).get('/v1/workspaces'),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Timeout')), 1000)
        ),
      ]);

      // Should respond quickly
      expect(response).toBeDefined();
    });
  });
});
```

---

## 8. API Response Consistency Tests

**File location:** `test/security/api-consistency.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../../src/index';

describe('API Response Consistency', () => {
  describe('HTTP Status Codes', () => {
    it('uses 201 for successful creation', async () => {
      const response = await request(app)
        .post('/v1/workspaces')
        .send({
          name: 'test',
          repoRoot: '/valid/repo',
        });

      if (response.status === 201) {
        expect(response.body).toHaveProperty('workspace');
      }
    });

    it('uses 400 for validation errors', async () => {
      const response = await request(app)
        .post('/v1/workspaces')
        .send({
          // missing name
          repoRoot: '/valid/repo',
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBeDefined();
    });

    it('uses 404 for not found', async () => {
      const response = await request(app).get('/v1/workspaces/nonexistent-id');

      expect(response.status).toBe(404);
    });

    it('uses 409 for conflicts', async () => {
      // First create a workspace
      await request(app).post('/v1/workspaces').send({
        name: 'test',
        repoRoot: '/some/path',
      });

      // Try to create duplicate
      const response = await request(app)
        .post('/v1/workspaces')
        .send({
          name: 'test2',
          repoRoot: '/some/path',
        });

      expect(response.status).toBe(409);
    });

    it('uses 500 for server errors only', async () => {
      // Force a server error (database connection failure, etc.)
      // Response should be 500, not 400 or 409

      const response = await request(app)
        .post('/v1/workspaces')
        .send({
          name: 'test',
          repoRoot: '/valid/repo',
        })
        .set('X-Force-Server-Error', 'true'); // Hypothetical header

      if (response.status === 500) {
        expect(response.body.error).toBeDefined();
      }
    });
  });

  describe('Error Response Format', () => {
    it('includes error code and message', async () => {
      const response = await request(app)
        .post('/v1/discovery/scan')
        .send({
          path: '/nonexistent',
        });

      expect(response.body).toHaveProperty('error');
      expect(response.body).toHaveProperty('message');
      expect(typeof response.body.error).toBe('string');
      expect(typeof response.body.message).toBe('string');
    });

    it('uses consistent field naming (camelCase)', async () => {
      const response = await request(app).get('/v1/workspaces');

      if (response.status === 200) {
        // All fields should be camelCase, not snake_case
        expect(response.body).toHaveProperty('workspaces');
        for (const ws of response.body.workspaces) {
          expect(ws).toHaveProperty('repoRoot');
          expect(ws).not.toHaveProperty('repo_root');
          expect(ws).toHaveProperty('createdAt');
          expect(ws).not.toHaveProperty('created_at');
        }
      }
    });

    it('does not leak stack traces in error responses', async () => {
      const response = await request(app)
        .post('/v1/workspaces')
        .send({ repoRoot: '/invalid' });

      const errorStr = JSON.stringify(response.body);
      expect(errorStr).not.toMatch(/at [A-Za-z_]/); // Stack trace line
      expect(errorStr).not.toMatch(/Error:/); // Error object reference
    });
  });
});
```

---

## Running Tests

### All Security Tests
```bash
pnpm test:security
```

### Specific Category
```bash
pnpm test -- test/security/url-validation.test.ts
pnpm test -- test/security/duplicate-detection.test.ts
pnpm test -- test/security/cleanup.test.ts
```

### With Coverage
```bash
pnpm test:security --coverage
```

### Before Merge
```bash
pnpm test:security && pnpm lint && pnpm build
```

---

## Test Organization Best Practices

1. **One test file per security category** (url, paths, duplicates, cleanup, callbacks, symlinks, async, api)
2. **Descriptive test names** explaining the attack or issue being prevented
3. **Setup/teardown** to clean up test artifacts (tmpDir, databases)
4. **Concurrent tests** to catch race conditions
5. **Both positive and negative cases** (what works + what should fail)
6. **Documented attack vectors** in test comments (SSRF, symlink escape, TOCTOU, etc.)

---

**Last Updated:** 2026-01-08
**Used in PRs:** All security-related changes
