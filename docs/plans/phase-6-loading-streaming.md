# Phase 6: Loading States & Streaming Polish

> Audit remaining loading/streaming UI after Phase 3 replacements. Update status displays to use `useChat.status`.

**Prerequisite:** Phase 2 (`useChat` status), Phase 3 (message components replaced)
**Independently deployable:** Yes (after Phase 3)
**Risk:** Low — mostly status source swaps

---

## Current state (post-Phase 3)

Phase 3 already handles the major replacements:
- `LoadingIndicator` → `<Shimmer>` (deleted in Phase 3)
- Streaming text cursor → built-in `<MessageResponse>` streaming
- ThinkingBlock cursors → built-in `<Reasoning isStreaming>`
- Tool executing spinner → `<ToolHeader state="input-streaming">`

This phase handles the **remaining streaming UI** that reads from connection state and needs to switch to `useChat.status`.

---

## 6.1 Streaming status display

### Current: "Streaming..." badge (Workspace.tsx:306–309)

```tsx
{connection?.isStreaming && (
  <Badge variant="outline" className="animate-pulse text-accent border-accent/30">
    Streaming...
  </Badge>
)}
```

### Updated: use `useChat.status`

```tsx
{status === 'streaming' && (
  <Badge variant="outline" className="animate-pulse text-primary border-primary/30">
    Streaming...
  </Badge>
)}
{status === 'submitted' && (
  <Badge variant="outline" className="text-muted-foreground">
    Sending...
  </Badge>
)}
```

This is a 1:1 swap — the badge stays, the data source changes. Works for both SDK and Pi sessions since `useChat.status` is backend-agnostic.

---

## 6.2 Stop/interrupt button

### Current: reads `connection?.isStreaming` (Workspace.tsx:448)

After Phase 4, the stop button is built into `<PromptInputSubmit status={status} />` which uses `useChat.status` directly. No additional work needed here.

### SDK control panel interrupt (SdkSessionHeader.tsx:85–95)

```tsx
// Current:
{connection?.isStreaming && (
  <Button size="sm" variant="outline" onClick={() => cancelPrompt(sessionId)}>
    <StopCircle className="size-3.5 mr-1" /> Interrupt
  </Button>
)}

// Updated — read status from useChat context or prop:
{status === 'streaming' && (
  <Button size="sm" variant="outline" onClick={stop}>
    <StopCircle className="size-3.5 mr-1" /> Interrupt
  </Button>
)}
```

### Pi control panel steer/follow-up (PiControlPanel.tsx:~274)

Pi's steer/follow-up buttons are shown during streaming. They send commands via `wsManager.send()` (Pi WS commands in `pi-slice`), NOT through `useChat.stop()`. These stay as-is — they're Pi-specific sidebar controls, not chat-level stop.

The visibility gate changes from `connection?.isStreaming` to checking `useChat.status === 'streaming'`:

```tsx
// Current:
const { isStreaming } = useSessionsStore(s => s.connections[sessionId] ?? {})

// Updated — pass status as prop from Workspace or use a shared context:
{status === 'streaming' && (
  <div className="space-y-2">
    <Button onClick={() => piSteer(sessionId, steerText)}>Steer</Button>
    <Button onClick={() => piFollowUp(sessionId, followUpText)}>Follow Up</Button>
  </div>
)}
```

---

## 6.3 Sidebar streaming dot

### Current: `Sidebar.tsx:157`

```tsx
{connection?.isStreaming && (
  <span className="w-2 h-2 rounded-full bg-accent animate-pulse" />
)}
```

This reads from `connections[sessionId].isStreaming` in the store. After Phase 2, `connections` no longer tracks `isStreaming` (moved to `useChat`). But `useChat` is per-session and can't be called in the sidebar (which renders all sessions).

**Solution:** Keep a minimal `isStreaming` flag in `connection-slice` that the `ChatView` component writes to on status change:

```tsx
// In ChatView (Workspace.tsx):
const { status } = useChat({ ... })
const setConnectionStreaming = useSessionsStore(s => s.setConnectionStreaming)

useEffect(() => {
  setConnectionStreaming(sessionId, status === 'streaming')
}, [sessionId, status, setConnectionStreaming])
```

This syncs `useChat.status` back to the store for sidebar consumption. The store is the reader, `useChat` is the source of truth.

---

## 6.4 Keep existing loading patterns

### `Skeleton`/`SkeletonCard` — keep

Used in `Sessions.tsx:150` and `Credentials.tsx:107` for page-level loading states. These are page-level skeleton screens, not chat streaming — ai-elements doesn't replace them.

### `Spinner` — keep

Used in button loading states. Not chat-specific.

---

## Summary of changes

| What | Before | After |
|------|--------|-------|
| "Streaming..." badge | `connection?.isStreaming` | `useChat.status === 'streaming'` |
| SDK interrupt button | `connection?.isStreaming` + `cancelPrompt` | `status === 'streaming'` + `useChat.stop` |
| Pi steer/follow-up visibility | `connection?.isStreaming` | `status === 'streaming'` (prop) |
| Sidebar streaming dot | `connections[id].isStreaming` (store) | Store, synced from `useChat.status` |
| Page loading skeletons | `Skeleton`/`SkeletonCard` | **Keep** — page-level, not chat |
| Button loading | `Spinner` | **Keep** — not chat-specific |

---

## Files changed

| Action | File | Details |
|--------|------|---------|
| **Modify** | `web/src/pages/Workspace.tsx` | Replace streaming badge source, sync status to store |
| **Modify** | `web/src/components/sdk/SdkSessionHeader.tsx` | Use `status` prop for interrupt button |
| **Modify** | `web/src/components/pi/PiControlPanel.tsx` | Use `status` prop for steer/follow-up visibility |
| **Modify** | `web/src/stores/sessions/connection-slice.ts` | Add `setConnectionStreaming` method |

---

## Verification

```bash
pnpm --filter aperture-web typecheck
pnpm --filter aperture-web build

# Visual — SDK sessions:
# 1. Send message → "Sending..." badge, then "Streaming..." badge
# 2. SDK control panel interrupt button visible during streaming
# 3. Sidebar shows pulse dot for streaming sessions

# Visual — Pi sessions:
# 4. Send message → "Streaming..." badge appears
# 5. Pi steer/follow-up buttons visible during streaming
# 6. Sidebar shows pulse dot for streaming Pi sessions
# 7. Steer/follow-up still work (don't cancel the stream)
```
