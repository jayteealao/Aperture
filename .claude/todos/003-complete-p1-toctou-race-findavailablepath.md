---
status: pending
priority: p1
issue_id: "003"
tags: [code-review, race-condition, security, toctou]
dependencies: []
---

# TOCTOU race condition in findAvailablePath

## Problem Statement

The `findAvailablePath` function checks if a path exists using `existsSync`, then returns that path for use. Between the check and the actual clone operation, another process or concurrent request could create that directory, causing a collision and unclear errors.

**Why it matters:** Race conditions can cause data corruption, unclear errors, and potential security issues if an attacker can predict the path.

## Findings

**Source:** Kieran Rails Reviewer, Data Integrity Guardian

1. Time-of-check to time-of-use (TOCTOU) vulnerability in path selection
2. No locking mechanism between check and use
3. Concurrent clone requests to same repo could collide
4. Native clone will fail with unclear error if directory exists

**Evidence:**
```typescript
// src/discovery/repoCloner.ts:37-45
function findAvailablePath(dir: string, baseName: string): string {
  let counter = 1;
  let candidate = join(dir, `${baseName}-${counter}`);
  while (existsSync(candidate)) {  // CHECK
    counter++;
    candidate = join(dir, `${baseName}-${counter}`);
  }
  return candidate;  // USE happens later in clone
}
```

**Attack scenario:**
1. Request A calls findAvailablePath, gets `/repos/myrepo-1`
2. Request B calls findAvailablePath, gets `/repos/myrepo-1` (same!)
3. Request A starts cloning to `/repos/myrepo-1`
4. Request B tries to clone to `/repos/myrepo-1` - COLLISION

## Proposed Solutions

### Option 1: Use UUID suffix instead of counter (Recommended)
**Pros:** Eliminates race entirely, simple implementation
**Cons:** Less predictable directory names
**Effort:** Small (1 hour)
**Risk:** Low

```typescript
import { randomUUID } from 'crypto';

function generateUniquePath(dir: string, baseName: string): string {
  const suffix = randomUUID().slice(0, 8);
  return join(dir, `${baseName}-${suffix}`);
}
```

### Option 2: Atomic directory creation with retry
**Pros:** Keeps sequential naming
**Cons:** More complex, still potential for many retries
**Effort:** Medium (2-3 hours)
**Risk:** Low

```typescript
async function findAvailablePathAtomic(dir: string, baseName: string): Promise<string> {
  for (let counter = 1; counter < 100; counter++) {
    const candidate = join(dir, counter === 1 ? baseName : `${baseName}-${counter}`);
    try {
      await mkdir(candidate, { recursive: false });
      return candidate;
    } catch (err) {
      if (err.code !== 'EEXIST') throw err;
      // Directory exists, try next
    }
  }
  throw new Error('Could not find available path after 100 attempts');
}
```

### Option 3: Server-side mutex by remoteUrl
**Pros:** Serializes concurrent requests for same repo
**Cons:** Requires in-memory lock management, doesn't help multi-instance
**Effort:** Medium (3-4 hours)
**Risk:** Medium

## Recommended Action

<!-- Filled during triage -->

## Technical Details

**Affected files:**
- src/discovery/repoCloner.ts:37-45

**Components:** Clone logic

## Acceptance Criteria

- [ ] Concurrent clone requests to same URL don't collide
- [ ] No TOCTOU race in path selection
- [ ] Clear error if path cannot be allocated
- [ ] Unit test for concurrent path generation

## Work Log

| Date | Action | Learnings |
|------|--------|-----------|
| 2026-01-08 | Created from code review | Identified by Kieran + Data Integrity agents |

## Resources

- TOCTOU: https://en.wikipedia.org/wiki/Time-of-check_to_time-of-use
