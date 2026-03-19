---
command: /review:correctness
session_slug: phase-4-prompt-input
date: 2026-03-16
scope: diff
target: HEAD~2
paths: web/src/pages/WorkspaceUseChat.tsx, web/src/components/chat/AttachmentsPreview.tsx, web/src/components/chat/index.ts
related:
  session: ../README.md
  plan: ../../docs/plans/phase-4-prompt-input.md
---

# Correctness Review Report

**Reviewed:** diff / HEAD~2 (commits 949b378, 5f2e54d)
**Date:** 2026-03-16
**Reviewer:** Claude Code

---

## 0) Scope, Intent, and Invariants

**What was reviewed:**
- Scope: diff
- Target: HEAD~2 (2 commits — Phase 4: PromptInput migration)
- Files: 3 files, +140 added, -208 removed

**Intended behavior:**
- Replace custom composer (textarea + image attachments + send/stop) with ai-elements `<PromptInput>` component
- Preserve all existing functionality: send, stop, paste images, attach images, file validation, error toasts
- Delegate input state, file handling, paste, and keyboard shortcuts to PromptInput internals
- On send error, preserve user input for retry

**Must-hold invariants:**
1. **Image limits enforced** - Max 5 files, max 10MB each, only jpeg/png/gif/webp accepted
   - Example: "6th image must be rejected with error toast"
2. **Send only when connected** - Messages cannot be sent when WebSocket is disconnected
   - Example: "Disconnected state disables textarea and submit"
3. **Stop always available during streaming** - User can always abort a running request
   - Example: "Stop button clickable while status is 'submitted' or 'streaming'"
4. **Error recovery preserves input** - On send failure, user's text and attachments are not lost
   - Example: "Network error on send -> text remains in textarea"
5. **Permission flow intact** - `handleAddUserMessage` still correctly appends user messages and persists before WS response

**Key constraints:**
- No `PromptInputProvider` used (non-provider / self-managed mode)
- `IMAGE_LIMITS` remains single source of truth for validation constants
- `useChat` provides `sendMessage`, `status`, `stop` — transport is `ApertureWebSocketTransport`

**Known edge cases:**
- Send failure while disconnected
- Stop button during 'submitted' (pre-stream) state
- Pasting non-image content (should pass through to textarea)
- Connection drops mid-stream

---

## 1) Executive Summary

**Merge Recommendation:** APPROVE_WITH_COMMENTS

**Rationale:**
The migration is clean and removes ~208 lines of manual composer code in favor of the well-structured PromptInput component. The core functionality is preserved. Two medium-severity issues were found: the stop button can be disabled during streaming if the connection drops (preventing abort), and text input is not preserved on send error in non-provider mode despite the JSDoc claiming otherwise. One low-severity issue around the `accept` prop specificity vs the plan.

**Critical Issues (BLOCKER/HIGH):**
None.

**Overall Assessment:**
- Correctness: Good
- Error Handling: Adequate
- Edge Case Coverage: Good
- Invariant Safety: Mostly Safe

---

## 2) Findings Table

| ID | Severity | Confidence | Category | File:Line | Failure Scenario |
|----|----------|------------|----------|-----------|------------------|
| CR-1 | MED | High | State Transition | `WorkspaceUseChat.tsx:267` | Disconnect during streaming -> stop button disabled |
| CR-2 | MED | High | Error Handling | `WorkspaceUseChat.tsx:147-150` + `prompt-input.tsx:858` | Send error -> text lost despite JSDoc claim |
| CR-3 | LOW | Med | API Contract | `WorkspaceUseChat.tsx:242` | `accept` uses specific MIME types, not `image/*` |
| CR-4 | NIT | Low | Dead Code | `WorkspaceUseChat.tsx:183` | `isStreaming` computed but only used for Badge |

**Findings Summary:**
- BLOCKER: 0
- HIGH: 0
- MED: 2
- LOW: 1
- NIT: 1

---

## 3) Findings (Detailed)

### CR-1: Stop Button Disabled During Streaming When Disconnected [MED]

**Location:** `web/src/pages/WorkspaceUseChat.tsx:267-270`

**Invariant Violated:**
- "Stop always available during streaming" - User must be able to abort a running request regardless of connection state.

**Evidence:**
```typescript
// Lines 267-270
<PromptInputSubmit
  disabled={!isConnected}
  onStop={stop}
  status={status}
/>
```

`PromptInputSubmit` spreads `...props` (including `disabled`) onto `InputGroupButton`. When `isGenerating` is true and `onStop` is provided, the button type becomes `"button"` (not submit), but `disabled={true}` still prevents the click handler from firing.

**Failure Scenario:**
```
1. User sends a message while connected (status = 'submitted' or 'streaming')
2. WebSocket disconnects mid-stream (connection.status becomes 'reconnecting')
3. isConnected becomes false, disabled becomes true
4. Stop button is visually disabled — user cannot abort the request
5. UI appears stuck with no way to cancel
```

**Impact:**
- User cannot stop a streaming response if connection drops
- UI appears hung with no recovery path other than page reload

**Severity:** MED
**Confidence:** High
**Category:** State Transition

**Smallest Fix:**
Compute `disabled` to allow stop during streaming:

```diff
--- a/web/src/pages/WorkspaceUseChat.tsx
+++ b/web/src/pages/WorkspaceUseChat.tsx
@@ -265,7 +265,7 @@
               </PromptInputTools>
               <PromptInputSubmit
-                disabled={!isConnected}
+                disabled={!isConnected && !isStreaming}
                 onStop={stop}
                 status={status}
               />
```

**Test case:**
```
Manual: Start streaming, disconnect network, verify stop button remains clickable.
```

---

### CR-2: Text Input Lost on Send Error (Non-Provider Mode) [MED]

**Location:** `web/src/pages/WorkspaceUseChat.tsx:147-150` (JSDoc claim) + `web/src/components/ai-elements/prompt-input.tsx:856-860` (actual behavior)

**Invariant Violated:**
- "Error recovery preserves input" - The JSDoc at line 147-150 states: "If this throws, PromptInput preserves the user's input for retry." This is only partially true.

**Evidence:**
```typescript
// prompt-input.tsx lines 856-860 (inside handleSubmit)
// Reset form immediately after capturing text to avoid race condition
// where user input during async blob conversion would be lost
if (!usingProvider) {
  form.reset();  // <-- Clears textarea BEFORE onSubmit is called
}
```

```typescript
// prompt-input.tsx lines 882-900
try {
  await result;
  clear();           // <-- Clears attachments on success
  // ...
} catch {
  // Don't clear on error - user may want to retry
  // But text is ALREADY gone from form.reset() above
}
```

In non-provider mode (which is how WorkspaceUseChat uses it), `form.reset()` is called at line 858 before `onSubmit` is invoked. If `onSubmit` throws (as the `handleSubmit` in WorkspaceUseChat does on error), the attachments are preserved but the **text is already cleared** by `form.reset()`.

**Failure Scenario:**
```
1. User types a long message and attaches 2 images
2. User presses Enter to send
3. form.reset() clears the textarea text
4. Blob URLs are converted to data URLs
5. handleSubmit throws (e.g., connection check fails or sendMessage rejects)
6. Attachments are preserved (clear() was not called)
7. Text is LOST — form was already reset
8. User must retype the entire message
```

**Impact:**
- User loses typed text on send failure
- Attachments are preserved (inconsistent behavior)
- JSDoc is misleading — creates false confidence

**Severity:** MED
**Confidence:** High (verified by reading PromptInput source)
**Category:** Error Handling

**Smallest Fix:**
Update the JSDoc to accurately describe the behavior, and consider switching to controlled mode (PromptInputProvider) if text preservation is required:

```diff
--- a/web/src/pages/WorkspaceUseChat.tsx
+++ b/web/src/pages/WorkspaceUseChat.tsx
@@ -147,3 +147,3 @@
   /**
-   * PromptInput submit handler — receives { text, files } with files already
-   * converted from blob URLs to data URLs by PromptInput's internal handler.
-   * If this throws, PromptInput preserves the user's input for retry.
+   * PromptInput submit handler. In non-provider mode, PromptInput clears the
+   * textarea before calling onSubmit (to avoid race conditions). Attachments
+   * are preserved on error, but text is not recoverable.
    */
```

**Alternative (proper fix in PromptInput):**
Move `form.reset()` into the success path instead of before `onSubmit`. This would be a change to the ai-elements component.

---

### CR-3: Accept Prop Uses Specific MIME Types Instead of Wildcard [LOW]

**Location:** `web/src/pages/WorkspaceUseChat.tsx:242`

**Invariant Violated:**
- None strictly, but deviates from the Phase 4 plan which specifies `accept="image/*"`

**Evidence:**
```typescript
// Line 242
accept={IMAGE_LIMITS.ALLOWED_MIME_TYPES.join(',')}
// Resolves to: "image/jpeg,image/png,image/gif,image/webp"
```

The plan at `docs/plans/phase-4-prompt-input.md:78` specifies:
```tsx
accept="image/*"
```

**Failure Scenario:**
```
Using specific MIME types means:
- The file picker dialog filters more strictly (good)
- But drag-and-drop and paste go through PromptInput's matchesAccept(),
  which also validates against these specific types (correct behavior)
- A user cannot drop image/svg+xml, image/bmp, etc. — which is intentional
  since the backend only supports jpeg/png/gif/webp
```

**Impact:**
- This is actually MORE correct than the plan — the plan's `image/*` would accept SVG, BMP, TIFF, etc. that the backend would reject
- No functional issue; the implementation is better than the plan

**Severity:** LOW (positive deviation from plan)
**Confidence:** Med
**Category:** API Contract

**Fix:** None needed. Consider updating the plan to match implementation.

---

### CR-4: `isStreaming` Variable Only Used for Badge [NIT]

**Location:** `web/src/pages/WorkspaceUseChat.tsx:183`

**Evidence:**
```typescript
const isStreaming = status === 'streaming' || status === 'submitted'
```

Before the refactor, `isStreaming` was used for both the streaming badge AND the send/stop button toggle. After the refactor, the button logic is handled by `PromptInputSubmit` using the `status` prop directly. `isStreaming` is now only used at line 197 for the "Streaming..." badge.

**Impact:**
- No functional issue
- Minor readability — the name `isStreaming` when `status === 'submitted'` is slightly misleading (it's "thinking", not streaming yet)

**Severity:** NIT
**Confidence:** Low
**Category:** Code Clarity

**Fix:** Optional — rename to `isBusy` or inline the check:
```diff
-  const isStreaming = status === 'streaming' || status === 'submitted'
   ...
-  {isStreaming && (
+  {(status === 'streaming' || status === 'submitted') && (
```

---

## 4) Invariants Coverage Analysis

| Invariant | Enforcement | Gaps |
|-----------|-------------|------|
| Image limits (count, size, type) | Yes | Delegated to PromptInput's `maxFiles`, `maxFileSize`, `accept` props |
| Send only when connected | Yes | `disabled={!isConnected}` on textarea + submit |
| Stop always available during streaming | Partial | CR-1: Stop disabled when disconnected during stream |
| Error recovery preserves input | Partial | CR-2: Text lost, attachments preserved |
| Permission flow (`handleAddUserMessage`) | Yes | Unchanged from pre-refactor, uses functional updater |
| Blob URL cleanup on unmount | Yes | PromptInput handles via `useEffect` cleanup |

**Recommendations:**
1. Fix CR-1 stop button disabled state
2. Document or fix CR-2 text preservation limitation

---

## 5) Edge Cases Coverage

| Edge Case | Handled? | Evidence |
|-----------|----------|----------|
| Empty message (no text, no files) | Yes | PromptInput captures text from FormData; `handleSubmit` checks connection but doesn't guard empty — however PromptInput's textarea `name="message"` means empty string is sent |
| Max file count exceeded | Yes | PromptInput's `maxFiles` prop enforced in `addLocal` |
| File too large | Yes | PromptInput's `maxFileSize` prop enforced in `addLocal` |
| Wrong file type | Yes | PromptInput's `accept` prop enforced in `matchesAccept` |
| Paste non-image | Yes | PromptInput's `handlePaste` only intercepts `kind === "file"` items |
| Connection drop mid-stream | Partial | CR-1: Stop button disabled |
| Send failure | Partial | CR-2: Text lost, attachments preserved |
| Blob URL conversion failure | Yes | PromptInput falls back to original blob URL |
| Backspace removes last attachment | Yes | PromptInput's textarea handles this |

**Recommendations:**
1. Consider guarding against empty text + empty files in `handleSubmit`
2. Fix stop button for disconnect scenario

---

## 6) Error Handling Assessment

**Error Handling Patterns Found:**
- `handleSubmit` catches and re-throws errors (good for PromptInput's error recovery contract)
- `handleFileError` surfaces PromptInput validation errors via toast (good)
- `onError` on `useChat` logs chat-level errors (adequate)

**Good Practices:**
- Connection check before send with descriptive toast
- Error re-throw to trigger PromptInput's "don't clear" behavior
- `onFinish` persists messages after completion

**Missing:**
- Empty message guard in `handleSubmit` (PromptInput will submit empty text)
- Text preservation on error (CR-2)

---

## 7) Concurrency & Race Conditions

**Shared State:**
- `messages` array: Managed by useChat, functional updater in `handleAddUserMessage` (safe)
- `persistMessages`: Called from both `useEffect` and `handleAddUserMessage` — potential double-write but not harmful (idempotent persistence)

**Async Patterns:**
- `handleSubmit` is async, PromptInput awaits it correctly
- Blob URL conversion happens before `onSubmit` — no race between user input and conversion (form.reset() prevents it, though at cost of CR-2)

**No new concurrency issues introduced by this change.**

---

## 8) Test Coverage Gaps

Based on findings, missing tests:

**Critical (should add):**
- [ ] Test stop button remains enabled during streaming when disconnected (CR-1)
- [ ] Test text preservation on send error (CR-2 — or document as known limitation)

**Important (nice to have):**
- [ ] Test empty message submission behavior
- [ ] Test file error toast callback fires on rejected files
- [ ] Test connection status text updates correctly

---

## 9) Recommendations

### Should Fix (MED)

1. **CR-1**: Fix stop button disabled during disconnect + streaming
   - Action: Change `disabled={!isConnected}` to `disabled={!isConnected && !isStreaming}`
   - Rationale: Users must be able to abort stuck requests
   - Estimated effort: 2 minutes

2. **CR-2**: Fix misleading JSDoc (at minimum)
   - Action: Update JSDoc to accurately describe text-loss behavior
   - Rationale: Prevents false confidence in error recovery
   - Estimated effort: 2 minutes
   - Optional: Move `form.reset()` in PromptInput to success path (larger change)

### Consider (LOW/NIT)

3. **CR-3**: No action needed (implementation is better than plan)

4. **CR-4**: Optional cleanup of `isStreaming` variable

### Overall Strategy

**If time is limited:**
- Fix CR-1 (2-minute patch, prevents stuck UI)
- Update JSDoc for CR-2 (2-minute patch)

**If time allows:**
- Fix both CR-1 and CR-2
- Add empty-message guard to `handleSubmit`
- Consider switching to PromptInputProvider for proper controlled text recovery

---

## 10) False Positives & Disagreements Welcome

**Where I might be wrong:**

1. **CR-1 (Stop disabled)**: If `useChat.stop()` is a no-op when disconnected (because the WebSocket is already closed), disabling the button may be intentional UX. However, the user still needs a way to reset the streaming state.

2. **CR-2 (Text lost)**: The `form.reset()` in PromptInput exists to prevent a real race condition (user types during async blob conversion). The text loss on error may be an acceptable tradeoff. If sends rarely fail, this is low-impact in practice.

3. **CR-3 (Accept specificity)**: The plan may have been intentionally loose with `image/*` for simplicity. The specific MIME types are objectively better.

**How to override my findings:**
- Show that `useChat.stop()` handles the disconnect case internally
- Show that the race condition in PromptInput cannot be solved without `form.reset()`
- Confirm empty-message sends are harmless (backend rejects gracefully)

I'm optimizing for correctness. If there's a good reason the code is safe, let's discuss!

---

*Review completed: 2026-03-16*
*Session: [phase-4-prompt-input](../README.md)*
