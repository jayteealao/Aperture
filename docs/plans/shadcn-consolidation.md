# shadcn Consolidation Plan
## Migrate `web/src/components/ui/` to a single shadcn + ai-elements stack

**Status**: Not started
**Goal**: One UI primitive source of truth. Delete all hand-rolled PascalCase components that duplicate what shadcn/Radix already provides. Keep only what has no shadcn equivalent.

---

## Why

The `web/src/components/ui/` directory currently has two parallel systems:

| System | Files | Problem |
|--------|-------|---------|
| shadcn/ui generated | `accordion.tsx`, `alert.tsx`, `button-group.tsx`, `collapsible.tsx`, `command.tsx`, `dropdown-menu.tsx`, `hover-card.tsx`, `separator.tsx`, `tooltip.tsx` | Radix-backed, accessible, correct |
| Hand-rolled PascalCase | `Button.tsx`, `Card.tsx`, `Dialog.tsx`, `Dropdown.tsx`, `Input.tsx`, `Select.tsx`, `Skeleton.tsx`, `Textarea.tsx`, `Toast.tsx`, `Avatar.tsx`, `Badge.tsx` | No Radix — no focus traps, no keyboard nav, no aria management |

`Dialog.tsx` and `Dropdown.tsx` are the worst offenders: pure `useState`/`useRef` implementations with no accessibility primitives at all.

**Target stack after migration:**
```
Radix UI (headless, a11y)
    ↓
shadcn/ui generated files  ← single source of all UI primitives
    ↓
Thin project wrappers       ← ONLY for things with no shadcn equivalent
(Spinner, CodeHighlight, PanelSection, SkeletonCard)
    ↓
ai-elements                 ← AI interaction surface, unchanged
    ↓
Pages / feature components
```

---

## Pre-flight: Token Conflict

**Must resolve before adding any new shadcn components.**

In `src/index.css`, the `@theme inline` block maps:
```css
--color-accent: var(--primary);   /* green #00f5a0 */
--accent: #7c3aed;                /* purple — different token */
```

Shadcn-generated components use `bg-accent` / `text-accent-foreground` for focus rings, selected states, and hover highlights. In Aperture's theme this resolves to **green**, not purple. This is currently intentional (green is the primary interactive colour).

**Action required**: Before adding `dialog.tsx`, `badge.tsx`, or `button.tsx` from the shadcn registry, verify each generated file's `focus:bg-accent` / `data-[selected]:bg-accent` usages look correct in the app. If any resolve incorrectly, patch the specific class in the generated file — do NOT rename the token globally, it would cascade.

---

## What to Keep (No shadcn Equivalent)

These files stay. Do not migrate.

| File | Reason |
|------|--------|
| `Spinner.tsx` | No shadcn equivalent. Used by `Button.tsx` loading state and 12 other files. Keep. |
| `CodeHighlight.tsx` | Bespoke Shiki + app theme store integration. No shadcn equivalent. Keep. |
| `PanelSection.tsx` | Domain composite (collapsible control panel section). Already built on `collapsible.tsx` primitive. Move to `components/layout/` in a future cleanup if desired, but no migration needed. |

---

## What to Split (Cleanup Only, No Consumer Changes)

### `Select.tsx` → split into two files

`Select.tsx` currently exports two unrelated APIs:
1. `FormSelect` — native `<select>` wrapper with label/error/hint
2. `Select`, `SelectTrigger`, `SelectContent`, `SelectItem`, `SelectValue`, etc. — Radix Select compound (already effectively shadcn)

**Action**: Split into `form-select.tsx` (native wrapper) and `select.tsx` (rename the Radix compound to lowercase, aligning with shadcn conventions). Update the 5 consumers:
- `FormSelect` consumers: `pages/Credentials.tsx`, `components/pi/PiThinkingLevelSelector.tsx`, `components/sdk/SdkSessionHeader.tsx`
- Radix compound consumers: `components/ai-elements/code-block.tsx`, `components/ai-elements/prompt-input.tsx`

No behaviour changes. Import paths change only.

---

## Migration Phases

Ordered lowest-risk to highest-risk. Each phase is independently shippable.

---

### Phase 1 — Zero-consumer swaps (Avatar, Skeleton)

**Risk**: Trivial. No consumers to update.

#### 1a. Avatar

Delete `Avatar.tsx`. Add shadcn `avatar.tsx`:
```bash
npx shadcn add avatar
```
Generated exports: `Avatar`, `AvatarImage`, `AvatarFallback`

The old `Avatar` had an opinionated initials fallback — this logic moves to callsites (none currently exist, so nothing to migrate). When a consumer is eventually added, use:
```tsx
<Avatar>
  <AvatarImage src={src} />
  <AvatarFallback>{initials(name)}</AvatarFallback>
</Avatar>
```

**Files to delete**: `Avatar.tsx`
**Files to add**: `avatar.tsx` (shadcn generated)
**Consumer updates**: 0

---

#### 1b. Skeleton

Delete `Skeleton.tsx`. Add shadcn `skeleton.tsx`:
```bash
npx shadcn add skeleton
```
Generated export: `Skeleton` — `animate-pulse rounded-md bg-muted` div.

The `SkeletonText` and `SkeletonCard` composites are not in shadcn. Keep them as a separate `skeleton-composites.tsx` file that imports the new `skeleton.tsx`:

```tsx
// skeleton-composites.tsx
import { Skeleton } from './skeleton'

export function SkeletonText({ lines = 3, className }: { lines?: number; className?: string }) { ... }
export function SkeletonCard({ className }: { className?: string }) { ... }
```

Update 2 consumers:
- `pages/Credentials.tsx` — change import to `'@/components/ui/skeleton-composites'`
- `pages/Sessions.tsx` — change import to `'@/components/ui/skeleton-composites'`

**Files to delete**: `Skeleton.tsx`
**Files to add**: `skeleton.tsx` (shadcn), `skeleton-composites.tsx` (project)
**Consumer updates**: 2 (import path only)

---

### Phase 2 — Single-consumer swaps (Dropdown, Textarea)

**Risk**: Low. 1 external consumer each.

#### 2a. Dropdown → Select compound

`Dropdown.tsx` is a hand-rolled controlled value picker (not a menu). Its single consumer is `pages/Sessions.tsx` which uses it as a `value`/`onChange` select. The Radix Select compound in `Select.tsx` is the correct replacement.

**Mapping**:
```tsx
// Before (Dropdown.tsx)
<Dropdown
  options={[{ value: 'a', label: 'Option A' }]}
  value={selected}
  onChange={setSelected}
  label="Choose"
/>

// After (Select compound from Select.tsx)
<div className="flex flex-col gap-1">
  <label className="text-sm text-muted-foreground">Choose</label>
  <Select value={selected} onValueChange={setSelected}>
    <SelectTrigger>
      <SelectValue />
    </SelectTrigger>
    <SelectContent>
      <SelectItem value="a">Option A</SelectItem>
    </SelectContent>
  </Select>
</div>
```

Update `pages/Sessions.tsx` (2 call sites, lines 439 and 467).

**Files to delete**: `Dropdown.tsx`
**Consumer updates**: `pages/Sessions.tsx` (2 usages)

---

#### 2b. Textarea

Delete `Textarea.tsx`. Add shadcn `textarea.tsx`:
```bash
npx shadcn add textarea
```
Generated export: `Textarea` — bare styled `<textarea>`.

The `autoGrow`, `label`, `error`, `hint` features must be preserved. Add a project wrapper `textarea-field.tsx`:

```tsx
// textarea-field.tsx — thin wrapper, project-specific concerns only
import { Textarea } from './textarea'

interface TextareaFieldProps extends React.ComponentProps<typeof Textarea> {
  label?: string
  error?: string
  hint?: string
  autoGrow?: boolean
  maxHeight?: number
}

export function TextareaField({ label, error, hint, autoGrow, maxHeight = 200, ...props }: TextareaFieldProps) {
  const internalRef = useRef<HTMLTextAreaElement>(null)

  const adjustHeight = useCallback(() => {
    const el = internalRef.current
    if (!el || !autoGrow) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, maxHeight)}px`
  }, [autoGrow, maxHeight])

  // ... same autoGrow logic as current Textarea.tsx

  return (
    <div className="w-full flex flex-col gap-1">
      {label && <label className="text-sm font-medium text-foreground">{label}</label>}
      <Textarea ref={...} onInput={adjustHeight} data-invalid={!!error} {...props} />
      {error && <p className="text-xs text-destructive">{error}</p>}
      {hint && !error && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}
```

Update consumers:
- `pages/Workspaces.tsx` — change to `TextareaField` from `'@/components/ui/textarea-field'`
- `components/ui/input-group.tsx` — update `InputGroupTextarea` to use `TextareaField`

**Files to delete**: `Textarea.tsx`
**Files to add**: `textarea.tsx` (shadcn), `textarea-field.tsx` (project wrapper)
**Consumer updates**: `pages/Workspaces.tsx`, `components/ui/input-group.tsx`

---

### Phase 3 — Badge

**Risk**: Medium. 13 consumers but API surface is simple (`variant` only).

Delete `Badge.tsx`. Add shadcn `badge.tsx`:
```bash
npx shadcn add badge
```
Shadcn generated variants: `default`, `secondary`, `destructive`, `outline`.

Extend the generated CVA definition to add the project's custom variants. In the generated `badge.tsx`, add to the `variants.variant` object:

```ts
// Add to the cva variants block in badge.tsx:
accent: 'border-transparent bg-accent/10 text-accent',
success: 'border-transparent bg-success/10 text-success',
warning: 'border-transparent bg-warning/10 text-warning',
danger: 'border-transparent bg-destructive/10 text-destructive',
```

Also add the `size` variant (not in shadcn):
```ts
size: {
  default: 'px-2.5 py-0.5 text-xs',
  sm:      'px-2 text-[11px]',
  md:      'px-2.5 py-1 text-xs',
},
defaultVariants: {
  variant: 'default',
  size: 'default',
},
```

Update `BadgeProps` to include `size?: 'default' | 'sm' | 'md'`.

**Consumer updates**: 13 files — import path changes from `'@/components/ui/Badge'` to `'@/components/ui/badge'` (case change). No prop changes required if variant names are preserved exactly.

Files:
- `components/ai-elements/tool.tsx`
- `components/sdk/ToolInputDisplay.tsx`
- `components/layout/Topbar.tsx`
- `components/pi/PiSessionTree.tsx`
- `components/pi/PiControlPanel.tsx`
- `components/pi/PiSessionHeader.tsx`
- `components/sdk/SdkAccountInfo.tsx`
- `components/sdk/SdkMcpStatus.tsx`
- `pages/Credentials.tsx`
- `pages/Settings.tsx`
- `pages/Sessions.tsx`
- `pages/WorkspaceUseChat.tsx`
- `pages/Workspaces.tsx`

**Files to delete**: `Badge.tsx`
**Files to add**: `badge.tsx` (shadcn + extended)
**Consumer updates**: 13 (import path case change only)

---

### Phase 4 — Card

**Risk**: Medium. 10 consumers. The `CardHeader` API differs from shadcn's.

Delete `Card.tsx`. Add shadcn `card.tsx`:
```bash
npx shadcn add card
```
Shadcn generates: `Card`, `CardHeader`, `CardTitle`, `CardDescription`, `CardContent`, `CardFooter`.

**Key difference**: Shadcn's `CardHeader` takes `children`, not `title`/`subtitle`/`action` props. The current custom `CardHeader` is opinionated:
```tsx
<CardHeader title="My title" subtitle="subtitle" action={<Button />} />
```
After migration this becomes:
```tsx
<CardHeader>
  <div className="flex items-start justify-between gap-4">
    <div>
      <CardTitle>My title</CardTitle>
      <CardDescription>subtitle</CardDescription>
    </div>
    <Button />
  </div>
</CardHeader>
```

**Custom features to preserve in generated `card.tsx`**:
- `variant` prop on `Card`: `default`, `glass`, `outline` — add via CVA on the generated Card
- `padding` prop: `none`, `sm`, `md`, `lg` — add via CVA
- `hover` prop: `hover:border-ring hover:bg-(--secondary-hover) cursor-pointer` — add as boolean CVA variant

```ts
// Extended CVA for Card in card.tsx
const cardVariants = cva('rounded-xl border transition-all duration-200', {
  variants: {
    variant: {
      default: 'bg-card border-border',
      glass: 'glass',
      outline: 'border-border bg-transparent',
    },
    padding: {
      none: '',
      sm: 'p-3',
      md: 'p-4',
      lg: 'p-6',
    },
    hover: {
      true: 'hover:border-ring hover:bg-(--secondary-hover) cursor-pointer',
      false: '',
    },
  },
  defaultVariants: { variant: 'default', padding: 'md', hover: false },
})
```

**Consumer updates**: 10 files. The only files needing non-trivial changes are those using `CardHeader` with the prop-based API:
- `pages/Sessions.tsx` — uses `<CardHeader title=... subtitle=... action=...>` → expand to children
- `pages/Settings.tsx` — same
- `pages/Onboarding.tsx` — same
- `pages/Help.tsx` — same

Remaining consumers (`Credentials.tsx`, `Workspaces.tsx`, `WorkspaceUseChat.tsx`, `PermissionRequest.tsx`, `SdkCheckpoints.tsx`, `PiSessionTree.tsx`) use `Card` only — import path change only.

**Files to delete**: `Card.tsx`
**Files to add**: `card.tsx` (shadcn + extended variants)
**Consumer updates**: 10 files (4 with `CardHeader` expansion, 6 path-only)

---

### Phase 5 — Input

**Risk**: Medium-High. 11 consumers. Custom label/icon/password-toggle behavior.

Delete `Input.tsx`. Add shadcn `input.tsx`:
```bash
npx shadcn add input
```
Generated export: `Input` — bare styled `<input>`.

Add project wrapper `input-field.tsx` (same pattern as `textarea-field.tsx`):

```tsx
// input-field.tsx
import { Input } from './input'
import { Eye, EyeOff } from 'lucide-react'

interface InputFieldProps extends React.ComponentProps<typeof Input> {
  label?: string
  error?: string
  hint?: string
  leftIcon?: ReactNode
  rightIcon?: ReactNode
}

export function InputField({ label, error, hint, leftIcon, rightIcon, type, ...props }: InputFieldProps) {
  const [showPassword, setShowPassword] = useState(false)
  const isPassword = type === 'password'
  const inputType = isPassword ? (showPassword ? 'text' : 'password') : type
  const id = props.id ?? (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined)

  return (
    <div className="w-full flex flex-col gap-1">
      {label && <label htmlFor={id} className="text-sm font-medium text-foreground">{label}</label>}
      <div className="relative flex items-center">
        {leftIcon && <span className="absolute left-3 text-muted-foreground">{leftIcon}</span>}
        <Input
          id={id}
          type={inputType}
          className={cn(leftIcon && 'pl-9', (rightIcon || isPassword) && 'pr-9', error && 'border-destructive')}
          aria-invalid={!!error}
          aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
          {...props}
        />
        {isPassword && (
          <button type="button" onClick={() => setShowPassword(v => !v)} className="absolute right-3 text-muted-foreground">
            {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        )}
        {!isPassword && rightIcon && <span className="absolute right-3 text-muted-foreground">{rightIcon}</span>}
      </div>
      {error && <p id={`${id}-error`} className="text-xs text-destructive">{error}</p>}
      {hint && !error && <p id={`${id}-hint`} className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}
```

Update all consumers to import `InputField` from `'@/components/ui/input-field'`. Consumers that use `Input` as a bare input (no label/icons) can import directly from `'@/components/ui/input'` instead.

**Audit each consumer** to decide bare `Input` vs `InputField`:
- `pages/Workspaces.tsx` — likely uses label → `InputField`
- `pages/Settings.tsx` — likely uses label → `InputField`
- `pages/Sessions.tsx` — likely uses label → `InputField`
- `pages/Onboarding.tsx` — likely uses label → `InputField`
- `pages/Credentials.tsx` — likely uses label + password → `InputField`
- `components/session/SaveRepoPrompt.tsx` — likely uses label → `InputField`
- `components/session/RepoSelector.tsx` — check for bare usage
- `components/sdk/SdkCommandsList.tsx` — check for bare usage
- `components/sdk/SdkConfigControls.tsx` — check for bare usage
- `components/pi/PiControlPanel.tsx` — check for bare usage
- `components/ui/input-group.tsx` — update `InputGroupInput` to use `InputField`

**Files to delete**: `Input.tsx`
**Files to add**: `input.tsx` (shadcn), `input-field.tsx` (project wrapper)
**Consumer updates**: 11 files

---

### Phase 6 — Dialog

**Risk**: High. 5 consumers. Accessibility improvement (adds focus trap, scroll lock, aria-modal). Minor behaviour changes are expected and are fixes, not regressions.

Delete `Dialog.tsx`. Add shadcn `dialog.tsx`:
```bash
npx shadcn add dialog
```
Generated exports: `Dialog`, `DialogTrigger`, `DialogPortal`, `DialogOverlay`, `DialogClose`, `DialogContent`, `DialogHeader`, `DialogFooter`, `DialogTitle`, `DialogDescription`.

**`size` prop**: The current `Dialog` has a `size` prop (`sm | md | lg | xl`). The shadcn `DialogContent` is a fixed-width component. Add a `size` variant to the generated `DialogContent` CVA:

```ts
// In the generated dialog.tsx, extend DialogContent:
const dialogContentVariants = cva(
  'fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 grid w-full gap-4 border bg-background p-6 shadow-lg duration-200 ...',
  {
    variants: {
      size: {
        sm: 'max-w-sm',
        md: 'max-w-md',
        lg: 'max-w-lg',
        xl: 'max-w-xl',
      },
    },
    defaultVariants: { size: 'md' },
  }
)
// Pass size prop through DialogContent
```

**`ConfirmDialog` composite**: Re-implement as a thin wrapper file `confirm-dialog.tsx`:
```tsx
// confirm-dialog.tsx
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from './dialog'
import { Button } from './button'

interface ConfirmDialogProps {
  open: boolean
  onClose: () => void
  onConfirm: () => void
  title: string
  description: string
  confirmText?: string
  cancelText?: string
  variant?: 'danger' | 'warning' | 'default'
  loading?: boolean
}

export function ConfirmDialog({ open, onClose, onConfirm, title, description, confirmText = 'Confirm', cancelText = 'Cancel', variant = 'default', loading }: ConfirmDialogProps) {
  return (
    <Dialog open={open} onOpenChange={open => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">{cancelText}</Button>
          </DialogClose>
          <Button
            variant={variant === 'danger' ? 'destructive' : 'default'}
            loading={loading}
            onClick={onConfirm}
          >
            {confirmText}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
```

**Consumer API change**: The current `Dialog` uses `onClose` callback. Shadcn uses `onOpenChange(open: boolean)`. The `ConfirmDialog` wrapper absorbs this difference. For raw `Dialog` usages, callers change:
```tsx
// Before
<Dialog open={open} onClose={() => setOpen(false)} title="Title" size="lg">
  {children}
</Dialog>

// After
<Dialog open={open} onOpenChange={open => !open && setOpen(false)}>
  <DialogContent size="lg">
    <DialogHeader><DialogTitle>Title</DialogTitle></DialogHeader>
    {children}
  </DialogContent>
</Dialog>
```

**Consumer file list**:
- `pages/Credentials.tsx` — `Dialog` + `ConfirmDialog`
- `pages/Sessions.tsx` — `Dialog` + `ConfirmDialog`
- `pages/Settings.tsx` — `ConfirmDialog` only
- `pages/Workspaces.tsx` — `Dialog` only
- `components/session/SaveRepoPrompt.tsx` — `Dialog` only

**Files to delete**: `Dialog.tsx`
**Files to add**: `dialog.tsx` (shadcn + size variant), `confirm-dialog.tsx` (project composite)
**Consumer updates**: 5 files (non-trivial structural changes)

---

### Phase 7 — Toast → Sonner

**Risk**: Medium. Direct callsite migration — no shim, no hook, no context. All 26 toast calls updated in-place.

#### Why Sonner is a clean fit

The current `Toast.tsx` model: state lives in React context, `useToast()` returns methods, every component that toasts must be a React child of `<ToastProvider>`.

Sonner's model: `toast` is a module-level singleton imported directly from `'sonner'`. No hook. No context. No provider wrapping. Call it from anywhere — event handlers, callbacks, async functions — without caring about the React tree.

The `toastRef` pattern in `Workspaces.tsx` (stabilising the toast reference inside `useCallback`) exists entirely to work around the hook's React rules. With Sonner that pattern disappears completely.

#### Step 1 — Install and add Toaster

```bash
pnpm add sonner
npx shadcn add sonner
```

`npx shadcn add sonner` generates `components/ui/sonner.tsx` — a thin `<Toaster>` wrapper with the project's theme wired in.

#### Step 2 — Shell.tsx

Remove `<ToastProvider>`. Add `<Toaster>` as a sibling in the layout tree (not a wrapper):

```tsx
// Before
import { ToastProvider } from '@/components/ui/Toast'
<ToastProvider>
  <RouterProvider ... />
</ToastProvider>

// After
import { Toaster } from '@/components/ui/sonner'
<RouterProvider ... />
<Toaster position="top-right" richColors />
```

#### Step 3 — Call signature change

Sonner's API:
```ts
toast.success(title)
toast.success(title, { description: message })
toast.error(title, { description: message })
toast.info(title, { description: message })
```

The old API was `toast.success(title, message?)` — message was positional. Sonner takes an options object. Every callsite needs updating.

#### Step 4 — Consumer-by-consumer migrations

All consumers: remove the `useToast` import and `const toast = useToast()` line. Add `import { toast } from 'sonner'` at the top.

---

**`components/layout/Shell.tsx`**

```tsx
// Remove:
import { ToastProvider } from '@/components/ui/Toast'

// Add:
import { Toaster } from '@/components/ui/sonner'
```

Remove `<ToastProvider>` wrapper. Add `<Toaster position="top-right" richColors />` as a sibling element in the return.

---

**`pages/WorkspaceUseChat.tsx`** — 3 call sites

```tsx
// Remove:
import { useToast } from '@/components/ui/Toast'
const toast = useToast()

// Add:
import { toast } from 'sonner'
```

```tsx
// Line 120 — onError callback
// Before:
toast.error('Connection error', error instanceof Error ? error.message : 'Chat transport failed')
// After:
toast.error('Connection error', { description: error instanceof Error ? error.message : 'Chat transport failed' })

// Line 173 — notifyError callback reference
// Before:
notifyError: toast.error
// After — inline adapter, Sonner's toast.error signature differs from the callback contract:
notifyError: (title: string, message?: string) => toast.error(title, { description: message })

// Line 181 — attachment error
// Before:
toast.error('Attachment not added', err.message)
// After:
toast.error('Attachment not added', { description: err.message })
```

---

**`pages/Workspaces.tsx`** — 9 call sites across 2 components

```tsx
// Remove:
import { useToast } from '@/components/ui/Toast'
const toast = useToast()                   // line 33 — in Workspaces
const toastRef = useRef(toast)             // line 34 — stabilisation ref, no longer needed
// ... useEffect that kept toastRef.current in sync — delete entirely
const toast = useToast()                   // line 394 — in CreateWorkspaceDialog

// Add:
import { toast } from 'sonner'
```

```tsx
// Line 69 — load error (was toastRef.current.error)
toast.error('Failed to load workspaces', { description: error instanceof Error ? error.message : 'Unknown error' })

// Line 101
toast.success('Workspace "${workspace.name}" deleted')
// (no description — stays as single-arg call)

// Line 104
toast.error('Failed to delete workspace', { description: error instanceof Error ? error.message : 'Unknown error' })

// Line 122
toast.success('Checkout removed')

// Line 125
toast.error('Failed to remove checkout', { description: error instanceof Error ? error.message : 'Unknown error' })

// Line 424
toast.error('Validation error', { description: 'Please enter a directory path to scan' })

// Line 433
toast.info('No repositories found', { description: `Scanned ${result.scannedDirectories} directories` })

// Line 436
toast.error('Scan failed', { description: error instanceof Error ? error.message : 'Unknown error' })

// Line 459
toast.error('Validation error', { description: 'Clone URL and target directory are required' })

// Line 470
toast.success('Repository cloned and workspace created!')

// Line 474
toast.error('Validation error', { description: 'Name and repository path are required' })

// Line 485
toast.success('Workspace created successfully!')

// Line 491
toast.error('Failed to create workspace', { description: error instanceof Error ? error.message : 'Unknown error' })
```

---

**`pages/Settings.tsx`** — 3 call sites

```tsx
// Remove:
import { useToast } from '@/components/ui/Toast'
const toast = useToast()

// Add:
import { toast } from 'sonner'
```

```tsx
// Line 32
toast.success('Gateway URL updated', { description: 'Reconnect to apply changes' })

// Line 40
toast.success('All data cleared')

// Line 43
toast.error('Failed to clear data', { description: error instanceof Error ? error.message : 'Unknown error' })
```

---

**`pages/Sessions.tsx`** — 5 call sites across 2 components

```tsx
// Remove:
import { useToast } from '@/components/ui/Toast'
const toast = useToast()   // line 33 — Sessions
const toast = useToast()   // line 312 — NewSessionDialog

// Add:
import { toast } from 'sonner'
```

```tsx
// Line 90
toast.success('Session deleted')

// Line 94
toast.error('Failed to delete session', { description: error.message })

// Line 364
toast.error('Repository required', { description: 'Please select a repository for this session' })

// Line 423
toast.success('Session created', { description: `Session ${session.id.slice(0, 8)} is ready` })

// Line 426
toast.error('Failed to create session', { description: error instanceof Error ? error.message : 'Unknown error' })
```

---

**`pages/Credentials.tsx`** — 4 call sites across 2 components

```tsx
// Remove:
import { useToast } from '@/components/ui/Toast'
const toast = useToast()   // line 33 — Credentials
const toast = useToast()   // line 234 — AddCredentialDialog

// Add:
import { toast } from 'sonner'
```

```tsx
// Line 48
toast.success('Credential deleted')

// Line 52
toast.error('Failed to delete credential', { description: error.message })

// Line 256
toast.success('Credential added', { description: `"${label}" is now available for sessions` })

// Line 261
toast.error('Failed to add credential', { description: error instanceof Error ? error.message : 'Unknown error' })
```

---

**`components/session/SaveRepoPrompt.tsx`** — 2 call sites

```tsx
// Remove:
import { useToast } from '@/components/ui/Toast'
const toast = useToast()

// Add:
import { toast } from 'sonner'
```

```tsx
// Line 34
toast.success('Repository saved', { description: 'This repository will appear in your list for future sessions' })

// Line 39
toast.error('Failed to save repository', { description: error instanceof Error ? error.message : 'Unknown error' })
```

---

#### Step 5 — Delete Toast.tsx

```bash
rm web/src/components/ui/Toast.tsx
```

Remove `Toast` from `index.ts` barrel.

---

**Files to delete**: `Toast.tsx`
**Files to add**: `sonner.tsx` (shadcn generated)
**Files modified**: `Shell.tsx` + 6 consumer files
**Lines removed net**: ~140 (Toast.tsx context machinery + toastRef patterns) vs ~60 updated callsites

---

### Phase 8 — Button (Last — highest consumer count)

**Risk**: Very High. 29 consumers. Do after all other phases so unrelated regressions are already resolved.

Delete `Button.tsx`. Add shadcn `button.tsx`:
```bash
npx shadcn add button
```
Shadcn generated variants: `default`, `destructive`, `outline`, `secondary`, `ghost`, `link`. Sizes: `default`, `sm`, `lg`, `icon`.

**Custom features to add to generated `button.tsx`**:

1. **Extra size variants** — add to the CVA `size` block:
   ```ts
   xs:      'h-6 px-2 text-xs rounded-sm gap-1',
   md:      'h-9 px-4 py-2',       // alias for default
   'icon-xs': 'size-6',
   'icon-sm': 'size-8',
   'icon-lg': 'size-10',
   ```

2. **Extra variant aliases** — add to CVA `variant` block:
   ```ts
   primary: /* same as default */
   danger:  /* same as destructive */
   ```
   (Use `cva` `compoundVariants` or just duplicate the class strings — choose clarity over cleverness.)

3. **`loading` prop** — integrate `Spinner`:
   ```tsx
   // In ButtonProps:
   loading?: boolean
   leftIcon?: ReactNode
   rightIcon?: ReactNode

   // In render:
   const content = (
     <>
       {loading ? <Spinner size="sm" /> : leftIcon}
       {children}
       {rightIcon}
     </>
   )
   ```

4. **`asChild` prop** — already included in shadcn's generated Button via Slot. Keep.

**Consumer updates**: 29 files — import path changes from `'@/components/ui/Button'` to `'@/components/ui/button'`. Verify `loading`, `leftIcon`, `rightIcon`, `variant="primary"`, `variant="danger"`, size `xs`/`md`/`icon-xs` usages are preserved.

**`buttonVariants` export**: Shadcn's generated file exports this too. `input-group.tsx` which imports it internally continues to work after the path change.

**Files to delete**: `Button.tsx`
**Files to add**: `button.tsx` (shadcn + extended)
**Consumer updates**: 29 files (import path case change + verify custom props)

---

## Post-migration Cleanup

Once all phases are complete:

1. **Delete `index.ts` barrel** or rewrite it to re-export from the new lowercase files. Since no consumer currently uses the barrel, it can simply be deleted or updated to the new paths.

2. **Remove the CSS bridge alias block** from `index.css` — the `--color-*` bridge aliases that were already migrated to canonical Tailwind classes in the ai-elements refactor. After this consolidation, verify no remaining usages exist before removing.

3. **Move `PanelSection.tsx`** to `components/layout/` — it's not a UI primitive, it's a layout pattern for control panels. Low priority.

4. **Review `accordion.tsx`, `alert.tsx`, `button-group.tsx`, `hover-card.tsx`** — these shadcn files were added but have no consumers. Either wire them up where they'd be valuable or remove them to keep the dependency surface honest.

---

## Test Strategy

Each phase should pass:
```
pnpm test          # all 120 unit tests pass
pnpm typecheck     # zero TS errors
pnpm lint          # zero lint errors
```

Plus visual smoke test after each phase:
- Open the app, navigate to every page (Sessions, Workspaces, Credentials, Settings, Onboarding, Help)
- Trigger a Dialog (create workspace, delete credential)
- Trigger a Toast (save settings)
- Verify keyboard navigation in migrated Dialogs (Tab, Shift+Tab, Escape)
- Verify Dropdown/Select keyboard nav (arrow keys, Enter, Escape)

---

## Summary Table

| Phase | Component(s) | Action | External Consumers | Complexity |
|-------|-------------|--------|--------------------|------------|
| 1a | Avatar | Delete + shadcn add | 0 | Trivial |
| 1b | Skeleton | Delete + shadcn add + composite file | 2 | Trivial |
| 2a | Dropdown | Delete + use existing Select | 1 (2 sites) | Low |
| 2b | Textarea | Delete + shadcn add + `textarea-field.tsx` | 2 | Low |
| — | Select | Split file only (no consumers change behaviour) | 5 | Low |
| 3 | Badge | Delete + shadcn add + extend CVA | 13 | Medium |
| 4 | Card | Delete + shadcn add + extend CVA + `CardHeader` expansion | 10 | Medium |
| 5 | Input | Delete + shadcn add + `input-field.tsx` | 11 | Medium |
| 6 | Dialog | Delete + shadcn add + `confirm-dialog.tsx` | 5 | High |
| 7 | Toast | Delete + sonner, 26 callsites updated directly | 7 | Medium |
| 8 | Button | Delete + shadcn add + extend CVA | 29 | Very High |
