---
status: pending
priority: p2
issue_id: "010"
tags: [code-review, security, info-disclosure]
dependencies: []
---

# Error messages expose internal paths and system information

## Problem Statement

Multiple error handlers include raw error messages and file paths in API responses. This information disclosure helps attackers map the filesystem structure and identify vulnerable components.

## Findings

**Source:** Security Sentinel

1. validatePath() returns input path in errors (pathValidation.ts:11,20)
2. Discovery scan returns path in errors (discovery.ts:38)
3. Clone errors expose full error strings (workspaces.ts:146-148)
4. Workspace creation exposes error details (workspaces.ts:49,81-82)

## Proposed Solutions

### Option 1: Generic error messages to clients (Recommended)
```typescript
// Log detailed error internally
console.error('[Clone] Failed:', error, { remoteUrl, targetDirectory });

// Return generic message to client
return reply.status(500).send({
  error: 'CLONE_FAILED',
  message: 'Failed to clone repository. Please verify the URL is accessible.',
  // NO details field exposing internal info
});
```

**Effort:** Small (2-3 hours)

## Acceptance Criteria

- [ ] No file paths in error responses
- [ ] No stack traces in error responses
- [ ] Detailed errors logged server-side
- [ ] Error codes instead of raw messages
