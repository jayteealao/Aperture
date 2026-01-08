---
status: pending
priority: p1
issue_id: "004"
tags: [code-review, data-integrity, orphan-data, cleanup]
dependencies: []
---

# Orphaned cloned repository on database save failure

## Problem Statement

The clone operation successfully clones a repository to disk before the database save. If `saveWorkspace()` fails (database locked, disk full, constraint violation), the cloned repository remains on disk but no workspace record exists. This creates orphaned data that cannot be managed through the API and consumes disk space indefinitely.

**Why it matters:** Disk space leaks, inability to clean up through API, potential for confusion when directory exists but workspace doesn't.

## Findings

**Source:** Data Integrity Guardian

1. Clone completes at line 124-150, database save at line 181
2. No cleanup mechanism if save fails
3. No transaction-like rollback for file system operations
4. Retry of failed request will create yet another clone (with -1, -2 suffix)

**Evidence:**
```typescript
// src/routes/workspaces.ts:124-181
let clonedPath: string;
try {
  clonedPath = await cloneRepository({  // Clone succeeds
    remoteUrl,
    targetDirectory,
  });
} catch (error) { /* ... */ }

// ... duplicate check ...

database!.saveWorkspace(workspace);  // If this fails, clonedPath is orphaned
```

## Proposed Solutions

### Option 1: Cleanup on failure (Recommended)
**Pros:** Simple, immediate fix
**Cons:** Cleanup could also fail
**Effort:** Small (1-2 hours)
**Risk:** Low

```typescript
let clonedPath: string | undefined;
try {
  clonedPath = await cloneRepository({ remoteUrl, targetDirectory });

  // ... validation and duplicate check ...

  database!.saveWorkspace(workspace);

  return reply.status(201).send({ workspace: { /* ... */ } });
} catch (error) {
  // Cleanup cloned directory on any failure
  if (clonedPath) {
    try {
      await rm(clonedPath, { recursive: true, force: true });
      console.log(`[Workspace API] Cleaned up failed clone: ${clonedPath}`);
    } catch (cleanupError) {
      console.error(`[Workspace API] Failed to cleanup: ${clonedPath}`, cleanupError);
    }
  }
  throw error;
}
```

### Option 2: Two-phase commit pattern
**Pros:** More robust, allows background cleanup
**Cons:** More complex, requires schema change
**Effort:** Medium (4-6 hours)
**Risk:** Medium

1. Create workspace record with status='pending'
2. Clone repository
3. Update workspace status to 'active'
4. Background job cleans up 'pending' workspaces older than 1 hour

## Recommended Action

<!-- Filled during triage -->

## Technical Details

**Affected files:**
- src/routes/workspaces.ts:90-201

**Components:** Workspace clone endpoint

## Acceptance Criteria

- [ ] Failed database save cleans up cloned directory
- [ ] Cleanup errors are logged but don't mask original error
- [ ] No orphaned directories after failed clone operations
- [ ] Integration test for failure + cleanup scenario

## Work Log

| Date | Action | Learnings |
|------|--------|-----------|
| 2026-01-08 | Created from code review | Identified by Data Integrity Guardian agent |

## Resources

- Node.js fs.rm: https://nodejs.org/api/fs.html#fspromisesrmpath-options
