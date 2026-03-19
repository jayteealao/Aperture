---
command: /review:refactor-safety
session_slug: working-tree
date: 2026-03-17
scope: worktree
target: HEAD
paths: web/src/**
related:
  session: ../README.md
---

# Refactor Safety Review Report

**Reviewed:** worktree / HEAD (working tree changes)
**Date:** 2026-03-17
**Reviewer:** Claude Code

---

## 0) Refactor Scope & Equivalence Constraints

**What was refactored:**
- Scope: worktree (all uncommitted working tree changes)
- Files: 58 files, +604 added, -919 removed
- Focus: UI primitive layer (Dropdown→Select compound, Textarea→textarea+TextareaField, Avatar, Skeleton), CSS variable token migration (`--color-*` → Tailwind semantic tokens), store/connection-slice hardening, API URL encoding, and log gating.

**Refactor goals (inferred from changes):**
1. Replace bespoke `Dropdown` component with Radix-backed `Select` compound (closer to design-system pattern)
2. Split `Textarea` into a bare `textarea` primitive + `TextareaField` wrapper (shadcn-style separation)
3. Swap `Avatar` and `Skeleton` for richer Radix-backed compound components
4. Migrate all CSS custom-property tokens (`--color-text-primary`, etc.) to Tailwind semantic tokens (`text-foreground`, etc.), removing the legacy HUD shim block
5. Store hardening: ghost-connection guard, `session/error` state propagation, `currentStreamMessageId` / `piStreamingState` / `sdkStreamingState` dead-state cleanup
6. API: add `encodeURIComponent` to all URL-interpolated IDs
7. Log gating: `console.log/warn` in production paths wrapped in `import.meta.env.DEV`

**Equivalence constraints:**
What MUST remain identical:
1. **Input/Output Contract** — React component props API must accept same input and produce same visible output
2. **Side Effect Contract** — Store writes, WS event handling, API calls must have same observable effect
3. **Error Contract** — Store error state must be reachable on the same error events
4. **Performance Contract** — No blocking added, complexity unchanged
5. **API Contract** — Public component exports, store action signatures

**Allowed changes:**
- Internal style tokens (Tailwind class names are cosmetic, not semantic)
- Log gating behind `DEV` flag (behavior-neutral in production)
- Internal variable names, code organization

---

## 1) Executive Summary

**Safety Assessment:** DRIFT_DETECTED

**Rationale:**
The bulk of the diff is a safe cosmetic migration of CSS tokens and a well-executed UI primitive swap. However, five concrete behavioral differences were found: one PUBLIC API break on `SdkControlPanel` where the caller was silently updated to inject `isStreaming` as a new required prop, one previously silently swallowed `session/error` event that now additionally writes connection state (a net improvement but a behavior change), one gap where `InputGroupTextarea` now delegates to a pure-primitive `Textarea` that has lost `autoGrow`/`label`/`error` support, one undefined CSS variable (`--secondary-hover`) that is used correctly but is **not** a Tailwind token (it is a custom property defined in `:root`) so it is actually fine — confirmed. Additionally, the `text-nebula-bg-primary` token remains in a small number of files and is still backed by the `--color-nebula-bg-primary` legacy alias which is retained in the new CSS, so it resolves correctly.

**Critical Drift (BLOCKER/HIGH):**
1. **RS-1**: `SdkControlPanel` gained a new **required** `isStreaming: boolean` prop — callers must now inject it (caller was updated, so no compile break today, but the contract change is not documented)
2. **RS-2**: `session/error` WS message now sets `status: 'error'` and clears streaming — previously it was a **no-op** on the store (only logged). This is a behavior change: sessions will visually enter error state that previously stayed in whatever their prior state was.
3. **RS-3**: `Textarea` imported by `input-group.tsx` is now the bare shadcn primitive (no `autoGrow`, no `label`, no `error`, no `ref` merging). `InputGroupTextarea` only uses `React.ComponentProps<"textarea">` props, so this is safe for its current callers — but any future caller expecting the old `Textarea` feature set and importing via the barrel `@/components/ui` will receive the primitive, not the old component.

**Overall Assessment:**
- Behavior Equivalence: Mostly Preserved (one store behavior change, one API contract change)
- Public API Safety: Breaking change on `SdkControlPanel` (mitigated by same-PR caller update)
- Side Effect Safety: Changed (`session/error` now writes store state)
- Error Handling Safety: Improved (errors now surface to UI)
- Performance Safety: Preserved

---

## 2) Findings Table

| ID | Severity | Confidence | Category | File:Line | Semantic Drift |
|----|----------|------------|----------|-----------|----------------|
| RS-1 | HIGH | High | API Contract | `SdkControlPanel.tsx:27` | New required prop `isStreaming` — callers must inject it |
| RS-2 | HIGH | High | Side Effects / Error Handling | `jsonrpc-message-handler.ts:40–49` | `session/error` was log-only; now also sets `status:'error'` + clears streaming |
| RS-3 | MED | High | API Contract / Default Values | `ui/index.ts`, `ui/textarea.tsx` | Barrel export `Textarea` is now a bare primitive; `autoGrow`, `label`, `error`, ref-merge gone |
| RS-4 | MED | High | API Contract | `connection-slice.ts:23` | `setStreaming` lost its optional `streamMessageId` param; `currentStreamMessageId` removed from `ConnectionState` |
| RS-5 | LOW | High | Default Values | `textarea-field.tsx:63` | Wrapper layout changed: old `Textarea` used `<div class="w-full">` + `mb-2` label; new `TextareaField` uses `flex flex-col gap-1.5` — minor spacing delta |
| RS-6 | LOW | Med | Side Effects (logging) | `session-slice.ts`, `connection-slice.ts`, `WorkspaceUseChat.tsx` | `console.warn/error` calls gated behind `DEV`; in production these were previously always visible |
| RS-7 | NIT | High | API Contract | `ui/avatar.tsx` | Old `Avatar` had `src?/name?/size?/className?`; new `Avatar` is a Radix Root — callers must use `Avatar+AvatarImage+AvatarFallback`. No existing callers used the old form (confirmed: zero import sites). |

**Findings Summary:**
- BLOCKER: 0
- HIGH: 2
- MED: 2
- LOW: 2
- NIT: 1

**Category Breakdown:**
- API Contract: 4 (RS-1, RS-3, RS-4, RS-7)
- Side Effects: 2 (RS-2, RS-6)
- Default Values: 1 (RS-5)
- Error Handling: 1 (RS-2, also categorized above)

---

## 3) Findings (Detailed)

### RS-1: SdkControlPanel gained a new required `isStreaming` prop [HIGH]

**Location:** `web/src/components/sdk/SdkControlPanel.tsx:27`

**Category:** API Contract Drift

**Equivalence Violated:**
- **API Contract**: Required prop added to a public component

**Before:**
```typescript
// SdkControlPanel.tsx (old)
interface SdkControlPanelProps {
  sessionId: string
  isOpen: boolean
  onToggle: () => void
}

export function SdkControlPanel({ sessionId, isOpen, onToggle }: SdkControlPanelProps) {
  const { connections } = useSessionsStore()           // ← derived internally
  const connection = connections[sessionId]
  const isStreaming = connection?.isStreaming || false
  ...
```

**After:**
```typescript
// SdkControlPanel.tsx (new)
interface SdkControlPanelProps {
  sessionId: string
  isStreaming: boolean   // ← NEW required prop
  isOpen: boolean
  onToggle: () => void
}

export function SdkControlPanel({ sessionId, isStreaming, isOpen, onToggle }: SdkControlPanelProps) {
  // useSessionsStore no longer imported here
```

**Semantic Drift:**

Old call site:
```tsx
<SdkControlPanel sessionId={activeSessionId!} isOpen={sdkPanelOpen} onToggle={toggleSdkPanel} />
// ✅ Compiles and works — isStreaming derived inside
```

New call site (as updated in WorkspaceUseChat):
```tsx
<SdkControlPanel
  sessionId={activeSessionId!}
  isStreaming={connections[activeSessionId!]?.isStreaming || false}  // ← caller must now supply
  isOpen={sdkPanelOpen}
  onToggle={toggleSdkPanel}
/>
```

Old call pattern without the new prop would give TypeScript compile error. The caller (`WorkspaceUseChat.tsx`) was updated in the same diff, so there is no current breakage. But this is an undocumented API contract change.

**Impact:**
- Any other call site of `SdkControlPanel` not updated in this diff will fail TypeScript compilation
- The behavior is **equivalent** as long as the caller passes the same connection state — but the extraction point moved from inside the component to the parent

**Why this matters:** The component was previously self-contained for this piece of state. Moving it outside makes the component a "dumb" prop-receiver for `isStreaming`. This is arguably a better design but is a **public API break**.

**Severity:** HIGH
**Confidence:** High
**Category:** API Contract

**Fix / Recommendation:**
Either document this as an intentional prop-lifting refactor (and verify all callers updated), or make `isStreaming` optional with a fallback to reading from the store:
```typescript
interface SdkControlPanelProps {
  sessionId: string
  isStreaming?: boolean  // optional: callers may inject or let component derive
  isOpen: boolean
  onToggle: () => void
}
```

**Test that would catch this:**
```typescript
test('SdkControlPanel renders without isStreaming prop', () => {
  render(<SdkControlPanel sessionId="x" isOpen={false} onToggle={() => {}} />)
})
```

---

### RS-2: `session/error` WS message now updates connection state [HIGH]

**Location:** `web/src/stores/sessions/jsonrpc-message-handler.ts:40–49`

**Category:** Side Effects + Error Handling Drift

**Equivalence Violated:**
- **Side Effect Contract**: New store writes on `session/error` event
- **Error Contract**: Error state now propagated to UI

**Before:**
```typescript
// jsonrpc-message-handler.ts (old)
} else if (msg.method === 'session/error') {
  const params = msg.params as { message?: string } | undefined
  console.error('[WS] Session error:', params?.message)
  // ← NOTHING written to store. Connection stays in whatever state it was in.
}
```

**After:**
```typescript
// jsonrpc-message-handler.ts (new)
} else if (msg.method === 'session/error') {
  const params = msg.params as { message?: string } | undefined
  if (import.meta.env.DEV) {
    console.error('[WS] Session error:', params?.message)
  }
  get().setStreaming(sessionId, false)                    // ← NEW
  get().updateConnection(sessionId, {                    // ← NEW
    status: 'error',
    error: params?.message ?? 'Session error',
  })
}
```

**Semantic Drift:**

Scenario: session receives `session/error` message

Old behavior:
- Log to console only
- `connection.status` remains `'connected'` (or whatever it was)
- `connection.isStreaming` unchanged (potentially stays `true`)
- UI shows no error state

New behavior:
- Log to console in DEV only
- `connection.status` = `'error'`
- `connection.isStreaming` = `false`
- UI shows error state (ConnectionStatus component will render error)

**Impact:**
- Sessions that received `session/error` previously silently continued with their old state. They now enter the `'error'` state visually.
- This is almost certainly an **intentional improvement** (fixing a bug where errors were silently dropped), not an accidental regression.
- If any code checked `connection.status !== 'error'` and the old behavior was relied upon (e.g., a retry loop counting only explicit `'error'` state transitions), it would now trigger.

**Why this matters:** This is a behavior change that is likely intentional. It should be explicitly documented as "bug fix: `session/error` now correctly propagates to connection state."

**Severity:** HIGH (behavior changes for callers observing connection state)
**Confidence:** High
**Category:** Side Effects + Error Handling

**Fix / Recommendation:**
Label this as an intentional bug fix, not a pure refactor. Consider adding a test:
```typescript
test('session/error sets connection to error state', () => {
  // Arrange: session in connected state
  // Act: handleJsonRpcMessage with session/error
  // Assert: connection.status === 'error', isStreaming === false
})
```

---

### RS-3: Barrel export `Textarea` is now the bare shadcn primitive [MED]

**Location:** `web/src/components/ui/index.ts:4`, `web/src/components/ui/textarea.tsx`

**Category:** API Contract Drift + Default Values

**Equivalence Violated:**
- **API Contract**: `import { Textarea } from '@/components/ui'` now gives a different component

**Before:**
```typescript
// Old: ui/index.ts
export * from './Textarea'   // → exports Textarea with label/error/hint/autoGrow/ref-merge

// Old Textarea had:
export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string
  error?: string
  hint?: string
  autoGrow?: boolean
  maxHeight?: number
}
```

**After:**
```typescript
// New: ui/index.ts
export * from './textarea'        // → bare <textarea> primitive (NO label/error/hint/autoGrow)
export * from './textarea-field'  // → TextareaField (has label/error/hint/autoGrow)

// New Textarea.tsx:
function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return <textarea data-slot="textarea" ... />
}
// Only accepts native textarea props — no label, error, hint, autoGrow
```

**Semantic Drift:**

Old code that would silently break:
```tsx
// Any code importing Textarea expecting the wrapped version:
import { Textarea } from '@/components/ui'
<Textarea label="Notes" error={err} autoGrow />
// Old: renders label + textarea + error message + auto-grows
// New: `label`, `error`, `autoGrow` are silently ignored (spread as ...props won't hit textarea's DOM props correctly, or TS will error)
```

**Current state:** Checked all active Textarea usages:
- `web/src/pages/Workspaces.tsx:581` — imports `Textarea` from `'@/components/ui/textarea'` (direct import, safe)
- `web/src/components/ui/input-group.tsx` — imports `Textarea` from `'@/components/ui/textarea'` (direct import, safe)
- No callers import `Textarea` from the barrel `'@/components/ui'`

No active callers use the barrel-exported `Textarea` with the extended props, so there is no current runtime breakage. However, the barrel `@/components/ui` no longer exports the old feature-rich `Textarea` — it exports the primitive. Code that previously relied on `import { Textarea } from '@/components/ui'` for the label/error/autoGrow behavior would silently receive the primitive.

The rich wrapper is now `TextareaField` — but `TextareaField` is not re-exported from the barrel as `Textarea`. The naming discontinuity is a semantic trap.

**Impact:**
- No current callers broken (confirmed zero barrel-import callers of `Textarea` with extended props)
- Future developers expecting `Textarea` from the barrel to have `label/error` props will be surprised
- `InputGroupTextarea` correctly uses the bare primitive via direct import — it passes `React.ComponentProps<"textarea">`, so this is **safe for its current usage**

**Severity:** MED (no current breakage; future footgun)
**Confidence:** High
**Category:** API Contract + Documentation gap

**Fix / Recommendation:**
Export `TextareaField` from the barrel under an alias or rename:
```typescript
// Option A: re-export as both names
export * from './textarea-field'  // provides TextareaField

// Option B: add a note in index.ts
// NOTE: The old Textarea with label/error/autoGrow is now TextareaField
```
Or remove `Textarea` from the barrel and force explicit imports of `TextareaField` when the wrapper is needed.

---

### RS-4: `setStreaming` lost `streamMessageId` param; `currentStreamMessageId` removed [MED]

**Location:** `web/src/stores/sessions/connection-slice.ts:23`, `web/src/api/types.ts:336`

**Category:** API Contract Drift

**Equivalence Violated:**
- **API Contract**: `setStreaming` signature changed
- **Data mutations**: `ConnectionState.currentStreamMessageId` field removed entirely

**Before:**
```typescript
// connection-slice.ts (old)
setStreaming: (sessionId: string, isStreaming: boolean, streamMessageId?: string) => void

// Used as:
get().setStreaming(sessionId, true)
// Would set: { isStreaming: true, currentStreamMessageId: streamMessageId }
// When stopping: { isStreaming: false, currentStreamMessageId: undefined }
```

**After:**
```typescript
// connection-slice.ts (new)
setStreaming: (sessionId: string, isStreaming: boolean) => void
// No streamMessageId. currentStreamMessageId removed from ConnectionState entirely.
```

**Semantic Drift:**

Old `setStreaming(id, true, 'msg-123')` → `connection.currentStreamMessageId = 'msg-123'`
New `setStreaming(id, true)` → no such field exists

**Current state:**
- Grep of the entire codebase confirms **no callers ever passed the third argument** — the old SDK/pi/jsonrpc message handlers all called `setStreaming(sessionId, true)` and `setStreaming(sessionId, false)` without `streamMessageId`.
- The comment in the old code said "Explicitly clear currentStreamMessageId when streaming stops" but the value was never set anywhere outside `setStreaming` itself.
- `currentStreamMessageId` was in `ConnectionState` type but never read anywhere in the diff or confirmed by grep.

**Impact:**
- No behavioral change in practice (the field was never populated or consumed)
- The dead state has been correctly removed
- TypeScript contract change: `setStreaming` no longer accepts a third argument (but nothing passed one)

**Severity:** MED (contract change, but dead-code removal in practice)
**Confidence:** High
**Category:** API Contract (dead state cleanup)

**Fix / Recommendation:**
This is safe to merge. Consider adding a comment noting this was dead state:
```typescript
// streamMessageId param removed: no callers ever supplied it and it was never read.
setStreaming: (sessionId: string, isStreaming: boolean) => void
```

---

### RS-5: `TextareaField` label layout spacing changed [LOW]

**Location:** `web/src/components/ui/textarea-field.tsx:63`

**Category:** Default Values Drift (visual)

**Equivalence Violated:**
- **Visual contract**: Label-to-textarea spacing changed

**Before:**
```tsx
// Old Textarea
<div className="w-full">
  {label && (
    <label className="block text-sm font-medium text-(--color-text-secondary) mb-2">
      {label}
    </label>
  )}
  <textarea ... />
  {error && <p className="mt-1 ...">}
```
Label margin: `mb-2` (8px below label, 4px above textarea).

**After:**
```tsx
// New TextareaField
<div className="w-full flex flex-col gap-1.5">
  {label && (
    <label className="block text-sm font-medium text-muted-foreground">
      {label}
    </label>
  )}
  <Textarea ... />
  {error && <p className="text-xs ...">}
```
Label margin: `gap-1.5` (6px between all flex children — label, textarea, error message).

Additionally:
- Error text changes from `mt-1 text-sm text-danger` → `text-xs text-destructive` (smaller text, no top margin since gap handles it)
- Hint text changes from `mt-1 text-sm text-(--color-text-muted)` → `text-xs text-muted-foreground`
- Error text now has an `id` for `aria-describedby` linkage (accessibility improvement)
- `aria-invalid` now set on the textarea element

**Impact:**
- Slight spacing difference (8px → 6px between label and field)
- Error/hint text is now `text-xs` (12px) instead of `text-sm` (14px)
- No functional impact; no callers currently use `TextareaField` directly (only `Textarea` from direct imports, which is now the primitive)

**Severity:** LOW (visual spacing only, no current `TextareaField` callers)
**Confidence:** High
**Category:** Default Values (visual)

---

### RS-6: Production console output suppressed behind DEV gate [LOW]

**Location:** Multiple files: `session-slice.ts`, `connection-slice.ts:97–101`, `WorkspaceUseChat.tsx`, `jsonrpc-message-handler.ts`

**Category:** Side Effects (logging)

**Equivalence Violated:**
- **Side Effect Contract**: `console.warn/error/log` calls gated behind `import.meta.env.DEV`

**Before:**
```typescript
console.warn('[Sessions] Failed to connect/restore session:', err)  // always
console.log('[Sessions] Discovered resumable SDK session:', id)     // always
console.error('[useChat] Chat error:', error)                       // always
```

**After:**
```typescript
if (import.meta.env.DEV) { console.warn(...) }
if (import.meta.env.DEV) { console.log(...) }
if (import.meta.env.DEV) { console.error(...) }
```

**Additional change in WorkspaceUseChat:**
```typescript
// Old: only logged
console.error('[useChat] Chat error:', error)

// New: logs + shows toast
if (import.meta.env.DEV) { console.error('[useChat] Chat error:', error) }
toast.error('Connection error', error instanceof Error ? error.message : 'Chat transport failed')
// ← toast fires in both DEV and PROD
```

**Semantic Drift:**
- In DEV: behavior equivalent (logs still happen)
- In PROD: logs suppressed; but the chat error now also fires a user-visible toast (which is an improvement for the user but is a behavior change)

**Impact:**
- Operators who relied on server-side log capture from the browser for troubleshooting will no longer see these logs in production
- The chat error toast is a net UX improvement

**Severity:** LOW (production logging semantics changed; likely intentional)
**Confidence:** High
**Category:** Side Effects

---

### RS-7: `Avatar` export completely replaced; old API gone [NIT]

**Location:** `web/src/components/ui/Avatar.tsx` (deleted), `web/src/components/ui/avatar.tsx` (new)

**Category:** API Contract

**Before:**
```typescript
// Old Avatar: self-contained
export function Avatar({ src, name, size = 'md', className }: AvatarProps) { ... }
// Simple: pass src or name → renders img or initials circle
```

**After:**
```typescript
// New: Radix-based compound
export { Avatar, AvatarImage, AvatarFallback, AvatarBadge, AvatarGroup, AvatarGroupCount }
// Callers must compose: <Avatar><AvatarImage /><AvatarFallback /></Avatar>
```

**Impact:** Zero existing callers of the old `Avatar` confirmed (grep found no import sites for the old form). The new compound exports more functionality. Safe.

**Severity:** NIT (no callers, confirmed clean removal)
**Confidence:** High
**Category:** API Contract (safe dead code removal)

---

## 4) Equivalence Analysis

| Contract | Status | Violations | Notes |
|----------|--------|------------|-------|
| Input/Output | Mostly Preserved | RS-1, RS-3 | SdkControlPanel API changed; Textarea barrel name-clash |
| Side Effects | Changed | RS-2, RS-6 | session/error now writes store; prod logs gated |
| Error Handling | Improved | RS-2 | session/error properly surfaces to UI — a bug fix |
| Performance | Preserved | — | No complexity changes, no N+1, no sync→async |
| API Contract | Mostly Preserved | RS-1, RS-3, RS-4, RS-7 | RS-4/RS-7 are safe dead-code removals |
| Defaults | Mostly Preserved | RS-5 | Minor spacing delta in TextareaField |

**Summary:**
- Preserved: CSS token semantics (all `--color-*` → equivalent Tailwind tokens), control flow, data transformations, connection lifecycle, WS message routing
- Improved: `session/error` now surfaces to UI, URL encoding prevents injection, ghost-connection guard prevents resurrection bugs, chat errors now show user-visible toast
- Changed: `SdkControlPanel` prop interface, Textarea barrel export identity, production logging

**Verdict:**
This is a **mixed refactor + bug-fix + feature-complete** change. The majority is cosmetic (token migration). The behavior changes are mostly improvements. The `session/error` state propagation (RS-2) is the most significant behavioral change and should be explicitly called out as a bug fix, not a side effect of refactoring.

---

## 5) Test Coverage Analysis

**Existing tests:**
- `web/src/stores/sessions.test.ts` — updated with new ghost-connection and setStreaming no-op tests

**What new tests cover:**
1. Ghost connection guard (`updateConnection` no-op after cleanup)
2. `setStreaming` no-op after session removal
3. `handleJsonRpcMessage` tested via wrapper setup

**What tests still miss:**
1. RS-2: No test for `session/error` handler correctly setting `status:'error'` and clearing `isStreaming`
2. RS-1: No compile-time test that `SdkControlPanel` requires `isStreaming`
3. RS-3: No test confirming `TextareaField` (not `Textarea`) should be used when label/error/autoGrow is needed
4. Equivalence for the `Dropdown` → `Select` compound: no test that the `agentOptions` and `authOptions` values round-trip through the new Select correctly

**Recommended new tests:**

```typescript
// Test RS-2: session/error handler
test('session/error sets connection to error state and clears streaming', () => {
  const sessionId = 'test-1'
  useSessionsStore.setState((state) => ({
    ...state,
    sessions: [makeSession(sessionId, 'claude_sdk')],
    connections: { [sessionId]: makeConnection({ status: 'connected', isStreaming: true }) },
  }))

  handleJsonRpcMessage(
    sessionId,
    { method: 'session/error', params: { message: 'fatal error' } },
    storeGet,
    storeSet,
  )

  const conn = useSessionsStore.getState().connections[sessionId]
  expect(conn?.status).toBe('error')
  expect(conn?.error).toBe('fatal error')
  expect(conn?.isStreaming).toBe(false)
})
```

---

## 6) Recommendations

### High Priority (Review Before Merge) — HIGH

1. **RS-1: SdkControlPanel `isStreaming` prop**
   - Action: Confirm all callers have been updated (they have in this diff). Document as intentional API change. Consider if `isStreaming` should remain optional with store fallback.
   - Effort: 5 minutes (verification)
   - Risk: TypeScript will catch un-updated callers at compile time

2. **RS-2: `session/error` behavior change**
   - Action: Explicitly document as "bug fix: session/error now propagates to connection state." Add a test.
   - Effort: 15 minutes (test + changelog)
   - Risk: If any code path expected sessions to remain `'connected'` after `session/error`, it will now see `'error'`

### Medium Priority (Address or Document) — MED

3. **RS-3: Textarea barrel export mismatch**
   - Action: Either rename `TextareaField` export to make it the obvious choice, or add a comment in `index.ts` warning that the bare `Textarea` no longer has `label/error/autoGrow`.
   - Effort: 5 minutes
   - Risk: Future developer footgun

4. **RS-4: `setStreaming` signature / `currentStreamMessageId` removal**
   - Action: This is safe. No action needed beyond noting it was dead state.
   - Effort: 0 (already done correctly)

### Low Priority (Document or Accept) — LOW

5. **RS-5: TextareaField spacing delta** — Accept as intentional design update.
6. **RS-6: Production log gating** — Accept as intentional. Note the chat error toast is a net improvement.

### Testing Improvements

7. Add test for `session/error` handler (see §5 above)
8. Add test for `InputGroupTextarea` accepting/ignoring `autoGrow`-style props without error

---

## 7) Special Focus: Dropdown → Select equivalence

The `Dropdown` component (now deleted) had these capabilities:
- `options: Array<{ value, label, disabled?, icon? }>`
- `icon` rendering in trigger and in list items
- `disabled` option support
- Keyboard: Escape closes, click-outside closes
- Visual: `Check` on selected item, `ChevronDown` rotates open/close

The new Radix `Select` compound provides:
- `disabled` per `SelectItem` — **preserved** (Radix supports this natively)
- Keyboard navigation — **preserved** (Radix handles Escape, arrow keys, Enter natively — **actually richer**)
- Check on selected item — **preserved** (Radix `ItemIndicator` built-in)
- `icon` support — **partially preserved**: the old `Dropdown` rendered `option.icon` in the trigger and list. The new `Select` items in `Sessions.tsx` do `{opt.label}` only. However, in the actual data (`agentOptions`, `authOptions`), **no icons were ever passed** — the option objects only have `value` and `label`. Icon support was in the old `Dropdown` API but never used.

**Conclusion:** Dropdown → Select behavior equivalence is **preserved** for all actual usage. The new Radix Select is a strict superset of the old Dropdown's used features.

---

## 8) Special Focus: `InputGroupTextarea` correctness

`InputGroupTextarea` (in `input-group.tsx`) now imports the bare `Textarea` primitive from `./textarea`. It passes `React.ComponentProps<"textarea">` only:

```typescript
function InputGroupTextarea({ className, ...props }: React.ComponentProps<'textarea'>) {
  return (
    <Textarea
      data-slot="input-group-control"
      className={cn('flex-1 resize-none rounded-none border-0 bg-transparent py-3 shadow-none focus-visible:ring-0 dark:bg-transparent', className)}
      {...props}
    />
  )
}
```

The old `Textarea` wrapper (with `autoGrow`, `label`, etc.) was never expected here — `InputGroupTextarea` has always been a bare textarea control inside an `InputGroup` container. The only change is that the imported `Textarea` is now a shadcn primitive with `data-slot="textarea"` and a slightly different base className (uses `field-sizing-content`, `min-h-16`, `focus-visible:ring-[3px]`). The `InputGroupTextarea` overrides the relevant classes (`border-0`, `bg-transparent`, `shadow-none`, `focus-visible:ring-0`) so these shadcn base styles are effectively neutralized.

**The primary user of `InputGroupTextarea` is `PromptInputTextarea`** in `prompt-input.tsx`. That component passes `onKeyDown`, `value`, `onChange`, `placeholder`, `disabled` — all plain textarea props. It works correctly with the primitive.

**Conclusion:** `InputGroupTextarea` works correctly with the new primitive `Textarea`. No behavioral regression.

---

*Review completed: 2026-03-17*
*Session: working-tree*
