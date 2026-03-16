# Phase 3: Conversation & Message Components

> Replace custom scroll container, `MessageBubble`, `MarkdownContent`, `ThinkingBlock`, `ToolUseBlock`, `ToolCallGroup`, `ConnectionStatus`, and `ToolBlock` with ai-elements `Conversation`, `Message`, `Reasoning`, and `Tool`

**Prerequisite:** Phase 0 (ai-elements installed), Phase 1 (Shiki for code blocks), Phase 2 (`useChat` providing `UIMessage[]`)
**Independently deployable:** Yes (after Phase 2)

---

## Current state in `Workspace.tsx`

The chat view in `web/src/pages/Workspace.tsx` (964 lines) contains these inline components/functions:

| Component/Function | Lines | What it does |
|-------------------|-------|-------------|
| Scroll container | 63–66, 122–142, 315–358 | `scrollContainerRef`, `handleScroll`, `isAtBottom`, FAB button |
| `ConnectionStatus` | 496–512 | Colored dot indicator for WS connection state |
| `MessageBubble` | 514–645 | Message rendering with alignment, copy, markdown, tool blocks |
| `MarkdownContent` | 647–705 | `react-markdown` + `remark-gfm` + `SyntaxHighlighter` |
| `ToolBlock` | 707–750 | Legacy orphan tool result display |
| `PermissionRequest` | 752–871 | Permission request UI (handled in Phase 5) |
| `extractContentBlocks` | 873–963 | Transforms `Message.content` to display-ready parts |

External SDK components used:

| Component | File | Lines |
|-----------|------|-------|
| `ThinkingBlock` | `web/src/components/sdk/ThinkingBlock.tsx` | 46 |
| `ToolUseBlock` | `web/src/components/sdk/ToolUseBlock.tsx` | 89 |
| `ToolCallGroup` | `web/src/components/sdk/ToolCallGroup.tsx` | 89 |
| `ToolInputDisplay` | `web/src/components/sdk/ToolInputDisplay.tsx` | 245 |
| `LoadingIndicator` | `web/src/components/sdk/LoadingIndicator.tsx` | 18 |

---

## 3.0 Extract components from `WorkspaceUseChat.tsx` (Phase 2 review follow-up)

Phase 2's review identified that `WorkspaceUseChat.tsx` (755 lines) has 5 inlined components. As part of Phase 3, extract these before replacing them with ai-elements:

| Component | Lines | Extract to |
|-----------|-------|-----------|
| `UIMessageBubble` | ~105 | `web/src/components/chat/UIMessageBubble.tsx` |
| `PermissionRequest` | ~75 | `web/src/components/chat/PermissionRequest.tsx` |
| `ConnectionStatus` | ~15 | `web/src/components/chat/ConnectionStatus.tsx` |

After extraction, `WorkspaceUseChat.tsx` becomes a thin composition layer (~450 lines). These extracted components are then replaced by ai-elements in 3.1–3.5.

### Stale closure fix (MED-4 from Phase 2 review)

When extracting `PermissionRequest`, fix the stale `messages` closure in `onAddUserMessage`. The callback captures `messages` from render scope: `persistMessages([...messages, nextMessage])` — by the time it fires, `messages` may be stale. Fix by reading messages from the store directly inside the callback, or use a ref.

---

## 3.1 Replace scroll container with `<Conversation>`

### Current implementation (delete)

```tsx
// Refs and state (lines 63-66)
const messagesEndRef = useRef<HTMLDivElement>(null)
const scrollContainerRef = useRef<HTMLDivElement>(null)
const [isAtBottom, setIsAtBottom] = useState(true)

// Scroll handlers (lines 122-142)
const handleScroll = useCallback(() => { ... }, [])
useEffect(() => { if (isAtBottom) messagesEndRef.current?.scrollIntoView(...) }, [...])
const scrollToBottom = useCallback(() => { ... }, [])

// FAB button (lines 350-358)
{!isAtBottom && <button onClick={scrollToBottom}>...</button>}
```

### New implementation

```tsx
import { Conversation, ConversationContent, ConversationScrollButton, ConversationEmptyState } from '@/components/ai-elements/conversation'

<Conversation>
  <ConversationContent>
    {messages.length === 0 ? (
      <ConversationEmptyState
        icon={<Terminal className="size-12" />}
        title="Start a conversation"
        description="Send a message to begin"
      />
    ) : (
      messages.map((message, i) => (
        <ApertureMessage
          key={message.id}
          message={message}
          isLastMessage={i === messages.length - 1}
          status={status}
        />
      ))
    )}
  </ConversationContent>
  <ConversationScrollButton />
</Conversation>
```

**Deletes:** `scrollContainerRef`, `messagesEndRef`, `handleScroll`, `isAtBottom`, `scrollToBottom`, FAB button. All replaced by `use-stick-to-bottom` inside `Conversation`.

---

## 3.2 Extract `ConnectionStatus` to its own file

The inline `ConnectionStatus` (lines 496–512) is a small presentational component. Extract it rather than delete it — it's still needed in the session header.

**File:** `web/src/components/chat/ConnectionStatus.tsx`

```tsx
import { cn } from '@/lib/utils'
import type { ConnectionStatus as ConnectionStatusType } from '@/api/types'

const STATUS_COLORS: Record<string, string> = {
  connected: 'bg-success',
  connecting: 'bg-warning animate-pulse',
  reconnecting: 'bg-warning animate-pulse',
  disconnected: 'bg-muted-foreground',
  error: 'bg-destructive',
  ended: 'bg-muted-foreground',
}

export function ConnectionStatus({ status }: { status: string }) {
  return (
    <span
      className={cn('w-2.5 h-2.5 rounded-full shrink-0', STATUS_COLORS[status] ?? STATUS_COLORS.disconnected)}
      title={status}
    />
  )
}
```

Note: CSS variable references (`var(--color-text-muted)`) updated to Tailwind v4 semantic tokens (`bg-muted-foreground`) per Phase 0.2 migration.

---

## 3.3 Create `ApertureMessage` component

Messages are `UIMessage` with `parts[]` from `useChat` (Phase 2). Maps directly to ai-elements:

**File:** `web/src/components/chat/ApertureMessage.tsx`

```tsx
import { useState } from 'react'
import { Message, MessageContent, MessageResponse, MessageActions, MessageAction } from '@/components/ai-elements/message'
import { Reasoning, ReasoningTrigger, ReasoningContent } from '@/components/ai-elements/reasoning'
import type { UIMessage } from 'ai'
import { Copy, Check } from 'lucide-react'
import { ApertureToolPart } from './ApertureToolPart'

interface ApertureMessageProps {
  message: UIMessage
  isLastMessage: boolean
  status: string
}

export function ApertureMessage({ message, isLastMessage, status }: ApertureMessageProps) {
  const [copied, setCopied] = useState(false)
  const isStreaming = status === 'streaming' && isLastMessage

  const handleCopy = () => {
    const text = message.parts
      .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
      .map(p => p.text)
      .join('\n')
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <Message from={message.role}>
      <MessageContent>
        {/* Render parts in natural order — preserves interleaving for Pi sessions
            where thinking↔text transitions can happen mid-response */}
        {message.parts.map((part, i) => {
          const isLastPart = i === message.parts.length - 1

          switch (part.type) {
            case 'text':
              return <MessageResponse key={i}>{part.text}</MessageResponse>

            case 'reasoning': {
              const isThisReasoningStreaming = isStreaming && isLastPart
              return (
                <Reasoning key={i} isStreaming={isThisReasoningStreaming}>
                  <ReasoningTrigger
                    getThinkingMessage={(streaming, duration) =>
                      streaming
                        ? 'Thinking...'
                        : `Thought for ${duration}s (~${Math.ceil(part.text.length / 4)} tokens)`
                    }
                  />
                  <ReasoningContent>{part.text}</ReasoningContent>
                </Reasoning>
              )
            }

            default:
              if (part.type.startsWith('tool-')) {
                return <ApertureToolPart key={i} part={part} />
              }
              return null
          }
        })}
      </MessageContent>

      {message.role === 'assistant' && !isStreaming && (
        <MessageActions>
          <MessageAction label="Copy" onClick={handleCopy}>
            {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
          </MessageAction>
        </MessageActions>
      )}
    </Message>
  )
}
```

This component works identically for SDK and Pi sessions — both produce `UIMessage.parts[]` via the translator (Phase 2). Pi sessions now render thinking blocks (previously console.log'd) and tool calls (previously invisible).

---

## 3.4 Create `ApertureToolPart` component

Extract tool rendering to its own component for reuse:

**File:** `web/src/components/chat/ApertureToolPart.tsx`

```tsx
import { Tool, ToolHeader, ToolContent, ToolInput, ToolOutput } from '@/components/ai-elements/tool'
import { MessageResponse } from '@/components/ai-elements/message'
import { ToolInputDisplay } from '@/components/sdk/ToolInputDisplay'
import type { ToolInvocationUIPart } from 'ai'

// Use AI SDK's ToolInvocationUIPart to stay in sync with the SDK's part structure.
// Extend only if Aperture adds fields the SDK doesn't define.
type ToolPart = ToolInvocationUIPart

export function ApertureToolPart({ part }: { part: ToolPart }) {
  const toolName = part.toolName ?? part.type.replace('tool-', '')

  return (
    <Tool defaultOpen={part.state !== 'output-available'}>
      <ToolHeader type={part.type} state={part.state} />
      <ToolContent>
        {/* Reuse existing ToolInputDisplay for tool-specific rendering */}
        <ToolInput input={<ToolInputDisplay name={toolName} input={part.input} />} />
        {(part.state === 'output-available' || part.state === 'output-error') && (
          <ToolOutput
            output={
              part.output ? (
                <MessageResponse>
                  {typeof part.output === 'string' ? part.output : JSON.stringify(part.output, null, 2)}
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
```

**Key reuse:** `ToolInputDisplay` (245 lines) is kept and reused inside `ApertureToolPart`. It handles tool-specific rendering (Bash commands, file paths, diffs, search patterns, etc.) which has no ai-elements equivalent. The ai-elements `<Tool>` provides the collapsible chrome; our `ToolInputDisplay` provides the content.

---

## 3.5 Delete replaced components

| File | Replaced by | Lines saved |
|------|------------|-------------|
| `web/src/components/sdk/ThinkingBlock.tsx` | `ai-elements/reasoning` | 46 |
| `web/src/components/sdk/ToolUseBlock.tsx` | `ApertureToolPart` + `ai-elements/tool` | 89 |
| `web/src/components/sdk/ToolCallGroup.tsx` | Multiple `<Tool>` instances (no grouping needed — `<Conversation>` handles layout) | 89 |
| `web/src/components/sdk/LoadingIndicator.tsx` | `ai-elements/shimmer` (see section 3.6) | 18 |
| `MarkdownContent` in Workspace.tsx | `ai-elements/message` `MessageResponse` | ~55 lines |
| `ToolBlock` in Workspace.tsx | `ApertureToolPart` | ~43 lines |
| `extractContentBlocks` in Workspace.tsx | `UIMessage.parts` discriminated union | ~90 lines |
| `MessageBubble` in Workspace.tsx | `ApertureMessage` component | ~130 lines |
| `ConnectionStatus` in Workspace.tsx | Extracted to `chat/ConnectionStatus.tsx` | 0 (moved) |

**Keep:** `ToolInputDisplay.tsx` (245 lines) — reused inside `ApertureToolPart`.

---

## 3.6 Replace `LoadingIndicator` with `<Shimmer>`

Owned by this phase (not Phase 6) to avoid split ownership.

### Current usage (Workspace.tsx:340–346)

```tsx
{connection?.isStreaming && !sessionMessages.some(m => m.id === connection.currentStreamMessageId) && (
  <div className="flex justify-start">
    <div className="glass rounded-2xl rounded-bl-md px-4 py-3">
      <LoadingIndicator />
    </div>
  </div>
)}
```

### New usage

```tsx
import { Shimmer } from '@/components/ai-elements/shimmer'

{status === 'submitted' && messages.at(-1)?.role === 'user' && (
  <Message from="assistant">
    <MessageContent>
      <Shimmer duration={2}>Thinking...</Shimmer>
    </MessageContent>
  </Message>
)}
```

Note: uses `useChat.status === 'submitted'` (waiting for first chunk) instead of `connection?.isStreaming` with manual message ID check.

**Delete:** `web/src/components/sdk/LoadingIndicator.tsx` (18 lines)

---

## 3.7 Update barrel export

**`web/src/components/sdk/index.ts`** — remove deleted exports:

```ts
// Remove:
export { ThinkingBlock } from './ThinkingBlock'
export { ToolUseBlock } from './ToolUseBlock'
export { ToolCallGroup } from './ToolCallGroup'
export { LoadingIndicator } from './LoadingIndicator'

// Keep:
export { SdkControlPanel } from './SdkControlPanel'
// ... other SDK panel components
export { ToolInputDisplay } from './ToolInputDisplay'
```

### Update Workspace.tsx imports

```tsx
// Remove:
import { SdkControlPanel, ThinkingBlock, ToolUseBlock, ToolCallGroup, LoadingIndicator } from '@/components/sdk'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism'

// Add:
import { Conversation, ConversationContent, ConversationScrollButton, ConversationEmptyState } from '@/components/ai-elements/conversation'
import { ApertureMessage } from '@/components/chat/ApertureMessage'
import { ConnectionStatus } from '@/components/chat/ConnectionStatus'
import { SdkControlPanel } from '@/components/sdk'
```

---

## 3.8 Add error boundary

Wrap the new component tree in an error boundary to prevent blank screens during migration:

**File:** `web/src/components/chat/ChatErrorBoundary.tsx`

```tsx
import { Component, type ReactNode } from 'react'

interface Props { children: ReactNode; sessionId: string }
interface State { hasError: boolean; error: Error | null }

export class ChatErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('Chat render error:', { error, componentStack: info.componentStack, sessionId: this.props.sessionId })
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex-1 flex items-center justify-center p-8 text-center">
          <div>
            <p className="text-destructive font-medium">Something went wrong rendering this conversation.</p>
            <p className="text-sm text-muted-foreground mt-1">{this.state.error?.message}</p>
            <button
              className="mt-4 text-sm text-primary hover:underline"
              onClick={() => this.setState({ hasError: false, error: null })}
            >
              Try again
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
```

Usage in Workspace.tsx:

```tsx
{/* Each ChatView is already keyed by session.id in WorkspaceChat (Phase 2).
    The error boundary uses sessionId for logging context.
    No key prop needed here — React's reconciliation handles it via the parent key. */}
<ChatErrorBoundary sessionId={sessionId}>
  <Conversation>
    <ConversationContent>
      {/* ... messages ... */}
    </ConversationContent>
    <ConversationScrollButton />
  </Conversation>
</ChatErrorBoundary>
```

---

## Workspace.tsx size reduction

| Section | Before | After |
|---------|--------|-------|
| Scroll management | ~30 lines | 0 (Conversation handles it) |
| MessageBubble | ~130 lines | 0 (ApertureMessage component) |
| MarkdownContent | ~55 lines | 0 (MessageResponse handles it) |
| ToolBlock | ~43 lines | 0 (ApertureToolPart) |
| ConnectionStatus | ~17 lines | 0 (extracted to own file) |
| extractContentBlocks | ~90 lines | 0 (UIMessage.parts) |
| LoadingIndicator usage | ~7 lines | ~5 lines (Shimmer) |
| Message iteration | ~25 lines | ~10 lines |
| **Total saved** | **~395 lines** | |

Workspace.tsx drops from ~964 lines to ~570 lines (before Phase 4–5 further reduce it).

---

## Files changed

| Action | File | Details |
|--------|------|---------|
| **Add** | `web/src/components/chat/ApertureMessage.tsx` | Main message component |
| **Add** | `web/src/components/chat/ApertureToolPart.tsx` | Tool part renderer |
| **Add** | `web/src/components/chat/ConnectionStatus.tsx` | Extracted from Workspace.tsx |
| **Add** | `web/src/components/chat/ChatErrorBoundary.tsx` | Error boundary for chat area |
| **Modify** | `web/src/pages/Workspace.tsx` | Replace scroll + MessageBubble + MarkdownContent + LoadingIndicator |
| **Modify** | `web/src/components/sdk/index.ts` | Remove deleted exports |
| **Delete** | `web/src/components/sdk/ThinkingBlock.tsx` | Replaced by Reasoning |
| **Delete** | `web/src/components/sdk/ToolUseBlock.tsx` | Replaced by ApertureToolPart |
| **Delete** | `web/src/components/sdk/ToolCallGroup.tsx` | Replaced by Tool composition |
| **Delete** | `web/src/components/sdk/LoadingIndicator.tsx` | Replaced by Shimmer |

---

## Verification

```bash
pnpm --filter aperture-web typecheck
pnpm --filter aperture-web build
pnpm --filter aperture-web test

# Visual — both SDK and Pi sessions:
# 1. Messages render with correct alignment (user right, assistant left)
# 2. Thinking blocks collapse/expand, show token estimate
# 3. Tool calls show tool-specific input (bash commands, file paths, diffs)
# 4. Tool results show output or error
# 5. Code blocks syntax-highlighted with correct theme
# 6. Copy button works on assistant messages (not shown during streaming)
# 7. Auto-scroll to bottom on new messages
# 8. Scroll button appears when scrolled up
# 9. Empty state shows when no messages
# 10. "Thinking..." shimmer shows before first chunk
# 11. Connection status dot renders correctly in session header
# 12. Error boundary catches render errors without blanking the screen

# Pi-specific:
# 13. Pi thinking content now renders in Reasoning component (was console.log)
# 14. Pi tool calls now render in Tool component (was invisible)
```
