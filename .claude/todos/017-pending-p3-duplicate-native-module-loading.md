---
status: pending
priority: p3
issue_id: "017"
tags: [code-review, architecture, dry]
dependencies: []
---

# Duplicated native module loading logic

## Problem Statement

Both `repoCloner.ts` and `worktreeManager.ts` contain nearly identical lazy-loading logic for the native module with duplicated error messages and URL construction.

## Findings

**Source:** DHH Rails Reviewer, Architecture Strategist

1. repoCloner.ts:54-62 - lazy load with error handling
2. worktreeManager.ts:35-49 - same pattern duplicated
3. DRY violation - change one, forget the other

## Proposed Solutions

Extract to shared utility:
```typescript
// src/native/loader.ts
let cachedModule: NativeAddonModule | null = null;

export async function getNativeModule(): Promise<NativeAddonModule> {
  if (cachedModule) return cachedModule;
  // Load and cache
}
```

**Effort:** Small (1-2 hours)

## Acceptance Criteria

- [ ] Single source for native module loading
- [ ] Module cached after first load
- [ ] Consistent error messaging
