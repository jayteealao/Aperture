# Phase 4: Prompt Input (Composer)

> Replace the custom composer (textarea + image attachments + drag/drop + send/stop) with ai-elements `<PromptInput>`

**Prerequisite:** Phase 0 (ai-elements installed), Phase 2 (`useChat` provides `sendMessage` and `status`)
**Independently deployable:** Yes (after Phase 2)

---

## Current state in `Workspace.tsx`

The composer area spans ~170 lines of inline code:

### State (lines 60–66)
```tsx
const [input, setInput] = useState('')
const [isSending, setIsSending] = useState(false)
const [attachedImages, setAttachedImages] = useState<ImageAttachment[]>([])
const fileInputRef = useRef<HTMLInputElement>(null)
```

### Image handling (lines 190–250)
- `addImageFiles(files: FileList)` — validates type (`IMAGE_LIMITS.ALLOWED_MIME_TYPES`), size (`10 MB`), count (`5 max`), reads via `FileReader.readAsDataURL()`, strips base64 prefix
- `removeImage(index)` — filters by index
- `handlePaste(e)` — reads `clipboardData.items` for images
- `handleDrop(e)` / `handleDragOver(e)` — drag-and-drop file handling
- Hidden `<input type="file">` at lines 411–422

### Key press handling (lines 173–181)
- Enter → send, Shift+Enter → newline

### Send/Stop (lines 152–171, 448–462)
- `handleSend` — trims input, builds content with images, calls `sendMessage(sessionId, content, images)`, restores input on error
- `handleCancel` — calls `cancelPrompt(sessionId)`
- Renders `<Button variant="danger">` with `<StopCircle>` when streaming, `<Button variant="primary">` with `<Send>` when ready

### Image preview (lines 385–410)
- Grid of attached image thumbnails with remove buttons
- Max 5 images per `IMAGE_LIMITS.MAX_COUNT`

### `IMAGE_LIMITS` constant (`web/src/api/types.ts:22–25`)
```ts
export const IMAGE_LIMITS = {
  MAX_COUNT: 5,
  MAX_BYTES: 10 * 1024 * 1024,
  ALLOWED_MIME_TYPES: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'] as const,
}
```

---

## Replacement with `<PromptInput>`

### New implementation

```tsx
import {
  PromptInput,
  PromptInputHeader,
  PromptInputBody,
  PromptInputFooter,
  PromptInputTextarea,
  PromptInputSubmit,
  PromptInputTools,
  PromptInputActionMenu,
  PromptInputActionMenuTrigger,
  PromptInputActionMenuContent,
  PromptInputActionAddAttachments,
  PromptInputAttachmentsDisplay,
} from '@/components/ai-elements/prompt-input'

// In Workspace.tsx render:
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
    <PromptInputTextarea
      placeholder="Type your message... (Shift+Enter for new line)"
      disabled={connectionStatus === 'disconnected' || connectionStatus === 'error'}
    />
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
    <PromptInputSubmit status={status} />
  </PromptInputFooter>
</PromptInput>
```

### Submit handler

`useChat.sendMessage` handles the message → transport → WebSocket flow for both SDK and Pi sessions:

```tsx
const handleSubmit = (message: PromptInputMessage) => {
  if (!message.text.trim() && !message.files?.length) return
  sendMessage({ text: message.text, files: message.files })
}
```

### Status mapping

`PromptInputSubmit` accepts: `'ready' | 'submitted' | 'streaming' | 'error'`

`useChat.status` maps directly — no adapter needed:

```tsx
// status from useChat is already the correct type:
// 'ready' → shows send icon
// 'submitted' → shows loading spinner
// 'streaming' → shows stop icon (click to stop)
// 'error' → shows error state
<PromptInputSubmit status={status} />
```

The stop action is wired through `useChat.stop()` which triggers the transport's `AbortSignal`, sending a `cancel` message over WebSocket. This works identically for SDK and Pi sessions.

---

## What gets deleted

### State variables removed from Workspace.tsx
- `input` / `setInput` — `PromptInput` manages its own textarea state
- `isSending` / `setIsSending` — `PromptInputSubmit` handles loading via `status`
- `attachedImages` / `setAttachedImages` — `PromptInput` manages attachments internally
- `fileInputRef` — `PromptInputActionAddAttachments` handles the file input

### Functions removed from Workspace.tsx
- `addImageFiles` (~30 lines) — `PromptInput` handles validation and reading
- `removeImage` (~3 lines)
- `handlePaste` (~15 lines) — `PromptInput` handles paste
- `handleDrop` / `handleDragOver` (~10 lines) — `globalDrop` prop handles it
- `handleKeyDown` (~8 lines) — `PromptInputTextarea` handles Enter/Shift+Enter

### JSX removed from Workspace.tsx
- Hidden `<input type="file">` (~12 lines)
- Image preview grid (~25 lines)
- Custom attach/send/stop buttons (~15 lines)
- Drag/drop event handlers on composer div (~5 lines)
- `handleSend` function (~20 lines) — replaced by simpler `handleSubmit`

### Total: ~140 lines removed, ~30 lines added

---

## Keeping `IMAGE_LIMITS`

`IMAGE_LIMITS` in `web/src/api/types.ts:22–25` is reused:
- `maxFiles={IMAGE_LIMITS.MAX_COUNT}` prop on `<PromptInput>`
- `maxFileSize={IMAGE_LIMITS.MAX_BYTES}` prop on `<PromptInput>`
- `accept="image/*"` covers `ALLOWED_MIME_TYPES`

The constant stays as the single source of truth.

---

## Files changed

| Action | File | Details |
|--------|------|---------|
| **Modify** | `web/src/pages/Workspace.tsx` | Replace composer section (~140 lines → ~30 lines) |

No new files needed — this is purely a replacement within Workspace.tsx.

---

## Verification

```bash
pnpm --filter aperture-web typecheck
pnpm --filter aperture-web build

# Manual — both SDK and Pi sessions:
# 1. Type message, press Enter → sends
# 2. Shift+Enter → inserts newline
# 3. Drag image onto chat → shows attachment preview
# 4. Paste image → shows attachment preview
# 5. Click attach button → file picker opens
# 6. Attach 5 images → 6th is rejected
# 7. Attach >10MB image → rejected
# 8. While streaming → stop button visible, clicking stops
# 9. When disconnected → textarea disabled
# 10. Send failure → error toast

# Pi-specific:
# 11. Pi steer/follow-up during streaming still works (via Pi control panel, not composer)
```

### Behavioral difference to note

Current behavior: on send failure, `handleSend` restores the input text and attached images. With `PromptInput`, the component clears on submit. If we need error recovery, use `PromptInput`'s controlled mode or handle it via `onError` callback. For most cases, the error toast is sufficient.
