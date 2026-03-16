# Phase 2: `useChat` with Custom WebSocket Transport + Store Refactor

> Replace Zustand message state + manual WebSocket handling with AI SDK v6 `useChat` hook and a custom `ChatTransport` for both SDK and Pi backends. Refactor `sessions.ts` (1,460 lines) into focused store slices.

**Prerequisite:** Phase 0 (React 19, Zustand v5, AI SDK installed)
**Independently deployable:** No — Phases 3–7 depend on `useChat` providing `UIMessage[]`. This phase ships first.
**Risk:** High — replaces the entire message state layer. Mitigated with feature flag (section 2.9).

---

## Why adopt `useChat`

Currently, Aperture manages chat state via `useSessionsStore` (1,460-line Zustand store) + `wsManager` (228-line WebSocket manager). The store handles **two separate backends** — SDK (`claude_sdk`) and Pi (`pi_sdk`) — with duplicated streaming state, separate message handlers, and interleaved concerns.

Problems:
- Every ai-elements component requires manual adaptation from our `Message`/`ContentBlock` format to component props
- No built-in streaming status (we track `isStreaming` manually in `ConnectionState`)
- No built-in message branching, regeneration, or optimistic updates
- SDK uses structured `ContentBlock[]`; Pi appends to flat strings — two codepaths for the same UI
- Pi thinking deltas and tool execution events are currently **dropped** (only `console.log`'d)
- `removeSession` and `clearAll` leak Pi state (don't clean up `pi*` maps)

With `useChat` + custom `ChatTransport`:
- **Unified message format** — both SDK and Pi sessions produce `UIMessage.parts[]`
- **Native ai-elements compatibility** — components bind directly to `useChat.messages`
- **Built-in status** — `'ready' | 'submitted' | 'streaming' | 'error'`
- **Built-in stop/regenerate** — `stop()` triggers abort, `regenerate()` resends
- **Pi thinking/tool events surfaced** — translator emits `reasoning-*` and `tool-*` chunks
- **Message branching** via `MessageBranch` component (future, Pi already has forkable entries)

---

## 2.1 Install AI SDK

```bash
pnpm --filter aperture-web add ai@6 @ai-sdk/react@3
```

- `ai` — exports `ChatTransport`, `UIMessageChunk`, `UIMessage` types
- `@ai-sdk/react` — exports `useChat` hook

---

## 2.2 Implement `ApertureWebSocketTransport`

### ChatTransport interface (from AI SDK source)

```ts
interface ChatTransport<UI_MESSAGE extends UIMessage> {
  sendMessages(options: {
    trigger: 'submit-message' | 'regenerate-message'
    chatId: string
    messageId: string | undefined
    messages: UI_MESSAGE[]
    abortSignal: AbortSignal | undefined
  } & ChatRequestOptions): Promise<ReadableStream<UIMessageChunk>>

  reconnectToStream(options: {
    chatId: string
  } & ChatRequestOptions): Promise<ReadableStream<UIMessageChunk> | null>
}
```

### Implementation

**File:** `web/src/api/chat-transport.ts`

The transport is backend-agnostic — it doesn't care whether the session is SDK or Pi. It sends user messages over WebSocket and subscribes to translated `UIMessageChunk`s. The translator (section 2.3) handles the backend-specific event mapping.

```ts
import type { ChatTransport, UIMessage, UIMessageChunk, ChatRequestOptions } from 'ai'
import { wsManager } from './websocket'

export class ApertureWebSocketTransport implements ChatTransport<UIMessage> {
  constructor(private sessionId: string) {}

  async sendMessages(options: {
    chatId: string
    messages: UIMessage[]
    abortSignal: AbortSignal | undefined
    trigger: 'submit-message' | 'regenerate-message'
    messageId: string | undefined
  } & ChatRequestOptions): Promise<ReadableStream<UIMessageChunk>> {
    const { messages, abortSignal } = options

    return new ReadableStream<UIMessageChunk>({
      start: (controller) => {
        // Subscribe to translated UIMessageChunks from WebSocket
        const cleanup = wsManager.onUIChunk(this.sessionId, (chunk) => {
          try {
            controller.enqueue(chunk)
            if (chunk.type === 'finish' || chunk.type === 'error') {
              controller.close()
              cleanup()
            }
          } catch {
            // Stream already closed
          }
        })

        // Send user message over WebSocket
        const lastUserMessage = messages.filter(m => m.role === 'user').pop()
        if (lastUserMessage) {
          const text = lastUserMessage.parts
            .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
            .map(p => p.text)
            .join('')

          const files = lastUserMessage.parts
            .filter((p): p is { type: 'file'; url: string; mediaType: string } => p.type === 'file')

          wsManager.send(this.sessionId, {
            type: 'user_message',
            content: text,
            ...(files.length > 0 && {
              images: files.map(f => ({
                data: f.url.replace(/^data:[^;]+;base64,/, ''),
                mimeType: f.mediaType,
              }))
            }),
          })
        }

        // Handle abort — works for both SDK (cancel) and Pi (interrupt)
        abortSignal?.addEventListener('abort', () => {
          wsManager.send(this.sessionId, { type: 'cancel' })
          try { controller.close() } catch { /* already closed */ }
          cleanup()
        })
      },
    })
  }

  async reconnectToStream(): Promise<ReadableStream<UIMessageChunk> | null> {
    return null // WebSocket doesn't support HTTP reconnection
  }
}
```

### Changes needed in `wsManager`

The transport needs to subscribe to translated chunks. Add to `WebSocketManager`:

```ts
// web/src/api/websocket.ts — add method
onUIChunk(sessionId: string, handler: (chunk: UIMessageChunk) => void): () => void {
  // Register handler; return cleanup function
  // Called from the existing onmessage handler after translation
}
```

This is a thin event subscription layer on top of the existing WebSocket message routing. The `messageHandler` in `connectSession` translates raw WS events to `UIMessageChunk`s via the translator (section 2.3) and dispatches them to registered handlers.

---

## 2.3 WebSocket → UIMessageChunk translation

### Current WebSocket event flow

The backend sends messages in three formats, routed by the `messageHandler` in `connectSession` (sessions.ts lines 696–709):

1. **SDK first-class** (`kind === 'sdk'`, via `isSdkWsMessage`) — `content_block_start`, `assistant_delta`, `content_block_stop`, `assistant_message`, `prompt_complete`, `prompt_error`, `permission_request`
2. **Pi first-class** (`kind === 'pi'`, via `isPiWsMessage`) — `message_update` (text_delta, thinking_delta, toolcall_*, done), `agent_start`, `agent_end`, `tool_execution_start`, `tool_execution_end`
3. **JSON-RPC** (fallback) — `session/update` with `agent_message_chunk`, `prompt_complete`, `prompt_error`

### UIMessageChunk lifecycle

The translator emits chunks following this lifecycle for both backends:

```
start { messageId }
  text-start { id: "block-1" }
  text-delta { id: "block-1", delta: "Hello" }
  text-delta { id: "block-1", delta: " world" }
  text-end   { id: "block-1" }
  reasoning-start { id: "block-2" }
  reasoning-delta { id: "block-2", delta: "thinking..." }
  reasoning-end   { id: "block-2" }
  tool-input-available { toolCallId, toolName, input }
  tool-output-available { toolCallId, output }
finish { finishReason: 'stop' }
```

### SDK event → UIMessageChunk mapping

| SDK WS event | UIMessageChunk(s) | Notes |
|-------------|-------------------|-------|
| `content_block_start` (type: text) | `start` + `text-start` | Generate block ID |
| `assistant_delta` (text_delta) | `text-delta` | Use matching block ID |
| `content_block_stop` (text) | `text-end` | |
| `content_block_start` (type: thinking) | `reasoning-start` | Generate block ID |
| `assistant_delta` (thinking_delta) | `reasoning-delta` | |
| `content_block_stop` (thinking) | `reasoning-end` | |
| `content_block_start` (type: tool_use) | `tool-input-start` | Use `toolCallId` from payload |
| `assistant_delta` (input_json_delta) | `tool-input-delta` | |
| `content_block_stop` (tool_use) | `tool-input-available` | Parse accumulated JSON |
| `assistant_message` | (none — blocks already emitted) | |
| `prompt_complete` | `finish` | |
| `prompt_error` | `error` | |
| `permission_request` | (none — routed to permission store) | See section 2.4 |

### Pi event → UIMessageChunk mapping

**Key improvement:** Pi thinking deltas and tool execution events are currently dropped (`console.log` only). The translator now surfaces them as first-class `UIMessageChunk`s.

> **⚠️ Verify at implementation time:** The `toolcall_start`, `toolcall_delta`, and `toolcall_end` delta types in `message_update` are assumed based on the Pi SDK protocol. The current codebase only handles `text_delta` and `done` in the Pi handler. If the Pi backend does NOT send `toolcall_*` deltas, remove those cases from the translator and rely solely on `tool_execution_start`/`tool_execution_end` for Pi tool visibility. Tools would appear as completed (no streaming input), which is still a major improvement over invisible.

**Payload shape:** Pi `message_update` wraps deltas in `assistantMessageEvent` (from `pi-types.ts`), NOT in a top-level `delta` field. The `PiDeltaType` enum includes explicit start/end block delimiters.

| Pi WS event | `assistantMessageEvent.type` | UIMessageChunk(s) | Notes |
|-------------|------------------------------|-------------------|-------|
| `agent_start` | — | `start` | Begin new assistant message |
| `message_update` | `text_start` | `text-start` | Explicit block delimiter |
| `message_update` | `text_delta` | `text-delta` (auto `text-start` if missed) | `evt.delta` has content |
| `message_update` | `text_end` | `text-end` | Explicit block delimiter |
| `message_update` | `thinking_start` | `reasoning-start` | **NEW** — explicit delimiter |
| `message_update` | `thinking_delta` | `reasoning-delta` (auto `reasoning-start` if missed) | **NEW** — currently dropped as `console.log` |
| `message_update` | `thinking_end` | `reasoning-end` | **NEW** — explicit delimiter |
| `message_update` | `toolcall_start` | `tool-input-start` | `evt.toolCallId`, `evt.toolName` |
| `message_update` | `toolcall_delta` | `tool-input-delta` | `evt.inputJson` (NOT `partialJson`) |
| `message_update` | `toolcall_end` | `tool-input-available` | `evt.input` has parsed tool input |
| `tool_execution_start` | — | `tool-input-start` (fallback if no toolcall events) | Minimal: creates tool block with name only |
| `tool_execution_end` | — | `tool-output-available` | **NEW** — tool result surfaced |
| `message_update` | `done` | close open blocks + `finish` | |
| `message_update` | `error` | `error` | |
| `agent_end` | — | `finish` (if not already sent) | Guard against double-finish |
| `auto_compaction_start/end` | — | (none — sidebar notification only) | Dispatch to Pi store slice |

### Translator implementation

**File:** `web/src/api/ws-to-uichunk.ts`

```ts
import type { UIMessageChunk } from 'ai'

export class WsToUIChunkTranslator {
  private blockCounter = 0
  private currentTextBlockId: string | null = null
  private currentReasoningBlockId: string | null = null
  private currentToolCallId: string | null = null
  private currentToolName: string | null = null  // Track tool name for tool_execution_end
  private started = false

  private nextBlockId(): string {
    return `block-${++this.blockCounter}`
  }

  /** Translate an SDK first-class WebSocket event to UIMessageChunks */
  translateSdkEvent(type: string, payload: unknown): UIMessageChunk[] {
    const chunks: UIMessageChunk[] = []

    if (!this.started) {
      chunks.push({ type: 'start' })
      this.started = true
    }

    switch (type) {
      case 'content_block_start': {
        const p = payload as { contentBlock: { type: string; id?: string; name?: string } }
        if (p.contentBlock.type === 'text') {
          this.currentTextBlockId = this.nextBlockId()
          chunks.push({ type: 'text-start', id: this.currentTextBlockId })
        } else if (p.contentBlock.type === 'thinking') {
          this.currentReasoningBlockId = this.nextBlockId()
          chunks.push({ type: 'reasoning-start', id: this.currentReasoningBlockId })
        } else if (p.contentBlock.type === 'tool_use') {
          this.currentToolCallId = p.contentBlock.id ?? this.nextBlockId()
          this.currentToolName = p.contentBlock.name!
          chunks.push({
            type: 'tool-input-start',
            toolCallId: this.currentToolCallId,
            toolName: this.currentToolName,
          })
        }
        break
      }

      case 'assistant_delta': {
        const p = payload as { delta: { type: string; text?: string; thinking?: string; partial_json?: string } }
        if (p.delta.type === 'text_delta' && p.delta.text && this.currentTextBlockId) {
          chunks.push({ type: 'text-delta', id: this.currentTextBlockId, delta: p.delta.text })
        } else if (p.delta.type === 'thinking_delta' && p.delta.thinking && this.currentReasoningBlockId) {
          chunks.push({ type: 'reasoning-delta', id: this.currentReasoningBlockId, delta: p.delta.thinking })
        } else if (p.delta.type === 'input_json_delta' && p.delta.partial_json && this.currentToolCallId) {
          chunks.push({ type: 'tool-input-delta', toolCallId: this.currentToolCallId, inputTextDelta: p.delta.partial_json })
        }
        break
      }

      case 'content_block_stop': {
        const p = payload as { contentBlock: { type: string; id?: string; name?: string; input?: unknown } }
        if (p.contentBlock.type === 'text' && this.currentTextBlockId) {
          chunks.push({ type: 'text-end', id: this.currentTextBlockId })
          this.currentTextBlockId = null
        } else if (p.contentBlock.type === 'thinking' && this.currentReasoningBlockId) {
          chunks.push({ type: 'reasoning-end', id: this.currentReasoningBlockId })
          this.currentReasoningBlockId = null
        } else if (p.contentBlock.type === 'tool_use') {
          chunks.push({
            type: 'tool-input-available',
            toolCallId: p.contentBlock.id!,
            toolName: p.contentBlock.name!,
            input: p.contentBlock.input,
          })
          this.currentToolCallId = null
        }
        break
      }

      case 'prompt_complete':
        this.closeOpenBlocks(chunks)
        chunks.push({ type: 'finish', finishReason: 'stop' })
        this.reset()
        break

      case 'prompt_error':
        this.closeOpenBlocks(chunks)
        chunks.push({ type: 'error', errorText: String((payload as { error?: string }).error ?? 'Unknown error') })
        this.reset()
        break
    }

    return chunks
  }

  /**
   * Translate a Pi first-class WebSocket event to UIMessageChunks.
   *
   * IMPORTANT: Pi WS payloads use `assistantMessageEvent` wrapper (from pi-types.ts):
   *   { assistantMessageEvent: { type: PiDeltaType, delta?: string, toolCallId?, toolName?, inputJson? } }
   * NOT the `{ delta: { type, text } }` shape that SDK uses.
   *
   * PiDeltaType includes explicit block delimiters (text_start, text_end, thinking_start,
   * thinking_end) in addition to delta events. We handle both:
   * - Explicit start/end events: open/close blocks when received
   * - Delta events: auto-open blocks as fallback (for robustness if start event is missed)
   */
  translatePiEvent(type: string, payload: unknown): UIMessageChunk[] {
    const chunks: UIMessageChunk[] = []

    switch (type) {
      case 'agent_start': {
        this.reset()
        this.started = true
        chunks.push({ type: 'start' })
        break
      }

      case 'message_update': {
        if (!this.started) {
          chunks.push({ type: 'start' })
          this.started = true
        }

        // Match actual PiMessageUpdatePayload shape from pi-types.ts
        const p = payload as {
          assistantMessageEvent?: {
            type: string        // PiDeltaType
            delta?: string      // text/thinking content
            toolCallId?: string
            toolName?: string
            inputJson?: string  // NOT partialJson — actual Pi field name
            input?: unknown     // parsed tool input on toolcall_end
            output?: unknown
          }
          done?: boolean
          error?: string
        }

        if (p.done) {
          this.closeOpenBlocks(chunks)
          chunks.push({ type: 'finish', finishReason: 'stop' })
          this.reset()
          break
        }

        if (p.error) {
          this.closeOpenBlocks(chunks)
          chunks.push({ type: 'error', errorText: p.error })
          this.reset()
          break
        }

        const evt = p.assistantMessageEvent
        if (!evt) break

        switch (evt.type) {
          // --- Explicit block delimiters (preferred) ---
          case 'text_start':
            // Close reasoning if open (thinking → text transition)
            if (this.currentReasoningBlockId) {
              chunks.push({ type: 'reasoning-end', id: this.currentReasoningBlockId })
              this.currentReasoningBlockId = null
            }
            this.currentTextBlockId = this.nextBlockId()
            chunks.push({ type: 'text-start', id: this.currentTextBlockId })
            break

          case 'text_end':
            if (this.currentTextBlockId) {
              chunks.push({ type: 'text-end', id: this.currentTextBlockId })
              this.currentTextBlockId = null
            }
            break

          case 'text_delta':
            // Auto-open text block if text_start was missed (robustness)
            if (!this.currentTextBlockId) {
              if (this.currentReasoningBlockId) {
                chunks.push({ type: 'reasoning-end', id: this.currentReasoningBlockId })
                this.currentReasoningBlockId = null
              }
              this.currentTextBlockId = this.nextBlockId()
              chunks.push({ type: 'text-start', id: this.currentTextBlockId })
            }
            if (evt.delta) {
              chunks.push({ type: 'text-delta', id: this.currentTextBlockId, delta: evt.delta })
            }
            break

          case 'thinking_start':
            // Close text if open (text → thinking transition)
            if (this.currentTextBlockId) {
              chunks.push({ type: 'text-end', id: this.currentTextBlockId })
              this.currentTextBlockId = null
            }
            this.currentReasoningBlockId = this.nextBlockId()
            chunks.push({ type: 'reasoning-start', id: this.currentReasoningBlockId })
            break

          case 'thinking_end':
            if (this.currentReasoningBlockId) {
              chunks.push({ type: 'reasoning-end', id: this.currentReasoningBlockId })
              this.currentReasoningBlockId = null
            }
            break

          case 'thinking_delta':
            // Auto-open reasoning block if thinking_start was missed (robustness)
            if (!this.currentReasoningBlockId) {
              if (this.currentTextBlockId) {
                chunks.push({ type: 'text-end', id: this.currentTextBlockId })
                this.currentTextBlockId = null
              }
              this.currentReasoningBlockId = this.nextBlockId()
              chunks.push({ type: 'reasoning-start', id: this.currentReasoningBlockId })
            }
            if (evt.delta) {
              chunks.push({ type: 'reasoning-delta', id: this.currentReasoningBlockId, delta: evt.delta })
            }
            break

          case 'toolcall_start':
            // Close text/reasoning blocks before tool
            if (this.currentTextBlockId) {
              chunks.push({ type: 'text-end', id: this.currentTextBlockId })
              this.currentTextBlockId = null
            }
            if (this.currentReasoningBlockId) {
              chunks.push({ type: 'reasoning-end', id: this.currentReasoningBlockId })
              this.currentReasoningBlockId = null
            }
            this.currentToolCallId = evt.toolCallId ?? this.nextBlockId()
            this.currentToolName = evt.toolName ?? 'unknown'
            chunks.push({
              type: 'tool-input-start',
              toolCallId: this.currentToolCallId,
              toolName: this.currentToolName,
            })
            break

          case 'toolcall_delta':
            if (this.currentToolCallId && evt.inputJson) {
              chunks.push({ type: 'tool-input-delta', toolCallId: this.currentToolCallId, inputTextDelta: evt.inputJson })
            }
            break

          case 'toolcall_end':
            if (this.currentToolCallId) {
              chunks.push({
                type: 'tool-input-available',
                toolCallId: this.currentToolCallId,
                toolName: this.currentToolName ?? evt.toolName ?? 'unknown',
                input: evt.input,
              })
              this.currentToolCallId = null
              this.currentToolName = null
            }
            break
        }
        break
      }

      case 'tool_execution_start': {
        // Fallback for Pi backends that don't send toolcall_* deltas:
        // Create a tool block from the execution event if one doesn't already exist
        const p = payload as { toolCallId?: string; toolName?: string }
        if (p.toolCallId && !this.currentToolCallId) {
          // Close text/reasoning blocks before tool
          if (this.currentTextBlockId) {
            chunks.push({ type: 'text-end', id: this.currentTextBlockId })
            this.currentTextBlockId = null
          }
          if (this.currentReasoningBlockId) {
            chunks.push({ type: 'reasoning-end', id: this.currentReasoningBlockId })
            this.currentReasoningBlockId = null
          }
          this.currentToolCallId = p.toolCallId
          this.currentToolName = p.toolName ?? 'tool'
          chunks.push({
            type: 'tool-input-start',
            toolCallId: this.currentToolCallId,
            toolName: this.currentToolName,
          })
        }
        break
      }

      case 'tool_execution_end': {
        const p = payload as { toolCallId?: string; output?: unknown; isError?: boolean }
        if (p.toolCallId) {
          // If toolcall_end wasn't sent (no toolcall_* deltas), emit tool-input-available
          if (this.currentToolCallId === p.toolCallId) {
            chunks.push({
              type: 'tool-input-available',
              toolCallId: p.toolCallId,
              toolName: this.currentToolName ?? 'tool',  // Use tracked name, not hardcoded
              input: undefined,
            })
            this.currentToolCallId = null
            this.currentToolName = null
          }
          chunks.push({
            type: 'tool-output-available',
            toolCallId: p.toolCallId,
            output: p.output,
            ...(p.isError && { errorText: String(p.output ?? 'Tool error') }),
          })
        }
        break
      }

      case 'agent_end': {
        if (this.started) {
          this.closeOpenBlocks(chunks)
          chunks.push({ type: 'finish', finishReason: 'stop' })
          this.reset()
        }
        break
      }
    }

    return chunks
  }

  private closeOpenBlocks(chunks: UIMessageChunk[]) {
    if (this.currentToolCallId) {
      // Don't emit tool-input-available here — incomplete tool call
      this.currentToolCallId = null
    }
    if (this.currentTextBlockId) {
      chunks.push({ type: 'text-end', id: this.currentTextBlockId })
      this.currentTextBlockId = null
    }
    if (this.currentReasoningBlockId) {
      chunks.push({ type: 'reasoning-end', id: this.currentReasoningBlockId })
      this.currentReasoningBlockId = null
    }
  }

  private reset() {
    this.started = false
    this.blockCounter = 0
    this.currentTextBlockId = null
    this.currentReasoningBlockId = null
    this.currentToolCallId = null
    this.currentToolName = null
  }
}
```

---

## 2.4 Permission requests — keep in Zustand

`useChat` has built-in tool approval via `tool-approval-request` UIMessageChunk and `addToolApprovalResponse`, but our permission system is more complex:

- Multi-option permissions (not just approve/deny)
- Options like "Allow once", "Allow for session", "Allow always"
- `AskUserQuestion` with multi-question tabbed UI

**Decision:** Keep permissions in the permission store slice, render with `<Confirmation>` (Phase 5), bypass `useChat` for permission responses.

When a permission WebSocket event arrives:
1. **Do NOT** emit a `tool-approval-request` UIMessageChunk
2. Store in `pendingPermissions` (permission slice)
3. Render `<Confirmation>` in the message stream
4. On approve/deny, send response via `wsManager.send()` directly

This applies to SDK sessions only — Pi sessions don't have a permission request flow.

---

## 2.5 Refactor `sessions.ts` into store slices

### Why refactor

`sessions.ts` is 1,460 lines with 7 interleaved concerns:
1. Session lifecycle (list, add, remove, active)
2. Message state + persistence (IndexedDB)
3. Connection/WebSocket state
4. Permission state
5. SDK-specific state (12 `Record<string, T>` maps + setters)
6. Pi-specific state (9 `Record<string, T>` maps + setters + WS commands)
7. WebSocket message handlers (3 separate handlers: JSON-RPC, SDK, Pi)

Additionally, `removeSession` and `clearAll` have bugs: they clean up SDK state maps but **leak all Pi state** (`piConfig`, `piStats`, `piModels`, `piSessionTree`, `piForkableEntries`, `piThinkingLevel`, `piLoading`, `piErrors`, `piStreamingState`).

### New structure

```
web/src/stores/
  sessions/
    index.ts              — Combined store re-export
    session-slice.ts      — Session list, active session, add/remove
    connection-slice.ts   — Connection state, status, streaming flag
    message-slice.ts      — Message state (TEMPORARY — retained during feature flag period)
    permission-slice.ts   — Pending permissions (SDK only)
    sdk-slice.ts          — SDK config/usage/models/commands/mcp/checkpoints/account
    pi-slice.ts           — Pi config/stats/models/tree/forkable/thinking/commands
    persistence.ts        — IndexedDB helpers (debouncedPersist, flushPersist, restore)
```

**During the feature flag period (section 2.9):** `message-slice.ts` retains the old message state (`messages`, `addMessage`, `updateMessage`, streaming state, and WS message handlers) so `ChatViewLegacy` can function. After the flag is removed (Phase 8), `message-slice.ts` is deleted.

**After flag removal:** Message state, streaming state, and message handlers (`handleSdkWebSocketMessage`, `handlePiWebSocketMessage`, `handleWebSocketMessage`) are fully removed — replaced by `useChat` + `WsToUIChunkTranslator`.

### Slice pattern (Zustand v5)

```ts
// web/src/stores/sessions/session-slice.ts
import type { StateCreator } from 'zustand'
import type { SessionsStore } from './index'

export interface SessionSlice {
  sessions: Session[]
  activeSessionId: string | null
  setSessions: (sessions: Session[]) => void
  addSession: (session: Session) => void
  removeSession: (sessionId: string) => void
  setActiveSession: (sessionId: string | null) => void
  getActiveSession: () => Session | undefined
}

export const createSessionSlice: StateCreator<SessionsStore, [], [], SessionSlice> = (set, get) => ({
  sessions: [],
  activeSessionId: null,

  setSessions: (sessions) => set({ sessions }),

  addSession: (session) => set((state) => ({
    sessions: [...state.sessions, session],
  })),

  removeSession: (sessionId) => {
    set((state) => ({
      sessions: state.sessions.filter(s => s.id !== sessionId),
      activeSessionId: state.activeSessionId === sessionId ? null : state.activeSessionId,
    }))
    // Cleanup all backend-specific state via other slices
    get().cleanupSdkState(sessionId)
    get().cleanupPiState(sessionId)
    get().cleanupConnection(sessionId)
    get().removePendingPermissionsForSession(sessionId)
  },

  setActiveSession: (sessionId) => set({ activeSessionId: sessionId }),
  getActiveSession: () => get().sessions.find(s => s.id === get().activeSessionId),
})
```

### Key improvement: `removeSession` now cleans up Pi state

Each slice exposes a `cleanup*` method that `removeSession` calls:

```ts
// pi-slice.ts
cleanupPiState: (sessionId) => set((state) => {
  const { [sessionId]: _config, ...piConfig } = state.piConfig
  const { [sessionId]: _stats, ...piStats } = state.piStats
  const { [sessionId]: _models, ...piModels } = state.piModels
  const { [sessionId]: _tree, ...piSessionTree } = state.piSessionTree
  const { [sessionId]: _fork, ...piForkableEntries } = state.piForkableEntries
  const { [sessionId]: _think, ...piThinkingLevel } = state.piThinkingLevel
  const { [sessionId]: _load, ...piLoading } = state.piLoading
  const { [sessionId]: _err, ...piErrors } = state.piErrors
  return { piConfig, piStats, piModels, piSessionTree, piForkableEntries, piThinkingLevel, piLoading, piErrors }
})
```

### Combined store

```ts
// web/src/stores/sessions/index.ts
import { create } from 'zustand'
import { createSessionSlice, type SessionSlice } from './session-slice'
import { createConnectionSlice, type ConnectionSlice } from './connection-slice'
import { createMessageSlice, type MessageSlice } from './message-slice'  // TEMPORARY — flag period
import { createPermissionSlice, type PermissionSlice } from './permission-slice'
import { createSdkSlice, type SdkSlice } from './sdk-slice'
import { createPiSlice, type PiSlice } from './pi-slice'

// MessageSlice is included during the feature flag period (section 2.9).
// ChatViewLegacy reads messages/streaming state from the store.
// After flag removal (Phase 8), delete MessageSlice and its import.
export type SessionsStore =
  SessionSlice & ConnectionSlice & MessageSlice & PermissionSlice & SdkSlice & PiSlice

export const useSessionsStore = create<SessionsStore>()((...args) => ({
  ...createSessionSlice(...args),
  ...createConnectionSlice(...args),
  ...createMessageSlice(...args),  // TEMPORARY — removed with flag
  ...createPermissionSlice(...args),
  ...createSdkSlice(...args),
  ...createPiSlice(...args),
}))
```

### What moves to `useChat` (after feature flag removal)

**Important:** During the feature flag period, all of these remain in `message-slice.ts` for `ChatViewLegacy`. They are removed only when the flag is deleted in Phase 8.

| Current store field/action | Replacement (after flag removal) |
|---------------------------|-------------|
| `messages[sessionId]` | `useChat.messages` |
| `connections[id].isStreaming` | `useChat.status === 'streaming'` |
| `connections[id].currentStreamMessageId` | Implicit in `useChat` |
| `sdkStreamingState` | `useChat` manages via `WsToUIChunkTranslator` |
| `piStreamingState` | Same — translator handles Pi events too |
| `addMessage`, `updateMessage` | `useChat.setMessages` |
| `addUserMessageOnly` | `useChat.setMessages(prev => [...prev, newMsg])` |
| `sendMessage` | `useChat.sendMessage` |
| `cancelPrompt` | `useChat.stop` |
| `handleSdkWebSocketMessage` (~225 lines) | `WsToUIChunkTranslator.translateSdkEvent` |
| `handlePiWebSocketMessage` (~130 lines) | `WsToUIChunkTranslator.translatePiEvent` |
| `handleWebSocketMessage` (~80 lines) | Kept for JSON-RPC control messages only |
| `debouncedPersist` / `flushPersist` | `useChat.onFinish` callback |
| `loadMessagesForSession` | `useChat` `messages` prop seed |

### What stays in Zustand (per slice)

| Slice | Responsibility | Lines (est.) | Permanent? |
|-------|---------------|-------------|-----------|
| `session-slice` | Session list, active session, add/remove with cleanup | ~80 | Yes |
| `connection-slice` | WS connection status, retry count, `hasUnread`, `unreadCount` | ~60 | Yes |
| `message-slice` | Messages, streaming state, WS message handlers | ~450 | **No** — deleted after flag removal |
| `permission-slice` | Pending permissions keyed by `sessionId:toolCallId` | ~40 | Yes |
| `sdk-slice` | 12 SDK `Record` maps + setters + cleanup | ~200 | Yes |
| `pi-slice` | 9 Pi `Record` maps + setters + WS commands + cleanup | ~200 | Yes |
| `persistence` | IndexedDB helpers (session + message restore) | ~60 | Yes (simplified after flag removal) |
| **Total (during flag)** | | **~1,090** | |
| **Total (after flag removal)** | | **~640** | |

### `handleWebSocketMessage` (JSON-RPC) — reduced role

The JSON-RPC handler (`handleWebSocketMessage`, lines 877–954) dispatches control messages that are NOT chat messages. These stay, but move to a `connectSession` helper that routes:

- **Chat events** → `WsToUIChunkTranslator` → `wsManager.onUIChunk` subscribers
- **Control events** → Zustand store directly (SDK/Pi config, models, MCP, checkpoints, account, usage, etc.)
- **Permission events** → Permission slice

### Event type discriminators

Define which events are "chat" (routed to translator → `useChat`) vs "control" (routed to store slices):

```ts
// SDK: chat events produce UIMessageChunks
const SDK_CHAT_EVENTS = new Set([
  'content_block_start', 'assistant_delta', 'content_block_stop',
  'assistant_message', 'prompt_complete', 'prompt_error',
])
const isSdkChatEvent = (type: string) => SDK_CHAT_EVENTS.has(type)
// NOT chat: 'permission_request' → permission slice
// NOT chat: session/update, session/supported_models, etc. → JSON-RPC control handler

// Pi: chat events produce UIMessageChunks
const PI_CHAT_EVENTS = new Set([
  'agent_start', 'message_update', 'agent_end',
  'tool_execution_start', 'tool_execution_end',
])
const isPiChatEvent = (type: string) => PI_CHAT_EVENTS.has(type)
// NOT chat: 'auto_compaction_start/end' → Pi slice for sidebar notification
// NOT chat: pi/model_changed, pi/session_tree, etc. → Pi JSON-RPC control handler
```

### Router implementation

```ts
// In connectSession's messageHandler:
if (isSdkWsMessage(data)) {
  const sdkType = data.type as string
  if (isSdkChatEvent(sdkType)) {
    const chunks = translator.translateSdkEvent(sdkType, data.payload)
    chunks.forEach(chunk => wsManager.emitUIChunk(sessionId, chunk))
  } else if (sdkType === 'permission_request') {
    get().addPendingPermission(sessionId, data.payload)
  } else {
    handleSdkControlMessage(sessionId, sdkType, data.payload, get, set)
  }
} else if (isPiWsMessage(data)) {
  const piType = data.type as string
  if (isPiChatEvent(piType)) {
    const chunks = translator.translatePiEvent(piType, data.payload)
    chunks.forEach(chunk => wsManager.emitUIChunk(sessionId, chunk))
  } else {
    handlePiControlMessage(sessionId, piType, data.payload, get, set)
  }
} else {
  handleJsonRpcMessage(sessionId, data, get, set)
}
```

---

## 2.6 Message persistence migration

Currently, messages are persisted to IndexedDB via `idb-keyval` with custom debounce (`debouncedPersist`/`flushPersist`). After migration:

- `useChat` stores messages in its internal state
- On page reload, messages are lost unless we persist them

**Approach:** Persist on `onFinish`, restore on mount via loading gate + `messages` prop.

**⚠️ Race condition:** `useChat`'s `messages` prop is consumed as an initial value on first render. If we pass `[]` and then update asynchronously from IndexedDB, the hook won't pick up the change — previous conversations would be lost on reload.

**Solution:** Gate `useChat` instantiation behind a loading state. Only render `ChatView` (and instantiate `useChat`) after IndexedDB has resolved:

```ts
import { get as idbGet, set as idbSet } from 'idb-keyval'
import type { UIMessage } from 'ai'

// Hook to load persisted messages before useChat initializes
function usePersistedMessages(sessionId: string) {
  const [messages, setMessages] = useState<UIMessage[] | null>(null) // null = loading

  useEffect(() => {
    let cancelled = false
    idbGet<UIMessage[]>(`messages:${sessionId}`).then(msgs => {
      if (!cancelled) setMessages(msgs ?? [])
    })
    return () => { cancelled = true }
  }, [sessionId])

  return messages // null while loading, UIMessage[] when ready
}

// In ChatView:
const initialMessages = usePersistedMessages(sessionId)

// Don't instantiate useChat until messages are loaded
if (initialMessages === null) {
  return <ChatSkeleton />  // Loading state — prevents useChat from starting with []
}

const { messages, sendMessage, status, stop, error } = useChat({
  id: sessionId,
  transport,
  messages: initialMessages,  // Now guaranteed to be the actual persisted messages
  onFinish: async ({ messages }) => {
    await idbSet(`messages:${sessionId}`, messages)
  },
})
```

This ensures `useChat` always starts with the correct message history. The `ChatSkeleton` is a lightweight placeholder shown during the ~5ms IndexedDB read.

---

## 2.7 Usage in components

```tsx
import { useChat } from '@ai-sdk/react'
import { useMemo } from 'react'
import { ApertureWebSocketTransport } from '@/api/chat-transport'
import { set as idbSet } from 'idb-keyval'
import { usePersistedMessages } from '@/hooks/usePersistedMessages'

function ChatView({ sessionId, isActive }: { sessionId: string; isActive: boolean }) {
  const transport = useMemo(
    () => new ApertureWebSocketTransport(sessionId),
    [sessionId]
  )

  // Gate: wait for IndexedDB to resolve before instantiating useChat.
  // This prevents the race condition where useChat starts with [] and ignores
  // the async-loaded messages (useChat reads `messages` prop only on init).
  const initialMessages = usePersistedMessages(sessionId)
  if (initialMessages === null) {
    return <ChatSkeleton />
  }

  const { messages, sendMessage, setMessages, status, stop, error } = useChat({
    id: sessionId,
    transport,
    messages: initialMessages,
    onFinish: async ({ messages }) => {
      // Persist completed conversation to IndexedDB
      await idbSet(`messages:${sessionId}`, messages)
    },
    onError: (err) => {
      console.error('Chat error:', err)
    },
  })

  // status: 'ready' | 'submitted' | 'streaming' | 'error'
  // messages: UIMessage[] — parts-based, works for both SDK and Pi sessions
  // sendMessage: (message) => Promise<void>
  // setMessages: update message list (used by PermissionConfirmation for AskUserQuestion)
  // stop: () => void — triggers abort → sends cancel over WS
}
```

The `ChatView` component is backend-agnostic — it doesn't know or care whether the session is SDK or Pi. The transport and translator handle the differences.

---

## 2.8 Hooks migration

### `useSdkSession` and `usePiSession` — simplified

These hooks currently pull message-related state from the store. After migration, they only pull control panel state:

```ts
// web/src/hooks/useSdkSession.ts — after migration
export function useSdkSession(sessionId: string) {
  const session = useSessionsStore(s => s.sessions.find(s => s.id === sessionId))
  const isSdkSession = session?.agent === 'claude_sdk'

  // SDK control panel state only — no messages, no streaming
  const config = useSessionsStore(s => s.sdkConfig[sessionId])
  const usage = useSessionsStore(s => s.sdkUsage[sessionId])
  const models = useSessionsStore(s => s.sdkModels[sessionId])
  // ... etc

  return { isSdkSession, config, usage, models, /* ... */ }
}
```

`isStreaming` is no longer read from the store — components get it from `useChat.status`.

---

## 2.9 Rollback strategy — feature flag

Given the risk, gate the migration behind a feature flag:

```ts
// web/src/lib/feature-flags.ts
export const USE_CHAT_TRANSPORT = localStorage.getItem('aperture:useChatTransport') !== 'false'
// Default: ON. Set to 'false' to revert.
```

### Workspace-level switch

```tsx
function ChatArea({ sessionId }: { sessionId: string }) {
  if (USE_CHAT_TRANSPORT) {
    return <ChatViewNew sessionId={sessionId} />   // useChat-based
  }
  return <ChatViewLegacy sessionId={sessionId} />  // Zustand messages
}
```

### Cleanup timeline

- **Week 1:** Ship with flag ON, monitor for edge cases
- **Week 2:** If stable, remove `ChatViewLegacy` and the flag
- **Week 3:** Delete the old message handlers from store (if not already removed)

The old store message state (`messages`, `addMessage`, `updateMessage`, `handleSdkWebSocketMessage`, `handlePiWebSocketMessage`) is retained during the flag period. The store slices are done regardless — they're safe to ship independently.

---

## 2.10 Background session handling — preventing event loss

### The problem

`useChat` is instantiated per-session inside `ChatView`. When the user switches from session A to session B, React unmounts `ChatView` for A. This means:

1. The `ReadableStream` from `ApertureWebSocketTransport` is abandoned (no consumer)
2. WS events for session A still arrive (the WebSocket connection persists in `wsManager`)
3. The translator emits `UIMessageChunk`s to `wsManager.emitUIChunk` — but no one is subscribed
4. **Events are lost** — when the user switches back to session A, the conversation is incomplete
5. The sidebar streaming dot (Phase 6) goes stale — shows "streaming" forever for session A

### Solution: keep all active `useChat` instances mounted

Instead of mounting a single `ChatView` for the active session, mount one `ChatSession` provider per active session and hide the inactive ones:

```tsx
// web/src/pages/Workspace.tsx

function WorkspaceChat() {
  const sessions = useSessionsStore(s => s.sessions)
  const activeSessionId = useSessionsStore(s => s.activeSessionId)
  const connections = useSessionsStore(s => s.connections)

  // Session.status is a SessionStatus object (types.ts:52-66), NOT a string.
  // Use the connections map from connection-slice to determine which sessions
  // have active WebSocket connections worth keeping mounted.
  const activeSessions = sessions.filter(s => {
    const conn = connections[s.id]
    return conn && (conn.status === 'connected' || conn.status === 'connecting' || conn.status === 'reconnecting')
  })

  return (
    <>
      {activeSessions.map(session => (
        <div
          key={session.id}
          className={session.id === activeSessionId ? 'contents' : 'hidden'}
        >
          <ChatView sessionId={session.id} isActive={session.id === activeSessionId} />
        </div>
      ))}
    </>
  )
}
```

### Why `hidden` not unmount

- `hidden` (`display: none`) keeps the React tree mounted, so `useChat` stays alive and continues consuming the `ReadableStream`
- Events are processed, messages accumulate, status transitions happen — even for background sessions
- When the user switches back, the conversation is complete and up-to-date
- The `isActive` prop gates expensive rendering (e.g., syntax highlighting) on the inactive view

### Memory management

To prevent unbounded memory growth from many mounted `useChat` instances:

- **Ended/disconnected sessions** are unmounted (they're no longer receiving WS events)
- Only sessions with an active connection (`connected`/`connecting`/`reconnecting` in `connections` map) keep their `ChatView` mounted
- `wsManager.maxConnections = 10` already caps concurrent connections
- When a session is removed from the store, its `ChatView` unmounts naturally

### Alternative considered: WS event buffer

An alternative is to buffer WS events in the store when no `useChat` subscriber exists, and replay them on mount. This was rejected because:
- It requires re-implementing message accumulation logic that `useChat` already handles
- Buffer replay timing is tricky (events must be replayed before the `ReadableStream` receives new events)
- The `hidden` approach is simpler and leverages React's existing lifecycle

---

## Files changed

| Action | File | Details |
|--------|------|---------|
| **Add** | `web/src/api/chat-transport.ts` | `ApertureWebSocketTransport` class (backend-agnostic) |
| **Add** | `web/src/api/ws-to-uichunk.ts` | `WsToUIChunkTranslator` class (SDK + Pi translators) |
| **Add** | `web/src/stores/sessions/index.ts` | Combined store re-export |
| **Add** | `web/src/stores/sessions/session-slice.ts` | Session lifecycle |
| **Add** | `web/src/stores/sessions/connection-slice.ts` | Connection state |
| **Add** | `web/src/stores/sessions/message-slice.ts` | Messages + WS handlers (temporary — flag period only) |
| **Add** | `web/src/stores/sessions/permission-slice.ts` | Permissions |
| **Add** | `web/src/stores/sessions/sdk-slice.ts` | SDK-specific state |
| **Add** | `web/src/stores/sessions/pi-slice.ts` | Pi-specific state + WS commands |
| **Add** | `web/src/stores/sessions/persistence.ts` | IndexedDB helpers |
| **Add** | `web/src/lib/feature-flags.ts` | `USE_CHAT_TRANSPORT` flag |
| **Modify** | `web/src/api/websocket.ts` | Add `onUIChunk`/`emitUIChunk` subscription layer |
| **Modify** | `web/src/hooks/useSdkSession.ts` | Remove message/streaming reads |
| **Modify** | `web/src/hooks/usePiSession.ts` | Remove message/streaming reads |
| **Modify** | `web/src/pages/Workspace.tsx` | Use `useChat` for messages + status |
| **Delete** | `web/src/stores/sessions.ts` | Replaced by `sessions/` directory |

---

## Testing strategy

### Unit tests for `WsToUIChunkTranslator`

```ts
describe('WsToUIChunkTranslator — SDK', () => {
  it('translates content_block_start (text) to start + text-start', () => { ... })
  it('translates assistant_delta (text_delta) to text-delta with matching block ID', () => { ... })
  it('translates content_block_stop (text) to text-end', () => { ... })
  it('closes open blocks on prompt_complete', () => { ... })
  it('emits error on prompt_error', () => { ... })
  it('handles interleaved text and reasoning blocks', () => { ... })
  it('translates tool_use lifecycle correctly', () => { ... })
  it('does not emit chunks for permission_request', () => { ... })
})

describe('WsToUIChunkTranslator — Pi', () => {
  it('translates agent_start to start', () => { ... })
  it('reads from assistantMessageEvent (NOT top-level delta)', () => { ... })
  it('handles explicit text_start/text_end block delimiters', () => { ... })
  it('handles explicit thinking_start/thinking_end block delimiters', () => { ... })
  it('auto-opens text block on text_delta if text_start was missed', () => { ... })
  it('auto-opens reasoning block on thinking_delta if thinking_start was missed', () => { ... })
  it('translates thinking_delta to reasoning chunks (no longer dropped)', () => { ... })
  it('handles text→thinking→text transitions with proper close/open', () => { ... })
  it('creates separate text blocks for text_end → text_start sequences', () => { ... })
  it('translates toolcall lifecycle (start → delta → end)', () => { ... })
  it('uses inputJson field (not partialJson) for toolcall_delta', () => { ... })
  it('preserves tool name from toolcall_start through tool_execution_end', () => { ... })
  it('translates tool_execution_end to tool-output-available', () => { ... })
  it('translates done to finish with open block cleanup', () => { ... })
  it('guards against double-finish on agent_end after done', () => { ... })
  it('translates error to error chunk', () => { ... })
})
```

### Unit tests for store slices

```ts
describe('session-slice', () => {
  it('removeSession cleans up SDK state', () => { ... })
  it('removeSession cleans up Pi state', () => { ... })  // Bug fix verification
  it('removeSession cleans up connections', () => { ... })
  it('removeSession cleans up permissions', () => { ... })
})
```

### Integration test for transport

Mock `wsManager`, verify that `sendMessages` creates a readable stream and that WebSocket events produce correct chunks for both SDK and Pi session types.

---

## Verification

```bash
pnpm --filter aperture-web typecheck
pnpm --filter aperture-web build
pnpm --filter aperture-web test

# Manual — SDK session:
# 1. Create SDK session, send message → status: ready → submitted → streaming → ready
# 2. Stop button works (triggers cancel WS message)
# 3. Permission requests still appear and respond correctly
# 4. Thinking blocks render (reasoning parts visible)
# 5. Tool calls stream input, show results
# 6. Messages persist across page refresh

# Manual — Pi session:
# 7. Create Pi session, send message → status transitions work
# 8. Thinking content now visible (was previously console.log only)
# 9. Tool calls now visible in message stream (was previously invisible)
# 10. Steer/follow-up commands work during streaming
# 11. Fork/navigate work correctly
# 12. Auto-compaction notification appears (sidebar only)

# Manual — cross-session:
# 13. Multiple concurrent sessions (mixed SDK + Pi) work independently
# 14. Switching between SDK and Pi sessions preserves messages
# 15. Feature flag: set localStorage 'aperture:useChatTransport' to 'false' → old behavior
```
