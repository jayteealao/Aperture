# Claude File Checkpointing + Changed Files UI Plan

## Purpose

Add a `t3code`-style changed-files summary and diff viewer to Aperture sessions, using:

- Anthropic Agent SDK file checkpointing as the provider-level rewind primitive
- Aperture's per-session checkout model as the file-system isolation boundary
- Aperture's backend message persistence as the canonical source of UI state
- A message-attached changed-files card under assistant responses, with a file tree and diff viewer

This plan is intentionally designed for Aperture's current architecture. It does not attempt to copy `t3code`'s orchestration system wholesale.

## Reference Inputs

### Official Anthropic file checkpointing guidance

Reference:
- <https://platform.claude.com/docs/en/agent-sdk/file-checkpointing>

Important constraints from the official docs:

1. File checkpointing only tracks changes made through `Write`, `Edit`, and `NotebookEdit`.
   - Bash-driven edits are not included.
2. Checkpoints are exposed as user-message UUIDs.
   - To receive them in the stream, SDK options must include:
     - `enableFileCheckpointing: true`
     - `extraArgs: { "replay-user-messages": null }`
3. Rewinding restores files on disk only.
   - It does not rewind the conversation.
4. Rewinding later requires:
   - capturing `session_id`
   - resuming the session
   - calling `rewindFiles(checkpointId)` on that resumed session

### `t3code` implementation reference

Primary files:
- [.scratch/t3code/apps/web/src/components/chat/MessagesTimeline.tsx](/C:/Users/jayte/Documents/dev/Aperture/.scratch/t3code/apps/web/src/components/chat/MessagesTimeline.tsx)
- [.scratch/t3code/apps/web/src/components/chat/ChangedFilesTree.tsx](/C:/Users/jayte/Documents/dev/Aperture/.scratch/t3code/apps/web/src/components/chat/ChangedFilesTree.tsx)
- [.scratch/t3code/apps/web/src/components/DiffPanel.tsx](/C:/Users/jayte/Documents/dev/Aperture/.scratch/t3code/apps/web/src/components/DiffPanel.tsx)
- [.scratch/t3code/apps/web/src/lib/turnDiffTree.ts](/C:/Users/jayte/Documents/dev/Aperture/.scratch/t3code/apps/web/src/lib/turnDiffTree.ts)
- [.scratch/t3code/apps/web/src/types.ts](/C:/Users/jayte/Documents/dev/Aperture/.scratch/t3code/apps/web/src/types.ts)
- [.scratch/t3code/apps/server/src/checkpointing/Diffs.ts](/C:/Users/jayte/Documents/dev/Aperture/.scratch/t3code/apps/server/src/checkpointing/Diffs.ts)

What `t3code` is doing conceptually:

1. The backend computes a diff for a completed turn.
2. It parses the unified patch into per-file summaries.
3. It persists a `TurnDiffSummary` linked to the assistant message for that turn.
4. The frontend renders a changed-files card directly under that assistant message.
5. The full patch is fetched on demand and rendered in a dedicated diff viewer.

That overall shape is correct for Aperture too.

## Why This Fits Aperture

Aperture already has the core ingredients:

- Per-session checkout isolation in [src/sessionManager.ts](/C:/Users/jayte/Documents/dev/Aperture/src/sessionManager.ts)
- Canonical persisted messages in [src/database.ts](/C:/Users/jayte/Documents/dev/Aperture/src/database.ts)
- Assistant message persistence in [src/sdk-session.ts](/C:/Users/jayte/Documents/dev/Aperture/src/sdk-session.ts)
- Message-local chat rendering in [web/src/components/chat/ApertureMessage.tsx](/C:/Users/jayte/Documents/dev/Aperture/web/src/components/chat/ApertureMessage.tsx)
- Conversation-level rendering in [web/src/components/session/WorkspaceChatPane.tsx](/C:/Users/jayte/Documents/dev/Aperture/web/src/components/session/WorkspaceChatPane.tsx)

The missing layer is a persisted turn-diff summary model and a UI that attaches those summaries to assistant messages.

## Product Goals

After each assistant turn that edits files, the chat should show:

- `Changed files (N)` under the assistant response
- total additions and deletions
- a collapsible file tree
- click-to-open full diff viewer
- optional future action: rewind files to the checkpoint before that turn

This must work:

- for current sessions
- after refresh
- after reconnect
- after server restart
- on desktop and mobile

## Non-Goals

This first implementation does not need:

- full `t3code`-style orchestration events
- multi-turn checkpoint timelines
- branch history UI
- git commit creation
- rewinding Bash-only edits
- cross-session or cross-workspace rewind

## Core Design

### Source of truth split

Use two layers, each for a different responsibility:

1. Anthropic file checkpointing
   - source of truth for provider-managed rewind points
   - only valid for SDK-tracked edit tools

2. Git diff against the session checkout
   - source of truth for the changed-files summary and diff viewer
   - captures all repo changes visible in the working tree, including Bash-driven edits

This split is necessary because the Anthropic docs explicitly say checkpointing does not track Bash edits, but users will still expect the changed-files UI to show the actual repo delta after a turn.

### Turn boundary model

Define a turn in Aperture as:

- one user prompt
- followed by one assistant completion

For each turn:

1. Capture a git baseline at prompt start.
2. Capture the checkpoint UUID for the replayed user message, if provided by the SDK.
3. When the assistant finishes, compute the git diff for the session checkout.
4. Persist a summary linked to the assistant message ID.

This gives Aperture both:

- a provider rewind checkpoint
- a repo-level visual diff summary

## Data Model

### New table: `turn_diff_summaries`

Add a new table, roughly:

```sql
CREATE TABLE turn_diff_summaries (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  user_message_id TEXT,
  assistant_message_id TEXT NOT NULL,
  checkpoint_id TEXT,
  provider_session_id TEXT,
  working_directory TEXT NOT NULL,
  turn_started_at INTEGER NOT NULL,
  turn_completed_at INTEGER NOT NULL,
  git_base_head TEXT,
  git_head_at_completion TEXT,
  file_count INTEGER NOT NULL DEFAULT 0,
  additions INTEGER NOT NULL DEFAULT 0,
  deletions INTEGER NOT NULL DEFAULT 0,
  files_json TEXT NOT NULL,
  metadata TEXT,
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
);
```

Recommended indexes:

- `idx_turn_diff_summaries_session_id`
- `idx_turn_diff_summaries_assistant_message_id`
- `idx_turn_diff_summaries_user_message_id`

### New table: `turn_diff_patches`

For first release, patch text can be computed on demand. If performance or repeat access becomes an issue, add:

```sql
CREATE TABLE turn_diff_patches (
  turn_diff_summary_id TEXT PRIMARY KEY,
  patch_text TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (turn_diff_summary_id) REFERENCES turn_diff_summaries(id) ON DELETE CASCADE
);
```

Recommendation:

- do not add this table initially
- compute patch text on demand from the session checkout
- only persist patch text later if measurement says it is needed

### Type additions

Backend:

- `TurnDiffFileSummary`
- `TurnDiffSummaryRecord`
- `TurnDiffSummaryResponse`

Frontend:

- `TurnDiffFileSummary`
- `TurnDiffSummary`
- `TurnDiffSummaryByAssistantMessageId`

## Backend Implementation

### 1. Enable Anthropic file checkpointing correctly

Target file:
- [src/sdk-session.ts](/C:/Users/jayte/Documents/dev/Aperture/src/sdk-session.ts)

Required changes:

1. Ensure runtime options include:
   - `enableFileCheckpointing: true`
   - `extraArgs: { "replay-user-messages": null }`
2. Confirm this is applied for both:
   - worker runtime
   - in-process runtime
3. Confirm `user` messages from the SDK stream carry `uuid`.
4. Persist the relevant checkpoint UUID for each prompt turn.

Implementation note:

The current code stores message UUIDs in `this.messageUuids`, but it does not currently model a turn checkpoint summary. That needs to be added.

### 2. Add explicit turn lifecycle tracking in `SdkSession`

Target file:
- [src/sdk-session.ts](/C:/Users/jayte/Documents/dev/Aperture/src/sdk-session.ts)

Add a per-turn state object, conceptually:

```ts
interface ActiveTurnState {
  userMessageId: string;
  userPromptText: string;
  checkpointId: string | null;
  providerSessionId: string | null;
  workingDirectory: string;
  startedAt: number;
  gitBaseHead: string | null;
  gitBaseDiffHash: string | null;
}
```

Flow:

1. Before sending a prompt:
   - persist user message
   - capture git baseline
   - initialize `ActiveTurnState`

2. While processing stream:
   - when SDK replays the `user` message with `uuid`, store it as `checkpointId`

3. When assistant message completes:
   - compute git diff
   - parse per-file summary
   - persist `turn_diff_summary`
   - clear active turn state

4. If prompt errors or aborts:
   - decide whether to persist partial summary or none

Recommendation:

- do not persist a turn summary on user abort unless files actually changed
- if files changed before abort, still persist the summary and mark `metadata.partial = true`

### 3. Add git diff utilities

Add new backend module:
- `src/git-diff.ts`

Responsibilities:

- resolve repo state for a session checkout
- compute a stable baseline at prompt start
- compute the unified patch for a completed turn
- parse file summaries from patch text

Recommended exported functions:

```ts
getRepoBaseline(cwd: string): Promise<RepoBaseline>
getTurnUnifiedDiff(cwd: string, baseline: RepoBaseline): Promise<string>
parseTurnDiffFilesFromUnifiedDiff(diff: string): TurnDiffFileSummary[]
summarizeTurnDiffFiles(files: TurnDiffFileSummary[]): { additions: number; deletions: number; fileCount: number }
```

`RepoBaseline` should include:

- `headSha: string | null`
- `statusPorcelain: string`
- enough information to generate a turn diff later

Recommended implementation strategy for V1:

1. At turn start:
   - capture `git rev-parse HEAD`
   - capture `git status --porcelain=v1 --untracked-files=all`

2. At turn completion:
   - use `git diff --no-ext-diff --binary HEAD -- .`
   - if HEAD does not exist, diff against the empty tree
   - if baseline status was already dirty, compute a diff for "changes since turn start", not just "changes since HEAD"

Important caution:

If the repo is already dirty at turn start, `git diff HEAD` is not enough. Aperture must not attribute pre-existing changes to the assistant turn.

For that reason, V1 should capture a temp patch baseline:

- record a snapshot of file content hashes for tracked and changed files at turn start
- or write a temp patch snapshot file at turn start

Recommendation:

- V1 should implement a dedicated baseline snapshot in `.aperture/session-state/<session-id>/turns/<turn-id>/`
- do not rely only on `HEAD`

### 4. Parse unified patches

Use the same conceptual parser pattern as `t3code`:
- [.scratch/t3code/apps/server/src/checkpointing/Diffs.ts](/C:/Users/jayte/Documents/dev/Aperture/.scratch/t3code/apps/server/src/checkpointing/Diffs.ts)

Recommendation:

- use `@pierre/diffs` in Aperture too for patch parsing
- keep the summary shape simple:
  - `path`
  - `additions`
  - `deletions`
  - optional `changeType`

### 5. Database methods

Target file:
- [src/database.ts](/C:/Users/jayte/Documents/dev/Aperture/src/database.ts)

Add methods:

- `saveTurnDiffSummary(record)`
- `getTurnDiffSummaryByAssistantMessageId(sessionId, assistantMessageId)`
- `getTurnDiffSummariesForSession(sessionId)`
- `getTurnDiffSummaryById(id)`

If patch persistence is later added:

- `saveTurnDiffPatch(...)`
- `getTurnDiffPatch(...)`

### 6. HTTP routes

Target file:
- [src/routes.ts](/C:/Users/jayte/Documents/dev/Aperture/src/routes.ts)

Add routes:

1. `GET /v1/sessions/:id/turn-diffs`
   - returns all summaries for the session

2. `GET /v1/sessions/:id/turn-diffs/:assistantMessageId`
   - returns the summary for one assistant message

3. `GET /v1/sessions/:id/turn-diffs/:assistantMessageId/patch`
   - returns full unified patch text
   - optional query param: `path`

4. Future route:
   - `POST /v1/sessions/:id/turn-diffs/:assistantMessageId/rewind`
   - only if/when rewind UI is implemented

### 7. Rewind support

The Anthropic docs support rewinding by:

- resuming the provider session
- calling `rewindFiles(checkpointId)`

For Aperture, this should be a second-phase feature, not part of the initial changed-files card.

If implemented later:

1. Only enable rewind for sessions that are still provider-resumable.
2. Only advertise it when a `checkpointId` exists.
3. Label it clearly:
   - rewinds SDK-tracked file edits only
   - does not rewind the conversation
   - may not capture Bash-based file mutations

## Frontend Implementation

### 1. API client support

Target file:
- [web/src/api/client.ts](/C:/Users/jayte/Documents/dev/Aperture/web/src/api/client.ts)

Add:

- `listTurnDiffSummaries(sessionId)`
- `getTurnDiffSummary(sessionId, assistantMessageId)`
- `getTurnDiffPatch(sessionId, assistantMessageId, filePath?)`

### 2. Session-level loading

Target file:
- [web/src/components/session/WorkspaceChatPane.tsx](/C:/Users/jayte/Documents/dev/Aperture/web/src/components/session/WorkspaceChatPane.tsx)

Add:

- load turn diff summaries alongside messages
- build:

```ts
Map<assistantMessageId, TurnDiffSummary>
```

- pass the relevant summary into `ApertureMessage`

Recommendation:

- keep this data parallel to messages
- do not mutate stored `ApertureUIMessage` shape for this feature

### 3. Message-attached changed-files card

Target file:
- [web/src/components/chat/ApertureMessage.tsx](/C:/Users/jayte/Documents/dev/Aperture/web/src/components/chat/ApertureMessage.tsx)

Render, for assistant messages only:

- changed-files summary card under the assistant content
- additions/deletions stats
- `Expand all` / `Collapse all`
- `View diff`

This should visually mirror the `t3code` experience in:
- [.scratch/t3code/apps/web/src/components/chat/MessagesTimeline.tsx](/C:/Users/jayte/Documents/dev/Aperture/.scratch/t3code/apps/web/src/components/chat/MessagesTimeline.tsx)

### 4. File tree component

New files:

- `web/src/components/chat/ChangedFilesTree.tsx`
- `web/src/lib/turnDiffTree.ts`

Features:

- compact directory/file tree
- per-file additions/deletions
- expandable folders
- file click opens diff panel focused on that path

Reuse the `t3code` tree-shaping idea:
- flat file summaries in
- nested tree out

### 5. Diff panel

New file:
- `web/src/components/chat/TurnDiffPanel.tsx`

Responsibilities:

- fetch patch text on demand
- show entire turn diff
- optionally focus one file
- render raw patch or parsed visual diff

Recommendation:

- V1 can be a side sheet or dialog
- do not make it route-driven initially

Recommended renderer options:

1. Reuse `@pierre/diffs`
2. Or start with raw diff rendering in `CodeHighlight` using `diff`

Recommendation:

- use parsed diff UI from the start if feasible
- raw diff fallback is acceptable if parser fails

### 6. Mobile behavior

The changed-files card must fit the current mobile chat layout:

- card clamps to viewport width
- tree rows truncate long paths safely
- stats stay on one line where possible
- diff panel should be full-screen modal on mobile

## UX Details

### Summary card copy

Recommended header:

- `Changed files (4)`

Recommended stats:

- `+120 -34`

Recommended buttons:

- `Expand all`
- `Collapse all`
- `View diff`

### File row interactions

Single tap:

- open diff panel focused on that file

Secondary action:

- expand/collapse folders

### Rewind copy

If rewind is later added, do not label it just `Rewind`.

Use:

- `Restore files to before this turn`

And warning text:

- restores tracked SDK edit-tool changes to disk
- does not rewind the conversation
- may not include Bash-only edits

## Edge Cases

### 1. No git repository

Possible for:

- non-repo sessions
- broken clones

Behavior:

- no changed-files card
- backend route returns empty summary
- do not show diff UI

### 2. Dirty repo before prompt start

This is the highest-risk correctness problem.

Required behavior:

- do not attribute pre-existing modifications to the current assistant turn

That is why the plan requires an explicit per-turn baseline snapshot.

### 3. Bash edits not covered by Anthropic rewind

Official doc limitation:
- SDK checkpointing only tracks `Write`, `Edit`, `NotebookEdit`

Behavior:

- changed-files summary still includes Bash-driven file changes if git diff sees them
- rewind UI must not promise those changes can be reverted with `rewindFiles()`

### 4. Assistant turn with no file changes

Behavior:

- do not render changed-files card

### 5. Partial turn or interrupted turn

Behavior:

- if files changed before interruption, persist summary with `metadata.partial = true`
- UI can optionally show `Partial changes`

### 6. Session restored after server restart

Because Aperture persists summaries in the DB:

- changed-files cards continue to render after restart
- no dependency on in-memory render state

## Proposed Phases

### Phase 1: Summary-only backend pipeline

Deliver:

- DB schema
- turn lifecycle tracking
- git baseline snapshot
- patch parsing
- summary persistence
- summary API

No frontend UI yet beyond debugging route output.

Acceptance:

- completed edit turns produce persisted summaries
- dirty-at-start repos are handled correctly
- no false positives for unchanged turns

### Phase 2: Inline changed-files card

Deliver:

- session summary loading
- changed-files card under assistant messages
- file tree UI

Acceptance:

- summaries show under the correct assistant messages
- cards survive refresh and reconnect
- mobile layout remains stable

### Phase 3: Diff viewer

Deliver:

- patch route
- diff panel
- file-focused diff view

Acceptance:

- `View diff` opens correct patch
- selecting a file focuses that file in the diff

### Phase 4: Provider rewind integration

Deliver:

- checkpoint-aware rewind action
- session resume + `rewindFiles(checkpointId)`

Acceptance:

- files restore correctly for SDK-tracked edit-tool changes
- conversation history remains intact
- UI messaging clearly explains limitations

## Testing Plan

### Backend tests

Add tests for:

1. Prompt turn with no edits
   - no summary saved

2. Prompt turn with `Write`/`Edit`
   - summary saved
   - additions/deletions correct

3. Prompt turn with Bash edit
   - git diff summary includes file
   - checkpoint metadata still exists or is absent as expected

4. Dirty repo before prompt
   - summary excludes pre-existing changes

5. Interrupted prompt after file edits
   - partial summary saved

6. Resume/restart
   - summary still available after session restore

### Frontend tests

Add tests for:

1. Assistant message with summary
   - changed-files card renders

2. File tree
   - folders expand and collapse
   - file click opens diff panel

3. No-summary message
   - no card renders

4. Mobile rendering
   - no overflow
   - diff panel fits viewport

### Browser verification

Use the `dev-browser` skill after implementation to prove:

1. Start a workspace-backed Claude session.
2. Ask the agent to edit multiple files.
3. Confirm the final assistant message shows `Changed files (N)`.
4. Expand the file tree.
5. Open `View diff`.
6. Refresh the page.
7. Confirm the same card still appears.
8. Restart the backend.
9. Confirm the same card still appears.
10. If rewind is enabled later:
   - restore files to before the turn
   - confirm file contents changed on disk

## Concrete Aperture File Checklist

Backend:

- [src/sdk-session.ts](/C:/Users/jayte/Documents/dev/Aperture/src/sdk-session.ts)
- [src/database.ts](/C:/Users/jayte/Documents/dev/Aperture/src/database.ts)
- [src/routes.ts](/C:/Users/jayte/Documents/dev/Aperture/src/routes.ts)
- `src/git-diff.ts`
- `src/turn-diffs.ts`
- new migration file for `turn_diff_summaries`

Frontend:

- [web/src/api/client.ts](/C:/Users/jayte/Documents/dev/Aperture/web/src/api/client.ts)
- [web/src/components/session/WorkspaceChatPane.tsx](/C:/Users/jayte/Documents/dev/Aperture/web/src/components/session/WorkspaceChatPane.tsx)
- [web/src/components/chat/ApertureMessage.tsx](/C:/Users/jayte/Documents/dev/Aperture/web/src/components/chat/ApertureMessage.tsx)
- `web/src/components/chat/ChangedFilesTree.tsx`
- `web/src/components/chat/TurnDiffCard.tsx`
- `web/src/components/chat/TurnDiffPanel.tsx`
- `web/src/lib/turnDiffTree.ts`

## Recommended First Implementation Slice

Start with this narrow vertical slice:

1. Persist one `turn_diff_summary` per assistant completion.
2. Populate:
   - assistant message ID
   - session ID
   - checkpoint ID
   - changed files list
   - additions/deletions
3. Render a simple changed-files card under the assistant message.
4. Add `View diff` with a raw patch modal.

Do not start with rewind.

That gives Aperture the visible `t3code` feature quickly, while building on the official Anthropic checkpoint model correctly instead of overloading it.

## Final Recommendation

Implement this feature as:

- git-diff summaries for visual change reporting
- Anthropic file checkpoints for later rewind support

Do not try to use Anthropic checkpointing alone as the changed-files data source, because the official docs explicitly exclude Bash-based edits. Aperture needs both layers if the UI is going to match user expectations.
