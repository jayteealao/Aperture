# Plan: Refactor Aperture Web UI to ai-elements

> **Last reviewed:** 2026-03-14 — verified against React 19.2, Tailwind v4,
> AI SDK v6 (`ai@6.x`, `@ai-sdk/react@3.x`), shadcn/ui Tailwind v4 support.

## Overview

Replace custom HUD chat components with Vercel's **ai-elements** component library,
upgrade to **React 19 + Tailwind v4**, migrate theme variables to **shadcn CSS conventions**,
adopt **`useChat` with a custom WebSocket transport**, and use **shiki-codegen** for
optimized syntax highlighting.

ai-elements is a shadcn/ui-based component *registry* — `pnpm dlx ai-elements@latest add <component>`
copies source code into our project. We own the code, can customize it, and it adds no
opaque runtime dependency.

---

## Phase 0: Foundation Upgrades

### 0.1 Upgrade React 18 → 19

ai-elements targets React 19 (uses `ref` as prop, `use()` hook, `forwardRef` removal).

```bash
pnpm --filter aperture-web add react@19 react-dom@19
pnpm --filter aperture-web add -D @types/react@19 @types/react-dom@19
```

**Run codemods first (before manual changes):**

```bash
# All React 19 codemods at once (excludes TypeScript type changes)
npx codemod@latest react/19/migration-recipe --target web/src

# TypeScript-specific codemods
npx types-react-codemod@latest preset-19 web/src
```

Key codemods handle:
- Remove `forwardRef` — `ref` is now a regular prop
- Replace `useContext(Ctx)` → `use(Ctx)` (optional)
- Remove `<Context.Provider>` → `<Context>` (optional)

**Breaking changes to address manually:**

| Change | Action |
|---|---|
| `forwardRef` deprecated | Codemod handles it. Verify all `web/src/components/ui/*.tsx` |
| `useRef()` requires argument | `useRef<T>()` → `useRef<T>(null)`. Codemod handles it. |
| Ref callback implicit returns rejected | Arrow refs `ref={el => (myRef = el)}` must use block body: `ref={el => { myRef = el }}` |
| `ReactDOM.render` removed | Already using `createRoot` — no action |
| `act` import moved | `import { act } from 'react'` instead of `react-dom/test-utils` |
| Error handling changes | Uncaught render errors go to `window.reportError`. Add `onUncaughtError` to `createRoot` if needed. |
| StrictMode double-render | `useMemo`/`useCallback` reuse memoized results from first render (new behavior) |

**Dependency compatibility:**

| Dependency | React 19 status | Action |
|---|---|---|
| `@tanstack/react-query` v5 | Works at runtime, peer dep warns | pnpm is lenient with peer deps — no action needed |
| `zustand` v4 | **NOT compatible** — does not use `useSyncExternalStore` natively | **Upgrade to Zustand v5** (see 0.1.1) |
| `react-router-dom` v6.21 | Works (peer dep `react@>=16.8`) | Works now, plan v7 migration later |
| `react-markdown` v10 | Full React 19 support | **Breaking:** `className` prop removed, component override props changed (see 0.1.2) |
| `lucide-react` v0.309 | Peer dep may exclude React 19 | pnpm handles it — no action needed |
| `@radix-ui/*` | Full React 19 support since June 2024 | Update to latest versions |

#### 0.1.1 Upgrade Zustand v4 → v5

**Required for React 19.** Zustand v5 uses native `useSyncExternalStore` instead of the polyfill.

```bash
pnpm --filter aperture-web add zustand@5
```

**Migration changes:**
- Default exports removed → must use `import { create } from 'zustand'` (already doing this)
- `devtools` import path changed → `'zustand/middleware'`
- Selectors returning new references can cause infinite loops → use `useShallow` from `'zustand/shallow'` where needed
- `persist` middleware no longer stores initial state during creation

**Files to audit:** `web/src/stores/sessions.ts`, `web/src/stores/app.ts`

#### 0.1.2 Update `react-markdown` usage

react-markdown v10 breaking changes:
- `className` prop removed — wrap in a `<div className="...">` instead
- Component override `code` no longer receives `inline` prop — detect inline via absence of `className`
- Component override `li` no longer receives `checked`, `index`, `ordered` props

**Files to audit:** `Workspace.tsx` `MarkdownContent` function (will be deleted
in Phase 3, but fix if we deploy Phase 0 independently).

### 0.2 Upgrade Tailwind v3 → v4

ai-elements + shadcn/ui use Tailwind v4's CSS-first configuration.

**Run the official upgrade tool first:**

```bash
cd web
npx @tailwindcss/upgrade
```

This handles: dependency updates, config-to-CSS migration, utility class renames in
templates, and CSS syntax updates. Review the diff carefully.

**Then install the Vite plugin:**

```bash
pnpm --filter aperture-web add tailwindcss@4 @tailwindcss/vite
pnpm --filter aperture-web remove autoprefixer postcss
```

**Manual migration steps (if upgrade tool misses anything):**

1. **Delete `tailwind.config.ts`** — Tailwind v4 uses CSS-based config via `@theme`.
2. **Delete `postcss.config.js`** (if present) — Tailwind v4 uses Vite plugin instead.
3. **Update `vite.config.ts`:**
   ```ts
   import tailwindcss from '@tailwindcss/vite'
   export default defineConfig({
     plugins: [react(), tailwindcss()],
   })
   ```
4. **Replace directives** in `index.css`:
   ```css
   /* Old: */
   @tailwind base;
   @tailwind components;
   @tailwind utilities;

   /* New: */
   @import "tailwindcss";
   ```
5. Move theme extensions into CSS `@theme` block (see Phase 0.3).
6. **Add dark mode variant** — Tailwind v4 does NOT auto-detect `.dark` class.
   Must explicitly declare:
   ```css
   @custom-variant dark (&:where(.dark, .dark *));
   ```

**Breaking utility class renames (upgrade tool handles most):**

| Tailwind v3 | Tailwind v4 | Notes |
|---|---|---|
| `shadow-sm` | `shadow-xs` | Size scale shifted down |
| `shadow` | `shadow-sm` | |
| `rounded-sm` | `rounded-xs` | Size scale shifted down |
| `rounded` | `rounded-sm` | |
| `blur-sm` | `blur-xs` | |
| `blur` | `blur-sm` | |
| `outline-none` | `outline-hidden` | |
| `ring` | `ring-3` | Default ring width changed from 3px to 1px |
| `bg-gradient-to-r` | `bg-linear-to-r` | Gradient direction syntax |
| `bg-opacity-50` | `bg-blue-500/50` | Opacity modifier syntax |
| `flex-shrink-*` | `shrink-*` | |
| `flex-grow-*` | `grow-*` | |

**Other breaking changes:**

| Change | Impact |
|---|---|
| Default border color: `gray-200` → `currentColor` | May affect unstyled borders |
| `!important` modifier: `!flex` → `flex!` | Moves to end of class |
| `@layer utilities { ... }` → `@utility name { ... }` | Custom utility syntax changed |
| Variant stacking order reversed | `first:*:pt-0` → `*:first:pt-0` |
| Arbitrary CSS vars: `bg-[--brand]` → `bg-(--brand)` | Parentheses instead of brackets |

**Browser requirements:** Tailwind v4 requires Safari 16.4+, Chrome 111+, Firefox 128+.
Uses `@property`, `color-mix()`, cascade layers that cannot be polyfilled.

### 0.3 Migrate HUD theme variables to shadcn CSS conventions

Replace custom `--color-*` variables with shadcn's expected variable names.
shadcn/ui with Tailwind v4 uses `@theme inline` to bridge CSS variables with
Tailwind utility classes.

**Variable mapping:**

| Old HUD variable | New shadcn variable | Purpose |
|---|---|---|
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
| `--color-text-muted` | `--muted-foreground` | Muted text (share with secondary) |
| `--color-accent` (#00f5a0) | `--primary` | Primary action color (neon green) |
| `--color-accent-hover` | `--primary-hover` (custom) | Primary hover |
| `#0a0a0f` on accent | `--primary-foreground` | Text on primary buttons |
| `--color-gradient-from` | `--gradient-from` (custom) | Gradient start |
| `--color-gradient-to` | `--gradient-to` (custom) | Gradient end |
| (new) | `--accent` | shadcn accent (purple: #7c3aed) |
| (new) | `--accent-foreground` | Text on accent |
| (new) | `--destructive` | Danger/error (#ef4444) |
| (new) | `--destructive-foreground` | Text on destructive |
| (new) | `--popover` | Popover background |
| (new) | `--popover-foreground` | Popover text |
| (new) | `--input` | Input border |
| (new) | `--radius` | Default border radius |

**New `index.css` structure:**

```css
@import "tailwindcss";
@import "tw-animate-css";

@custom-variant dark (&:where(.dark, .dark *));

/* ─── Light theme (Pearl Glass) ─── */
:root {
  --background: #f8f9fc;
  --foreground: rgba(0, 0, 0, 0.9);
  --card: #ffffff;
  --card-foreground: rgba(0, 0, 0, 0.9);
  --popover: #ffffff;
  --popover-foreground: rgba(0, 0, 0, 0.9);
  --primary: #00f5a0;
  --primary-hover: #00d68f;
  --primary-foreground: #0a0a0f;
  --secondary: rgba(0, 0, 0, 0.02);
  --secondary-foreground: rgba(0, 0, 0, 0.9);
  --muted: #f1f3f9;
  --muted-foreground: rgba(0, 0, 0, 0.6);
  --accent: #7c3aed;
  --accent-foreground: #ffffff;
  --destructive: #ef4444;
  --destructive-foreground: #ffffff;
  --border: rgba(0, 0, 0, 0.06);
  --input: rgba(0, 0, 0, 0.06);
  --ring: rgba(0, 0, 0, 0.12);
  --radius: 0.75rem;
  --gradient-from: #f0fdf4;
  --gradient-to: #e0e7ff;
  --success: #22c55e;
  --warning: #f59e0b;
}

/* ─── Dark theme (Nebula Glass) ─── */
.dark {
  --background: #0a0a0f;
  --foreground: rgba(255, 255, 255, 0.95);
  --card: #12121a;
  --card-foreground: rgba(255, 255, 255, 0.95);
  --popover: #12121a;
  --popover-foreground: rgba(255, 255, 255, 0.95);
  --primary: #00f5a0;
  --primary-hover: #00d68f;
  --primary-foreground: #0a0a0f;
  --secondary: rgba(255, 255, 255, 0.03);
  --secondary-foreground: rgba(255, 255, 255, 0.95);
  --muted: #1a1a24;
  --muted-foreground: rgba(255, 255, 255, 0.65);
  --accent: #7c3aed;
  --accent-foreground: #ffffff;
  --destructive: #ef4444;
  --destructive-foreground: #ffffff;
  --border: rgba(255, 255, 255, 0.08);
  --input: rgba(255, 255, 255, 0.08);
  --ring: rgba(255, 255, 255, 0.15);
  --gradient-from: #0f172a;
  --gradient-to: #1e1b4b;
  --success: #22c55e;
  --warning: #f59e0b;
}

/* ─── Bridge CSS vars → Tailwind utility classes ─── */
/* @theme inline is REQUIRED when values reference other CSS vars */
@theme inline {
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
  --color-accent: var(--accent);
  --color-accent-foreground: var(--accent-foreground);
  --color-destructive: var(--destructive);
  --color-destructive-foreground: var(--destructive-foreground);
  --color-border: var(--border);
  --color-input: var(--input);
  --color-ring: var(--ring);
  --color-success: var(--success);
  --color-warning: var(--warning);
  --radius-sm: calc(var(--radius) - 4px);
  --radius-md: calc(var(--radius) - 2px);
  --radius-lg: var(--radius);
  --radius-xl: calc(var(--radius) + 4px);
}

/* ─── Static theme tokens (no CSS var indirection) ─── */
@theme {
  --font-sans: "Inter", ui-sans-serif, system-ui, sans-serif;
  --font-mono: "JetBrains Mono", ui-monospace, monospace;
  --text-2xs: 0.625rem;

  --animate-fade-in: fade-in 0.2s ease-out;
  --animate-slide-up: slide-up 0.2s ease-out;
  --animate-slide-down: slide-down 0.2s ease-out;
  --animate-slide-left: slide-left 0.2s ease-out;
  --animate-slide-right: slide-right 0.2s ease-out;
  --animate-pulse-slow: pulse 3s ease-in-out infinite;
  --animate-spin-slow: spin 2s linear infinite;

  @keyframes fade-in {
    from { opacity: 0; }
    to { opacity: 1; }
  }
  @keyframes slide-up {
    from { transform: translateY(10px); opacity: 0; }
    to { transform: translateY(0); opacity: 1; }
  }
  @keyframes slide-down {
    from { transform: translateY(-10px); opacity: 0; }
    to { transform: translateY(0); opacity: 1; }
  }
  @keyframes slide-left {
    from { transform: translateX(10px); opacity: 0; }
    to { transform: translateX(0); opacity: 1; }
  }
  @keyframes slide-right {
    from { transform: translateX(-10px); opacity: 0; }
    to { transform: translateX(0); opacity: 1; }
  }
}
```

**Why `@theme inline` vs `@theme`:** When a theme variable *references another CSS variable*
(e.g., `--color-background: var(--background)`), you must use `@theme inline`. Without it,
Tailwind resolves the variable at definition time, producing incorrect fallback values.
Static values (fonts, animations) go in plain `@theme`.

**Why `tw-animate-css`:** shadcn/ui Tailwind v4 uses `tw-animate-css` (CSS import) instead
of `tailwindcss-animate` (JS plugin). Install: `pnpm --filter aperture-web add tw-animate-css`.

**Component migration — find-and-replace across `web/src/`:**

| Search | Replace |
|---|---|
| `var(--color-bg-primary)` | `var(--background)` |
| `var(--color-bg-secondary)` | `var(--card)` |
| `var(--color-bg-tertiary)` | `var(--muted)` |
| `var(--color-surface-hover)` | `var(--secondary)` |
| `var(--color-surface)` | `var(--secondary)` |
| `var(--color-border-strong)` | `var(--ring)` |
| `var(--color-border)` | `var(--border)` |
| `var(--color-text-primary)` | `var(--foreground)` |
| `var(--color-text-secondary)` | `var(--muted-foreground)` |
| `var(--color-text-muted)` | `var(--muted-foreground)` |

**Note:** Do the most specific patterns first (e.g., `--color-border-strong` before `--color-border`,
`--color-surface-hover` before `--color-surface`) to avoid partial matches.

### 0.4 Install shadcn/ui

```bash
cd web
pnpm dlx shadcn@latest init
```

During init, the CLI auto-detects Vite. Key settings:
- `rsc`: **false** (no React Server Components — this is Vite, not Next.js)
- CSS file: `src/index.css`
- Aliases: `@/components`, `@/lib`, `@/hooks`

**`components.json` for Vite:**

```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "default",
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

We already have `cn()` at `web/src/utils/cn.ts` — point the `utils` alias there
to avoid creating a duplicate `lib/utils.ts`.

**Important:** Both `tsconfig.json` AND `tsconfig.app.json` must have the `@/*` path alias:

```json
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": { "@/*": ["./src/*"] }
  }
}
```

### 0.5 Install ai-elements components

```bash
cd web
pnpm dlx ai-elements@latest add conversation message prompt-input tool reasoning code-block confirmation shimmer terminal checkpoint
```

This copies ~10 component source files into `web/src/components/ai-elements/`.
The CLI also auto-installs any required shadcn base components (Button, Collapsible, etc.)
and their Radix UI dependencies.

**Caveat:** ai-elements docs list Next.js 14+ as a prerequisite, but the components
themselves are plain React with no Next.js-specific imports. They work in Vite.
The tight Next.js coupling is about the default `/api/chat` route convention,
not the components.

### 0.6 Install peer dependencies

```bash
pnpm --filter aperture-web add \
  @radix-ui/react-collapsible \
  use-stick-to-bottom \
  remark-math \
  rehype-katex \
  motion \
  tw-animate-css
```

**Note:** `framer-motion` has been rebranded to `motion` (v12+). Import path changes:

```ts
// Old (framer-motion)
import { motion } from "framer-motion"
// New (motion)
import { motion } from "motion/react"
```

If ai-elements source code uses `framer-motion` imports, update them to `motion/react`
after installation.

`react-markdown`, `remark-gfm`, `lucide-react` are already installed.

---

## Phase 1: Shiki Bundle Optimization

### 1.1 Generate a tailored Shiki bundle with `shiki-codegen`

Instead of importing from `shiki` (6.4 MB / 1.2 MB gzipped) or `shiki/bundle/web`
(3.8 MB / 695 KB gzipped), generate a purpose-built bundle.

**Languages needed** (based on code blocks in AI responses):
- TypeScript, JavaScript, TSX, JSX
- JSON, YAML, TOML
- HTML, CSS, SCSS
- Bash/Shell
- Python, Rust, Go (common in AI responses)
- SQL, Markdown
- Diff (for code diffs)

**Themes needed:**
- `github-dark` (dark mode)
- `github-light` (light mode)

```bash
npx shiki-codegen \
  --langs typescript,javascript,tsx,jsx,json,yaml,toml,html,css,scss,bash,python,rust,go,sql,markdown,diff \
  --themes github-dark,github-light \
  --engine javascript \
  ./web/src/lib/shiki.bundle.ts
```

This generates a self-contained `shiki.bundle.ts` (~300-500 KB gzipped) with:
- Only the 17 language grammars listed
- Only 2 themes
- **JavaScript regex engine** (no WASM dependency — smaller bundle, faster startup)
- Shorthand functions (`codeToHtml`, `codeToTokens`, etc.)

**Why JavaScript engine over Oniguruma:** The Oniguruma engine requires a WASM binary
(`shiki/wasm`). The JS engine is pure JavaScript, smaller, and sufficient for all
common web languages. Only fall back to Oniguruma for exotic TextMate grammars.

### 1.2 Configure ai-elements `CodeBlock` to use our bundle

After ai-elements installs the `code-block` component source into our project,
modify it to import from our generated bundle:

```ts
// In web/src/components/ai-elements/code-block.tsx
// Replace:
import { createHighlighter } from 'shiki'
// With:
import { createHighlighter } from '@/lib/shiki.bundle'
```

### 1.3 Singleton pattern for the highlighter

Creating a highlighter is expensive. Never call it in a render. Singleton:

```ts
// web/src/lib/shiki.ts
import { createHighlighter } from './shiki.bundle'
import type { HighlighterCore } from 'shiki/core'

let instance: Promise<HighlighterCore> | null = null

export function getHighlighter(): Promise<HighlighterCore> {
  if (!instance) {
    instance = createHighlighter({
      themes: ['github-dark', 'github-light'],
      langs: [], // shiki-codegen preloads the configured langs
    })
  }
  return instance
}
```

**Pre-warm on app mount** to avoid FOUC on first code block:

```ts
// In web/src/main.tsx or App.tsx
import { getHighlighter } from '@/lib/shiki'
getHighlighter() // Fire and forget — starts loading immediately
```

### 1.4 Remove `react-syntax-highlighter`

```bash
pnpm --filter aperture-web remove react-syntax-highlighter @types/react-syntax-highlighter
```

Remove all imports of `Prism` / `SyntaxHighlighter` / `oneDark` from the codebase.

**Bundle size comparison:**

| Approach | Gzipped size |
|---|---|
| `react-syntax-highlighter` + Prism (current) | ~120 KB |
| `shiki` full bundle | ~1.2 MB |
| `shiki/bundle/web` | ~695 KB |
| `shiki-codegen` (17 langs, 2 themes, JS engine) | ~50-100 KB |

Net result: roughly the same size as current, with superior VS Code-quality highlighting.

---

## Phase 2: `useChat` with Custom WebSocket Transport

### 2.1 Why adopt `useChat`

Currently, Aperture manages chat state via `useSessionsStore` (Zustand) +
`wsManager` (custom WebSocket manager). This works but means:

- Every ai-elements example requires manual adaptation to our message format
- No built-in message branching, regeneration, or optimistic updates
- Message format doesn't match `UIMessage` with `parts[]` array

By implementing a custom `ChatTransport` that bridges our WebSocket protocol
to the AI SDK's `UIMessageStream` format, we get:

- **Native ai-elements compatibility** — components bind directly to `useChat` output
- **Built-in streaming status** (`status: 'ready' | 'submitted' | 'streaming' | 'error'`)
- **Message branching** via `MessageBranch` component
- **Regeneration** via `regenerate()`
- **Optimistic UI updates** on send

### 2.2 Install AI SDK

The AI SDK is currently at **v6** (`ai@6.x`). The React hooks package is `@ai-sdk/react@3.x`.

```bash
pnpm --filter aperture-web add ai@6 @ai-sdk/react@3
```

Both packages are needed: `ai` exports `ChatTransport` type and `UIMessageChunk`,
while `@ai-sdk/react` exports the `useChat` hook.

### 2.3 Implement `ApertureWebSocketTransport`

The `ChatTransport` interface requires two methods:

```ts
// web/src/api/chat-transport.ts
import type { ChatTransport, UIMessage, UIMessageChunk, ChatRequestOptions } from 'ai'
import { wsManager } from './websocket'

export class ApertureWebSocketTransport implements ChatTransport<UIMessage> {
  private pending = new Map<string, {
    controller: ReadableStreamDefaultController<UIMessageChunk>
    cleanup: () => void
  }>()

  constructor(private sessionId: string) {}

  async sendMessages(options: {
    chatId: string
    messages: UIMessage[]
    abortSignal: AbortSignal | undefined
    trigger: 'submit-message' | 'regenerate-message'
    messageId: string | undefined
  } & ChatRequestOptions): Promise<ReadableStream<UIMessageChunk>> {
    const { chatId, messages, abortSignal } = options

    return new ReadableStream<UIMessageChunk>({
      start: (controller) => {
        // Register message handler for incoming WebSocket events
        const handler = (chunk: UIMessageChunk) => {
          try {
            if (chunk.type === 'finish' || chunk.type === 'error') {
              controller.close()
              this.pending.get(chatId)?.cleanup()
              this.pending.delete(chatId)
            } else {
              controller.enqueue(chunk)
            }
          } catch {
            // Stream already closed
          }
        }

        const cleanup = wsManager.onUIChunk(this.sessionId, handler)
        this.pending.set(chatId, { controller, cleanup })

        // Send the latest user message over WebSocket
        const lastUserMessage = messages.filter(m => m.role === 'user').pop()
        if (lastUserMessage) {
          const text = lastUserMessage.parts
            .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
            .map(p => p.text)
            .join('')

          wsManager.send(this.sessionId, {
            type: 'user_message',
            content: text,
          })
        }

        abortSignal?.addEventListener('abort', () => {
          wsManager.send(this.sessionId, { type: 'cancel' })
          try { controller.close() } catch {}
          cleanup()
          this.pending.delete(chatId)
        })
      },
    })
  }

  async reconnectToStream(): Promise<ReadableStream<UIMessageChunk> | null> {
    return null // WebSocket doesn't support HTTP reconnection
  }
}
```

### 2.4 WebSocket → UIMessageChunk translation layer

The backend sends custom JSON-RPC messages. We need to translate them into the
25 `UIMessageChunk` types that `useChat` understands.

**Translation mapping:**

| Aperture WS event | UIMessageChunk | Notes |
|---|---|---|
| `{ sessionUpdate: 'message_start' }` | `{ type: 'start', messageId }` | Begin new assistant message |
| `{ sessionUpdate: 'text_delta', content: { text } }` | `{ type: 'text-delta', id, delta: text }` | Must have matching `text-start` / `text-end` |
| `{ sessionUpdate: 'thinking', content: { thinking } }` | `{ type: 'reasoning-delta', id, delta: thinking }` | Must have matching `reasoning-start` / `reasoning-end` |
| `{ sessionUpdate: 'tool_use', content: { name, input } }` | `{ type: 'tool-input-available', toolCallId, toolName, input }` | Full input available |
| `{ sessionUpdate: 'tool_result', content }` | `{ type: 'tool-output-available', toolCallId, output }` | |
| `{ sessionUpdate: 'message_complete' }` | `{ type: 'finish' }` | End message |
| `{ sessionUpdate: 'error' }` | `{ type: 'error', errorText }` | |

**Important:** Text and reasoning chunks require a start/delta/end lifecycle with
correlated block IDs. The adapter must track block state:

```
text-start { id: "block-1" }
text-delta { id: "block-1", delta: "Hello" }
text-delta { id: "block-1", delta: " world" }
text-end   { id: "block-1" }
```

This adapter lives in `web/src/api/ws-to-uichunk.ts`.

### 2.5 Usage in components

```tsx
import { useChat } from '@ai-sdk/react'
import { ApertureWebSocketTransport } from '@/api/chat-transport'

function ChatView({ sessionId }: { sessionId: string }) {
  const transport = useMemo(
    () => new ApertureWebSocketTransport(sessionId),
    [sessionId]
  )

  const { messages, sendMessage, status, stop } = useChat({ transport })

  // messages: UIMessage[] — parts-based, directly compatible with ai-elements
  // status: 'ready' | 'submitted' | 'streaming' | 'error'
  // sendMessage: (message) => void
  // stop: () => void (triggers abort → sends cancel over WS)
}
```

### 2.6 Migration strategy for `useSessionsStore`

| Store responsibility | After migration |
|---|---|
| Session list (sessions, addSession, removeSession) | **Keep** in store |
| Active session (activeSessionId, setActiveSession) | **Keep** in store |
| Messages (messages[sessionId]) | **Replace** with `useChat` internal state |
| Connections (connections[sessionId]) | **Partially replace** — `useChat.status` for chat state, keep WebSocket connection state for non-chat events |
| Pending permissions | **Keep** in store (not handled by useChat) |
| SDK config/usage/models/commands/mcp | **Keep** in store |

The store shrinks to session management + SDK state + permissions.
Chat messages and streaming state move to `useChat`.

### 2.7 Permission requests (keeping custom handling)

`useChat` has built-in tool approval via `tool-approval-request` and
`addToolApprovalResponse`, but our permission system is more complex (multi-option
with custom options like "Allow once", "Allow for session", etc.). Keep permissions
in the Zustand store, render with `<Confirmation>`.

When a permission WebSocket event arrives:
1. Store in `pendingPermissions` (as today)
2. Render `<Confirmation>` in the message stream
3. On approve/deny, send response via `wsManager` directly (bypass `useChat`)

---

## Phase 3: Conversation & Message Components

### 3.1 Replace scroll container with `<Conversation>`

**Current** (`Workspace.tsx:315-359`): Manual `scrollContainerRef`, `handleScroll`,
`isAtBottom`, custom FAB scroll button.

**New:**

```tsx
<Conversation>
  <ConversationContent>
    {messages.length === 0 ? (
      <ConversationEmptyState
        icon={<Terminal className="size-12" />}
        title="Start a conversation"
        description="Send a message to begin chatting"
      />
    ) : (
      messages.map((message) => (
        <ApertureMessage key={message.id} message={message} status={status} />
      ))
    )}
  </ConversationContent>
  <ConversationScrollButton />
</Conversation>
```

**Deletes:** `scrollContainerRef`, `handleScroll`, `isAtBottom` state, `scrollToBottom`
callback, custom FAB button — all replaced by `use-stick-to-bottom` inside `Conversation`.

### 3.2 Replace `MessageBubble` with `<Message>` composition

**Current** (`Workspace.tsx:514-644`): Custom `MessageBubble` with manual alignment,
copy button, markdown via `react-markdown` + `react-syntax-highlighter`.

**New:**

```tsx
function ApertureMessage({
  message,
  isLastMessage,
  status,
}: {
  message: UIMessage
  isLastMessage: boolean
  status: string
}) {
  const isStreaming = status === 'streaming' && isLastMessage

  // Consolidate reasoning parts (some models emit multiple)
  const reasoningParts = message.parts.filter(p => p.type === 'reasoning')
  const reasoningText = reasoningParts.map(p => p.text).join('\n\n')
  const lastPart = message.parts.at(-1)
  const isReasoningStreaming = isStreaming && lastPart?.type === 'reasoning'

  return (
    <Message from={message.role}>
      <MessageContent>
        {/* Consolidated reasoning block */}
        {reasoningParts.length > 0 && (
          <Reasoning isStreaming={isReasoningStreaming}>
            <ReasoningTrigger
              getThinkingMessage={(streaming, duration) =>
                streaming
                  ? 'Thinking...'
                  : `Thought for ${duration}s (~${Math.ceil(reasoningText.length / 4)} tokens)`
              }
            />
            <ReasoningContent>{reasoningText}</ReasoningContent>
          </Reasoning>
        )}

        {/* Text and tool parts */}
        {message.parts.map((part, i) => {
          switch (part.type) {
            case 'text':
              return <MessageResponse key={i}>{part.text}</MessageResponse>

            case 'reasoning':
              return null // Already rendered above

            default:
              // Tool parts: type is "tool-{toolName}"
              if (part.type.startsWith('tool-')) {
                return (
                  <Tool key={i} defaultOpen={part.state !== 'output-available'}>
                    <ToolHeader type={part.type} state={part.state} />
                    <ToolContent>
                      <ToolInput input={part.input} />
                      {(part.state === 'output-available' || part.state === 'output-error') && (
                        <ToolOutput
                          output={
                            part.output ? (
                              <MessageResponse>
                                {typeof part.output === 'string'
                                  ? part.output
                                  : JSON.stringify(part.output, null, 2)}
                              </MessageResponse>
                            ) : undefined
                          }
                          errorText={part.errorText}
                        />
                      )}
                    </ToolContent>
                  </Tool>
                )
              }
              return null
          }
        })}
      </MessageContent>

      {message.role === 'assistant' && isLastMessage && (
        <MessageActions>
          <MessageAction
            label="Copy"
            onClick={() => {
              const text = message.parts
                .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
                .map(p => p.text)
                .join('\n')
              navigator.clipboard.writeText(text)
            }}
          >
            <CopyIcon className="size-3" />
          </MessageAction>
        </MessageActions>
      )}
    </Message>
  )
}
```

**Deletes:**
- `MarkdownContent` function (replaced by `MessageResponse` built-in markdown with GFM + math + Shiki)
- `react-syntax-highlighter` imports
- Custom copy button logic
- `extractContentBlocks` helper (replaced by `UIMessage.parts` discriminated union)

### 3.3 Replace `ThinkingBlock` with `<Reasoning>`

Handled inline in Phase 3.2 above. The key improvement: `<Reasoning>` auto-opens
during streaming and auto-closes when done (built-in behavior).

**Deletes:** `web/src/components/sdk/ThinkingBlock.tsx`

### 3.4 Replace `ToolUseBlock` / `ToolBlock` with `<Tool>`

Handled inline in Phase 3.2 above.

State mapping from UIMessage tool parts to ai-elements:

| UIMessage tool part state | ai-elements `ToolHeader.state` | Display |
|---|---|---|
| `'input-streaming'` | `'input-streaming'` | Pending badge |
| `'input-available'` | `'input-available'` | Running badge |
| `'output-available'` | `'output-available'` | Completed badge |
| `'output-error'` | `'output-error'` | Error badge |
| `'approval-requested'` | `'approval-requested'` | Awaiting Approval badge |

**Deletes:**
- `web/src/components/sdk/ToolUseBlock.tsx`
- `web/src/components/sdk/ToolInputDisplay.tsx`
- `web/src/components/sdk/ToolCallGroup.tsx`
- `ToolBlock` function in `Workspace.tsx`

---

## Phase 4: Prompt Input (Composer)

### 4.1 Replace custom composer with `<PromptInput>`

**Current** (`Workspace.tsx:374-477`): Custom textarea, manual image attachment
handling, drag/drop, paste, hidden file input, attach button, send/stop button.

**New:**

```tsx
<PromptInput
  onSubmit={handleSubmit}
  globalDrop
  multiple
  accept="image/*"
  maxFiles={IMAGE_LIMITS.MAX_COUNT}
  maxFileSize={IMAGE_LIMITS.MAX_BYTES}
>
  <PromptInputHeader>
    <PromptInputAttachmentsDisplay />
  </PromptInputHeader>
  <PromptInputBody>
    <PromptInputTextarea placeholder="Type your message... (Shift+Enter for new line)" />
  </PromptInputBody>
  <PromptInputFooter>
    <PromptInputTools>
      <PromptInputActionMenu>
        <PromptInputActionMenuTrigger />
        <PromptInputActionMenuContent>
          <PromptInputActionAddAttachments />
        </PromptInputActionMenuContent>
      </PromptInputActionMenu>
    </PromptInputTools>
    <PromptInputSubmit
      status={status === 'streaming' ? 'streaming' : status === 'submitted' ? 'submitted' : 'ready'}
      disabled={status !== 'ready'}
    />
  </PromptInputFooter>
</PromptInput>
```

**`PromptInputSubmit` status values:** `'ready' | 'submitted' | 'streaming' | 'error'`
— maps directly from `useChat`'s `status` field.

**Deletes:**
- `attachedImages` state, `fileInputRef`, `addImageFiles`, `removeImage`,
  `handlePaste`, `handleDrop`, `handleDragOver`
- Hidden `<input type="file">` element
- Manual image preview grid
- Custom attach/send/stop buttons

### 4.2 Bridge submission to WebSocket

With `useChat`, `sendMessage` is provided by the hook:

```tsx
const handleSubmit = (message: PromptInputMessage) => {
  if (!message.text.trim() && !message.files?.length) return
  sendMessage({ text: message.text, files: message.files })
}
```

`sendMessage` triggers `transport.sendMessages()` which sends over WebSocket.

---

## Phase 5: Permission Requests & Confirmations

### 5.1 Replace `PermissionRequest` with `<Confirmation>`

**Current** (`Workspace.tsx:752-871`): Custom card with allow/deny buttons.

**New:**

```tsx
<Confirmation approval={approval} state={toolState}>
  <ConfirmationTitle>
    {isAskUserQuestion ? 'Question from Agent' : 'Permission Required'}
  </ConfirmationTitle>
  <ConfirmationRequest>
    <ToolCallDisplay name={toolCall.name} rawInput={toolCall.rawInput} />
  </ConfirmationRequest>
  <ConfirmationAccepted>
    <CheckIcon className="size-4" /> Approved
  </ConfirmationAccepted>
  <ConfirmationRejected>
    <XIcon className="size-4" /> Denied
  </ConfirmationRejected>
  <ConfirmationActions>
    {options.map(opt => (
      <ConfirmationAction
        key={opt.optionId}
        variant={opt.kind?.includes('allow') ? 'default' : 'outline'}
        onClick={() => onRespond(sessionId, toolCallId, opt.optionId)}
      >
        {opt.name}
      </ConfirmationAction>
    ))}
  </ConfirmationActions>
</Confirmation>
```

**Keep:** `AskUserQuestionDisplay` — its question/answer UX has no ai-elements
equivalent. Wrap it in `Confirmation` styling but keep custom logic.

---

## Phase 6: Loading States & Streaming

### 6.1 Replace `LoadingIndicator` with `<Shimmer>`

**Current** (`web/src/components/sdk/LoadingIndicator.tsx`): Custom dot animation.

**New:** `<Shimmer duration={2}>Thinking...</Shimmer>`

**Deletes:** `web/src/components/sdk/LoadingIndicator.tsx`

### 6.2 Streaming cursor

**Current:** Manual `<span className="animate-pulse">` cursor in text content.

**New:** `MessageResponse` has built-in `parseIncompleteMarkdown={true}` (default)
that handles streaming markdown gracefully — auto-closes code blocks, lists, etc.
No manual cursor needed.

---

## Phase 7: SDK Control Panel Refinements

### 7.1 Keep SDK control panel mostly as-is

`SdkControlPanel`, `SdkConfigControls`, `SdkMcpStatus`, etc. are unique to
Aperture and have no ai-elements equivalents. Keep these, but:

- Replace any inline markdown rendering with `<MessageResponse>`
- Replace manual collapsibles with Radix `Collapsible` (already a dep from ai-elements)
- Use `<Terminal>` for log/output display in SDK debugging views

### 7.2 Replace `SdkCheckpoints` with `<Checkpoint>`

```tsx
{checkpoints.map((cp) => (
  <Checkpoint key={cp.id}>
    <CheckpointIcon />
    <CheckpointTrigger onClick={() => rewindFiles(cp.messageId)}>
      Restore to checkpoint #{cp.index}
    </CheckpointTrigger>
  </Checkpoint>
))}
```

---

## Phase 8: Cleanup

### 8.1 Delete replaced components

| File | Replaced by |
|---|---|
| `web/src/components/sdk/ThinkingBlock.tsx` | `ai-elements/reasoning` |
| `web/src/components/sdk/ToolUseBlock.tsx` | `ai-elements/tool` |
| `web/src/components/sdk/ToolInputDisplay.tsx` | `ai-elements/tool` (`ToolInput`) |
| `web/src/components/sdk/ToolCallGroup.tsx` | Multiple `<Tool>` components |
| `web/src/components/sdk/LoadingIndicator.tsx` | `ai-elements/shimmer` |

### 8.2 Remove obsolete dependencies

```bash
pnpm --filter aperture-web remove react-syntax-highlighter @types/react-syntax-highlighter
```

### 8.3 Delete old config files

- `web/tailwind.config.ts` — replaced by CSS `@theme`
- `web/postcss.config.js` (if present) — replaced by `@tailwindcss/vite`

### 8.4 Update barrel exports

Update `web/src/components/sdk/index.ts` to re-export from ai-elements paths.

### 8.5 Customize ai-elements source for HUD aesthetic

Since component source lives in our project, customize:

- **Border radius:** More angular (e.g., `rounded-lg` → `rounded-md`) for HUD feel
- **Glass effects:** Add `backdrop-filter: blur(20px)` to Message, Conversation backgrounds
- **Accent colors:** Ensure `--primary` (#00f5a0 neon green) shines through
- **Monospace font:** Tool names, code blocks use JetBrains Mono via `font-mono`
- **Dark mode priority:** Ensure dark theme looks polished (it's the default)

---

## Execution Order

| Step | Phase | Description | Risk | Independently deployable? |
|---|---|---|---|---|
| 1 | 0.1 | React 19 + Zustand v5 | Medium | Yes |
| 2 | 0.2-0.3 | Tailwind v4 + theme migration | High (CSS churn) | Yes (after step 1) |
| 3 | 0.4-0.6 | shadcn + ai-elements install | Low (additive) | Yes (after step 2) |
| 4 | 1 | Shiki bundle generation | Low (isolated) | Yes (after step 3) |
| 5 | 3.1 | Conversation wrapper | Low | Yes |
| 6 | 4 | PromptInput | Medium | Yes |
| 7 | 3.2-3.4 | Messages, Reasoning, Tool | Medium | Yes |
| 8 | 2 | useChat + WebSocket transport | **High** | Yes (can defer) |
| 9 | 5-6 | Confirmation, Shimmer | Low | Yes |
| 10 | 7 | Control panel refinements | Low | Yes |
| 11 | 8 | Cleanup + theme polish | Low | Yes |

**Recommendation:** Steps 1-7 can be done without step 8 (useChat). The useChat
migration is the highest-risk change and can be deferred or done as a separate PR.
The view components work fine with the existing Zustand store — we just map our
message format to the component props manually.

If deferring step 8, create a thin adapter layer that converts our `Message` type
to ai-elements prop shapes, rather than the full `UIMessage` format. This is less
code than the full `ChatTransport` and can be replaced later.

---

## File Impact Summary

| Category | Files modified | Files added | Files deleted |
|---|---|---|---|
| React 19 + Zustand v5 | ~15 (forwardRef, useRef, store) | 0 | 0 |
| Tailwind v4 + theme | ~30 (CSS vars in all components) | 0 | 2 (tailwind.config.ts, postcss.config) |
| shadcn + ai-elements | 2 (package.json, components.json) | ~12 (components) | 0 |
| Shiki | 1 (CodeBlock customization) | 2 (shiki.bundle.ts, shiki.ts) | 0 |
| Chat view | 1 (Workspace.tsx) | 1 (ApertureMessage.tsx) | 0 |
| useChat transport | 0 | 2 (chat-transport.ts, ws-to-uichunk.ts) | 0 |
| Store simplification | 1 (sessions.ts) | 0 | 0 |
| SDK components | 1 (index.ts) | 0 | 5 |
| **Total** | **~51** | **~17** | **~7** |

---

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Zustand v4→v5 breaks selectors with new references | Medium | Medium | Audit all selectors. Add `useShallow` where selectors return new objects/arrays. |
| React 19 ref callback implicit return errors | High | Low | Codemod catches most. Grep for arrow ref callbacks: `ref={el =>` |
| Tailwind v4 utility renames missed by upgrade tool | Medium | Medium | Run `npx @tailwindcss/upgrade` first. Then grep for old class names (`shadow-sm`, `rounded-sm`, `outline-none`, `ring `, `bg-gradient-to-`). |
| Tailwind v4 default border color change (gray→currentColor) | Medium | Low | Audit bare `border` classes. Add explicit color where needed. |
| `@theme inline` vs `@theme` confusion | Medium | High | Rule: use `@theme inline` when value contains `var()`. Use plain `@theme` for static values. |
| ai-elements components use `framer-motion` imports | High | Low | After install, find-replace `framer-motion` → `motion/react` in ai-elements source. |
| WebSocket transport adapter drops messages / wrong block IDs | Medium | High | Add integration tests for `ws-to-uichunk.ts`. Test start/delta/end lifecycle for text and reasoning blocks. |
| Shiki lazy loading causes FOUC on first code block | Low | Low | Pre-warm singleton on app mount. Show `<Shimmer>` while highlighter loads. |
| Theme migration misses CSS var references | Medium | Low | Grep for `var(--color-` after migration. Add CI lint step to catch regressions. |
| `react-markdown` v10 `className` removal breaks layout | Medium | Low | Wrap `<ReactMarkdown>` in styled div. Mostly moot since we replace with `<MessageResponse>`. |
| `useChat` doesn't handle our multi-option permissions | Low | Medium | Keep permissions in Zustand store, render with `<Confirmation>`, bypass `useChat` for permission responses. |
| AI SDK v6 is still evolving rapidly | Low | Medium | Pin exact versions. Review changelogs before upgrading. |
