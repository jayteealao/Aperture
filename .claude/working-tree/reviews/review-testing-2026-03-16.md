---
command: /review:testing
session_slug: working-tree
date: 2026-03-16
scope: diff
target: working tree (unstaged changes)
paths: web/src/**
related:
  session: ../README.md
  spec: N/A
  plan: docs/plans/phase-8-cleanup.md
  work: N/A
---

# Testing Review Report

**Reviewed:** diff / working tree (unstaged changes)
**Date:** 2026-03-16
**Reviewer:** Claude Code

---

## 0) Scope, Test Strategy, and Context

**What was reviewed:**
- Scope: diff (working tree)
- Target: All unstaged modifications and untracked files
- Files changed: 5 source files modified/new, 3 test files new, plus deletions and config
- Lines changed: +162 -1 (source), +197 -0 (new tests), -2932 (deletions of old sessions.ts + skill files)

**Test strategy:**
- Test levels: unit (all new tests)
- Test framework: Vitest
- Coverage target: Not configured (no coverage threshold in vitest config)
- CI environment: Not visible in working tree

**Changed behavior:**
1. `WebSocketManager` - Added `onUIChunk`, `emitUIChunk`, `endUIChunkStream` methods for UIMessageChunk pub/sub
2. `WebSocketManager` - Added `endUIChunkStream` abort calls on WS error, close, and disconnect
3. `ApertureWebSocketTransport` - New `ChatTransport` implementation bridging `useChat` to WebSocket
4. `WsToUIChunkTranslator` - New translator converting SDK/Pi WS events to `UIMessageChunk` streams
5. `legacyMessageToUIMessage` / `coerceStoredMessagesToUIMessages` - New legacy message migration utilities
6. `usePersistedUIMessages` - New React hook for IndexedDB message persistence with fingerprint dedup
7. `WorkspaceUseChat` - New page component using `useChat` + new transport layer
8. `Workspace` - Feature flag router switching between `WorkspaceLegacy` and `WorkspaceUseChat`
9. `sessions.ts` (1460 lines) - Deleted monolithic store, replaced by `sessions/` directory (pre-existing)
10. Feature flag `USE_CHAT_TRANSPORT` - New localStorage-backed flag

**Acceptance criteria:**
(From phase-8-cleanup.md context)
1. Feature flag routes between legacy and new workspace
2. WebSocket transport delivers UIMessageChunks to useChat
3. Legacy messages can be coerced to UIMessage format for persistence migration

---

## 1) Executive Summary

**Merge Recommendation:** APPROVE_WITH_COMMENTS

**Rationale:**
The core new logic -- `WsToUIChunkTranslator`, `ApertureWebSocketTransport`, and `ui-message` utilities -- all have thorough, well-structured unit tests (31 tests across 3 files). The session store cleanup test covers the critical `removeSession`/`clearAll` paths. The `chat-transport.test.ts` is particularly thorough with 20 tests covering happy path, error, abort, double-close, and image scenarios. However, the new `WebSocketManager` pub/sub surface (`onUIChunk`, `emitUIChunk`, `endUIChunkStream`) has zero direct unit tests, and the `usePersistedUIMessages` hook has no tests despite containing non-trivial fingerprint dedup logic. These gaps are acceptable for an initial feature-flagged merge but should be addressed before the flag is removed.

**Test Coverage:** ~65% of changed source behaviors have direct test coverage

**Critical Gaps:**
1. **TS-1**: `WebSocketManager.onUIChunk/emitUIChunk/endUIChunkStream` - No direct unit tests for pub/sub lifecycle
2. **TS-2**: `usePersistedUIMessages` hook - No tests for persistence fingerprinting or stale-closure cancellation
3. **TS-3**: `WsToUIChunkTranslator` - Missing coverage for `assistant_message` (tool_result) translation and Pi `agent_end`

**Overall Assessment:**
- Coverage: Acceptable (core translator and transport well-tested; integration glue less so)
- Test Quality: High (behavior-oriented, proper mocking boundaries, good AAA structure)
- Flakiness Risk: Low (no sleeps, no timers, deterministic data)
- Determinism: Excellent (no Date.now() in tests, no randomness, isolated state via beforeEach)

---

## 2) Coverage Analysis

### Changed Behavior Coverage

| Behavior | File:Line | Tested? | Test Level | Coverage |
|----------|-----------|---------|------------|----------|
| SDK text stream translation | `ws-to-uichunk.ts:77-103` | Yes | Unit | Happy + Error + Edge |
| SDK delta translation | `ws-to-uichunk.ts:105-144` | Yes | Unit | Happy path |
| SDK content_block_stop (with and without contentBlock) | `ws-to-uichunk.ts:146-189` | Yes | Unit | Happy + Fallback |
| SDK assistant_message (tool_result) translation | `ws-to-uichunk.ts:191-212` | No | - | No tests |
| SDK prompt_complete/prompt_error | `ws-to-uichunk.ts:214-228` | Yes | Unit | Happy + Error |
| Pi agent_start / message_update (text, thinking, tool) | `ws-to-uichunk.ts:239-414` | Partial | Unit | Happy path (thinking_delta, tool_execution_end) |
| Pi agent_end | `ws-to-uichunk.ts:244-245` | No | - | No tests |
| Pi message_update error (no double-terminal) | `ws-to-uichunk.ts:403-411` | Yes | Unit | Error path |
| Null/primitive payload guards | `ws-to-uichunk.ts:75,237` | Yes | Unit | Edge cases |
| reset() clears state | `ws-to-uichunk.ts:61-69` | Yes | Unit | Happy path |
| ApertureWebSocketTransport sendMessages | `chat-transport.ts:8-87` | Yes | Unit | Happy + Error + Abort + Double-close + Images |
| ApertureWebSocketTransport reconnectToStream | `chat-transport.ts:89-91` | Yes | Unit | Returns null |
| legacyMessageToUIMessage (ContentBlock[]) | `ui-message.ts:34-112` | Yes | Unit | Happy (all block types) |
| legacyMessageToUIMessage (string content) | `ui-message.ts:22-32` | No | - | No tests |
| coerceStoredMessagesToUIMessages | `ui-message.ts:114-141` | Partial | Unit | Mixed legacy+migrated (missing: non-array, non-object entries) |
| WebSocketManager onUIChunk/emitUIChunk | `websocket.ts:229-259` | No | - | No direct tests (mocked in chat-transport) |
| WebSocketManager endUIChunkStream on WS events | `websocket.ts:92,101,111,117,175` | No | - | No tests |
| usePersistedUIMessages hook | `usePersistedUIMessages.ts:15-49` | No | - | No tests |
| WorkspaceUseChat page component | `WorkspaceUseChat.tsx:1-763` | No | - | No tests (UI, acceptable) |
| Feature flag routing | `Workspace.tsx:960-965` | No | - | No tests (trivial) |
| sessions store removeSession/clearAll | `sessions/` (refactored) | Yes | Unit | Happy path + state cleanup |

**Coverage Summary:**
- Fully tested: 9 behaviors
- Partially tested: 2 behaviors
- Not tested: 6 behaviors

### Test Level Distribution

| Level | Tests | % of Total | Appropriate? |
|-------|-------|------------|--------------|
| Unit | 31 (new) | 100% | Good for logic layer |
| Integration | 0 | 0% | Acceptable -- no DB/network boundaries |
| E2E | 0 | 0% | Acceptable for feature-flagged code |

---

## 3) Findings Table

| ID | Severity | Confidence | Category | File:Line | Issue |
|----|----------|------------|----------|-----------|-------|
| TS-1 | HIGH | High | Coverage Gap | `websocket.ts:229-265` | No direct tests for onUIChunk/emitUIChunk/endUIChunkStream |
| TS-2 | MED | High | Coverage Gap | `usePersistedUIMessages.ts:7-49` | No tests for persistence hook (fingerprint dedup, cancellation) |
| TS-3 | MED | High | Coverage Gap | `ws-to-uichunk.ts:191-212` | No tests for `assistant_message` (tool_result) translation |
| TS-4 | MED | Med | Coverage Gap | `ws-to-uichunk.ts:244-245` | No test for Pi `agent_end` event |
| TS-5 | LOW | High | Coverage Gap | `ui-message.ts:22-32` | `legacyMessageToUIMessage` with string content not tested |
| TS-6 | LOW | Med | Coverage Gap | `ws-to-uichunk.ts:310-397` | Pi `message_update` sub-events (text lifecycle, tool lifecycle, done) only partially tested |
| TS-7 | NIT | High | Assertion Quality | `ws-to-uichunk.test.ts:8-15` | `toMatchObject` used inconsistently where `toEqual` would catch regressions |
| TS-8 | NIT | Low | Test Organization | `sessions.test.ts:35` | Test file at `stores/sessions.test.ts` imports `./sessions` -- naming could be clearer |

**Findings Summary:**
- BLOCKER: 0
- HIGH: 1
- MED: 3
- LOW: 2
- NIT: 2

**Category Breakdown:**
- Coverage gaps: 6
- Flakiness: 0
- Brittleness: 0
- Wrong test level: 0
- Assertion quality: 2

---

## 4) Findings (Detailed)

### TS-1: No Direct Tests for WebSocketManager UIChunk Pub/Sub [HIGH]

**Location:** `web/src/api/websocket.ts:229-265`

**Untested Behavior:**
```typescript
// Lines 229-265 -- NO DIRECT TESTS
onUIChunk(sessionId: string, handler: (chunk: UIMessageChunk) => void): () => void {
  const handlers = this.uiChunkHandlers.get(sessionId) ?? new Set<...>()
  handlers.add(handler)
  this.uiChunkHandlers.set(sessionId, handlers)
  return () => {
    const currentHandlers = this.uiChunkHandlers.get(sessionId)
    if (!currentHandlers) { return }
    currentHandlers.delete(handler)
    if (currentHandlers.size === 0) {
      this.uiChunkHandlers.delete(sessionId)
    }
  }
}

emitUIChunk(sessionId: string, chunk: UIMessageChunk): void {
  const handlers = this.uiChunkHandlers.get(sessionId)
  if (!handlers) return
  for (const handler of handlers) {
    try { handler(chunk) } catch (error) { console.error(...) }
  }
}
```

**What's missing:**
1. **Subscribe/unsubscribe lifecycle**: Register handler, emit chunk, verify delivery, call cleanup, verify no more delivery
2. **Multiple handlers**: Two handlers on same session both receive chunks
3. **Cross-session isolation**: Handler on session A does not receive chunks for session B
4. **Error resilience**: One handler throwing does not prevent delivery to other handlers
5. **endUIChunkStream on WS error/close**: Lines 92, 101, 111, 117 are completely untested
6. **Cleanup after unsubscribe empties set**: Verify the `uiChunkHandlers` Map entry is removed when last handler unsubscribes

**Why it matters:**
- This is the core pub/sub glue between the WebSocket layer and the `useChat` transport
- A regression here silently breaks all streaming in the new codepath
- The chat-transport tests mock `wsManager` entirely, so they do NOT exercise this code

**Severity:** HIGH
**Confidence:** High
**Category:** Coverage Gap (Core Infrastructure)

**Suggested Test:**
```typescript
import { describe, it, expect, vi } from 'vitest'

describe('WebSocketManager UIChunk pub/sub', () => {
  // Note: would need to export the class or test via the singleton

  it('delivers emitted chunks to registered handlers', () => {
    const handler = vi.fn()
    const cleanup = wsManager.onUIChunk('session-1', handler)

    wsManager.emitUIChunk('session-1', { type: 'text', text: 'hello' })

    expect(handler).toHaveBeenCalledWith({ type: 'text', text: 'hello' })
    cleanup()
  })

  it('does not deliver after cleanup is called', () => {
    const handler = vi.fn()
    const cleanup = wsManager.onUIChunk('session-1', handler)
    cleanup()

    wsManager.emitUIChunk('session-1', { type: 'text', text: 'late' })
    expect(handler).not.toHaveBeenCalled()
  })

  it('isolates handlers across sessions', () => {
    const handler1 = vi.fn()
    const handler2 = vi.fn()
    wsManager.onUIChunk('session-1', handler1)
    wsManager.onUIChunk('session-2', handler2)

    wsManager.emitUIChunk('session-1', { type: 'text', text: 'only-1' })

    expect(handler1).toHaveBeenCalled()
    expect(handler2).not.toHaveBeenCalled()
  })

  it('continues delivery when one handler throws', () => {
    const bad = vi.fn(() => { throw new Error('boom') })
    const good = vi.fn()
    wsManager.onUIChunk('session-1', bad)
    wsManager.onUIChunk('session-1', good)

    wsManager.emitUIChunk('session-1', { type: 'text', text: 'data' })

    expect(good).toHaveBeenCalled()
  })

  it('is a no-op for sessions with no handlers', () => {
    expect(() => wsManager.emitUIChunk('unknown', { type: 'text', text: 'x' })).not.toThrow()
  })
})
```

**Test level:** Unit (no I/O, pure in-memory pub/sub)

---

### TS-2: No Tests for usePersistedUIMessages Hook [MED]

**Location:** `web/src/hooks/usePersistedUIMessages.ts:7-49`

**Untested Behavior:**
```typescript
// Lines 7-13 -- fingerprint dedup logic, NO TESTS
function messageFingerprint(messages: ApertureUIMessage[]): string {
  if (messages.length === 0) return '0:'
  const last = messages[messages.length - 1]
  const partsLen = last.parts?.length ?? 0
  return `${messages.length}:${last.id}:${partsLen}`
}

// Lines 38-46 -- dedup gate, NO TESTS
const persistMessages = async (nextMessages: ApertureUIMessage[]) => {
  const fingerprint = messageFingerprint(nextMessages)
  if (fingerprint === lastFingerprintRef.current) {
    return  // skips write -- not tested
  }
  lastFingerprintRef.current = fingerprint
  await idbSet(`ui-messages:${sessionId}`, nextMessages)
}
```

**What's missing:**
1. **Fingerprint dedup**: Calling `persistMessages` twice with same messages should only write to IDB once
2. **Fingerprint change detection**: Adding a message triggers a write
3. **Initial load**: Hook loads from IDB and passes through `coerceStoredMessagesToUIMessages`
4. **Cancellation**: Changing `sessionId` before IDB read resolves should discard stale result
5. **Empty messages**: Empty array returns `'0:'` fingerprint

**Why it matters:**
- The fingerprint function is called on every streaming delta -- a bug here either causes excessive IDB writes (performance) or dropped persistence (data loss)
- The cancellation guard prevents showing stale messages from a previous session

**Severity:** MED
**Confidence:** High
**Category:** Coverage Gap (State Management)

**Suggested Test:**
```typescript
// messageFingerprint is not exported; consider extracting it for testability.
describe('messageFingerprint', () => {
  it('returns "0:" for empty array', () => {
    expect(messageFingerprint([])).toBe('0:')
  })

  it('includes count, last ID, and parts length', () => {
    const messages = [
      { id: 'msg-1', role: 'user', parts: [{ type: 'text', text: 'hi' }] },
    ]
    expect(messageFingerprint(messages)).toBe('1:msg-1:1')
  })

  it('changes when a new message is appended', () => {
    const before = [{ id: 'msg-1', role: 'user', parts: [{ type: 'text', text: 'hi' }] }]
    const after = [
      ...before,
      { id: 'msg-2', role: 'assistant', parts: [{ type: 'text', text: 'hello' }] },
    ]
    expect(messageFingerprint(before)).not.toBe(messageFingerprint(after))
  })
})
```

**Test level:** Unit

---

### TS-3: No Tests for `assistant_message` (tool_result) Translation [MED]

**Location:** `web/src/api/ws-to-uichunk.ts:191-212`

**Untested Behavior:**
```typescript
// Lines 191-212 -- NO TESTS
case 'assistant_message': {
  this.ensureStarted(chunks)
  const content = (payload as { content?: Array<Record<string, unknown>> }).content ?? []
  for (const block of content) {
    if (block.type === 'tool_result' && typeof block.tool_use_id === 'string') {
      if (block.is_error) {
        chunks.push({
          type: 'tool-output-error',
          toolCallId: block.tool_use_id,
          errorText: String(block.content ?? 'Tool error'),
        })
      } else {
        chunks.push({
          type: 'tool-output-available',
          toolCallId: block.tool_use_id,
          output: block.content ?? null,
        })
      }
    }
  }
  break
}
```

**What's missing:**
1. **Successful tool result**: `assistant_message` with `tool_result` block (non-error)
2. **Error tool result**: `assistant_message` with `is_error: true`
3. **Multiple tool results**: Multiple blocks in one message
4. **Non-tool_result blocks**: Content blocks that are not `tool_result` should be ignored
5. **Missing `tool_use_id`**: Should be silently skipped

**Why it matters:**
- This is how the SDK backend delivers tool execution results to the UI
- Incorrect translation would break tool output display in the new `useChat` codepath

**Severity:** MED
**Confidence:** High
**Category:** Coverage Gap (Event Handler)

**Suggested Test:**
```typescript
it('translates assistant_message tool_result into tool-output-available', () => {
  const translator = new WsToUIChunkTranslator()

  const chunks = translator.translateSdkEvent('assistant_message', {
    content: [
      { type: 'tool_result', tool_use_id: 'tool-1', content: '/home/user' },
    ],
  })

  expect(chunks).toMatchObject([
    { type: 'start' },
    { type: 'tool-output-available', toolCallId: 'tool-1', output: '/home/user' },
  ])
})

it('translates assistant_message tool_result error into tool-output-error', () => {
  const translator = new WsToUIChunkTranslator()

  const chunks = translator.translateSdkEvent('assistant_message', {
    content: [
      { type: 'tool_result', tool_use_id: 'tool-2', is_error: true, content: 'Permission denied' },
    ],
  })

  expect(chunks).toMatchObject([
    { type: 'start' },
    { type: 'tool-output-error', toolCallId: 'tool-2', errorText: 'Permission denied' },
  ])
})

it('skips non-tool_result blocks in assistant_message', () => {
  const translator = new WsToUIChunkTranslator()

  const chunks = translator.translateSdkEvent('assistant_message', {
    content: [
      { type: 'text', text: 'some text' },
      { type: 'tool_result', tool_use_id: 'tool-1', content: 'ok' },
    ],
  })

  const toolChunks = chunks.filter((c) => c.type.startsWith('tool-'))
  expect(toolChunks).toHaveLength(1)
})
```

**Test level:** Unit

---

### TS-4: No Test for Pi `agent_end` Event [MED]

**Location:** `web/src/api/ws-to-uichunk.ts:244-245`

**Untested Behavior:**
```typescript
case 'agent_end':
  this.pushFinish(chunks, 'stop')
  break
```

**What's missing:**
A test verifying that `translatePiEvent('agent_end', {})` produces a `finish` chunk and resets the translator state. The SDK equivalent (`prompt_complete`) is tested but the Pi path is not.

**Severity:** MED
**Confidence:** Med (simple delegation to `pushFinish`, likely correct, but untested)
**Category:** Coverage Gap

**Suggested Test:**
```typescript
it('translates Pi agent_end into finish chunk', () => {
  const translator = new WsToUIChunkTranslator()

  translator.translatePiEvent('agent_start', {})
  const chunks = translator.translatePiEvent('agent_end', {})

  expect(chunks).toMatchObject([{ type: 'finish', finishReason: 'stop' }])
})
```

**Test level:** Unit

---

### TS-5: legacyMessageToUIMessage String Content Not Tested [LOW]

**Location:** `web/src/utils/ui-message.ts:22-32`

**Untested Behavior:**
```typescript
if (typeof message.content === 'string') {
  return {
    id: message.id,
    role: message.role,
    metadata: { timestamp: message.timestamp },
    parts: message.content
      ? [{ type: 'text', text: message.content }]
      : [],
  }
}
```

**What's missing:**
1. Message with `content: 'Hello'` (string) should produce single text part
2. Message with `content: ''` (empty string) should produce empty parts array

**Severity:** LOW
**Confidence:** High
**Category:** Coverage Gap (Edge Case)

**Suggested Test:**
```typescript
it('converts string content to a single text part', () => {
  const result = legacyMessageToUIMessage({
    id: 'msg-1', role: 'assistant', timestamp: '2026-03-14T12:00:00Z', content: 'Hello',
  })
  expect(result.parts).toEqual([{ type: 'text', text: 'Hello' }])
})

it('returns empty parts for empty string content', () => {
  const result = legacyMessageToUIMessage({
    id: 'msg-2', role: 'assistant', timestamp: '2026-03-14T12:00:00Z', content: '',
  })
  expect(result.parts).toEqual([])
})
```

---

### TS-6: Pi message_update Sub-Events Only Partially Tested [LOW]

**Location:** `web/src/api/ws-to-uichunk.ts:310-397`

**Partially tested behavior:**
The test at line 34-56 of `ws-to-uichunk.test.ts` covers `thinking_delta` and `tool_execution_end`, but does not exercise:
- `text_start` / `text_delta` / `text_end` (lines 311-330)
- `thinking_start` / `thinking_end` (lines 333-357)
- `toolcall_start` / `toolcall_delta` / `toolcall_end` (lines 359-397)
- `done` (line 399-401)
- Auto-start behavior when delta arrives without prior start event (lines 317-320, 339-342, 370-378)

**Severity:** LOW
**Confidence:** High
**Category:** Coverage Gap

---

### TS-7: toMatchObject Used Where toEqual Would Be Stricter [NIT]

**Location:** `web/src/api/ws-to-uichunk.test.ts:8-15`

```typescript
expect(
  translator.translateSdkEvent('content_block_start', {
    contentBlock: { type: 'text' },
  })
).toMatchObject([
  { type: 'start' },
  { type: 'text-start', id: 'block-1' },
])
```

**Issue:** `toMatchObject` allows the `start` chunk to carry unexpected properties without failing. For the `start` chunk this is intentional (it contains a dynamic `timestamp` in `messageMetadata`), but the pattern is used inconsistently -- some assertions use `toEqual`, some use `toMatchObject`. Consider using `toEqual` everywhere except where dynamic fields are present.

**Severity:** NIT
**Confidence:** High

---

### TS-8: sessions.test.ts Location vs Import [NIT]

**Location:** `web/src/stores/sessions.test.ts:35`

```typescript
import { useSessionsStore } from './sessions'
```

The test file sits at `stores/sessions.test.ts` and imports from `./sessions` which resolves to `sessions/index.ts`. This works, but the co-location convention would suggest `sessions/index.test.ts` or `sessions/cleanup.test.ts` for clarity.

**Severity:** NIT
**Confidence:** High

---

## 5) Coverage Gaps Summary

### Critical Gaps (HIGH+)

**Untested behaviors:**
1. **WebSocketManager UIChunk pub/sub** (TS-1)
   - Scenario: Register handler via `onUIChunk`, emit chunk, verify delivery, cleanup, verify isolation
   - Expected: Chunks delivered to correct handlers; cleanup removes handler; error in one handler does not block others
   - Risk: Silent streaming failure in production; transport tests mock this layer entirely

### Important Gaps (MED)

**Partially tested or untested behaviors:**
2. **usePersistedUIMessages hook** (TS-2)
   - Scenario: Fingerprint dedup prevents redundant IDB writes during streaming
   - Risk: Performance degradation (excessive writes) or data loss (missed writes)

3. **assistant_message translation** (TS-3)
   - Scenario: SDK sends tool execution results via `assistant_message` event
   - Risk: Tool output display broken in new codepath

4. **Pi agent_end** (TS-4)
   - Scenario: Pi conversation ends, translator should emit finish chunk
   - Risk: Stream never closes for Pi sessions

### Edge Cases (LOW)

**Missing boundary tests:**
- String content in `legacyMessageToUIMessage` (TS-5)
- Pi message_update sub-event coverage (TS-6)

---

## 6) Test Quality Issues

### Flakiness (Risk: Low)

**Identified flaky tests:** None

**Good practices observed:**
- No `setTimeout` / `sleep` in any test
- No `Date.now()` dependencies in test assertions
- All async tests properly awaited
- `beforeEach` resets all mocks and state

### Brittleness (Risk: Low)

**Brittle tests:** None identified

**Good practices observed:**
- Mocking only at boundaries (wsManager, idb-keyval, api client)
- Assertions on behavior (output chunks) not implementation (method calls)
- No snapshot tests

### Determinism (Status: Excellent)

- Tests create isolated state via `beforeEach` + `setState(initialState, true)`
- No shared mutable fixtures
- No test ordering dependencies
- Fingerprint strings are deterministic (based on IDs and counts)

---

## 7) Test Level Assessment

### Correctly Leveled Tests

Unit tests (31 new tests across 3 files + 2 in sessions.test.ts):
- `ws-to-uichunk.test.ts` (9 tests): Pure class, no I/O -- correct as unit
- `chat-transport.test.ts` (20 tests): Mocks wsManager at boundary -- correct as unit
- `ui-message.test.ts` (2 tests): Pure functions -- correct as unit
- `sessions.test.ts` (2 tests): Zustand store with mocked deps -- correct as unit

### Incorrectly Leveled Tests

None identified. All tests are at appropriate levels.

---

## 8) Positive Observations

Things done well:

- **Excellent transport test coverage:** `chat-transport.test.ts` with 20 tests covers happy path, send failure, abort signal, double-close guards, and image attachments
- **Good error path testing:** Both SDK and Pi error events tested for "no double-terminal" behavior, which prevents stream controller crashes
- **Proper mock boundaries:** Tests mock `wsManager` and `idb-keyval` (external I/O boundaries), not internal logic
- **Clear Arrange-Act-Assert structure:** Every test follows a readable pattern
- **Edge case awareness:** Null/undefined/primitive payload guards tested for both SDK and Pi translators
- **Fallback behavior tested:** `content_block_stop` without `contentBlock` field tested for both text and tool blocks
- **No flakiness vectors:** Zero `setTimeout`, zero real timers, zero non-determinism
- **Good test naming:** Descriptive names that explain the behavior being verified
- **Clean test data factories:** `buildTransport()`, `makeUserMessage()`, `defaultSendOptions()` helpers are clear and composable

---

## 9) Recommendations

### Must Fix (HIGH)

1. **TS-1**: Add unit tests for `WebSocketManager.onUIChunk/emitUIChunk/endUIChunkStream`
   - Action: Create `websocket.test.ts` with subscribe/unsubscribe/isolation/error-resilience tests
   - Rationale: Core streaming infrastructure is untested; transport tests mock it entirely
   - Estimated effort: 20 minutes

### Should Fix (MED)

2. **TS-3**: Add tests for `assistant_message` (tool_result) translation
   - Action: Add 2-3 test cases to `ws-to-uichunk.test.ts`
   - Rationale: Tool output display relies on this path
   - Estimated effort: 10 minutes

3. **TS-4**: Add test for Pi `agent_end`
   - Action: Add 1 test case to `ws-to-uichunk.test.ts`
   - Rationale: Ensures Pi streams terminate correctly
   - Estimated effort: 5 minutes

4. **TS-2**: Add tests for `usePersistedUIMessages` (or extract + test fingerprint)
   - Action: Export `messageFingerprint` and add unit tests, or test hook via `@testing-library/react-hooks`
   - Rationale: Dedup logic is non-trivial and called on every streaming delta
   - Estimated effort: 15 minutes

### Consider (LOW/NIT)

5. **TS-5**: Add string content test for `legacyMessageToUIMessage`
   - Estimated effort: 5 minutes

6. **TS-6**: Add Pi sub-event tests (text lifecycle, tool lifecycle, done)
   - Estimated effort: 15 minutes

### Long-term

7. Add coverage tracking (`vitest --coverage`) to CI pipeline
8. Add integration test for full WebSocket -> Translator -> Transport -> useChat flow once feature flag is removed

---

## 10) Coverage Metrics

**Coverage tool not configured** -- no `--coverage` flag in vitest config or CI.

**Estimated uncovered lines (manual analysis):**
- `web/src/api/websocket.ts:229-265` (onUIChunk/emitUIChunk/endUIChunkStream)
- `web/src/api/websocket.ts:92,101,111,117` (endUIChunkStream calls in WS event handlers)
- `web/src/api/ws-to-uichunk.ts:191-212` (assistant_message handler)
- `web/src/api/ws-to-uichunk.ts:244-245` (agent_end)
- `web/src/hooks/usePersistedUIMessages.ts:7-49` (entire hook)
- `web/src/utils/ui-message.ts:22-32` (string content branch)

---

## 11) CI/Runtime Considerations

**Test runtime:**
- Total: 2.27s (8 test files, 82 tests)
- Test execution: 49ms
- All tests are fast and deterministic

**Recommendations:**
- Test suite is fast and well-suited for CI
- No parallelization concerns (all tests are independent)

---

## 12) False Positives & Disagreements Welcome

**Where I might be wrong:**

1. **TS-1 (WebSocketManager tests)**: The chat-transport tests indirectly exercise the pub/sub API through mocks. If the team considers that sufficient, direct tests may be lower priority. However, the mock boundary means a regression in `onUIChunk` would NOT be caught by any test.

2. **TS-2 (usePersistedUIMessages)**: If the hook is considered trivial React glue, tests may not be justified. However, the fingerprint dedup logic is a custom optimization that could silently drop writes.

3. **TS-6 (Pi sub-events)**: If Pi SDK support is experimental or low-traffic, lower coverage may be acceptable.

**How to override my findings:**
- Show integration test coverage I missed
- Point to CI coverage reports that cover these paths
- Explain why behavior is trivial and does not need testing

---

*Review completed: 2026-03-16*
*Session: [working-tree](../README.md)*
