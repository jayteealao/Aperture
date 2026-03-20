# Claude SDK Session Persistence And Multi-Device Repair Plan

## Purpose

This document defines the repair plan for Aperture's Claude SDK session lifecycle, with a focus on:

- durable session persistence
- reliable disconnect and reconnect behavior
- correct session restoration after server restarts
- consistent state across browser tabs and multiple devices
- migration from browser-local state to server-authoritative state

The plan is based on direct review of:

- Aperture's installed Claude SDK integration
- Aperture backend and frontend session lifecycle code
- Clay's Claude relay/session design in `.scratch/clay`

This is not a speculative design note. It is grounded in the current codebase and the concrete failure modes already identified.

## Deployment Scope

This plan assumes a single-host Aperture deployment:

- many browsers and devices connect to one Aperture server
- browsers do not connect to alternate hosts for the same deployment
- Claude SDK transcript files and session-local resume state remain on that host

This makes the target architecture materially simpler and closer to Clay:

- provider-native Claude resume is host-local and that is acceptable
- session ownership can remain server-local rather than cross-host
- replay and subscriber state can be managed in one process plus local database/disk persistence

## Current Findings

### 1. Server is not the canonical source of chat history

Current Aperture behavior:

- The chat pane hydrates from browser IndexedDB via `ui-messages:${sessionId}` in [usePersistedUIMessages.ts](/C:/Users/jayte/Documents/dev/Aperture/web/src/hooks/usePersistedUIMessages.ts#L15).
- The backend exposes `GET /v1/sessions/:id/messages` in [routes.ts](/C:/Users/jayte/Documents/dev/Aperture/src/routes.ts#L305).
- The database includes [saveMessage()](/C:/Users/jayte/Documents/dev/Aperture/src/database.ts#L298).
- Nothing calls `saveMessage()`.

Impact:

- Device B cannot reliably reconstruct session history created on device A.
- Server restarts lose rendered chat continuity even if the Claude session itself is resumable.
- The existing message-history API is effectively dead.

### 2. Session discovery is device-local first

Current Aperture behavior:

- The frontend restores sessions from local IndexedDB in [session-slice.ts](/C:/Users/jayte/Documents/dev/Aperture/web/src/stores/sessions/session-slice.ts#L118).
- It then merges `/v1/sessions/resumable`, also in [session-slice.ts](/C:/Users/jayte/Documents/dev/Aperture/web/src/stores/sessions/session-slice.ts#L123).
- Workspace association is partially frontend-only. `workspaceId` is stored in the frontend session record and persisted locally in IndexedDB.

Impact:

- A session created on device A may not appear on device B until it enters the backend's "resumable" path.
- Workspace/session grouping is not globally consistent.
- The browser is acting as a partial source of truth for server entities.

### 3. Reconnect during streaming is intentionally lossy

Current Aperture behavior:

- WebSocket failures end the UI stream in [websocket.ts](/C:/Users/jayte/Documents/dev/Aperture/web/src/api/websocket.ts#L93).
- `ApertureWebSocketTransport.reconnectToStream()` returns `null` in [chat-transport.ts](/C:/Users/jayte/Documents/dev/Aperture/web/src/api/chat-transport.ts#L79).
- Partial stream state exists only in process memory and translator state in [ws-to-uichunk.ts](/C:/Users/jayte/Documents/dev/Aperture/web/src/api/ws-to-uichunk.ts).

Impact:

- If a socket drops while Claude is still answering, the backend may continue running but the browser cannot resume the response stream.
- Multiple devices will diverge immediately if one joins mid-stream.

### 4. Claude idle/resumable behavior is inconsistent between fresh and restored sessions

Fresh Claude sessions:

- `createClaudeSdkSession()` marks idle by saving `status: 'idle'` in [sessionManager.ts](/C:/Users/jayte/Documents/dev/Aperture/src/sessionManager.ts#L670).

Restored Claude sessions:

- `setupSdkSessionEventHandlers()` handles idle by calling `endSession()` in [sessionManager.ts](/C:/Users/jayte/Documents/dev/Aperture/src/sessionManager.ts#L266).

Impact:

- A restored Claude session may stop being resumable after idling, unlike a fresh session.
- Reconnect behavior changes depending on whether the session has already gone through one restore cycle.

### 5. Aperture is on an older Claude Agent SDK pattern

Current Aperture behavior:

- Aperture uses `@anthropic-ai/claude-agent-sdk@0.2.19`.
- It drives queries through `query()` in [sdk-session.ts](/C:/Users/jayte/Documents/dev/Aperture/src/sdk-session.ts#L576).
- It relies on `resume`, `continue`, and `resumeSessionAt`.

Observed SDK surface in the installed package:

- `unstable_v2_createSession`
- `unstable_v2_resumeSession`

Clay reference:

- Clay is on a much newer SDK line.
- Clay keeps relay-owned session state in `.scratch/clay/lib/sessions.js`.
- Clay replays history and pending permission state when switching/rejoining a session.

Impact:

- Aperture is building long-lived multi-device behavior on top of an older one-shot query pattern.
- Even if the current code is repaired, the SDK version gap is a maintenance risk.

### 5a. Provider-native Claude resume is host-local and that is acceptable in our target deployment

Anthropic's documented behavior:

- `resume` depends on local transcript files
- the session file must exist on the current machine
- the `cwd` must match
- for cross-host resume, you must either restore the transcript file to the same path on the new host or not rely on provider-native resume and instead carry forward your own application state

Impact:

- Aperture can safely rely on host-local provider resume because all browsers connect to the same Aperture host
- provider session continuity and Aperture session continuity should still be kept logically separate
- we do not need cross-host resume machinery for the target deployment

### 6. Session identity temporarily drifts during startup/restore

Current Aperture behavior:

- `SdkSession.start()` sets `sdkSessionId = this.id` in [sdk-session.ts](/C:/Users/jayte/Documents/dev/Aperture/src/sdk-session.ts#L173).
- Later, real Claude `session_id` updates arrive and overwrite it in [sdk-session.ts](/C:/Users/jayte/Documents/dev/Aperture/src/sdk-session.ts#L611).

Impact:

- Aperture session ID and Claude session ID are conflated during initialization windows.
- Restore logic becomes harder to reason about.
- Debugging reconnect/resume failures is more difficult because the session identity is unstable early in the lifecycle.

### 7. The backend supports multiple subscribers, but the UI is still single-device oriented

Current Aperture behavior:

- The backend WebSocket endpoint broadcasts a session's events to any connected socket that attaches to that session in [routes.ts](/C:/Users/jayte/Documents/dev/Aperture/src/routes.ts#L787).
- The frontend still hydrates from local state, connects from multiple places, and lacks server event replay.

Impact:

- Multiple devices can attach to the same live session, but they do not share a canonical history or reconnection model.
- This gives the appearance of multi-device support without the required consistency guarantees.

## Clay Reference Patterns To Adopt

Clay is not a drop-in architecture match, but several of its patterns are directly relevant.

### A. Relay-owned session registry

Relevant files:

- [.scratch/clay/lib/sessions.js](/C:/Users/jayte/Documents/dev/Aperture/.scratch/clay/lib/sessions.js)
- [.scratch/clay/lib/project.js](/C:/Users/jayte/Documents/dev/Aperture/.scratch/clay/lib/project.js)

Important patterns:

- sessions are owned by the server process, not by an individual browser
- session list is broadcast by the server
- active client/session mapping is tracked server-side
- reconnecting clients switch into an existing session rather than re-deriving it from browser-local state

### B. History replay on rejoin

Relevant code:

- `replayHistory()` and `switchSession()` in [sessions.js](/C:/Users/jayte/Documents/dev/Aperture/.scratch/clay/lib/sessions.js#L329)

Important patterns:

- when a client rejoins, server replays history
- server also re-emits in-flight permission requests
- history is not reconstructed from browser-local rendered state

### C. Resume by stable Claude session ID

Relevant code:

- [sdk-bridge.js](/C:/Users/jayte/Documents/dev/Aperture/.scratch/clay/lib/sdk-bridge.js#L838)
- [sessions.js](/C:/Users/jayte/Documents/dev/Aperture/.scratch/clay/lib/sessions.js#L491)

Important patterns:

- relay stores the actual Claude session ID
- subsequent queries use `resume` with that ID
- rewind and resume are relay-owned state transitions

### D. Pending permission replay

Relevant code:

- [sessions.js](/C:/Users/jayte/Documents/dev/Aperture/.scratch/clay/lib/sessions.js#L383)
- [sdk-bridge.js](/C:/Users/jayte/Documents/dev/Aperture/.scratch/clay/lib/sdk-bridge.js#L1133)

Important patterns:

- pending permission state is owned by the server
- reconnecting clients receive the pending request again
- the UI does not need to guess whether a permission is still unresolved

## Target Architecture

## 1. Server-authoritative session model

The server must become the canonical source of truth for:

- session existence
- session metadata
- workspace association
- current Claude SDK session ID
- resumability
- live connection state
- canonical event/message history

The browser should become:

- a cache for faster local startup
- a renderer of server state
- a temporary holder of unsent UI edits only

It should not remain the primary store for session identity or chat history.

## 2. Canonical event log plus derived UI state

We need a canonical persisted server-side event log for each session. At minimum store:

- user prompt submitted
- assistant message start/delta/complete
- tool call start/delta/available
- tool result available/error
- permission request created
- permission response resolved
- prompt complete
- prompt error
- session config changes that affect interpretation of history

Two valid implementation choices:

1. Persist normalized domain events and derive UI messages from them.
2. Persist a server-side canonical UI message snapshot plus selected domain events.

Recommendation:

- Persist normalized events first.
- Optionally also persist a cached rendered snapshot for fast hydration.

Reason:

- event persistence is more robust for reconnect, replay, auditing, and future protocol changes

## 3. Explicit subscriber model for multi-device clients

Each session should support multiple concurrent subscribers:

- browser tab A
- browser tab B
- device A
- device B

The server should track:

- subscriber IDs
- last acknowledged event sequence per subscriber
- active/inactive subscriber status

This allows:

- replay from the last seen sequence
- deterministic reconnect behavior
- unread counts derived from server-side presence rather than device-local heuristics

## 4. Stable separation of Aperture session ID and Claude session ID

We should treat:

- Aperture session ID as the application-level session key
- Claude session ID as external provider state used for resume

The two must never be temporarily aliased in a way that affects restore decisions.

Additional rule for multi-host deployments:
- Aperture session continuity should still not over-couple application state to provider state, even on one host

## Repair Plan

## Phase 0: Instrumentation and safety rails

Goal:

- make failures observable before changing behavior

Tasks:

1. Add structured logs for:
   - session create
   - session restore
   - websocket attach
   - websocket detach
   - Claude `session_id` change
   - idle transition
   - resumable/non-resumable transition
   - reconnect attempts and final outcome

2. Add metrics counters:
   - restores attempted
   - restores succeeded
   - websocket 1008 closes
   - reconnect retries exhausted
   - mid-stream disconnects
   - pending permissions on disconnect

3. Add diagnostic fields to session status:
   - `subscriberCount`
   - `lastPersistedEventSequence`
   - `lastAckedSequence` per subscriber if exposed internally
   - `restoredFromDatabase`
   - `claudeSessionId`

Deliverable:

- no behavior change yet
- enough telemetry to validate later phases

## Phase 1: Fix the Claude session lifecycle inconsistencies

Goal:

- make restore/idle/resume behavior internally coherent

Tasks:

1. Stop setting `sdkSessionId = this.id` in `SdkSession.start()`.
   Files:
   - [sdk-session.ts](/C:/Users/jayte/Documents/dev/Aperture/src/sdk-session.ts#L173)

   Desired behavior:
   - if restoring, retain the persisted Claude session ID from config/database
   - if fresh, keep `sdkSessionId` null until the SDK emits a real `session_id`

2. Unify idle handling for fresh and restored Claude sessions.
   Files:
   - [sessionManager.ts](/C:/Users/jayte/Documents/dev/Aperture/src/sessionManager.ts#L266)
   - [sessionManager.ts](/C:/Users/jayte/Documents/dev/Aperture/src/sessionManager.ts#L670)

   Desired behavior:
   - both fresh and restored Claude sessions transition to `idle`
   - both remain resumable unless explicitly marked non-resumable
   - `exit` should mark non-resumable only when the provider session is truly gone

3. Define explicit status transitions:
   - `active`
   - `idle`
   - `ended`
   - optionally `restoring`
   - optionally `error`

4. Ensure restored sessions are inserted into memory before socket attach windows can race.
   Files:
   - [routes.ts](/C:/Users/jayte/Documents/dev/Aperture/src/routes.ts#L374)
   - [sessionManager.ts](/C:/Users/jayte/Documents/dev/Aperture/src/sessionManager.ts#L156)

5. Review whether `await session.start()` on restore should eagerly initialize only local state, not trigger ambiguous synthetic identity writes.

Deliverable:

- restored Claude sessions behave the same as fresh ones for idle/resume
- provider session ID is stable and accurately represented

## Phase 2: Make the backend the canonical session registry

Goal:

- every device sees the same session set from the server

Tasks:

1. Change frontend bootstrap to load sessions from the backend first.
   Current:
   - [restoreFromStorage()](/C:/Users/jayte/Documents/dev/Aperture/web/src/stores/sessions/session-slice.ts#L118)

   Desired:
   - fetch `GET /v1/sessions`
   - optionally merge resumable history/endpoints if needed
   - use IndexedDB only as a fallback cache when backend is unavailable

2. Add server-owned workspace association to session records.
   Current:
   - `workspaceId` is frontend-only in [types.ts](/C:/Users/jayte/Documents/dev/Aperture/web/src/api/types.ts#L69)
   - UI relies on local persistence and `workingDirectory` prefix matching

   Desired:
   - persist `workspace_id` with each session in the backend
   - return it in session list/status APIs
   - remove frontend-only authority for workspace linkage

3. Decide whether to expose:
   - `GET /v1/sessions` for active and resumable idle sessions
   - `GET /v1/sessions/history` for historical/ended sessions
   - `GET /v1/sessions/:id` for single-session detail

4. Remove the assumption that only "resumable" sessions are globally discoverable.

Deliverable:

- session list is identical across devices
- workspace/session grouping is server-defined

Additional requirement:

- session discovery must be identical across browsers and devices connected to the host

## Phase 3: Persist canonical session history on the server

Goal:

- multi-device hydration and restart recovery become possible

Tasks:

1. Introduce a canonical persisted event model.

Suggested schema fields:

- `id`
- `session_id`
- `sequence`
- `type`
- `timestamp`
- `payload_json`
- `provider_message_id` nullable
- `tool_call_id` nullable

2. Persist user prompts when received.
   Files:
   - [routes.ts](/C:/Users/jayte/Documents/dev/Aperture/src/routes.ts#L917)

3. Persist Claude session events when emitted.
   Candidate integration points:
   - [sdk-session.ts](/C:/Users/jayte/Documents/dev/Aperture/src/sdk-session.ts#L611)
   - `emitSessionUpdate()`
   - `emitSdkMessage()`

4. Persist Pi events with the same model where practical.

5. Keep `messages` table only if it is used as a derived snapshot or for migration compatibility.

6. Backfill `/v1/sessions/:id/messages` so it returns actual persisted data.
   Current endpoint:
   - [routes.ts](/C:/Users/jayte/Documents/dev/Aperture/src/routes.ts#L305)

7. Decide whether to:
   - return normalized events
   - return server-rendered UI messages
   - or both

Recommendation:

- expose a server-rendered message history endpoint for the frontend
- keep normalized events internally for replay/reconnect

8. Add transcript import and reconciliation tasks using official SDK capabilities.

Use:

- `listSessions()`
- `getSessionMessages()`

Purposes:

- backfill existing Claude transcript history into Aperture's canonical store
- verify whether a stored `sdk_session_id` is still provider-resumable on the host
- provide a migration path while the canonical event store is being rolled out

Deliverable:

- server can reconstruct session history without any browser-local cache
- server can reconstruct session history after reconnect and restart on the host

## Phase 4: Hydrate chat from backend history, not IndexedDB

Goal:

- a second device sees the actual conversation

Tasks:

1. Replace `usePersistedUIMessages()` bootstrap behavior.
   Current:
   - [usePersistedUIMessages.ts](/C:/Users/jayte/Documents/dev/Aperture/web/src/hooks/usePersistedUIMessages.ts)

   Desired:
   - initial load from backend session history
   - optional local cache for speed
   - local cache invalidated or reconciled against server sequence/version

2. Add a session history loader hook:
   - fetches canonical messages/events from backend
   - returns sequence/version metadata

3. Only use IndexedDB for:
   - local warm cache
   - optimistic rendering before server confirms
   - unsent draft state if desired

4. Ensure `WorkspaceChatPane` does not present an empty chat merely because local IndexedDB has no `ui-messages` entry.

Deliverable:

- opening a session on a second device shows the same conversation

## Phase 5: Build event replay and reconnect semantics

Goal:

- reconnect no longer means "abort the UI stream and hope for the best"

Tasks:

1. Introduce event sequencing per session.

Each emitted server event should get:

- monotonically increasing `sequence`
- timestamp
- session ID

2. Track per-subscriber replay position.

3. Add bounded outbound buffering and slow-subscriber protection.

Requirements:

- track per-subscriber queue depth and bytes pending
- enforce caps on replay backlog and live outbound buffering
- disconnect, downgrade, or resnapshot slow subscribers instead of allowing unbounded memory growth

Reason:

- standard WebSocket APIs do not provide backpressure management for application message queues
- replay plus multiple devices plus slow clients can otherwise create unbounded memory pressure

4. Add a replay-capable websocket or SSE attach flow:

Option A:

- client connects and sends `lastSeenSequence`
- server replays missed events
- server then switches to live streaming

Option B:

- client first fetches a history snapshot
- websocket begins live at `currentSequence + 1`

Recommendation:

- implement Option B first because it is simpler
- add Option A if mid-stream reconnect recovery still needs tighter guarantees

5. Implement `reconnectToStream()` in [chat-transport.ts](/C:/Users/jayte/Documents/dev/Aperture/web/src/api/chat-transport.ts#L79) or replace the transport path so reconnection rehydrates correctly.

6. Ensure partial assistant state is recoverable:
   - either persist deltas
   - or persist completed block snapshots frequently enough

7. Review `WsToUIChunkTranslator` reset logic so replay does not duplicate or corrupt block boundaries.

Deliverable:

- socket interruption no longer permanently desynchronizes the UI
- reconnect works across device and browser boundaries on the host

## Phase 6: Replay pending permission requests to all reconnecting clients

Goal:

- permissions remain actionable after disconnects or cross-device handoff

Tasks:

1. Persist pending permission state server-side.
   Current:
   - in-memory `pendingPermissions` in [sdk-session.ts](/C:/Users/jayte/Documents/dev/Aperture/src/sdk-session.ts#L111)

2. On websocket attach:
   - replay unresolved permission requests
   - include full tool input and options
   - include correlation IDs and timestamps

3. Ensure a permission resolved on one device clears on all other devices.

4. Add sequence-based invalidation so stale permission UIs disappear deterministically.

Clay reference:

- pending permission replay in [sessions.js](/C:/Users/jayte/Documents/dev/Aperture/.scratch/clay/lib/sessions.js#L383)

Deliverable:

- permission prompts survive reconnect and cross-device handoff cleanly

## Phase 7: Remove frontend-only session connection heuristics

Goal:

- the frontend should attach intentionally, not opportunistically

Tasks:

1. Revisit global auto-connect in [Shell.tsx](/C:/Users/jayte/Documents/dev/Aperture/web/src/components/layout/Shell.tsx#L32).

Problems:

- connects top 5 sessions regardless of actual user need
- device-local ordering decides which sessions remain warm
- increases background connection churn

2. Move to explicit connection policy:
   - connect active visible session
   - optionally keep nearby visible sessions warm
   - avoid arbitrary global auto-connect limits

3. Add server-side subscriber presence if unread counts or "active session elsewhere" indicators are needed.

4. Make `WorkspaceChatPane` attach idempotently but not as the sole source of connection intent.

Deliverable:

- connection behavior becomes predictable and testable

## Phase 8: Upgrade Claude Agent SDK and validate the session model against it

Goal:

- stop building on a stale provider contract

Tasks:

1. Upgrade from `0.2.19` to a current supported SDK version.

2. Review differences in:
   - `query()`
   - resume semantics
   - file checkpointing
   - permission request payloads
   - any V2 session APIs

3. Evaluate whether to migrate from one-shot `query()` orchestration to a V2 session API.

Decision criteria:

- if V2 provides cleaner persistent session ownership, prefer it
- if V1 query remains adequate, keep the existing style but only after the server-authoritative layers are in place

4. Re-run the Clay comparison after upgrade because Clay is already operating on a newer line and may expose evolved patterns worth copying more directly.

Deliverable:

- provider integration is on a sustainable version

## Data Model Changes

Recommended backend additions:

### sessions table

Add:

- `workspace_id` nullable
- `provider_session_id` or re-use `sdk_session_id` with clearer semantics
- `restore_count`
- `last_sequence`
- `last_error`

### session_events table

New table:

- `id TEXT PRIMARY KEY`
- `session_id TEXT NOT NULL`
- `sequence INTEGER NOT NULL`
- `type TEXT NOT NULL`
- `timestamp INTEGER NOT NULL`
- `payload_json TEXT NOT NULL`
- `provider_message_id TEXT NULL`
- `tool_call_id TEXT NULL`

Indexes:

- `(session_id, sequence)`
- `(session_id, timestamp)`
- `(session_id, tool_call_id)` if permissions/tool replay needs it

### session_subscribers table or in-memory registry

In-memory is acceptable for the target deployment. Persistence is optional and only needed if subscriber analytics/debugging become important.

Fields if persisted:

- `session_id`
- `subscriber_id`
- `device_id`
- `connected_at`
- `last_seen_sequence`
- `last_heartbeat_at`

## API Changes

### Required

1. `GET /v1/sessions`
   Return active sessions with server-owned metadata including `workspaceId`.

2. `GET /v1/sessions/:id/history`
   Return canonical history for hydration.

3. `POST /v1/sessions/:id/connect`
   Keep this, but make its semantics explicit:
   - ensures backend session exists in memory
   - returns current status and replay cursor/version

### Optional but useful

4. `GET /v1/sessions/:id/subscribers`
   For debugging and admin visibility.

5. `GET /v1/sessions/:id/permissions/pending`
   If pending permissions are split from history.

6. `GET /v1/sessions/:id/events?after=<sequence>`
   For replay-based reconnect.

## Frontend Changes

### Session store

Current problem:

- session bootstrap is device-local first

Change:

- store session list from backend
- treat IndexedDB as cache only
- remove frontend-only workspace authority

### Chat pane

Current problem:

- initial hydration comes from local rendered UI cache

Change:

- hydrate from backend canonical history
- use local cache only as a stale-while-revalidate optimization

### WebSocket transport

Current problem:

- no stream reconnection support

Change:

- reconnect by replaying missed history/events
- avoid silently dropping in-progress assistant responses
- handle reconnect where the socket drops but the live provider process remains on the host

### Cross-device UX

Add:

- "live on another device" indicator if useful
- explicit reconnect/resync UI when history replay occurs

## Testing Plan

## Unit tests

Backend:

- restored Claude session stays resumable after idle
- fresh and restored Claude sessions share identical idle transition behavior
- Claude session ID is never replaced with Aperture ID after restore
- event sequence increments correctly
- pending permissions replay correctly after subscriber reconnect

Frontend:

- session bootstrap prefers backend data over IndexedDB
- chat pane hydrates from backend history
- IndexedDB cache is ignored when server history is newer
- reconnect after socket close resynchronizes history

## Integration tests

1. Device A creates session, sends prompt, device B opens same session.
   Expected:
   - same session appears on B
   - same history appears on B

2. Device A disconnects during stream, reconnects before completion.
   Expected:
   - stream or resulting message is recovered

3. Device A receives permission request, device B opens same session.
   Expected:
   - B sees pending permission
   - response from either device resolves the request for both

4. Server restarts with resumable Claude session.
   Expected:
   - session appears in global session list
   - connect restores correctly
   - history is present

5. Restored session idles, then reconnect attempted later.
   Expected:
   - still resumable unless explicitly ended

## Manual validation matrix

- one browser, one device
- two tabs, same browser
- two browsers, same machine
- two different devices
- network drop mid-stream
- backend restart
- permission prompt during disconnect
- workspace-backed session visibility across devices

## Recommended Implementation Order

1. Phase 1: lifecycle consistency for Claude restore/idle/session ID
2. Phase 2: server-authoritative session list and workspace association
3. Phase 3: server-side event/message persistence
4. Phase 4: frontend hydration from backend history
5. Phase 6: pending permission replay
6. Phase 5: replay-based reconnect for streaming
7. Phase 7: remove frontend auto-connect heuristics
8. Phase 8: SDK upgrade and revalidation

Reason for this order:

- it fixes correctness before UX polish
- it establishes a canonical data source before reconnect complexity
- it avoids designing replay on top of browser-local history

## Non-Goals For The First Repair Pass

These should not block the initial repair:

- shared collaborative editing semantics
- per-subscriber fine-grained read cursors for all history views
- complete migration to Claude SDK V2 if V1 can be stabilized first

## Definition Of Done

The work is complete when all of the following are true:

1. A session created on device A is discoverable on device B without relying on local browser storage.
2. Device B can load the same canonical conversation history from the server.
3. Claude session restore works after server restart and after idle transitions.
4. WebSocket disconnects do not permanently desynchronize the UI from the live session.
5. Pending permission requests survive reconnect and can be resolved from any attached device.
6. Workspace/session association is server-owned and consistent across devices.
7. Browser IndexedDB is no longer required as the primary source of truth for sessions or messages.

## Immediate Next Step

Start with a narrow foundational change set:

1. Fix restored Claude idle handling to preserve resumability.
2. Stop aliasing `sdkSessionId` to the Aperture session ID during `start()`.
3. Add server-owned `workspaceId` to session records and APIs.
4. Implement canonical server message/event persistence.
5. Switch `WorkspaceChatPane` hydration to backend history.

That sequence removes the biggest architectural blockers before attempting full replayable reconnect support.
