---
command: /review:testing
session_slug: phase-7-sdk-control-panel
date: 2026-03-17
scope: worktree
target: HEAD
paths: all changed files
related:
  session: ../README.md
---

# Testing Review Report

**Reviewed:** worktree / HEAD
**Date:** 2026-03-17
**Reviewer:** Claude Code

---

## 0) Scope, Test Strategy, and Context

**What was reviewed:**
- Scope: worktree (git diff HEAD)
- Target: HEAD
- Files changed: 57 source files, 1 test file modified (sessions.test.ts), 1 new test file (client.test.ts)
- Lines changed: +604 -919 (net deletion — this is primarily a cleanup/refactor pass with targeted behavioral additions)
- Focus areas: `TextareaField` component, `Select` replacement in Sessions.tsx, interaction regression testability in stores

**Test strategy (inferred):**
- Test framework: Vitest (jsdom environment)
- Test levels: unit (all tests are unit/store-level; no component rendering tests)
- Coverage tooling: not configured in vite.config.ts (no `coverage` block)
- CI: not observed in diff; test runs via `pnpm test`
- No React Testing Library in the test suite — UI components are untested at the rendering level

**Changed behavior:**
1. `TextareaField` (new) — replaces `Textarea` field-wrapper; adds `autoGrow`, `maxHeight`, `label`, `error`, `hint`, ARIA attributes, `field-sizing-content` CSS strategy with JS fallback
2. `Textarea` (replaced) — now a thin shadcn-style primitive with no wrapper logic
3. `Select` replaces `Dropdown` in `Sessions.tsx` — two occurrences (Agent type + Authentication mode)
4. `connection-slice.updateConnection` — ghost-session guard: no-op when `connections[sessionId]` is absent
5. `connection-slice.setStreaming` — signature narrowed (removed `streamMessageId` param), delegates to `updateConnection`
6. `connection-slice.incrementUnread` — early-return guard when connection absent
7. `jsonrpc-message-handler.handleJsonRpcMessage` — null/primitive frame guard; `session/error` now also clears streaming and sets store error state (previously only logged)
8. `handleSessionUpdate` — `activeSessionId` snapshot moved to top of function (race fix)
9. `SdkStreamingState` / `PiStreamingState` — types and store slices deleted
10. `ConnectionState.currentStreamMessageId` — field deleted from type
11. `api/client.ts` — `encodeURIComponent` applied to all path-segment IDs (session, credential, workspace)
12. Various console logs gated behind `import.meta.env.DEV`

**Acceptance criteria (inferred, no formal spec):**
- Ghost-session callbacks must not resurrect removed sessions in the store
- `session/error` JSON-RPC messages must surface an error status, not silently log
- Non-object WebSocket frames must be ignored without throwing
- URL-encoded IDs must survive path injection for IDs containing `/`, `?`, `#`
- `TextareaField` autoGrow must work for controlled and uncontrolled values
- `Select` in Sessions.tsx must fire the correct typed value on change

---

## 1) Executive Summary

**Merge Recommendation:** APPROVE_WITH_COMMENTS

**Rationale:**
The high-risk behavioral changes (ghost-session guard, `session/error` handler, malformed-frame guard) are all directly covered by new unit tests in `sessions.test.ts`. The `encodeURIComponent` fix in `client.ts` has targeted test coverage via the new `client.test.ts`. The main gap is that the new `TextareaField` component and the `Dropdown→Select` swap in `Sessions.tsx` have zero rendering or interaction tests — acceptable for a UI-only change in a codebase with no existing component test infrastructure, but should be noted.

**Test Coverage:** ~70% of changed behaviors have direct test coverage. The uncovered 30% is entirely UI/rendering (TextareaField, Select swap, Skeleton split) with no pre-existing component test bar to maintain.

**Critical Gaps:**
1. **TS-1**: `TextareaField` — autoGrow + maxHeight logic entirely untested
2. **TS-2**: `Select` replacement in Sessions.tsx — no test for agent-type/auth-mode selection interaction
3. **TS-3**: `handleSessionUpdate` activeSessionId snapshot race — the fix is logical but the specific scenario (subscriber mutates activeSessionId mid-handler) has no test

**Overall Assessment:**
- Coverage: Acceptable (store logic covered; UI gap matches codebase norm)
- Test Quality: Good (behavior-focused, deterministic, clean AAA structure)
- Flakiness Risk: Low (no timers, no sleeps, `Date.now()` in fixtures is cosmetic)
- Determinism: Good (each test resets to `initialState`, sessions use unique IDs)

---

## 2) Coverage Analysis

### Changed Behavior Coverage

| Behavior | File:Line | Tested? | Test Level | Coverage |
|----------|-----------|---------|------------|----------|
| Ghost-session guard in `updateConnection` | `connection-slice.ts:43-53` | ✅ Yes | Unit (store) | Happy + guard path |
| `setStreaming` no-op after session removed | `connection-slice.ts:55-57` | ✅ Yes | Unit (store) | Guard path |
| `incrementUnread` early-return on absent conn | `connection-slice.ts:59-63` | ⚠️ Partial | Unit (store) | Guard not directly tested |
| `session/error` clears streaming + sets status | `jsonrpc-message-handler.ts:44-49` | ✅ Yes | Unit (store) | Happy + fallback |
| `session/exit` clears streaming + sets ended | `jsonrpc-message-handler.ts:37-39` | ✅ Yes | Unit (store) | Happy path |
| Null/primitive frame guard | `jsonrpc-message-handler.ts:23` | ✅ Yes | Unit (store) | null, string, number |
| `handleSessionUpdate` activeSessionId snapshot | `jsonrpc-message-handler.ts:120` | ⚠️ Partial | Unit (store) | No concurrent-subscriber scenario |
| `encodeURIComponent` on path IDs | `client.ts:111,120,…` | ✅ Yes | Unit | slash, `?`, `#`, UUID, token |
| `getSession` encoding | `client.ts:111` | ❌ No | - | Only WS URL tested, not REST |
| `deleteSession` encoding | `client.ts:120` | ❌ No | - | Not tested |
| `getMessages` encoding | `client.ts:127` | ❌ No | - | Not tested |
| `sendRpc` encoding | `client.ts:132` | ❌ No | - | Not tested |
| `connectSession` encoding | `client.ts:148` | ❌ No | - | Not tested |
| `deleteCredential` encoding | `client.ts:165` | ❌ No | - | Not tested |
| `getWorkspace` / `deleteWorkspace` encoding | `client.ts:190,196` | ❌ No | - | Not tested |
| `TextareaField` label+error+hint rendering | `textarea-field.tsx:64-101` | ❌ No | - | No component tests |
| `TextareaField` autoGrow JS fallback | `textarea-field.tsx:51-56` | ❌ No | - | No component tests |
| `TextareaField` `field-sizing-content` CSS path | `textarea-field.tsx:76-77` | ❌ No | - | No component tests |
| `TextareaField` ref forwarding | `textarea-field.tsx:41-48` | ❌ No | - | No component tests |
| `Select` replacing `Dropdown` in Sessions.tsx | `Sessions.tsx:441-459,471-489` | ❌ No | - | No component tests |
| `SkeletonCard`/`SkeletonText` moved to new module | `skeleton-composites.tsx` | ❌ No | - | No tests (visual only) |
| `sdkStreamingState` / `piStreamingState` removal | `sdk-slice.ts`, `pi-slice.ts` | ✅ Yes | Unit (store) | Cleanup verified in clearAll |
| `currentStreamMessageId` removed from type | `types.ts:339` | ✅ Yes | Implied (no callers remain) | — |
| DEV-gated console logs | multiple | NIT | — | Not worth testing |

**Coverage Summary:**
- ✅ Fully tested: 8 behaviors
- ⚠️ Partially tested: 2 behaviors
- ❌ Not tested: 13 behaviors (11 are pure UI/visual; 2 are REST client encoding paths)

### Test Level Distribution

| Level | Tests | % of Total | Appropriate? |
|-------|-------|------------|--------------|
| Unit (Zustand store, pure TS) | ~12 new | 100% | ✅ Correct for this layer |
| Component (RTL) | 0 | 0% | ⚠️ Gap — no existing baseline either |
| E2E | 0 | 0% | N/A |

---

## 3) Findings Table

| ID | Severity | Confidence | Category | File:Line | Issue |
|----|----------|------------|----------|-----------|-------|
| TS-1 | MED | High | Coverage Gap | `textarea-field.tsx:51-56` | `autoGrow` JS height logic entirely untested |
| TS-2 | MED | High | Coverage Gap | `Sessions.tsx:441-459` | `Select` value/callback path untested; typed cast `value as AgentType` could silently break |
| TS-3 | MED | Med | Coverage Gap | `jsonrpc-message-handler.ts:120` | `activeSessionId` snapshot race fix has no regression test |
| TS-4 | MED | High | Coverage Gap | `client.ts:111-196` | REST API methods missing encoding tests (only WS URL is tested) |
| TS-5 | LOW | High | Coverage Gap | `connection-slice.ts:59-63` | `incrementUnread` guard (absent connection) not directly tested |
| TS-6 | LOW | Med | Assertion quality | `sessions.test.ts:63-73` | `makeConnection` uses `Date.now()` — `lastActivity` field is non-deterministic; never asserted but means tests would pass even if `lastActivity` was wrong |
| TS-7 | NIT | High | Test org | `sessions.test.ts:59-61` | `storeSet` wrapper is clever; should have a one-line comment explaining why the cast is needed |

**Findings Summary:**
- BLOCKER: 0
- HIGH: 0
- MED: 4
- LOW: 2
- NIT: 1

**Category Breakdown:**
- Coverage gaps: 5
- Assertion quality: 1
- Test organization: 1

---

## 4) Findings (Detailed)

### TS-1: `TextareaField` autoGrow Logic Untested [MED]

**Location:** `web/src/components/ui/textarea-field.tsx:51-60`

**Untested behavior:**
```typescript
// Lines 51-60 — NO TESTS
const adjustHeight = useCallback(() => {
  const el = internalRef.current
  if (!el || !autoGrow) return
  el.style.height = 'auto'
  el.style.height = `${Math.min(el.scrollHeight, maxHeight)}px`
}, [autoGrow, maxHeight])

useEffect(() => {
  adjustHeight()
}, [props.value, adjustHeight])
```

**What's missing:**
1. `autoGrow=true` + controlled `value` change → height grows
2. `autoGrow=true` + content exceeds `maxHeight` → capped at `maxHeight`px
3. `autoGrow=false` (default) → no style mutation
4. `field-sizing-content` CSS class applied when `autoGrow=true` (line 76)
5. `aria-invalid` set when `error` prop is present (line 81)
6. `aria-describedby` pointing to correct element IDs (line 82-84)
7. Label `htmlFor` linked to textarea `id` (lines 66, 74)

**Why it matters:**
- `TextareaField` replaces the old `Textarea` as the primary form text input. The `autoGrow` feature is complex enough (dual strategy: CSS + JS fallback) that breakage would be silent. The `aria-invalid`/`aria-describedby` wiring is critical for screen-reader users and form validation UX.

**Suggested test (RTL):**
```typescript
import { render, fireEvent, screen } from '@testing-library/react'
import { TextareaField } from '@/components/ui/textarea-field'

test('applies field-sizing-content class when autoGrow=true', () => {
  const { container } = render(<TextareaField autoGrow label="Notes" />)
  expect(container.querySelector('textarea')).toHaveClass('field-sizing-content')
})

test('does not apply field-sizing-content when autoGrow=false', () => {
  const { container } = render(<TextareaField label="Notes" />)
  expect(container.querySelector('textarea')).not.toHaveClass('field-sizing-content')
})

test('sets aria-invalid and aria-describedby when error prop provided', () => {
  render(<TextareaField id="notes" label="Notes" error="Required" />)
  const ta = screen.getByRole('textbox')
  expect(ta).toHaveAttribute('aria-invalid', 'true')
  expect(ta).toHaveAttribute('aria-describedby', 'notes-error')
  expect(screen.getByText('Required')).toHaveAttribute('id', 'notes-error')
})

test('label htmlFor matches textarea id', () => {
  render(<TextareaField id="msg" label="Message" />)
  expect(screen.getByLabelText('Message')).toBeInTheDocument()
})
```

**Test level:** Unit (RTL component test, jsdom)
**Severity:** MED | **Confidence:** High

---

### TS-2: `Select` Replacement — Typed Value Cast Untested [MED]

**Location:** `web/src/pages/Sessions.tsx:441-459, 471-489`

**Untested behavior:**
```typescript
// Lines 443-445 — NO TESTS
<Select value={agentType} onValueChange={(value) => setAgentType(value as AgentType)}>
  ...
  {agentOptions.map((opt) => (
    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
  ))}
```

**What's missing:**
1. Selecting an agent option calls `setAgentType` with the correct `AgentType` value
2. Selecting an auth mode calls `setAuthMode` with the correct `AuthMode` value
3. Initial `value` prop of the `Select` renders the correct option as selected
4. The `as AgentType` / `as AuthMode` cast — if `SelectItem` values drifted from the enum, the cast would silently pass the wrong type

**Why it matters:**
- The old `Dropdown` component had a typed `onChange: (value: string) => void` signature and the caller cast inline, same as now. However, `Dropdown` was a self-contained component whose option rendering was tested visually. The `Select` is a Radix primitive; the integration that maps option values to store updates is the testable surface.
- If `agentOptions` or `authOptions` arrays ever diverge from the `AgentType`/`AuthMode` union, this will silently corrupt state.

**Suggested test:**
```typescript
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
// With minimal mocked store context and agentOptions:
test('selecting agent type calls setAgentType with correct value', async () => {
  const onSetAgent = vi.fn()
  // render NewSessionDialog with mocked props, open it
  // open the Agent Select, click 'Pi Agent'
  // expect onSetAgent to have been called with 'pi_sdk'
})
```

**Test level:** Unit (RTL component test)
**Severity:** MED | **Confidence:** High

---

### TS-3: activeSessionId Snapshot Race — No Regression Test [MED]

**Location:** `web/src/stores/sessions/jsonrpc-message-handler.ts:116-120`

**Context:**
```typescript
// handleSessionUpdate was refactored to snapshot activeSessionId BEFORE any writes.
// The old code called get().activeSessionId inline after setStreaming() which
// could theoretically read a post-mutation value if a subscriber auto-switched sessions.
const { activeSessionId } = get()  // snapshot at top
// ...
if (sessionId !== activeSessionId) { get().incrementUnread(sessionId) }
```

**What's missing:**
A test that verifies: if `activeSessionId` changes *during* the handler execution (simulated by a subscriber side-effect), the unread-increment decision uses the pre-mutation value.

**Why it matters:**
- The comment in the code describes a real class of bug (auto-focus subscriber changing `activeSessionId` as a side-effect of `setStreaming`). The fix is correct but there is no test to prevent regression. The scenario is tricky to construct with a synchronous store but is possible using `useSessionsStore.subscribe`.

**Suggested test:**
```typescript
it('uses activeSessionId snapshot from before setStreaming, not after', () => {
  const bgSession = 'bg-1'
  const fgSession = 'fg-1'
  useSessionsStore.setState((s) => ({
    ...s,
    activeSessionId: fgSession,
    sessions: [makeSession(bgSession, 'claude_sdk'), makeSession(fgSession, 'claude_sdk')],
    connections: {
      [bgSession]: makeConnection(),
      [fgSession]: makeConnection(),
    },
  }))

  // Simulate a subscriber that switches activeSessionId when streaming starts
  const unsub = useSessionsStore.subscribe((state, prev) => {
    if (state.connections[bgSession]?.isStreaming && !prev.connections[bgSession]?.isStreaming) {
      useSessionsStore.setState({ activeSessionId: bgSession })
    }
  })

  handleJsonRpcMessage(
    bgSession,
    { jsonrpc: '2.0', method: 'session/update', params: { update: { sessionUpdate: 'agent_message_chunk' } } },
    storeGet,
    storeSet,
  )
  unsub()

  // bgSession was not active at snapshot time, so unread should have incremented
  expect(useSessionsStore.getState().connections[bgSession]?.unreadCount).toBe(1)
})
```

**Severity:** MED | **Confidence:** Med

---

### TS-4: REST Client Encoding — Only WS URL Tested [MED]

**Location:** `web/src/api/client.ts:111,120,127,132,148,165,190,196`

**What's tested:**
`client.test.ts` covers `getWebSocketUrl` thoroughly (slash, `?`, `#`, UUID, token encoding, scheme conversion).

**What's NOT tested:**
```typescript
// Lines 111, 120, 127, 132, 148 — not tested
async getSession(sessionId: string) { `/v1/sessions/${encodeURIComponent(sessionId)}` }
async deleteSession(sessionId: string) { `/v1/sessions/${encodeURIComponent(sessionId)}` }
async getMessages(sessionId, ...) { `/v1/sessions/${encodeURIComponent(sessionId)}/messages...` }
async sendRpc(sessionId) { `/v1/sessions/${encodeURIComponent(sessionId)}/rpc` }
async connectSession(sessionId) { `/v1/sessions/${encodeURIComponent(sessionId)}/connect` }
async deleteCredential(id) { `/v1/credentials/${encodeURIComponent(id)}` }
async getWorkspace(id) { `/v1/workspaces/${encodeURIComponent(id)}` }
```

**Why it matters:**
- The WS test is the most complex (scheme swap + token encoding), so the pattern is proven. But a reviewer has no test-based confidence that `getSession('feature/login')` produces the correct URL. Given this was a security fix (path injection), test coverage of every changed method is the right hygiene. These are pure functions and trivially testable.

**Suggested tests (append to `client.test.ts`):**
```typescript
describe('REST URL encoding', () => {
  it.each([
    ['getSession', (id: string) => (api as unknown as { getSession: (id: string) => Promise<unknown> }).getSession(id)],
    // ... similar for deleteSession, getMessages, etc.
  ])('%s encodes slash in ID', async (_, call) => {
    // Mock fetch to capture URL
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}'))
    await call('feature/login').catch(() => {})
    expect(fetchSpy.mock.calls[0][0]).toContain('feature%2Flogin')
    fetchSpy.mockRestore()
  })
})
```

**Severity:** MED | **Confidence:** High

---

### TS-5: `incrementUnread` Guard Not Directly Tested [LOW]

**Location:** `web/src/stores/sessions/connection-slice.ts:59-63`

**Untested path:**
```typescript
const conn = connections[sessionId]
if (!conn) return  // NEW GUARD — not tested
```

**Why it matters:**
The `updateConnection` guard (tested by TS-1 in sessions.test.ts) is one layer above this. But `incrementUnread` has its own guard that is not exercised. If the early-return is removed, tests would not catch it.

**Suggested test:**
```typescript
it('incrementUnread is a no-op when connection entry is absent', () => {
  // Do not add a connection for 'ghost-3'
  useSessionsStore.setState((s) => ({
    ...s,
    sessions: [],
    connections: {},
    activeSessionId: 'other',
  }))
  expect(() =>
    useSessionsStore.getState().incrementUnread('ghost-3')
  ).not.toThrow()
  expect(useSessionsStore.getState().connections['ghost-3']).toBeUndefined()
})
```

**Severity:** LOW | **Confidence:** High

---

### TS-6: `makeConnection` Uses `Date.now()` — Non-Deterministic Fixture [LOW]

**Location:** `web/src/stores/sessions.test.ts:63-73`

**Code:**
```typescript
function makeConnection(overrides: Partial<ConnectionState> = {}): ConnectionState {
  return {
    // ...
    lastActivity: Date.now(),  // non-deterministic
    ...overrides,
  }
}
```

**Issue:**
`lastActivity` is never asserted in any test (by design — it updates on every `updateConnection` call). The non-determinism is benign now, but if a future test needs to assert `lastActivity` it will be fragile. Also, the store's `updateConnection` always overwrites `lastActivity: Date.now()` anyway, so the fixture value is doubly irrelevant.

**Fix:**
Use a fixed timestamp in the factory: `lastActivity: 0` or `lastActivity: 1000`. This makes the fixture data-deterministic without affecting any current test outcome.

**Severity:** LOW | **Confidence:** High

---

### TS-7: `storeSet` Wrapper Lacks Explanation Comment [NIT]

**Location:** `web/src/stores/sessions.test.ts:60-61`

**Code:**
```typescript
const storeSet: Parameters<typeof handleJsonRpcMessage>[3] = (fn) =>
  useSessionsStore.setState(fn)
```

**Issue:**
The type is extracted via `Parameters<...>[3]` which is clever but opaque to a reader unfamiliar with `handleJsonRpcMessage`. A one-line comment explaining that this satisfies the `StoreSet` type expected by the handler would aid maintainability.

**Severity:** NIT | **Confidence:** High

---

## 5) Coverage Gaps Summary

### MED Gaps

1. **TS-1** — `TextareaField` autoGrow + ARIA wiring
   - Risk: silent breakage of auto-resize or screen-reader support
   - Effort: ~20 min (requires adding `@testing-library/react` if not present)

2. **TS-2** — `Select` callback path in `NewSessionDialog`
   - Risk: typed cast `value as AgentType` passes wrong values silently
   - Effort: ~15 min

3. **TS-3** — `activeSessionId` snapshot race regression
   - Risk: future refactor re-introduces the race without a failing test
   - Effort: ~15 min

4. **TS-4** — REST client URL encoding coverage
   - Risk: only WS encoding tested; REST methods lack evidence
   - Effort: ~20 min (extend existing `client.test.ts`)

### LOW Gaps

5. **TS-5** — `incrementUnread` guard
6. **TS-6** — `makeConnection` non-deterministic fixture

---

## 6) Test Quality Issues

### Flakiness (Risk: Low)

No flaky patterns found:
- No `setTimeout`/`sleep` calls
- No `Date.now()` assertions (only in fixtures)
- All Zustand operations are synchronous in the store's test surface
- `removeSession` is `async` but `await`ed correctly

### Brittleness (Risk: Low)

Tests assert behavior (store state) not implementation (method call counts). The `websocketMocks.disconnect` assertion in `removeSession` is a mild implementation-coupling concern but is appropriate — disconnect *is* the observable side-effect of removal.

### Determinism (Status: Good)

- Each test resets via `useSessionsStore.setState(initialState, true)` in `beforeEach`
- Session IDs are unique strings per test (`'ghost-1'`, `'err-1'`, `'exit-1'`, etc.)
- No shared mutable fixtures

---

## 7) Test Level Assessment

### Correctly Leveled Tests

All new tests are pure Zustand store tests. They:
- Run synchronously (except `removeSession` which is correctly awaited)
- Do not touch the DOM
- Do not import React components
- Are fast (<100ms each)

This is the right level for testing connection lifecycle, message handling, and cleanup.

### Level Gap

The gap between store-level tests and no component tests is expected given the codebase's current test infrastructure (no `@testing-library/react` usage anywhere in the test suite). Adding component tests for `TextareaField` and `NewSessionDialog` would require that dependency. This is a **known infrastructure gap**, not a regression introduced by this diff.

---

## 8) Positive Observations

- **New connection tests are behavior-focused**: `updateConnection` is a no-op after cleanup, `setStreaming` is a no-op after removal — these test observable outcomes, not method internals.
- **JSON-RPC handler tests are self-contained**: each test seeds exactly the state it needs, calls `handleJsonRpcMessage` directly, and asserts the resulting store state.
- **Removed test assertions are correct removals**: `piStreamingState` and `sdkStreamingState` assertions were deleted alongside the state they covered, keeping the test suite honest.
- **`handleJsonRpcMessage` is now directly unit-testable**: the refactored signature `(sessionId, data, get, set)` allows testing without a live WebSocket or store subscription.
- **`client.test.ts` is well-structured**: covers the most complex encoding path (WS URL with token) thoroughly with multiple scenarios.
- **AAA structure throughout**: all new tests follow Arrange-Act-Assert cleanly.

---

## 9) Recommendations

### Should Fix Before Merge (MED)

1. **TS-4**: Add `fetch` spy tests for at least `getSession` and `deleteSession` encoding in `client.test.ts`
   - Rationale: This was a security-motivated fix; REST methods should have parity with WS URL test
   - Estimated effort: 15 minutes

### Consider Post-Merge (MED)

2. **TS-1**: Add `@testing-library/react` and write TextareaField tests (ARIA wiring especially)
   - Rationale: `autoGrow` and `aria-invalid`/`aria-describedby` are the non-trivial behavior
   - Estimated effort: 30–45 minutes (includes adding RTL dependency)

3. **TS-2**: Add `NewSessionDialog` rendering test for Select callback
   - Rationale: Validates typed-cast selection path
   - Estimated effort: 20 minutes (once RTL is available)

4. **TS-3**: Add snapshot-race regression test
   - Estimated effort: 15 minutes

### Consider (LOW)

5. **TS-5**: Add `incrementUnread` guard test — 5 minutes
6. **TS-6**: Use fixed `lastActivity: 0` in `makeConnection` — 1 minute

### Long-term

7. Add `@testing-library/react` to the web test suite to enable component-level tests
8. Configure Vitest coverage (`v8` provider) to track line/branch coverage metrics in CI

---

## 10) Coverage Metrics

Coverage tooling not configured. No line/branch data available.

**Estimated behavioral coverage of changed code:**
- Store logic: ~90% (all new behaviors tested)
- API client: ~40% (WS URL covered; REST methods not)
- UI components: ~0% (no component test infrastructure)

---

## 11) CI/Runtime Considerations

- Test suite: Vitest, jsdom environment
- No coverage gate in CI observed
- New tests are synchronous (except one `await removeSession`) — no flakiness risk
- Total new tests added: ~12 (connection describe block) + existing cleanup tests updated

---

## 12) False Positives and Disagreements Welcome

1. **TS-1 (TextareaField)**: If the team has decided not to test UI components at the rendering level (matching the existing zero-component-test norm), severity is LOW rather than MED.
2. **TS-2 (Select callback)**: The `value as AgentType` cast is the same pattern used throughout the codebase; if `agentOptions` values are considered stable enums this may be LOW.
3. **TS-4 (REST encoding)**: If it's accepted that the WS URL test proves the pattern and REST methods are considered implicitly covered, this can be LOW.
4. **TS-3 (snapshot race)**: This is a theoretical scenario; if the codebase has no subscribers that mutate `activeSessionId` as a side-effect of `setStreaming`, the risk is LOW.

---

*Review completed: 2026-03-17*
*Session: [phase-7-sdk-control-panel](../README.md)*
