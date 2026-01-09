# Security Quick Reference Card

A one-page cheat sheet for daily development and code reviews.

---

## The 11 Issues & Prevention

| Issue | Pattern | Code Example | Test |
|-------|---------|--------------|------|
| **1. Blocking async** | spawn_blocking + async | `tokio::task::spawn_blocking(\|\| { ... }).await` | Promise.all() test |
| **2. SSRF** | validateGitUrl + whitelist | `validateGitUrl(url)` blocks 10.*.*, 127.*, 192.168.* | Test private IPs |
| **3. TOCTOU race** | DB unique constraint | `UNIQUE(repo_root)` in schema | Concurrent inserts |
| **4. Error cleanup** | Track path, try-catch cleanup | `let path; try { path = create() } finally { rm(path) }` | Force fail at each stage |
| **5. Unbounded callbacks** | Rate limit 100ms + change | `if (elapsed > 100ms \|\| value > last) { emit() }` | Count emissions |
| **6. Symlink attacks** | Reject symlinks | `!entry.isSymbolicLink()` in readdir loop | Test symlink traversal |
| **7. N+1 queries** | Combine queries + index | Move loop queries outside loop | EXPLAIN QUERY PLAN |
| **8. Duplicate race** | normalizeRepoPath() + DB | `normalizeRepoPath()` used in both check + save | Concurrent duplicates |
| **9. Info disclosure** | Sanitize errors | No `${error.message}` in responses | Search error responses |
| **10. Inconsistent API** | Standard status codes | 201 create, 400 validation, 409 conflict | Check all endpoints |
| **11. Path comparison** | normalizeRepoPath() | `resolve().toLowerCase()` on Windows | Test case + trailing slash |

---

## Validation Checklist (Before Commit)

```
[ ] Async? spawn_blocking() used
[ ] URLs? validateGitUrl() checked
[ ] Paths? validatePath() + validatePathExists() called
[ ] Directories traversed? !isSymbolicLink() check
[ ] Resources created? Path tracked before operation
[ ] Error on failure? Cleanup happens
[ ] Callback fired? Rate-limited to 100ms + change
[ ] Duplicate possible? DB UNIQUE constraint exists
[ ] Query in loop? Combined into single query
[ ] Error messages? No paths/credentials/traces shown
[ ] Status codes? 201/400/404/409/500 correct
```

---

## Red Flags (Stop Review)

```
❌ execSync()                           → Use async
❌ fs.readFileSync() in routes          → Use async
❌ Path comparison with ===             → Use normalizeRepoPath()
❌ Callback without throttle            → Add 100ms rate limit
❌ Check-then-act without transaction   → Use DB constraint
❌ Error with full path/credentials     → Sanitize output
❌ No symlink check in readdir()        → Add filter
❌ Clone without cleanup tracking       → Track path
❌ SELECT in loop                       → Combine queries
❌ INSERT without UNIQUE catch          → Handle constraint error
```

---

## Code Patterns (Copy-Paste Ready)

### 1. URL Validation
```typescript
function validateGitUrl(url: string): { valid: boolean; error?: string } {
  const httpsPattern = /^https:\/\/[^\/]+\/.+$/;
  const sshPattern = /^git@[^:]+:.+$/;

  if (!httpsPattern.test(url) && !sshPattern.test(url)) {
    return { valid: false, error: 'Only HTTPS and SSH allowed' };
  }

  if (url.startsWith('https://')) {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname.toLowerCase();

    if (/^(localhost|127\.|10\.|172\.(1[6-9]|2[0-9]|3[01])\.|192\.168\.|169\.254\.|0\.)/.test(hostname)) {
      return { valid: false, error: 'Internal network URLs not allowed' };
    }
  }

  return { valid: true };
}
```

### 2. Path Normalization
```typescript
function normalizeRepoPath(p: string): string {
  return resolve(normalize(p))
    .replace(/[\\/]+$/, '')     // Remove trailing slashes
    .toLowerCase();              // Case-insensitive for Windows
}

// Use in duplicate check AND save:
const normalized = normalizeRepoPath(clonedPath);
const duplicate = database.getAllWorkspaces()
  .find(w => normalizeRepoPath(w.repo_root) === normalized);
```

### 3. Safe Filesystem Operation
```typescript
let createdPath: string | undefined;

try {
  // Validate
  const normalized = validatePath(targetPath);

  // Check duplicates (normalized)
  const duplicate = database.getAllWorkspaces()
    .find(w => normalizeRepoPath(w.repo_root) === normalizeRepoPath(normalized));
  if (duplicate) throw new Error('DUPLICATE');

  // Create & track
  createdPath = await createDirectory(normalized);

  // Save (most likely to fail)
  database.save({ path: createdPath });

} catch (error) {
  // Cleanup on ANY error
  if (createdPath) {
    try {
      await rm(createdPath, { recursive: true, force: true });
    } catch (cleanupError) {
      console.error('Cleanup failed:', cleanupError);
    }
  }
  throw error;
}
```

### 4. Rate-Limited Callback
```rust
let last_emit = Arc::new(Mutex::new(Instant::now()));
let last_percent = Arc::new(Mutex::new(0u32));

callbacks.transfer_progress(move |progress| {
    let percent = ((progress.received_objects() as f64
      / progress.total_objects() as f64) * 100.0) as u32;

    let should_emit = {
        let last = last_emit.lock().unwrap();
        let last_pct = last_percent.lock().unwrap();
        last.elapsed() >= Duration::from_millis(100) || percent > *last_pct
    };

    if should_emit {
        let mut last = last_emit.lock().unwrap();
        let mut last_pct = last_percent.lock().unwrap();
        *last = Instant::now();
        *last_pct = percent;

        let _ = tsfn.call(
            CloneProgress { percent, ... },
            ThreadsafeFunctionCallMode::NonBlocking,
        );
    }
    true
});
```

### 5. Async Native Addon
```rust
#[napi]
pub async fn my_operation(params: MyParams) -> Result<MyResult> {
    tokio::task::spawn_blocking(move || {
        // All I/O here
        expensive_operation(&params)
    })
    .await
    .map_err(|e| Error::new(Status::GenericFailure, format!("Task error: {}", e)))?
}
```

### 6. Symlink-Safe Traversal
```typescript
const entries = await readdir(rootPath, { withFileTypes: true });

for (const entry of entries) {
  // MUST check isSymbolicLink() first
  if (!entry.isDirectory() || entry.isSymbolicLink()) {
    continue;
  }

  queue.push({ path: join(rootPath, entry.name), depth: depth + 1 });
}
```

### 7. Database Constraint
```sql
CREATE TABLE workspaces (
  id TEXT PRIMARY KEY,
  repo_root TEXT NOT NULL UNIQUE,
  ...
);
```

### 8. Error Handling
```typescript
try {
  database.saveWorkspace(workspace);
} catch (err: unknown) {
  const error = err as { code?: string };

  // Handle specific error
  if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
    return reply.status(409).send({
      error: 'DUPLICATE_WORKSPACE',
      message: 'A workspace already exists for this repository',
    });
  }

  throw err;
}
```

### 9. Sanitized Error Response
```typescript
// ❌ DON'T:
return reply.status(400).send({ error: error.message });

// ✅ DO:
return reply.status(400).send({
  error: 'OPERATION_FAILED',
  message: 'Failed to complete operation',
});
// Log the real error separately:
console.error('[Operation] Detailed error:', error);
```

### 10. Standard HTTP Status Codes
```typescript
200   // GET success
201   // POST create success
204   // DELETE success
400   // Validation error (client fault)
401   // Authentication required
404   // Not found
409   // Conflict (duplicate, constraint violation)
500   // Server error (not client fault)
```

---

## Testing Patterns (Quick)

### URL Validation Test
```typescript
it('rejects SSRF attempts', () => {
  const urls = [
    'https://localhost/repo.git',
    'https://127.0.0.1/repo.git',
    'https://10.0.0.1/repo.git',
    'https://192.168.1.1/repo.git',
  ];
  for (const url of urls) {
    expect(validateGitUrl(url).valid).toBe(false);
  }
});
```

### Duplicate Detection Test
```typescript
it('prevents concurrent duplicates', async () => {
  const promises = Array(5).fill(0).map(i =>
    request(app).post('/v1/workspaces').send({
      name: `ws-${i}`,
      repoRoot: '/same/path',
    })
  );

  const results = await Promise.all(promises);
  expect(results.filter(r => r.status === 201)).toHaveLength(1);
  expect(results.filter(r => r.status === 409)).toHaveLength(4);
});
```

### Cleanup Test
```typescript
it('cleans up on failure', async () => {
  const rmSpy = jest.spyOn(fs.promises, 'rm');

  try {
    await cloneRepository({ remoteUrl: 'invalid', targetDirectory });
  } catch { }

  expect(rmSpy).toHaveBeenCalledWith(expect.any(String), {
    recursive: true, force: true
  });
});
```

### Symlink Test
```typescript
it('skips symlinks', async () => {
  const realRepo = path.join(tmpDir, 'real-repo');
  fs.mkdirSync(path.join(realRepo, '.git'));
  fs.symlinkSync('..', path.join(tmpDir, 'link'));

  const result = await discoverRepositories(tmpDir);
  expect(result.repos.every(r => !r.path.includes('link'))).toBe(true);
});
```

---

## PR Checklist (2 minutes)

Before committing, ask yourself:

1. **Does my code do I/O?** → Is it async?
2. **Does my code accept user input?** → Is it validated?
3. **Does my code create files?** → Are they cleaned up on error?
4. **Does my code traverse directories?** → Does it reject symlinks?
5. **Does my code emit callbacks?** → Are they rate-limited?
6. **Does my code insert to database?** → Is the constraint unique?
7. **Does my code return errors?** → Are they sanitized?

If all yes, you're good to commit!

---

## Common Mistakes (Real Examples from Aperture)

### ❌ Before (Blocking)
```typescript
// Blocks event loop for entire clone operation
const resultPath = nativeModule.cloneRepository(url, path, callback);
```

### ✅ After (Async)
```typescript
// spawn_blocking offloads to threadpool
pub async fn clone_repository(...) {
    tokio::task::spawn_blocking(move || { ... }).await?
}
```

---

### ❌ Before (No SSRF check)
```typescript
// Any URL accepted, could access internal services
const clone = await cloneRepository({ remoteUrl, ... });
```

### ✅ After (Validation)
```typescript
const validation = validateGitUrl(remoteUrl);
if (!validation.valid) {
  return reply.status(400).send({ error: 'INVALID_GIT_URL', message: validation.error });
}
```

---

### ❌ Before (TOCTOU Race)
```typescript
// Check happens, then file could be created by another request
if (!existsSync(targetPath)) {
  const clonedPath = await cloneRepository(...);
}
```

### ✅ After (Database Constraint)
```typescript
// Database constraint prevents duplicate even in race window
// Schema: UNIQUE(repo_root)
try {
  database.saveWorkspace(workspace);
} catch (err) {
  if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
    return reply.status(409).send({ error: 'DUPLICATE_WORKSPACE' });
  }
}
```

---

### ❌ Before (Unbounded Callbacks)
```rust
// Every progress update sends callback to JS - could be 1000s/sec
callbacks.transfer_progress(move |progress| {
    let _ = tsfn.call(progress, ...);
    true
});
```

### ✅ After (Rate Limited)
```rust
// Only emit every 100ms OR if percentage changed
let should_emit = {
    let last = last_emit.lock().unwrap();
    let last_pct = last_percent.lock().unwrap();
    last.elapsed() >= Duration::from_millis(100) || percent > *last_pct
};

if should_emit {
    // Update timestamp & percentage, then emit
}
```

---

### ❌ Before (Symlink Following)
```typescript
// Symlinks followed - could escape directory
const entries = await readdir(currentPath, { withFileTypes: true });
for (const entry of entries) {
  if (!entry.name.startsWith('.')) {
    queue.push({ path: join(currentPath, entry.name), ... });
  }
}
```

### ✅ After (Symlink Rejection)
```typescript
for (const entry of entries) {
  if (!entry.isDirectory() || entry.isSymbolicLink()) {
    continue; // Skip symlinks
  }
  queue.push({ path: join(currentPath, entry.name), ... });
}
```

---

## When to Ask for Help

- **Unsure if something is blocking?** → Ask in #async-native-addon channel
- **Unsure about path safety?** → Check with security team
- **Hit a race condition?** → Review TOCTOU pattern section 4.5
- **New kind of input to validate?** → Follow validation pipeline section 4.1
- **Need to add cleanup logic?** → Copy pattern from section 4.2

---

## Resources

- **Full Guide:** `SECURITY_PREVENTION_GUIDE.md`
- **Code Review:** `CODE_REVIEW_TEMPLATE.md`
- **Testing:** `TESTING_PATTERNS.md`
- **Related Issues:** `INCIDENT_ANALYSIS.md` (if exists)

---

**Updated:** 2026-01-08
**Print this card and post near your desk!**
