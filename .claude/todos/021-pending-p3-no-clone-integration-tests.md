---
status: pending
priority: p3
issue_id: "021"
tags: [code-review, testing]
dependencies: []
---

# Integration tests don't cover clone functionality

## Problem Statement

workspace-api.test.ts only tests database CRUD operations. No integration tests for the clone workflow, discovery API, or error scenarios.

## Findings

**Source:** Architecture Strategist

1. tests/workspace-api.test.ts - only CRUD tests
2. No tests for /v1/workspaces/clone
3. No tests for /v1/discovery/scan
4. No tests for network failure scenarios

## Proposed Solutions

Add integration tests:
- Clone endpoint with mock git server
- Discovery endpoint with test directory structure
- Error scenarios (invalid URL, auth failure, timeout)

**Effort:** Medium (4-6 hours)

## Acceptance Criteria

- [ ] Clone endpoint has integration tests
- [ ] Discovery endpoint has integration tests
- [ ] Error scenarios covered
- [ ] Tests run in CI
