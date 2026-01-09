# Security Code Review Template

Use this template for every PR that modifies:
- Native addon code (Rust)
- Filesystem operations
- API endpoints with external input
- Database schema or access patterns
- Async/networking code

Copy and paste into PR comment, fill in as you review.

---

## PR Security Review

**PR:** #[FILL IN]
**Title:** [FILL IN]
**Reviewer:** [YOUR NAME]
**Date:** [DATE]

### 1. Scope Assessment

- [ ] This PR touches async/native code
- [ ] This PR touches filesystem operations
- [ ] This PR touches external URLs/IPs
- [ ] This PR modifies database schema
- [ ] This PR adds new API endpoints

**Areas to focus on:** [Check above and review corresponding section]

---

### 2. Input Validation

#### URLs / Network
- [ ] All git URLs pass `validateGitUrl()` check
- [ ] HTTPS only (except SSH format)
- [ ] Private IP ranges blocked (10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, 127.x, 169.254.x)
- [ ] localhost / 0.0.0.0 rejected
- [ ] Error messages don't reveal validation internals

**Findings:**

---

#### Paths / Filesystem
- [ ] All paths use `validatePath()` or `validatePathExists()`
- [ ] Paths normalized with `resolve()` + `normalize()`
- [ ] No symlinks followed (check `!entry.isSymbolicLink()`)
- [ ] Windows 8.3 short paths handled (test on Windows)
- [ ] Paths compared using `normalizeRepoPath()` pattern

**Findings:**

---

#### Other Input
- [ ] Type checking used (TypeScript or runtime)
- [ ] String lengths bounded before use
- [ ] Numbers validated within expected ranges
- [ ] Arrays bounded (MAX_REPOS = 500 pattern)

**Findings:**

---

### 3. Async & Concurrency

- [ ] All long operations use `tokio::task::spawn_blocking()` (Rust)
- [ ] No `execSync()` or blocking FS calls in hot paths
- [ ] Native addon functions marked `async` (not sync)
- [ ] Callbacks rate-limited if fired 10+ times/sec (100ms + change detection)
- [ ] Shared state protected with Arc<Mutex> (Rust)

**Test Plan:** Run with `Promise.all([req, req, req])` to verify non-blocking

**Findings:**

---

### 4. Error Handling & Cleanup

- [ ] Resources (files/dirs) tracked in variable before creation
- [ ] Try-catch wraps operations that create resources
- [ ] Cleanup happens in catch/finally, not re-throw cleanup errors
- [ ] Error messages sanitized (no full paths, credentials, or system details)
- [ ] Database exception codes distinguished (SQLITE_CONSTRAINT_UNIQUE vs other)

**Cleanup Test:** Force failure at each stage (validation → op → save) and verify cleanup

**Findings:**

---

### 5. Race Conditions & Duplicates

- [ ] Unique constraints exist at database schema level
- [ ] Path normalization identical in duplicate check AND insert
- [ ] Check-then-act operations in same transaction OR idempotent
- [ ] Directory existence checked before generating target paths
- [ ] Windows case-insensitive comparison used

**Concurrency Test:** Run 5+ concurrent creates with same input, expect 1 success + 4 conflicts

**Findings:**

---

### 6. Database Operations

- [ ] Foreign key constraints enabled
- [ ] ON DELETE CASCADE configured where needed
- [ ] Prepared statements used (no string interpolation)
- [ ] No N+1 query patterns (queries in loops)
- [ ] Large queries paginated (limit + offset)

**Query Review:** Use EXPLAIN QUERY PLAN for new SELECT queries

**Findings:**

---

### 7. API Consistency

#### Status Codes
- [ ] 200 for GET success
- [ ] 201 for POST create success
- [ ] 204 for DELETE success
- [ ] 400 for validation errors
- [ ] 401 for authentication errors
- [ ] 404 for not found
- [ ] 409 for conflicts (duplicate keys)
- [ ] 500 for server errors (not client errors)

#### Response Format
- [ ] Success responses have consistent structure
- [ ] Error responses include `error: string` and `message: string`
- [ ] No sensitive data in errors
- [ ] CamelCase used consistently in JSON

**Findings:**

---

### 8. Symlink Safety

- [ ] Directory traversal code uses `readdir(..., { withFileTypes: true })`
- [ ] Symlinks explicitly rejected: `if (!entry.isSymbolicLink()) continue;`
- [ ] No `path.join()` without previous checks
- [ ] Test includes symlink traversal attempt

**Findings:**

---

### 9. Callback Rate Limiting

If PR adds callbacks fired repeatedly:

- [ ] Rate limit strategy documented (time-based, change-based, or both)
- [ ] Default: 100ms throttle + percentage change detection
- [ ] State tracking uses Arc<Mutex> in Rust
- [ ] Should emit check prevents unbounded calls

**Test:** Simulate 1000 rapid updates, verify ~10 emissions (100ms window)

**Findings:**

---

### 10. Windows Compatibility

- [ ] Paths use `path.resolve()` + `path.normalize()`
- [ ] Path comparison uses `.toLowerCase()` on Windows
- [ ] Backslash handling: `path.join()` used instead of string concat
- [ ] File operations tested with both forward and backslashes
- [ ] 8.3 short paths normalized away

**Findings:**

---

### 11. Performance & Scalability

- [ ] No N+1 queries (check all SELECT loops)
- [ ] Large datasets paginated or limited
- [ ] Callbacks throttled to prevent resource exhaustion
- [ ] Directory traversal limited (MAX_DEPTH = 3, MAX_REPOS = 500)
- [ ] Database queries have appropriate indexes

**Measurements:**
- [ ] 100 item query test: [RESULT] queries executed (should be constant, not linear)
- [ ] Callback test: [RESULT] calls with 1000 updates (should be ~10)

**Findings:**

---

### Red Flags Found

| Flag | Severity | Comment |
|------|----------|---------|
| [IF ANY] | High/Medium/Low | [DESCRIBE] |

---

### Approval Checklist

**Security Review:**
- [ ] All validation checks passed
- [ ] No blocking async operations
- [ ] Proper error handling and cleanup
- [ ] No race condition windows
- [ ] Symlink safety verified
- [ ] Rate limiting correct (if applicable)

**Test Coverage:**
- [ ] Unit tests for validation
- [ ] Integration tests for workflows
- [ ] Security-specific tests (SSRF, cleanup, etc.)
- [ ] Concurrency tests (duplicates, race conditions)
- [ ] Windows compatibility verified

**Code Quality:**
- [ ] No TODOs/FIXMEs blocking review
- [ ] Error messages clear and safe
- [ ] Comments explain security decisions
- [ ] Consistent with existing patterns

**Decision:**
- [ ] **APPROVED** - Ready to merge
- [ ] **APPROVED WITH SUGGESTIONS** - Merge but consider improvements
- [ ] **REQUEST CHANGES** - Must address before merge
- [ ] **BLOCKED** - Critical security issue, needs redesign

---

### Suggestions for Next PR

- [ ] Add more test cases for [AREA]
- [ ] Document pattern for [AREA]
- [ ] Consider refactoring [CODE] for clarity

---

## Quick Reference: Red Flags

Stop review immediately if you see:

```
execSync() / readFileSync() in routes          → Must be async
Path comparison with ===                        → Must use normalizeRepoPath()
Callback in loop without throttling             → Add 100ms rate limit
Error with ${error.message}                     → Sanitize output
Check-then-act without transaction              → Use DB constraint
No symlink check in readdir()                   → Add isSymbolicLink() filter
Clone without cleanup tracking                  → Track path before operation
Database save without UNIQUE catch              → Handle SQLITE_CONSTRAINT
```

---

## Security Patterns Reference

### Validation Pipeline
```
Input → Type → Format → Whitelist → Normalize → Existence → Safe
```

### Safe Filesystem Operation
```
Validate → Check Duplicates (normalized) → Create (track path)
→ Save DB → On Error: Cleanup tracked path
```

### Rate-Limited Callback
```
last_emit = now
last_value = 0
On update:
  if (now - last_emit > 100ms OR value > last_value) {
    callback(value)
    last_emit = now
    last_value = value
  }
```

---

**Review Complete:** [DATE/TIME]
**Changes Requested:** Yes / No
**Approved:** Yes / No
