---
command: /review:correctness
session_slug: phase-5-permissions-confirmation
date: 2026-03-17
scope: diff
target: HEAD~1
paths: web/src/components/chat/PermissionRequest.tsx
related:
  plan: ../../docs/plans/phase-5-permissions-confirmation.md
---

# Correctness Review Report

**Reviewed:** diff / HEAD~1 (commit d83cd91 — `refactor(web): replace PermissionRequest Card with ai-elements Confirmation`)
**Date:** 2026-03-17
**Reviewer:** Claude Code

---

## 0) Scope, Intent, and Invariants

**What was reviewed:**
- Scope: diff (single commit)
- Target: HEAD~1
- Files: 1 file, +97 lines added, -91 lines removed
- Focus: `web/src/components/chat/PermissionRequest.tsx`

**Intended behavior (from plan + code):**
- Replace the custom `Card` + `Button` layout in the normal-permission path with the ai-elements `<Confirmation>` compound component for consistent styling and built-in `role="alert"` accessibility.
- `AskUserQuestion` path keeps its custom `Card` wrapper (no ai-elements equivalent exists for multi-question tabbed UI).
- Component always renders in `"approval-requested"` state. `ConfirmationAccepted`/`ConfirmationRejected` slots are intentionally omitted because the component unmounts when the user responds (store removes it).
- The new file is used by `WorkspaceUseChat.tsx`. `Workspace.tsx` still uses its own inline `PermissionRequest`.

**Must-hold invariants:**
1. **Every permission response reaches the backend** — user clicking any button must result in `onRespond` firing.
2. **One deny path** — the UI must not offer duplicate deny buttons (confusing; semantically equivalent).
3. **AskUserQuestion: allowOption must exist before submit fires** — if no allow option is present, submitting answers must fail loudly, not silently.
4. **`Confirmation` component renders visible UI** — it null-renders when `approval` is falsy or state is `input-streaming`/`input-available`. The component must not silently disappear.
5. **`onAddUserMessage` resolves before `onRespond` fires** — required to ensure message persistence precedes the WebSocket permission response (RS-1 ordering constraint carried forward from prior work).

**Key constraints:**
- Backend always includes a `{ optionId: 'deny', name: 'Deny', kind: 'deny' }` entry in `options` (see `sdk-session.ts:374`).
- `sendPermissionResponse` (store) takes `(sessionId, toolCallId, optionId, answers?)` — the new component wraps this correctly at the callsite in `WorkspaceUseChat.tsx`.
- `PermissionOption.kind` is a plain `string`, not a union — `kind?.includes('allow')` is the established detection pattern.

**Known edge cases:**
- No `allowOption` when processing `AskUserQuestion` (options array empty or no 'allow' kind).
- `options` array is empty entirely (no backend options at all).
- `toolCall.rawInput` is null/undefined (normal permission without tool details).

---

## 1) Executive Summary

**Merge Recommendation:** REQUEST_CHANGES

**Rationale:**
Two correctness issues require attention before this lands in production. The most impactful is a **duplicate "Decline" button** — the backend already sends a `Deny` option in every `options` array, and the new component appends a hardcoded `Decline` action on top of it, giving users two deny choices on every normal permission. The second is a **silent no-op** when `AskUserQuestion` has no allow option: the submit handler returns without informing the user, leaving the UI in a stuck state. Both are observable in the happy path.

**Critical Issues (BLOCKER/HIGH):**
1. **CR-1**: Duplicate Deny buttons — "Deny" from backend options + hardcoded "Decline" always both rendered.
2. **CR-2**: Silent no-op on AskUserQuestion when `allowOption` is undefined — user clicks submit, nothing happens, no error.

**Overall Assessment:**
- Correctness: Concerning
- Error Handling: Missing (CR-2 silent failure)
- Edge Case Coverage: Incomplete
- Invariant Safety: Vulnerable (CR-1 breaks UI contract; CR-2 breaks submit invariant)

---

## 2) Findings Table

| ID | Severity | Confidence | Category | File:Line | Failure Scenario |
|----|----------|------------|----------|-----------|------------------|
| CR-1 | HIGH | High | State / UI Contract | `PermissionRequest.tsx:155-160` | Backend `Deny` option + hardcoded `Decline` → two deny buttons on every normal permission |
| CR-2 | HIGH | High | Error Handling | `PermissionRequest.tsx:97-98` | `allowOption` undefined → submit silently no-ops, UI stuck with no feedback |
| CR-3 | MED | High | Boundary Condition | `PermissionRequest.tsx:119-124` | `options` empty array → `ConfirmationActions` renders empty div with no actions |
| CR-4 | LOW | Med | API Contract | `PermissionRequest.tsx:136` | `as Record<string, unknown>` cast without validation — consistent with prior code but unguarded |
| CR-5 | NIT | High | Dead prop | `PermissionRequest.tsx:118` | `approval={{ id: permission.toolCallId }}` — `Confirmation` only uses this prop to gate null-render; `approved` is never set so `ConfirmationAccepted`/`ConfirmationRejected` slots are permanently dead (by design, but undocumented) |

**Findings Summary:**
- BLOCKER: 0
- HIGH: 2
- MED: 1
- LOW: 1
- NIT: 1

---

## 3) Findings (Detailed)

### CR-1: Duplicate Deny/Decline Buttons [HIGH]

**Location:** `web/src/components/chat/PermissionRequest.tsx:145-161`

**Invariant Violated:**
- "One deny path" — each semantically distinct action must appear exactly once.

**Evidence:**
```tsx
// Lines 145-161
<ConfirmationActions className="self-start">
  {options.map((option) => (
    <ConfirmationAction
      key={option.optionId}
      onClick={() => onRespond(permission.toolCallId, option.optionId)}
      variant={option.kind?.includes('allow') ? 'default' : 'outline'}
    >
      {option.name}
    </ConfirmationAction>
  ))}
  {/* ❌ Hardcoded Decline always appended */}
  <ConfirmationAction
    onClick={() => onRespond(permission.toolCallId, null)}
    variant="ghost"
  >
    Decline
  </ConfirmationAction>
</ConfirmationActions>
```

Backend default options (`sdk-session.ts:371-374`):
```typescript
const defaultOptions: PermissionOption[] = [
  { optionId: 'allow',        name: 'Allow',        kind: 'allow' },
  { optionId: 'allow_always', name: 'Always Allow', kind: 'allow_always' },
  { optionId: 'deny',         name: 'Deny',         kind: 'deny' },   // ← always sent
];
```

**Failure Scenario:**
```
Rendered buttons: [Allow] [Always Allow] [Deny] [Decline]
                                          ^^^^   ^^^^^^^
                                          from   hardcoded
                                          backend
```
Both "Deny" (optionId `'deny'`) and "Decline" (sends `null`) result in denial, but via different code paths. The `null` path in `sendPermissionResponse` triggers `behavior: 'deny'` in the backend (see `sdk-session.ts:1244-1250`) — functionally equivalent, but visually duplicated and semantically ambiguous.

**Impact:**
- User-visible: four buttons instead of three on every normal permission.
- UX confusion: two deny options with different labels.
- Observed in: every SDK permission request.

**Severity:** HIGH
**Confidence:** High
**Category:** State / UI Contract

**Smallest Fix:**
Remove the hardcoded `Decline` button. The backend's `Deny` option covers this case:

```diff
--- a/web/src/components/chat/PermissionRequest.tsx
+++ b/web/src/components/chat/PermissionRequest.tsx
@@ -145,13 +145,6 @@
         <ConfirmationActions className="self-start">
           {options.map((option) => (
             <ConfirmationAction
               key={option.optionId}
               onClick={() => onRespond(permission.toolCallId, option.optionId)}
               variant={option.kind?.includes('allow') ? 'default' : 'outline'}
             >
               {option.name}
             </ConfirmationAction>
           ))}
-          <ConfirmationAction
-            onClick={() => onRespond(permission.toolCallId, null)}
-            variant="ghost"
-          >
-            Decline
-          </ConfirmationAction>
         </ConfirmationActions>
```

**Alternative (fallback only):**
If there is a scenario where the backend sends no deny option (edge case), add a fallback only when no `deny`-kind option exists:
```tsx
{!options.some((o) => !o.kind?.includes('allow')) && (
  <ConfirmationAction
    onClick={() => onRespond(permission.toolCallId, null)}
    variant="ghost"
  >
    Decline
  </ConfirmationAction>
)}
```

---

### CR-2: Silent No-Op When AskUserQuestion Has No Allow Option [HIGH]

**Location:** `web/src/components/chat/PermissionRequest.tsx:96-105`

**Invariant Violated:**
- "AskUserQuestion: allowOption must exist before submit fires" — if submit silently no-ops, the UI is stuck and the user has no recovery path.

**Evidence:**
```tsx
// Lines 96-105
onSubmit={async (answers) => {
  if (!allowOption) {
    return   // ❌ Silent return — no error, no log, UI stuck
  }
  const answerText = Object.entries(answers)
    .map(([header, value]) => `${header}: ${value}`)
    .join('\n')
  await onAddUserMessage(`My answers:\n${answerText}`)
  onRespond(permission.toolCallId, allowOption.optionId, answers)
}}
```

**Failure Scenario:**
```
State: Backend sends AskUserQuestion with options: [] (empty, malformed event)
User: Fills out all questions, clicks Submit
Result: onSubmit fires, allowOption is undefined, returns early.
        Permission is never resolved. Agent hangs waiting for a response.
        User sees no error. UI shows same form with no feedback.
```

**Impact:**
- Session hangs permanently — no way to unblock without page refresh.
- No user-visible error or indication of failure.
- Zero observability (no log, no error boundary trigger).

**Severity:** HIGH
**Confidence:** High (logic is clear; `allowOption` can be undefined when `options` is empty or missing 'allow' kind)
**Category:** Error Handling

**Smallest Fix:**
Replace the silent return with an explicit error log and user feedback. The cleanest option given the existing pattern:

```diff
--- a/web/src/components/chat/PermissionRequest.tsx
+++ b/web/src/components/chat/PermissionRequest.tsx
@@ -96,7 +96,9 @@
       onSubmit={async (answers) => {
         if (!allowOption) {
-          return
+          console.error('[PermissionRequest] AskUserQuestion: no allow option found', { options })
+          // Fail-safe: respond with null to unblock the agent
+          onRespond(permission.toolCallId, null)
+          return
         }
```

**Note:** Whether to respond `null` (deny) or throw is a product decision. The current silent return is the worst option — it leaves both the user and the agent in a permanent stuck state. At minimum, logging and a forced deny is safer than nothing.

---

### CR-3: Empty Options Array Renders Empty Actions Div [MED]

**Location:** `web/src/components/chat/PermissionRequest.tsx:145-162`

**Invariant Violated:**
- UI must always provide an actionable path for the user.

**Evidence:**
```tsx
<ConfirmationActions className="self-start">
  {options.map((option) => ( ... ))}
  {/* Decline button removed by fix for CR-1 */}
</ConfirmationActions>
```

If `options` is an empty array (malformed backend event, race condition), the rendered output is:
```html
<div class="flex items-center justify-end gap-2 self-end self-start"></div>
```
An empty flex container — no buttons, no way to dismiss.

**Failure Scenario:**
```
Backend sends: { toolCallId: 'x', toolCall: {...}, options: [] }
Result: Permission UI renders with tool details but zero action buttons.
        User cannot approve or deny. Agent blocks indefinitely.
```

**Impact:**
- Session hangs on malformed/empty options.
- No recovery path without refresh.

**Severity:** MED
**Confidence:** High (code path is clear; depends on whether backend can send empty options)
**Category:** Boundary Condition

**Smallest Fix:**
Add a fallback deny button when `options` is empty, or guard the render:
```tsx
<ConfirmationActions className="self-start">
  {options.map((option) => (
    <ConfirmationAction key={option.optionId} ...>
      {option.name}
    </ConfirmationAction>
  ))}
  {options.length === 0 && (
    <ConfirmationAction
      onClick={() => onRespond(permission.toolCallId, null)}
      variant="ghost"
    >
      Dismiss
    </ConfirmationAction>
  )}
</ConfirmationActions>
```

---

### CR-4: Unguarded `as Record<string, unknown>` Cast [LOW]

**Location:** `web/src/components/chat/PermissionRequest.tsx:136`

**Invariant Violated:**
- "No `as` assertions" (CLAUDE.md type rule) — unless localized at a boundary with a justifying comment.

**Evidence:**
```tsx
// Line 136
rawInput={toolCall.rawInput as Record<string, unknown>}
```

**Context:** `toolCall.rawInput` is typed as `unknown` (line 57). The cast is passed to `ToolCallDisplay`. This is a carry-forward from the prior implementation and is consistent with how `Workspace.tsx` handles the same value. The risk is bounded — `ToolCallDisplay` handles arbitrary input defensively.

**Severity:** LOW
**Confidence:** Med (bounded risk, consistent with codebase pattern)
**Category:** Type Safety

**Recommendation:** Acceptable as-is given it matches the existing codebase pattern. Consider adding a comment noting the boundary: `// rawInput is unknown from WebSocket; ToolCallDisplay renders it safely`.

---

### CR-5: Dead `approval.approved` State (Design Comment) [NIT]

**Location:** `web/src/components/chat/PermissionRequest.tsx:117-124`

**Evidence:**
```tsx
<Confirmation
  approval={{ id: permission.toolCallId }}  // approved is never set
  state="approval-requested"
>
```

`Confirmation` null-renders when `!approval` — this passes because `approval` has an `id`. But since `approved` is never set, `ConfirmationAccepted` and `ConfirmationRejected` (which gate on `approval?.approved`) can never render. The component comment explains this is intentional (unmount-on-respond design), but the `Confirmation` API surface suggests these slots exist.

**Impact:** None at runtime. Could confuse future developers adding accepted/rejected states.

**Severity:** NIT
**Confidence:** High
**Category:** Documentation / Design clarity

**Recommendation:** Add a comment on the `approval` prop:
```tsx
// approval.approved is intentionally omitted — this component
// unmounts when the user responds (store removes the permission),
// so ConfirmationAccepted/Rejected states are never reached here.
approval={{ id: permission.toolCallId }}
```

---

## 4) Invariants Coverage Analysis

| Invariant | Enforcement | Gaps |
|-----------|-------------|------|
| Every response reaches backend | ✅ All `ConfirmationAction` handlers call `onRespond` | CR-2: AskUserQuestion silent no-op bypasses this |
| One deny path | ❌ Missing | CR-1: Backend Deny + hardcoded Decline both render |
| No stuck UI | ⚠️ Partial | CR-2, CR-3: silent no-op and empty options can both cause stuck states |
| `onAddUserMessage` before `onRespond` | ✅ Protected | `await onAddUserMessage(...)` precedes `onRespond(...)` on line 103-104 |
| `Confirmation` renders when expected | ✅ Protected | `approval={{ id }}` + `state="approval-requested"` always passes null-guard |

---

## 5) Edge Cases Coverage

| Edge Case | Handled? | Evidence |
|-----------|----------|----------|
| `options` empty | ❌ No | CR-3: empty actions div, no dismiss path |
| No `allowOption` in AskUserQuestion | ❌ No | CR-2: silent no-op |
| `toolCall.rawInput` is null | ✅ Yes | Line 133: `{toolCall?.rawInput ? ... : <p>fallback</p>}` |
| `toolName` is undefined | ✅ Yes | Line 129: `{toolName \|\| 'action'}` |
| Backend sends both `Deny` option and component adds Decline | ❌ No | CR-1: duplicate deny |
| `toolCall` is null/undefined | ✅ Yes | Optional chaining throughout |

---

## 6) Error Handling Assessment

**Error Handling Patterns Found:**
- AskUserQuestion submit: silent `return` on missing allowOption (CR-2)
- Normal permission: no error handling — correct for pure UI dispatch

**Good Practices:**
- `await onAddUserMessage(...)` before `onRespond` — ordering preserved from prior implementation.
- `toolCall?.rawInput` optional chaining on all access.
- `ConfirmationRequest` renders fallback text when rawInput is absent.

**Missing:**
- No error path when `allowOption` is undefined (CR-2).
- No fallback when `options` is empty (CR-3).

---

## 7) Concurrency & Race Conditions

No shared mutable state in this component. `onRespond` and `onAddUserMessage` are passed-in callbacks. The component unmounts when it responds, preventing double-submit. No concurrency issues found.

---

## 8) Test Coverage Gaps

**Critical (should add before merge):**
- [ ] Normal permission renders correct number of buttons (no duplicate Deny/Decline) — CR-1
- [ ] AskUserQuestion submit with no `allowOption` does not silently no-op — CR-2
- [ ] Normal permission with empty `options` renders a dismiss path — CR-3

**Nice to have:**
- [ ] `toolCall.rawInput` is null → fallback description text renders
- [ ] AskUserQuestion: `onAddUserMessage` is awaited before `onRespond`

---

## 9) Recommendations

### Must Fix (HIGH)

1. **CR-1**: Remove the hardcoded `Decline` button
   - Action: Apply patch from CR-1 (remove lines 155-160)
   - Rationale: Backend already sends `Deny` in every options array; duplicate is user-visible and confusing
   - Estimated effort: 2 minutes

2. **CR-2**: Replace silent `return` with error log + forced deny
   - Action: Apply patch from CR-2
   - Rationale: Prevents permanent stuck state when `allowOption` is undefined
   - Estimated effort: 5 minutes

### Should Fix (MED)

3. **CR-3**: Add fallback dismiss button when `options` is empty
   - Action: Apply patch from CR-3
   - Rationale: Prevents stuck UI on malformed backend events
   - Estimated effort: 5 minutes

### Consider (LOW/NIT)

4. **CR-4**: Add comment on `rawInput` cast at the boundary.
5. **CR-5**: Add comment explaining why `approval.approved` is never set.

### Overall Strategy

**Minimum to ship:** Fix CR-1 and CR-2. CR-3 is a backend-error edge case; given `sdk-session.ts` always provides default options, the risk in practice is low but the fix is trivial.

---

## 10) False Positives & Disagreements Welcome

1. **CR-1 (Duplicate Decline)**: If there is a use case where the backend sends _no_ deny option (e.g., AskUserQuestion-style permissions that should only be answered or dismissed), the hardcoded Decline would be necessary for that case. Review `sdk-session.ts:translatePermissionSuggestions` to confirm whether SDK-suggested options can omit a deny path.

2. **CR-3 (Empty options)**: The backend always provides `defaultOptions` which includes Deny. Empty options would require a code bug in `sdk-session.ts`. If that invariant is enforced server-side, CR-3 severity drops to LOW.

---

*Review completed: 2026-03-17*
*Commit: d83cd91 — refactor(web): replace PermissionRequest Card with ai-elements Confirmation*
