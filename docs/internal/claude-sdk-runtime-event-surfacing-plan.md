# Claude SDK Runtime Event Surfacing Plan

Date: 2026-03-28

Owner:
- Claude SDK runtime event surfacing tranche

Scope:
- Surface Claude runtime and control-plane events that Aperture backend already emits but the frontend currently ignores
- Trace the full event path across backend emitters, WebSocket routing, frontend stores, hooks, and SDK UI
- Define a complete plan for the currently dropped events, not just the immediately requested subset

Primary drivers:
- make backend/frontend Claude state coherent
- remove backend-only Claude features that stop at the transport boundary
- establish a durable event model before adding larger Claude UX features

Out of scope:
- transcript-integrated rewind redesign
- notifications system comparable to `clay`
- cross-session search
- draft persistence
- large `SdkSession` backend refactor
- full provider/orchestration layer comparable to `t3code`

Related documents:
- `docs/internal/reviews/claude-sdk-session-review-2026-03-26.md`
- `docs/internal/claude-sdk-transport-runtime-correctness-plan.md`

## Goals

Ship a focused Claude runtime surfacing tranche that makes Aperture expose the backend event surface it already has.

Success means:

1. all Claude runtime events emitted by Aperture are explicitly classified as one of:
   - surfaced in transcript
   - surfaced in control-plane state/UI
   - surfaced as transient activity/notification
   - intentionally internal/debug-only
2. `auth_status`, `tool_progress`, `task_notification`, hook events, and `session/mcp_servers_updated` are fully handled end-to-end
3. frontend store state exists for runtime/control-plane events rather than dropping them in transport handlers
4. reconnect and session-switch behavior preserves or refreshes runtime event state correctly
5. regression tests cover the newly surfaced event families

## Executive Summary

Aperture already emits a materially richer Claude runtime event surface than the product exposes. The backend publishes auth state, tool progress, hook lifecycle events, task notifications, compaction markers, MCP update results, and additional runtime status updates. Today, most of that work stops in `web/src/stores/sessions/jsonrpc-message-handler.ts`, because the frontend store has no runtime-event model and the SDK UI has no place to render it.

This is not just a UX gap. It is a product correctness gap. When the backend says "auth required", "MCP servers changed", "hook failed", or "task notification arrived", the frontend currently behaves as though nothing happened.

Compared with the references:

- `clay` productizes runtime events aggressively. Its bridge forwards events like `tool_progress`, `task_notification`, `prompt_suggestion`, `context_overflow`, and `config_state`, and the UI consumes them directly.
- `t3code` is stronger one layer earlier. It normalizes Claude runtime events inside the provider/orchestration boundary before they reach UI state, which makes surfacing them downstream more reliable.

Aperture should take the pragmatic middle path:

- keep the current transport structure
- introduce a typed frontend runtime-event slice
- classify each event by persistence and UX destination
- surface the missing high-value events now
- leave raw/debug transport passthroughs internal unless there is a clear user-facing need

## Current Architecture

### Backend emitters

Claude runtime events are emitted from `src/sdk-session.ts` through two channels:

1. JSON-RPC `session/update`
   Used for control-plane and legacy-compatible session updates via `emitSessionUpdate(...)`.

2. SDK WebSocket messages
   Used for transcript/Claude stream events via `emitSdkMessage(...)`.

Additional JSON-RPC methods are emitted from `src/routes.ts` for explicit SDK control actions such as MCP/account/model/checkpoint/config responses.

### Frontend routing

Current routing is split in `web/src/stores/sessions/connection-slice.ts`:

1. `isSdkWsMessage(data)`:
   - transcript events go through `WsToUIChunkTranslator`
   - control messages go through `handleSdkWebSocketMessage(...)`

2. otherwise:
   - JSON-RPC events go through `handleJsonRpcMessage(...)`

### Current frontend state model

The SDK store slice in `web/src/stores/sessions/sdk-slice.ts` only tracks:

- config
- usage
- account info
- models
- commands
- MCP status
- checkpoints
- loading flags
- fetch errors
- rewind result

There is currently no state for:

- auth status
- hook activity
- tool progress
- task notifications
- compact boundaries
- runtime/system status history
- MCP server update results

## Event Inventory

### A. Backend-emitted Claude events in Aperture

#### JSON-RPC `session/update` events from `src/sdk-session.ts`

- `request_permission`
- `user_message`
- `tool_progress`
- `auth_status`
- `sdk_message`
- `init`
- `status`
- `hook_started`
- `hook_progress`
- `hook_response`
- `task_notification`
- `compact_boundary`
- `system`
- `agent_message_chunk`
- `tool_call`
- `thinking`
- `agent_message_complete`
- `agent_message_delta`
- `content_block_start`
- `content_block_stop`
- `prompt_complete`
- `prompt_error`
- `config_changed`

#### SDK WebSocket message types from `src/sdk-session.ts`

- `assistant_message`
- `assistant_delta`
- `content_block_start`
- `content_block_stop`
- `prompt_complete`
- `prompt_error`

#### Additional JSON-RPC methods from `src/routes.ts`

- `session/mcp_status`
- `session/mcp_servers_updated`
- `session/account_info`
- `session/supported_models`
- `session/supported_commands`
- `session/checkpoints`
- `session/rewind_result`
- `session/config_updated`
- `session/usage_update`

### B. Frontend-consumed event surface today

#### Fully or materially surfaced today

- transcript stream events through `web/src/api/ws-to-uichunk.ts`:
  - `assistant_message`
  - `assistant_delta`
  - `content_block_start`
  - `content_block_stop`
  - `prompt_complete`
  - `prompt_error`
- permission requests:
  - `session/request_permission`
  - SDK `permission_request`
- config bootstrap/update:
  - `init`
  - `config_changed`
  - `session/config_updated`
- usage:
  - `session/usage_update`
- existing control-panel fetch results:
  - models
  - commands
  - MCP status
  - account info
  - checkpoints
  - rewind result

#### Emitted but ignored today

- `tool_progress`
- `auth_status`
- `status`
- `hook_started`
- `hook_progress`
- `hook_response`
- `task_notification`
- `compact_boundary`
- `system`
- `sdk_message`
- `session/mcp_servers_updated`

#### Emitted but should remain out of the new control-plane tranche unless needed

These are already transcript-level, redundant, or too low-level to expose directly:

- `agent_message_chunk`
- `agent_message_complete`
- `agent_message_delta`
- `tool_call`
- `thinking`
- `content_block_start`
- `content_block_stop`
- `assistant_message`
- `assistant_delta`
- `prompt_complete`
- `prompt_error`
- `user_message`

The plan below treats those as already handled by the chat/transcript path unless a specific UX requirement emerges.

## Gap Matrix

| Event | Source | Current status | Target surface | Priority | Notes |
| --- | --- | --- | --- | --- | --- |
| `auth_status` | `session/update` | dropped | persistent session runtime state + inline status UI | P0 | backend already knows auth state; UI currently blind |
| `tool_progress` | `session/update` | dropped | transient activity feed + optional latest-progress summary | P0 | needed for long tool runs and sub-agent visibility |
| `task_notification` | `session/update` | dropped | activity feed + optional toast hook | P0 | likely the highest-signal runtime notification event |
| `hook_started` | `session/update` | dropped | runtime activity feed | P0 | useful for Claude hooks and automation visibility |
| `hook_progress` | `session/update` | dropped | runtime activity feed | P0 | may need bounded retention due to event volume |
| `hook_response` | `session/update` | dropped | runtime activity feed + error/result summary | P0 | strongest hook completion signal |
| `session/mcp_servers_updated` | top-level JSON-RPC | dropped | MCP update result state + MCP status refresh trigger | P0 | backend emits success/error and UI ignores it |
| `status` | `session/update` | dropped | persistent runtime status state | P1 | likely useful for control header/state badges |
| `compact_boundary` | `session/update` | dropped | runtime markers/history | P1 | should at least be retained for diagnostics |
| `system` | `session/update` | dropped | bounded runtime/system event feed | P1 | needs sanitization review before prominent UI |
| `sdk_message` | `session/update` | dropped | debug-only, do not surface by default | P2 | raw passthrough should not become product state |

## Design Principles

### 1. Do not duplicate transcript rendering

If an event is already translated into `UIMessageChunk` by `WsToUIChunkTranslator`, do not also render it separately in the runtime panel unless there is a clear distinct UX purpose.

### 2. Runtime events need typed store state

Adding more `if (updateType === ...)` branches without a real state model will repeat the current problem. The frontend needs a dedicated SDK runtime slice, not more ad hoc mutations.

### 3. Separate persistent state from activity history

Some events represent current state:

- auth status
- runtime status
- latest MCP update result

Some events represent activity history:

- tool progress
- hook lifecycle
- task notifications
- compaction markers
- system notices

They should not share the same storage model.

### 4. Keep retention bounded

Hook and tool progress events can become noisy. Store only bounded recent history per session and a small amount of current-summary state.

### 5. Favor session-keyed store state over component-local refs

This tranche should not rely on control-panel mount timing. Runtime state must be keyed by `sessionId`, survive control-panel open/close, and refresh cleanly on reconnect.

## Proposed Target Model

## 1. Extend the SDK store slice

Add a dedicated runtime-event section to `web/src/stores/sessions/sdk-slice.ts`.

Recommended additions:

- `sdkAuthStatus: Record<string, SdkAuthStatus | null>`
- `sdkRuntimeStatus: Record<string, SdkRuntimeStatus | null>`
- `sdkRuntimeActivity: Record<string, SdkRuntimeActivityEntry[]>`
- `sdkMcpUpdateResult: Record<string, McpSetServersResult | null>`
- `sdkRuntimeUnread: Record<string, number>`

Recommended supporting types in `web/src/api/types.ts`:

- `SdkAuthStatus`
- `SdkRuntimeStatus`
- `SdkRuntimeActivityEntry`
- `SdkRuntimeActivityKind`

Recommended activity kinds:

- `tool_progress`
- `task_notification`
- `hook_started`
- `hook_progress`
- `hook_response`
- `compact_boundary`
- `system`

Each activity entry should include:

- stable generated `id`
- `sessionId`
- `kind`
- `timestamp`
- `payload`
- optional `severity`
- optional `groupKey`

Retention:

- cap to last 50 or 100 runtime activities per session
- keep `sdkAuthStatus` and `sdkRuntimeStatus` as latest-state snapshots

## 2. Add explicit event classification in the JSON-RPC handler

Extend `web/src/stores/sessions/jsonrpc-message-handler.ts` so `handleSessionUpdate(...)` classifies events into:

1. transcript-only
2. runtime snapshot updates
3. runtime activity entries
4. top-level control responses

Recommended handling:

- `auth_status`
  - normalize payload into `setSdkAuthStatus(sessionId, ...)`
- `status`
  - normalize payload into `setSdkRuntimeStatus(sessionId, ...)`
- `tool_progress`
  - append runtime activity entry
  - optionally update `sdkRuntimeStatus` if the payload contains a high-level status string
- `task_notification`
  - append runtime activity entry
- `hook_started`
  - append runtime activity entry
- `hook_progress`
  - append runtime activity entry
- `hook_response`
  - append runtime activity entry
- `compact_boundary`
  - append runtime activity entry
- `system`
  - append runtime activity entry with lower retention priority if needed

Top-level `session/mcp_servers_updated` should:

- persist the result object in store
- clear any MCP loading state
- trigger or strongly encourage a follow-up `get_mcp_status` refresh path so the visible server list reflects the new backend state

## 3. Keep SDK WebSocket handling focused

`web/src/stores/sessions/sdk-message-handler.ts` should remain narrow unless a Claude SDK WebSocket event exists that is not already translated in `ws-to-uichunk.ts` and needs separate control-plane state.

Current recommendation:

- do not move runtime control-plane handling into the SDK message handler
- keep runtime/control-plane surfacing in the JSON-RPC handler where Aperture already emits those events

## 4. Extend `useSdkSession`

Expose the new runtime state through `web/src/hooks/useSdkSession.ts`.

Recommended returned values:

- `authStatus`
- `runtimeStatus`
- `runtimeActivity`
- `mcpUpdateResult`

Optional helper actions:

- `clearRuntimeActivity()`
- `clearMcpUpdateResult()`

This keeps SDK UI components from reaching into the raw store shape.

## 5. Add a dedicated runtime UI section

Do not overload usage/account/MCP/checkpoints/commands sections with runtime events.

Recommended additions under `web/src/components/sdk/`:

- `SdkRuntimeStatus.tsx`
  - shows current auth state
  - shows current runtime status
  - shows latest MCP update result

- `SdkRuntimeActivity.tsx`
  - bounded recent activity list
  - renders tool progress, task notifications, hook events, compaction markers, and system notices

Placement:

- add a `Runtime` panel section near the top of `SdkControlPanel`
- keep `MCP Servers` focused on actual server status list
- optionally show a compact auth badge in `SdkSessionHeader` or session header once the store data exists

## 6. Unread/attention semantics

Runtime events can matter even when the session is not active.

Recommended behavior:

- increment session unread count for high-signal runtime events on inactive sessions:
  - `task_notification`
  - `auth_status` when it indicates action required
  - `session/mcp_servers_updated` when it contains errors
- do not increment unread for every low-level hook progress event

This gives useful attention semantics without recreating Clay’s full notification pipeline.

## Event-By-Event Plan

### 1. `auth_status`

Problem:

- backend emits it
- frontend drops it
- user has no visible auth-required or auth-state feedback

Plan:

1. inspect actual backend payload shape from `src/sdk-session.ts`
2. define a typed frontend `SdkAuthStatus`
3. store latest auth state per session
4. render a compact status row in the runtime section
5. if auth indicates action required, mark the event as high-signal for unread/attention

Comparison:

- `clay` treats auth-required as a first-class UI state
- Aperture should at minimum reach parity on visibility even if it does not build the same auth UX flow yet

### 2. `tool_progress`

Problem:

- backend emits sub-agent/tool progress
- frontend drops it
- long-running tool work is opaque unless it happens to show up as transcript text later

Plan:

1. normalize progress payload into runtime activity entries
2. collapse repeated progress entries with the same tool/task identifier if available
3. render recent progress in runtime activity
4. keep retention bounded and avoid unread count inflation for every progress tick

Comparison:

- `clay` explicitly forwards `tool_progress` as activity updates
- `t3code` handles the same event at the provider layer before downstream consumers see it

### 3. `task_notification`

Problem:

- likely the most user-meaningful non-transcript runtime event
- currently dropped completely

Plan:

1. store as runtime activity entry with higher default severity
2. render prominently in the runtime activity list
3. leave room for later toast/browser-notification integration, but do not require it for this tranche
4. increment unread for inactive sessions

### 4. Hook events

Events:

- `hook_started`
- `hook_progress`
- `hook_response`

Problem:

- backend already exposes hook lifecycle visibility
- frontend shows none of it

Plan:

1. define a normalized hook activity payload shape
2. store each hook event as runtime activity
3. render grouped hook entries if possible:
   - start
   - progress
   - response
4. surface failures/errors distinctly
5. cap retention aggressively because hook progress can be noisy

Comparison:

- `t3code` explicitly normalizes hook events inside `ClaudeAdapter`
- Aperture should at least normalize them once in the frontend store if the backend remains stringly typed

### 5. `session/mcp_servers_updated`

Problem:

- backend emits the result of MCP set/update actions
- frontend ignores it
- users can change MCP servers and receive no result feedback beyond manual refresh

Plan:

1. define a typed store slot for last MCP update result
2. handle both success and error payloads
3. clear MCP loading state when the result arrives
4. immediately refresh or invalidate `sdkMcpStatus`
5. render a compact “updated / partial failure / failed” summary in runtime or MCP section

This is both correctness and UX. Right now MCP updates are effectively fire-and-forget.

### 6. `status`

Problem:

- emitted by backend
- ignored by frontend

Plan:

1. inspect current payload shape and semantics
2. if it represents high-level Claude session state, store it as `sdkRuntimeStatus`
3. render it in `SdkRuntimeStatus`

If the payload duplicates existing connection state, document that explicitly and keep the UI lightweight.

### 7. `compact_boundary`

Problem:

- backend exposes compaction boundaries
- frontend drops them

Plan:

1. store compact boundary markers as runtime activity
2. render them as low-noise timeline markers
3. do not toast them

This is mainly diagnostic value now, but it closes an explicit backend/frontend gap.

### 8. `system`

Problem:

- generic system notices are emitted and ignored
- payload may contain useful state or noisy internal text

Plan:

1. inspect payloads before deciding prominence
2. store as low-severity activity entries by default
3. apply existing sanitization discipline if the text can contain internal details

### 9. `sdk_message`

Problem:

- raw passthrough event exists
- surfacing it directly would blur transport/debug concerns

Plan:

- do not expose raw `sdk_message` in the product UI by default
- optionally keep it for DEV-only logging or future diagnostics

This event should remain explicitly classified as internal unless a concrete user need emerges.

## Implementation Phases

### Phase 1. Define the event contract and store model

Files:

- `web/src/api/types.ts`
- `web/src/stores/sessions/sdk-slice.ts`
- `web/src/hooks/useSdkSession.ts`

Changes:

1. add typed runtime/auth/activity state
2. add store actions for snapshot and activity updates
3. add bounded-retention helper for runtime activity
4. expose runtime state via `useSdkSession`

Deliverables:

- no UI yet
- store shape exists and is typed

### Phase 2. Wire JSON-RPC runtime events into the store

Files:

- `web/src/stores/sessions/jsonrpc-message-handler.ts`

Changes:

1. handle all P0 runtime events
2. handle `status`, `compact_boundary`, `system`
3. handle `session/mcp_servers_updated`
4. explicitly document in code which events are intentionally ignored because transcript already owns them

Deliverables:

- dropped events become store updates
- transport boundary is no longer the terminal point for these events

### Phase 3. Add runtime UI surfaces

Files:

- `web/src/components/sdk/SdkControlPanel.tsx`
- new runtime components under `web/src/components/sdk/`
- optionally `web/src/components/sdk/SdkSessionHeader.tsx`

Changes:

1. add `Runtime` section
2. show current auth/runtime state
3. show bounded recent activity
4. show MCP update result summary

Deliverables:

- users can see the runtime events the backend already knows about

### Phase 4. Add reconnect/session-switch correctness

Files:

- `web/src/components/sdk/SdkControlPanel.tsx`
- potentially `web/src/stores/sessions/connection-slice.ts`
- related tests

Changes:

1. ensure runtime state is keyed by session and survives panel reopen
2. confirm reconnect does not wipe runtime state incorrectly
3. decide whether reconnect should fetch MCP status again after recent MCP updates

Deliverables:

- runtime UI is not mount-timing dependent

## Testing Plan

### Store and handler tests

Extend `web/src/stores/sessions.test.ts` with coverage for:

1. `auth_status` updates `sdkAuthStatus`
2. `tool_progress` appends runtime activity
3. `task_notification` appends runtime activity and increments unread only when inactive
4. `hook_started`, `hook_progress`, `hook_response` append typed runtime activity
5. `status` updates `sdkRuntimeStatus`
6. `compact_boundary` and `system` append runtime activity
7. `session/mcp_servers_updated` stores result and clears MCP loading
8. bounded retention trims old runtime activity entries

### Routing tests

Add or extend tests around `connection-slice` to ensure:

1. SDK transcript events still route to `WsToUIChunkTranslator`
2. JSON-RPC runtime events route to store state without affecting transcript translation
3. reconnect does not duplicate or corrupt runtime state

### UI tests

If the repo already uses component tests for SDK panels, add:

1. runtime section renders auth/runtime/activity state
2. MCP update result renders success/partial failure/failure correctly
3. noisy hook progress remains bounded

### Manual verification checklist

1. connect to a Claude SDK session and trigger auth-state emission
2. run a prompt that produces tool progress
3. trigger a Claude hook start/progress/response cycle
4. update MCP server config and confirm result plus refreshed server status
5. switch sessions and reconnect to ensure runtime state remains coherent

## Rollout Order

Recommended implementation order:

1. typed store/runtime state
2. JSON-RPC runtime event handling
3. `session/mcp_servers_updated` handling plus MCP refresh semantics
4. runtime UI section in control panel
5. unread/attention tuning
6. reconnect/session-switch hardening

This order keeps correctness ahead of presentation and avoids building UI before the state model exists.

## Risks

### 1. Event volume

Hook progress and tool progress can be noisy. Without retention caps and dedupe/grouping, the runtime panel can become unusable.

### 2. Duplicate user-visible signals

If transcript events and runtime events are both rendered for the same underlying action, the user will see duplicates. This is why transcript-owned events stay out of the runtime tranche.

### 3. Undefined payload contracts

Several `session/update` payloads are still effectively stringly typed. Implementation should inspect actual emitted payloads before finalizing frontend interfaces.

### 4. UI clutter

The right-side SDK panel is already dense. Runtime surfacing should be a separate section with bounded content, not an unstructured dump of low-level events.

## Definition Of Done

This tranche is complete when:

1. every backend-emitted Claude runtime event is explicitly classified in code and in tests
2. `auth_status`, `tool_progress`, `task_notification`, hook events, and `session/mcp_servers_updated` are surfaced end-to-end
3. `status`, `compact_boundary`, and `system` are no longer silently dropped
4. transcript-owned events are explicitly left on the transcript path and not duplicated
5. runtime state is session-keyed, bounded, and reconnect-safe
6. the SDK control panel exposes the new runtime state in a coherent way

## Recommended Follow-On Work

After this plan lands, the next logical Claude UX tranche is:

1. attention and toast behavior for high-signal runtime events
2. transcript-integrated context overflow/compaction UX
3. stronger backend typing for runtime event payloads
4. eventual provider-runtime normalization closer to `t3code`’s architecture
