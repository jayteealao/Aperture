## Claude SDK unstable_v2 Migration Plan

### Goal

Move Aperture's Claude runtime from `query(...)` to the SDK's `unstable_v2_createSession`, `unstable_v2_resumeSession`, and `unstable_v2_prompt` APIs without breaking:

- backend-owned session persistence
- server-side session discovery
- reconnect and multi-tab/browser convergence
- legacy workspace session visibility
- existing websocket message semantics used by the web app

### Current Constraints

- Aperture's current runtime is query-centric in `src/sdk-session.ts`.
- The V2 preview API only guarantees:
  - `unstable_v2_createSession(options)`
  - `unstable_v2_resumeSession(sessionId, options)`
  - `session.send(message)`
  - `session.stream()`
  - `session.close()`
- The official V2 preview explicitly does not provide some V1 features such as session forking.
- Aperture currently exposes additional capabilities through `SdkSession`, routes, and websocket RPCs:
  - interrupting a running prompt
  - reading supported models / commands / account / MCP status
  - rewinding file checkpoints
  - dynamic MCP server updates
  - live config changes

### Migration Strategy

Treat V2 as the conversation runtime, not the entire control plane.

1. Keep `SdkSession` as the app-facing abstraction.
2. Replace its primary prompt/send/stream/resume path with V2 sessions.
3. Preserve the existing websocket/session-update contract.
4. Keep backend persistence canonical.
5. Where V2 lacks a control surface, preserve behavior through:
   - cached state from previous turns
   - config updates applied to future turns
   - limited V1 compatibility helpers where safe
   - explicit "unsupported in V2" errors where there is no safe equivalent

### File-Level Work

#### `src/sdk-session.ts`

- Replace `currentQuery` as the primary runtime with:
  - a persistent V2 session object
  - current stream state for the active turn
- Create/update runtime session in `start()`:
  - create a new V2 session when there is no stored Claude session id
  - resume a V2 session when `sdkConfig.resume` or persisted `sdkSessionId` exists
- Persist the Claude session id immediately from the V2 session object.
- Rework `sendPrompt()` to:
  - build the same user payloads as today
  - call `session.send(...)`
  - iterate `session.stream()`
  - emit the same translated websocket/session-update messages as before
- Keep assistant message persistence and event logging intact.
- Preserve pending permission handling through the same `canUseTool` callback in session options.
- Rework `interrupt()` to cancel the current turn by closing the V2 runtime session and rehydrating it from `sdkSessionId`.
- Preserve config mutation methods by updating local config and rebuilding/resuming the runtime session when necessary.
- For info methods:
  - return cached values when available
  - use a compatibility helper only when needed
- For V1-only features:
  - `rewindFiles()` remains compatibility-only
  - `forkSession` / `resumeSessionAt` become unsupported in V2 mode

#### `src/sessionManager.ts`

- Keep session creation and restore flows stable.
- Ensure restored sessions create/resume a V2 runtime immediately.
- Keep restored and fresh sessions symmetric:
  - idle sessions stay resumable
  - restore failure is surfaced without destroying the Aperture session record

#### `src/routes.ts`

- Preserve the public session API shape.
- Keep websocket message handling stable.
- For endpoints that no longer have a true V2 backing:
  - return cached results where valid
  - return explicit, typed errors where unsupported
- Make sure session connect/restore still uses server state as the source of truth.

#### `src/agents/sdk-types.ts`

- Keep existing config types but document/encode V2 limitations:
  - `forkSession`
  - `resumeSessionAt`
- Avoid breaking frontend compile-time expectations.

#### `web/*`

- Only touch the web app if the backend intentionally marks certain controls unsupported.
- If needed, show "Not supported on V2 sessions" for features with no safe replacement instead of leaving panels spinning or broken.

### Verification Plan

#### Static

- `pnpm type-check`
- `pnpm build`
- `pnpm --filter aperture-web type-check`
- `pnpm --filter aperture-web build`

#### Backend Runtime

Run the backend under Node 22 while `better-sqlite3` remains ABI-bound there.

Verify:

- session creation
- session restore
- prompt streaming
- idle session rediscovery
- reconnect without duplicate messages
- permission request replay
- interrupt recovery

#### Browser Verification With `dev-browser`

Use the `dev-browser` skill scripts from `.agents/skills/dev-browser`.

Scenarios:

1. Open `http://localhost:3000`.
2. Authenticate against `http://localhost:8080`.
3. Open the known legacy workspace and confirm old sessions still render.
4. Create a new Claude session.
5. Send a prompt and confirm streamed output appears.
6. Refresh the workspace route and confirm the same session/history still appears.
7. Open a second page/context and confirm history convergence.
8. Trigger a permission request and confirm the request is replayed correctly.
9. Interrupt a running prompt and confirm the session remains usable afterward.
10. Leave the session idle and reconnect to confirm it remains resumable.

Artifacts:

- AI snapshots for each major step
- screenshots of:
  - workspace session list
  - active chat after first prompt
  - same session after refresh
  - multi-page convergence
  - post-interrupt recovery

### Acceptance Criteria

- The main Claude chat flow runs on unstable V2 session APIs.
- Aperture session ids and Claude session ids remain distinct.
- Session persistence and hydration remain backend-owned.
- Legacy workspace sessions still appear.
- Multi-tab/browser state remains consistent on the same host.
- No black-screen or missing-session regressions.
- Unsupported V1-only controls fail explicitly instead of silently breaking.
