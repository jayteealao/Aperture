# Security Prevention Guide for Aperture

**Status:** Compound Documentation
**Created:** 2026-01-08
**Context:** Prevention strategies for 11 critical security findings

## Executive Summary

This document codifies lessons learned from 11 security issues discovered in the Aperture codebase. Rather than preventing future occurrences of these specific bugs, it establishes architectural patterns, testing practices, and code review workflows to prevent entire *classes* of similar vulnerabilities.

The issues span three categories:
- **Concurrency & Performance**: Blocking async, unbounded callbacks, N+1 queries
- **Path & Filesystem**: TOCTOU race conditions, symlink attacks, path comparison issues
- **Network & API**: SSRF attacks, duplicate checks, information disclosure, inconsistent responses

---

## 1. PR Checklist for Security Review

Use this checklist for all PRs that touch these areas:

### 1.1 Async/Native Code (Node.js + Rust)

- [ ] All long-running operations use `tokio::task::spawn_blocking()` to avoid blocking event loop
- [ ] Native addon functions marked with `#[napi]` are `async` (not sync)
- [ ] Callbacks have rate-limiting if fired repeatedly (see Pattern: Rate-Limited Callbacks)
- [ ] No synchronous file system calls (`fs.readFileSync`, etc.) in hot paths
- [ ] Test: Verify non-blocking with concurrent requests using `Promise.all()`

**Example Problem Found:**
```typescript
// BEFORE: Synchronous clone was blocking
// AFTER: Async with progress callback rate limiting
pub async fn clone_repository(
    url: String,
    target_path: String,
    progress_callback: ThreadsafeFunction<CloneProgress>,
) -> Result<String>
```

### 1.2 URL & Path Validation

- [ ] All external URLs validated with `validateGitUrl()` pattern (protocol + IP blocking)
- [ ] All file paths validated with `validatePath()` and `validatePathExists()`
- [ ] Paths normalized with `resolve()` + `normalize()` before comparison
- [ ] Case-insensitive comparison used on Windows (`toLowerCase()`)
- [ ] Symlinks explicitly rejected in directory traversal (`!entry.isSymbolicLink()`)
- [ ] No user input directly interpolated into file paths
- [ ] Test: Attempt SSRF with localhost, 127.0.0.1, 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16

**Example Problem Found:**
```typescript
// VALIDATES: HTTPS/SSH only + blocks internal IPs
function validateGitUrl(url: string): { valid: boolean; error?: string } {
  const httpsPattern = /^https:\/\/[^\/]+\/.+$/;
  const sshPattern = /^git@[^:]+:.+$/;

  if (url.startsWith('https://')) {
    const urlObj = new URL(url);
    // Blocks 127.*, 10.*, 172.16-31.*, 192.168.*, 169.254.*, 0.*
  }
}

// NORMALIZES: Paths with trailing slash removal + case-insensitive
function normalizeRepoPath(p: string): string {
  return resolve(normalize(p))
    .replace(/[\\/]+$/, '')
    .toLowerCase();
}
```

### 1.3 Race Conditions & Duplicate Checks

- [ ] Unique constraints exist at database schema level (not just in-application logic)
- [ ] Path normalization identical between duplicate check and insert
- [ ] All queries that check-then-act happen in same transaction or are idempotent
- [ ] For filesystem operations: check directory before generating target path
- [ ] Test: Run duplicate inserts concurrently, verify only one succeeds

**Example Problem Found:**
```sql
-- Database enforces uniqueness: UNIQUE(repo_root)
CREATE TABLE workspaces (
  id TEXT PRIMARY KEY,
  repo_root TEXT NOT NULL UNIQUE,
  ...
);
```

```typescript
// Application-level deduplication ALSO happens with normalized paths
const normalizedClonedPath = normalizeRepoPath(clonedPath);
const duplicateWorkspace = existingWorkspaces.find(
  (w) => normalizeRepoPath(w.repo_root) === normalizedClonedPath
);
```

### 1.4 Error Handling & Cleanup

- [ ] Track resource (file/directory) paths before operations that create them
- [ ] Wrap operations in try-catch with cleanup in finally or catch block
- [ ] Cleanup errors logged but not re-thrown (don't mask original error)
- [ ] Error messages don't leak internal paths or system details
- [ ] Test: Force failures at each stage (validation, operation, save) and verify cleanup

**Example Problem Found:**
```typescript
let clonedPath: string | undefined;

try {
  clonedPath = await cloneRepository({ remoteUrl, targetDirectory });
  // ... business logic
} catch (error) {
  // Cleanup cloned directory on ANY failure
  if (clonedPath) {
    try {
      await rm(clonedPath, { recursive: true, force: true });
    } catch (cleanupError) {
      console.error('Cleanup failed:', cleanupError);
      // Don't rethrow - log only
    }
  }
}
```

### 1.5 Callback Rate Limiting

- [ ] Any callback fired 10+ times per second uses rate limiting
- [ ] Rate limit based on: elapsed time OR change in value (whichever comes first)
- [ ] Use Arc<Mutex> for shared state in blocking tasks
- [ ] Default: 100ms throttle + percentage change detection

**Example Pattern:**
```rust
let last_emit = Arc::new(Mutex::new(Instant::now()));
let last_percent = Arc::new(Mutex::new(0u32));

// Rate limit: only emit if 100ms passed OR percent changed
let should_emit = {
    let last = last_emit.lock().unwrap();
    let last_pct = last_percent.lock().unwrap();
    last.elapsed() >= Duration::from_millis(100) || percent > *last_pct
};
```

### 1.6 Query Optimization

- [ ] No N+1 patterns: separate queries in loops should be combined
- [ ] Verify with EXPLAIN QUERY PLAN in SQLite: index coverage shown
- [ ] Pagination implemented for large result sets (limit + offset)
- [ ] Database queries use prepared statements (not string interpolation)
- [ ] Test: Measure query count with 100+ entities, verify constant not linear

---

## 2. Code Review Guidelines

### 2.1 Security-Focused Review Checklist

When reviewing code, systematically check:

#### A. Input Validation
```
[ ] External URLs: validateGitUrl() or equivalent whitelist
[ ] File paths: validatePath() + validatePathExists()
[ ] Numbers/IDs: Type checking (TypeScript) + range checking
[ ] Strings: Length limits (especially before filesystem ops)
```

#### B. Concurrency & Async
```
[ ] Native/async code: spawn_blocking() used, not sync
[ ] Multiple concurrent operations: Promise.all() tested
[ ] Callbacks: Rate limiting if fired 10+ times/sec
[ ] State: No shared mutable state without locks/atomics
```

#### C. Error Handling
```
[ ] Errors don't leak secrets/paths
[ ] Resources tracked if allocation can fail
[ ] Cleanup happens even on errors
[ ] Database exceptions distinguished (UNIQUE vs other)
```

#### D. Filesystem Safety
```
[ ] Symlinks rejected in directory traversal
[ ] Paths normalized before comparison
[ ] TOCTOU: Operations are atomic or normalized path checked after existence verification
[ ] Windows compatibility: 8.3 paths normalized away
```

#### E. Database Operations
```
[ ] Unique constraints at schema level
[ ] Foreign keys enabled (ON DELETE CASCADE configured)
[ ] Transactions used for multi-step operations
[ ] No in-app dedup—rely on database constraints
```

### 2.2 Red Flags

Stop review and request changes if you see:

| Red Flag | Why | Fix |
|----------|-----|-----|
| `execSync()` or blocking file calls in routes | Blocks event loop | Use async/await + spawn_blocking |
| Regex path validation only | Can't normalize paths correctly | Use `path.resolve()` + `path.normalize()` |
| Check-then-act without transaction | Race condition window | Move check into same transaction or use UNIQUE constraint |
| Callback called in loop without throttling | Unbounded rate | Add 100ms throttle + change detection |
| Error messages with `${error.message}` | Information disclosure | Return generic error + log with context |
| Path comparison with `===` or `==` | Windows case-sensitivity | Use `normalizeRepoPath()` pattern |
| No symlink check in `readdir()` | Symlink attack | Use `entry.isSymbolicLink()` filter |
| Database save without catching UNIQUE error | Silent overwrite | Try-catch SQLITE_CONSTRAINT codes |

### 2.3 Testing Requirements for Security Changes

Any PR touching security areas must include:

1. **Unit tests** for new validation functions
   ```typescript
   describe('validateGitUrl', () => {
     it('rejects localhost URLs', () => {
       const result = validateGitUrl('https://localhost/repo.git');
       expect(result.valid).toBe(false);
     });
     it('rejects 10.0.0.0/8', () => { ... });
     it('accepts github.com', () => { ... });
   });
   ```

2. **Integration tests** for full workflows
   ```typescript
   it('fails duplicate workspace creation with normalized paths', async () => {
     await createWorkspace({ repoRoot: '/path/to/repo' });
     // Should fail even with different case/trailing slash
     await expect(createWorkspace({ repoRoot: '/PATH/TO/REPO/' }))
       .rejects.toMatch('DUPLICATE_WORKSPACE');
   });
   ```

3. **Security-specific tests**
   ```typescript
   it('cleans up clone directory on save failure', async () => {
     // Force saveWorkspace to throw
     // Verify rm() was called on cloned directory
   });

   it('handles SSRF attempts', async () => {
     const urls = [
       'https://127.0.0.1/repo.git',
       'https://169.254.169.254/repo.git', // AWS metadata
       'https://localhost:8080/repo.git',
       'http://10.0.0.1/repo.git',
     ];
     for (const url of urls) {
       const response = await request(app).post('/v1/workspaces/clone')
         .send({ remoteUrl: url, ... });
       expect(response.status).toBe(400);
     }
   });
   ```

---

## 3. Testing Recommendations

### 3.1 Test Categories & Examples

#### Category 1: Validation Tests

**File: `src/discovery/pathValidation.test.ts`**
```typescript
describe('Path Validation', () => {
  describe('validatePath', () => {
    test('accepts absolute paths', () => {
      expect(validatePath('/home/user/repo')).toBe('/home/user/repo');
    });

    test('rejects relative paths', () => {
      expect(() => validatePath('relative/path')).toThrow('must be absolute');
    });

    test('normalizes .. and symlinks away', () => {
      // Assuming /var/lib is a symlink to /var/lib-real
      const result = validatePath('/var/lib/../lib-real/data');
      expect(result).toContain('lib-real');
    });

    test('handles Windows drive letters', () => {
      if (process.platform === 'win32') {
        expect(validatePath('C:\\Users\\Test')).toBeTruthy();
        expect(() => validatePath('Z:\\NonExistent')).toThrow();
      }
    });
  });

  describe('validateGitUrl', () => {
    test('accepts HTTPS URLs to public hosts', () => {
      const result = validateGitUrl('https://github.com/user/repo.git');
      expect(result.valid).toBe(true);
    });

    test('rejects localhost', () => {
      const result = validateGitUrl('https://localhost/repo.git');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Internal network');
    });

    test('rejects 127.0.0.1', () => {
      const result = validateGitUrl('https://127.0.0.1/repo.git');
      expect(result.valid).toBe(false);
    });

    test('rejects private IP ranges', () => {
      const urls = [
        'https://10.0.0.1/repo.git',
        'https://172.20.0.1/repo.git',
        'https://192.168.1.1/repo.git',
        'https://169.254.0.1/repo.git', // Link-local
        'https://0.0.0.0/repo.git',
      ];
      for (const url of urls) {
        const result = validateGitUrl(url);
        expect(result.valid).toBe(false);
      }
    });

    test('accepts SSH format', () => {
      const result = validateGitUrl('git@github.com:user/repo.git');
      expect(result.valid).toBe(true);
    });

    test('rejects non-standard protocols', () => {
      const result = validateGitUrl('http://github.com/repo.git');
      expect(result.valid).toBe(false);
    });
  });
});
```

#### Category 2: Race Condition Tests

**File: `src/routes/workspaces.test.ts`**
```typescript
describe('Duplicate Workspace Detection', () => {
  test('concurrent duplicate creates result in 409', async () => {
    const requests = [];
    for (let i = 0; i < 5; i++) {
      requests.push(
        request(app)
          .post('/v1/workspaces')
          .send({
            name: `workspace-${i}`,
            repoRoot: '/same/repo/path',
          })
      );
    }

    const results = await Promise.all(requests);
    const successes = results.filter(r => r.status === 201);
    const conflicts = results.filter(r => r.status === 409);

    expect(successes).toHaveLength(1);
    expect(conflicts).toHaveLength(4);
  });

  test('normalized path comparison prevents duplicates', async () => {
    await request(app).post('/v1/workspaces').send({
      name: 'workspace-1',
      repoRoot: '/home/user/repo',
    });

    // Try with trailing slash, different case on Windows
    const response = await request(app).post('/v1/workspaces').send({
      name: 'workspace-2',
      repoRoot: '/HOME/USER/REPO/',
    });

    expect(response.status).toBe(409);
    expect(response.body.error).toBe('DUPLICATE_WORKSPACE');
  });
});
```

#### Category 3: Cleanup Tests

**File: `src/routes/workspaces.clone.test.ts`**
```typescript
describe('Clone Cleanup', () => {
  test('cleans up cloned directory on save failure', async () => {
    // Mock saveWorkspace to throw
    const saveSpy = jest.spyOn(database, 'saveWorkspace')
      .mockImplementation(() => {
        throw new Error('Database error');
      });

    // Mock rm to track calls
    const rmSpy = jest.spyOn(fs.promises, 'rm');

    const response = await request(app).post('/v1/workspaces/clone').send({
      remoteUrl: 'https://github.com/example/repo.git',
      targetDirectory: tmpDir,
    });

    expect(response.status).toBe(500);
    // Verify cleanup was called
    expect(rmSpy).toHaveBeenCalledWith(expect.any(String), {
      recursive: true,
      force: true,
    });
  });

  test('cleans up on duplicate detection', async () => {
    // Create first workspace
    await request(app).post('/v1/workspaces/clone').send({
      remoteUrl: 'https://github.com/example/repo1.git',
      targetDirectory: tmpDir,
    });

    // Mock the second clone to return same repo path
    const rmSpy = jest.spyOn(fs.promises, 'rm');

    const response = await request(app).post('/v1/workspaces/clone').send({
      remoteUrl: 'https://github.com/example/repo2.git',
      targetDirectory: tmpDir,
    });

    expect(response.status).toBe(409);
    expect(rmSpy).toHaveBeenCalled(); // Cleanup happened
  });
});
```

#### Category 4: Symlink Security Tests

**File: `src/discovery/repoDiscovery.test.ts`**
```typescript
describe('Symlink Safety', () => {
  test('skips symbolic link directories', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'symlink-test-'));

    try {
      // Create real dir with repo
      const realRepo = path.join(tmpDir, 'real-repo');
      fs.mkdirSync(realRepo);
      fs.mkdirSync(path.join(realRepo, '.git'));

      // Create symlink pointing to parent
      const symlinkPath = path.join(tmpDir, 'link-to-parent');
      fs.symlinkSync('..', symlinkPath);

      const result = await discoverRepositories(tmpDir);

      // Should find the real repo but not descend through symlink
      expect(result.repos).toHaveLength(1);
      expect(result.repos[0].path).not.toContain('link-to-parent');
    } finally {
      fs.rmSync(tmpDir, { recursive: true });
    }
  });

  test('rejects symlink targets in scan paths', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'symlink-test-'));
    const outsideDir = fs.mkdtempSync(path.join(os.tmpdir(), 'outside-'));

    try {
      const symlinkPath = path.join(tmpDir, 'link');
      fs.symlinkSync(outsideDir, symlinkPath);

      const response = await request(app).post('/v1/discovery/scan').send({
        path: symlinkPath,
      });

      // Should either reject or not descend
      expect(response.status).toBe(400);
    } finally {
      fs.rmSync(tmpDir, { recursive: true });
      fs.rmSync(outsideDir, { recursive: true });
    }
  });
});
```

#### Category 5: Error Message Safety

**File: `src/routes/discovery.test.ts`**
```typescript
describe('Error Message Sanitization', () => {
  test('does not leak internal paths in error responses', async () => {
    const response = await request(app).post('/v1/discovery/scan').send({
      path: '/nonexistent/path/with/internal/structure',
    });

    expect(response.status).toBe(400);
    // Error message should be generic, not include full path details
    expect(response.body.message).not.toContain('/nonexistent/path');
  });

  test('clone errors do not leak credentials', async () => {
    const response = await request(app).post('/v1/workspaces/clone').send({
      remoteUrl: 'https://user:password@github.com/repo.git',
      targetDirectory: '/tmp',
    });

    expect(response.status).toBe(400);
    // Credentials should never appear in response
    expect(JSON.stringify(response.body)).not.toContain('password');
  });
});
```

### 3.2 Performance Test Template

```typescript
describe('Performance & N+1 Prevention', () => {
  test('discovery does not N+1 query for symlinks', async () => {
    const tmpDir = fs.mkdtempSync(...);
    const queries: string[] = [];

    // Create 50 subdirectories
    for (let i = 0; i < 50; i++) {
      fs.mkdirSync(path.join(tmpDir, `dir-${i}`));
    }

    // Spy on database/filesystem calls
    const accessSpy = jest.spyOn(fs.promises, 'access');

    const result = await discoverRepositories(tmpDir);

    // Should call access once per directory, not per file
    // access calls ~= number of directories, not files
    expect(accessSpy.mock.calls.length).toBeLessThan(100);
  });

  test('callback rate limiting prevents unbounded messages', async () => {
    const callbackSpy = jest.fn();

    // Simulate 1000 progress updates
    for (let i = 0; i < 1000; i++) {
      // Should only emit ~10 times (100ms throttle, 1 second duration)
    }

    expect(callbackSpy.mock.calls.length).toBeLessThan(50);
  });
});
```

---

## 4. Architecture Patterns to Follow

### 4.1 Validation Pipeline Pattern

Apply this pattern for all external inputs:

```
User Input
    ↓
[Type Check] (TypeScript or manual)
    ↓
[Format Check] (regex, URL parsing, etc.)
    ↓
[Whitelist Check] (allowed protocols, IP ranges, etc.)
    ↓
[Normalization] (resolve paths, lowercase URLs, etc.)
    ↓
[Existence Check] (file exists, repo is valid, etc.)
    ↓
Safe to Use
```

**Example: Git URL**
```typescript
export function validateAndNormalizeGitUrl(
  input: unknown
): { valid: true; url: string } | { valid: false; error: string } {
  // 1. Type check
  if (typeof input !== 'string') {
    return { valid: false, error: 'URL must be string' };
  }

  // 2. Format check
  const httpsPattern = /^https:\/\/[^\/]+\/.+$/;
  const sshPattern = /^git@[^:]+:.+$/;
  if (!httpsPattern.test(input) && !sshPattern.test(input)) {
    return { valid: false, error: 'Invalid URL format' };
  }

  // 3. Whitelist check (SSRF prevention)
  if (input.startsWith('https://')) {
    const urlObj = new URL(input);
    if (isInternalIP(urlObj.hostname)) {
      return { valid: false, error: 'Internal IPs not allowed' };
    }
  }

  // 4. Normalization (not strictly needed for URLs, but shown for pattern)
  const normalized = input.toLowerCase();

  // 5. Existence check happens at clone time

  return { valid: true, url: normalized };
}
```

### 4.2 Safe Filesystem Operation Pattern

```typescript
// Pattern: Track + Try + Cleanup

async function safeFilesystemOp(targetPath: string) {
  let createdPath: string | undefined;

  try {
    // 1. Validate input
    const normalizedTarget = validatePath(targetPath);

    // 2. Check preconditions (without race condition)
    const normalized = normalizeRepoPath(normalizedTarget);
    const existing = database.getAllWorkspaces().find(
      w => normalizeRepoPath(w.repo_root) === normalized
    );
    if (existing) {
      throw new Error('DUPLICATE');
    }

    // 3. Create resource and track path
    createdPath = await createDirectory(normalizedTarget);

    // 4. Save to database (most likely to fail)
    await database.save({ path: createdPath });

    return { success: true, path: createdPath };

  } catch (error) {
    // 5. Cleanup on any error
    if (createdPath) {
      try {
        await fs.promises.rm(createdPath, { recursive: true, force: true });
      } catch (cleanupError) {
        console.error(`Failed cleanup of ${createdPath}:`, cleanupError);
        // Don't throw - preserve original error
      }
    }

    // 6. Return error info (not internals)
    return {
      success: false,
      error: 'Operation failed',
      _originalError: error, // For logging only
    };
  }
}
```

### 4.3 Rate-Limited Callback Pattern

Use for any callback fired 10+ times/sec:

```typescript
// In Rust (NAPI):
let last_emit = Arc::new(Mutex::new(Instant::now()));
let last_value = Arc::new(Mutex::new(0u32));

let last_emit_clone = Arc::clone(&last_emit);
let last_value_clone = Arc::clone(&last_value);

callbacks.transfer_progress(move |progress| {
    let percent = calculate_percent(progress);

    // Rate limit: 100ms OR percent changed
    let should_emit = {
        let last = last_emit_clone.lock().unwrap();
        let last_val = last_value_clone.lock().unwrap();
        last.elapsed() >= Duration::from_millis(100) || percent > *last_val
    };

    if should_emit {
        // Update tracking
        {
            let mut last = last_emit_clone.lock().unwrap();
            let mut last_val = last_value_clone.lock().unwrap();
            *last = Instant::now();
            *last_val = percent;
        }

        // Emit
        let _ = tsfn.call(CloneProgress { ... }, ThreadsafeFunctionCallMode::NonBlocking);
    }

    true // Continue
});
```

### 4.4 Async/Native Interop Pattern

Always spawn blocking tasks from async functions:

```typescript
// Rust (NAPI)
#[napi]
pub async fn my_operation(params: MyParams) -> Result<MyResult> {
    // Wrap entire I/O in spawn_blocking
    tokio::task::spawn_blocking(move || {
        // All filesystem/git operations here
        // This runs on threadpool, not event loop
        let result = expensive_operation(&params)?;
        Ok(result)
    })
    .await
    .map_err(|e| Error::new(Status::GenericFailure, format!("Task error: {}", e)))?
}

// TypeScript
const result = await nativeModule.myOperation(params);
```

### 4.5 Duplicate Detection Pattern

Two-layer approach: database constraint + application logic

```typescript
// Layer 1: Database schema (enforces truthfulness)
export class ApertureDatabase {
  saveWorkspace(workspace: WorkspaceRecord): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO workspaces
      (id, repo_root, ...)
      VALUES (?, ?, ...)
    `);

    try {
      stmt.run(...);
    } catch (err: unknown) {
      const error = err as { code?: string };
      if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
        throw new Error('DUPLICATE_WORKSPACE');
      }
      throw err;
    }
  }
}

// Layer 2: Application check (catches before expensive operation)
async function createWorkspaceFromClone(remoteUrl: string) {
  // Check normalized paths before clone
  const normalizedPath = normalizeRepoPath(clonePath);
  const existing = db.getAllWorkspaces().find(
    w => normalizeRepoPath(w.repo_root) === normalizedPath
  );

  if (existing) {
    throw new Error('DUPLICATE_WORKSPACE');
  }

  // Proceed with clone...
}
```

### 4.6 Symlink Rejection Pattern

```typescript
// When traversing directories
const entries = await readdir(rootPath, { withFileTypes: true });

for (const entry of entries) {
  // MUST check isSymbolicLink() before using path
  if (entry.isSymbolicLink()) {
    continue; // Skip symlinks
  }

  if (entry.isDirectory()) {
    queue.push({ path: join(rootPath, entry.name), ... });
  }
}

// NOT this:
for (const entry of entries) {
  if (entry.name.startsWith('.')) continue;
  // WRONG: doesn't check symlinks!
  queue.push({ path: join(rootPath, entry.name), ... });
}
```

---

## 5. Integration Checklist for Teams

When onboarding developers to this codebase:

- [ ] Share this document
- [ ] Review the 11 resolved issues and their fixes
- [ ] Walk through one PR using the Security-Focused Review Checklist
- [ ] Establish code review process to flag Red Flags (Section 2.2)
- [ ] Set up pre-commit hook to run security tests
- [ ] For native addon changes: require async/blocking review
- [ ] For filesystem changes: require symlink + cleanup testing
- [ ] For API changes: require SSRF + error message validation

### Monitoring & Continuous Improvement

- Monthly: Review issue tracker for new security patterns
- Per quarter: Add one new test to `test/security/` for each common mistake
- Per release: Run full security test suite + manual path traversal attempts
- On incident: Add specific test case before fix, update this guide

---

## 6. Related Documents

- **Native Addon Development Guide** (`docs/native-addon-development.md`)
- **API Security Guidelines** (`docs/api-security.md`)
- **Database Schema Documentation** (`docs/database-schema.md`)
- **Incident Reports** (linked issues with detailed analysis)

---

## Appendix A: Issue Mapping

| Issue # | Category | Root Cause | Prevention |
|---------|----------|-----------|-----------|
| 1 | Concurrency | Sync clone function blocking event loop | Pattern 4.4: Async/native interop + spawn_blocking |
| 2 | Network | No URL validation | Pattern 4.1: Validation pipeline + validateGitUrl |
| 3 | Filesystem | Concurrent path checks without TOCTOU protection | Pattern 4.5: DB constraints + normalized comparison |
| 4 | Error Handling | Resources not tracked for cleanup | Pattern 4.2: Safe filesystem operation tracking |
| 5 | Performance | Unbounded callback rates | Pattern 4.3: Rate-limited callbacks (100ms + change) |
| 6 | Filesystem | Symlinks followed during traversal | Pattern 4.6: isSymbolicLink() rejection |
| 7 | Performance | Selecting all workspaces to find one | Index on repo_root + query optimization |
| 8 | Concurrency | Duplicate check race vs. insert race | Pattern 4.5: Two-layer (DB + app logic) |
| 9 | API | Error messages leak internal details | Sanitize error responses before sending |
| 10 | API | Inconsistent HTTP status codes | Use standard codes: 201 (created), 400 (validation), 409 (conflict), 500 (server) |
| 11 | Filesystem | Path comparison fails on Windows | Pattern 4.5: normalizeRepoPath() with toLowerCase |

---

**Last Updated:** 2026-01-08
**Maintainer:** Security Team
**Review Cadence:** Quarterly
