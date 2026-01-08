---
status: pending
priority: p1
issue_id: "005"
tags: [code-review, performance, native-addon, callback-storm]
dependencies: []
---

# Unbounded progress callback frequency during clone

## Problem Statement

The `clone_repository` function calls the progress callback on every single network packet received via `transfer_progress`. For large repositories, this can fire thousands of times per second, flooding the Node.js event loop and causing UI jank or even timeouts.

**Why it matters:** Clone operations for large repos will cause severe performance degradation and potential UI freezes.

## Findings

**Source:** Performance Oracle

1. Progress callback fires on every git transfer event (lib.rs:181-207)
2. No throttling or rate limiting
3. Large repos download thousands of objects
4. Each callback crosses Rust-JS boundary via ThreadsafeFunction
5. NonBlocking mode helps but doesn't throttle call rate

**Evidence:**
```rust
// packages/worktrunk-native/src/lib.rs:181-207
builder.remote_callbacks(callbacks);
callbacks.transfer_progress(|stats| {
    // Called for EVERY packet received
    let progress = CloneProgress {
        phase: "receiving".to_string(),
        current: stats.received_objects() as u32,
        total: stats.total_objects() as u32,
        percent: /* ... */,
    };
    let _ = tsfn_clone.call(progress, ThreadsafeFunctionCallMode::NonBlocking);
    true
});
```

**Impact:**
- 10,000 object repo = 10,000+ callbacks in seconds
- Each callback serializes CloneProgress struct
- JS callback may trigger React state updates
- Event loop saturation

## Proposed Solutions

### Option 1: Rate limit in Rust (Recommended)
**Pros:** Most efficient, prevents callbacks at source
**Cons:** Requires mutable state in callback
**Effort:** Small (2-3 hours)
**Risk:** Low

```rust
use std::time::{Duration, Instant};
use std::sync::Mutex;

let last_emit = Arc::new(Mutex::new(Instant::now()));
let last_percent = Arc::new(Mutex::new(0u32));

callbacks.transfer_progress(move |stats| {
    let percent = if stats.total_objects() > 0 {
        (stats.received_objects() * 100 / stats.total_objects()) as u32
    } else { 0 };

    let mut last = last_emit.lock().unwrap();
    let mut last_pct = last_percent.lock().unwrap();

    // Only emit if 100ms passed OR percent changed by 1+
    if last.elapsed() >= Duration::from_millis(100) || percent > *last_pct {
        *last = Instant::now();
        *last_pct = percent;

        let progress = CloneProgress { /* ... */ };
        let _ = tsfn_clone.call(progress, ThreadsafeFunctionCallMode::NonBlocking);
    }
    true
});
```

### Option 2: Throttle in JavaScript
**Pros:** Simpler Rust code
**Cons:** Callbacks still cross boundary, just ignored
**Effort:** Small (1-2 hours)
**Risk:** Low

## Recommended Action

<!-- Filled during triage -->

## Technical Details

**Affected files:**
- packages/worktrunk-native/src/lib.rs:181-207

**Components:** Native addon clone progress

## Acceptance Criteria

- [ ] Progress callbacks fire at most every 100ms
- [ ] OR progress callbacks fire only when percent changes
- [ ] Large repo clones don't cause event loop saturation
- [ ] UI remains responsive during clone
- [ ] Progress still updates visibly (not too slow)

## Work Log

| Date | Action | Learnings |
|------|--------|-----------|
| 2026-01-08 | Created from code review | Identified by Performance Oracle agent |

## Resources

- napi-rs ThreadsafeFunction: https://napi.rs/docs/concepts/threadsafe-function
