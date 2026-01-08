---
status: pending
priority: p2
issue_id: "009"
tags: [code-review, security, dos, timeout]
dependencies: []
---

# Clone operation has no timeout allowing resource exhaustion

## Problem Statement

The `cloneRepository()` function has no timeout mechanism. An attacker could provide a URL to a malicious server that slowly trickles data, causing the clone to hang indefinitely and exhaust server resources.

## Findings

**Source:** Security Sentinel

1. No timeout in TypeScript wrapper (repoCloner.ts:50-87)
2. No timeout in Rust native code (lib.rs:166-227)
3. git2 clone will wait indefinitely for slow servers
4. Could be used for resource exhaustion DoS

## Proposed Solutions

### Option 1: Add request timeout
Configure timeout in the API route:
```typescript
const CLONE_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes

const controller = new AbortController();
const timeout = setTimeout(() => controller.abort(), CLONE_TIMEOUT_MS);

try {
  clonedPath = await cloneRepository({ remoteUrl, targetDirectory });
} finally {
  clearTimeout(timeout);
}
```

**Note:** Requires native addon to support cancellation signal.

**Effort:** Medium (4-6 hours)

## Acceptance Criteria

- [ ] Clone operations timeout after configurable duration
- [ ] Timeout triggers cleanup of partial clone
- [ ] Clear error message on timeout
