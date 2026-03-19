---
command: /review:correctness
session_slug: working-tree
date: 2026-03-17
scope: diff
target: HEAD (working tree vs last commit)
paths: web/src/**
related:
  session: ../README.md
---

# Correctness Review Report

**Reviewed:** diff / working tree (git diff HEAD)
**Date:** 2026-03-17
**Reviewer:** Claude Code

---

## 0) Scope, Intent, and Invariants

**What was reviewed:**
- Scope: diff (working tree)
- Target: HEAD
- Files: 11 files changed, +73 lines added, -130 lines removed
- Focus: web/src/**

**Intended behavior:**

1. Encode all path-segment IDs in API client URLs to prevent injection via special characters (slashes, spaces, etc.)
2. Remove now-dead streaming state types (`SdkStreamingState`, `PiStreamingState`, `PiContentBlock`, `currentStreamMessageId`) superseded by the `useChat`/`WsToUIChunkTranslator` approach.
3. Harden the connection store: prevent ghost `ConnectionState` entries from being resurrected by stale WS callbacks after a session is removed.
4. Add user-visible error surface (`toast.error`) for `useChat` transport errors.
5. Suppress non-essential `console.log/warn/error` calls in production builds (wrap in `import.meta.env.DEV`).
6. Handle `session/error` JSON-RPC messages with proper connection state update and streaming reset (previously the error was only logged).

**Must-hold invariants:**

1. **Connection state for a removed session must not be resurrected** — A session removed via `removeSession()` deletes its `connections[sessionId]` entry; delayed WS callbacks must not write it back. Violation = ghost state that leaks UI indicators.
2. **`isStreaming` must be `false` after any terminal event** — Terminal events (`prompt_complete`, `prompt_error`, `session/exit`, `session/error`, `agent_end`, `done`, WS error, component unmount) must all clear the flag. Failure = stuck "streaming" indicator.
3. **All path-segment IDs in fetch/WS URLs must be percent-encoded exactly once** — IDs containing `/`, `?`, `#`, or spaces corrupt the URL path. Failure = wrong resource addressed or 404.
4. **`activeSessionId` must be snapshotted before any store writes** — Reading `activeSessionId` via `get()` after a `set()` call can observe a changed value if a subscriber triggers a side-effect. The pattern is explicitly documented in `jsonrpc-message-handler.ts`.
5. **Removed type definitions must have no remaining references** — Removing a type while leaving references = compile error.

**Key constraints:**
- Zustand state updates are synchronous within a single `set()` call but `get()` calls between two `set()` calls can observe interleaved subscriber side-effects.
- `updateConnection` now silently no-ops when `connections[sessionId]` is absent (ghost-guard). Any caller that expects the write to succeed must be aware.
- `import.meta.env.DEV` suppresses logs only at the Vite build level; no effect in test runs unless `NODE_ENV` is aligned.

**Known edge cases:**
- Session removed while a WS message is in-flight (ghost-guard scenario).
- `useChat` `onError` fires on reconnect after component unmount.
- `encodeURIComponent` applied to an already-encoded ID would double-encode.

---

## 1) Executive Summary

**Merge Recommendation:** APPROVE_WITH_COMMENTS

**Rationale:**
The diff is a focused, high-quality cleanup: it closes a real ghost-state resurrection bug, encodes path IDs correctly, wires up `session/error` properly, and trims dead streaming-state types. No data-corruption or crash-level issues were found. One MED finding exists: a minor TOCTOU in the unread-count logic in `pi-message-handler` (the `done` branch reads `activeSessionId` after a `setStreaming` write, inconsistent with the pattern explicitly added elsewhere in this same diff). Two LOW/NIT findings round out the report.

**Critical Issues (BLOCKER/HIGH):**
None.

**Overall Assessment:**
- Correctness: Good
- Error Handling: Good (`session/error` now handled; transport errors surfaced to user)
- Edge Case Coverage: Good (ghost-guard is the main edge case; well covered)
- Invariant Safety: Mostly Safe (one TOCTOU nit in pi-message-handler)

---

## 2) Findings Table

| ID | Severity | Confidence | Category | File:Line | Failure Scenario |
|----|----------|------------|----------|-----------|------------------|
| CR-1 | MED | Med | Concurrency / State | `pi-message-handler.ts:35-39` | `activeSessionId` read after `setStreaming` write; subscriber side-effect could shift it |
| CR-2 | LOW | High | API Contract / Silent no-op | `connection-slice.ts:158-160` | `disconnectSession` after `removeSession` silently drops the `status: 'disconnected'` write |
| CR-3 | LOW | Med | Input Validation | `client.ts` (all callers) | If a caller passes an already-encoded ID, `encodeURIComponent` double-encodes it |
| CR-4 | NIT | High | Dead code / types | `api/types.ts:442` | `SdkContentBlock` type remains exported but its only consumer (`SdkStreamingState`) was removed |

**Findings Summary:**
- BLOCKER: 0
- HIGH: 0
- MED: 1
- LOW: 2
- NIT: 1

---

## 3) Findings (Detailed)

### CR-1: TOCTOU — `activeSessionId` read after `setStreaming` write in Pi message handler [MED]

**Location:** `web/src/stores/sessions/pi-message-handler.ts:35-39`

**Invariant Violated:**
- "Read `activeSessionId` before any store writes so the unread check sees a consistent snapshot." This pattern is explicitly documented and applied in `jsonrpc-message-handler.ts:122-123` within this same diff — the Pi handler's `done` branch does not follow it.

**Evidence:**
```typescript
// pi-message-handler.ts lines 35-39
} else if (msgEvent.type === 'done') {
  get().setStreaming(sessionId, false)          // ← write happens first
  if (sessionId !== get().activeSessionId) {   // ← activeSessionId read AFTER write
    get().incrementUnread(sessionId)
  }
}
```

Compare with the corrected pattern applied in this same diff to `jsonrpc-message-handler.ts`:
```typescript
// jsonrpc-message-handler.ts lines 122-128
const { activeSessionId } = get()  // ← snapshot BEFORE any write
if (!get().connections[sessionId]?.isStreaming) {
  get().setStreaming(sessionId, true)
}
if (sessionId !== activeSessionId) {
  get().incrementUnread(sessionId)
}
```

**Failure Scenario:**
- User has two sessions; session B (background) finishes streaming.
- `setStreaming(sessionB, false)` fires, triggering a Zustand subscriber.
- That subscriber switches `activeSessionId` to `sessionB` (e.g., auto-focus heuristic).
- `get().activeSessionId` now returns `sessionB`.
- `sessionId !== activeSessionId` is `false` → `incrementUnread` skipped.
- Unread badge is never shown even though session B was in the background when it finished.

**Impact:** Missed unread increment — unread count off by one in a specific timing window. Not a crash or data loss.

**Severity:** MED
**Confidence:** Med (requires a subscriber that modifies `activeSessionId` in response to `isStreaming` — none observed today, but the pattern is fragile and inconsistent with the explicit fix applied to the sibling handler in this diff)

**Smallest Fix:**
```diff
--- a/web/src/stores/sessions/pi-message-handler.ts
+++ b/web/src/stores/sessions/pi-message-handler.ts
@@ -34,8 +34,9 @@
       } else if (msgEvent.type === 'done') {
-        get().setStreaming(sessionId, false)
-        if (sessionId !== get().activeSessionId) {
+        const { activeSessionId } = get()
+        get().setStreaming(sessionId, false)
+        if (sessionId !== activeSessionId) {
           get().incrementUnread(sessionId)
         }
```

---

### CR-2: Silent no-op — `disconnectSession` after `removeSession` [LOW]

**Location:** `web/src/stores/sessions/connection-slice.ts:158-160`

**Invariant Violated:**
- `disconnectSession` is documented/implied to write `status: 'disconnected'`. The ghost-guard added in this diff silently prevents that write if the session was already removed.

**Evidence:**
```typescript
// connection-slice.ts lines 158-160
disconnectSession: (sessionId) => {
  wsManager.disconnect(sessionId)
  get().updateConnection(sessionId, { status: 'disconnected' })  // ← no-op if entry deleted
},
```

The ghost-guard in `updateConnection` returns the unchanged state early if `!state.connections[sessionId]`. In `removeSession`, `cleanupConnection` (which deletes the entry) is called before any external call to `disconnectSession` could occur — so the ordinary `removeSession` flow is fine. The risk is a stale `useEffect` cleanup or out-of-order caller.

**Failure Scenario:**
```typescript
removeSession(sessionId)     // deletes connections[sessionId]
disconnectSession(sessionId) // updateConnection silently no-ops
// Any code expecting status:'disconnected' to be written is silently wrong
```

**Impact:** Low — session already removed means no UI should observe its state. No error surfaced makes diagnosing future bugs harder.

**Severity:** LOW
**Confidence:** High

**Smallest Fix (add comment):**
```typescript
disconnectSession: (sessionId) => {
  wsManager.disconnect(sessionId)
  // Note: updateConnection is a no-op if this session has already been removed
  // via removeSession (ghost-guard). This is intentional and safe.
  get().updateConnection(sessionId, { status: 'disconnected' })
},
```

---

### CR-3: Potential double-encoding if IDs are pre-encoded [LOW]

**Location:** `web/src/api/client.ts` (all 9 changed call sites)

**Invariant Violated:**
- "Path segments must be encoded exactly once."

**Evidence:**
```typescript
// client.ts — representative example
return this.request<SessionStatus>(`/v1/sessions/${encodeURIComponent(sessionId)}`)
```

**Failure Scenario:**
If a session ID is stored already percent-encoded (e.g., `session%2Ftest`), applying `encodeURIComponent` again produces `session%252Ftest`, which the backend would interpret as a different resource → 404.

**Impact:** 404 for any session whose ID contains percent-encoded characters.

**Severity:** LOW
**Confidence:** Med (depends on whether the backend ever returns pre-encoded IDs — not determinable from this diff alone)

**Recommended action:** Verify that all IDs returned by the backend are raw/unencoded strings. If confirmed (standard REST practice), this finding is informational only and the encoding change is correct.

---

### CR-4: Orphaned `SdkContentBlock` export [NIT]

**Location:** `web/src/api/types.ts:442`

**Evidence:**
The diff removes `SdkStreamingState` (sole consumer of `SdkContentBlock`) from `sdk-slice.ts`, but `SdkContentBlock` itself remains exported from `types.ts`. No remaining references to `SdkContentBlock` exist in `src/` (confirmed by grep).

**Impact:** Dead exported type — no runtime impact. Minor tech debt.

**Severity:** NIT
**Confidence:** High

**Smallest Fix:** Remove the `SdkContentBlock` type and its export from `web/src/api/types.ts`.

---

## 4) Invariants Coverage Analysis

| Invariant | Enforcement | Gaps |
|-----------|-------------|------|
| Connection state not resurrected after removal | ✅ Ghost-guard added in `updateConnection` | None — guard covers all async callback paths |
| `isStreaming` cleared on all terminal events | ✅ `session/error` now clears it; all handlers addressed | None found |
| Path IDs percent-encoded exactly once | ✅ All 9 client methods updated | CR-3: potential double-encode if IDs pre-encoded by server |
| `activeSessionId` snapshotted before writes | ⚠️ Fixed in JSON-RPC handler; missed in Pi handler `done` branch | CR-1 |
| Dead streaming-state types fully purged | ⚠️ `SdkContentBlock` orphaned in `types.ts` | CR-4 |

---

## 5) Edge Cases Coverage

| Edge Case | Handled? | Evidence |
|-----------|----------|----------|
| WS message arrives after session removed | ✅ Yes | Ghost-guard in `updateConnection` |
| Component unmounts during active stream | ✅ Yes | `useEffect` cleanup calls `setStreaming(false)` |
| `session/error` received from server | ✅ Yes | Now properly sets `status:'error'` and clears streaming |
| `useChat` transport error | ✅ Yes | `onError` now calls `toast.error` |
| Session ID containing `/` or special chars | ✅ Yes | `encodeURIComponent` applied in all URL paths |
| `incrementUnread` called on removed session | ✅ Yes | Early return added when `conn` is absent |
| Background session finishes while subscriber changes `activeSessionId` | ⚠️ Partial | CR-1: Pi handler `done` branch reads `activeSessionId` after write |

---

## 6) Error Handling Assessment

**Good Practices Found:**
- `session/error` RPC: previously only logged, now correctly sets `status:'error'` and clears `isStreaming`.
- `useChat` `onError`: previously swallowed in production (`console.error` only), now surfaces to user via `toast.error`.
- `connectSession` failure: still surfaces `status:'error'` with message.
- `incrementUnread` on missing connection: safe early return.
- Ghost-guard prevents silent state corruption from stale async callbacks.

**Missing / Gaps:**
- CR-1: `activeSessionId` snapshot ordering in `pi-message-handler.ts`.
- Production errors from `connectSession` failure no longer emit any log (`import.meta.env.DEV` wrapping). The connection status is set to `'error'` which is the right user-visible signal, so this is acceptable — but consider whether server-side observability (e.g., error event emitted to a monitoring service) is needed.

---

## 7) Concurrency & Race Conditions

**Shared State:**
- `connections` record: protected by Zustand's synchronous `set()` batching. Ghost-guard makes ghost-writes atomic within a single `set()` call — correct.
- `activeSessionId`: read via `get()` between two `set()` calls — subject to TOCTOU if subscribers modify it synchronously (CR-1).

**Pre-existing issue (not introduced by this diff):**
`connectSession` is `async` and calls `api.connectSession` before setting up WS. If the session is removed while the `await` is pending, `updateConnection` calls after the await are protected by the ghost-guard, but `wsManager.connect` will still register a WS connection for a removed session. This is a pre-existing issue; the ghost-guard partially mitigates its symptoms.

---

## 8) Test Coverage Gaps

**Should add:**
- [ ] `pi-message-handler`: regression test that `incrementUnread` is not called when `activeSessionId === sessionId` at the moment of `done`, even if a subscriber would change it synchronously (CR-1).
- [ ] `connection-slice`: unit test that `updateConnection` is a no-op after `cleanupConnection` deletes the entry (ghost-guard).
- [ ] `jsonrpc-message-handler`: test that `session/error` sets `status:'error'` and clears `isStreaming`.

**Nice to have:**
- [ ] `client.ts`: test that `getSession` with a session ID containing `/` or `%` constructs the expected URL.

---

## 9) Recommendations

### Should Fix (MED)

1. **CR-1**: Snapshot `activeSessionId` before `setStreaming` in `pi-message-handler.ts` `done` branch
   - Action: Apply one-line patch from CR-1
   - Rationale: Brings Pi handler into alignment with the explicit pattern added in `jsonrpc-message-handler.ts` in this same diff; prevents a fragile ordering dependency
   - Estimated effort: 2 minutes

### Consider (LOW/NIT)

2. **CR-2**: Add clarifying comment to `disconnectSession` about ghost-guard silent no-op
   - Action: One-line comment
   - Estimated effort: 1 minute

3. **CR-3**: Confirm backend returns raw (non-encoded) IDs
   - Action: API contract review only; no code change if confirmed
   - Estimated effort: 5 minutes

4. **CR-4**: Remove orphaned `SdkContentBlock` type from `web/src/api/types.ts`
   - Action: Delete the type
   - Estimated effort: 2 minutes

### Overall Strategy

Safe to merge after addressing CR-1 (a two-line fix). All other findings are informational or cosmetic.

---

## 10) False Positives & Disagreements Welcome

1. **CR-1 (TOCTOU)**: If no subscriber in the codebase ever modifies `activeSessionId` in response to `isStreaming` changes, this is purely theoretical. The concern is forward-looking and about consistency with the documented pattern.
2. **CR-3 (double-encode)**: If the backend definitively returns raw IDs (standard REST practice), this is not a bug — the encoding is correct and this finding is purely informational.
3. **CR-2 (silent no-op)**: If the call-site contract is "never call `disconnectSession` on an already-removed session", this is a documentation gap only, not a correctness bug.

---

*Review completed: 2026-03-17*
*Session: [working-tree](../README.md)*
