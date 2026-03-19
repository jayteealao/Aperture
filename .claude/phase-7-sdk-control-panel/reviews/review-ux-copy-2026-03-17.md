---
command: /review:ux-copy
session_slug: phase-7-sdk-control-panel
scope: diff
target: HEAD~1
completed: 2026-03-17
---

# UX Copy Review

**Scope:** Phase 7 — shared PanelSection (Radix Collapsible), SdkControlPanel accordion replacement, SdkCheckpoints ai-elements Checkpoint integration, PiControlPanel accordion replacement. Files reviewed: `web/src/components/ui/PanelSection.tsx`, `web/src/components/sdk/SdkControlPanel.tsx`, `web/src/components/sdk/SdkCheckpoints.tsx`, `web/src/components/pi/PiControlPanel.tsx`.
**Reviewer:** Claude UX Copy Review Agent
**Date:** 2026-03-17

## Summary

This is a developer-facing control panel refactor targeting users who are actively running or monitoring SDK/Pi sessions. The overall copy quality is solid for the target audience: most section labels are clear, empty states carry helpful guidance, and the new PanelSection component adds no user-facing text itself. The primary issues are concentrated in the Pi Streaming section (jargon-heavy button labels and placeholder text — "Steer", "Queue", "Fork", "Compact" — that are meaningful to Pi SDK insiders but opaque to any developer landing here without documentation), an undiscoverable affordance in the checkpoint list (no tooltip on the Eye button in the deleted-then-reimplemented previous version, now fixed — but the `CheckpointTrigger` tooltip text is minimal), and two low-grade footer strings that expose internal architecture names as status labels.

No blame language, no accusatory errors, and no technically alarming messages were introduced. The error path in `SdkCheckpoints` simply passes `rewindResult.error` through verbatim, which is an existing pattern; it was not made worse by this change but remains a raw passthrough.

**Severity Breakdown:**
- BLOCKER: 0
- HIGH: 0
- MED: 3
- LOW: 4
- NIT: 2

**Merge Recommendation:** APPROVE_WITH_COMMENTS

---

## Copy Quality Scores

| Dimension | Score | Notes |
|-----------|-------|-------|
| Clarity | 7/10 | Section headings are clear; Pi streaming button labels are jargon-heavy |
| Consistency | 8/10 | Panel headers, section titles, and empty states are consistent across SDK and Pi panels |
| Actionability | 7/10 | Empty states guide users; rewind preview surface is actionable; checkpoint list offers only icon-only actions |
| Tone/Voice | 9/10 | Neutral, professional, no blame language |
| Helpfulness | 6/10 | "Forkable", "Steer", "Queue", "Compact" receive no in-UI explanation |

**Overall UX Copy Score:** 7/10

---

## Findings

### Finding 1: "Steer", "Queue", "Fork", "Compact" — jargon buttons without labels or explanation [MED]

**Confidence:** High

**Location:** `web/src/components/pi/PiControlPanel.tsx:260`, `:272`, `:214`, `:199`, `:390`

**Current Copy:**
> Button labels: "Steer", "Queue", "Compact", "Cycle Model", "Fork"
> Placeholders: "Steer (interrupt)...", "Follow-up (queue)..."

**Issue:**
"Steer" and "Queue" are Pi SDK API concepts not self-evident from the label. "Compact" performs a context-compression operation — it is not "compress", "summarize", "trim", or any natural English word for this. "Fork" on a message entry is similarly non-obvious. These are developer-tool labels, but even developers unfamiliar with Pi's API will not know what happens when they click. "Cycle Model" is marginally clearer but still action-verb-ambiguous (it cycles through what options?).

**User Impact:**
- Confusion: A developer first using the Pi panel must trial-click to discover what "Steer" vs "Queue" vs "Follow-up" actually does.
- Frustration: No tooltip, no help text, no placeholder describing outcome.
- Blocked action: Users may avoid clicking buttons whose effect is unclear, especially destructive-looking ones.

**Suggested Copy:**

| Current | Suggested | Notes |
|---------|-----------|-------|
| `Steer` | `Steer (interrupt)` or add `title="Interrupt the model mid-stream"` | The placeholder already says "(interrupt)" — surface it on the button or as a tooltip |
| `Queue` | `Queue` + `title="Send after model finishes"` | The placeholder says "(queue)" — promote to tooltip |
| `Compact` | `Compact` + `title="Summarize context to free up token space"` | Users need one sentence to know this is a context-management action |
| `Cycle Model` | `Next Model` or keep with `title="Rotate to the next available Pi model"` | "Cycle" is understood by developers; a tooltip would still help |
| `Fork` | `Fork` + `title="Start a new session branching from this message"` | Minimal tooltip anchors the metaphor |

**Rationale:**
For developer tools it is acceptable to use technical vocabulary. The fix is not renaming every button but adding `title` / tooltip attributes so that hovering immediately explains intent. The placeholders already contain the explanation for Steer/Queue — surfacing this as tooltip text costs nothing.

---

### Finding 2: "Forkable" as a section heading is unexplained jargon [MED]

**Confidence:** High

**Location:** `web/src/components/pi/PiControlPanel.tsx:155`

**Current Copy:**
> Section title: "Forkable"

**Issue:**
"Forkable" is an adjective used as a noun heading, and it is a Pi-specific concept. A developer who is not already familiar with Pi's API will not understand what this section contains or why some messages are "forkable" and others are not. The empty state ("No forkable messages yet.") compounds this — it tells the user they have no items without explaining what an item would be.

**User Impact:**
- Confusion: User opens the section and sees a list of truncated message strings with a "Fork" button, but no explanation of what forking does.
- Blocked action: Users who do not understand the section may ignore it entirely, missing a key Pi capability.

**Suggested Copy:**
> Section heading: "Branch Points" or "Forkable Messages"
> Empty state: "No branch points yet. Messages that can be forked will appear here."

Or keep "Forkable" (it is an internal convention) but add a section-level description line or tooltip on the heading.

**Rationale:**
"Forkable Messages" is more complete than "Forkable" and costs one extra word. The empty state should describe what the section is for rather than echo the heading.

---

### Finding 3: Checkpoint list row — identifier display is hard to parse [MED]

**Confidence:** Med

**Location:** `web/src/components/sdk/SdkCheckpoints.tsx:141–143`

**Current Copy:**
> `#{checkpoints.length - index} — {checkpoint.slice(0, 12)}...`
> Example rendered: `#3 — a1b2c3d4e5f6...`

**Issue:**
The em-dash separator between a sequential number and a truncated SHA is a compact format that mixes two different identifier schemes without explaining either. The counter `#3` counts down (newest first) which can be disorienting. The 12-char hash truncated with `...` is not useful as a human identifier since the user cannot do anything with it directly. The `CheckpointIcon` renders a BookmarkIcon with no accessible label.

**User Impact:**
- Confusion: Users cannot distinguish checkpoints by meaningful labels (e.g., timestamp, message content) — only by a positional counter and a raw hash.
- Frustration: When deciding which checkpoint to rewind to, users have no contextual info (when it was created, what message triggered it).

**Suggested Copy:**
> `Checkpoint #{checkpoints.length - index}` with hash as secondary detail, or if a timestamp is available, show it instead of the raw hash.
> For the icon: add `aria-label="Checkpoint"` to `CheckpointIcon` for accessibility.

**Rationale:**
This is a medium rather than high issue because the tool is developer-facing and the sequential number is a reasonable shorthand. But a timestamp or message-content preview would make checkpoint selection meaningfully easier.

---

### Finding 4: Footer strings expose internal architecture naming [LOW]

**Confidence:** High

**Location:** `web/src/components/sdk/SdkControlPanel.tsx:164`, `web/src/components/pi/PiControlPanel.tsx:168`

**Current Copy:**
> "Claude SDK Session"
> "Pi SDK Session"

**Issue:**
These footer labels are purely technical implementation identifiers. They communicate what type of session is loaded using internal code naming ("SDK Session", "Pi SDK Session") that reflects the architecture rather than user-meaningful context. A user already knows they are in a session — these strings add no actionable information.

**User Impact:**
- Minor confusion: "What is a Pi SDK Session vs a Claude SDK Session?" A user might wonder if these names have a significance they are missing.
- Wasted UI space for non-informative text.

**Suggested Copy:**
> Remove entirely, or replace with something meaningful such as "Session active" / "Connected" (with a status dot), or a session ID the user might want to reference.

**Rationale:**
Footer status text should confirm a state the user cares about (connection status, session ID for support reference) rather than echo the component type.

---

### Finding 5: Empty state for "Checkpoints" — "Enable file checkpointing to rewind changes" is instruction without a path [LOW]

**Confidence:** High

**Location:** `web/src/components/sdk/SdkCheckpoints.tsx:46`

**Current Copy:**
> "Enable file checkpointing to rewind changes"

**Issue:**
This instruction tells the user what to do but provides no mechanism for doing it. There is no link, no setting reference, no config key shown. It is a dead-end call to action.

**User Impact:**
- Frustration: User reads the instruction and has no idea where to go to enable checkpointing.
- Blocked action: User cannot self-serve this; may need to search documentation or give up.

**Suggested Copy:**
> "File checkpointing is disabled. Enable it in your session configuration."

Or, if there is a config section in the same panel (there is — "Configuration"):
> "File checkpointing is off. Enable it in the Configuration section above."

**Rationale:**
Cross-referencing the adjacent Configuration section turns a dead-end instruction into an actionable one without adding a new link or routing surface.

---

### Finding 6: "No stats yet. Send a message to begin." — good; minor tone note [LOW]

**Confidence:** Low

**Location:** `web/src/components/pi/PiControlPanel.tsx:318`

**Current Copy:**
> "No stats yet. Send a message to begin."

**Issue:**
This is actually good empty-state copy — it explains the state and gives a clear next action. The minor note is that "to begin" is slightly passive; the imperative alone is sufficient.

**Suggested Copy:**
> "No stats yet — send a message to start tracking."

Or leave as-is; this is a NIT-level suggestion only.

**Rationale:**
This is the best empty-state copy in the diff. Mentioned for completeness.

---

### Finding 7: `rewindResult.error` is a raw passthrough — no recovery guidance [LOW]

**Confidence:** Med

**Location:** `web/src/components/sdk/SdkCheckpoints.tsx:78`

**Current Copy:**
> `{rewindResult.error}` — raw error message from API passed directly to user

**Issue:**
This is an existing pattern not introduced in this diff, but it is now surfaced more prominently inside the ai-elements Checkpoint component. If the backend sends a technical error string (e.g., "ENOENT: no such file or directory", "Rewind target not found"), the user sees it verbatim with no recovery suggestion.

**User Impact:**
- Confusion: Technical error strings from the file system or API are not user-meaningful.
- Blocked action: No "try again" or "dismiss" is shown alongside the error (the close button `X` exists, but there is no retry).

**Suggested Copy:**
> Wrap the passthrough: if `rewindResult.error` exists, show "Could not complete rewind. [error detail]" + a retry or dismiss option.

**Rationale:**
The close button allows dismissal, which mitigates this. The issue is that the raw error string may not guide recovery. This is LOW because the X button exists and this is a developer tool where raw errors are more acceptable.

---

### Finding 8: "Preview changes" tooltip on CheckpointTrigger — correct but brief [NIT]

**Confidence:** Low

**Location:** `web/src/components/sdk/SdkCheckpoints.tsx:146`

**Current Copy:**
> `tooltip="Preview changes"`

**Issue:**
"Preview changes" accurately describes the action. Minor NIT: since the action performs a dry-run rewind, "Preview rewind changes" or "See what this checkpoint would change" would better set expectations that this is non-destructive.

**Suggested Copy:**
> `tooltip="Preview what this checkpoint would change (no files modified)"`

---

### Finding 9: `PanelSection` — `ChevronDown` has no accessible label [NIT]

**Confidence:** High

**Location:** `web/src/components/ui/PanelSection.tsx:36–39`

**Current Copy:**
> `<ChevronDown size={14} className="..." />`  — no `aria-label` or `aria-hidden`

**Issue:**
The chevron icon has no `aria-hidden="true"`, meaning screen readers may announce it as an unlabeled icon. Since the `Collapsible.Trigger` likely receives an implicit label from the `title` text inside it, this is minor but worth noting.

**Suggested Copy:**
> Add `aria-hidden="true"` to the `ChevronDown` element since the trigger label comes from the `{title}` text span.

**Rationale:**
This is a NIT and also touches accessibility (covered more fully by the frontend-accessibility review), but it has a copy dimension: the trigger's accessible name should come only from the visible text, not from an unlabeled decorative icon.

---

## Terminology Consistency Analysis

**Terms with Multiple Labels:**

| Concept | Current Variations | Recommended | Occurrences |
|---------|-------------------|-------------|-------------|
| Panel open action | "Open SDK Controls (Cmd+.)" vs "Open Pi Controls (Cmd+.)" | Consistent pattern — good | 2 |
| Panel close action | "Close (Cmd+.)" in both panels | Consistent — good | 2 |
| Section: model selection | "Session" (SDK panel) vs "Session" (Pi panel) | Consistent | 2 |
| Fork concept | "Fork" (button), "Forkable" (section), "forkable messages" (empty state) | Minor: "Fork" + "Forkable Messages" as section name | 3 |
| Checkpoint action | "Preview changes" (tooltip), "Rewind" (button), "checkpoints" (section heading) | Consistent | 3 |
| Empty model state | "No models loaded yet." vs implicit loading spinner | Consistent | 1 |

**Recommended Terminology Guide (Panel-specific):**

```
## Pi Panel Actions
- Steer: Interrupt the model mid-stream with new guidance
- Queue / Follow-up: Enqueue a message to send when streaming completes
- Compact: Summarize session context to reduce token usage
- Fork: Branch a new session from a selected message
- Cycle Model: Rotate to the next available model in the Pi pool

## SDK/Checkpoint Actions
- Checkpoint: A named save point capturing file state at a message boundary
- Preview: Dry-run rewind showing which files would change (no side effects)
- Rewind: Apply a checkpoint, restoring files to their state at that point
```

---

## Error Message Quality

**Current Error Patterns:**

| Type | Count | Example | Issue |
|------|-------|---------|-------|
| Raw API passthrough | 1 | `{rewindResult.error}` in SdkCheckpoints.tsx:78 | No recovery context |
| Generic error display | 2 | `{error && <p className="text-xs text-danger">{error}</p>}` in UsageSection and ModelsSection | Passthrough; no recovery steps |
| Good contextual error | 1 | Rewind preview card with distinct warning/danger treatment | Well-handled |

**Recommended Error Message Template:**
For developer-facing tools, a minimal but non-raw template is appropriate:
```
1. What failed (specific noun — "Stats could not be loaded" not "Error")
2. Error detail (passthrough acceptable for developer tools, but in a secondary style)
3. Recovery (a Retry button adjacent to the error, if the action is retryable)
```

---

## Empty State Quality

**Current Empty States:** 5

| Location | Current | Issue | Suggested |
|----------|---------|-------|-----------|
| SdkCheckpoints — no checkpoints | "No checkpoints available" + "Enable file checkpointing to rewind changes" | Dead-end instruction | Add "Enable it in the Configuration section above." |
| Pi UsageSection — no stats | "No stats yet. Send a message to begin." | Good; NIT only | Minor wording polish |
| Pi ModelsSection — no models | "No models loaded yet." | Slightly passive; no action | "Models will appear once the session connects." |
| Pi ForkableSection — no entries | "No forkable messages yet." | Doesn't explain what "forkable" means | "Messages the Pi model marks as branch points will appear here." |
| SdkCheckpoints — loading | Spinner only | No text context | Add "Loading checkpoints..." adjacent to spinner |

---

## Tone and Voice Consistency

**Detected Tone Variations:**
- Neutral/informational: Section headings ("Session", "Usage", "Account", "Configuration") — consistent
- Slightly casual: "No stats yet. Send a message to begin." — warm and direct
- Technical/developer: "Steer (interrupt)...", "Follow-up (queue)...", "Forkable" — Pi API vocabulary
- Internal: Footer strings "Claude SDK Session", "Pi SDK Session" — architecture-flavored

**Recommended Voice:**
Professional and direct, developer-appropriate. Pi-specific API vocabulary is acceptable for this audience but should be anchored by tooltips or help text the first time a user encounters it.

**Tone Guidelines:**

```
## Voice Principles (Developer Control Panels)
1. Direct and precise — no padding or softening language
2. Technical vocabulary is OK — anchor unfamiliar terms with a one-line tooltip
3. Empty states should explain state and point to an action (even if just "send a message")
4. Errors should not expose raw exception text as the primary message
5. Footer / status strings should reflect user-relevant state (connected, active) not internal type names

## Avoid:
- Section headings that are adjectives used as nouns ("Forkable" → "Forkable Messages")
- Instructions without a path ("Enable file checkpointing" → where?)
- Buttons with no tooltip when the label is a domain-specific verb (Steer, Queue, Compact, Fork)

## Use:
- "No X yet." + one-sentence explanation of what X is or how to get it
- Tooltips on icon-only or jargon buttons
- Status text that confirms a user-meaningful state
```

---

## Recommendations

### Immediate Actions (none are BLOCKERS or HIGH)

No blocking issues were found. All are medium or lower.

### Short-term Improvements (MED)

1. **Add tooltips to Pi action buttons** (5 instances)
   - "Steer", "Queue", "Compact", "Cycle Model", "Fork" all need a `title` attribute or Tooltip component
   - Example: `PiControlPanel.tsx:260` — `<Button title="Interrupt the model mid-stream">Steer</Button>`

2. **Rename or annotate the "Forkable" section heading** (1 instance)
   - Change to "Forkable Messages" or add a description line / tooltip on the heading
   - Update empty state to explain the concept: `PiControlPanel.tsx:396`

3. **Fix dead-end checkpoint empty state instruction** (1 instance)
   - `SdkCheckpoints.tsx:46` — add a reference to the Configuration section

### Long-term Enhancements (LOW)

1. **Replace footer architecture labels** — "Claude SDK Session" / "Pi SDK Session" → session status or session ID
2. **Wrap raw error passthroughs** in `SdkCheckpoints` and `PiControlPanel` section error displays — add "Retry" buttons adjacent to retryable errors
3. **Add `aria-hidden` to decorative icons** in `PanelSection.tsx` and `SdkCheckpoints` row icons
4. **Add loading text to Checkpoints spinner** — "Loading checkpoints..." rather than a bare spinner
5. **Create a Pi vocabulary mini-glossary** (even as a comment block or internal doc) so copy authors can write consistent microcopy for Pi-specific terms

---

## Copy Improvement Examples

### Example 1: Pi button — Steer

**Before:**
```tsx
<Button onClick={onSteer} size="sm" variant="secondary">
  Steer
</Button>
```

**After:**
```tsx
<Button onClick={onSteer} size="sm" variant="secondary" title="Interrupt the model and redirect with this message">
  Steer
</Button>
```

### Example 2: Checkpoint empty state

**Before:**
```tsx
<p className="text-2xs text-(--color-text-muted) mt-1">
  Enable file checkpointing to rewind changes
</p>
```

**After:**
```tsx
<p className="text-2xs text-(--color-text-muted) mt-1">
  File checkpointing is off. Enable it in the Configuration section above.
</p>
```

### Example 3: Forkable empty state

**Before:**
```tsx
<p className="text-xs text-(--color-text-muted)">No forkable messages yet.</p>
```

**After:**
```tsx
<p className="text-xs text-(--color-text-muted)">
  No branch points yet. Messages the Pi model marks as forkable will appear here.
</p>
```

### Example 4: Footer labels

**Before:**
```tsx
<div className="...">Claude SDK Session</div>
<div className="...">Pi SDK Session</div>
```

**After:**
```tsx
<div className="...">Session active</div>
```
Or remove entirely if no meaningful status can be shown.

---

## Next Steps

1. **This sprint:**
   - Add `title` / tooltip attributes to Pi action buttons (Steer, Queue, Compact, Fork, Cycle Model) — low-effort, high clarity gain
   - Fix the checkpoint empty state instruction to point at Configuration
   - Consider renaming "Forkable" section to "Forkable Messages"

2. **Next sprint:**
   - Replace or remove footer architecture label strings
   - Add loading text to bare spinners in Checkpoints

3. **Long term:**
   - Create an internal Pi vocabulary reference for consistent microcopy
   - Audit raw error passthroughs across SDK subcomponents for recovery guidance
