# Phase 5: Permission Requests & Confirmations

> Replace the custom `PermissionRequest` component with ai-elements `<Confirmation>`

**Prerequisite:** Phase 0 (ai-elements installed), Phase 2 (`useChat` + store slices)
**Independently deployable:** Yes
**Risk:** Low — the permission system is isolated and well-defined. SDK-only — Pi sessions don't have permission requests.

---

## Current state

### `PermissionRequest` component (`Workspace.tsx:752–871`)

120-line inline component with three render paths:

1. **`AskUserQuestion`** — multi-question tabbed UI with prev/next navigation, radio/checkbox selection, "Other" text input. Detected via `toolName === 'AskUserQuestion' && isAskUserQuestionInput(toolCall.rawInput)`.

2. **Normal permission with tool input** — renders `<ToolCallDisplay>` showing the tool call details, then option buttons + deny button.

3. **Normal permission without input** — just the option buttons.

### Mounting point (`Workspace.tsx:362–371`)

Rendered between the scroll container and composer, NOT inline in the message stream:

```tsx
{activePermissions.length > 0 && (
  <div className="px-4 py-3 border-t border-[var(--color-border)] bg-warning/5">
    <PermissionRequest
      sessionId={activeSessionId!}
      permission={activePermissions[0]}   // only first pending
      onRespond={sendPermissionResponse}
      onAddUserMessage={addUserMessageOnly}
    />
  </div>
)}
```

### Permission options

From `web/src/api/types.ts:316–320`:
```ts
interface PermissionOption {
  optionId: string
  name: string
  kind: string   // contains 'allow' for allow options
}
```

Options include: "Allow once", "Allow for session", "Allow always", etc. This is richer than useChat's binary approve/deny.

### Store state

Permissions live in the `permission-slice` (Phase 2 refactor):
- Keyed as `"${sessionId}:${toolCallId}"`
- Set by permission WebSocket events (routed to slice, bypassing `useChat`)
- Removed by `sendPermissionResponse`

### WebSocket flow

1. Backend sends `permission_request` (SDK first-class) or `session/request_permission` (JSON-RPC)
2. Translator does NOT emit a `tool-approval-request` chunk — routes to permission slice instead
3. User clicks an option
4. `sendPermissionResponse` sends `{ type: 'permission_response', toolCallId, optionId, answers? }` via `wsManager`
5. `removePendingPermission` clears from store

---

## Replacement with `<Confirmation>`

### Design decisions

1. **Keep permissions in Zustand permission slice** — not in `useChat`'s tool approval flow. Our multi-option system doesn't map to useChat's binary approve/deny.

2. **Keep `AskUserQuestionDisplay`** — its multi-question tabbed UI (346 lines) has no ai-elements equivalent. Wrap it in `<Confirmation>` styling but keep the custom logic.

3. **Keep current mounting point** — between scroll and composer. This ensures the permission request is always visible (not buried in the message scroll).

4. **SDK-only** — Pi sessions (`agent === 'pi_sdk'`) don't have a permission request system. No Pi-specific code needed.

### New implementation

**File:** `web/src/components/chat/PermissionConfirmation.tsx`

```tsx
import { useState } from 'react'
import {
  Confirmation,
  ConfirmationTitle,
  ConfirmationRequest,
  ConfirmationAccepted,
  ConfirmationRejected,
  ConfirmationActions,
  ConfirmationAction,
} from '@/components/ai-elements/confirmation'
import { ToolCallDisplay } from '@/components/session/ToolCallDisplay'
import { AskUserQuestionDisplay, isAskUserQuestionInput } from '@/components/session/AskUserQuestionDisplay'
import type { PermissionOption } from '@/api/types'

interface PermissionConfirmationProps {
  sessionId: string
  permission: {
    toolCallId: string
    toolCall: { name?: string; title?: string; rawInput?: unknown }
    options: PermissionOption[]
  }
  onRespond: (sessionId: string, toolCallId: string, optionId: string | null, answers?: Record<string, string>) => void
  onAddUserMessage: (sessionId: string, content: string) => Promise<void>
  // NOTE: In the useChat world, `onAddUserMessage` should use `useChat.setMessages`
  // to append a synthetic user message, NOT the old store action:
  //   const { setMessages, messages } = useChat(...)
  //   onAddUserMessage={(_, content) => {
  //     setMessages([...messages, { id: crypto.randomUUID(), role: 'user', parts: [{ type: 'text', text: content }] }])
  //   }}
}

export function PermissionConfirmation({
  sessionId,
  permission,
  onRespond,
  onAddUserMessage,
}: PermissionConfirmationProps) {
  // Hooks MUST be called before any conditional returns (React Rules of Hooks)
  const [approval, setApproval] = useState<{ id: string; approved: boolean } | undefined>()
  const [toolState, setToolState] = useState<string>('approval-requested')

  const toolName = permission.toolCall.name || permission.toolCall.title
  const isAskUser = toolName === 'AskUserQuestion' && isAskUserQuestionInput(permission.toolCall.rawInput)

  // AskUserQuestion has its own UI — render it directly
  if (isAskUser) {
    return (
      <AskUserQuestionDisplay
        input={permission.toolCall.rawInput as { questions: unknown[] }}
        onSubmit={async (answers) => {
          const answerSummary = Object.entries(answers)
            .map(([q, a]) => `${q}: ${a}`)
            .join('\n')
          await onAddUserMessage(sessionId, answerSummary)

          const allowOption = permission.options.find(o => o.kind?.includes('allow'))
          onRespond(sessionId, permission.toolCallId, allowOption?.optionId ?? null, answers)
        }}
      />
    )
  }

  const handleRespond = (optionId: string | null) => {
    const isAllow = optionId !== null && permission.options.find(o => o.optionId === optionId)?.kind?.includes('allow')
    setApproval({ id: permission.toolCallId, approved: !!isAllow })
    setToolState(isAllow ? 'output-available' : 'output-denied')
    onRespond(sessionId, permission.toolCallId, optionId)
  }

  return (
    <Confirmation approval={approval} state={toolState}>
      <ConfirmationTitle>Permission Required</ConfirmationTitle>

      <ConfirmationRequest>
        {permission.toolCall.rawInput ? (
          <ToolCallDisplay
            name={toolName ?? 'Unknown Tool'}
            rawInput={permission.toolCall.rawInput}
          />
        ) : (
          <p className="text-sm text-muted-foreground">
            {toolName ?? 'A tool'} is requesting permission to execute.
          </p>
        )}
      </ConfirmationRequest>

      <ConfirmationAccepted>Approved</ConfirmationAccepted>
      <ConfirmationRejected>Denied</ConfirmationRejected>

      <ConfirmationActions>
        {permission.options.map((opt) => (
          <ConfirmationAction
            key={opt.optionId}
            variant={opt.kind?.includes('allow') ? 'default' : 'outline'}
            onClick={() => handleRespond(opt.optionId)}
          >
            {opt.name}
          </ConfirmationAction>
        ))}
        <ConfirmationAction
          variant="outline"
          onClick={() => handleRespond(null)}
        >
          Deny
        </ConfirmationAction>
      </ConfirmationActions>
    </Confirmation>
  )
}
```

### Mounting point (updated for `useChat`)

```tsx
// Inside ChatView, where useChat is available:
const { messages, setMessages } = useChat({ ... })

{activePermissions.length > 0 && (
  <div className="px-4 py-3 border-t border-border bg-warning/5">
    <PermissionConfirmation
      sessionId={activeSessionId!}
      permission={activePermissions[0]}
      onRespond={sendPermissionResponse}
      onAddUserMessage={(_, content) => {
        // Append synthetic user message via useChat's state — NOT the old store action.
        // useChat owns the message list; writing to the store would diverge state.
        setMessages([...messages, {
          id: crypto.randomUUID(),
          role: 'user',
          parts: [{ type: 'text', text: content }],
        }])
      }}
    />
  </div>
)}
```

Note: `border-[var(--color-border)]` → `border-border` (Phase 0.2 migration).

---

## Components kept (not replaced)

### `AskUserQuestionDisplay` (`web/src/components/session/AskUserQuestionDisplay.tsx` — 346 lines)

This component provides a unique multi-question tabbed UI that has no ai-elements equivalent:
- Tab navigation (prev/next) for multiple questions
- Radio/checkbox selection per question
- "Other" option with free-text input
- Submit validation (all questions must be answered)

**Keep as-is.** It's already well-structured and tested.

### `ToolCallDisplay` (`web/src/components/session/ToolCallDisplay.tsx` — 206 lines)

Renders tool call details in the permission request:
- `BashDisplay` — bash command with syntax highlighting
- `WriteDisplay` — file write with path + content preview
- `DefaultDisplay` — JSON of tool input

**Keep, but update SyntaxHighlighter → CodeHighlight** (done in Phase 1). Will be consolidated with `ToolInputDisplay` in Phase 8.

---

## What gets deleted

| Code | Location | Lines |
|------|----------|-------|
| Inline `PermissionRequest` component | `Workspace.tsx:752–871` | ~120 |

Replaced by `PermissionConfirmation` in its own file at `web/src/components/chat/PermissionConfirmation.tsx`.

---

## Files changed

| Action | File | Details |
|--------|------|---------|
| **Add** | `web/src/components/chat/PermissionConfirmation.tsx` | New component using ai-elements Confirmation |
| **Modify** | `web/src/pages/Workspace.tsx` | Replace inline PermissionRequest with PermissionConfirmation import |

---

## Verification

```bash
pnpm --filter aperture-web typecheck
pnpm --filter aperture-web build

# Manual (SDK sessions only — Pi has no permissions):
# 1. Trigger a tool that requires permission (e.g., file write)
# 2. Verify tool call details display correctly
# 3. Click "Allow once" → tool executes, permission cleared
# 4. Click "Deny" → tool denied, streaming stops
# 5. Trigger AskUserQuestion → multi-question UI appears
# 6. Answer all questions, submit → response sent
# 7. Multiple pending permissions → first one shown
# 8. Permission on non-active session → unread count incremented
```
