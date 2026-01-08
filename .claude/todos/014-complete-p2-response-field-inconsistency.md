---
status: pending
priority: p2
issue_id: "014"
tags: [code-review, api, consistency]
dependencies: []
---

# Clone endpoint returns different field name than create endpoint

## Problem Statement

POST `/v1/workspaces` returns `repoRoot` but POST `/v1/workspaces/clone` returns `repoPath`. This inconsistency breaks frontend type expectations.

## Findings

**Source:** Kieran Rails Reviewer, DHH Rails Reviewer

1. Create endpoint: `repoRoot` (workspaces.ts:66-74)
2. Clone endpoint: `repoPath` (workspaces.ts:183-191)
3. Frontend expects `repoRoot` in WorkspaceRecord type

## Proposed Solutions

### Option 1: Standardize on repoRoot (Recommended)
```typescript
// workspaces.ts:183-191
return reply.status(201).send({
  workspace: {
    id: workspace.id,
    name: workspace.name,
    repoRoot: workspace.repo_root,  // Changed from repoPath
    // ...
  },
});
```

**Effort:** Small (30 minutes)

## Acceptance Criteria

- [ ] Both endpoints return `repoRoot`
- [ ] Frontend types match API response
- [ ] No breaking changes for existing clients
