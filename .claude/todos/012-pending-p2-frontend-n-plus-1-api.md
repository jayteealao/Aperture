---
status: pending
priority: p2
issue_id: "012"
tags: [code-review, performance, n+1, frontend]
dependencies: []
---

# N+1 API calls when loading workspace data

## Problem Statement

The frontend fetches all workspaces, then makes 2 additional API calls per workspace (agents and worktrees). With 10 workspaces, this results in 21 HTTP requests. This is repeated every 5 seconds on auto-refresh.

## Findings

**Source:** Performance Oracle, Code Simplicity Reviewer

1. loadWorkspaces fetches list (Workspaces.tsx:46-68)
2. Then Promise.all for agents + worktrees per workspace
3. 5-second polling interval (line 86-88)
4. 10 workspaces = 21 requests every 5 seconds

## Proposed Solutions

### Option 1: Batch API endpoint (Recommended)
Add backend endpoint:
```typescript
GET /v1/workspaces?include=agents,worktrees

// Returns:
{
  workspaces: [{
    id, name, repoRoot,
    agents: [...],
    worktrees: [...]
  }]
}
```

**Effort:** Medium (3-4 hours)

### Option 2: Lazy load on expand
Only fetch agents/worktrees when user expands a workspace card.

**Effort:** Small (2 hours)

## Acceptance Criteria

- [ ] Single API call loads all workspace data
- [ ] OR data loaded lazily on user interaction
- [ ] Polling interval increased to 30s or WebSocket used
