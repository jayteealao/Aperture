---
command: /review:ux-copy
session_slug: ux-copy-review-2026-03-16
scope: diff
target: HEAD~2..HEAD (Phase 6 — streaming status sync and sidebar dot)
completed: 2026-03-17
---

# UX Copy Review

**Scope:** Last 2 commits — Phase 6: sync useChat.status to Zustand store, split "Streaming..." / "Sending..." badges, add pulsing streaming dot to sidebar session list
**Reviewer:** Claude UX Copy Review Agent
**Date:** 2026-03-17

---

## Summary

Phase 6 introduces two new user-facing status signals: a green pulsing dot in the sidebar when a session is actively streaming, and a split between a "Streaming..." badge and a new "Sending..." badge in the workspace header. The changes are small in surface area but directly visible to users during one of the most frequent interactions — waiting for a response.

Overall copy quality is good. The new strings are concise, clearly communicate distinct states, and are consistent with the existing badge vocabulary. One moderate concern exists: "Streaming..." and "Sending..." represent technical internal state machine phases (`status === 'streaming'` vs `status === 'submitted'`) rather than clear user-intent language. Users understand "Sending..." reasonably well, but "Streaming..." may read as jargon to non-developer users. The silent `title="Streaming"` tooltip on the sidebar dot is accessible but invisible without hover — there is no aria-label providing screen reader parity for the dot's meaning.

**Severity Breakdown:**
- BLOCKER: 0
- HIGH: 0
- MED: 2
- LOW: 2
- NIT: 1

**Merge Recommendation:** APPROVE_WITH_COMMENTS

---

## Copy Quality Scores

| Dimension | Score | Notes |
|-----------|-------|-------|
| Clarity | 7/10 | "Streaming..." is technically accurate but jargon-adjacent for end users |
| Consistency | 9/10 | Badge vocabulary, dot pattern, and animation conventions are consistent |
| Actionability | 8/10 | Status indicators communicate state; no recovery action needed here |
| Tone/Voice | 9/10 | Neutral, technical-professional, appropriate for a developer tool |
| Helpfulness | 6/10 | Sidebar dot has no visible label; screen readers get "Streaming" via title only |

**Overall UX Copy Score:** 7.8/10

---

## Findings

### Finding 1: "Streaming..." is internal SDK terminology exposed as user copy [MED]

**Location:** `web/src/pages/WorkspaceUseChat.tsx:201`

**Current Copy:**
> `Streaming...`

**Issue:**
The badge label is derived directly from the `useChat` status value `'streaming'`. "Streaming" is an accurate technical description of server-sent event delivery, but it is not standard end-user language for "the AI is currently responding." Most chat products use "Responding...", "Typing...", or "Generating...". The developer-tool context of Aperture makes this more defensible, but the target audience is described as "developers" — and even developers read UI copy first before inferring internal state.

**User Impact:**
- Confusion: Users who are not familiar with streaming AI APIs may wonder what is being "streamed" — audio? video? a file?
- Friction: Mild — does not block any action, but reduces clarity of the "AI is working" signal.
- Blocked action: None.

**Suggested Copy:**
> `Responding...`

**Rationale:**
"Responding..." clearly communicates that the AI is generating a reply. It is shorter than "Generating response...", consistent with the existing ellipsis convention, and avoids SDK-layer terminology leaking into the UI layer.

---

### Finding 2: Sidebar streaming dot has no accessible label beyond `title` [MED]

**Location:** `web/src/components/layout/Sidebar.tsx:157`

**Current Copy:**
> `title="Streaming"`

**Issue:**
The 8px dot uses `title="Streaming"` as its only text description. The `title` attribute provides a browser tooltip on hover (desktop only) and is read by some screen readers, but it is not reliably exposed as an accessible name by all AT/browser combinations. There is no `aria-label` on the `<span>`. The existing unread-indicator dot (line 160) has no label at all, which is a pre-existing gap not in scope here, but the new dot should set a consistent, accessible pattern.

**User Impact:**
- Confusion: Keyboard-only and screen reader users see or hear a visual change without a reliable label.
- Frustration: Low — this is a supplementary indicator, not the primary status signal.
- Blocked action: None — the header badge conveys the same state.

**Suggested Copy:**
```tsx
<span
  className="w-2 h-2 rounded-full bg-success animate-[pulse_0.75s_ease-in-out_infinite]"
  aria-label="Streaming"
  role="status"
/>
```

**Rationale:**
`aria-label` is the reliable path for accessible names on non-interactive elements. Adding `role="status"` announces live changes politely. `title` can remain as-is for sighted hover users.

---

### Finding 3: "Sending..." does not convey what happens if the message is not delivered [LOW]

**Location:** `web/src/pages/WorkspaceUseChat.tsx:205-209`

**Current Copy:**
> `Sending...`

**Issue:**
"Sending..." accurately reflects `status === 'submitted'` (message dispatched, waiting for first streaming token). There is no associated recovery path or timeout message if the submitted state persists unexpectedly. If the WebSocket drops after submit, the badge may stay indefinitely without a user-visible explanation. This is a UX copy gap rather than a current code bug — the error path (`onError`) already logs to console but shows no toast for the submitted→error transition.

**User Impact:**
- Confusion: If "Sending..." hangs, users don't know whether to retry or wait.
- Frustration: Medium if it occurs; low probability in normal operation.
- Blocked action: No explicit "retry" affordance is shown during a hung submit.

**Suggested Copy (no immediate change required):**
If the submitted state is held beyond a timeout threshold (e.g. 10 s), surface a message like:
> `Taking longer than expected... (tap to cancel)`

**Rationale:**
Flagged LOW because normal operation resolves quickly. Logging a follow-up issue is sufficient for now.

---

### Finding 4: "Loading conversation..." has no retry or error variant [LOW]

**Location:** `web/src/pages/WorkspaceUseChat.tsx:65`

**Current Copy:**
> `Loading conversation...`

**Issue:**
This copy is shown when `!session || initialMessages === null`. If `initialMessages` fails to load (storage read error), the user is stuck on "Loading conversation..." indefinitely with no way to retry or understand the failure. This is pre-existing, not introduced by Phase 6, but is surfaced here as part of the full file review.

**User Impact:**
- Confusion: User cannot distinguish between "still loading" and "load failed."
- Blocked action: Full workspace is inaccessible if this state persists.

**Suggested Copy:**
The loading state should differentiate between pending and errored (requires store changes, out of scope for this diff).

---

### Finding 5: "Thinking..." in shimmer component is inconsistent with the badge vocabulary [NIT]

**Location:** `web/src/pages/WorkspaceUseChat.tsx:227`

**Current Copy:**
> `Thinking...`

**Issue:**
The Shimmer element shown during `status === 'submitted'` reads "Thinking...", while the header badge reads "Sending...". Both are displayed simultaneously for the same state. "Thinking" implies the model is reasoning; "Sending" implies the message is in transit. These describe different things, which is accurate, but introduces a minor semantic split that may confuse users who see both at once.

**User Impact:**
- Mild semantic inconsistency — "Sending..." (header) + "Thinking..." (conversation) co-exist during `submitted`, suggesting two different actions when it is one state.

**Suggested approach:**
Align them under one concept. If "Sending..." is kept for the badge (in-transit framing), consider "Waiting for response..." in the Shimmer. If the badge becomes "Responding..." (per Finding 1), "Thinking..." in the Shimmer becomes more coherent.

---

## Terminology Consistency Analysis

**Terms with Multiple Labels:**

| Concept | Current Variations | Recommended | Occurrences |
|---------|-------------------|-------------|-------------|
| AI generating a reply | "Streaming..." (badge), "Thinking..." (shimmer) | "Responding..." (badge) + "Thinking..." (shimmer) — or both updated to match | 2 locations in same file |
| Message submitted/in-flight | "Sending..." (badge) | Consistent — single use | 1 location |
| Session active streaming | "Streaming" (dot title), "Streaming..." (badge) | Consistent | 2 locations across 2 files |

**Recommended Terminology Guide (scoped to streaming/sending vocabulary):**

```
- "Sending..." — message has been submitted, first token not yet received
- "Responding..." — first token received, AI is generating reply (replaces "Streaming...")
- "Thinking..." — in-conversation shimmer during submitted state
```

---

## Error Message Quality

No new error messages were introduced in this diff. Pre-existing error handling in scope:

| Type | Location | Issue |
|------|----------|-------|
| Silent error | `WorkspaceUseChat.tsx:119` | `onError` logs to console only; no user-visible toast for chat-level errors |

This is pre-existing and not introduced by Phase 6. Logged for completeness.

---

## Empty State Quality

No empty states were added or changed in this diff.

Pre-existing empty state in scope: `"No active sessions"` (Sidebar.tsx:166-168) — no CTA. Pre-existing gap, not in scope for this review.

---

## Tone and Voice Consistency

**Detected tone:** Technical-professional throughout. Consistent with a developer-tool product.

- Badge labels ("Streaming...", "Sending...") — neutral technical present-progressive. Consistent with each other.
- Sidebar tooltip ("Streaming") — minimal, noun-only. Acceptable for a tiny indicator.
- Connection status footer ("Connected via WebSocket", "Reconnecting (attempt N)...", "Disconnected") — already established, not changed, appropriately technical.

No blame language, condescension, or alarming tone detected.

---

## Recommendations

### Immediate Actions (BLOCKER/HIGH)
None.

### Short-term Improvements (MED)

1. **Rename "Streaming..." badge to "Responding..."** (1 instance)
   - `WorkspaceUseChat.tsx:201`
   - Removes SDK-layer vocabulary from the UI; clearer for all users.

2. **Add `aria-label` + `role="status"` to the streaming dot** (1 instance)
   - `Sidebar.tsx:157`
   - `title` alone is not reliably accessible. One-line fix.

### Long-term Enhancements (LOW)

1. **Add a hung-submit timeout message** (behind a future follow-up issue)
   - Surface user-visible feedback if `status === 'submitted'` persists beyond 10 s.

2. **Differentiate loading-conversation error from pending state**
   - `WorkspaceUseChat.tsx:65` — requires store-level error state propagation.

3. **Align Shimmer "Thinking..." with badge vocabulary**
   - Once badge label is finalized (Finding 1), update Shimmer to be consistent.

---

## Copy Improvement Examples

### Example 1: Badge label alignment

**Before:**
```tsx
{status === 'streaming' && (
  <Badge variant="accent" size="sm" className="animate-pulse">
    Streaming...
  </Badge>
)}
```

**After:**
```tsx
{status === 'streaming' && (
  <Badge variant="accent" size="sm" className="animate-pulse">
    Responding...
  </Badge>
)}
```

### Example 2: Accessible sidebar dot

**Before:**
```tsx
<span className="w-2 h-2 rounded-full bg-success animate-[pulse_0.75s_ease-in-out_infinite]" title="Streaming" />
```

**After:**
```tsx
<span
  className="w-2 h-2 rounded-full bg-success animate-[pulse_0.75s_ease-in-out_infinite]"
  title="Responding"
  aria-label="Responding"
  role="status"
/>
```

---

## Next Steps

1. **This sprint:** Rename "Streaming..." → "Responding..." in the badge and dot tooltip.
2. **This sprint:** Add `aria-label` + `role="status"` to the sidebar streaming dot.
3. **Next sprint:** Decide on "Thinking..." vs consistent "Responding..." in shimmer; standardize.
4. **Backlog:** Hung-submit timeout feedback; loading-conversation error state.
