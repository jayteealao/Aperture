---
status: pending
priority: p3
issue_id: "018"
tags: [code-review, types]
dependencies: []
---

# CloneProgress phase type mismatch between TS and Rust

## Problem Statement

TypeScript defines CloneProgress.phase as `'counting' | 'compressing' | 'receiving' | 'resolving' | 'done'` but Rust only emits `'receiving' | 'resolving' | 'done'`. The unused phases are misleading.

## Findings

**Source:** Architecture Strategist, Code Simplicity Reviewer

1. TypeScript: discovery.ts:19 defines 5 phases
2. Rust: lib.rs:188-194 only emits 3 phases
3. 'counting' and 'compressing' never occur

## Proposed Solutions

Update TypeScript type to match Rust:
```typescript
phase: 'receiving' | 'resolving' | 'done';
```

**Effort:** Small (15 minutes)

## Acceptance Criteria

- [ ] TypeScript type matches Rust implementation
- [ ] No unused union members
