---
status: pending
priority: p1
issue_id: "001"
tags: [code-review, performance, native-addon, blocking]
dependencies: []
---

# Clone operation blocks Node.js event loop

## Problem Statement

The `clone_repository` function in the Rust native addon is synchronous and blocks the main Node.js thread for the entire duration of clone operations. Large repositories can take minutes to clone, during which the entire application freezes - including all WebSocket connections and HTTP requests.

**Why it matters:** This is a critical production issue. A single clone operation will make the entire Aperture gateway unresponsive.

## Findings

**Source:** Kieran Rails Reviewer, Performance Oracle

1. The Rust function `clone_repository` (lib.rs:167-227) is not marked as `async` and doesn't use `tokio::task::spawn_blocking`
2. Unlike other functions in the same file (`ensure_repo_ready`, `ensure_worktree`, `list_worktrees`, `remove_worktree`), clone runs synchronously
3. The `builder.clone()` operation blocks until completion
4. ThreadsafeFunction for progress callbacks works but doesn't make the operation async

**Evidence:**
```rust
// lib.rs:167 - synchronous function signature
#[napi]
pub fn clone_repository(
    url: String,
    target_path: String,
    progress_callback: JsFunction,
) -> Result<String> {
    // ... blocking clone operation
    let repo = builder.clone(&url, Path::new(&target_path))?;
```

Compare with async pattern used elsewhere:
```rust
// lib.rs:69 - async function with spawn_blocking
#[napi(async)]
pub async fn ensure_repo_ready(params: EnsureRepoReadyParams) -> Result<EnsureRepoReadyResult> {
    let result = tokio::task::spawn_blocking(move || {
        worktree::ensure_repo_ready(&params.repo_root)
    }).await
```

## Proposed Solutions

### Option 1: Use spawn_blocking (Recommended)
**Pros:** Consistent with existing async patterns, minimal code change
**Cons:** None significant
**Effort:** Small (1-2 hours)
**Risk:** Low

Change the function to use `#[napi(async)]` and wrap in `spawn_blocking`:
```rust
#[napi(async)]
pub async fn clone_repository(
    url: String,
    target_path: String,
    progress_callback: JsFunction,
) -> Result<String> {
    let tsfn = progress_callback.create_threadsafe_function(...)?;

    let result = tokio::task::spawn_blocking(move || {
        // clone logic here
    }).await.map_err(|e| napi::Error::from_reason(e.to_string()))??;

    Ok(result)
}
```

### Option 2: Use separate thread with channel
**Pros:** More control over cancellation
**Cons:** More complex, requires channel communication
**Effort:** Medium (4-6 hours)
**Risk:** Medium

## Recommended Action

<!-- Filled during triage -->

## Technical Details

**Affected files:**
- packages/worktrunk-native/src/lib.rs:166-227

**Components:** Native Rust addon

## Acceptance Criteria

- [ ] Clone operation does not block Node.js event loop
- [ ] Other HTTP requests complete during clone
- [ ] WebSocket connections remain responsive during clone
- [ ] Progress callbacks still work correctly
- [ ] TypeScript types updated if function signature changes

## Work Log

| Date | Action | Learnings |
|------|--------|-----------|
| 2026-01-08 | Created from code review | Identified by Kieran + Performance Oracle agents |

## Resources

- PR: Current branch claude/worktrunk-native-addon-urOFu
- Similar pattern: lib.rs:69-95 (ensure_repo_ready)
