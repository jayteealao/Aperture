# Phase 8: Cleanup & Theme Polish

> Delete replaced components, consolidate duplicates, remove obsolete dependencies, clean up barrel exports, remove feature flag, polish HUD aesthetic on ai-elements components

**Prerequisite:** All previous phases complete
**Independently deployable:** Yes (final polish)
**Risk:** Low

---

## 8.1 Delete replaced components (verify)

| File | Replaced by | Should be deleted in |
|------|------------|---------------------|
| `web/src/components/sdk/ThinkingBlock.tsx` (46 lines) | `ai-elements/reasoning` | Phase 3 |
| `web/src/components/sdk/ToolUseBlock.tsx` (89 lines) | `ApertureToolPart` + `ai-elements/tool` | Phase 3 |
| `web/src/components/sdk/ToolCallGroup.tsx` (89 lines) | Multiple `<Tool>` instances | Phase 3 |
| `web/src/components/sdk/LoadingIndicator.tsx` (18 lines) | `ai-elements/shimmer` | Phase 3 |

**Verify these were already deleted in Phase 3.** If not, delete now.

---

## 8.2 Consolidate `ToolCallDisplay` and `ToolInputDisplay`

These are near-duplicate components in different directories:

| Component | File | Lines | Used by |
|-----------|------|-------|---------|
| `ToolCallDisplay` | `web/src/components/session/ToolCallDisplay.tsx` | 206 | `PermissionConfirmation` (Phase 5) |
| `ToolInputDisplay` | `web/src/components/sdk/ToolInputDisplay.tsx` | 245 | `ApertureToolPart` (Phase 3) |

Both do the same thing: render tool call details with `BashDisplay`, `WriteDisplay`, and `DefaultDisplay`. `ToolInputDisplay` has additional handlers for `WebSearch`, `Task`, and `Bot` icons and longer truncation limits.

### Consolidation

Keep `ToolInputDisplay` (the more complete version). Delete `ToolCallDisplay`. Update `PermissionConfirmation` to import from the consolidated location:

```tsx
// web/src/components/chat/PermissionConfirmation.tsx
// Replace:
import { ToolCallDisplay } from '@/components/session/ToolCallDisplay'
// With:
import { ToolInputDisplay } from '@/components/sdk/ToolInputDisplay'
```

The prop name changes from `rawInput` to `input`. Update the call site in `PermissionConfirmation`:

```tsx
// Before (ToolCallDisplay interface):
<ToolCallDisplay
  name={toolName ?? 'Unknown Tool'}
  rawInput={permission.toolCall.rawInput}
/>

// After (ToolInputDisplay interface):
<ToolInputDisplay
  name={toolName ?? 'Unknown Tool'}
  input={permission.toolCall.rawInput}
/>
```

**Delete:** `web/src/components/session/ToolCallDisplay.tsx` (206 lines)

### Update `getLanguageFromPath`

Both files had their own `getLanguageFromPath`. Phase 1 consolidated this into `web/src/utils/language.ts`. Verify `ToolInputDisplay` imports from the shared utility and the duplicated function is gone.

---

## 8.2.1 Delete temporary message handlers

Phase 2's store refactoring extracted WS message handlers into:
- `web/src/stores/sessions/sdk-message-handler.ts` (228 lines) — SDK streaming, content blocks
- `web/src/stores/sessions/pi-message-handler.ts` (182 lines) — Pi streaming, tool execution
- `web/src/stores/sessions/jsonrpc-message-handler.ts` (170 lines) — JSON-RPC session commands

These serve the legacy `WorkspaceLegacy` codepath. After the feature flag is removed:
1. Delete all three handler files
2. Delete `web/src/stores/sessions/handler-types.ts`
3. Delete `web/src/stores/sessions/message-slice.ts` (legacy message state)
4. Remove the handler imports from `connection-slice.ts`
5. Remove `MessageSlice` from the `SessionsStore` union in `index.ts`

## 8.2.2 WS payload validation (deferred from Phase 2 review)

Phase 2's review identified ~33 `as` type assertions on WebSocket payloads across the handler files (H4). These are external data boundaries that should be validated per CLAUDE.md rules. After the handler files are deleted (8.2.1), validation only needs to be added to:
- `ws-to-uichunk.ts` (7 locations) — the translator that feeds `useChat`

Add defensive type guards or zod schemas for the inner payload shapes. This is lower priority since the translator already has structural checks on most fields.

## 8.3 Remove feature flag

Phase 2 shipped `USE_CHAT_TRANSPORT` behind a feature flag. After stability is confirmed:

1. Delete `web/src/lib/feature-flags.ts`
2. Delete `ChatViewLegacy` component (if it still exists)
3. Remove the flag check in `ChatArea`
4. Delete any remaining old message handlers from the store (the old `sessions.ts` patterns)

---

## 8.4 Remove obsolete dependencies

```bash
pnpm --filter aperture-web remove react-syntax-highlighter @types/react-syntax-highlighter
```

**Verify removal was done in Phase 1.** If not, remove now.

### Check if `react-markdown` is still needed

After Phase 3, `MarkdownContent` (which used `react-markdown`) is replaced by ai-elements `<MessageResponse>`. Check if `MessageResponse` uses `react-markdown` internally:

- **If yes:** `react-markdown` stays as a transitive dependency. Keep it in the `markdown` Rolldown chunk group.
- **If no:** `react-markdown` and `remark-gfm` can be removed:
  ```bash
  pnpm --filter aperture-web remove react-markdown remark-gfm
  ```
  And remove the `markdown` Rolldown chunk group from `vite.config.ts`.

### Unused dependency audit

```bash
npx depcheck --ignores="@types/*,tailwindcss,@tailwindcss/*" web/
```

---

## 8.5 Delete old config files (verify)

| File | Replaced by | Should be deleted in |
|------|------------|---------------------|
| `web/tailwind.config.ts` (115 lines) | `@theme` in `index.css` | Phase 0.2 |
| `web/postcss.config.js` (6 lines) | `@tailwindcss/vite` | Phase 0.2 |

**Verify these were already deleted in Phase 0.2.**

---

## 8.6 Delete old store file (verify)

| File | Replaced by | Should be deleted in |
|------|------------|---------------------|
| `web/src/stores/sessions.ts` (1,460 lines) | `web/src/stores/sessions/` directory (5 slices) | Phase 2 |

**Verify.** All imports of `useSessionsStore` should now point to `@/stores/sessions` (the directory index).

---

## 8.7 Update barrel exports

### `web/src/components/sdk/index.ts`

**After all phases, should export:**

```ts
export { SdkControlPanel } from './SdkControlPanel'
export { SdkSessionHeader } from './SdkSessionHeader'
export { SdkUsageDisplay } from './SdkUsageDisplay'
export { SdkAccountInfo } from './SdkAccountInfo'
export { SdkConfigControls } from './SdkConfigControls'
export { SdkMcpStatus } from './SdkMcpStatus'
export { SdkCheckpoints } from './SdkCheckpoints'
export { SdkCommandsList } from './SdkCommandsList'
export { ToolInputDisplay } from './ToolInputDisplay'
```

**Removed exports** (components deleted):
- ~~`ThinkingBlock`~~
- ~~`ToolUseBlock`~~
- ~~`ToolCallGroup`~~
- ~~`LoadingIndicator`~~

### `web/src/components/session/` — verify

After consolidating `ToolCallDisplay` into `ToolInputDisplay`:
- `AskUserQuestionDisplay.tsx` — kept (346 lines, unique UI)
- ~~`ToolCallDisplay.tsx`~~ — deleted (consolidated into `ToolInputDisplay`)
- Other session components — verify still needed

---

## 8.8 Remove dead animations

From codebase analysis, 4 custom animations now exist in the Tailwind v4 `@theme` block in `web/src/index.css` but appear unused:

| Animation | Status |
|-----------|--------|
| `animate-slide-right` | Defined but never used |
| `animate-pulse-slow` | Defined but never used |
| `animate-spin-slow` | Defined but never used |
| `animate-typing` | Defined but never used |

Since Phase 0 already migrated them into `index.css`, Phase 8 should **delete** these unused `@theme` animation tokens if they are still unreferenced:

| Animation | Used in | Migrate to `@theme` |
|-----------|---------|---------------------|
| `animate-fade-in` | `CommandPalette.tsx:204`, `Dialog.tsx:38` | Yes |
| `animate-slide-up` | `Dialog.tsx:47` | Yes |
| `animate-slide-down` | `CommandPalette.tsx:209` | Yes |
| `animate-slide-left` | `Toast.tsx:111` | Yes |
| `animate-in` | `Workspace.tsx:538`, `Onboarding.tsx:91`, `App.tsx:19` | Yes (defined in `index.css:134`, not tailwind.config) |

Also audit for any now-unused `@keyframes` blocks that only supported the deleted animation tokens.

---

## 8.8.1 Remove unnecessary `React` default imports

Phase 0 standardized the app on the `react-jsx` transform. Any remaining `import React from 'react'` statements that are not actually used should be removed.

Current known candidate:

| File | Notes |
|------|-------|
| `web/src/main.tsx` | Default `React` import is unnecessary under `jsx: "react-jsx"` |

Treat this as cleanup-only. Do not churn files where the default import is still genuinely needed for types or namespace access.

---

## 8.8.2 Audit legacy `--color-*` aliases

Phase 0 introduced a backward-compatibility bridge in `web/src/index.css` that maps older HUD variables (`--color-bg-primary`, `--color-text-secondary`, etc.) onto the new shadcn/Tailwind v4 token names.

By Phase 8, audit whether the legacy aliases are still needed:

1. Search CSS and TSX for references to `var(--color-`
2. Distinguish legitimate Tailwind v4 theme tokens such as `--color-background` and `--color-muted-foreground` from the older bridge aliases like `--color-bg-primary`
3. Remove bridge aliases that are no longer referenced anywhere
4. Keep any remaining aliases only if they still support unreplaced legacy styles

---

## 8.9 Clean up `Workspace.tsx`

After Phases 3–6, Workspace.tsx should drop from ~964 lines to ~400–450 lines. Final cleanup:

### Remove unused imports

After all phases, these imports should be gone:
```tsx
// Remove:
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism'
import { ThinkingBlock, ToolUseBlock, ToolCallGroup, LoadingIndicator } from '@/components/sdk'
```

### Remove unused inline functions

After all phases, these should be gone:
- `MarkdownContent` (lines 647–705)
- `ToolBlock` (lines 707–750)
- `MessageBubble` (lines 514–645)
- `PermissionRequest` (lines 752–871)
- `ConnectionStatus` (lines 496–512) — extracted to own file
- `extractContentBlocks` (lines 873–963)
- Scroll management code (lines 122–142)
- Image attachment handlers (lines 190–250)

### Remove unused state

After all phases:
- `attachedImages` / `setAttachedImages` (moved to PromptInput)
- `fileInputRef` (moved to PromptInput)
- `scrollContainerRef`, `messagesEndRef` (moved to Conversation)
- `isAtBottom` (moved to Conversation)
- `isSending` (moved to PromptInputSubmit status)
- `input` / `setInput` (moved to PromptInput)

---

## 8.10 Verify Pi state cleanup fix

Phase 2's store refactoring fixed the `removeSession` Pi state leak. Verify:

```ts
describe('session-slice removeSession', () => {
  it('cleans up SDK state maps on session removal', () => {
    // Add SDK session, populate state, remove, verify all sdkX maps are clean
  })
  it('cleans up Pi state maps on session removal', () => {
    // Add Pi session, populate piConfig/piStats/piModels/piSessionTree/
    // piForkableEntries/piThinkingLevel/piLoading/piErrors
    // Remove session, verify ALL maps are clean
  })
  it('clearAll resets both SDK and Pi state', () => {
    // Populate both, clearAll, verify both are reset
  })
})
```

---

## 8.11 Customize ai-elements for HUD aesthetic

Since ai-elements source lives in our project (`web/src/components/ai-elements/`), customize for our design:

### Glass effects

Add `backdrop-filter: blur(20px)` to key components:

```tsx
// In message.tsx — MessageContent for assistant messages
className={cn(
  "...",
  "group-[.is-assistant]:backdrop-blur-xl group-[.is-assistant]:bg-secondary",
)}
```

### Border radius

More angular for HUD feel — replace `rounded-lg` with `rounded-md`:

```tsx
// In components that use rounded-lg
// Review each ai-elements component and adjust
```

### Accent colors

Ensure `--primary` (#00f5a0 neon green) shines through in:
- `PromptInputSubmit` button
- `ToolHeader` status badges
- `ConversationScrollButton`
- Links in `MessageResponse`

### Monospace font

Tool names, code blocks, and technical content use JetBrains Mono via `font-mono`:
- `ToolHeader` tool name
- `CodeBlock` content
- `Terminal` content

### Dark mode priority

Dark theme (Nebula Glass) is the default. Verify all ai-elements components look polished in dark mode:
- Contrast ratios meet WCAG AA
- Glass effects visible but not overwhelming
- Accent colors readable

---

## 8.12 Update `vite.config.ts` Rolldown chunk groups

Phase 0 moved the build to Vite 8 + Rolldown. Final chunking should stay in `build.rolldownOptions.output.codeSplitting.groups`, not `rollupOptions.manualChunks`.

Final target shape:

```ts
codeSplitting: {
  groups: [
    { name: 'react', test: /\/node_modules\/react(-dom)?\//, priority: 10 },
    { name: 'router', test: /\/node_modules\/react-router\//, priority: 9 },
    { name: 'query', test: /\/node_modules\/@tanstack\/react-query/, priority: 8 },
    { name: 'state', test: /\/node_modules\/zustand/, priority: 7 },
    // Only if react-markdown is still used (check 8.4):
    // { name: 'markdown', test: /\/node_modules\/(react-markdown|remark-gfm)\//, priority: 6 },
    { name: 'shiki', test: /\/src\/lib\/shiki\.bundle\.ts$/, priority: 5 },
    { name: 'motion', test: /\/node_modules\/motion\//, priority: 4 },
    {
      name: 'radix',
      test: /\/node_modules\/(@radix-ui|radix-ui)\//,
      priority: 3,
    },
    { name: 'ai', test: /\/node_modules\/ai\//, priority: 2 },
  ],
}
```

Remove `react-syntax-highlighter` from chunking in Phase 1. Keep the router matcher on `react-router`, not `react-router-dom`, since Phase 0 already completed that package swap.

---

## 8.13 Final file inventory

### New files added across all phases

| File | Phase | Purpose |
|------|-------|---------|
| `web/src/lib/shiki.bundle.ts` | 1 | Generated Shiki bundle (has built-in singleton shorthands) |
| `web/src/components/ui/CodeHighlight.tsx` | 1 | Shared code highlighting |
| `web/src/utils/language.ts` | 1 | `getLanguageFromPath` utility |
| `web/src/api/chat-transport.ts` | 2 | WebSocket ChatTransport (backend-agnostic) |
| `web/src/api/ws-to-uichunk.ts` | 2 | WS → UIMessageChunk translator (SDK + Pi) |
| `web/src/stores/sessions/index.ts` | 2 | Combined store re-export |
| `web/src/stores/sessions/session-slice.ts` | 2 | Session lifecycle + cleanup |
| `web/src/stores/sessions/connection-slice.ts` | 2 | Connection state |
| `web/src/stores/sessions/permission-slice.ts` | 2 | SDK permissions |
| `web/src/stores/sessions/sdk-slice.ts` | 2 | SDK-specific state |
| `web/src/stores/sessions/pi-slice.ts` | 2 | Pi-specific state + commands |
| `web/src/stores/sessions/persistence.ts` | 2 | IndexedDB helpers |
| `web/src/stores/sessions/handler-types.ts` | 2 | Shared types for WS handlers |
| `web/src/stores/sessions/sdk-message-handler.ts` | 2 | SDK WS handler (TEMPORARY) |
| `web/src/stores/sessions/pi-message-handler.ts` | 2 | Pi WS handler (TEMPORARY) |
| `web/src/stores/sessions/jsonrpc-message-handler.ts` | 2 | JSON-RPC handler (TEMPORARY) |
| `web/src/stores/sessions/cleanup-helper.ts` | 2 | Generic session state cleanup |
| `web/src/hooks/usePersistedUIMessages.ts` | 2 | useChat message persistence |
| `web/src/utils/ui-message.ts` | 2 | UIMessage type + legacy coercion |
| `web/src/lib/feature-flags.ts` | 2 | Feature flag (deleted in Phase 8) |
| `web/src/components/chat/ApertureMessage.tsx` | 3 | Message component |
| `web/src/components/chat/ApertureToolPart.tsx` | 3 | Tool part renderer |
| `web/src/components/chat/ConnectionStatus.tsx` | 3 | Extracted from Workspace.tsx |
| `web/src/components/chat/ChatErrorBoundary.tsx` | 3 | Error boundary |
| `web/src/components/chat/PermissionConfirmation.tsx` | 5 | Permission UI (SDK only) |
| `web/src/components/ui/PanelSection.tsx` | 7 | Shared Radix Collapsible section |
| `web/src/components/ai-elements/*.tsx` | 0 | ~10 ai-elements components |
| `web/components.json` | 0 | shadcn config |

### Files deleted across all phases

| File | Phase | Lines |
|------|-------|-------|
| `web/tailwind.config.ts` | 0.2 | 115 |
| `web/postcss.config.js` | 0.2 | 6 |
| `web/src/stores/sessions.ts` | 2 | 1,460 |
| `web/src/lib/feature-flags.ts` | 8 | ~10 |
| `web/src/components/sdk/ThinkingBlock.tsx` | 3 | 46 |
| `web/src/components/sdk/ToolUseBlock.tsx` | 3 | 89 |
| `web/src/components/sdk/ToolCallGroup.tsx` | 3 | 89 |
| `web/src/components/sdk/LoadingIndicator.tsx` | 3 | 18 |
| `web/src/components/session/ToolCallDisplay.tsx` | 8 | 206 |
| `web/src/stores/sessions/message-slice.ts` | 8 | ~94 |
| `web/src/stores/sessions/sdk-message-handler.ts` | 8 | ~228 |
| `web/src/stores/sessions/pi-message-handler.ts` | 8 | ~182 |
| `web/src/stores/sessions/jsonrpc-message-handler.ts` | 8 | ~170 |
| `web/src/stores/sessions/handler-types.ts` | 8 | ~5 |

### Net line count change

| Category | Lines removed | Lines added | Net |
|----------|-------------|-------------|-----|
| Workspace.tsx inline code | ~515 | ~50 | -465 |
| Deleted SDK components | ~242 | 0 | -242 |
| Deleted ToolCallDisplay | ~206 | 0 | -206 |
| Old sessions.ts | ~1,460 | 0 | -1,460 |
| Deleted message-slice.ts | ~450 | 0 | -450 |
| Config files | ~121 | 0 | -121 |
| New store slices | 0 | ~630 | +630 |
| New chat components | 0 | ~350 | +350 |
| New transport/translator | 0 | ~350 | +350 |
| New utilities | 0 | ~80 | +80 |
| ai-elements (from registry) | 0 | ~800 | +800 |
| **Total** | **~2,994** | **~2,260** | **-734** |

Net custom code decreases by ~734 lines (including temporary message-slice deleted after flag removal). ~800 of the additions are ai-elements registry code (vendor code we own). The 1,460-line monolithic store is replaced by ~630 lines of focused slices with proper cleanup. Pi thinking and tool events are now visible (previously dropped).

---

## Verification checklist (final)

```bash
pnpm --filter aperture-web typecheck   # Zero errors
pnpm --filter aperture-web build       # Clean build
pnpm --filter aperture-web test        # All tests pass

# Bundle analysis
npx vite-bundle-visualizer -c web/vite.config.ts
# Verify: no react-syntax-highlighter, shiki chunk exists, ai chunk exists

# Visual regression testing — SDK sessions:
# - Empty chat state
# - Message streaming (text + thinking + tool calls)
# - Permission requests (all types)
# - AskUserQuestion
# - SDK control panel (all sections, collapse animation)
# - Checkpoint rewind

# Visual regression testing — Pi sessions:
# - Message streaming (text)
# - Thinking blocks now visible (was console.log)
# - Tool calls now visible (was invisible)
# - Pi control panel (steer, follow-up, thinking level, model cycle)
# - Session tree navigation
# - Fork/navigate

# Visual regression testing — shared:
# - Sessions list (light + dark)
# - Workspace chat (light + dark)
# - Sidebar navigation + streaming dots
# - Connection status dot
# - Command palette
# - Credentials page
# - Workspaces page
# - Error boundary recovery
# - Feature flag removed (no localStorage remnant)
```
