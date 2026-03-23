# Phase 0: Foundation Upgrades

> React 18 → 19, Zustand v4 → v5, Tailwind v3 → v4, Vite 5 → 8, Vitest 1 → 4, ESLint 8 → 10, react-router v6 → v7, lucide-react + tailwind-merge upgrades, theme migration, shadcn/ui + ai-elements install

**Prerequisite:** None — this is the first phase.
**Independently deployable:** Yes (each sub-phase can be deployed separately).

---

## Deployment grouping (recommended commit boundaries)

Phase 0 upgrades 9+ dependencies simultaneously. To reduce blast radius, deploy in three groups:

| Group | Sub-phases | What changes | Risk |
|-------|-----------|-------------|------|
| **0A — Runtime** | 0.1 (React 19), 0.1.1 (Zustand v5), 0.4 (react-router v7), 0.5 (lucide + tailwind-merge) | Component APIs, state management, routing | Medium |
| **0B — Tooling** | 0.2 (Tailwind v4), 0.3 (Vite 8), 0.6 (Vitest 4), 0.7 (ESLint 10) | Build pipeline, test runner, linting | Medium |
| **0C — New additions** | 0.8 (shadcn/ui), 0.9 (ai-elements) | Component library install | Low |

Each group should be a separate commit that passes `typecheck + build + test` before moving to the next. If Tailwind v4 migration stalls, it doesn't block React 19 work. If ESLint 10 flat config is painful, it doesn't block ai-elements installation.

---

## 0.1 Upgrade React 18 → 19

### Install

```bash
pnpm --filter aperture-web add react@19.2.4 react-dom@19.2.4
pnpm --filter aperture-web add -D @types/react@19 @types/react-dom@19
```

**Why 19.2.4:** CVE-2025-55182 (RCE in React Server Components) affects 19.0.0–19.2.2. While we're client-only (Vite), pin to the patched version for safety.

### Run codemods

```bash
# React 19 codemods (handles forwardRef removal, Context.Provider, etc.)
npx codemod@latest react/19/migration-recipe --target web/src

# TypeScript type codemods (useRef requires argument, etc.)
npx types-react-codemod@latest preset-19 web/src
```

### Files requiring `forwardRef` migration (4 files)

The codemod removes `forwardRef` wrappers and passes `ref` as a regular prop.

| File | Line | Current pattern |
|------|------|----------------|
| `web/src/components/ui/Button.tsx` | 1, 13 | `forwardRef<HTMLButtonElement, ButtonProps>` |
| `web/src/components/ui/Select.tsx` | 1, 13 | `forwardRef<HTMLSelectElement, SelectProps>` |
| `web/src/components/ui/Textarea.tsx` | 1, 12 | `forwardRef<HTMLTextAreaElement, TextareaProps>` |
| `web/src/components/ui/Input.tsx` | 1, 13 | `forwardRef<HTMLInputElement, InputProps>` |

All four set `.displayName` — remove those too after dropping `forwardRef`.

**Before:**
```tsx
import { forwardRef, type ComponentPropsWithoutRef } from 'react'

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, ...props }, ref) => {
    return <button ref={ref} className={cn(...)} {...props} />
  }
)
Button.displayName = 'Button'
```

**After:**
```tsx
export function Button({ className, variant, ref, ...props }: ButtonProps & { ref?: React.Ref<HTMLButtonElement> }) {
  return <button ref={ref} className={cn(...)} {...props} />
}
```

### `useRef` calls — no changes needed

All `useRef` calls already pass `null` as the initial value. Audit confirmed:

| File | Line | Call |
|------|------|------|
| `web/src/components/ui/Textarea.tsx` | 15 | `useRef<HTMLTextAreaElement>(null)` |
| `web/src/components/ui/Dropdown.tsx` | 34 | `useRef<HTMLDivElement>(null)` |
| `web/src/components/session/RepoSelector.tsx` | 43 | `useRef<HTMLDivElement>(null)` |
| `web/src/pages/Workspace.tsx` | 63–65 | 3× `useRef<T>(null)` |

**One edge case:** `web/src/pages/Workspaces.tsx:34` uses `useRef(toast)` without a type arg. Not a DOM ref — it captures a stable callback reference. Add type annotation: `useRef<typeof toast>(toast)`.

### Other breaking changes — no action needed

| Change | Status |
|--------|--------|
| `ReactDOM.render` removed | Already using `createRoot` |
| `act` import moved | No `react-dom/test-utils` imports found |
| `Context.Provider` → `Context` | One context in `Toast.tsx` — optional, can migrate later |
| Ref callback implicit returns | Grep for `ref={el =>` — ensure block body `ref={el => { ... }}` |
| StrictMode double-render | Existing behavior, no code changes |

### Dependency compatibility

| Dependency | Version | React 19 status | Action |
|------------|---------|-----------------|--------|
| `@tanstack/react-query` | `^5.17.0` | Works at runtime | None — pnpm handles peer dep |
| `zustand` | `^4.4.7` | **NOT compatible** | Upgrade to v5 (see 0.1.1) |
| `react-router-dom` | `^6.21.1` | Works (`react@>=16.8`) | None |
| `react-markdown` | `^10.1.0` | Full support | See 0.1.2 |
| `lucide-react` | `^0.309.0` | Works | None |
| `@testing-library/react` | `^14.1.2` | Works | None |

**No Radix UI packages** are currently installed — no Radix compatibility concerns.

### Verification

```bash
pnpm --filter aperture-web type-check
pnpm --filter aperture-web build
pnpm --filter aperture-web test
```

---

## 0.1.1 Upgrade Zustand v4 → v5

**Required for React 19.** Zustand v5 uses native `useSyncExternalStore`.

### Install

```bash
pnpm --filter aperture-web add zustand@5.0.11
```

**Why 5.0.11:** v5.0.10 had a persist state consistency bug. v5.0.11 fixes it.

### Store files to audit (2 files)

**`web/src/stores/app.ts`** (line 48):
- Pattern: `create<AppState>((set, get) => ({...}))` — forward-compatible
- Middleware: None
- Persistence: Manual `localStorage`/`sessionStorage` — no `persist` middleware to migrate
- Selectors: Consumers destructure from `useAppStore()` directly

**`web/src/stores/sessions.ts`** (874 lines):
- Pattern: `create<SessionsState>(...)` — forward-compatible
- Middleware: None
- Persistence: Manual `idb-keyval` with custom debounce — no `persist` middleware
- Import: `import { create } from 'zustand'` — stable in v5

### Breaking changes to check

| Change | Impact on us | Action |
|--------|-------------|--------|
| Default export removed | Already using named import `{ create }` | None |
| `devtools` import path | Not using devtools | None |
| `persist` middleware changes | Not using persist middleware | None |
| Selectors returning new refs → infinite loops | **Risk only with inline object selectors** — see clarification below | Audit consumers |

### Selector audit

**Clarification on infinite loop risk:** The risk applies specifically when passing an **inline selector that creates a new object** each render:

```tsx
// DANGEROUS in v5 — creates new object reference → Object.is() never matches → infinite loop
const state = useAppStore(s => ({ theme: s.theme, sidebar: s.sidebarOpen }))
```

Calling `useAppStore()` with **no selector** and destructuring after is **not dangerous** — it just re-renders on every state change (same behavior as v4, wasteful but not broken):

```tsx
// SAFE but wasteful — re-renders on any state change, same as v4
const { theme, sidebarOpen } = useAppStore()
```

Search all files for inline object selectors:

```bash
grep -rn "useAppStore\|useSessionsStore" web/src/ --include="*.tsx" --include="*.ts"
```

For consumers that pass an inline selector returning a new object, wrap with `useShallow`:

```tsx
import { useShallow } from 'zustand/shallow'
const { theme, sidebarOpen, sdkPanelOpen } = useAppStore(
  useShallow(s => ({ theme: s.theme, sidebarOpen: s.sidebarOpen, sdkPanelOpen: s.sdkPanelOpen }))
)
```

**Note:** `useShallow` is an optimization (prevents unnecessary re-renders), not a correctness fix — unless you have an inline object selector, in which case it prevents an infinite loop. Apply it to hot-path components (like `Workspace.tsx`) but don't blanket-apply everywhere.

**Audit result:** 0 inline object selectors found. All 8 `useAppStore()` consumers use bare destructuring (no selector). 2 consumers use single-value primitive selectors (`useAppStore((s) => s.isConnected)`, `useSessionsStore((s) => s.connections)`) — both safe with `Object.is`. **No `useShallow` migration needed for correctness.**

### Verification

```bash
pnpm --filter aperture-web type-check
pnpm --filter aperture-web build
# Manual: verify no infinite re-render loops in browser DevTools
```

---

## 0.1.2 Update `react-markdown` v10 usage

Already on `^10.1.0`. The `code` component override in `Workspace.tsx:653-678` uses v10-compatible patterns. However, verify:

**File:** `web/src/pages/Workspace.tsx` lines 650–703 (`MarkdownContent` function)

| Concern | Current code | Status |
|---------|-------------|--------|
| `className` prop on `<ReactMarkdown>` | Not used — wraps in `<div>` | OK |
| `code` component: `inline` prop | Uses `!match && !className` heuristic | OK for v10 |
| `li` component: `checked`/`index`/`ordered` | Not overridden | OK |

**This component will be deleted in Phase 3** (replaced by `<MessageResponse>`). If Phase 0 deploys independently, no changes needed here.

---

## 0.2 Upgrade Tailwind v3 → v4

### Run the official upgrade tool

```bash
cd web
npx @tailwindcss/upgrade
```

**Requires Node.js 20+.** Check with `node --version` first.

The upgrade tool handles:
- Updating `tailwindcss` to v4 in `package.json`
- Converting `tailwind.config.ts` theme values to `@theme` CSS blocks
- Renaming utility classes in templates (see table below)
- Updating CSS syntax (`@tailwind` → `@import "tailwindcss"`)
- Installing `@tailwindcss/vite` if Vite is detected

### Then manually verify/fix

```bash
pnpm --filter aperture-web add tailwindcss@4.2.1 @tailwindcss/vite
pnpm --filter aperture-web remove autoprefixer postcss
```

### Update `web/vite.config.ts`

Add the `@tailwindcss/vite` plugin to the config already migrated in step 0.7:

```ts
import tailwindcss from '@tailwindcss/vite'

// Add tailwindcss() to the plugins array:
plugins: [react(), tailwindcss()],
```

This is a one-line addition to the config — the `rolldownOptions`/`advancedChunks` migration was already done in step 0.7.

### Delete files

- `web/tailwind.config.ts` (115 lines) — replaced by `@theme` in CSS
- `web/postcss.config.js` (6 lines) — replaced by `@tailwindcss/vite`

### Utility class renames

The upgrade tool handles most of these, but verify with grep:

| Tailwind v3 | Tailwind v4 | Files affected |
|-------------|-------------|---------------|
| `shadow-sm` | `shadow-xs` | grep across web/src |
| `shadow` (bare) | `shadow-sm` | |
| `rounded-sm` | `rounded-xs` | |
| `rounded` (bare) | `rounded-sm` | |
| `blur-sm` | `blur-xs` | |
| `outline-none` | `outline-hidden` | |
| `ring` (bare) | `ring-3` | |
| `bg-gradient-to-r` | `bg-linear-to-r` | |
| `flex-shrink-*` | `shrink-*` | |
| `flex-grow-*` | `grow-*` | |

### Other breaking changes to verify

| Change | Impact | Action |
|--------|--------|--------|
| Default border color: `gray-200` → `currentColor` | May affect unstyled `border` classes | Audit bare `border` classes, add explicit color |
| `@layer utilities { ... }` → `@utility name { ... }` | `index.css` has 7 custom utilities (see list below) | Migrate manually — upgrade tool may miss |
| `!important` modifier: `!flex` → `flex!` | Check for `!` prefix usage | Grep for `!\w+` in className strings |
| Variant stacking reversed | `first:*:pt-0` → `*:first:pt-0` | Unlikely in our code |
| Arbitrary CSS vars: `bg-[--brand]` → `bg-(--brand)` | We use `bg-[var(--color-*)]` extensively | See 0.3 for the full migration |

### Custom utilities requiring `@utility` migration (`index.css:65–148`)

In Tailwind v4, `@layer utilities { ... }` is replaced by individual `@utility name { ... }` blocks. The upgrade tool may not handle all of these — verify and migrate manually:

| Utility | Lines | Notes |
|---------|-------|-------|
| `.glass` | 66–71 | Simple properties, straightforward migration |
| `.glass-strong` | 73–78 | Simple properties |
| `.glass-card` | 80–82 | Uses `@apply glass` — must come after `.glass` definition |
| `.bg-gradient-radial` | 85–87 | References `var(--color-gradient-from/to)` → rename to `var(--gradient-from/to)` |
| `.bg-gradient-mesh` | 89–97 | References `var(--color-bg-primary)` → rename to `var(--background)` |
| `.text-gradient` | 100–102 | **Problem:** uses `from-accent to-accent-secondary` — see Tailwind token aliases below. Also rename `bg-gradient-to-r` → `bg-linear-to-r` in the `@apply` directive (the upgrade tool should catch this, but verify) |
| `.scrollbar-thin` | 105–126 | **Complex:** has 4 nested `::webkit-scrollbar-*` pseudo-element rules — all must stay inside one `@utility scrollbar-thin { ... }` block |
| `.focus-ring` | 129–131 | References `ring-accent` and `ring-offset-[var(--color-bg-primary)]` — both need updating |
| `.animate-in` + `@keyframes` | 134–147 | The `@keyframes` block can stay outside or nest inside the `@utility` block |

Example migration for `.scrollbar-thin`:

```css
@utility scrollbar-thin {
  scrollbar-width: thin;
  scrollbar-color: var(--ring) transparent;

  &::-webkit-scrollbar {
    width: 6px;
    height: 6px;
  }
  &::-webkit-scrollbar-track {
    background: transparent;
  }
  &::-webkit-scrollbar-thumb {
    background: var(--ring);
    border-radius: 3px;
  }
  &::-webkit-scrollbar-thumb:hover {
    background: var(--muted-foreground);
  }
}
```

### Global CSS rules referencing `var(--color-*)` (`index.css`)

The find-and-replace in Section 0.3 covers component files, but `index.css` itself has 15+ `var(--color-*)` references in global rules that also need renaming:

| Location | Old reference | New reference |
|----------|--------------|---------------|
| `body` (line 59) | `var(--color-bg-primary)` | `var(--background)` |
| `body` (line 60) | `var(--color-text-primary)` | `var(--foreground)` |
| `.glass` (line 67) | `var(--color-surface)` | `var(--secondary)` |
| `.glass` (line 70) | `var(--color-border)` | `var(--border)` |
| `.bg-gradient-radial` (line 86) | `var(--color-gradient-from/to)` | `var(--gradient-from/to)` |
| `.bg-gradient-mesh` (line 96) | `var(--color-bg-primary)` | `var(--background)` |
| `.scrollbar-thin` (line 107) | `var(--color-border-strong)` | `var(--ring)` |
| `.scrollbar-thin:hover` (line 125) | `var(--color-text-muted)` | `var(--muted-foreground)` |
| `.focus-ring` (line 130) | `ring-offset-[var(--color-bg-primary)]` | `ring-offset-background` |
| Global scrollbar (line 160) | `var(--color-border-strong)` | `var(--ring)` |
| Global scrollbar hover (line 165) | `var(--color-text-muted)` | `var(--muted-foreground)` |
| `:focus-visible` (line 182) | `var(--color-accent)` | `var(--primary)` |
| `pre` (line 205) | `var(--color-bg-tertiary)` | `var(--muted)` |
| `code` (line 210) | `var(--color-surface)` | `var(--secondary)` |

**These are part of the same find-and-replace in Section 0.3** — just ensure `index.css` is included in the scope (not just `.tsx`/`.ts` files).

### Critical: `--color-*` namespace collision

Our CSS variables use `--color-bg-primary`, `--color-border`, etc. Tailwind v4 uses the `--color-*` namespace internally for its theme system (e.g., `--color-background: var(--background)`). **Our custom `--color-*` variables will collide.**

This is resolved in Phase 0.3 by renaming our CSS variables to shadcn conventions (`--background`, `--foreground`, etc.) and registering them via `@theme inline`.

### Dark mode

Tailwind v4 does NOT auto-detect the `.dark` class. Must explicitly declare:

```css
@custom-variant dark (&:where(.dark, .dark *));
```

### Update manual chunks in `vite.config.ts`

The current `manualChunks` config (lines 38–51) includes `react-syntax-highlighter` in the `markdown` chunk. This will be removed in Phase 1 (Shiki migration), but for now keep it.

### Verification

```bash
pnpm --filter aperture-web build
# Visual: check every page in browser for styling regressions
```

---

## 0.3 Migrate HUD theme variables to shadcn CSS conventions

### Current variables (`web/src/index.css`)

15 custom variables defined in `:root` and `.dark`:

| Current variable | Light value | Dark value |
|-----------------|-------------|------------|
| `--color-bg-primary` | `#f8f9fc` | `#0a0a0f` |
| `--color-bg-secondary` | `#ffffff` | `#12121a` |
| `--color-bg-tertiary` | `#f1f3f9` | `#1a1a24` |
| `--color-surface` | `rgba(0,0,0,0.02)` | `rgba(255,255,255,0.03)` |
| `--color-surface-hover` | `rgba(0,0,0,0.04)` | `rgba(255,255,255,0.06)` |
| `--color-surface-active` | `rgba(0,0,0,0.06)` | `rgba(255,255,255,0.09)` |
| `--color-border` | `rgba(0,0,0,0.06)` | `rgba(255,255,255,0.08)` |
| `--color-border-strong` | `rgba(0,0,0,0.12)` | `rgba(255,255,255,0.15)` |
| `--color-text-primary` | `rgba(0,0,0,0.9)` | `rgba(255,255,255,0.95)` |
| `--color-text-secondary` | `rgba(0,0,0,0.6)` | `rgba(255,255,255,0.65)` |
| `--color-text-muted` | `rgba(0,0,0,0.4)` | `rgba(255,255,255,0.4)` |
| `--color-accent` | `#00f5a0` | `#00f5a0` |
| `--color-accent-hover` | `#00d68f` | `#00d68f` |
| `--color-gradient-from` | `#f0fdf4` | `#0f172a` |
| `--color-gradient-to` | `#e0e7ff` | `#1e1b4b` |

### Variable mapping to shadcn conventions

| Old variable | New shadcn variable | Purpose |
|-------------|-------------------|---------|
| `--color-bg-primary` | `--background` | Page background |
| `--color-bg-secondary` | `--card` | Card/elevated surface |
| `--color-bg-tertiary` | `--muted` | Muted/subtle background |
| `--color-surface` | `--secondary` | Interactive surface |
| `--color-surface-hover` | `--secondary-hover` (custom) | Surface hover |
| `--color-surface-active` | `--secondary-active` (custom) | Surface active |
| `--color-border` | `--border` | Default border |
| `--color-border-strong` | `--ring` | Focus ring / strong border |
| `--color-text-primary` | `--foreground` | Primary text |
| `--color-text-secondary` | `--muted-foreground` | Secondary text |
| `--color-text-muted` | `--muted-foreground` | Share with secondary (same semantic) |
| `--color-accent` (#00f5a0) | `--primary` | Primary action (neon green) |
| `--color-accent-hover` | `--primary-hover` (custom) | Primary hover |
| `#0a0a0f` on accent | `--primary-foreground` | Text on primary |
| `--color-gradient-from` | `--gradient-from` (custom) | Gradient start |
| `--color-gradient-to` | `--gradient-to` (custom) | Gradient end |

New variables to add (required by shadcn components):

| Variable | Value | Purpose |
|----------|-------|---------|
| `--accent` | `#7c3aed` | Purple accent |
| `--accent-foreground` | `#ffffff` | Text on accent |
| `--destructive` | `#ef4444` | Danger/error |
| `--destructive-foreground` | `#ffffff` | Text on destructive |
| `--popover` | same as `--card` | Popover bg |
| `--popover-foreground` | same as `--foreground` | Popover text |
| `--card-foreground` | same as `--foreground` | Card text |
| `--secondary-foreground` | same as `--foreground` | |
| `--input` | same as `--border` | Input border |
| `--radius` | `0.75rem` | Default border radius |
| `--success` | `#22c55e` | Custom — keep from current |
| `--warning` | `#f59e0b` | Custom — keep from current |

### Find-and-replace across `web/src/`

**Order matters** — do the most specific patterns first to avoid partial matches:

```
1. var(--color-bg-secondary)    → var(--card)
2. var(--color-bg-tertiary)     → var(--muted)
3. var(--color-bg-primary)      → var(--background)
4. var(--color-surface-hover)   → var(--secondary-hover)
5. var(--color-surface-active)  → var(--secondary-active)
6. var(--color-surface)         → var(--secondary)
7. var(--color-border-strong)   → var(--ring)
8. var(--color-border)          → var(--border)
9. var(--color-text-secondary)  → var(--muted-foreground)
10. var(--color-text-primary)   → var(--foreground)
11. var(--color-text-muted)     → var(--muted-foreground)
12. var(--color-accent-hover)   → var(--primary-hover)
13. var(--color-accent)         → var(--primary)
14. var(--color-gradient-from)  → var(--gradient-from)
15. var(--color-gradient-to)    → var(--gradient-to)
```

**Scope:** `var(--color-*` references are used across **41 files** (422 occurrences) including `index.css` itself (see global CSS rules list above). Ensure the find-and-replace covers `.css`, `.tsx`, and `.ts` files. This is the highest-churn step.

After replacement, also convert Tailwind arbitrary value syntax:
- `bg-[var(--background)]` → `bg-background` (now a theme utility)
- `text-[var(--foreground)]` → `text-foreground`
- `border-[var(--border)]` → `border-border`
- etc.

**Scope:** There are **405 occurrences across 39 files** of `bg-[var(--color-*)]`, `text-[var(--color-*)]`, `border-[var(--color-*)]` patterns. After the `var(--color-*)` rename, these become e.g. `bg-[var(--background)]` which still works — the `var()` syntax is valid in Tailwind v4. The simplification to `bg-background` is cosmetic, not functional.

**Defer to Phase 8 cleanup.** The arbitrary value syntax works correctly in Tailwind v4, so this is a polish task, not a breaking change. The 405 occurrences can be batch-converted via regex:

```bash
# Example: convert bg-[var(--background)] → bg-background
# Run after Phase 0 is stable
```

### Glass morphism utilities (`web/src/index.css:65–82`)

Update the `.glass` CSS class to use new variable names. The `-webkit-backdrop-filter` prefix is intentionally dropped — Safari unprefixed `backdrop-filter` in 15.4, and Vite 8's `baseline-widely-available` target requires Safari 16.4+:

```css
.glass {
  backdrop-filter: blur(20px);
  background: var(--secondary);
  border: 1px solid var(--border);
}
.glass-strong {
  backdrop-filter: blur(40px);
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.12);
}
```

### Tailwind config token aliases (`tailwind.config.ts` → `@theme inline`)

When `tailwind.config.ts` is deleted, all custom color tokens defined there (`accent`, `danger`, `warning`, `success`) stop generating Tailwind utility classes. These tokens are used extensively across the codebase as utility classes (not `var()` references):

| Token | Utility classes generated | Occurrences | Files |
|-------|--------------------------|-------------|-------|
| `accent` (`DEFAULT`, `hover`, `secondary`) | `text-accent`, `bg-accent`, `ring-accent`, `bg-accent/10`, etc. | 422 | 41 |
| `danger` | `text-danger`, `bg-danger`, `border-danger` | 40 | 21 |
| `success` | `text-success`, `bg-success`, `border-success` | 23 | 14 |
| `warning` | `text-warning`, `bg-warning`, `border-warning` | 10 | 6 |

**Strategy: Register backward-compatible aliases in `@theme inline`** rather than renaming all 495 occurrences across 41 files. This keeps Phase 0 safe and the rename can happen gradually in later phases:

```css
@theme inline {
  /* ... shadcn mappings ... */

  /* Backward-compatible aliases for existing utility classes */
  --color-accent: var(--primary);
  --color-accent-hover: var(--primary-hover);
  --color-accent-secondary: #7c3aed;  /* was accent.secondary in tailwind.config */
  --color-danger: var(--destructive);
  --color-warning: var(--warning);
  --color-success: var(--success);
}
```

This ensures `text-accent`, `bg-accent/10`, `text-danger`, `bg-warning`, `bg-success`, etc. all continue working. The `.text-gradient` utility in `index.css` uses `from-accent to-accent-secondary` — these will resolve to `from-primary` and `to-accent-secondary` respectively via the aliases above.

**Note:** The `nebula.*` and `pearl.*` color palettes in `tailwind.config.ts:10–52` have **zero usages** anywhere in the codebase — they generate utility classes like `bg-nebula-bg-primary` that are never referenced. Their deletion is a no-op.

### New `index.css` structure

See the master plan `ai-elements-refactor.md` Phase 0.3 for the complete CSS file. Key structure:

```css
@import "tailwindcss";
@import "tw-animate-css";

@custom-variant dark (&:where(.dark, .dark *));

:root { /* light theme variables (renamed from --color-* to shadcn names) */ }
.dark { /* dark theme variables */ }

@theme inline {
  /* Bridge CSS vars → Tailwind utilities (shadcn standard) */
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-card: var(--card);
  --color-card-foreground: var(--card-foreground);
  --color-popover: var(--popover);
  --color-popover-foreground: var(--popover-foreground);
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  --color-secondary: var(--secondary);
  --color-secondary-foreground: var(--secondary-foreground);
  --color-muted: var(--muted);
  --color-muted-foreground: var(--muted-foreground);
  --color-border: var(--border);
  --color-input: var(--input);
  --color-ring: var(--ring);
  --color-destructive: var(--destructive);
  --color-destructive-foreground: var(--destructive-foreground);

  /* Custom extensions (not in shadcn standard) */
  --color-primary-hover: var(--primary-hover);
  --color-secondary-hover: var(--secondary-hover);
  --color-secondary-active: var(--secondary-active);
  --color-gradient-from: var(--gradient-from);
  --color-gradient-to: var(--gradient-to);

  /* Backward-compatible aliases for existing utility classes (495 usages) */
  --color-accent: var(--primary);
  --color-accent-hover: var(--primary-hover);
  --color-accent-foreground: var(--primary-foreground); /* text on accent — dark (#0a0a0f) since accent is neon green */
  --color-accent-secondary: #7c3aed;
  --color-danger: var(--destructive);
  --color-warning: var(--warning);
  --color-success: var(--success);
}

@theme {
  /* Static tokens: fonts, animations */
}
```

### Verification

```bash
# Check no old variable references remain
grep -rn "var(--color-" web/src/ --include="*.tsx" --include="*.ts" --include="*.css"
# Should return 0 results (except maybe in comments)

pnpm --filter aperture-web build
# Visual: check every page for color regressions
```

---

## 0.4 Install shadcn/ui

```bash
cd web
pnpm dlx shadcn@latest init
```

### `components.json` for this project

```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "new-york",
  "rsc": false,
  "tsx": true,
  "tailwind": {
    "config": "",
    "css": "src/index.css",
    "baseColor": "neutral",
    "cssVariables": true
  },
  "aliases": {
    "components": "@/components",
    "utils": "@/utils/cn",
    "ui": "@/components/ui",
    "lib": "@/lib",
    "hooks": "@/hooks"
  },
  "iconLibrary": "lucide"
}
```

**Key decisions:**
- `"rsc": false` — Vite, not Next.js
- `"config": ""` — Tailwind v4, no config file
- `"utils": "@/utils/cn"` — reuse existing `cn()` at `web/src/utils/cn.ts` (already has `clsx` + `tailwind-merge`)
- `"style": "new-york"` — current shadcn default

### tsconfig alias check

`web/tsconfig.json` already has `@/*` path alias (line 19–21). No `tsconfig.app.json` exists — only `tsconfig.json` and `tsconfig.node.json`. The shadcn docs recommend both files have the alias, but since this project only uses `tsconfig.json` for app code, it's fine.

### Vite alias check

`web/vite.config.ts` already has `'@': './src'` alias (line 9). No changes needed.

---

## 0.5 Install ai-elements components

```bash
cd web
pnpm dlx ai-elements@latest add conversation message prompt-input tool reasoning code-block confirmation shimmer terminal checkpoint
```

This copies ~10 component source files into `web/src/components/ai-elements/`. The CLI also auto-installs required shadcn base components and their Radix UI dependencies.

**Post-install:** If any component source uses `framer-motion` imports, replace with `motion/react`:

```bash
grep -rn "framer-motion" web/src/components/ai-elements/ --include="*.tsx"
# Replace: "framer-motion" → "motion/react"
```

---

## 0.6 Install peer dependencies

```bash
pnpm --filter aperture-web add \
  @radix-ui/react-collapsible \
  use-stick-to-bottom \
  remark-math \
  rehype-katex \
  motion \
  tw-animate-css@1.4.0
```

**Note:** `motion` is the rebranded `framer-motion` (v12+). Import path: `motion/react`.

Already installed (no action): `react-markdown`, `remark-gfm`, `lucide-react`, `clsx`, `tailwind-merge`.

### Update `vite.config.ts` — see Section 0.7 for the full Vite 8 migration

The current `manualChunks` function format (lines 32–52) must be migrated to Vite 8's `advancedChunks` API. See Section 0.7 for details.

---

## 0.7 Upgrade Vite 5 → 8 + @vitejs/plugin-react 4 → 6

### Why upgrade now

Vite 8 replaces esbuild/Rollup with Rolldown (10–30x faster builds). The `@tailwindcss/vite` plugin works with Vite 8. Upgrading now avoids doing a second `vite.config.ts` migration later.

**Node.js requirement:** 20.19+ or 22.12+ or 24+. Current: **v24.14.0** — no action needed.

### Install

```bash
pnpm --filter aperture-web add -D vite@8 @vitejs/plugin-react@6
```

### Breaking changes affecting us

| Change | Vite version | Impact | Action |
|--------|-------------|--------|--------|
| `build.rollupOptions` → `build.rolldownOptions` | 7→8 | Our config uses `rollupOptions` | Rename |
| `manualChunks` function deprecated | 8 | We use `manualChunks(id)` function | Migrate to `advancedChunks` |
| `manualChunks` object form removed | 8 | N/A (we use function form) | N/A |
| Default browser target → `baseline-widely-available` | 7 | Slightly different browser support floor | Acceptable — Chrome 111+, Safari 16.4+ |
| Oxc replaces esbuild for minification | 8 | Transparent | None |
| Lightning CSS replaces esbuild for CSS minification | 8 | Transparent | None |
| `commonjsOptions` is now a no-op | 8 | We don't set it | None |
| Babel removed from plugin-react v6 | 6 | We don't use Babel plugins | None |

### Migrate `vite.config.ts`

**Before** (current, Vite 5):

```ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 3000,
    proxy: {
      '/v1': { target: 'http://localhost:8080', changeOrigin: true },
      '/healthz': { target: 'http://localhost:8080', changeOrigin: true },
      '/readyz': { target: 'http://localhost:8080', changeOrigin: true },
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/react-dom') || id.includes('node_modules/react/')) {
            return 'react'
          }
          // ... etc
        },
      },
    },
  },
})
```

**After** (Vite 8 — without `@tailwindcss/vite`, which is added later in step 0.2):

```ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 3000,
    proxy: {
      '/v1': { target: 'http://localhost:8080', changeOrigin: true },
      '/healthz': { target: 'http://localhost:8080', changeOrigin: true },
      '/readyz': { target: 'http://localhost:8080', changeOrigin: true },
    },
  },
  build: {
    rolldownOptions: {
      output: {
        advancedChunks: {
          groups: [
            { name: 'react', test: /\/node_modules\/react(-dom)?\//, priority: 10 },
            { name: 'router', test: /\/node_modules\/react-router(-dom)?\//, priority: 9 },
            { name: 'query', test: /\/node_modules\/@tanstack\/react-query/, priority: 8 },
            { name: 'state', test: /\/node_modules\/zustand/, priority: 7 },
            {
              name: 'markdown',
              test: /\/node_modules\/(react-markdown|remark-gfm|react-syntax-highlighter)\//,
              priority: 6,
            },
          ],
        },
      },
    },
  },
})
```

**Key differences:**
- `rollupOptions` → `rolldownOptions`
- `manualChunks(id) { if (id.includes(...)) }` → `advancedChunks.groups[{ name, test: RegExp }]`
- `priority` controls which group wins if a module matches multiple (higher wins)
- Router regex uses `react-router(-dom)?` to match both package names (updated to just `react-router` in step 0.9)
- `@tailwindcss/vite` plugin is NOT added here — that happens in step 0.2

### Verification

```bash
pnpm --filter aperture-web build
pnpm --filter aperture-web dev
# Verify: dev server starts, HMR works, proxy routes to backend
```

---

## 0.8 Upgrade Vitest 1 → 4 + jsdom 23 → 28 + @testing-library/react 14 → 16

### Install

```bash
pnpm --filter aperture-web add -D vitest@4 jsdom@28 @testing-library/react@16
```

### Breaking changes across Vitest 1 → 2 → 3 → 4

| Change | Version | Impact | Action |
|--------|---------|--------|--------|
| Default pool: `threads` → `forks` | 2 | Minor perf difference | None |
| Hooks run serially (were parallel) | 2 | Tests relying on parallel hooks | None (our tests are simple) |
| Snapshot format changed (backtick quotes) | 2 | Snapshots need regeneration | Run `pnpm test -- -u` |
| `vi.fn().getMockName()` returns `"vi.fn()"` not `"spy"` | 4 | Breaks snapshot tests capturing mock names | Update snapshots |
| Third-arg options `test('name', fn, { retry: 3 })` **throws** | 4 | Must use second-arg form | Check tests |
| `poolOptions` removed | 4 | All options are top-level now | N/A (we use defaults) |
| `coverage.all` removed | 4 | Use `coverage.include` instead | N/A (no coverage config) |
| Default `exclude` only covers `node_modules`/`.git` | 4 | May lint unintended dirs | Add explicit excludes |
| `basic` reporter removed | 4 | Use `default` or `verbose` | N/A (we use default) |
| vite-node replaced by Vite Module Runner | 4 | Transparent | None |
| Requires Vite 6+ | 4 | We're on Vite 8 | OK |

### No vitest config file exists

Currently using Vitest defaults (no `vitest.config.ts`, no `test:` section in `vite.config.ts`). For Vitest 4, add explicit excludes since the default changed:

**Add to `vite.config.ts`:**

First, add the Vitest type augmentation at the very top of the file (before any imports). Without this, `defineConfig` from `'vite'` doesn't know about the `test` key and `type-check` will fail:

```ts
/// <reference types="vitest/config" />
```

Then add the `test` config:

```ts
export default defineConfig({
  // ... existing config ...
  test: {
    environment: 'jsdom',
    exclude: ['node_modules', '.git', 'dist'],
  },
})
```

### jsdom 28 breaking changes

| Change | Impact |
|--------|--------|
| `getComputedStyle()` accounts for CSS specificity | May break style assertions |
| Resource loading API overhauled | N/A (we don't use custom resource loaders) |
| User agent stylesheet from HTML Standard | May change computed style values |

### @testing-library/react 16

No API changes affecting us. Known warning: `"The current testing environment is not configured to support act(...)"` — tests pass correctly despite this. Suppress in test setup if noisy:

```ts
// web/src/test-setup.ts (if needed)
globalThis.IS_REACT_ACT_ENVIRONMENT = true
```

### Verification

```bash
pnpm --filter aperture-web test
# If snapshots fail:
pnpm --filter aperture-web test -- -u
```

---

## 0.9 Upgrade react-router-dom v6 → react-router v7

### Package swap

```bash
pnpm --filter aperture-web remove react-router-dom
pnpm --filter aperture-web add react-router@7
```

The package is renamed: `react-router-dom` → `react-router`. All exports move to the new package.

### Import path changes (11 files)

Find-and-replace across all files:

```
"react-router-dom" → "react-router"
'react-router-dom' → 'react-router'
```

**Files affected:**

| File | Imports used |
|------|-------------|
| `web/src/App.tsx` | `Routes, Route, Navigate, useNavigate, useLocation` |
| `web/src/main.tsx` | `BrowserRouter` |
| `web/src/pages/Workspace.tsx` | `useParams, useNavigate` |
| `web/src/pages/Workspaces.tsx` | `useNavigate` |
| `web/src/pages/Sessions.tsx` | `useNavigate, useLocation` |
| `web/src/pages/Settings.tsx` | routing hooks |
| `web/src/pages/Onboarding.tsx` | `useNavigate` |
| `web/src/components/layout/Sidebar.tsx` | `useLocation, useNavigate` |
| `web/src/components/layout/Shell.tsx` | `Outlet` |
| `web/src/components/layout/CommandPalette.tsx` | `useNavigate` |
| `web/src/components/layout/Topbar.tsx` | routing hooks |

All APIs (`BrowserRouter`, `Routes`, `Route`, `Navigate`, `useNavigate`, `useParams`, `useLocation`, `Outlet`) are unchanged — only the import source moves.

### Splat route migration

`App.tsx:66` uses `path="/*"` — this is affected by the `v7_relativeSplatPath` behavioral change. However, our nested routes inside it (`workspace`, `sessions`, etc.) use **absolute-style paths** (no leading `/` but also no `../` relative links), so this should work without changes.

**Pre-migration safety step:** Before upgrading, add future flags to verify no breakage:

```tsx
// In main.tsx, temporarily:
<BrowserRouter future={{ v7_relativeSplatPath: true, v7_startTransition: true }}>
```

Run the app, verify all navigation works, then commit. After upgrading to v7, remove the `future` prop (these are now defaults).

### `React.lazy()` calls

All `lazy()` calls in `App.tsx:8–14` are at **module scope** — safe for `v7_startTransition`. No changes needed.

### `eslint-disable` comment

`App.tsx:51` has `// eslint-disable-next-line react-hooks/exhaustive-deps` — this will still work after the ESLint migration (Section 0.10).

### Update `vite.config.ts` advancedChunks

The router chunk regex from step 0.7 used `react-router(-dom)?` to match both packages. Now that `react-router-dom` is uninstalled, simplify:

```ts
// In advancedChunks.groups — simplify from /react-router(-dom)?/ to:
{ name: 'router', test: /\/node_modules\/react-router\//, priority: 9 },
```

### Verification

```bash
pnpm --filter aperture-web type-check
pnpm --filter aperture-web build
# Manual: navigate every route, verify no broken links
```

---

## 0.10 Upgrade ESLint 8 → 10 + typescript-eslint v8 + react-hooks v7

### Install

```bash
pnpm --filter aperture-web remove \
  @typescript-eslint/eslint-plugin \
  @typescript-eslint/parser \
  eslint-plugin-react-hooks \
  eslint-plugin-react-refresh \
  eslint

pnpm --filter aperture-web add -D \
  eslint@10 \
  @eslint/js \
  typescript-eslint@8 \
  globals \
  eslint-plugin-react-hooks@7 \
  eslint-plugin-react-refresh@0.5
```

### Delete old config

```bash
rm web/.eslintrc.cjs
```

### Current config (`web/.eslintrc.cjs` — 19 lines)

```js
module.exports = {
  root: true,
  env: { browser: true, es2020: true },
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:react-hooks/recommended',
  ],
  ignorePatterns: ['dist', '.eslintrc.cjs'],
  parser: '@typescript-eslint/parser',
  plugins: ['react-refresh'],
  rules: {
    'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
  },
}
```

### New config (`web/eslint.config.js`)

```js
import js from '@eslint/js'
import globals from 'globals'
import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    rules: {
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    },
  },
  reactRefresh.configs.vite(),
])
```

**Key migration notes:**

| Old (`.eslintrc.cjs`) | New (`eslint.config.js`) |
|---|---|
| `env: { browser: true }` | `languageOptions: { globals: globals.browser }` |
| `extends: ['eslint:recommended']` | `js.configs.recommended` (imported object) |
| `extends: ['plugin:@typescript-eslint/recommended']` | `tseslint.configs.recommended` |
| `extends: ['plugin:react-hooks/recommended']` | `reactHooks.configs.flat.recommended` |
| `parser: '@typescript-eslint/parser'` | Handled by `tseslint.configs.recommended` |
| `plugins: ['react-refresh']` | `reactRefresh.configs.vite()` |
| `ignorePatterns: ['dist']` | `globalIgnores(['dist'])` |
| `root: true` | Not needed — flat config is always root |

### Update `package.json` lint script

```json
{
  "scripts": {
    "lint": "eslint . --report-unused-disable-directives --max-warnings 0"
  }
}
```

Remove `--ext ts,tsx` — file extensions are handled by `files` globs in the config. Keep `--report-unused-disable-directives` (flags stale `// eslint-disable` comments) and `--max-warnings 0` to preserve the existing CI enforcement.

### New rules from react-hooks v7

React Compiler rules are now enabled by default (as warnings). New rules:

- `react-hooks/purity` — flags impure render-time operations
- `react-hooks/refs` — flags ref access during render
- `react-hooks/set-state-in-effect` — flags setState patterns in effects

These are **warnings** in `recommended`, not errors. Review output and suppress any false positives as needed.

### Verify `react-refresh` preset

The current config explicitly sets `allowConstantExport: true` for `react-refresh/only-export-components`. Verify that `reactRefresh.configs.vite()` includes this option. If not, add it explicitly:

```js
rules: {
  '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
  // Add only if reactRefresh.configs.vite() doesn't include allowConstantExport:
  'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
},
```

### Pre-existing lint issues

Known pre-existing errors in `repoCloner.ts`, `workspaces.ts`, `sdk-session.ts` (`no-useless-escape`, `no-inner-declarations`). These are backend files outside `web/` — the new config scopes to `web/` only.

### Verification

```bash
cd web && pnpm lint
# Fix any new errors/warnings
```

---

## 0.11 Upgrade lucide-react v0.309 → latest

### Install

```bash
pnpm --filter aperture-web add lucide-react@latest
```

### Renamed icon: `Edit3` → `PenLine`

`Edit3` was removed in lucide-react v0.262.0 and may be available as a deprecated alias. Two files import it:

| File | Line | Usage |
|------|------|-------|
| `web/src/components/session/ToolCallDisplay.tsx` | 3, 102 | `<Edit3 size={14} />` |
| `web/src/components/sdk/ToolInputDisplay.tsx` | 3, 109 | `<Edit3 size={14} />` |

**Fix:** Replace `Edit3` → `PenLine` in both import statements and JSX usage. Note: `AskUserQuestionDisplay.tsx:3` already imports `PenLine` — this is the correct canonical name.

### No other icon renames affect us

Cross-referencing all imported icons against the known rename list:

| Icon | Status |
|------|--------|
| `Check`, `X`, `Zap`, `Shield`, `Globe` | Unchanged |
| `Plus`, `Trash2`, `Key`, `Clock` | Unchanged |
| `ChevronDown`, `ChevronRight`, `ChevronLeft` | Unchanged |
| `AlertCircle`, `AlertTriangle`, `CheckCircle2` | Unchanged |
| `Search`, `File`, `Terminal`, `Copy` | Unchanged |
| `Loader2`, `Brain`, `RefreshCw` | Unchanged |
| `GitBranch`, `Folder`, `Server` | Unchanged |
| `Eye`, `EyeOff`, `Info`, `Menu` | Unchanged |
| `Wifi`, `WifiOff`, `StopCircle` | Unchanged |
| `User`, `Building2`, `CreditCard` | Unchanged |
| `Coins`, `ArrowDown`, `ArrowUp`, `Database` | Unchanged |
| `Lock`, `Bot`, `History`, `RotateCcw`, `FileText` | Unchanged |
| `MessageCircleQuestion`, `Circle`, `Square`, `CheckSquare` | Unchanged |
| `PenLine` | Unchanged (canonical name) |

### No `.lucide-*` CSS selectors

Confirmed: no CSS files target lucide class names. Safe to upgrade.

### Verification

```bash
pnpm --filter aperture-web type-check
# TypeScript will surface any deprecated/removed icons
```

---

## 0.12 Upgrade tailwind-merge v2 → v3

### Install

```bash
pnpm --filter aperture-web add tailwind-merge@3
```

**Critical:** tailwind-merge v3 **drops Tailwind CSS v3 support**. Only upgrade after Tailwind v4 is installed (Section 0.2). The version mapping:

| tailwind-merge | Tailwind CSS |
|---|---|
| v2.x | v3.x |
| v3.x | v4.x |

### Impact on `cn()` utility

`web/src/utils/cn.ts` uses the standard pattern:

```ts
import { twMerge } from 'tailwind-merge'
import { clsx, type ClassValue } from 'clsx'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
```

The `twMerge()` function signature is **unchanged** in v3. The `cn()` utility works as-is. No code changes needed.

### What changed internally

- Class resolution updated for Tailwind v4 utility names (e.g., `shadow-xs` vs `shadow-sm`)
- Theme scale keys match Tailwind v4's `@theme` variable namespaces
- `isLength` validator split into `isNumber` + `isFraction` (only affects custom `twMerge` configs)

### Verification

```bash
pnpm --filter aperture-web build
# Visual: check pages where cn() is used heavily (buttons, cards, inputs)
```

---

## Recommended execution order

The sub-phases have dependencies. Execute in this order:

```
0.1   React 19 + Zustand v5          (React must come first — many deps depend on it)
0.1.2 react-markdown check           (verify v10 still works with React 19)
0.7   Vite 8 + plugin-react v6       (build tooling — do before Tailwind since @tailwindcss/vite needs Vite)
0.8   Vitest 4 + jsdom 28 + RTL 16   (test tooling — do after Vite since Vitest 4 requires Vite 6+)
0.2   Tailwind v4                     (needs Vite 8 with @tailwindcss/vite plugin)
0.12  tailwind-merge v3               (must come after Tailwind v4)
0.3   Theme variable migration        (must come after Tailwind v4)
0.4   shadcn/ui init                  (needs Tailwind v4 + theme vars)
0.5   ai-elements install             (needs shadcn/ui)
0.6   Peer dependencies               (after ai-elements)
0.9   react-router v7                 (independent — can go anywhere after React 19)
0.10  ESLint 10                       (independent — can go anywhere)
0.11  lucide-react                    (independent — can go anywhere)
```

At each step, run `pnpm --filter aperture-web build` to verify no breakage.

---

## Verification checklist

### Build & test gates

- [ ] `pnpm --filter aperture-web type-check` passes
- [ ] `pnpm --filter aperture-web build` produces clean bundle
- [ ] `pnpm --filter aperture-web test` passes
- [ ] `pnpm --filter aperture-web lint` passes (or only pre-existing warnings)

### React 19 + Zustand 5

- [ ] No `forwardRef` usage remains in `web/src/components/ui/`
- [ ] Zustand stores work without infinite re-render loops

### Tailwind 4 + theme migration

- [ ] No `var(--color-` references remain in `.tsx`/`.ts`/`.css` files
- [ ] `web/tailwind.config.ts` deleted
- [ ] `web/postcss.config.js` deleted
- [ ] All 7 custom utilities migrated from `@layer utilities` to `@utility` blocks
- [ ] `@theme inline` includes backward-compatible aliases (`accent`, `danger`, `warning`, `success`)
- [ ] `text-accent`, `bg-danger`, `text-success`, `bg-warning` utility classes still work after config deletion
- [ ] Dark mode works (`.dark` class toggles correctly)
- [ ] All pages visually correct in both light and dark mode

### Vite 8

- [ ] `build.rolldownOptions` with `advancedChunks` replaces old `rollupOptions`/`manualChunks`
- [ ] Dev server starts, HMR works, proxy routes to backend
- [ ] `@tailwindcss/vite` plugin added

### Vitest 4 + testing

- [ ] All tests pass (regenerate snapshots with `-- -u` if needed)
- [ ] `test.exclude` explicitly set (Vitest 4 changed defaults)

### react-router v7

- [ ] `react-router-dom` uninstalled, `react-router` installed
- [ ] All 11 files import from `'react-router'` (not `'react-router-dom'`)
- [ ] All routes navigate correctly (especially the `/*` splat in `App.tsx`)
- [ ] `advancedChunks` router group regex updated to `/react-router/`

### ESLint 10

- [ ] `web/.eslintrc.cjs` deleted
- [ ] `web/eslint.config.js` created (flat config)
- [ ] No `eslint-env` comments remain in source files

### lucide-react

- [ ] `Edit3` replaced with `PenLine` in `ToolCallDisplay.tsx` and `ToolInputDisplay.tsx`
- [ ] `pnpm --filter aperture-web type-check` shows no deprecated icon warnings

### shadcn/ui + ai-elements

- [ ] ai-elements components installed in `web/src/components/ai-elements/`
- [ ] No `framer-motion` imports remain (all migrated to `motion/react`)

### tailwind-merge v3

- [ ] `cn()` utility works correctly with Tailwind v4 class merging
