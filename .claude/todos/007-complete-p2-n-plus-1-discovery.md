---
status: pending
priority: p2
issue_id: "007"
tags: [code-review, performance, n+1]
dependencies: []
---

# N+1 query pattern in repository discovery

## Problem Statement

`discoverRepositories` calls `ensureRepoReady` for every directory scanned, which opens a git repository via `Repository::open()`. With MAX_DEPTH=3 and potentially thousands of directories, this creates thousands of file handle open/close cycles.

## Findings

**Source:** Performance Oracle, Code Simplicity Reviewer

1. Each directory triggers full `ensureRepoReady` call (repoDiscovery.ts:40-45)
2. `ensureRepoReady` opens repo, reads HEAD, checks remote
3. For non-git directories, this is wasted work
4. Simple `.git` folder check would be much faster

## Proposed Solutions

### Option 1: Check .git existence first (Recommended)
```typescript
// Fast check first
const gitDir = join(currentPath, '.git');
try {
  await access(gitDir);
} catch {
  continue; // Not a git repo, skip expensive check
}
// Only then call ensureRepoReady for full validation
```

**Effort:** Small (1-2 hours)

## Acceptance Criteria

- [ ] Non-git directories don't trigger ensureRepoReady
- [ ] Discovery of 1000 directories completes in <5 seconds
- [ ] Git repos still properly validated
