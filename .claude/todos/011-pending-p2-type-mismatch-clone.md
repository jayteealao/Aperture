---
status: pending
priority: p2
issue_id: "011"
tags: [code-review, types, architecture]
dependencies: ["001"]
---

# Type mismatch in cloneRepository between native declaration and usage

## Problem Statement

The native addon `index.d.ts` declares `cloneRepository` as synchronous returning `string`, but `worktreeManager.ts` expects it as async returning `Promise<string>`. This inconsistency could cause runtime issues.

## Findings

**Source:** Architecture Strategist

1. index.d.ts:60 declares sync: `cloneRepository(...): string`
2. worktreeManager.ts:21 expects async: `Promise<string>`
3. Actual Rust impl (lib.rs:167) is synchronous
4. Related to issue #001 - clone blocks event loop

## Proposed Solutions

This is automatically resolved when fixing issue #001 (make clone async).

After making clone async in Rust:
1. Update index.d.ts to return `Promise<string>`
2. Ensure all callers await the result

**Effort:** Included in #001

## Acceptance Criteria

- [ ] Type declarations match implementation
- [ ] No type errors in TypeScript compilation
- [ ] All callers properly await async clone
