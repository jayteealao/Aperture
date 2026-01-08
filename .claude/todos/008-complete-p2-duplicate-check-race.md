---
status: pending
priority: p2
issue_id: "008"
tags: [code-review, race-condition, data-integrity]
dependencies: []
---

# TOCTOU race in duplicate workspace detection

## Problem Statement

The duplicate check and workspace save are not atomic. Concurrent requests could both pass the duplicate check and create duplicate workspaces for the same repository.

## Findings

**Source:** Kieran Rails Reviewer, Data Integrity Guardian

1. `getAllWorkspaces()` check at line 153-164
2. `saveWorkspace()` at line 181
3. No transaction or lock between them
4. No UNIQUE constraint on repo_root in database

## Proposed Solutions

### Option 1: Add UNIQUE constraint (Recommended)
Add migration:
```sql
CREATE UNIQUE INDEX idx_workspaces_repo_root
ON workspaces(repo_root COLLATE NOCASE);
```

Handle constraint violation in save:
```typescript
try {
  database.saveWorkspace(workspace);
} catch (err) {
  if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
    return reply.status(409).send({ error: 'DUPLICATE_WORKSPACE' });
  }
  throw err;
}
```

**Effort:** Small (2 hours)

## Acceptance Criteria

- [ ] Database has UNIQUE constraint on repo_root
- [ ] Concurrent requests for same repo don't create duplicates
- [ ] Clear error message on duplicate attempt
