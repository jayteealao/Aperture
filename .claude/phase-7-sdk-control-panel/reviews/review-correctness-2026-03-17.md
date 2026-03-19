---
command: /review:correctness
session_slug: phase-7-sdk-control-panel
date: 2026-03-17
scope: worktree
target: HEAD (working tree)
paths: all changed files
related:
  session: ../README.md
---

# Correctness Review Report

**Reviewed:** worktree / working tree diff (61 files, +680 / -1148 lines)
**Date:** 2026-03-17
**Reviewer:** Claude Code (claude-sonnet-4-6)

---

## 0) Scope, Intent, and Invariants

**What was reviewed:**
- Scope: worktree (git diff HEAD)
- Target: all modified files
- Files: 61 files, +680 lines added, -1148 lines removed
- Primary areas: store slices, WS message handlers, API client, UI component replacements, CSS variable migration

**Intended behavior:**

Phase 8 cleanup and polish comprising:
1. Remove legacy HUD CSS variable aliases (`--color-bg-primary`, `--color-text-muted`, etc.) and migrate all call-sites to Tailwind v4 semantic tokens (`text-foreground`, `text-muted-foreground`, `bg-secondary`, `border-border`)
2. Remove dead store fields (`piStreamingState`, `sdkStreamingState`, `currentStreamMessageId`) that were superseded
3. Remove deleted UI components (Avatar, Badge, Card, Dropdown, Skeleton, Textarea — replaced by shadcn/Radix equivalents at lowercase paths)
4. Harden state management: prevent ghost `ConnectionState` resurrection after a session is removed; snapshot `activeSessionId` before multi-step handlers to avoid TOCTOU
5. Handle `session/error` JSON-RPC messages correctly (was: log-only; now: set `status:'error'` + clear `isStreaming`)
6. Guard all `console.*` calls behind `import.meta.env.DEV` for production cleanliness
7. Remove `react-markdown` / `remark-*` / `rehype-katex` in favour of existing `streamdown` renderer
8. Pre-warm Shiki singleton on app init to eliminate FOUC on first code block

**Must-hold invariants:**

1. **No ghost ConnectionState entries** — once `cleanupConnection(id)` or `removeSession(id)` is called, no delayed WS callback should recreate a `ConnectionState` for that session. Violating this leaks memory and can cause stale `isStreaming:true` indicators for removed sessions.
2. **`isStreaming` is false when a session terminates** — `session/exit`, `session/error`, and `prompt_complete`/`prompt_error` must all drive `isStreaming` to `false`. A stuck `isStreaming:true` would render a permanent "Responding…" badge.
3. **API URL path segments are percent-encoded** — session IDs or workspace IDs containing special characters must not corrupt the request URL.
4. **`activeSessionId` snapshot is stable within a handler** — calling `get()` multiple times in a handler during which another subscriber may mutate `activeSessionId` can cause inconsistent unread-increment decisions.
5. **Error propagation is user-visible** — errors must reach the UI state (`status:'error'`, toast) even if console logging is gated behind DEV.

**Key constraints:**
- Single Zustand store with slices; all state mutations via `set()` or `get().<action>()`
- TypeScript strict mode; no `any`
- `encodeURIComponent` required for all URL path segments

**Known edge cases:**
- Delayed WS callbacks after session removal (ghost resurrection)
- `session/error` arriving while `isStreaming:true`
- `handleJsonRpcMessage` receiving non-object frames (string pings, null heartbeats)

---

## 1) Executive Summary

**Merge Recommendation:** APPROVE_WITH_COMMENTS

**Rationale:**
All tests pass (121/121), typecheck is clean, and lint has zero warnings. The correctness fixes in this diff are net-positive: the ghost-state guard, `session/error` handler, `activeSessionId` snapshot, and null-frame guard all close real holes. One MED and two LOW findings remain; none are data-corrupting or crash-inducing.

**Critical Issues (BLOCKER/HIGH):**
None.

**Overall Assessment:**
- Correctness: Good
- Error Handling: Robust (improved — `session/error` now sets visible error state)
- Edge Case Coverage: Good (ghost-state, null-frames, URL encoding all addressed)
- Invariant Safety: Mostly Safe (one MED invariant gap noted below)

---

## 2) Findings Table

| ID | Severity | Confidence | Category | File:Line | Failure Scenario |
|----|----------|------------|----------|-----------|------------------|
| CR-1 | MED | High | State Transition | `WorkspaceUseChat.tsx:116-120` | `useChat` `onError` silently swallowed before this diff; now it calls `toast.error` but the connection status is NOT set to `error` — UI shows toast but status dot stays green |
| CR-2 | LOW | Med | Boundary | `AskUserQuestionDisplay.tsx:135` | `hover:bg-(--secondary-hover)` uses raw CSS-var arbitrary-value syntax; works in TW4 but inconsistent with `bg-secondary-hover` utility pattern used elsewhere |
| CR-3 | LOW | High | Determinism / Console | `connection-slice.ts:109-111` | `connectSession` error catch sets `status:'error'` correctly, but also silently `return`s — no toast, no console in prod. User sees a red dot with no explanation text |

**Findings Summary:**
- BLOCKER: 0
- HIGH: 0
- MED: 1
- LOW: 2
- NIT: 2

---

## 3) Findings (Detailed)

### CR-1: useChat onError Does Not Set Connection Status to Error [MED]

**Location:** `web/src/pages/WorkspaceUseChat.tsx:116-120`

**Invariant Violated:**
- "Error propagation is user-visible" — the toast fires, but `connection.status` stays `'connected'`; the ConnectionStatus indicator does not turn red, and `isConnected` stays `true`, so the input remains enabled.

**Evidence:**
```typescript
// Lines 116-121 (new code after diff)
onError: (error) => {
  if (import.meta.env.DEV) {
    console.error('[useChat] Chat error:', error)
  }
  toast.error('Connection error', error instanceof Error ? error.message : 'Chat transport failed')
},
```

`useChat` `onError` fires when the AI SDK transport layer fails. This is distinct from the WS `session/error` JSON-RPC message (which sets `status:'error'`). The `useChat` error path only shows a toast and does not call `setStreaming(sessionId, false)` or `updateConnection(sessionId, { status: 'error' })`.

**Failure Scenario:**
1. `useChat` fetch transport throws (network drop mid-stream)
2. `onError` fires; toast shown
3. `connection.status` remains `'connected'`; `isStreaming` may remain `true`
4. The "Responding…" badge stays; the input form is disabled (`isInFlight` remains `true` if `status === 'streaming'`); user is stuck

**Impact:**
- User sees a toast but cannot send another message without reloading
- `isStreaming:true` stuck state (invariant 2 above)

**Severity:** MED
**Confidence:** High
**Category:** State Transition + Error Handling

**Smallest Fix:**
```diff
 onError: (error) => {
   if (import.meta.env.DEV) {
     console.error('[useChat] Chat error:', error)
   }
   toast.error('Connection error', error instanceof Error ? error.message : 'Chat transport failed')
+  setStreaming(sessionId, false)
 },
```

Note: `setStreaming` is already destructured in scope (`const { ..., setStreaming } = useSessionsStore()`). If `updateConnection` to `status:'error'` is also desired, that's a separate call but likely unnecessary since the WS may still be alive.

---

### CR-2: Inconsistent CSS Arbitrary-Value Syntax for `--secondary-hover` [LOW]

**Location:** `web/src/components/session/AskUserQuestionDisplay.tsx:135, 246` and `web/src/components/ui/PanelSection.tsx:34` and `web/src/components/sdk/SdkCommandsList.tsx:94`

**Invariant Violated:**
- "Single source of truth for CSS token usage" — the diff introduces `hover:bg-(--secondary-hover)` (raw CSS variable arbitrary-value) while the `@theme inline` block already maps `--color-secondary-hover: var(--secondary-hover)`, which would allow `hover:bg-secondary-hover` (semantic utility).

**Evidence:**
```tsx
// AskUserQuestionDisplay.tsx:246
'hover:bg-(--secondary-hover)',

// card.tsx:40 (new shadcn card)
hover && 'hover:border-ring hover:bg-(--secondary-hover) cursor-pointer',
```

Both forms work in Tailwind v4 (arbitrary CSS-var syntax `bg-(--var)` is valid), so this is not a crash. But it's inconsistent — the component library uses `bg-secondary` for static and `bg-(--secondary-hover)` for hover while `bg-secondary-hover` would also be valid.

**Failure Scenario:**
No runtime failure. Potential confusion when refactoring: a developer renames `--secondary-hover` without knowing to also grep for `(--secondary-hover)` patterns.

**Severity:** LOW
**Confidence:** High
**Category:** Maintainability / Consistency (not a correctness break)

**Smallest Fix:**
No change required for correctness. If consistency is desired, normalise to `hover:bg-secondary-hover` everywhere.

---

### CR-3: connectSession REST Error Is Silent in Production [LOW]

**Location:** `web/src/stores/sessions/connection-slice.ts:104-115`

**Invariant Violated:**
- "Error propagation is user-visible" — the `connections[sessionId].status` is set to `'error'` (ConnectionStatus dot turns red), but there is no toast and no console output in production.

**Evidence:**
```typescript
// Lines 104-115
} catch (err) {
  if (import.meta.env.DEV) {
    console.warn(`[Sessions] Failed to connect/restore session ${sessionId}:`, err)
  }
  get().updateConnection(sessionId, {
    status: 'error',
    error: err instanceof Error ? err.message : 'Session not found on server',
  })
  return
}
```

The `error` string IS stored in `ConnectionState.error`, and the ConnectionStatus indicator turns red. However, the error string is only exposed via the `title` attribute on the status dot (a hover tooltip), not surfaced as a visible message.

**Failure Scenario:**
1. Backend is unreachable / session ID not found on server
2. User clicks session in sidebar
3. ConnectionStatus dot turns red
4. No toast, no error message text visible unless user hovers the dot
5. User does not know why they cannot chat

**Impact:**
- Degraded discoverability of error reason
- Not a crash or data loss, but confusing UX

**Severity:** LOW
**Confidence:** High
**Category:** Error Handling / UX

**Smallest Fix:**
```diff
 } catch (err) {
   if (import.meta.env.DEV) {
     console.warn(`[Sessions] Failed to connect/restore session ${sessionId}:`, err)
   }
+  const message = err instanceof Error ? err.message : 'Session not found on server'
   get().updateConnection(sessionId, {
     status: 'error',
-    error: err instanceof Error ? err.message : 'Session not found on server',
+    error: message,
   })
+  // Surface to user; toast.error requires access to the toast context which
+  // is not available in the store. Emit via a store-level notification queue
+  // or handle in the calling component's catch.
   return
 }
```

Full fix requires a store-level notification mechanism or surfacing the error in the component that calls `connectSession`. Tracking as LOW since the error IS visible (status dot + title tooltip).

---

### NIT-1: Shiki Pre-warm with Empty Arrays [NIT]

**Location:** `web/src/App.tsx:55`

**Evidence:**
```typescript
void getSingletonHighlighter({ langs: [], themes: [] })
```

`getSingletonHighlighter` with empty `langs` / `themes` arrays warms the Wasm runtime but does not load any grammar. The first real code block will still incur a grammar load. This achieves the stated goal (Wasm ready), but the comment "preventing FOUC / shimmer flash" is slightly optimistic — only the engine init is amortised.

**Severity:** NIT
**Confidence:** High
**Category:** Correctness of comment vs. implementation intent

---

### NIT-2: `encodeURIComponent` Not Applied to `listWorkspaceCheckouts` `workspaceId` [NIT]

**Location:** `web/src/api/client.ts`

The diff shows `encodeURIComponent` was added to most endpoints. Spot-checking:

```typescript
async listWorkspaceCheckouts(workspaceId: string): Promise<ListWorkspaceCheckoutsResponse> {
  return this.request<ListWorkspaceCheckoutsResponse>(`/v1/workspaces/${encodeURIComponent(workspaceId)}/checkouts`)
}
```

This was updated. All visible endpoints in the diff were updated. No gap found here — marking as NIT for confirmation only.

**Severity:** NIT
**Confidence:** Low (review coverage — not a gap)

---

## 4) Invariants Coverage Analysis

| Invariant | Enforcement | Gaps |
|-----------|-------------|------|
| No ghost ConnectionState entries | ✅ Guard added in `updateConnection` | None |
| `isStreaming` cleared on session/error | ✅ Handler now calls `setStreaming(sessionId, false)` | None |
| `isStreaming` cleared on useChat error | ❌ Missing | CR-1: `onError` does not call `setStreaming(false)` |
| `activeSessionId` consistent within handler | ✅ Snapshot at top of `handleSessionUpdate` and `pi-message-handler done` | None |
| API URLs percent-encoded | ✅ `encodeURIComponent` added to all listed endpoints | None |
| Non-object WS frames ignored | ✅ `typeof data !== 'object' || data === null` guard added | None |
| Error visible to user on connect failure | ⚠️ Partial | CR-3: Status dot only; no toast |

**Recommendations:**
1. Fix CR-1 (`setStreaming(false)` in `useChat` `onError`)
2. Consider a toast or inline message for CR-3 if REST connect failures are common

---

## 5) Edge Cases Coverage

| Edge Case | Handled? | Evidence |
|-----------|----------|----------|
| Delayed WS callback after removeSession | ✅ Yes | `updateConnection` guard returns `state` if entry absent |
| `session/error` while streaming | ✅ Yes | Handler calls `setStreaming(false)` + `updateConnection({status:'error'})` |
| `session/exit` while streaming | ✅ Yes | Handler calls `setStreaming(false)` + `updateConnection({status:'ended'})` |
| `useChat` transport error while streaming | ❌ Partial | CR-1: toast only; `isStreaming` not cleared |
| Non-object WS message frame | ✅ Yes | Early return guard added |
| Session IDs with special chars in URL | ✅ Yes | `encodeURIComponent` on all path segments |
| `piStreamingState` / `sdkStreamingState` still referenced | ✅ No refs remain | Full cleanup confirmed by grep |

---

## 6) Error Handling Assessment

**Error Handling Patterns Found:**
- `session/error` JSON-RPC: now sets `status:'error'` + clears streaming (new, correct)
- `session/exit`: clears streaming + sets `status:'ended'` (correct)
- `prompt_complete` / `prompt_error`: clears streaming (correct)
- `connectSession` REST failure: sets `status:'error'` with message, DEV-only log (gap: no toast)
- `useChat` `onError`: toast only, does not clear streaming (gap: CR-1)
- All `console.*` in non-error paths: correctly gated behind `import.meta.env.DEV`

**Good Practices:**
- `updateConnection` guard prevents ghost state resurrection
- `activeSessionId` snapshot prevents TOCTOU in multi-step handlers
- `setStreaming` now simplified (removed `streamMessageId` parameter) — reduced surface for misuse

**Missing:**
- `setStreaming(false)` in `useChat` `onError` (CR-1)
- User-visible toast on `connectSession` REST failure (CR-3, LOW)

---

## 7) Concurrency & Race Conditions

**Shared State:**
- Zustand store: mutations via `set()` are synchronous and atomic within a call
- `activeSessionId` snapshot: correctly captured at the start of handlers where its value is used in multiple branches

**Async Patterns:**
- `connectSession` is `async`; awaits REST call before starting WS — ordering is correct
- `removeSession` / `cleanupConnection` happen synchronously in Zustand `set()`; delayed WS callbacks protected by the `updateConnection` guard

**No race conditions found.**

---

## 8) Test Coverage Gaps

Based on findings, missing tests:

**Should add:**
- [ ] `useChat` `onError` calls `setStreaming(sessionId, false)` (CR-1)
- [ ] `connectSession` REST failure: `connections[id].status === 'error'` and `connections[id].error` is set

**Already covered by new tests (confirmed passing):**
- [x] `updateConnection` no-op after `cleanupConnection`
- [x] `setStreaming` no-op after `removeSession`
- [x] `session/error` sets `status:'error'`, clears streaming, uses fallback message
- [x] `session/exit` sets `status:'ended'`, clears streaming
- [x] Non-object WS frames ignored

---

## 9) Recommendations

### Should Fix (MED)

1. **CR-1**: Add `setStreaming(sessionId, false)` in `useChat` `onError`
   - Action: One-line addition after `toast.error(...)` call in `WorkspaceUseChat.tsx`
   - Rationale: Prevents stuck "Responding…" badge and re-enables input after transport error
   - Estimated effort: 2 minutes

### Consider (LOW)

2. **CR-3**: Surface REST connect-failure error to user more visibly
   - Action: Add a toast call in the component that invokes `connectSession`, or add a store-level notification slot
   - Rationale: Currently only visible via hover tooltip on status dot
   - Estimated effort: 15 minutes

### Pass (NIT)

3. **CR-2**: Normalise `hover:bg-(--secondary-hover)` to `hover:bg-secondary-hover` for consistency
   - Not a correctness issue; only stylistic

---

## 10) False Positives & Disagreements Welcome

1. **CR-1 severity**: If `useChat` errors are expected to be transient and the WS session itself drives `isStreaming` state (via the WS teardown message), then the transport-layer `onError` may not need to call `setStreaming`. But since the WS can remain alive after a `useChat` HTTP error, the streaming flag may legitimately be stuck.
2. **CR-3 severity**: If the red status dot + tooltip is considered sufficient discoverability for the error, this can stay LOW/ignore. The error message IS stored in state; a future component can surface it.
3. **NIT-1**: If the Shiki pre-warm goal is solely "Wasm init" (not grammar load), the empty arrays are intentional and correct.

---

*Review completed: 2026-03-17*
*Session: [phase-7-sdk-control-panel](../README.md)*
