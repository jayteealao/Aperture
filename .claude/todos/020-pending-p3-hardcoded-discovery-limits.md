---
status: pending
priority: p3
issue_id: "020"
tags: [code-review, config]
dependencies: []
---

# Hard-coded configuration constants in discovery

## Problem Statement

MAX_DEPTH (3), MAX_REPOS (500), and EXCLUDED_DIRS are hard-coded in repoDiscovery.ts with no way to override them.

## Findings

**Source:** DHH Rails Reviewer, Architecture Strategist

1. Constants at repoDiscovery.ts:7-8
2. No environment variable overrides
3. Users with different needs can't customize

## Proposed Solutions

Move to configuration:
```typescript
// src/config/discovery.ts
export const discoveryConfig = {
  maxDepth: parseInt(process.env.DISCOVERY_MAX_DEPTH || '3'),
  maxRepos: parseInt(process.env.DISCOVERY_MAX_REPOS || '500'),
  excludedDirs: (process.env.DISCOVERY_EXCLUDED_DIRS || 'node_modules,vendor,...').split(','),
};
```

**Effort:** Small (1 hour)

## Acceptance Criteria

- [ ] Limits configurable via env vars
- [ ] Sensible defaults preserved
- [ ] Documentation updated
