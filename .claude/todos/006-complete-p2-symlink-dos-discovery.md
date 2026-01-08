---
status: pending
priority: p2
issue_id: "006"
tags: [code-review, security, dos, symlink]
dependencies: []
---

# Symlink following during directory scanning enables DoS

## Problem Statement

The `discoverRepositories()` function follows symlinks when checking directories. An attacker who controls a directory in the scan path could create symlinks to deeply nested directories, large filesystems, or circular symlink loops, bypassing the MAX_DEPTH=3 limit and causing resource exhaustion.

## Findings

**Source:** Security Sentinel

1. `entry.isDirectory()` follows symlinks (repoDiscovery.ts:58-68)
2. Circular symlinks could cause infinite loops
3. Symlinks to network mounts could cause hangs
4. MAX_DEPTH check doesn't account for symlink traversal

## Proposed Solutions

### Option 1: Skip symlinks (Recommended)
```typescript
if (entry.isDirectory() && !entry.isSymbolicLink()) {
  // Only follow real directories
}
```

**Effort:** Small (30 minutes)

## Acceptance Criteria

- [ ] Symlinks are not followed during discovery
- [ ] Circular symlink loops don't cause infinite recursion
- [ ] Network mount symlinks don't cause hangs
