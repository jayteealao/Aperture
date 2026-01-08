---
status: pending
priority: p3
issue_id: "016"
tags: [code-review, api, rest]
dependencies: []
---

# POST /v1/discovery/scan should be GET

## Problem Statement

Using POST for a read-only operation is an API smell. Discovery doesn't create anything - it just reads the filesystem.

## Findings

**Source:** DHH Rails Reviewer

The scan endpoint doesn't modify any state, so it should be GET with query params.

## Proposed Solutions

Change to: `GET /v1/discovery/repos?path=...`

**Effort:** Small (1 hour)

## Acceptance Criteria

- [ ] Discovery uses GET method
- [ ] Path passed as query parameter
- [ ] Response cacheable
