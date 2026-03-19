---
command: /review:ux-copy
session_slug: phase-4-prompt-input
scope: diff
target: HEAD~2
completed: 2026-03-16
---

# UX Copy Review

**Scope:** Phase 4 -- replacement of custom composer with ai-elements PromptInput (commits 949b378, 5f2e54d)
**Reviewer:** Claude UX Copy Review Agent
**Date:** 2026-03-16

## Summary

Phase 4 replaces a hand-rolled textarea + attachments composer with the `PromptInput` compound component from `ai-elements`. The change is largely structural -- most user-facing strings are unchanged or slightly improved. The new `AttachmentsPreview` component carries forward existing copy with minor wording shifts ("Remove image" became "Remove attachment", and image alt text defaults to "Attachment" instead of "Image N"). Error handling surfaces file-validation errors via toast, which is an improvement over the previous silent skip behavior. However, a few copy items deserve attention: the toast title "File error" is generic and somewhat technical, and the "Not connected" error is terse. No blocker-level copy issues were found.

**Severity Breakdown:**
- BLOCKER: 0
- HIGH: 0
- MED: 2 (generic error toast title, terse connection error)
- LOW: 3 (tooltip specificity, placeholder hint accuracy, loading state label)

**Merge Recommendation:** APPROVE_WITH_COMMENTS

---

## Copy Quality Scores

| Dimension | Score | Notes |
|-----------|-------|-------|
| Clarity | 7/10 | Most copy is clear; error messages could be more specific |
| Consistency | 8/10 | Terminology is consistent within the diff; "attachment" vs "image" shift is intentional |
| Actionability | 6/10 | Error toasts tell user to "try again" but file errors lack specific recovery guidance |
| Tone/Voice | 8/10 | Professional, neutral tone throughout; no blame language |
| Helpfulness | 6/10 | File error messages delegate to the component's internal `message` string -- quality depends on upstream |

**Overall UX Copy Score:** 7/10

---

## Findings

### Finding 1: Generic "File error" toast title [MED]

**Location:** `web/src/pages/WorkspaceUseChat.tsx:176`

**Current Copy:**
> "File error"

**Issue:**
The toast title when a file is rejected by PromptInput is a generic "File error". The body comes from `err.message` (provided by the PromptInput component), but the title itself does not differentiate between "file too large", "wrong type", or "too many files".

**User Impact:**
- Confusion: "File error" sounds like a system problem, not a validation issue the user can fix.
- Frustration: The title does not help the user understand the category of problem at a glance.
- Blocked action: None -- the body text provides specifics, but the title sets the wrong tone.

**Suggested Copy:**
> Title: "Attachment not added"
> Body: (keep err.message as-is)

**Rationale:**
"Attachment not added" clearly communicates that the file was not attached (the outcome) without sounding like a system failure. It pairs well with specific body text like "File exceeds 10 MB limit" or "Unsupported file type".

---

### Finding 2: Terse "Not connected" error toast [MED]

**Location:** `web/src/pages/WorkspaceUseChat.tsx:155`

**Current Copy:**
> Title: "Not connected"
> Body: "Check your connection and try again."

**Issue:**
When a user tries to send a message while disconnected, the toast says "Not connected" with generic recovery advice. The same body text "Check your connection and try again." is reused for both the disconnected state and the send-failure state (line 167), making the two different failure modes indistinguishable to the user.

**User Impact:**
- Confusion: "Check your connection" could mean internet connection or WebSocket session -- the user may not know which.
- Frustration: The user sees the same message for two different problems.

**Suggested Copy:**
> Title: "Session not connected"
> Body: "The session is disconnected. Wait for reconnection or refresh the page."

For the send-failure case (line 167):
> Title: "Message not sent"
> Body: "Something went wrong sending your message. Please try again."

**Rationale:**
Differentiating the two error states helps users understand whether the problem is transient (send failure) or structural (disconnected session) and gives appropriate recovery actions for each.

---

### Finding 3: "Add more images" tooltip is overly specific [LOW]

**Location:** `web/src/components/chat/AttachmentsPreview.tsx:48`

**Current Copy:**
> "Add more images"

**Issue:**
The "add more" button tooltip says "Add more images", but the component handles non-image files too (the else branch on line 29 renders a generic file tile). If the allowed types are expanded in the future, or a non-image file is already attached, this tooltip is inaccurate.

**User Impact:**
- Minor confusion if non-image files are ever supported.

**Suggested Copy:**
> "Add more files"

**Rationale:**
More generic label matches the component's actual capability and is future-proof.

---

### Finding 4: Placeholder hint "Shift+Enter for new line" may not match PromptInput behavior [LOW]

**Location:** `web/src/pages/WorkspaceUseChat.tsx:255`

**Current Copy:**
> "Type your message... (Shift+Enter for new line)"

**Issue:**
The placeholder carries over from the old custom textarea. The new `PromptInputTextarea` component may handle Enter/Shift+Enter differently than the old custom implementation. If PromptInput uses a different key binding (or the hint is redundant because the component handles it automatically), this placeholder could mislead users.

**User Impact:**
- Minor confusion if behavior does not match the documented hint.

**Suggested Copy:**
Verify that `PromptInputTextarea` indeed uses Enter to submit and Shift+Enter for newline. If so, keep as-is. If it differs, update to match actual behavior.

**Rationale:**
Placeholder hints that contradict actual behavior erode trust.

---

### Finding 5: "Thinking..." loading state is vague [LOW]

**Location:** `web/src/pages/WorkspaceUseChat.tsx:219`

**Current Copy:**
> "Thinking..."

**Issue:**
When the message has been submitted but streaming has not started, the user sees "Thinking..." with a shimmer animation. This is acceptable but could be slightly more informative. This is unchanged from before, so it is not introduced by this diff, but it is worth noting in context.

**User Impact:**
- Minimal. Users generally understand "Thinking..." in a chat context.

**Suggested Copy:**
No change required. This is fine for the current product context.

**Rationale:**
Included for completeness since this is the only loading-state copy in the reviewed diff.

---

## Terminology Consistency Analysis

**Terms with Multiple Labels:**

| Concept | Current Variations | Recommended | Occurrences |
|---------|-------------------|-------------|-------------|
| Remove attachment | "Remove attachment" (AttachmentsPreview), none other | "Remove attachment" | 1 place |
| Connection state | "Connected via WebSocket", "Reconnecting (attempt N)...", "Disconnected", "Not connected" | Standardize "Not connected" -> "Disconnected" in error toast to match status bar | 3 places |
| Error recovery | "Check your connection and try again." (used twice for different errors) | Differentiate per error type | 2 places |

**Recommended Terminology Guide:**

```markdown
## Connection States (user-facing)
- **Connected**: Active WebSocket session
- **Reconnecting**: Temporarily lost, auto-retrying
- **Disconnected**: No active connection

## File Actions
- **Remove**: Take file out of attachment list (non-destructive)
- **Add**: Attach a new file

## Error Toasts
- Title: State the outcome ("Message not sent", "Attachment not added")
- Body: Explain why + what to do next
```

---

## Error Message Quality

**Current Error Patterns:**

| Type | Count | Example | Issue |
|------|-------|---------|-------|
| Generic title | 1 | "File error" | Sounds like system failure, not validation |
| Duplicate body | 1 | "Check your connection and try again." (used for 2 different errors) | Cannot distinguish failure modes |
| No recovery | 0 | -- | All errors have at least "try again" guidance |
| Technical jargon | 0 | -- | No HTTP codes or stack traces exposed |

**Recommended Error Message Template:**

```markdown
1. **Title**: State the failed outcome in user terms ("Message not sent")
2. **Body**: Brief explanation + one actionable recovery step
3. **Avoid**: Reusing identical copy for different failure modes
```

---

## Empty State Quality

**Current Empty States:** 2

| Location | Current | Issue | Suggested |
|----------|---------|-------|-----------|
| Conversation (line 208-211) | "Start a conversation" / "Type a message below to get started" | Clear and actionable | No change needed |
| No active session (line 369-371) | "No active session" / "Select a session from the sidebar or create a new one" + CTA button | Good -- has explanation and CTA | No change needed |

Both empty states are well-constructed with clear copy and actionable next steps.

---

## Tone and Voice Consistency

**Detected Tone Variations:**
- Professional/neutral: All error messages, status text, placeholders
- No casual or playful copy detected
- No blame language detected

**Recommended Voice:**
The current professional-neutral tone is appropriate for a developer-facing tool. Maintain this across future changes.

**Tone Guidelines:**
The diff introduces no tone inconsistencies. All new copy matches the existing voice.

---

## Recommendations

### Immediate Actions (BLOCKER/HIGH)

None. No blocker or high-severity copy issues found.

### Short-term Improvements (MED)

1. **Differentiate error toast titles** (2 instances)
   - "File error" -> "Attachment not added" (`WorkspaceUseChat.tsx:176`)
   - "Not connected" -> "Session not connected" (`WorkspaceUseChat.tsx:155`)

2. **Differentiate error toast bodies** (2 instances)
   - Use distinct body text for disconnected vs send-failure states
   - `WorkspaceUseChat.tsx:155` and `WorkspaceUseChat.tsx:167`

### Long-term Enhancements (LOW)

1. **Generalize "Add more images" tooltip**
   - `AttachmentsPreview.tsx:48` -> "Add more files"

2. **Verify placeholder hint accuracy**
   - Confirm Shift+Enter behavior matches `PromptInputTextarea` implementation

3. **Consider i18n string extraction**
   - All user-facing strings are hardcoded; if localization is planned, extract to constants

---

## Next Steps

1. **Immediate** (this PR):
   - Consider updating the 2 MED findings before merge (small changes, big clarity improvement)

2. **Short-term** (next sprint):
   - Audit all toast error messages across the app for consistency
   - Ensure error titles describe outcomes, not technical categories

3. **Long-term** (next quarter):
   - Create a copy style guide for error messages, empty states, and status text
   - Extract hardcoded strings if i18n becomes a requirement

## Style Guide Recommendation

```markdown
# Aperture UX Copy Conventions

## Error Toasts
- Title: Describe the failed outcome ("Message not sent", "Attachment not added")
- Body: One sentence explaining why + one sentence with recovery action
- Never reuse identical body text for different failure modes

## Button/Tooltip Labels
- Use the most general accurate term ("files" not "images" if both are supported)
- Action verbs in imperative mood ("Remove attachment", "Add more files")

## Status Text
- Use consistent terminology for connection states
- Match status bar labels with error message labels
```
