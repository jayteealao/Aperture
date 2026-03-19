---
command: /review:refactor-safety
session_slug: phase-7-sdk-control-panel
date: 2026-03-17
scope: diff
target: HEAD~1 (commit e0fe202 — Phase 8 cleanup, flag removal, HUD aesthetic polish)
paths: web/src/**
related:
  session: ../README.md
---

# Refactor Safety Review Report

**Reviewed:** diff / git diff HEAD~1 (22 files, +73 / -1915)
**Date:** 2026-03-17
**Reviewer:** Claude Code (claude-sonnet-4-6)

---

## 0) Refactor Scope & Equivalence Constraints

**What was refactored:**
- Scope: diff (one commit)
- Target: e0fe202 "feat(web): Phase 8 — cleanup, flag removal, HUD aesthetic polish"
- Files: 22 files changed, +73 lines added, -1915 lines removed
- Focus: web/src/

**Refactor goals (inferred from commit, comments, and prior session plan):**

1. Remove the `USE_CHAT_TRANSPORT` feature flag — `WorkspaceLegacy` is no longer conditional; `Workspace.tsx` delegates entirely to `WorkspaceUseChat`.
2. Delete the `MessageSlice` and `message-slice.ts` — `useChat` now owns all message state via `WsToUIChunkTranslator`; the store no longer holds messages.
3. Strip the three WebSocket message handlers (`sdk-message-handler`, `pi-message-handler`, `jsonrpc-message-handler`) of all message-building logic — they now only update streaming flags, permissions, and usage counts.
4. Remove `sendMessage` from `ConnectionSlice` — callers use `useChat`'s `sendMessage` instead.
5. CSS/aesthetic: remove unused animations (`slide-right`, `typing`, `pulse-slow`, `spin-slow`) and apply HUD token updates to `ai-elements`.
6. Replace `ToolCallDisplay` (from the legacy `session/` folder) with `ToolInputDisplay` (from `sdk/`) in `PermissionRequest.tsx`.

**Equivalence constraints:**

1. **Input/Output Contract**
   - Same inputs → same outputs for all surviving public functions.
   - Return types unchanged.
   - Same exceptions thrown (no new throw sites).

2. **Side Effect Contract**
   - WebSocket message routing: same external effects (streaming state, permissions, usage, unread count).
   - IndexedDB: message cleanup on session delete must still happen.
   - `incrementUnread` must fire under the same conditions as before.

3. **Error Contract**
   - Same error conditions for WebSocket handlers (no new silenced errors).

4. **Performance Contract**
   - No new synchronous → async changes on critical paths.
   - No N+1 queries introduced.

5. **API Contract**
   - `handleJsonRpcMessage`, `handleSdkWebSocketMessage`, `handlePiWebSocketMessage` — same signatures.
   - `removeSession` — same behavior (cleans DB, clears connections and permissions).

**Allowed changes:**
- Internal message-building state (`sdkStreamingState`, `piStreamingState` writes) removed — messages now rendered by `useChat`.
- `flushPersist` / `debouncedPersist` calls removed from handlers — `useChat`'s `usePersistedUIMessages` handles persistence.
- `WorkspaceLegacy` code path fully removed.
- CSS animation tokens removed for unused keyframes.
- Tool display component swapped (`ToolCallDisplay` → `ToolInputDisplay`).

---

## 1) Executive Summary

**Safety Assessment:** MOSTLY_SAFE

**Rationale:**
The bulk of the deletion is cleanly scoped — the legacy message-building code in the three WS handlers was the "old path" that only ran when `USE_CHAT_TRANSPORT` was false. With that flag always `true` (and now deleted), those code paths were already dead. The store type contract change (`MessageSlice` removal) is a breaking internal change that all call sites were already migrated off before this commit. However, three specific issues deserve attention: (1) `piStreamingState` and `sdkStreamingState` still exist in their respective slices as declared state but are never written to or read from after this commit — they are now dead state that bloats the store shape; (2) the `removeSession` implementation no longer explicitly deletes the `messages` in-memory state within the same Zustand `set()` call, relying instead on IndexedDB cleanup only — this is safe because `messages` was removed from the store type, but the `piStreamingState`/`sdkStreamingState` for the deleted session are also never cleaned up; (3) the `ToolCallDisplay` → `ToolInputDisplay` prop rename has a subtle semantic difference when `toolCall.name` is `undefined`.

**Critical Drift (BLOCKER/HIGH):**
- None identified. All BLOCKER-class invariants are preserved.

**HIGH findings:**
1. **RS-1**: `ToolCallDisplay.name` was `optional (string | undefined)` → `ToolInputDisplay.name` is `required (string)` — the call site now passes `toolCall.name ?? 'Unknown Tool'`, which correctly handles `undefined`. This is safe, but the component now renders "Unknown Tool" where before it would have rendered `undefined`-safe fallback behavior inside `ToolCallDisplay`. This is a **semantic behavior change**, not a bug, but warrants confirmation.

**Overall Assessment:**
- Behavior Equivalence: Mostly Preserved (dead code removed, live paths unchanged)
- Public API Safety: Safe (all surviving public functions have unchanged signatures)
- Side Effect Safety: Mostly Preserved (one nuance: unread count increment path changed in `pi-message-handler` `done` event)
- Error Handling Safety: Preserved
- Performance Safety: Preserved

---

## 2) Findings Table

| ID | Severity | Confidence | Category | File:Line | Semantic Drift |
|----|----------|------------|----------|-----------|----------------|
| RS-1 | MED | High | API Contract / Data Transformation | `PermissionRequest.tsx:155` | `ToolCallDisplay` (name optional) → `ToolInputDisplay` (name required, fallback added at call site) |
| RS-2 | MED | High | Side Effects | `pi-message-handler.ts:38` | `incrementUnread` now uses `sessionId !== get().activeSessionId` (re-read) instead of pre-computed `isActive` |
| RS-3 | MED | Med | Dead State | `pi-slice.ts:43`, `sdk-slice.ts:53` | `piStreamingState` and `sdkStreamingState` are declared but never written after this commit |
| RS-4 | MED | High | Side Effects (session delete) | `session-slice.ts:85-94` | `removeSession` no longer cleans the `messages` in-memory key — safe because the field is gone from the store type, but `piStreamingState[sessionId]` and `sdkStreamingState[sessionId]` are also never cleaned on session delete |
| RS-5 | LOW | High | Control Flow | `sdk-message-handler.ts:44-50` | `prompt_complete` and `prompt_error` were handled by a combined `case` fall-through; now split into separate cases — behavior equivalent |
| RS-6 | LOW | Med | Side Effects | `jsonrpc-message-handler.ts:33-38` | `handlePermissionRequest` private function inlined — behavior equivalent but `get().activeSessionId` is now re-read on the inlined path vs. the pre-computed `isActive` snapshot |
| RS-7 | NIT | High | Default Values | `sdk-message-handler.ts (deleted)` | `console.log` for unknown message types removed in DEV builds — not behavior drift, pure cleanup |

**Findings Summary:**
- BLOCKER: 0
- HIGH: 0
- MED: 4
- LOW: 2
- NIT: 1

**Category Breakdown:**
- Default Values: 0
- Control Flow: 1 (RS-5)
- Error Handling: 0
- Side Effects: 3 (RS-2, RS-4, RS-6)
- API Contract: 1 (RS-1)
- Performance: 0
- Ordering: 0
- Data Transformation: 1 (RS-1, overlapping)
- Dead State: 1 (RS-3)

---

## 3) Findings (Detailed)

---

### RS-1: ToolCallDisplay → ToolInputDisplay Prop Rename in PermissionRequest [MED]

**Location:** `web/src/components/chat/PermissionRequest.tsx:152-159`

**Category:** API Contract / Data Transformation

**Equivalence Violated:**
- The old component accepted `name?: string` (optional) and `rawInput: Record<string, unknown>`.
- The new component accepts `name: string` (required) and `input: unknown`.
- The call site added `?? 'Unknown Tool'` at the prop boundary to handle the optional case.

**Before:**
```tsx
// PermissionRequest.tsx (old)
<ToolCallDisplay
  name={toolCall.name}            // name?: string — undefined safe
  rawInput={toolCall.rawInput as Record<string, unknown>}
/>

// ToolCallDisplay interface (old — session/ToolCallDisplay.tsx)
interface ToolCallDisplayProps {
  name?: string
  rawInput: Record<string, unknown>
}
// When name is undefined, switch(undefined) → falls through to default case (JSON dump)
```

**After:**
```tsx
// PermissionRequest.tsx (new)
<ToolInputDisplay
  name={toolCall.name ?? 'Unknown Tool'}  // ← fallback added at call site
  input={toolCall.rawInput}               // input: unknown — wider type
/>

// ToolInputDisplay interface (new — sdk/ToolInputDisplay.tsx)
interface ToolInputDisplayProps {
  name: string     // required
  input: unknown   // rawInput coerced internally: (typeof input === 'object' && ...) → Record
}
```

**Semantic Drift:**

Input that exposes drift:
```tsx
// toolCall.name === undefined

// Old behavior:
// switch(undefined) → default branch → JSON dump of rawInput
// Renders the raw JSON of the tool call input

// New behavior:
// name becomes 'Unknown Tool'
// switch('Unknown Tool') → default branch → JSON dump of input
// Also renders the raw JSON, but the label says "Unknown Tool"
```

**Impact:**
- Rendering behavior is functionally equivalent (both fall through to the `DefaultDisplay` JSON dump).
- The visible label "Unknown Tool" is a **minor user-facing behavior change** compared to no name being shown (or the old component's undefined-name rendering, which did not use the name in the display at all — `ToolCallDisplay` only used `name` in the `switch`, never rendered it as text).
- The `input: unknown` → internal `rawInput` coercion in `ToolInputDisplay` (`(typeof input === 'object' && input !== null ? input : {})`) means that if `toolCall.rawInput` is a primitive (string, number), the old code would have passed it as `rawInput: Record<string, unknown>` (TypeScript cast, runtime any), while the new code safely falls back to `{}`. This is a **safer behavior**.

**Severity:** MED
**Confidence:** High
**Category:** API Contract

**Fix:** No fix needed — the behavior change is intentional and safer. Consider a code comment noting the `'Unknown Tool'` fallback is intentional.

---

### RS-2: `incrementUnread` on `done` Event — `isActive` vs. Re-Read [MED]

**Location:** `web/src/stores/sessions/pi-message-handler.ts:36-40`

**Category:** Side Effects

**Equivalence Violated:**
- Old code pre-computed `isActive = sessionId === activeSessionId` at the top of the handler.
- New code calls `sessionId !== get().activeSessionId` inline at the point of use.
- These are semantically equivalent **unless** `activeSessionId` changes during the execution of a single message handler call — which is theoretically possible if another action dispatches concurrently, but practically impossible in the synchronous Zustand dispatch model.

**Before:**
```typescript
// pi-message-handler.ts (old)
const { activeSessionId } = get()   // ← snapshot at handler entry
const isActive = sessionId === activeSessionId

// ...inside message_update / done:
} else if (msgEvent.type === 'done') {
  get().setStreaming(sessionId, false)
  flushPersist(sessionId, get().messages[sessionId] || [])
  set((state) => ({ piStreamingState: { ...state.piStreamingState, [sessionId]: null } }))
  if (!isActive) {                  // ← uses snapshot
    get().incrementUnread(sessionId)
  }
}
```

**After:**
```typescript
// pi-message-handler.ts (new)
// isActive removed entirely

} else if (msgEvent.type === 'done') {
  get().setStreaming(sessionId, false)
  if (sessionId !== get().activeSessionId) {   // ← re-reads live state
    get().incrementUnread(sessionId)
  }
}
```

**Semantic Drift:**

Practically equivalent because Zustand dispatches are synchronous and non-concurrent in a browser event loop. The re-read happens in the same synchronous call stack as the handler entry, so `activeSessionId` will not have changed. The behavior diverges only in a theoretical concurrent dispatch scenario.

**Impact:**
- No real-world behavior difference.
- The new approach is slightly more correct in that it reads the most current state at the point of the check rather than a stale snapshot from handler entry.

**Severity:** MED (pattern inconsistency)
**Confidence:** Med
**Category:** Side Effects

**Fix:** No fix required. Recommend noting this is intentional for clarity.

---

### RS-3: Dead State — `piStreamingState` and `sdkStreamingState` Never Written [MED]

**Location:**
- `web/src/stores/sessions/pi-slice.ts:43,84`
- `web/src/stores/sessions/sdk-slice.ts:53,82`

**Category:** Dead State

**Equivalence Violated:**
- Old: `piStreamingState` and `sdkStreamingState` were written by the respective message handlers to track which message ID was being streamed, and used to locate and update the correct `Message` in the `messages` array.
- New: All writes to `piStreamingState` and `sdkStreamingState` were removed from `pi-message-handler.ts` and `sdk-message-handler.ts`. The declarations remain in `pi-slice.ts` and `sdk-slice.ts`.

**Before:**
```typescript
// pi-message-handler.ts (old)
set((state) => ({
  piStreamingState: {
    ...state.piStreamingState,
    [sessionId]: {
      messageId: msgId,
      contentBlocks: [...],
      currentBlockIndex: 0,
      isStreaming: true,
    },
  },
}))
```

**After:**
```typescript
// pi-message-handler.ts (new) — no writes to piStreamingState at all
// pi-slice.ts still declares it:
piStreamingState: {} as Record<string, PiStreamingState | null>
```

**Semantic Drift:**

Input that exposes drift:
```typescript
// Nothing writes to piStreamingState[sessionId] after Phase 8
// The field always stays {}
// Any consumer reading piStreamingState[sessionId] gets undefined
```

**Impact:**
- `piStreamingState` and `sdkStreamingState` are now permanently empty maps that inflate the store type and initial state.
- Any future code that tries to read these (e.g., a new component that hadn't been updated) would get `undefined` instead of the streaming state, causing silent failure.
- These fields and their associated types (`PiStreamingState`, `SdkStreamingState`) should be removed in a follow-up.
- The test file `sessions.test.ts` still sets `piStreamingState` and `sdkStreamingState` in test state, which is also dead (lines 147, 196, 203) — but does not test any new behavior that depends on them.

**Severity:** MED
**Confidence:** High
**Category:** Dead State

**Fix:** Remove `piStreamingState` and `sdkStreamingState` from `pi-slice.ts` and `sdk-slice.ts` in the same change or a follow-up. Also update the test file to remove references. These are not breaking changes since nothing reads them after Phase 8.

---

### RS-4: `removeSession` No Longer Cleans `piStreamingState`/`sdkStreamingState` [MED]

**Location:** `web/src/stores/sessions/session-slice.ts:79-97`

**Category:** Side Effects

**Equivalence Violated:**
- Old `removeSession` cleaned `messages[sessionId]` in the same Zustand `set()` call as removing the session from the sessions array.
- New `removeSession` does not clean `messages[sessionId]` (field no longer exists in the store).
- Neither old nor new code cleans `piStreamingState[sessionId]` or `sdkStreamingState[sessionId]` during session removal.

**Before:**
```typescript
// session-slice.ts (old)
set((state) => {
  const messages = { ...state.messages }
  delete messages[sessionId]

  return {
    sessions: state.sessions.filter((s) => s.id !== sessionId),
    messages,               // ← messages cleaned in same atomic set()
    activeSessionId: state.activeSessionId === sessionId ? null : state.activeSessionId,
  }
})
```

**After:**
```typescript
// session-slice.ts (new)
set((state) => ({
  sessions: state.sessions.filter((s) => s.id !== sessionId),
  activeSessionId: state.activeSessionId === sessionId ? null : state.activeSessionId,
  // ← No messages cleanup (field removed from store type)
  // ← No piStreamingState/sdkStreamingState cleanup
}))
```

**Semantic Drift:**

Since `messages` no longer exists in the store type, its absence in the `set()` is correct. However, `piStreamingState` and `sdkStreamingState` still exist in the store type and are initialized as `{}` for all sessions. If a session is deleted mid-stream (edge case), the streaming state for that session would persist in the store indefinitely (as a stale `null` or in-progress entry).

In practice, these are always `{}` after Phase 8 (RS-3), so the stale entry would be `{}[deletedSessionId] === undefined` — harmless.

**Severity:** MED (only relevant if RS-3 is addressed and these fields gain writes again)
**Confidence:** Med
**Category:** Side Effects

**Fix:** When RS-3 is addressed (fields removed), this finding is automatically resolved. If the fields gain writes in the future, add cleanup in `removeSession`.

---

### RS-5: `prompt_complete` / `prompt_error` Case Split [LOW]

**Location:** `web/src/stores/sessions/sdk-message-handler.ts:44-50`

**Category:** Control Flow

**Equivalence Violated:** No violation — analysis shows equivalent behavior.

**Before:**
```typescript
// sdk-message-handler.ts (old)
case 'prompt_complete':
case 'prompt_error': {    // ← fall-through combined case
  get().setStreaming(sessionId, false)
  flushPersist(sessionId, get().messages[sessionId] || [])
  set((state) => ({ sdkStreamingState: { ...state.sdkStreamingState, [sessionId]: null } }))

  if (type === 'prompt_complete') {   // ← differentiation inside
    const result = payload as SessionResult
    get().setSdkUsage(sessionId, result)
  }
  break
}
```

**After:**
```typescript
// sdk-message-handler.ts (new)
case 'prompt_complete': {
  get().setStreaming(sessionId, false)
  get().setSdkUsage(sessionId, payload as SessionResult)
  break
}

case 'prompt_error': {
  get().setStreaming(sessionId, false)
  break
}
```

**Semantic Drift:**

- `flushPersist` removed — correct, `useChat` handles its own persistence.
- `sdkStreamingState` write removed — expected (RS-3).
- `setSdkUsage` still called on `prompt_complete` only — same as before.
- `setStreaming(false)` called in both paths — same as before.

No drift. The split improves readability without changing behavior.

**Severity:** LOW
**Confidence:** High
**Category:** Control Flow

**Fix:** No fix needed.

---

### RS-6: `handlePermissionRequest` Inlined in `jsonrpc-message-handler` [LOW]

**Location:** `web/src/stores/sessions/jsonrpc-message-handler.ts:33-38`

**Category:** Side Effects

**Equivalence Violated:** Practically equivalent; theoretical snapshot vs. live-read difference.

**Before:**
```typescript
// jsonrpc-message-handler.ts (old) — called handlePermissionRequest helper
function handlePermissionRequest(sessionId, params, get) {
  const { toolCallId, toolCall, options } = params
  get().setStreaming(sessionId, false)
  get().addPendingPermission(sessionId, { toolCallId, toolCall, options })

  if (sessionId !== get().activeSessionId) {   // ← re-reads at helper call time
    get().incrementUnread(sessionId)
  }
}
```

**After:**
```typescript
// jsonrpc-message-handler.ts (new) — inlined directly
} else if (msg.method === 'session/request_permission') {
  const params = msg.params as { toolCallId: string; toolCall: unknown; options: unknown[] }
  get().setStreaming(sessionId, false)
  get().addPendingPermission(sessionId, { toolCallId: params.toolCallId, toolCall: params.toolCall, options: params.options })
  if (!isActive) {                              // ← uses top-of-handler snapshot
    get().incrementUnread(sessionId)
  }
```

**Semantic Drift:**

Opposite pattern to RS-2 — old code re-read `activeSessionId` inside the helper; new code uses the pre-computed `isActive` snapshot from the top of the handler. Both are effectively equivalent in practice (same synchronous call stack). The inconsistency between RS-2 and RS-6 (one uses live read, one uses snapshot) is a minor style issue, not a behavior bug.

**Severity:** LOW
**Confidence:** Med
**Category:** Side Effects

**Fix:** No fix needed for correctness. Consider standardizing to one pattern (either always pre-compute `isActive` at handler entry, or always re-read at point of use).

---

### RS-7: DEV `console.log` for Unknown SDK Message Types Removed [NIT]

**Location:** `web/src/stores/sessions/sdk-message-handler.ts` (deleted block)

**Category:** Side Effects (logging)

**Before:**
```typescript
default:
  if (import.meta.env.DEV) {
    console.log('[SDK WS] Unknown message type:', type)
  }
```

**After:**
```typescript
default:
  break
```

**Semantic Drift:**

Logging-only change. DEV-only `console.log` was a debug aid, not a behavior invariant. No callers depend on this output.

**Severity:** NIT
**Confidence:** High
**Category:** Side Effects

**Fix:** No fix needed.

---

## 4) Test Coverage Analysis

### Existing Tests

The `sessions.test.ts` diff shows:
- Removed assertions on `state.messages[sessionId]` and `state.messages` being cleaned up — correct, since `messages` field no longer exists in the store.
- Retained `piStreamingState` and `sdkStreamingState` in test setup state (lines 147, 196, 203) — these are now **stale test state** that sets fields which are never read and never mutated by the code under test. Tests pass but prove nothing about streaming state management.

### Missing Tests

1. **`ToolInputDisplay` with `name = 'Unknown Tool'`**: No test covering the new fallback path in `PermissionRequest`. A test confirming the component renders correctly when `toolCall.name` is `undefined` (and that `'Unknown Tool'` is not visibly rendered as a label) would close the gap.

2. **`removeSession` streaming state cleanup**: No test verifying that `piStreamingState[sessionId]` and `sdkStreamingState[sessionId]` become undefined after `removeSession`. These fields are not currently written, so the test would always pass trivially — but adding it now guards against future regressions when these fields gain writes again.

3. **WS handler isolation**: No tests for `handlePiWebSocketMessage` or `handleSdkWebSocketMessage` after the refactor. The handlers are simpler now (only update streaming flags), making them easier to test. Tests covering:
   - `text_delta` → `setStreaming(true)` called only once (idempotent)
   - `done` → `setStreaming(false)` + `incrementUnread` only when session is inactive
   - `prompt_complete` → `setStreaming(false)` + `setSdkUsage`
   - `request_permission` → `setStreaming(false)` + `addPendingPermission` + `incrementUnread` when inactive

---

## 5) Equivalence Verification

### Public API Surface (Unchanged)

| Function | Signature Before | Signature After | Status |
|---|---|---|---|
| `handleJsonRpcMessage` | `(sessionId, data, get, _set)` | `(sessionId, data, get, _set)` | Preserved |
| `handleSdkWebSocketMessage` | `(sessionId, message, get, set)` | `(sessionId, message, get, _set)` | Preserved (param renamed, not used) |
| `handlePiWebSocketMessage` | `(sessionId, message, get, set)` | `(sessionId, message, get, _set)` | Preserved (param renamed, not used) |
| `removeSession` | `(sessionId) => Promise<void>` | `(sessionId) => Promise<void>` | Preserved |
| `restoreSessions` | `() => Promise<void>` | `() => Promise<void>` | Preserved |

### Removed Public API (Breaking — Intentional)

| Function | Reason |
|---|---|
| `sendMessage(sessionId, content, images?)` | Replaced by `useChat`'s `sendMessage` in `WorkspaceUseChat` |
| `addMessage`, `updateMessage`, `loadMessagesForSession`, `clearMessages` | `MessageSlice` deleted — `useChat` owns message state |
| `addUserMessageOnly` | Same — `MessageSlice` deleted |

All callers of the removed functions were in `WorkspaceLegacy` (also deleted) or in the message handlers (also cleaned up). No surviving code references these.

### IndexedDB Cleanup (Preserved)

`removePersistedSession` still deletes:
- `session:{sessionId}`
- `messages:{sessionId}`
- `ui-messages:{sessionId}`

The `messages:` key deletion is now technically redundant (nothing writes to it in the new path), but it is harmless and correct to keep for cleanup of data written by the old path.

---

## 6) Safety Verdict

**MOSTLY_SAFE — Can proceed.**

No BLOCKER or HIGH severity findings. The refactor correctly removes the legacy message-building code that was already behind a feature flag set to `true` by default. The live code paths (streaming state, permissions, usage, unread counts) are preserved with behavior-equivalent logic.

**Required follow-ups before the next major refactor:**

1. (MED, RS-3) Remove `piStreamingState` and `sdkStreamingState` from `pi-slice.ts` and `sdk-slice.ts` — they are now dead state. Clean up corresponding types and test references.

2. (MED, RS-4) Audit `removeSession` to confirm `piStreamingState` / `sdkStreamingState` cleanup when RS-3 is addressed.

**Optional improvements:**

3. (LOW, RS-2/RS-6) Standardize `isActive` usage — pick one pattern (snapshot at handler entry vs. live re-read at point of use) and apply consistently across all three message handlers.

4. Add WS handler unit tests now that the handlers are simpler and more testable.
