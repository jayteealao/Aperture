---
command: /review:ux-copy
session_slug: ux-copy-review-2026-03-16
scope: diff
target: working tree
completed: 2026-03-16
---

# UX Copy Review

**Scope:** Working tree changes in `web/src/pages/WorkspaceUseChat.tsx` and new extracted components in `web/src/components/chat/`
**Reviewer:** Claude UX Copy Review Agent
**Date:** 2026-03-16

## Summary

This diff primarily refactors the WorkspaceUseChat page by extracting inline components (`UIMessageBubble`, `PermissionRequest`, `ConnectionStatus`) into standalone files under `web/src/components/chat/`. A new `ChatErrorBoundary` is introduced. The user-facing copy carried over from the previous implementation is largely unchanged, which means pre-existing copy issues persist. The new code introduces a small number of new user-facing strings (the error boundary messaging and the "Thinking..." shimmer). Overall, the copy is functional but could be more actionable and consistent in several places.

**Severity Breakdown:**
- BLOCKER: 0 (no user-flow-blocking copy issues)
- HIGH: 2 (non-actionable error messages, generic fallback text)
- MED: 5 (empty state could be richer, inconsistent status terminology, missing context in several areas)
- LOW: 3 (minor tone/label improvements)

**Merge Recommendation:** APPROVE_WITH_COMMENTS

---

## Copy Quality Scores

| Dimension | Score | Notes |
|-----------|-------|-------|
| Clarity | 7/10 | Most labels are clear; some technical jargon leaks through (session IDs, "WebSocket") |
| Consistency | 7/10 | Terminology is mostly consistent; minor variation in status descriptions |
| Actionability | 5/10 | Error boundary and toast errors lack recovery guidance; empty state is minimal |
| Tone/Voice | 7/10 | Professional tone is consistent; slightly robotic in error states |
| Helpfulness | 5/10 | Several dead-end states with no guidance on what to do next |

**Overall UX Copy Score:** 6/10

---

## Findings

### Finding 1: ChatErrorBoundary - Generic error with no explanation [HIGH]

**Location:** `web/src/components/chat/ChatErrorBoundary.tsx:47-55`

**Current Copy:**
> "Something went wrong"
> "An error occurred while rendering the conversation."
> (production) "A rendering error occurred. Click below to retry."

**Issue:**
The error boundary uses the classic non-actionable pattern. "Something went wrong" does not tell the user what happened or why. The production message says "A rendering error occurred" which is technical jargon ("rendering") that most users will not understand. There is no guidance beyond "Try again" -- if trying again fails repeatedly, the user has no next step.

**User Impact:**
- Confusion: Users do not know what caused the problem or whether it was their fault
- Frustration: Repeated "Try again" clicks with no alternative path
- Blocked action: No support link, no way to report the issue, no workaround suggested

**Suggested Copy:**
> Title: "Conversation display error"
> Body: "We could not display the conversation. Your messages are safe -- this is a display issue, not a data loss."
> Recovery: "Try again" button + "If this keeps happening, try refreshing the page or contact support."

**Rationale:**
Reassures user about data safety (critical in a chat context), explains the nature of the problem in plain language, and provides an escalation path.

---

### Finding 2: Toast error on send failure - Non-actionable with potential jargon [HIGH]

**Location:** `web/src/pages/WorkspaceUseChat.tsx:192`

**Current Copy:**
> toast.error('Failed to send', error instanceof Error ? error.message : 'Unknown error')

**Issue:**
The toast shows "Failed to send" with the raw error message, which could be a technical exception string (e.g., "TypeError: NetworkError when attempting to fetch resource"). The fallback "Unknown error" is completely unhelpful. There is no retry guidance in the toast itself.

**User Impact:**
- Confusion: Raw error messages are often meaningless to users
- Blocked action: The input text is restored but user does not know if they should retry or if the problem is persistent

**Suggested Copy:**
> toast.error('Message not sent', 'Check your connection and try again. Your message has been restored.')

**Rationale:**
Tells the user what happened in plain language, gives actionable recovery ("check your connection"), and reassures that their input was not lost.

---

### Finding 3: Empty state is minimal - No CTA or positive framing [MED]

**Location:** `web/src/pages/WorkspaceUseChat.tsx:280-283`

**Current Copy:**
> Title: "No messages yet"
> Description: "Send a message to start the conversation"

**Issue:**
The empty state uses negative framing ("No messages yet") and provides only a text instruction with no visual affordance. The description repeats what is obvious from the empty chat view. There is no illustration, tip, or example to help the user get started.

**User Impact:**
- Confusion: New users may not know what kind of messages to send or what the agent can do
- Missed opportunity: This is the first impression of the chat experience

**Suggested Copy:**
> Title: "Start a conversation"
> Description: "Type a message below to begin working with your agent. Try asking it to help with code, answer questions, or run tasks."

**Rationale:**
Positive framing ("Start" vs "No messages"), and provides concrete examples of what the agent can do -- especially helpful for first-time users.

---

### Finding 4: ConnectionStatus tooltip shows raw status string [MED]

**Location:** `web/src/components/chat/ConnectionStatus.tsx:19`

**Current Copy:**
> title={status}

**Issue:**
The tooltip shows raw status values like "connected", "reconnecting", "disconnected" -- lowercase, developer-facing strings. These are not user-friendly labels.

**User Impact:**
- Minor confusion: Users see raw enum-like strings instead of properly capitalized, human-readable labels

**Suggested Copy:**
Map statuses to user-friendly labels:
- "connected" -> "Connected"
- "connecting" -> "Connecting..."
- "reconnecting" -> "Reconnecting..."
- "disconnected" -> "Disconnected"
- "error" -> "Connection error"
- "ended" -> "Session ended"

**Rationale:**
Tooltips are user-facing UI text and should use proper capitalization and human-readable phrasing.

---

### Finding 5: "Permission Required" heading is vague [MED]

**Location:** `web/src/components/chat/PermissionRequest.tsx:89-90`

**Current Copy:**
> "Permission Required"

**Issue:**
The heading "Permission Required" is vague and slightly alarming. It does not indicate what permission is needed or why. Users may worry this is a system-level permission (like camera/microphone) rather than a tool execution approval.

**User Impact:**
- Confusion: Users do not immediately understand the context
- Mild anxiety: "Required" language can feel demanding

**Suggested Copy:**
> "Approve this action" or "The agent wants to {toolName}"

**Rationale:**
More specific and less alarming. Connecting it to the tool name gives immediate context.

---

### Finding 6: Fallback description for permission requests [MED]

**Location:** `web/src/components/chat/PermissionRequest.tsx:95`

**Current Copy:**
> "The agent wants to perform an action"

**Issue:**
This fallback text is extremely vague. When toolCall.title is missing, the user sees "The agent wants to perform an action" with no specifics about what action. Combined with "Permission Required," the user has essentially zero context.

**User Impact:**
- Confusion: User cannot make an informed decision about granting permission
- Blocked action: User may deny out of caution, or approve without understanding

**Suggested Copy:**
> "The agent is requesting permission to use a tool. Review the details below before deciding."

**Rationale:**
Provides slightly more context and guides the user to look at the tool call details for more information.

---

### Finding 7: "Deny" button label is harsh [MED]

**Location:** `web/src/components/chat/PermissionRequest.tsx:150`

**Current Copy:**
> "Deny"

**Issue:**
"Deny" has a negative, authoritarian connotation. In the context of a collaborative agent interaction, this feels adversarial.

**User Impact:**
- Tone mismatch: The rest of the UI uses a professional-friendly tone; "Deny" feels abrupt

**Suggested Copy:**
> "Decline" or "Skip"

**Rationale:**
"Decline" is softer while conveying the same meaning. "Skip" works if the action is optional.

---

### Finding 8: Status bar text exposes technical details [LOW]

**Location:** `web/src/pages/WorkspaceUseChat.tsx:400-401`

**Current Copy:**
> "Connected via WebSocket"
> "Reconnecting (attempt {retryCount})..."

**Issue:**
"via WebSocket" is implementation detail that provides no value to users. The retry count "(attempt 3)" may cause anxiety without helping the user take any action.

**User Impact:**
- Minor confusion: Non-technical users do not know what WebSocket means
- Mild anxiety: Seeing retry attempts climb can be stressful

**Suggested Copy:**
> "Connected" (simple, sufficient)
> "Reconnecting..." (without count, or with "This may take a moment")

**Rationale:**
Users care about the outcome (connected/not), not the transport mechanism or retry internals.

---

### Finding 9: "Loading conversation..." lacks context [LOW]

**Location:** `web/src/pages/WorkspaceUseChat.tsx:58`

**Current Copy:**
> "Loading conversation..."

**Issue:**
Minor: this is acceptable but could indicate what is being loaded (e.g., message history) for users who might wonder if they need to wait.

**User Impact:**
- Minimal: Most users will understand this, but it could be slightly more informative

**Suggested Copy:**
> "Loading message history..."

**Rationale:**
Slightly more specific about what is being loaded.

---

### Finding 10: Session ID truncated without explanation [LOW]

**Location:** `web/src/pages/WorkspaceUseChat.tsx:264`

**Current Copy:**
> {session.id.slice(0, 12)}...

**Issue:**
The session header shows a truncated UUID-style ID. This is developer-oriented information that provides no value to most users. If sessions have names or descriptions, those should be shown instead.

**User Impact:**
- Confusion: Users see a meaningless string like "a3f8b2c1d4e5..."
- Missed opportunity: This prime header real estate could show the session purpose or agent name

**Suggested Copy:**
> Show session name/description if available, with ID as a tooltip or secondary detail.

**Rationale:**
Users identify sessions by purpose, not by UUID.

---

## Terminology Consistency Analysis

**Terms with Multiple Labels:**

| Concept | Current Variations | Recommended | Occurrences |
|---------|-------------------|-------------|-------------|
| Connection state | "Connected via WebSocket", "Reconnecting (attempt N)...", "Disconnected", status dot tooltip | "Connected" / "Reconnecting..." / "Disconnected" | 3+ places |
| Stop action | StopCircle icon (no label), "Streaming..." badge | Add aria-label "Stop generating" to button | 2 places |
| Send action | Send icon (no label) | Add aria-label "Send message" to button | 1 place |
| Permission denial | "Deny" | "Decline" | 1 place |

**Recommended Terminology Guide:**

```markdown
## Connection States
- **Connected**: Session is active and ready
- **Connecting...**: Initial connection in progress
- **Reconnecting...**: Connection lost, attempting to restore
- **Disconnected**: No active connection
- **Session ended**: Session has been terminated

## Actions
- **Send**: Submit a message (icon button, needs aria-label)
- **Stop**: Cancel current generation (icon button, needs aria-label)
- **Approve / Decline**: Permission request responses
- **Try again**: Error recovery action

## States
- **Thinking...**: Agent is processing (submitted status)
- **Streaming...**: Agent is generating a response
```

---

## Error Message Quality

**Current Error Patterns:**

| Type | Count | Example | Issue |
|------|-------|---------|-------|
| Generic errors | 1 | "Something went wrong" (ChatErrorBoundary) | No specifics, no escalation path |
| Technical jargon | 1 | "A rendering error occurred" (ChatErrorBoundary prod) | "Rendering" is developer jargon |
| Raw error pass-through | 1 | toast.error with raw error.message | Could expose stack traces or technical strings |
| No recovery | 1 | "Failed to send" toast | No guidance beyond implicit retry |

**Recommended Error Message Template:**

```markdown
1. **What happened** (specific, plain-language problem)
2. **Reassurance** (data is safe, if applicable)
3. **What to do** (actionable recovery steps)
4. **Get help** (escalation path if retry fails)

Example for ChatErrorBoundary:
"Conversation display error

We could not display the conversation. Your messages are safe.

Try again, or refresh the page if the problem continues."
```

---

## Empty State Quality

**Current Empty States:** 2

| Location | Current | Issue | Suggested |
|----------|---------|-------|-----------|
| Chat messages | "No messages yet" + "Send a message to start the conversation" | Negative framing, no examples, no CTA button | "Start a conversation" + usage hints + optional quick-start suggestions |
| No active session | Terminal icon + "No active session" + "Select a session..." + "New Session" button | Adequate -- has CTA and guidance | Minor: "No active session" is slightly negative; "Get started" framing preferred |

---

## Tone and Voice Consistency

**Detected Tone Variations:**
- Professional/neutral: Most of the UI ("Send a message to start the conversation", "Loading conversation...")
- Slightly technical: Status bar ("Connected via WebSocket"), error boundary ("rendering error")
- Curt/authoritarian: "Deny" button, "Permission Required" heading

**Recommended Voice:**
Professional-friendly, appropriate for a developer tool (target audience: developers). Technical terms for developer-facing concepts (agent, session) are fine, but infrastructure details (WebSocket, rendering) should be hidden.

**Tone Guidelines:**

```markdown
## Voice Principles
1. **Professional but approachable**: Clear and direct without being cold
2. **Developer-aware, not developer-only**: Assume technical literacy but do not expose implementation details
3. **Helpful in errors**: Always provide a next step
4. **Collaborative tone**: The agent and user are working together -- avoid adversarial language (Deny, Required, Failed)

## Patterns
- Error titles: State the problem simply ("Message not sent", "Display error")
- Error bodies: Explain + reassure + guide ("Your message was saved. Check your connection and try sending again.")
- Empty states: Positive framing ("Start a conversation" not "No messages")
- Buttons: Action verbs ("Approve", "Decline", "Send message", "Try again")
```

---

## Recommendations

### Immediate Actions (HIGH)

1. **Improve ChatErrorBoundary messaging** (1 instance)
   - Replace "Something went wrong" with specific, reassuring copy
   - Add data-safety reassurance
   - Add escalation path (refresh page suggestion)
   - Location: `web/src/components/chat/ChatErrorBoundary.tsx:47-55`

2. **Sanitize toast error messages** (1 instance)
   - Do not pass raw `error.message` to user-facing toasts
   - Use a fixed, human-readable message with a console.error for debugging
   - Location: `web/src/pages/WorkspaceUseChat.tsx:192`

### Short-term Improvements (MED)

1. **Enrich empty state** (1 instance)
   - Add usage hints or example prompts
   - Use positive framing
   - Location: `web/src/pages/WorkspaceUseChat.tsx:280-283`

2. **Humanize ConnectionStatus tooltips** (1 instance)
   - Map raw statuses to capitalized, readable labels
   - Location: `web/src/components/chat/ConnectionStatus.tsx:19`

3. **Improve permission request copy** (3 instances)
   - Make heading more specific ("Approve this action")
   - Improve fallback description
   - Soften "Deny" to "Decline"
   - Location: `web/src/components/chat/PermissionRequest.tsx:89-95,150`

### Long-term Enhancements (LOW)

1. **Remove implementation details from status bar**
   - Drop "via WebSocket" and retry counts
   - Location: `web/src/pages/WorkspaceUseChat.tsx:400-404`

2. **Add aria-labels to icon-only buttons**
   - Stop button and Send button lack accessible labels
   - Location: `web/src/pages/WorkspaceUseChat.tsx:382,389`

3. **Show session names instead of truncated IDs**
   - Use human-readable identifiers in the header
   - Location: `web/src/pages/WorkspaceUseChat.tsx:264`

---

## Next Steps

1. **Immediate** (this week):
   - Fix ChatErrorBoundary copy with reassurance and escalation
   - Sanitize toast error display

2. **Short-term** (this sprint):
   - Enrich empty state with usage guidance
   - Humanize status tooltips and permission request wording
   - Add aria-labels to icon-only buttons

3. **Long-term** (next quarter):
   - Create a copy style guide for the Aperture product
   - Audit all error/empty/loading states across the full application
   - Consider i18n string extraction if internationalization is planned
