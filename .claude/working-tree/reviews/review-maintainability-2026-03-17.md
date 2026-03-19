---
command: /review:maintainability
session_slug: working-tree
date: 2026-03-17
scope: worktree
target: HEAD
paths: web/src/**
related:
  session: ../README.md
---

# Maintainability Review Report

**Reviewed:** worktree / HEAD (unstaged + staged changes vs HEAD)
**Date:** 2026-03-17
**Reviewer:** Claude Code

---

## 0) Scope, Intent, and Conventions

**What was reviewed:**
- Scope: worktree (git diff HEAD)
- Target: HEAD
- Files: 61 files changed, +680 lines added, -1148 lines removed

**Intent:**
- Remove the legacy `--color-*` CSS custom property shim layer and migrate all call-sites to canonical Tailwind/shadcn tokens (`text-foreground`, `text-muted-foreground`, `bg-card`, `border-border`, etc.)
- Delete obsolete custom components (Avatar.tsx, Badge.tsx, Card.tsx, Dropdown.tsx, Skeleton.tsx, Textarea.tsx) and replace with shadcn-parity equivalents (lowercase-named files)
- Remove `react-markdown` / `remark-gfm` / `remark-math` / `rehype-katex` dependency bundle
- Harden the connection store: guard `updateConnection` against ghost resurrection after `cleanupConnection`, simplify `setStreaming` signature (drop `streamMessageId`), fix `session/error` handler to actually set error state, gate dev-only console calls behind `import.meta.env.DEV`
- Expand session store test coverage for connection lifecycle and JSON-RPC message handling
- Pre-warm the Shiki singleton at app boot to prevent FOUC on first code block
- Propagate `isStreaming` as a prop into `SdkControlPanel` instead of reading from the store directly

**Team conventions (inferred):**
- Tailwind utility classes for styling; shadcn-style component library
- Zustand slice pattern for state; discriminated union message handlers
- Lowercase-kebab filenames for shadcn-compatible UI components
- `import.meta.env.DEV` for debug logging guards
- `encodeURIComponent` applied at all URL construction call-sites

**Review focus:**
- Cohesion: Does each module have a clear purpose?
- Coupling: Are dependencies minimal and directional?
- Complexity: Are functions/classes easy to understand?
- Naming: Are names intent-revealing?
- Change amplification: How easy is it to add features?

---

## 1) Executive Summary

**Merge Recommendation:** APPROVE_WITH_COMMENTS

**Rationale:**
This is a large but well-scoped cleanup that removes ~1,100 lines of dead code and shim layer, eliminating a major source of future confusion (two parallel token systems). The store hardening fixes real correctness issues and the test expansion is valuable. A small number of incomplete token migrations and one non-existent CSS variable reference need addressing before the full benefits of the cleanup are realized.

**Top Maintainability Issues:**
1. **MA-1**: `--secondary-hover` used directly in JSX class strings but only partially migrated — 5 callsites still use `hover:bg-(--secondary-hover)` which is a custom var, not a Tailwind token. Inconsistent with the migration goal.
2. **MA-2**: `SdkContentBlock` type removed from the import in `sdk-slice.ts` but still defined and exported in `types.ts`, where it is referenced by `SdkMessage`. No dead code was actually removed from `types.ts`.
3. **MA-3**: `CardHeader` in the new `card.tsx` is a layout-only children wrapper, but call-sites in `Settings.tsx` and `Sessions.tsx` manually re-implement the flex layout inside `CardHeader` to accommodate an action badge — structural duplication that will recur every time a card needs a header action.

**Overall Assessment:**
- Cohesion: Good
- Coupling: Acceptable
- Complexity: Simple
- Consistency: Inconsistent (see MA-1)
- Change Amplification: Low (the cleanup reduces it)

---

## 2) Module Structure Analysis

| Module | Net Lines | Responsibilities | Cohesion | Key Change | Verdict |
|--------|-----------|-----------------|----------|------------|---------|
| `index.css` | -46 | CSS variable definitions | Focused | Removes legacy `--color-*` shim | Good |
| `connection-slice.ts` | +/-49 | WS connection state | Focused | Ghost guard, simplified setStreaming | Good |
| `jsonrpc-message-handler.ts` | +27 | JSON-RPC dispatch | Focused | session/error fix, safety guard | Good |
| `sessions.test.ts` | +166 | Store unit tests | Focused | New connection lifecycle tests | Good |
| `sdk-slice.ts` / `pi-slice.ts` | -10/-3 | SDK/Pi state | Focused | Remove streaming state types | Good |
| `card.tsx` (new) | 97 | Card compound | Focused | Children-based header API | Good |
| `SdkControlPanel.tsx` | -5/+2 | Control panel layout | Focused | isStreaming lifted to prop | Good |
| Token migration files (x40) | ~-400 | Views only | View layer | `--color-*` to Tailwind tokens | Good |

**Observations:**
- 40+ files are pure token substitutions with no logic change — high confidence, low risk
- All deleted component files (Avatar, Badge, Card, Dropdown, Skeleton, Textarea) have replacement files verified present in working tree
- No god objects introduced; all modules remain focused

---

## 3) Coupling Analysis

### Dependency Graph (unchanged by this diff)

```
UI Pages / Components
      |
      v
stores/sessions (Zustand)
      |
      v
api/client (HTTP + WS)
      |
      v
Backend (Fastify)
```

**Cross-layer violations found:** None introduced.

**Notable coupling improvement:**
`SdkControlPanel` previously read `isStreaming` directly from `useSessionsStore` inside the component. It now receives it as a prop from `WorkspaceUseChat`. This is a small but correct improvement: the control panel is now a dumb view and easier to test in isolation.

**Hidden coupling resolved:**
The ghost resurrection bug in `updateConnection` was hidden coupling: a delayed WebSocket callback could silently re-insert state for a cleaned-up session. The guard makes the contract explicit.

### Circular Dependencies
None detected in changed files.

---

## 4) Findings Table

| ID | Severity | Confidence | Category | File:Line | Issue |
|----|----------|------------|----------|-----------|-------|
| MA-1 | MED | High | Consistency | Multiple | `--secondary-hover` used raw in JSX; not a Tailwind token |
| MA-2 | LOW | High | Dead Code | `api/types.ts:442` | `SdkContentBlock` no longer imported by any slice after removal |
| MA-3 | LOW | Med | Duplication | `pages/Settings.tsx:87`, `pages/Sessions.tsx:258` | CardHeader action wrapper re-implemented manually in 2 places |
| MA-4 | NIT | High | Comment | `connection-slice.ts:45` | Guard comment says "Delayed WS callbacks" but guard applies to any caller |
| MA-5 | NIT | Med | Comment | `WorkspaceUseChat.tsx:131` | Comment simplification removed useful context about why isStreaming=true write is forbidden here |

**Findings Summary:**
- BLOCKER: 0
- HIGH: 0
- MED: 1
- LOW: 2
- NIT: 2

---

## 5) Findings (Detailed)

### MA-1: Incomplete Token Migration — `--secondary-hover` Still Hardcoded [MED]

**Location:**
- `web/src/components/sdk/SdkCommandsList.tsx:94`
- `web/src/components/session/AskUserQuestionDisplay.tsx:135, 246`
- `web/src/components/ui/card.tsx:40`
- `web/src/components/ui/PanelSection.tsx:34`

**Evidence (representative):**
```tsx
// SdkCommandsList.tsx:94
className="w-full text-left p-2 bg-secondary rounded-lg hover:bg-(--secondary-hover) transition-colors group"

// card.tsx:40 — in a newly authored file
hover && 'hover:border-ring hover:bg-(--secondary-hover) cursor-pointer',
```

**Issue:**
`--secondary-hover` is a custom CSS variable defined in `index.css` (lines 16 and 47 for light/dark). It is not removed by this diff — it still works. However, the migration goal of this diff is to eliminate non-standard vars from JSX and use only design-system tokens. `--secondary-hover` is now the *only* remaining non-standard var used in component class strings.

The inconsistency: most interactive hover sites in this diff use `hover:bg-muted` (RepoSelector, Workspaces, Help, Onboarding), but these 5 sites use `hover:bg-(--secondary-hover)`. The worst case is `card.tsx` — a newly authored file that sets a precedent for future code.

**Impact:**
- **Readability**: Future contributors won't know which hover token to use
- **Change amplification**: Changing hover color requires touching two systems

**Severity:** MED
**Confidence:** High
**Category:** Consistency / Incomplete Migration

**Change scenario:**
```
Q: Change the hover background for interactive surfaces across the app.
A: Must update both `--secondary-hover` in index.css AND `hover:bg-muted`
   sites — two mechanisms for the same intent.
```

**Smallest Fix:**
Replace all 5 `hover:bg-(--secondary-hover)` instances with `hover:bg-muted` to match the established pattern in this diff. Estimated: 10 minutes.

---

### MA-2: `SdkContentBlock` / `SdkMessage` Dead Export After Slice Cleanup [LOW]

**Location:** `web/src/api/types.ts:442-452`

**Evidence:**
```typescript
// types.ts — still present post-diff
export type SdkContentBlock =
  | { type: 'text'; text: string }
  | { type: 'thinking'; thinking: string }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }

export interface SdkMessage {
  id: string
  role: 'user' | 'assistant'
  content: SdkContentBlock[]
}
```

`sdk-slice.ts` removed its import of `SdkContentBlock`. No other file in `web/src/` imports `SdkContentBlock`. The type exists in `types.ts` but has no consumer.

**Impact:**
- Dead exports are low-risk but create confusion about what's in use
- Future contributor may build on `SdkContentBlock` thinking it's active infrastructure

**Severity:** LOW
**Confidence:** High
**Category:** Dead Code

**Smallest Fix:**
Confirm `SdkMessage` is also unused (no imports found), then delete both from `types.ts`. Estimated: 5 minutes.

---

### MA-3: CardHeader Action Pattern Duplicated [LOW]

**Location:** `web/src/pages/Settings.tsx:87-96`, `web/src/pages/Sessions.tsx:258-268`

**Evidence:**
```tsx
// Settings.tsx — Connection section
<CardHeader>
  <div className="flex items-start justify-between gap-4">
    <div>
      <CardTitle>Connection</CardTitle>
      <CardDescription>Gateway server configuration</CardDescription>
    </div>
    <Badge variant={isConnected ? 'success' : 'danger'}>...</Badge>
  </div>
</CardHeader>

// Sessions.tsx — SessionCard header
<CardHeader>
  <div className="flex items-start justify-between gap-4">
    <div>
      <CardTitle>...</CardTitle>
      <CardDescription>...</CardDescription>
    </div>
    <Badge ...>...</Badge>
  </div>
</CardHeader>
```

The new `card.tsx` removed the `action` prop that the old `Card.tsx` had. Two call-sites already re-implement the same `flex justify-between` wrapper to place an action element in the header.

**Impact:**
- **Structural duplication**: Will recur with any new card that needs a header action
- **Inconsistency**: Other card headers use bare `CardHeader`; these use a wrapper div inside

**Severity:** LOW (2 sites is manageable; only worth addressing before a third appears)
**Confidence:** Med (shadcn composition philosophy may accept this)

---

### MA-4: Guard Comment Narrower Than Actual Guard [NIT]

**Location:** `web/src/stores/sessions/connection-slice.ts:45-50`

**Evidence:**
```typescript
// Guard: do not recreate a connection entry for a session that has been
// removed. Delayed WS callbacks (statusHandler, message handlers) can
// fire after removeSession → cleanupConnection; without this guard they
// would resurrect a ghost ConnectionState entry.
if (!state.connections[sessionId]) return state
```

"Delayed WS callbacks" is accurate for the primary use-case but the guard protects against *any* caller — including the test case of `updateConnection` called directly after `cleanupConnection`. The comment is not wrong, just narrower than the actual invariant.

**Severity:** NIT

---

### MA-5: Simplified Comment Loses Useful Constraint Explanation [NIT]

**Location:** `web/src/pages/WorkspaceUseChat.tsx:131`

**Before (removed):**
> Writing true here would clobber currentStreamMessageId.

**After:** Comment correctly notes the WS handlers own writing `true`, but no longer explains *why* this component must not write `true`. Since `currentStreamMessageId` was removed, the rationale changed — the comment is now accurate. This is a positive simplification, flagged only for awareness.

**Severity:** NIT (positive direction)

---

## 6) Change Amplification Analysis

### Scenario 1: Add a New Semantic Color Token (e.g., `info` color)

**Files that would need changes:**
1. `index.css` — add CSS var in `:root` and `.dark` (expected)
2. `tailwind.config` or `@theme` block — register token (expected)

**Assessment:**
Low amplification. The removal of the shim layer means there is now one canonical path: define in `index.css`, register in `@theme`. Previously, a new semantic token would also need a `--color-*` alias. The diff eliminates that step.

### Scenario 2: Change the Hover Background for Interactive Surfaces

**Files that would need changes (current state due to MA-1):**
1. `index.css:16,47` — `--secondary-hover` value
2. 5 component files using `hover:bg-(--secondary-hover)` directly
3. Multiple sites using `hover:bg-muted` (separate, may be different intent)

**Assessment:**
Moderate. If MA-1 is fixed, this becomes a single-token change.

### Scenario 3: Add a New Agent Type with Its Own Control Panel

**Files that would need changes:**
1. New `XyzControlPanel.tsx` (expected)
2. `WorkspaceUseChat.tsx` — add panel, pass `isStreaming` prop (expected)
3. New or extended store slice (expected)

**Assessment:**
Low amplification. The `SdkControlPanel` refactor (isStreaming as prop) makes the pattern clean to replicate.

### Summary

**Change Amplification Score:** Low (improved from pre-diff state)

**Key driver reduced:** Removing the shim layer eliminates one layer of indirection for all future token changes.

---

## 7) Positive Observations

**Shim layer removal**: Deleting 54 legacy `--color-*` CSS variable declarations eliminates the most significant source of token confusion in this codebase. Future contributors see only one token system.

**Ghost guard in updateConnection**: Minimal, targeted fix with a clear comment. Guards the invariant at the write boundary without adding complexity to callers.

**setStreaming signature simplification**: Dropping `streamMessageId` after removing `currentStreamMessageId` from `ConnectionState` keeps the API honest. Confirmed: no callers passed the third argument.

**session/error handler fix**: Previously logged but never updated store state. The fix (`setStreaming(false)` + `updateConnection({ status: 'error', error: ... })`) is complete and correct.

**Test expansion quality**: The new `describe('useSessionsStore connection')` suite tests the exact edge cases fixed in this diff (ghost resurrection, session/error, malformed frames). Tests are deterministic, use no sleeps, and exercise the public store API.

**encodeURIComponent consistency**: Applied to 9 URL construction sites in `client.ts`. No missed sites detected in the changed methods.

**cleanupSessionState self-healing**: Because `cleanupSessionState` iterates over `initialState` keys, removing `piStreamingState` and `sdkStreamingState` from initial state automatically removes them from cleanup — no manual synchronization needed.

**DEV-gated console calls**: Applied consistently across 6 sites in stores and handlers.

---

## 8) Recommendations

### Should Fix Before Merge (MED)

1. **MA-1** — Replace 5 `hover:bg-(--secondary-hover)` sites with `hover:bg-muted` to complete the token migration. The inconsistency is particularly notable in the newly authored `card.tsx`.
   - Files: `SdkCommandsList.tsx`, `AskUserQuestionDisplay.tsx` (x2), `card.tsx`, `PanelSection.tsx`
   - Effort: 10 minutes
   - Benefit: Completes the stated goal of this diff; eliminates the only remaining non-standard var in JSX

### Consider in Follow-up (LOW)

2. **MA-2** — Audit and remove `SdkContentBlock` + `SdkMessage` from `types.ts` if confirmed unused.
   - Effort: 5 minutes

3. **MA-3** — Consider adding an `action` prop back to `CardHeader` in `card.tsx` to prevent the wrapper-div duplication from spreading.
   - Effort: 15 minutes

### No Action Needed (NIT)

4. MA-4 and MA-5 require no changes.

---

## 9) Refactor Cost/Benefit

| Finding | Cost | Benefit | Risk | Recommendation |
|---------|------|---------|------|----------------|
| MA-1 | Low (10min) | Medium (completes migration, one token system) | None | Do before merge |
| MA-2 | Low (5min) | Low (clarity) | None | Follow-up |
| MA-3 | Medium (15min) | Low-Med (prevents future duplication) | Low | Defer |

**Total effort for MED fix:** 10 minutes
**Total benefit:** Completes the stated intent of this diff; eliminates last token inconsistency

---

## 10) Conventions & Consistency

### Token Usage (post-diff state)

| Token Category | Old Pattern (deleted) | New Pattern | Consistency |
|---------------|----------------------|-------------|-------------|
| Background | `bg-(--color-bg-primary)` | `bg-background` | Consistent |
| Card background | `bg-(--color-bg-secondary)` | `bg-card` | Consistent |
| Muted background | `bg-(--color-bg-tertiary)` | `bg-muted` | Consistent |
| Surface | `bg-(--color-surface)` | `bg-secondary` | Consistent |
| Hover surface | `hover:bg-(--color-surface-hover)` | Mixed: `hover:bg-muted` or `hover:bg-(--secondary-hover)` | Inconsistent (MA-1) |
| Border | `border-(--color-border)` | `border-border` | Consistent |
| Text primary | `text-(--color-text-primary)` | `text-foreground` | Consistent |
| Text secondary | `text-(--color-text-secondary)` | `text-muted-foreground` | Consistent |
| Text muted | `text-(--color-text-muted)` | `text-foreground/40` | Consistent |

### File Naming

| Category | Pattern | Consistency |
|----------|---------|-------------|
| shadcn-compatible UI | lowercase-kebab (`card.tsx`, `badge.tsx`) | Consistent |
| Custom UI | PascalCase (`Button.tsx`, `Input.tsx`) | Consistent |
| Stores | kebab-case (`session-slice.ts`) | Consistent |

---

## 11) False Positives & Disagreements Welcome

1. **MA-1 (`--secondary-hover`)**: If the team intentionally wants `--secondary-hover` to be visually distinct from `muted` for hover states (different opacity for light vs. dark), then keeping the var is correct and the inconsistency with `hover:bg-muted` in other files is what needs fixing instead.

2. **MA-3 (CardHeader)**: If the shadcn philosophy of "compose, don't configure" is team convention, the manual wrapper in 2 places is acceptable and MA-3 should be closed. The issue only becomes friction if a third or fourth card with header actions appears.

---

*Review completed: 2026-03-17*
*Session: [working-tree](../README.md)*
