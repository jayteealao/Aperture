---
command: /review:testing
session_slug: working-tree
date: 2026-03-17
scope: worktree
target: git diff (unstaged working tree changes)
paths: all
related:
  session: ../README.md
---

# Testing Review Report

**Reviewed:** worktree / git diff (unstaged working tree changes)
**Date:** 2026-03-17
**Reviewer:** Claude Code

---

## 0) Scope, Test Strategy, and Context

**What was reviewed:**
- Scope: worktree (unstaged changes)
- Target: git diff against HEAD
- Files changed: 10 source files, 1 test file
- Lines changed: approx +73 source (additions), -130 source (removals); -33 test lines (removals only)

**Test strategy:**
- Test levels: unit (Zustand store tests, pure logic)
- Test framework: Vitest (jsdom environment)
- Coverage target: not explicitly configured
- CI environment: not confirmed; pnpm test scripts present

**Changed behavior:**
1. `client.ts` - Added `encodeURIComponent()` to all session/credential/workspace ID path segments
2. `connection-slice.ts` - Ghost-connection guard in `updateConnection`; simplified `setStreaming` (removed `streamMessageId` param); null-check in `incrementUnread`; removed `defaultConnectionState` fallback
3. `jsonrpc-message-handler.ts` - Added `session/error` handler that sets connection error state; removed `isActive` pre-computation; snapshot `activeSessionId` before writes in `agent_message_chunk`
4. `pi-message-handler.ts` - `console.error` gated behind `DEV`
5. `pi-slice.ts` - Deleted `piStreamingState` slice field
6. `sdk-slice.ts` - Deleted `sdkStreamingState` slice field and `SdkStreamingState` interface
7. `pi-types.ts` - Deleted content-block types and `PiStreamingState` type
8. `types.ts` - Deleted `currentStreamMessageId` from `ConnectionState`
9. `session-slice.ts` - `console.log/warn` gated behind `DEV`
10. `WorkspaceUseChat.tsx` - `onError` now emits `toast.error`; comment cleanup

**Acceptance criteria:** Not available (no session spec file found)

---

## 1) Executive Summary

**Merge Recommendation:** APPROVE_WITH_COMMENTS

**Rationale:**
The diff is primarily safe cleanup: deleting dead streaming-state slices, adding URL encoding, hardening a ghost-connection race condition, and improving error visibility in the UI. The test file removes fixtures matching the deleted state, which is correct housekeeping. However, no new tests were added for any of the new behaviors.

**Test Coverage:** Insufficient - all store tests fail to load due to a pre-existing infrastructure issue, and no new tests cover the new behaviors.

**Critical Gaps:**
1. **TS-1**: `updateConnection` ghost-connection guard has no test verifying a delayed WS callback after `removeSession` is silently dropped
2. **TS-2**: `session/error` JSON-RPC handler has no test for setting `status: error` and resetting `isStreaming`
3. **TS-3**: `encodeURIComponent` on session IDs in `client.ts` has no test for IDs containing `/`, `?`, `#`

**Overall Assessment:**
- Coverage: Insufficient (new behaviors added, zero new tests)
- Test Quality: Good (existing tests are behavior-focused, well-structured)
- Flakiness Risk: Low (no timers introduced, no randomness)
- Determinism: Good (Zustand store reset between tests)

---

## 2) Coverage Analysis

### Changed Behavior Coverage

| Behavior | File:Line | Tested? | Test Level | Coverage |
|----------|-----------|---------|------------|----------|
| `encodeURIComponent` on all ID segments | `client.ts:111-209` | No | - | No tests |
| Ghost-connection guard in `updateConnection` | `connection-slice.ts:42-59` | No | - | No tests |
| Simplified `setStreaming` (no `streamMessageId`) | `connection-slice.ts:62-64` | Partial | Unit | Invoked via `removeSession` test but module fails to load |
| Null-check in `incrementUnread` | `connection-slice.ts:70-76` | No | - | No tests |
| `session/error` sets error state + resets streaming | `jsonrpc-message-handler.ts:39-48` | No | - | No tests |
| `activeSessionId` snapshot before writes | `jsonrpc-message-handler.ts:117-129` | No | - | No tests |
| `toast.error` on chat error | `WorkspaceUseChat.tsx:117-119` | No | - | No tests (UI component) |
| Deleted `piStreamingState` / `sdkStreamingState` slices | `pi-slice.ts`, `sdk-slice.ts` | Cleaned up | Unit | Test fixtures correctly removed |
| Deleted `currentStreamMessageId` from `ConnectionState` | `types.ts:339` | Cleaned up | - | Type-level only |

**Coverage Summary:**
- Fully tested: 2 behaviors (deletions)
- Partially tested: 1 behavior (module fails to load)
- Not tested: 7 behaviors

### Test Level Distribution

| Level | Tests (relevant to this diff) | Appropriate? |
|-------|-------------------------------|--------------|
| Unit | 2 tests in `sessions.test.ts` (currently failing to load) | Right level |
| Integration | 0 | N/A |
| E2E | 0 | N/A |

---

## 3) Findings Table

| ID | Severity | Confidence | Category | File:Line | Issue |
|----|----------|------------|----------|-----------|-------|
| TS-1 | HIGH | High | Coverage Gap | `connection-slice.ts:42-59` | Ghost-connection guard untested |
| TS-2 | HIGH | High | Coverage Gap | `jsonrpc-message-handler.ts:39-48` | `session/error` handler untested |
| TS-3 | MED | High | Coverage Gap | `client.ts:111-209` | `encodeURIComponent` on IDs untested |
| TS-4 | MED | High | Infrastructure (pre-existing) | `sessions.test.ts` | Module fails to load (`@/utils/constants`) |
| TS-5 | MED | High | Coverage Gap | `connection-slice.ts:70-76` | `incrementUnread` null-check untested |
| TS-6 | LOW | Med | Coverage Gap | `jsonrpc-message-handler.ts:117-129` | `activeSessionId` snapshot timing untested |
| TS-7 | NIT | High | Test Cleanup | `sessions.test.ts:155-198` | Streaming-state assertions correctly removed |

**Findings Summary:**
- BLOCKER: 0
- HIGH: 2
- MED: 3
- LOW: 1
- NIT: 1

**Category Breakdown:**
- Coverage gaps: 5
- Infrastructure (pre-existing): 1
- Test cleanup (positive): 1

---

## 4) Findings (Detailed)

### TS-1: Ghost-Connection Guard Untested [HIGH]

**Location:** `web/src/stores/sessions/connection-slice.ts:42-59`

**Untested Behavior:**
```typescript
updateConnection: (sessionId, updates) => {
  set((state) => {
    // Guard: do not recreate a connection entry for a session that has been removed.
    // Delayed WS callbacks can fire after removeSession -> cleanupConnection.
    if (!state.connections[sessionId]) return state  // NOT TESTED
    return {
      connections: {
        ...state.connections,
        [sessionId]: { ...state.connections[sessionId], ...updates, lastActivity: Date.now() },
      },
    }
  })
},
```

**What's missing:**
1. Call `removeSession(sessionId)` to clean up connection state
2. Then call `updateConnection(sessionId, { status: 'connected' })` (simulating a delayed WS callback)
3. Assert `connections[sessionId]` remains `undefined` — ghost not resurrected

**Why it matters:**
This guards a real race condition where delayed WS callbacks resurrect phantom connection entries after a session is removed, causing phantom UI state (streaming spinners, unread badges on removed sessions).

**Scenarios not tested:**
1. `updateConnection` called after `cleanupConnection` on a removed session
2. `updateConnection` called on a session that was never added

**Severity:** HIGH | **Confidence:** High | **Category:** Coverage Gap (correctness)

**Suggested Test:**
```typescript
it('updateConnection is a no-op after session is removed', async () => {
  const sessionId = 'ghost-session'
  useSessionsStore.setState((state) => ({
    ...state,
    sessions: [makeSession(sessionId, 'claude_sdk')],
    connections: {
      [sessionId]: {
        status: 'connected',
        error: null,
        retryCount: 0,
        isStreaming: false,
        hasUnread: false,
        unreadCount: 0,
        lastActivity: Date.now(),
      },
    },
  }))

  // Act: remove session, then simulate a delayed WS callback
  await useSessionsStore.getState().removeSession(sessionId)
  useSessionsStore.getState().updateConnection(sessionId, { status: 'connected' })

  // Assert: ghost connection was not resurrected
  expect(useSessionsStore.getState().connections[sessionId]).toBeUndefined()
})
```

**Test level:** Unit (pure Zustand store, no I/O)

---

### TS-2: `session/error` JSON-RPC Handler Untested [HIGH]

**Location:** `web/src/stores/sessions/jsonrpc-message-handler.ts:39-48`

**Untested Behavior (new code):**
```typescript
} else if (msg.method === 'session/error') {
  const params = msg.params as { message?: string } | undefined
  if (import.meta.env.DEV) {
    console.error('[WS] Session error:', params?.message)
  }
  get().setStreaming(sessionId, false)          // NOT TESTED
  get().updateConnection(sessionId, {           // NOT TESTED
    status: 'error',
    error: params?.message ?? 'Session error',
  })
}
```

**What's missing:**
- No test that `session/error` message transitions connection to `status: 'error'`
- No test that `session/error` resets `isStreaming: false`
- No test for default error message (`'Session error'`) when `params.message` is undefined
- No test for custom error message from `params.message`

**Why it matters:**
This is new error-path behavior. If broken, session crashes will not surface to the user (no error state in UI, no streaming spinner reset). This is a user-visible state change.

**Severity:** HIGH | **Confidence:** High | **Category:** Coverage Gap (error path)

**Suggested Test:**
```typescript
it('session/error sets connection status to error and stops streaming', () => {
  useSessionsStore.setState((state) => ({
    ...state,
    connections: {
      'sdk-1': {
        status: 'connected',
        error: null,
        retryCount: 0,
        isStreaming: true,
        hasUnread: false,
        unreadCount: 0,
        lastActivity: Date.now(),
      },
    },
  }))

  handleJsonRpcMessage(
    'sdk-1',
    { method: 'session/error', params: { message: 'Process exited with code 1' } },
    useSessionsStore.getState,
    useSessionsStore.setState,
  )

  const conn = useSessionsStore.getState().connections['sdk-1']
  expect(conn?.status).toBe('error')
  expect(conn?.error).toBe('Process exited with code 1')
  expect(conn?.isStreaming).toBe(false)
})

it('session/error uses default message when params.message is undefined', () => {
  // ... similar setup
  handleJsonRpcMessage('sdk-1', { method: 'session/error', params: {} }, get, set)
  expect(useSessionsStore.getState().connections['sdk-1']?.error).toBe('Session error')
})
```

**Test level:** Unit (pure function with mocked store)

---

### TS-3: `encodeURIComponent` Not Tested for Special Characters [MED]

**Location:** `web/src/api/client.ts:111-209`

**Untested Behavior:**
```typescript
// Applied to ALL IDs across 10 methods:
async getSession(sessionId: string): Promise<SessionStatus> {
  return this.request(`/v1/sessions/${encodeURIComponent(sessionId)}`)
}
// ... repeated for deleteSession, getSessionMessages, sendRpc, connectSession,
//     getWebSocketUrl, deleteCredential, getWorkspace, deleteWorkspace,
//     listWorkspaceCheckouts, deleteWorkspaceCheckout
```

**What's missing:**
No tests verify:
1. An ID with `/` (e.g., `"feature/login"`) encodes to `"feature%2Flogin"` and not a path component
2. An ID with `?` doesn't corrupt the query string
3. The WebSocket URL token encoding still works alongside session ID encoding

**Why it matters:**
Session IDs may include git branch names or other path-like characters. Without encoding, `"feature/login"` produces `/v1/sessions/feature/login` — routing to an incorrect endpoint. The fix is correct; a test documents the expectation and prevents regression.

**Severity:** MED | **Confidence:** High | **Category:** Coverage Gap (boundary value)

**Suggested Test:**
```typescript
describe('ApertureClient URL encoding', () => {
  it('encodes session ID containing forward slashes', () => {
    const client = new ApertureClient('http://localhost', 'token')
    const wsUrl = client.getWebSocketUrl('feature/login')
    expect(wsUrl).toContain('/v1/sessions/feature%2Flogin/ws')
    expect(wsUrl).not.toContain('/v1/sessions/feature/login/ws')
  })

  it('encodes session ID with query-unsafe characters', () => {
    const client = new ApertureClient('http://localhost', 'token')
    const wsUrl = client.getWebSocketUrl('session?foo=bar')
    expect(wsUrl).toContain('session%3Ffoo%3Dbar')
  })
})
```

**Test level:** Unit (pure URL construction, no I/O)

---

### TS-4: Store Tests Fail to Load - Pre-existing Infrastructure Issue [MED]

**Location:** `web/src/stores/sessions.test.ts:1`

**Error (confirmed pre-existing - present before applying this diff):**
```
Error: Failed to load url @/utils/constants (resolved id: @/utils/constants)
in .../web/src/stores/sessions/session-slice.ts. Does the file exist?
```

**Cause:** Root-level Vitest doesn't have the `web/` path alias (`@` maps to `./src`) configured. The alias is defined in `web/vite.config.ts` but not applied when the root Vitest process imports web source files.

**Impact:** The 2 tests updated by this diff - `removeSession clears Pi state` and `clearAll clears both SDK and Pi session state` - cannot run and cannot verify the streaming-state cleanup behavior.

**Resolution (not caused by this diff):** Add `@` alias to root-level Vitest config, or run web tests via `pnpm --filter web test`.

**Severity:** MED (pre-existing, blocks store test execution)

---

### TS-5: `incrementUnread` Null Guard Untested [MED]

**Location:** `web/src/stores/sessions/connection-slice.ts:70-76`

**Untested Behavior:**
```typescript
incrementUnread: (sessionId) => {
  const { activeSessionId, connections } = get()
  if (sessionId === activeSessionId) return

  const conn = connections[sessionId]
  if (!conn) return  // NEW GUARD - NOT TESTED

  get().updateConnection(sessionId, {
    hasUnread: true,
    unreadCount: conn.unreadCount + 1,
  })
},
```

**Previously:** would call `updateConnection` with a `defaultConnectionState()` fallback, potentially creating a ghost entry.
**Now:** is a no-op when no connection exists.

**Severity:** MED | **Confidence:** High | **Category:** Coverage Gap (edge case)

**Suggested Test:**
```typescript
it('incrementUnread is a no-op when session has no connection entry', () => {
  useSessionsStore.setState((state) => ({
    ...state,
    sessions: [makeSession('no-conn', 'claude_sdk')],
    activeSessionId: 'other-session',
    // no connections entry for 'no-conn'
  }))

  expect(() => useSessionsStore.getState().incrementUnread('no-conn')).not.toThrow()
  expect(useSessionsStore.getState().connections['no-conn']).toBeUndefined()
})
```

**Test level:** Unit

---

### TS-6: `activeSessionId` Snapshot Timing in `agent_message_chunk` [LOW]

**Location:** `web/src/stores/sessions/jsonrpc-message-handler.ts:117-129`

**Concern:**
```typescript
if (updateType === 'agent_message_chunk') {
  // Comment says: Snapshot activeSessionId before any writes so the unread
  // check is not affected by any subscriber that might change activeSessionId
  // in response to setStreaming (e.g. an auto-focus side-effect).
  const { activeSessionId } = get()   // snapshot here
  if (!get().connections[sessionId]?.isStreaming) {
    get().setStreaming(sessionId, true)  // write happens here
  }
  if (sessionId !== activeSessionId) {
    get().incrementUnread(sessionId)  // uses pre-write snapshot
  }
}
```

**What's missing:** No test verifies the snapshot is taken before `setStreaming`, ensuring a side-effect auto-focus subscriber can't cause a missed unread increment. This is a subtle ordering contract.

**Severity:** LOW | **Confidence:** Med (no subscriber currently auto-changes `activeSessionId`, so risk is low today)

---

## 5) Coverage Gaps Summary

### Critical Gaps (HIGH+)

1. **Ghost-connection guard** (TS-1) - `removeSession` + delayed `updateConnection` path untested
2. **`session/error` handler** (TS-2) - New RPC handler sets error state; zero tests

### Important Gaps (MED)

3. **`encodeURIComponent` on IDs** (TS-3) - Special-character IDs not covered
4. **Test infrastructure failure** (TS-4) - Store tests can't load (pre-existing)
5. **`incrementUnread` null guard** (TS-5) - No-op behavior unverified

### Edge Cases (LOW)

6. **`activeSessionId` snapshot** (TS-6) - Timing concern, low risk today

---

## 6) Test Quality Issues

### Flakiness (Risk: Low)

No flakiness introduced. The diff removes streaming-state machinery; no timers or async races were added.

### Brittleness (Risk: Low)

Existing tests assert on Zustand store state values (not internal method calls). This is correct behavior-level testing. Test fixture cleanup correctly mirrors the slice deletions.

### Determinism (Status: Good)

- `beforeEach` resets Zustand store to `initialState` via `setState(initialState, true)`
- Each test uses unique session IDs
- Async tests use `await`

---

## 7) Pre-existing Test Failures (Not Caused by This Diff)

The following failures were confirmed present before applying this diff (verified via `git stash`):

| Test File | Failing Tests | Root Cause |
|-----------|---------------|------------|
| `src/__tests__/database.test.ts` | 13/13 | `better-sqlite3` NODE_MODULE_VERSION mismatch (137 vs 127) - needs `npm rebuild` |
| `tests/workspace-api.test.ts` | 10/10 | Same `ERR_DLOPEN_FAILED` |
| `tests/workspace-api-errors.test.ts` | all | Same `ERR_DLOPEN_FAILED` |
| `web/src/api/chat-transport.test.ts` | 17/22 | `vi.mock('@/api/websocket')` doesn't intercept `import './websocket'` - different module IDs in Vitest |
| `web/src/stores/sessions.test.ts` | all (0 run) | `@/utils/constants` alias missing from root Vitest context |
| `web/src/components/chat/ApertureMessage.test.ts` | all (0 run) | `@/utils/cn` alias missing from root Vitest context |
| `.claude/skills/dev-browser/snapshot.test.ts` | all (0 run) | `playwright` not installed |

Total: 7 failing test files, 40 failing tests - **all pre-existing**.

---

## 8) Positive Observations

- **Test fixture cleanup is precise:** `piStreamingState` and `sdkStreamingState` test fixtures removed exactly where slice fields were deleted. No orphaned assertions.
- **No new flakiness:** No timers, no randomness, no async races introduced.
- **Behavior-focused existing tests:** Store tests assert on output state, not internal call counts.
- **Inline documentation:** Ghost-connection guard has an explanatory comment that guides test authorship.

---

## 9) Recommendations

### Must Fix (HIGH)

1. **TS-1** - Add ghost-connection guard test to `sessions.test.ts`
   - Action: Add suggested test case
   - Rationale: Guards a real race condition; prevents silent regression
   - Estimated effort: 10 minutes

2. **TS-2** - Add `session/error` handler tests
   - Action: Add unit tests for `handleJsonRpcMessage` with `session/error` method
   - Rationale: New error-path behavior; user-visible state change
   - Estimated effort: 15 minutes

### Should Fix (MED)

3. **TS-3** - Add `client.ts` URL encoding unit tests
   - Action: Add tests for IDs with `/`, `?`, `#` characters
   - Estimated effort: 10 minutes

4. **TS-4** - Fix root Vitest config to resolve `@` alias for web tests
   - Action: Add alias to root vitest config or run web tests separately
   - Estimated effort: 5-15 minutes

5. **TS-5** - Add `incrementUnread` null-guard edge-case test
   - Action: Add suggested test
   - Estimated effort: 5 minutes

### Consider (LOW/NIT)

6. **TS-6** - Test or document `activeSessionId` snapshot ordering
   - Estimated effort: 10 minutes

**Total effort for HIGH+MED fixes:** ~55 minutes

---

## 10) Coverage Metrics

Coverage tooling not run (not configured in vitest config).

Estimated from code inspection:
- Changed lines covered by existing tests: ~5%
- Changed lines with new untested behavior: ~95%

**Uncovered key paths:**
- `connection-slice.ts:48` - ghost guard early return
- `jsonrpc-message-handler.ts:44-48` - `session/error` state update
- `client.ts:111,119,130,135,148,166,174,187-209` - all `encodeURIComponent` usages

---

*Review completed: 2026-03-17*
*Session: [working-tree](../README.md)*
