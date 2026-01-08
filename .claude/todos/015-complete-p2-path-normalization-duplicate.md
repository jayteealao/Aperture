---
status: pending
priority: p2
issue_id: "015"
tags: [code-review, data-integrity, normalization]
dependencies: []
---

# Inconsistent path normalization for duplicate detection

## Problem Statement

The duplicate check uses `toLowerCase()` comparison but doesn't normalize: trailing slashes, forward/back slashes on Windows, relative path components, or symlink resolution. This could miss duplicates or create false positives.

## Findings

**Source:** Data Integrity Guardian

1. Comparison: `w.repo_root.toLowerCase() === clonedPath.toLowerCase()`
2. Doesn't handle: `C:\repo` vs `C:\repo\` vs `C:/repo`
3. Doesn't resolve: `C:\foo\..\repo` vs `C:\repo`
4. Case sensitivity varies by platform

## Proposed Solutions

### Option 1: Normalize before comparison (Recommended)
```typescript
function normalizeRepoPath(p: string): string {
  return path.resolve(p)
    .replace(/[\\/]+$/, '')  // Remove trailing slashes
    .toLowerCase();  // Case-insensitive for cross-platform
}

const normalizedClonedPath = normalizeRepoPath(clonedPath);
const duplicateWorkspace = existingWorkspaces.find(
  (w) => normalizeRepoPath(w.repo_root) === normalizedClonedPath
);
```

**Effort:** Small (1-2 hours)

## Acceptance Criteria

- [ ] Paths normalized before comparison
- [ ] Trailing slashes don't affect comparison
- [ ] Forward/back slashes treated equivalently
- [ ] Relative paths resolved
