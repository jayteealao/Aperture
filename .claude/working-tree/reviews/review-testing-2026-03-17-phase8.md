---
command: /review:testing
session_slug: working-tree
date: 2026-03-17
scope: worktree
target: HEAD (Phase 8 — cleanup, flag removal, HUD aesthetic polish)
paths: all changed files
related:
  session: ../README.md
---

# Testing Review Report

**Reviewed:** worktree / HEAD (uncommitted working tree diff vs Phase 8 commit)
**Date:** 2026-03-17
**Reviewer:** Claude Code

---

## 0) Scope, Test Strategy, and Context

**What was reviewed:**
- Scope: worktree (git diff HEAD)
- Target: HEAD
- Files changed: 60 source files, 1 tracked test file modified (sessions.test.ts), 1 new untracked test file (client.test.ts)
- Lines changed: +680 -1148 (source), +166 -45 (sessions.test.ts), +46/-0 (new client.test.ts — untracked)

**Test strategy:**
- Test levels: unit/store (Zustand state via Vitest), pure function (URL building)
- Test framework: Vitest 4.1.0
- Coverage target: not formally tracked
- CI environment: not confirmed (no CI config changed in this diff)

**Test suite run result:** 11 files, 121 tests — ALL PASSED (4.37s)

**Changed behavior (logic/behavioral surface):**

1. `updateConnection()` — new guard: no-op if connection entry absent (ghost session protection)
2. `setStreaming()` — removed `streamMessageId` parameter; no longer writes `currentStreamMessageId`
3. `incrementUnread()` — new guard: early-return if `connections[sessionId]` is undefined
4. `handleJsonRpcMessage()` — added `typeof data !== 'object' || data === null` early-return guard
5. `handleJsonRpcMessage()` — `session/error` now calls `setStreaming(false)` + writes `{ status: 'error', error }` (previously only logged)
6. `handleJsonRpcMessage()` — `activeSessionId` snapshot moved per-branch (race-fix for `handleSessionUpdate`)
7. `ApertureClient` — 11 URL parameters now wrapped in `encodeURIComponent()` (path injection fix)
8. `SdkStreamingState` type and `sdkStreamingState` slice state removed
9. `PiStreamingState` type, `PiContentBlock` types, and `piStreamingState` slice state removed
10. `currentStreamMessageId` field removed from `ConnectionState`
11. `console.*` calls in production paths guarded by `import.meta.env.DEV`

**Acceptance criteria (inferred from Phase 8 scope):**
- Ghost-session resurrection via delayed WS callbacks must be prevented
- `session/error` must surface connection error state (not just log)
- URL path components must be encoded to prevent injection
- Dead streaming-state types/slices must be removed without breaking existing tests

---

## 1) Executive Summary

**Merge Recommendation:** APPROVE_WITH_COMMENTS

**Rationale:**
The five most critical behavioral changes (ghost-session `updateConnection` guard, `session/error` handler, null-frame guard, URL encoding, streaming state removal) are all covered by tests that pass cleanly. The remaining untested surface is the `incrementUnread` null-guard refactor and several `session/update` sub-types (`agent_message_chunk`, `prompt_complete`, `config_changed`, `session/request_permission`) that were changed but have never had tests. These are medium-risk gaps — not blockers — because the store is fully reset in `beforeEach` and the core mutation patterns are exercised by adjacent tests.

**Test Coverage:** ~67% of changed behaviors (8/12 behavioral changes have direct tests; 1 partially covered; 3 untested)

**Critical Gaps:**
1. **TS-1**: `incrementUnread` null-guard — new early-return for missing connection has no direct test
2. **TS-2**: `session/request_permission` handler — streaming cleared, permission added, unread conditional; no test
3. **TS-3**: `handleSessionUpdate` branches — `agent_message_chunk`, `prompt_complete`, `config_changed` all untested

**Overall Assessment:**
- Coverage: Acceptable (critical new behaviors tested, secondary flows not)
- Test Quality: Good (behavior-oriented assertions, Arrange-Act-Assert structure)
- Flakiness Risk: Low
- Determinism: Good (full state reset in `beforeEach`, isolated session IDs per test)

---

## 2) Coverage Analysis

### Changed Behavior Coverage

| Behavior | File:Line | Tested? | Test Level | Coverage |
|----------|-----------|---------|------------|----------|
| `updateConnection` ghost guard | `connection-slice.ts:48` | Yes | Unit/Store | Happy + ghost path |
| `setStreaming` no-op after remove | `connection-slice.ts:62-64` | Yes | Unit/Store | Verified no resurrection |
| `incrementUnread` null guard | `connection-slice.ts:70-71` | No | — | No test |
| `session/error` full error state | `jsonrpc-message-handler.ts:40-49` | Yes | Unit/Store | Happy + missing-params |
| `session/exit` streaming clear | `jsonrpc-message-handler.ts:37-39` | Yes | Unit/Store | Happy path |
| Null/non-object frame guard | `jsonrpc-message-handler.ts:23` | Yes | Unit/Store | null, string, number |
| `session/request_permission` | `jsonrpc-message-handler.ts:29-36` | No | — | No test |
| `handleSessionUpdate` branches | `jsonrpc-message-handler.ts:123-140` | No | — | No test |
| `encodeURIComponent` on all IDs | `client.ts:108-211` | Partial | Unit | WS URL only; REST paths not |
| `sdkStreamingState` removed | `sdk-slice.ts` | Yes | Unit/Store | clearAll assertion updated |
| `piStreamingState` removed | `pi-slice.ts` | Yes | Unit/Store | clearAll assertion updated |
| `currentStreamMessageId` removed | `types.ts` | Yes | Unit/Store | Type compiles; no runtime assertion needed |

**Coverage Summary:**
- Fully tested: 8 behaviors
- Partially tested: 1 behavior (`encodeURIComponent` on REST methods — only WS URL tested)
- Not tested: 3 behaviors

### Test Level Distribution

| Level | Tests | Notes |
|-------|-------|-------|
| Unit/Store (Zustand state) | ~114 | Fast, isolated, appropriate level |
| Pure function (URL logic) | 7 (new) | Appropriate unit level |
| Integration/E2E | 0 | No integration tests in scope |

---

## 3) Findings Table

| ID | Severity | Confidence | Category | File:Line | Issue |
|----|----------|------------|----------|-----------|-------|
| TS-1 | MED | High | Coverage Gap | `connection-slice.ts:70-71` | `incrementUnread` null-guard not directly tested |
| TS-2 | MED | High | Coverage Gap | `jsonrpc-message-handler.ts:29-36` | `session/request_permission` handler not tested |
| TS-3 | MED | Med | Coverage Gap | `jsonrpc-message-handler.ts:123-140` | `handleSessionUpdate` sub-types not tested |
| TS-4 | LOW | High | Coverage Gap | `client.ts:110-211` | REST path encoding: 10 methods not covered (only WS URL tested) |
| TS-5 | LOW | Med | Brittleness | `sessions.test.ts:71` | `makeConnection` uses `Date.now()` in default fixture; benign now but non-deterministic if asserted |
| TS-6 | NIT | High | Process | `web/src/api/client.test.ts` | New test file is untracked (`??`) — must be `git add`-ed before merge |

**Findings Summary:**
- BLOCKER: 0
- HIGH: 0
- MED: 3
- LOW: 2
- NIT: 1

**Category Breakdown:**
- Coverage gaps: 4
- Brittleness risk: 1
- Process (untracked file): 1

---

## 4) Findings (Detailed)

### TS-1: `incrementUnread` null-guard not tested [MED]

**Location:** `web/src/stores/sessions/connection-slice.ts:70-71`

**Changed code (new behavior):**
```typescript
const conn = connections[sessionId]
if (!conn) return   // NEW: early-return instead of fallback to defaultConnectionState()
```

**What was removed:**
```typescript
// OLD — could create a ghost entry via defaultConnectionState() fallback
const conn = connections[sessionId] || defaultConnectionState()
```

**Why it matters:**
The old code could resurrect a ghost connection via `incrementUnread` — symmetric to the `updateConnection` ghost guard that IS tested. Without a test, a regression to the old pattern would go undetected.

**Scenarios not tested:**
1. Call `incrementUnread(sessionId)` after `cleanupConnection(sessionId)` — connection must not be resurrected
2. Call `incrementUnread` on a session never added to connections — must be a no-op

**Severity:** MED | **Confidence:** High | **Category:** Coverage Gap

**Suggested Test:**
```typescript
it('incrementUnread is a no-op after cleanupConnection removes the entry', () => {
  const sessionId = 'ghost-3'
  useSessionsStore.setState((state) => ({
    ...state,
    sessions: [makeSession(sessionId, 'claude_sdk')],
    connections: { [sessionId]: makeConnection({ hasUnread: false, unreadCount: 0 }) },
    activeSessionId: 'other-session',
  }))

  useSessionsStore.getState().cleanupConnection(sessionId)
  expect(useSessionsStore.getState().connections[sessionId]).toBeUndefined()

  useSessionsStore.getState().incrementUnread(sessionId)

  // Must not be resurrected
  expect(useSessionsStore.getState().connections[sessionId]).toBeUndefined()
})
```

**Test level:** Unit/Store

---

### TS-2: `session/request_permission` handler not tested [MED]

**Location:** `web/src/stores/sessions/jsonrpc-message-handler.ts:29-36`

**Current code:**
```typescript
} else if (msg.method === 'session/request_permission') {
  const params = msg.params as { toolCallId: string; toolCall: unknown; options: unknown[] }
  const { activeSessionId } = get()
  get().setStreaming(sessionId, false)
  get().addPendingPermission(sessionId, { toolCallId: params.toolCallId, toolCall: params.toolCall, options: params.options })
  if (sessionId !== activeSessionId) {
    get().incrementUnread(sessionId)
  }
}
```

**What changed:** The pre-computed `isActive` flag was replaced by reading `activeSessionId` inline here as part of the race-fix.

**Scenarios not tested:**
1. Handler clears `isStreaming` and adds to `pendingPermissions`
2. Inactive session: `unreadCount` incremented
3. Active session: `unreadCount` NOT incremented

**Why it matters:**
Three coordinated state mutations. Any regression in the `if (sessionId !== activeSessionId)` condition would silently add unread badges to the active session, degrading UX.

**Severity:** MED | **Confidence:** High | **Category:** Coverage Gap

**Suggested Tests:**
```typescript
it('session/request_permission clears streaming, adds permission, increments unread for inactive session', () => {
  const activeId = 'active-1'
  const inactiveId = 'inactive-1'
  useSessionsStore.setState((state) => ({
    ...state,
    sessions: [makeSession(activeId, 'claude_sdk'), makeSession(inactiveId, 'claude_sdk')],
    activeSessionId: activeId,
    connections: {
      [activeId]: makeConnection(),
      [inactiveId]: makeConnection({ isStreaming: true }),
    },
  }))

  handleJsonRpcMessage(
    inactiveId,
    {
      jsonrpc: '2.0',
      method: 'session/request_permission',
      params: { toolCallId: 'tool-1', toolCall: { name: 'Bash' }, options: ['allow', 'deny'] },
    },
    storeGet,
    storeSet,
  )

  const state = useSessionsStore.getState()
  expect(state.connections[inactiveId]?.isStreaming).toBe(false)
  expect(state.pendingPermissions[`${inactiveId}:tool-1`]).toBeDefined()
  expect(state.connections[inactiveId]?.unreadCount).toBe(1)
  expect(state.connections[activeId]?.unreadCount).toBe(0)
})

it('session/request_permission does not increment unread for active session', () => {
  const activeId = 'active-2'
  useSessionsStore.setState((state) => ({
    ...state,
    sessions: [makeSession(activeId, 'claude_sdk')],
    activeSessionId: activeId,
    connections: { [activeId]: makeConnection({ isStreaming: true }) },
  }))

  handleJsonRpcMessage(
    activeId,
    {
      jsonrpc: '2.0',
      method: 'session/request_permission',
      params: { toolCallId: 'tool-2', toolCall: {}, options: [] },
    },
    storeGet,
    storeSet,
  )

  expect(useSessionsStore.getState().connections[activeId]?.unreadCount).toBe(0)
})
```

**Test level:** Unit/Store

---

### TS-3: `handleSessionUpdate` sub-type branches not tested [MED]

**Location:** `web/src/stores/sessions/jsonrpc-message-handler.ts:123-140`

**Untested branches:**
```typescript
if (updateType === 'agent_message_chunk') {
  if (!get().connections[sessionId]?.isStreaming) {
    get().setStreaming(sessionId, true)
  }
  if (sessionId !== activeSessionId) {
    get().incrementUnread(sessionId)
  }
} else if (updateType === 'prompt_complete' || updateType === 'prompt_error') {
  get().setStreaming(sessionId, false)
} else if (updateType === 'config_changed') {
  // mutates sdkConfig
}
```

**What changed here:** `isActive` pre-computation was replaced with `const { activeSessionId } = get()` snapshotted at function entry — a correctness fix for the race described in the code comment. None of these branches have ever had tests.

**Why it matters:**
`agent_message_chunk` is the primary streaming-on path for legacy JSON-RPC sessions; `prompt_complete` is the streaming-off path. These are high-frequency production paths. The race-fix is correct but the only verification is that TypeScript compiles.

**Severity:** MED | **Confidence:** Med (may be covered by higher-level browser tests not in this diff) | **Category:** Coverage Gap

**Suggested Tests:**
```typescript
it('session/update agent_message_chunk starts streaming for inactive session and increments unread', () => {
  const activeId = 'active-3'
  const inactiveId = 'inactive-3'
  useSessionsStore.setState((state) => ({
    ...state,
    sessions: [makeSession(activeId, 'claude_sdk'), makeSession(inactiveId, 'claude_sdk')],
    activeSessionId: activeId,
    connections: {
      [activeId]: makeConnection(),
      [inactiveId]: makeConnection({ isStreaming: false }),
    },
  }))

  handleJsonRpcMessage(
    inactiveId,
    { jsonrpc: '2.0', method: 'session/update', params: { update: { sessionUpdate: 'agent_message_chunk' } } },
    storeGet,
    storeSet,
  )

  expect(useSessionsStore.getState().connections[inactiveId]?.isStreaming).toBe(true)
  expect(useSessionsStore.getState().connections[inactiveId]?.unreadCount).toBe(1)
})

it('session/update prompt_complete stops streaming', () => {
  const sessionId = 'stream-end-1'
  useSessionsStore.setState((state) => ({
    ...state,
    sessions: [makeSession(sessionId, 'claude_sdk')],
    activeSessionId: sessionId,
    connections: { [sessionId]: makeConnection({ isStreaming: true }) },
  }))

  handleJsonRpcMessage(
    sessionId,
    { jsonrpc: '2.0', method: 'session/update', params: { update: { sessionUpdate: 'prompt_complete' } } },
    storeGet,
    storeSet,
  )

  expect(useSessionsStore.getState().connections[sessionId]?.isStreaming).toBe(false)
})
```

**Test level:** Unit/Store

---

### TS-4: REST path encoding not directly tested [LOW]

**Location:** `web/src/api/client.ts:110-211` (10 REST methods now use `encodeURIComponent`)

**What IS tested:** `getWebSocketUrl` via the new `client.test.ts` — slash, `?`, `#`, UUID, token encoding, http→ws scheme conversion.

**What is NOT tested:** None of the 10 REST methods (`getSession`, `deleteSession`, `getSessionMessages`, `sendRpc`, `connectSession`, `deleteCredential`, `getWorkspace`, `deleteWorkspace`, `listWorkspaceCheckouts`, `deleteWorkspaceCheckout`) have tests verifying the URL they build.

**Why LOW (not MED):**
The implementation is a mechanical, uniform application of `encodeURIComponent(id)`. All instances follow identical pattern. The `getWebSocketUrl` test validates the encoding mechanism works. The risk of a missed instance exists but is low given the uniformity.

**Severity:** LOW | **Confidence:** High | **Category:** Coverage Gap

**Suggested approach:**
```typescript
it('getSession encodes session ID in path', async () => {
  const fetchSpy = vi.fn().mockResolvedValue(new Response('{}'))
  vi.stubGlobal('fetch', fetchSpy)

  await api.getSession('feature/login').catch(() => {})

  expect(fetchSpy).toHaveBeenCalledWith(
    expect.stringContaining('feature%2Flogin'),
    expect.any(Object),
  )
  vi.unstubAllGlobals()
})
```

---

### TS-5: `makeConnection` uses `Date.now()` in factory [LOW]

**Location:** `web/src/stores/sessions.test.ts:71`

```typescript
function makeConnection(overrides: Partial<ConnectionState> = {}): ConnectionState {
  return {
    ...
    lastActivity: Date.now(),  // non-deterministic default
    ...overrides,
  }
}
```

**Why LOW:** No test currently asserts on `lastActivity`. `updateConnection` overwrites `lastActivity` with `Date.now()` anyway. Not a flakiness source in current tests.

**Risk:** A future test comparing `lastActivity` would be non-deterministic. Optional fix: use a fixed constant like `const FIXED_TS = 1_700_000_000_000`.

**Severity:** LOW | **Confidence:** Med | **Category:** Minor fixture brittleness

---

### TS-6: `client.test.ts` is untracked [NIT]

**Location:** `web/src/api/client.test.ts` (git status: `??`)

**Issue:** The new test file with 7 URL encoding tests is not staged. Vitest discovers it via filesystem locally (tests pass), but it is absent from version control and will not run in CI until committed.

**Action required:** `git add web/src/api/client.test.ts` before merge.

**Severity:** NIT | **Confidence:** High | **Category:** Process

---

## 5) Coverage Gaps Summary

### Medium Gaps

1. **TS-1** `incrementUnread` null-guard — call after cleanup must not resurrect entry
2. **TS-2** `session/request_permission` — streaming cleared, permission queued, unread badge conditional on active state
3. **TS-3** `handleSessionUpdate` sub-types — `agent_message_chunk` (streaming on), `prompt_complete` (streaming off), `config_changed` (config mutation)

### Low Gaps

4. **TS-4** REST path encoding — 10 methods use `encodeURIComponent` but only `getWebSocketUrl` is tested

---

## 6) Test Quality Issues

### Flakiness (Risk: Low)

No identified flakiness sources. No `setTimeout`/`sleep` patterns. No real timers in tests. `Date.now()` used in `makeConnection` factory but not asserted anywhere — benign in current tests (see TS-5).

### Brittleness (Risk: Low)

Tests assert behavioral outcomes (connection state fields, presence/absence of keys in store) not internal method calls. No over-mocking. `handleJsonRpcMessage` is tested by calling through the real Zustand store, not by checking mock call counts.

### Determinism (Status: Good)

- `beforeEach` resets entire store to `initialState` snapshot — fully isolated
- Each test uses distinct session IDs (`ghost-1`, `err-1`, `exit-1`, etc.)
- No shared mutable fixtures between tests
- No ordering assumptions

---

## 7) Test Level Assessment

### Correctly Leveled Tests

**Unit/Store tests** (sessions.test.ts, ~114 tests):
- Pure Zustand store manipulation; no network I/O
- WS manager mocked at module level — external boundary correctly mocked
- API client mocked — external boundary correctly mocked
- Fast (~70ms total per run)

**Pure unit tests** (client.test.ts, 7 tests):
- No I/O — `getWebSocketUrl` is a synchronous string builder
- Appropriately at unit level, no mocking needed

### No Incorrectly Leveled Tests Found

---

## 8) Positive Observations

- New `useSessionsStore connection` describe block: correct Arrange-Act-Assert, one behavior per test
- Test names describe observable behavior, not implementation (e.g., `'updateConnection is a no-op after cleanupConnection removes the entry'`)
- `makeConnection` factory with spread overrides is clean and reusable
- `storeGet`/`storeSet` wrappers correctly type-match handler signatures — tests will fail at TypeScript compile time if signatures change
- `console.error` properly mocked in `beforeEach` to suppress noise from `session/error` tests
- Dead type/state removal (`sdkStreamingState`, `piStreamingState`) correctly cleaned up in existing test assertions — no phantom assertions remain
- `client.test.ts` covers the security-sensitive URL encoding path with good boundary cases (slash, `?`, `#`, UUID, token with spaces)

---

## 9) Recommendations

### Must Do Before Merge (NIT → Blocking in practice)

1. **TS-6**: `git add web/src/api/client.test.ts` — untracked file will not run in CI
   - Effort: 1 command

### Should Fix Before Merge (MED)

2. **TS-2**: Add `session/request_permission` tests (streaming + permission + unread badge conditional)
   - Effort: ~15 minutes
   - Rationale: Three coordinated mutations; active-session branching worth a regression guard

3. **TS-1**: Add `incrementUnread` null-guard test
   - Effort: ~5 minutes
   - Rationale: Symmetric to `updateConnection` ghost-guard test that exists; consistency

### Consider (MED/LOW)

4. **TS-3**: Add `handleSessionUpdate` sub-type tests (`agent_message_chunk`, `prompt_complete`)
   - Effort: ~10 minutes
   - Rationale: High-frequency production paths, zero test coverage

5. **TS-4**: Add one representative REST path encoding test using `vi.stubGlobal('fetch', ...)`
   - Effort: ~10 minutes

### Long-term

6. Add `vitest --coverage` to CI so gaps become visible automatically
7. Test `handleSessionUpdate config_changed` branch when SDK config logic is exercised

---

## 10) Coverage Metrics

No formal coverage tool run. Estimate based on manual behavioral mapping:

**Behavioral coverage of changed logic:**
- Fully tested: 8 / 12 changed behaviors (~67%)
- Partially tested: 1 / 12 (REST encoding — WS URL covered)
- Not tested: 3 / 12 (`incrementUnread` guard, `session/request_permission`, `handleSessionUpdate`)

**Line coverage estimate (changed lines with behavioral significance):** ~60-65%

---

## 11) CI/Runtime Considerations

**Test runtime (observed locally):**
- Total: 4.37s (11 test files, 121 tests)
- Well under any reasonable CI budget

**Critical note:**
`web/src/api/client.test.ts` shows as `??` (untracked). Vitest discovers it locally but it will NOT run in CI until committed. This is the single most important pre-merge action.

---

## 12) False Positives & Disagreements Welcome

1. **TS-3 (handleSessionUpdate):** If browser/E2E tests exist in a separate test suite not in this diff, these branches may be covered. My confidence is Med.
2. **TS-4 (REST encoding):** The mechanical uniformity of the pattern makes a typo unlikely. If reviewers are satisfied by code review of 10 identical one-liners, LOW severity is appropriate to defer.
3. **TS-5 (Date.now in fixture):** Fully benign unless a future test asserts on `lastActivity`. Not worth changing now.

---

*Review completed: 2026-03-17*
*Scope: git diff HEAD (uncommitted working tree — Phase 8 changes)*
