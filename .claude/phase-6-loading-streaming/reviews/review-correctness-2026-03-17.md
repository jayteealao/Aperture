---
command: /review:correctness
session_slug: phase-6-loading-streaming
date: 2026-03-17
scope: diff
target: HEAD~2
paths: web/src/pages/WorkspaceUseChat.tsx, web/src/components/layout/Sidebar.tsx
related:
  spec: ../../docs/plans/phase-6-loading-streaming.md
---

# Correctness Review Report

**Reviewed:** diff / HEAD~2 (Phase 6 — streaming status sync and sidebar dot)
**Date:** 2026-03-17
**Reviewer:** Claude Code

---

## 0) Scope, Intent, and Invariants

**What was reviewed:**
- Scope: diff
- Target: HEAD~2 (commits c2bc1cb and 5ccaee6)
- Files: 2 files, +23 lines added, -2 lines removed

**Intended behavior:**
- Bridge `useChat.status` (only available in `WorkspaceChatSessionReady`) back to the Zustand connection store so Sidebar, SdkControlPanel, and PiControlPanel can read streaming state without calling `useChat`
- Replace the single "Streaming..." badge with two distinct states: "Streaming..." (accent, pulsing) for `status === 'streaming'` and "Sending..." (outline, static) for `status === 'submitted'`
- Show a green pulsing dot in the sidebar session list for streaming sessions, replacing the unread dot while streaming is active to avoid two simultaneous indicator dots

**Must-hold invariants:**
1. **`isStreaming` in store reflects `useChat.status === 'streaming'` only** — The spec (section 6.2) explicitly states `status === 'streaming'` as the sync condition. The local variable `isStreaming` at line 186 combines `'streaming' || 'submitted'` for submit-button purposes only; the store write at line 133 uses `status === 'streaming'` exclusively.
2. **Unread dot shows only when not streaming** — The sidebar must not show two indicator dots at once. The `{hasUnread && !conn?.isStreaming}` guard enforces this.
3. **Streaming dot appears only for sessions actually streaming** — `conn?.isStreaming` must be a reliable signal. It is written by the sync `useEffect` on each `status` change.
4. **SDK/Pi message handlers writing `setStreaming` must not conflict with the new sync bridge** — Both paths write to the same `isStreaming` field. The `useChat` bridge fires on every status change in the React render cycle; the WS handlers fire on incoming WS events.

**Key constraints:**
- `useChat` is only accessible inside `WorkspaceChatSessionReady`, never in Sidebar or control panels
- `WorkspaceChatSessionReady` is mounted per session (one instance per session in `mountedSessions`)
- Sessions not in `mountedSessions` (disconnected, inactive) have no `WorkspaceChatSessionReady` rendering, so the sync bridge does not fire for them

**Known edge cases:**
- Session unmounts while streaming (user navigates away): The `useEffect` cleanup does not fire `setStreaming(sessionId, false)` — examined below
- Multiple sessions streaming simultaneously: Each `WorkspaceChatSessionReady` has its own `useChat` instance and its own `sessionId`-scoped store write — no cross-session conflict
- `status === 'submitted'` vs `'streaming'`: The store only syncs `'streaming'`, not `'submitted'`; the sidebar dot does not appear during `'submitted'` phase

---

## 1) Executive Summary

**Merge Recommendation:** APPROVE_WITH_COMMENTS

**Rationale:**
The core logic is correct: the sync bridge reliably propagates `useChat.status === 'streaming'` to the Zustand store, and the sidebar indicator logic is sound. There are two meaningful edge cases — a stale `isStreaming: true` left in the store when a `WorkspaceChatSessionReady` unmounts mid-stream, and a subtle divergence between the badge split and the sidebar dot (the sidebar shows no dot during the `'submitted'` phase) — that do not cause crashes or data loss but can produce incorrect visual state. Both are LOW severity.

**Critical Issues (BLOCKER/HIGH):** None

**Overall Assessment:**
- Correctness: Good
- Error Handling: Adequate
- Edge Case Coverage: Incomplete (stale streaming state on unmount)
- Invariant Safety: Mostly Safe

---

## 2) Findings Table

| ID | Severity | Confidence | Category | File:Line | Failure Scenario |
|----|----------|------------|----------|-----------|------------------|
| CR-1 | MED | High | State Transitions | `WorkspaceUseChat.tsx:132-134` | Component unmounts mid-stream → `isStreaming` stays `true` in store forever |
| CR-2 | LOW | High | Concurrency / Dual Writers | `WorkspaceUseChat.tsx:132-134`, `sdk-message-handler.ts:34`, `jsonrpc-message-handler.ts:117` | WS handler sets `isStreaming: true`; `useChat` hasn't emitted `'streaming'` yet → brief `false` flash |
| CR-3 | LOW | Med | State Transitions | `Sidebar.tsx:159` | `'submitted'` phase: sidebar shows no indicator despite active in-flight request |
| CR-4 | NIT | High | Determinism | `WorkspaceUseChat.tsx:186` | Local `isStreaming` combines `'submitted'`+`'streaming'` for button guard but is not synced to store — silent asymmetry |

**Findings Summary:**
- BLOCKER: 0
- HIGH: 0
- MED: 1
- LOW: 2
- NIT: 1

---

## 3) Findings (Detailed)

### CR-1: Stale `isStreaming: true` in Store When Component Unmounts Mid-Stream [MED]

**Location:** `web/src/pages/WorkspaceUseChat.tsx:132-134`

**Invariant Violated:**
- "`isStreaming` in store must return to `false` when streaming ends" — when the component that owns the sync bridge is unmounted, the `useEffect` cleanup does not fire `setStreaming(sessionId, false)`

**Evidence:**
```typescript
// Lines 132-134 — no cleanup/return function
useEffect(() => {
  setStreaming(sessionId, status === 'streaming')
}, [sessionId, status, setStreaming])
```

**Failure Scenario:**
1. Session is streaming (`useChat.status === 'streaming'`)
2. `setStreaming(sessionId, true)` is written to store
3. User navigates to a different route or the session is removed from `mountedSessions` (e.g., the session transitions to `ended`/`error` and drops out of `mountedSessions`)
4. `WorkspaceChatSessionReady` unmounts — React tears down the component but does NOT re-run the `useEffect` body (only the cleanup function would run, and there is none)
5. `connections[sessionId].isStreaming` remains `true` indefinitely
6. Sidebar shows a pulsing green dot forever; PiControlPanel shows steer/follow-up controls when the session is dead

**Impact:**
- Sidebar dot stuck "streaming" for dead/ended sessions — visual confusion
- PiControlPanel steer button remains visible/enabled when there is no active stream to steer

**Severity:** MED
**Confidence:** High
**Category:** State Transitions / Cleanup

**Smallest Fix:**
Add a cleanup function to the `useEffect` that resets `isStreaming` when the component unmounts:

```diff
--- a/web/src/pages/WorkspaceUseChat.tsx
+++ b/web/src/pages/WorkspaceUseChat.tsx
@@ -131,5 +131,8 @@
   useEffect(() => {
     setStreaming(sessionId, status === 'streaming')
-  }, [sessionId, status, setStreaming])
+    return () => {
+      setStreaming(sessionId, false)
+    }
+  }, [sessionId, status, setStreaming])
```

**Note:** The cleanup fires on every dependency change (not just unmount), but calling `setStreaming(sessionId, false)` before the next render's effect body runs is harmless — the body immediately re-sets the correct value. The important case is unmount, where the cleanup fires without a subsequent body run.

**Test case:**
```typescript
test('resets isStreaming in store when component unmounts mid-stream', () => {
  // Mount WorkspaceChatSessionReady, trigger streaming, then unmount
  // Expect connections[sessionId].isStreaming === false after unmount
})
```

---

### CR-2: Dual Writers to `isStreaming` — WS Handler vs. useChat Bridge [LOW]

**Location:** `web/src/pages/WorkspaceUseChat.tsx:132-134` vs `web/src/stores/sessions/sdk-message-handler.ts:34`, `jsonrpc-message-handler.ts:117`

**Invariant Violated:**
- "Single source of truth for streaming state" — the WS message handlers (`sdk-message-handler`, `jsonrpc-message-handler`, `pi-message-handler`) continue to call `setStreaming(sessionId, true/false)` based on raw WS events. The new Phase 6 bridge also calls `setStreaming` based on `useChat.status`. These two paths can disagree.

**Evidence:**
```typescript
// sdk-message-handler.ts:34 — fires on 'content_block_start' WS event
get().setStreaming(sessionId, true, msgId)

// jsonrpc-message-handler.ts:117 — fires on 'agent_message_chunk' WS event
get().setStreaming(sessionId, true, msgId)

// WorkspaceUseChat.tsx:133 — fires when React re-renders with new useChat.status
setStreaming(sessionId, status === 'streaming')
```

**Failure Scenario:**
1. WS event arrives → handler sets `isStreaming: true` in store
2. `useChat` processes the same event internally, eventually emits `status = 'streaming'`
3. React re-renders → bridge effect fires → `setStreaming(sessionId, true)` again (no-op, harmless)
4. But on the stop path: `useChat` emits `status = 'ready'` (stream done) → bridge fires `setStreaming(sessionId, false)`
5. Separately, `sdk-message-handler.ts:199/215` also fires `setStreaming(sessionId, false)` on `message_stop`/`error`
6. Net result: `false` written twice — harmless. But if `useChat` emits `'ready'` before the WS `message_stop` arrives (or vice versa), there is a brief window of inconsistency.

**Impact:**
- Minor: brief (sub-render-cycle) flickering of streaming state possible under race conditions
- Not a crash; not data loss. The final settled state is always correct.
- The WS handler path also passes `streamMessageId` to `setStreaming`, which the bridge does not. When the bridge fires after the handler, it calls `setStreaming(sessionId, false)` (or `true`) without the `streamMessageId` arg — on a `true` call, this would clear `currentStreamMessageId` to `undefined`, potentially breaking the ongoing stream tracking in the legacy message path.

**Sub-finding:** When `status` transitions to `'streaming'`, the bridge calls `setStreaming(sessionId, true)` with **no** `streamMessageId`. The `setStreaming` implementation in `connection-slice.ts:65` only updates `currentStreamMessageId` when `isStreaming` is `true` and the arg is provided:
```typescript
currentStreamMessageId: isStreaming ? streamMessageId : undefined,
```
If `isStreaming` is `true` and `streamMessageId` is `undefined`, this writes `currentStreamMessageId: undefined`, clobbering the value the WS handler set. This could break the legacy `messages` store path (used by JSON-RPC/Pi sessions) that reads `currentStreamMessageId` to append streaming content.

**Severity:** LOW (the `useChat` path doesn't use `currentStreamMessageId` — it uses its own internal message tracking. But Pi/legacy path does.)
**Confidence:** Med (depends on whether the bridge fires `setStreaming(sessionId, true)` after the WS handler has already set `currentStreamMessageId`)
**Category:** Concurrency / Dual Writers

**Smallest Fix:**
Option A — Guard the bridge to avoid overwriting `currentStreamMessageId`:
```diff
   useEffect(() => {
-    setStreaming(sessionId, status === 'streaming')
+    // Only sync the boolean; never pass undefined streamMessageId to avoid
+    // clobbering the currentStreamMessageId set by the WS message handler.
+    if (status !== 'streaming') {
+      setStreaming(sessionId, false)
+    }
+    // When status becomes 'streaming', the WS handler already sets isStreaming: true
+    // with the correct streamMessageId — don't clobber it.
   }, [sessionId, status, setStreaming])
```

Option B — Add a separate `setStreamingBool` action to `connection-slice` that only touches `isStreaming` without affecting `currentStreamMessageId`.

---

### CR-3: Sidebar Shows No Dot During `'submitted'` Phase [LOW]

**Location:** `web/src/components/layout/Sidebar.tsx:156-161`

**Invariant Violated:**
- The plan (section 6.3) and the badge split both treat `'submitted'` as an active in-flight state. The sidebar only checks `conn?.isStreaming`, which maps to `status === 'streaming'`. During `'submitted'` (message sent, waiting for first token) the sidebar shows no indicator dot at all, and if there are unread messages the unread dot appears instead.

**Evidence:**
```typescript
// Sidebar.tsx:156-161
{conn?.isStreaming && (
  <span className="w-2 h-2 rounded-full bg-success animate-[pulse_0.75s_ease-in-out_infinite]" title="Streaming" />
)}
{hasUnread && !conn?.isStreaming && (
  <span className="w-2 h-2 rounded-full bg-accent animate-pulse" />
)}
```

The bridge (WorkspaceUseChat.tsx:133) only writes `true` when `status === 'streaming'`:
```typescript
setStreaming(sessionId, status === 'streaming')
```

**Failure Scenario:**
1. User sends a message from Session A while viewing Session B
2. `useChat.status` goes `'idle' → 'submitted' → 'streaming' → 'ready'`
3. During `'submitted'` phase: `isStreaming: false`, `hasUnread: true` → unread dot shows (misleading — it looks like there's unread content when actually just waiting for response)
4. Once `'streaming'` begins: `isStreaming: true` → green streaming dot shows correctly

**Impact:**
- Visual inconsistency: unread dot appears during `'submitted'`, then switches to streaming dot
- Not a crash; not data loss. Purely cosmetic.

**Severity:** LOW
**Confidence:** Med (depends on `hasUnread` state during `'submitted'` phase)
**Category:** State Transitions / UI Correctness

**Smallest Fix (if desired):**
Sync `status === 'submitted'` to the store as well, using a separate boolean or extending the bridge:
```diff
   useEffect(() => {
-    setStreaming(sessionId, status === 'streaming')
+    setStreaming(sessionId, status === 'streaming' || status === 'submitted')
   }, [sessionId, status, setStreaming])
```
Then the sidebar dot appears for both states. This does re-introduce the CR-2 sub-finding (clobbering `currentStreamMessageId`) — Option B from CR-2 would be the cleaner fix if both are addressed together.

---

### CR-4: Silent Asymmetry Between Local `isStreaming` and Store `isStreaming` [NIT]

**Location:** `web/src/pages/WorkspaceUseChat.tsx:186`

**Evidence:**
```typescript
const isStreaming = status === 'streaming' || status === 'submitted'
```

The local variable `isStreaming` combines both phases (used only for submit button disabled state at line 276). The store bridge uses only `status === 'streaming'`. These are intentionally different — the button is disabled in both phases, the store only tracks the true streaming phase — but the naming and proximity invite confusion for future maintainers.

**Severity:** NIT
**Confidence:** High
**Category:** Determinism / Naming

**Suggestion:**
Rename to make intent explicit:
```typescript
const isInFlight = status === 'streaming' || status === 'submitted'
```
And use `isInFlight` at line 276. This makes it clear this is a UI-only combined state, not the same `isStreaming` tracked in the store.

---

## 4) Invariants Coverage Analysis

| Invariant | Enforcement | Gaps |
|-----------|-------------|------|
| `isStreaming` returns to `false` after stream ends | ⚠️ Partial | CR-1: No cleanup on unmount |
| Single source of truth for `isStreaming` | ⚠️ Partial | CR-2: WS handlers + React bridge both write |
| `currentStreamMessageId` preserved during bridge sync | ⚠️ Partial | CR-2: Bridge clobbers on `true` write |
| Sidebar shows only one indicator at a time | ✅ Good | `!conn?.isStreaming` guard on unread dot |
| Sidebar dot reflects `'streaming'` state accurately | ✅ Good | When component is mounted; stale on unmount |

---

## 5) Edge Cases Coverage

| Edge Case | Handled? | Evidence |
|-----------|----------|----------|
| Component unmounts mid-stream | ❌ No | CR-1: No cleanup → `isStreaming` stuck `true` |
| `'submitted'` phase indicator in sidebar | ❌ No | CR-3: No dot shown during sent→first-token window |
| Multiple sessions streaming simultaneously | ✅ Yes | Each `WorkspaceChatSessionReady` scoped by `sessionId` |
| Session ends (`ended`/`error`) during streaming | ❌ No | CR-1: Unmount path |
| Bridge fires before WS handler on stream start | ⚠️ Maybe | CR-2: `currentStreamMessageId` clobber risk |
| `'submitted'` → `'streaming'` transition | ✅ Yes | Badge split handles both visually in header |
| Reconnection during streaming | ✅ Yes | `translator.reset()` in `statusHandler` clears state |

---

## 6) Error Handling Assessment

**Patterns Found:**
- No error handling needed for this change — it's purely state synchronization via `useEffect` and store writes
- No async operations in the new code

**Good Practices:**
- `useEffect` dependency array is complete (`[sessionId, status, setStreaming]`) — no stale closure risk
- `setStreaming` action uses `get().updateConnection` which merges state safely (no full replacement)
- Sidebar reads `conn?.isStreaming` with optional chaining — safe when `conn` is undefined

**Missing:**
- Cleanup function on unmount (CR-1)

---

## 7) Concurrency & Race Conditions

**Shared State:**
- `connections[sessionId].isStreaming` — written by both WS message handlers and the React bridge
- Writing is synchronous (Zustand `set` is synchronous) — no async race
- React render cycle: `useEffect` fires after paint, so a WS event arriving between render and effect could briefly hold the WS handler's value, then be overwritten by the bridge

**Ordering Assumption:**
The WS `message_stop` event and `useChat` status transition to `'ready'` should arrive in close succession. Both call `setStreaming(sessionId, false)`. The final value is always `false` — the order doesn't matter for correctness, only for the `currentStreamMessageId` clobber scenario (CR-2).

---

## 8) Test Coverage Gaps

**Critical (should add):**
- [ ] Test that `isStreaming` resets to `false` in store when `WorkspaceChatSessionReady` unmounts (CR-1)
- [ ] Test that `currentStreamMessageId` is preserved when bridge fires `setStreaming(sessionId, true)` (CR-2 sub-finding)

**Nice to have:**
- [ ] Test sidebar renders streaming dot for `isStreaming: true` and not for `isStreaming: false`
- [ ] Test sidebar shows only one dot when both `hasUnread` and `isStreaming` are true

---

## 9) Recommendations

### Must Fix (MED)

1. **CR-1**: Add cleanup to `useEffect` sync bridge
   - Action: Return `() => setStreaming(sessionId, false)` from the effect
   - Rationale: Prevents permanently stuck `isStreaming: true` indicator in Sidebar and PiControlPanel when session unmounts mid-stream
   - Estimated effort: 2 minutes

### Should Fix (LOW)

2. **CR-2**: Guard bridge to avoid clobbering `currentStreamMessageId`
   - Action: Only call `setStreaming(sessionId, false)` from the bridge when status leaves `'streaming'`; let the WS handler own the `true` write with the correct `streamMessageId`
   - Rationale: Prevents breaking Pi/legacy session streaming message accumulation
   - Estimated effort: 5 minutes

3. **CR-3**: Decide whether `'submitted'` phase should show a sidebar dot
   - Action: Either extend the bridge to write `true` for `'submitted'` as well (and address CR-2 first), or accept the gap and document it
   - Rationale: Consistency between badge split and sidebar indicator
   - Estimated effort: 2 minutes (once CR-2 resolved)

### Consider (NIT)

4. **CR-4**: Rename local `isStreaming` to `isInFlight`
   - Action: Rename at line 186 and usage at line 276
   - Rationale: Prevents future maintainer confusion between two differently-scoped "isStreaming" concepts
   - Estimated effort: 2 minutes

### Overall Strategy

**If time is limited:**
- Fix CR-1 (unmount cleanup) — highest real-world impact, simplest fix
- Accept CR-2 as a known risk (only affects Pi/legacy sessions, and both paths converge to `false`)

**If time allows:**
- Fix CR-1, CR-2, CR-3 together — they form a coherent cleanup of the dual-writer model

---

## 10) False Positives & Disagreements Welcome

**Where I might be wrong:**

1. **CR-2 (currentStreamMessageId clobber)**: If `WorkspaceUseChat.tsx` is only used for `claude_sdk` and `pi_sdk` sessions that use the `useChat` path exclusively, and if those sessions never read `currentStreamMessageId` from the store in their message handlers, this clobber has no observable effect. The legacy `messages` store path may be unreachable for these sessions.

2. **CR-1 (unmount)**: If `mountedSessions` never drops a session that is actively streaming (i.e., sessions only unmount after `status` returns to `'ready'`), then the cleanup is not strictly necessary. But this depends on router behavior and session lifecycle that is outside this diff.

3. **CR-3 (submitted phase)**: If the `'submitted'` phase is extremely brief (< 100ms) in practice, the missing sidebar dot may be imperceptible and not worth the added complexity.

---

*Review completed: 2026-03-17*
*Session: phase-6-loading-streaming*
