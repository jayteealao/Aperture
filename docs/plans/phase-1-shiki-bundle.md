# Phase 1: Shiki Bundle Optimization

> Replace `react-syntax-highlighter` with a purpose-built Shiki bundle via `shiki-codegen`

**Prerequisite:** Phase 0 (shadcn/ui + ai-elements installed)
**Independently deployable:** Yes (after Phase 0)

---

## Current state

Three files use `react-syntax-highlighter` with Prism + `oneDark` theme:

| File | Lines | Usage |
|------|-------|-------|
| `web/src/pages/Workspace.tsx` | 5–6, 666 | `MarkdownContent` — fenced code blocks in chat |
| `web/src/components/session/ToolCallDisplay.tsx` | 1–2, 43–49, 81–87, 168–174 | Permission request tool display (Bash, Write, default JSON) |
| `web/src/components/sdk/ToolInputDisplay.tsx` | 1–2, 50–56, 88–94, 207–213 | SDK tool input display (Bash, Write, default JSON) |

**Language detection** is done two ways:
1. **Markdown fenced blocks** (`Workspace.tsx:654`): regex `/language-(\w+)/` on className from `react-markdown`
2. **File path extension** (`ToolCallDisplay.tsx:179–200`, `ToolInputDisplay.tsx:218–239`): `getLanguageFromPath(path)` maps file extensions to Prism language names

**Current bundle:** `react-syntax-highlighter@^16.1.0` chunks with `react-markdown` and `remark-gfm` into the `markdown` Rolldown chunk group in `vite.config.ts`.

---

## 1.1 Generate a tailored Shiki bundle

### Languages needed

Based on what AI responses contain and what `getLanguageFromPath` maps:

| Language | Source |
|----------|--------|
| TypeScript, JavaScript, TSX, JSX | Code generation, most common |
| JSON, YAML, TOML | Config files |
| HTML, CSS, SCSS | Web code |
| Bash/Shell | Tool execution display (hardcoded `language="bash"`) |
| Python, Rust, Go | Common in AI responses |
| SQL | Database queries |
| Markdown | Documentation |
| Diff | Code diffs |

### Generate

```bash
npx shiki-codegen \
  --langs typescript,javascript,tsx,jsx,json,yaml,toml,html,css,scss,bash,python,rust,go,sql,markdown,diff \
  --themes github-dark,github-light \
  --engine javascript \
  ./web/src/lib/shiki.bundle.ts
```

**Why JavaScript engine:** No WASM dependency. Pure JS, smaller bundle (~300–500 KB gzipped for 17 languages + 2 themes), sufficient for all listed languages. Only fall back to Oniguruma for exotic TextMate grammars.

**Output:** Self-contained `shiki.bundle.ts` with:
- 17 language grammars
- 2 themes (`github-dark`, `github-light`)
- **Built-in singleton shorthands**: `codeToHtml`, `codeToTokens`, `getSingletonHighlighter`, `createHighlighter`

The codegen bundle exports shorthands that maintain an internal singleton automatically. This means we can skip writing a manual singleton wrapper.

---

## 1.2 Use the generated bundle directly (no manual singleton needed)

The codegen bundle's `codeToHtml` shorthand is async and lazy — it creates the highlighter on first call and reuses it. No `web/src/lib/shiki.ts` wrapper needed.

**Pre-warm on app mount** in `web/src/App.tsx` or `web/src/main.tsx`:

```ts
import { getSingletonHighlighter } from '@/lib/shiki.bundle'
getSingletonHighlighter() // Fire and forget — triggers lazy init
```

**Direct usage** (in components):

```ts
import { codeToHtml } from '@/lib/shiki.bundle'

// Async — returns highlighted HTML. Highlighter is created once, reused.
const html = await codeToHtml(code, { lang: 'typescript', theme: 'github-dark' })
```

---

## 1.3 Configure ai-elements `CodeBlock` to use our bundle

After ai-elements installs the `code-block` component source, modify it to import from our generated bundle:

**File:** `web/src/components/ai-elements/code-block.tsx`

```ts
// Replace:
import { createHighlighter } from 'shiki'
// With:
import { codeToHtml, getSingletonHighlighter } from '@/lib/shiki.bundle'
```

Use the bundle's built-in `codeToHtml` shorthand (which manages the singleton internally) instead of manually creating a highlighter instance. This is consistent with section 1.2 — the codegen bundle's shorthands handle singleton lifecycle automatically.

---

## 1.4 Update `ToolInputDisplay` and `ToolCallDisplay`

These components won't be replaced by ai-elements (they're Aperture-specific tool renderers). Replace their `SyntaxHighlighter` usage with a shared Shiki-based code block component.

### Create reusable `CodeHighlight` component

**File:** `web/src/components/ui/CodeHighlight.tsx`

```tsx
import { useState, useEffect } from 'react'
import { codeToHtml } from '@/lib/shiki.bundle'
import { useAppStore } from '@/stores/app'

interface CodeHighlightProps {
  code: string
  language: string
  className?: string
  style?: React.CSSProperties
}

export function CodeHighlight({ code, language, className, style }: CodeHighlightProps) {
  const [html, setHtml] = useState<string>('')
  const theme = useAppStore(s => s.theme)

  useEffect(() => {
    let cancelled = false
    codeToHtml(code, {
      lang: language,
      theme: theme === 'dark' ? 'github-dark' : 'github-light',
    }).then(result => {
      if (!cancelled) setHtml(result)
    }).catch(() => {
      // Unsupported language — fallback (plain code block) is already shown
    })
    return () => { cancelled = true }
  }, [code, language, theme])

  if (!html) {
    // Fallback while highlighter loads — plain code block
    return (
      <pre className={className} style={style}>
        <code className="font-mono text-xs">{code}</code>
      </pre>
    )
  }

  return (
    <div
      className={className}
      style={style}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}
```

### Reuse across tool display components

This `CodeHighlight` component replaces all 6 `SyntaxHighlighter` usages in `ToolCallDisplay.tsx` and `ToolInputDisplay.tsx`:

**`ToolCallDisplay.tsx`:**
- `BashDisplay` (line 43): `<SyntaxHighlighter language="bash">` → `<CodeHighlight language="bash">`
- `WriteDisplay` (line 81): `<SyntaxHighlighter language={getLanguageFromPath(filePath)}>` → `<CodeHighlight language={...}>`
- `DefaultDisplay` (line 168): `<SyntaxHighlighter language="json">` → `<CodeHighlight language="json">`

**`ToolInputDisplay.tsx`:**
- `BashDisplay` (line 50): same pattern
- `WriteDisplay` (line 88): same pattern
- `DefaultDisplay` (line 207): same pattern

### Keep `getLanguageFromPath` utility

The `getLanguageFromPath` function in both files maps file extensions to language names. **Consolidate** into a single shared utility:

**File:** `web/src/utils/language.ts`

```ts
const EXT_TO_LANG: Record<string, string> = {
  ts: 'typescript', tsx: 'tsx', js: 'javascript', jsx: 'jsx',
  json: 'json', py: 'python', rs: 'rust', go: 'go',
  md: 'markdown', css: 'css', scss: 'scss', html: 'html',
  yml: 'yaml', yaml: 'yaml', sh: 'bash', bash: 'bash',
  sql: 'sql', toml: 'toml', diff: 'diff',
}

export function getLanguageFromPath(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase() ?? ''
  return EXT_TO_LANG[ext] ?? 'plaintext'
}
```

Remove the duplicated `getLanguageFromPath` from both `ToolCallDisplay.tsx` (line 179–200) and `ToolInputDisplay.tsx` (line 218–239).

---

## 1.5 Remove `react-syntax-highlighter`

```bash
pnpm --filter aperture-web remove react-syntax-highlighter @types/react-syntax-highlighter
```

Remove all imports:
- `web/src/pages/Workspace.tsx:5–6` — `Prism as SyntaxHighlighter`, `oneDark`
- `web/src/components/session/ToolCallDisplay.tsx:1–2` — same
- `web/src/components/sdk/ToolInputDisplay.tsx:1–2` — same

### Update `vite.config.ts` Rolldown chunk groups

Phase 0 migrated the app to Vite 8's Rolldown build pipeline. Do **not** reintroduce `rollupOptions.manualChunks` here. Update `build.rolldownOptions.output.codeSplitting.groups` instead.

Replace the current markdown group:

```ts
{
  name: 'markdown',
  test: /\/node_modules\/(react-markdown|remark-gfm|react-syntax-highlighter)\//,
  priority: 6,
}
```

With:

```ts
{
  name: 'markdown',
  test: /\/node_modules\/(react-markdown|remark-gfm)\//,
  priority: 6,
},
{
  name: 'shiki',
  test: /\/src\/lib\/shiki\.bundle\.ts$/,
  priority: 5,
}
```

If the generated bundle ends up elsewhere, update the `test` regex to match the actual path. The important part is that `react-syntax-highlighter` is removed from the markdown group and the generated Shiki bundle gets its own named Rolldown chunk group.

---

## Bundle size comparison

| Approach | Gzipped size |
|----------|-------------|
| `react-syntax-highlighter` + Prism (current) | ~120 KB |
| `shiki` full bundle | ~1.2 MB |
| `shiki/bundle/web` | ~695 KB |
| `shiki-codegen` (17 langs, 2 themes, JS engine) | ~300–500 KB |

The shiki-codegen bundle is larger than `react-syntax-highlighter`, but provides VS Code-quality highlighting with dual theme support. The tradeoff is worthwhile — Shiki handles edge cases (nested grammars, complex scoping) that Prism misses.

---

## Files changed

| Action | File | Details |
|--------|------|---------|
| **Add** | `web/src/lib/shiki.bundle.ts` | Generated by shiki-codegen (has built-in singleton) |
| **Add** | `web/src/components/ui/CodeHighlight.tsx` | Shared Shiki code block |
| **Add** | `web/src/utils/language.ts` | Shared `getLanguageFromPath` |
| **Modify** | `web/src/components/ai-elements/code-block.tsx` | Import from our bundle |
| **Modify** | `web/src/components/session/ToolCallDisplay.tsx` | Replace SyntaxHighlighter → CodeHighlight |
| **Modify** | `web/src/components/sdk/ToolInputDisplay.tsx` | Replace SyntaxHighlighter → CodeHighlight |
| **Modify** | `web/src/pages/Workspace.tsx` | Remove SyntaxHighlighter imports (MarkdownContent deleted in Phase 3) |
| **Modify** | `web/src/App.tsx` | Pre-warm highlighter |
| **Modify** | `web/vite.config.ts` | Update Rolldown `codeSplitting.groups` |

---

## Visual change: theme colors

This migration switches from Prism's `oneDark` theme to Shiki's `github-dark` / `github-light`. The syntax highlighting color palette **will visibly change** across every code block. This is expected — Shiki's themes are VS Code-native and generally higher quality — but requires visual sign-off.

Key differences:
- String colors shift slightly
- Keyword/operator highlighting may differ
- Background color changes (oneDark is slightly warmer than github-dark)

---

## Verification

```bash
pnpm --filter aperture-web type-check
pnpm --filter aperture-web build

# Check bundle size
ls -la web/dist/assets/*.js | sort -k5 -n

# Visual: verify code blocks render correctly in chat
# Visual: verify tool input displays render correctly
# Visual: verify dark/light theme switching works on code blocks
# Visual: compare code block colors with current oneDark theme — sign off on the change
# Visual: verify unsupported languages (e.g. Haskell) degrade gracefully to plain text
```
