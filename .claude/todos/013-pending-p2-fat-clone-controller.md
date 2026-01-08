---
status: pending
priority: p2
issue_id: "013"
tags: [code-review, architecture, srp]
dependencies: []
---

# Fat controller in clone endpoint

## Problem Statement

The POST `/v1/workspaces/clone` handler is 110 lines and performs too many responsibilities: URL validation, path validation, git clone, duplicate checking, name extraction, workspace creation, and response formatting.

## Findings

**Source:** DHH Rails Reviewer, Architecture Strategist

1. Handler spans lines 90-200 in workspaces.ts
2. Violates Single Responsibility Principle
3. Duplicates logic from POST /v1/workspaces
4. Difficult to test and maintain

## Proposed Solutions

### Option 1: Extract service functions (Recommended)
```typescript
// src/services/workspaceService.ts
export async function createWorkspaceFromClone(options: {
  remoteUrl: string;
  targetDirectory: string;
  name?: string;
  database: ApertureDatabase;
}): Promise<WorkspaceRecord> {
  // All clone + create logic here
}

// Route becomes:
fastify.post('/v1/workspaces/clone', async (request, reply) => {
  try {
    const workspace = await createWorkspaceFromClone({...});
    return reply.status(201).send({ workspace });
  } catch (error) {
    // Error handling
  }
});
```

**Effort:** Medium (3-4 hours)

## Acceptance Criteria

- [ ] Clone endpoint under 30 lines
- [ ] Reusable service function
- [ ] Service function is unit testable
