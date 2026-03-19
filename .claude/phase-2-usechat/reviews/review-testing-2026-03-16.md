---
command: /review:testing
session_slug: phase-2-usechat
date: 2026-03-16
scope: diff
target: working tree (unstaged changes)
paths: web/src/**
related:
  session: ../README.md
---

# Testing Review Report

**Reviewed:** diff / working tree (unstaged changes)
**Date:** 2026-03-16
**Reviewer:** Claude Code

---

## 0) Scope, Test Strategy, and Context

**What was reviewed:**
- Scope: diff (working tree)
- Target: HEAD vs working tree
- Files changed: 7 new source files, 1 modified source file, 0 new test files
- Lines changed: +350 -288 (source), +0 -0 (tests)

**Test strategy:**
- Test levels: unit / integration (no e2e)
- Test framework: Vitest
- Coverage target: not explicitly configured
- CI environment: not determined from working tree

**Changed behavior:**
1. `WorkspaceUseChat.tsx` -- Extracted `UIMessageBubble` to `ApertureMessage` component (sequential part rendering instead of grouped-by-type)
2. `WorkspaceUseChat.tsx` -- Extracted `PermissionRequest` to standalone component with simplified `onAddUserMessage` callback (no longer returns Promise, no longer receives raw messages array)
3. `WorkspaceUseChat.tsx` -- Extracted `ConnectionStatus` to standalone component
4. `ApertureMessage.tsx` -- Added `isSafeUrl()` URL sanitization for file parts (security improvement)
5. `ApertureToolPart.tsx` -- Extracted tool part rendering with `deriveToolName()` helper
6. `ChatErrorBoundary.tsx` -- New error boundary wrapping the conversation area
7. `WorkspaceUseChat.tsx` -- Replaced manual scroll-to-bottom logic with `Conversation` component (use-stick-to-bottom)
8. `WorkspaceUseChat.tsx` -- Added `handleAddUserMessage` callback using functional `setMessages` updater (stale closure fix)
9. `WorkspaceUseChat.tsx` -- Added `Shimmer` loading indicator during `isSending` state

**Acceptance criteria:**
Not explicitly documented in a spec file. Inferred from code comments: MED-4 fix for stale closure in permission request handler.

---

## 1) Executive Summary

**Merge Recommendation:** REQUEST_CHANGES

**Rationale:**
This change extracts ~288 lines of UI logic into 6 new component files and introduces a URL sanitization function, an error boundary, and a stale-closure fix. None of the new components or the modified behaviors have any tests. The existing `chat-transport.test.ts` suite has 17 of 22 tests failing (pre-existing, not caused by this change, but blocking CI). The `isSafeUrl` function is a security-relevant pure function that is trivially unit-testable and must have tests before merge.

**Test Coverage:** 0% of new/changed behavior (0 test files added or modified)

**Critical Gaps:**
1. **TS-1**: `isSafeUrl()` -- No tests for security-critical URL sanitization function
2. **TS-2**: `deriveToolName()` -- No tests for pure utility function
3. **TS-3**: `handleAddUserMessage` -- No tests for stale-closure fix (the stated purpose of this change)
4. **TS-4**: Pre-existing test failures -- 17 of 22 tests in `chat-transport.test.ts` are failing

**Overall Assessment:**
- Coverage: Missing (no tests for any new/changed behavior)
- Test Quality: N/A (no new tests to evaluate)
- Flakiness Risk: Low (no new async/timing patterns introduced in testable units)
- Determinism: N/A

---

## 2) Coverage Analysis

### Changed Behavior Coverage

| Behavior | File:Line | Tested? | Test Level | Coverage |
|----------|-----------|---------|------------|----------|
| `isSafeUrl()` URL sanitization | `ApertureMessage.tsx:23-30` | No | - | No tests |
| `deriveToolName()` helper | `ApertureToolPart.tsx:43-49` | No | - | No tests |
| `handleAddUserMessage` stale-closure fix | `WorkspaceUseChat.tsx:229-241` | No | - | No tests |
| Sequential part rendering (ApertureMessage) | `ApertureMessage.tsx:48-84` | No | - | No tests |
| ChatErrorBoundary recovery | `ChatErrorBoundary.tsx:20-68` | No | - | No tests |
| PermissionRequest (extracted, simplified callback) | `PermissionRequest.tsx:38-159` | No | - | No tests |
| ConnectionStatus (extracted) | `ConnectionStatus.tsx:12-22` | No | - | No tests |
| Scroll-to-bottom replaced with Conversation | `WorkspaceUseChat.tsx:269-301` | No | - | No tests |

**Coverage Summary:**
- Fully tested: 0 behaviors
- Partially tested: 0 behaviors
- Not tested: 8 behaviors

### Test Level Distribution

| Level | Tests | % of Total | Appropriate? |
|-------|-------|------------|--------------|
| Unit | 0 (new) | 0% | N/A |
| Integration | 0 (new) | 0% | N/A |
| E2E | 0 (new) | 0% | N/A |

---

## 3) Findings Table

| ID | Severity | Confidence | Category | File:Line | Issue |
|----|----------|------------|----------|-----------|-------|
| TS-1 | HIGH | High | Coverage Gap | `ApertureMessage.tsx:23-30` | No tests for security-critical `isSafeUrl()` |
| TS-2 | HIGH | High | Coverage Gap | `ApertureToolPart.tsx:43-49` | No tests for `deriveToolName()` pure function |
| TS-3 | HIGH | High | Coverage Gap | `WorkspaceUseChat.tsx:229-241` | No tests for `handleAddUserMessage` stale-closure fix |
| TS-4 | BLOCKER | High | Pre-existing Failure | `chat-transport.test.ts` | 17 of 22 tests failing -- CI is red |
| TS-5 | MED | High | Coverage Gap | `ChatErrorBoundary.tsx:20-68` | No tests for error boundary recovery behavior |
| TS-6 | MED | Med | Coverage Gap | `PermissionRequest.tsx:56-67` | No tests for `handleAskUserQuestionSubmit` logic |
| TS-7 | LOW | Med | Coverage Gap | `ConnectionStatus.tsx:12-22` | No tests for status-to-color mapping |
| TS-8 | NIT | Low | Test Organization | `sessions.test.ts` | Test file exists but has 0 tests (empty describe block) |

**Findings Summary:**
- BLOCKER: 1
- HIGH: 3
- MED: 2
- LOW: 1
- NIT: 1

**Category Breakdown:**
- Coverage gaps: 6
- Pre-existing failures: 1
- Test organization: 1

---

## 4) Findings (Detailed)

### TS-1: No Tests for `isSafeUrl()` URL Sanitization [HIGH]

**Location:** `web/src/components/chat/ApertureMessage.tsx:20-30`

**Untested Behavior:**
```typescript
const SAFE_URL_PROTOCOLS = new Set(['http:', 'https:', 'data:', 'blob:'])

function isSafeUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    return SAFE_URL_PROTOCOLS.has(parsed.protocol)
  } catch {
    return false
  }
}
```

**What's missing:**
This is a security-critical function that prevents `javascript:` and `vbscript:` protocol injection in user-controlled file URLs. No tests verify:
1. Allowed protocols (`http:`, `https:`, `data:`, `blob:`) return `true`
2. Dangerous protocols (`javascript:`, `vbscript:`, `file:`) return `false`
3. Malformed URLs return `false`
4. Edge cases: empty string, relative paths, protocol-relative URLs

**Why it matters:**
- XSS prevention -- a regression here creates a direct security vulnerability
- Pure function with zero dependencies -- trivially unit-testable
- The function is not exported, so it needs to either be exported for testing or tested via the `FilePart` component

**Scenarios not tested:**
1. `isSafeUrl('https://example.com/img.png')` -> true
2. `isSafeUrl('data:image/png;base64,abc')` -> true
3. `isSafeUrl('javascript:alert(1)')` -> false
4. `isSafeUrl('vbscript:msgbox')` -> false
5. `isSafeUrl('')` -> false
6. `isSafeUrl('not-a-url')` -> false

**Severity:** HIGH
**Confidence:** High
**Category:** Coverage Gap (Security)

**Impact:**
- XSS vulnerability if the function regresses
- No CI safety net for security-critical code path

**Suggested Test:**
```typescript
import { describe, expect, it } from 'vitest'

// isSafeUrl would need to be exported or tested indirectly via FilePart
describe('isSafeUrl', () => {
  it.each([
    ['https://example.com/image.png', true],
    ['http://example.com/image.png', true],
    ['data:image/png;base64,abc123', true],
    ['blob:http://localhost/uuid', true],
  ])('allows safe protocol: %s', (url, expected) => {
    expect(isSafeUrl(url)).toBe(expected)
  })

  it.each([
    ['javascript:alert(1)', false],
    ['javascript:alert("xss")', false],
    ['vbscript:msgbox("xss")', false],
    ['file:///etc/passwd', false],
    ['ftp://example.com/file', false],
  ])('blocks dangerous protocol: %s', (url, expected) => {
    expect(isSafeUrl(url)).toBe(expected)
  })

  it.each([
    ['', false],
    ['not-a-url', false],
    ['://missing-protocol', false],
  ])('rejects malformed URL: %s', (url, expected) => {
    expect(isSafeUrl(url)).toBe(expected)
  })
})
```

**Test level:** Unit (pure function, no I/O)

---

### TS-2: No Tests for `deriveToolName()` Pure Function [HIGH]

**Location:** `web/src/components/chat/ApertureToolPart.tsx:43-49`

**Untested Behavior:**
```typescript
function deriveToolName(part: ToolPartUnion): string {
  if (part.type === 'dynamic-tool') {
    return part.toolName
  }
  // Standard ToolUIPart type is "tool-invocation-{toolName}"
  return part.type.split('-').slice(1).join('-')
}
```

**What's missing:**
1. Dynamic tool type returns `toolName` directly
2. Standard tool invocation type correctly splits the hyphenated type string
3. Edge case: tool name containing hyphens (e.g., `tool-invocation-my-custom-tool` should yield `invocation-my-custom-tool`, which is likely wrong -- should be just `my-custom-tool`)

**Why it matters:**
- The split logic `part.type.split('-').slice(1).join('-')` looks incorrect for the documented format `tool-invocation-{toolName}`. For `tool-invocation-Bash`, this returns `invocation-Bash` not `Bash`. This is a possible logic bug inherited from the original code.
- Without tests, the intended behavior is ambiguous

**Severity:** HIGH
**Confidence:** High
**Category:** Coverage Gap + Possible Logic Bug

**Suggested Test:**
```typescript
import { describe, expect, it } from 'vitest'

describe('deriveToolName', () => {
  it('returns toolName for dynamic-tool parts', () => {
    const part = { type: 'dynamic-tool' as const, toolName: 'bash' }
    expect(deriveToolName(part)).toBe('bash')
  })

  it('extracts tool name from standard tool invocation type', () => {
    // Verify actual expected behavior:
    // If type is "tool-invocation-Bash", what should the name be?
    const part = { type: 'tool-invocation-Bash' }
    // Current code returns "invocation-Bash" -- is this intended?
    expect(deriveToolName(part)).toBe(???)
  })
})
```

**Test level:** Unit (pure function)

---

### TS-3: No Tests for `handleAddUserMessage` Stale-Closure Fix [HIGH]

**Location:** `web/src/pages/WorkspaceUseChat.tsx:229-241`

**Untested Behavior:**
```typescript
const handleAddUserMessage = useCallback(
  (content: string) => {
    const nextMessage: ApertureUIMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      metadata: { timestamp: new Date().toISOString() },
      parts: [{ type: 'text', text: content }],
    }
    setMessages((current) => [...current, nextMessage])
  },
  [setMessages]
)
```

**What's missing:**
This is the core fix described in the PR (MED-4 stale closure). The previous implementation read `messages` from closure scope and called `persistMessages([...messages, nextMessage])`. The new version uses functional `setMessages` updater. This behavioral change has no test.

**Why it matters:**
- The stale-closure bug is the primary motivation for this change
- Without a test, there is no regression safety for this fix
- The persistence path changed: previously called `persistMessages` directly; now relies on a `useEffect([messages, persistMessages])` to trigger persistence

**Scenarios not tested:**
1. Calling `handleAddUserMessage` twice rapidly produces two messages (not one overwriting the other)
2. Messages created by `handleAddUserMessage` are eventually persisted via the useEffect
3. The `setMessages` functional updater receives the latest state

**Severity:** HIGH
**Confidence:** High
**Category:** Coverage Gap (Core Fix)

**Impact:**
- The stated purpose of the change has no test proving it works
- Regression could silently reintroduce the stale-closure bug

**Suggested Test:**
This would require a React component test with `@testing-library/react` and a mock for `useChat`:

```typescript
// Conceptual test -- requires React testing setup
describe('handleAddUserMessage (stale closure fix)', () => {
  it('appends messages using functional updater to avoid stale closure', () => {
    // Arrange: render WorkspaceChatSessionReady with mocked useChat
    // Act: call handleAddUserMessage twice in quick succession
    // Assert: both messages appear in the messages array
    // (functional updater reads latest state, not stale closure)
  })
})
```

**Test level:** Integration (requires React rendering context)

---

### TS-4: Pre-existing Test Suite Failures (17/22 in chat-transport.test.ts) [BLOCKER]

**Location:** `web/src/api/chat-transport.test.ts` (multiple tests)

**Failing tests:**
17 of 22 tests in `chat-transport.test.ts` are failing. The failures appear to be caused by the mock setup not matching the current `ApertureWebSocketTransport` implementation. The `onUIChunk` mock returns a cleanup function, but `wsManager.send` is never being called, suggesting the transport's `sendMessages` method is failing before reaching the `send` call.

Additionally, `database.test.ts` has 13 failures due to a Node.js version mismatch for `better-sqlite3` (NODE_MODULE_VERSION 137 vs 127). This is an environment issue, not a code issue.

**Why it matters:**
- CI is red -- no confidence that existing behavior is preserved
- Cannot merge when the test suite is failing
- The `chat-transport.test.ts` failures may indicate the transport API changed without updating tests

**Severity:** BLOCKER
**Confidence:** High
**Category:** Pre-existing Failure

**Impact:**
- No CI gate on regressions
- Cannot determine if new changes break existing behavior

**Fix:**
1. Investigate why `chat-transport.test.ts` mocks no longer match the implementation
2. Fix or update tests to match current API
3. For `database.test.ts`: rebuild `better-sqlite3` for the correct Node version (`pnpm rebuild better-sqlite3`)

---

### TS-5: No Tests for ChatErrorBoundary Recovery [MED]

**Location:** `web/src/components/chat/ChatErrorBoundary.tsx:20-68`

**Untested Behavior:**
```typescript
export class ChatErrorBoundary extends Component<...> {
  static getDerivedStateFromError(error: Error): ChatErrorBoundaryState {
    return { error }
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ChatErrorBoundary] Render error:', error, info.componentStack)
  }

  override render() {
    if (this.state.error) {
      // Renders error UI with "Try again" button
      return (...)
    }
    return this.props.children
  }
}
```

**What's missing:**
1. Error boundary catches child render errors and displays error UI
2. "Try again" button resets the error state and re-renders children
3. `componentDidCatch` logs the error with component stack

**Why it matters:**
- Error boundaries are critical UX safety nets
- A broken error boundary means the entire page crashes instead of showing a recovery option

**Severity:** MED
**Confidence:** High
**Category:** Coverage Gap

**Suggested Test:**
```typescript
import { render, screen, fireEvent } from '@testing-library/react'

function ThrowingChild() {
  throw new Error('Test render error')
}

describe('ChatErrorBoundary', () => {
  it('catches render errors and shows error UI', () => {
    render(
      <ChatErrorBoundary>
        <ThrowingChild />
      </ChatErrorBoundary>
    )
    expect(screen.getByText('Something went wrong')).toBeInTheDocument()
    expect(screen.getByText('Test render error')).toBeInTheDocument()
  })

  it('recovers when Try Again is clicked', () => {
    // Use a component that throws on first render but not on second
    // ...
  })
})
```

**Test level:** Integration (requires React DOM rendering)

---

### TS-6: No Tests for `handleAskUserQuestionSubmit` Logic [MED]

**Location:** `web/src/components/chat/PermissionRequest.tsx:56-67`

**Untested Behavior:**
```typescript
const handleAskUserQuestionSubmit = (answers: Record<string, string>) => {
  if (!allowOption) {
    return
  }

  const answerText = Object.entries(answers)
    .map(([header, value]) => `${header}: ${value}`)
    .join('\n')

  onAddUserMessage(`My answers:\n${answerText}`)
  onRespond(permission.toolCallId, allowOption.optionId, answers)
}
```

**What's missing:**
1. When `allowOption` is null, the function returns early (no message sent, no response)
2. Answers are formatted as `header: value` pairs joined by newlines
3. Both `onAddUserMessage` and `onRespond` are called with correct arguments

**Why it matters:**
- This is the user-facing permission flow -- incorrect answer formatting or missing responses would break the agent interaction
- The `onAddUserMessage` callback signature changed from `(content: string) => Promise<void>` to `(content: string) => void` -- this contract change needs test coverage

**Severity:** MED
**Confidence:** Med (might be tested via integration/e2e elsewhere)
**Category:** Coverage Gap

**Suggested Test:**
```typescript
describe('PermissionRequest', () => {
  it('formats answers and calls both callbacks on submit', () => {
    const onAddUserMessage = vi.fn()
    const onRespond = vi.fn()

    render(
      <PermissionRequest
        permission={{
          toolCallId: 'tool-1',
          toolCall: { name: 'AskUserQuestion', rawInput: { questions: [...] } },
          options: [{ optionId: 'allow-1', kind: 'allow', name: 'Allow' }],
        }}
        onAddUserMessage={onAddUserMessage}
        onRespond={onRespond}
      />
    )

    // Simulate submitting answers
    // Assert onAddUserMessage called with formatted text
    // Assert onRespond called with correct args
  })
})
```

**Test level:** Integration (requires React rendering)

---

### TS-7: No Tests for ConnectionStatus Color Mapping [LOW]

**Location:** `web/src/components/chat/ConnectionStatus.tsx:3-10`

**Untested Behavior:**
```typescript
const statusColors: Record<string, string> = {
  connected: 'bg-success',
  connecting: 'bg-warning animate-pulse',
  reconnecting: 'bg-warning animate-pulse',
  disconnected: 'bg-(--color-text-muted)',
  error: 'bg-danger',
  ended: 'bg-(--color-text-muted)',
}
```

**What's missing:**
Each status maps to a specific CSS class. An unknown status falls back to `disconnected` styling.

**Severity:** LOW
**Confidence:** Med
**Category:** Coverage Gap

---

### TS-8: Empty Test File for sessions.test.ts [NIT]

**Location:** `web/src/stores/sessions.test.ts`

The file was listed in test output as having "0 tests". The file at `web/src/stores/sessions.test.ts` imports and sets up mocks but appears to have no test cases, or the test runner reports 0 due to import issues.

**Severity:** NIT
**Confidence:** Low (might be a test runner issue)
**Category:** Test Organization

---

## 5) Coverage Gaps Summary

### Critical Gaps (HIGH+)

**Untested behaviors:**
1. **`isSafeUrl()` URL sanitization** (TS-1)
   - Scenario: `javascript:alert(1)` passed as file URL
   - Expected: Blocked (returns `false`)
   - Risk: XSS vulnerability

2. **`deriveToolName()` name extraction** (TS-2)
   - Scenario: Standard tool type string `tool-invocation-Bash`
   - Expected: Returns correct tool name
   - Risk: Incorrect tool names displayed, possible logic bug

3. **`handleAddUserMessage` stale-closure fix** (TS-3)
   - Scenario: Two rapid permission responses
   - Expected: Both messages appended (not overwritten)
   - Risk: Regression of the primary bug this change fixes

### Important Gaps (MED)

**Partially tested behaviors:**
4. **ChatErrorBoundary** (TS-5)
   - Scenario: Child component throws during render
   - Expected: Error UI shown with recovery button
   - Risk: Full page crash on render error

5. **PermissionRequest callback contract** (TS-6)
   - Scenario: User submits answers to AskUserQuestion
   - Expected: Formatted message and permission response sent
   - Risk: Broken agent interaction flow

### Edge Cases (LOW)

**Missing boundary tests:**
- Unknown connection status string -> falls back to disconnected style
- `deriveToolName` with hyphenated tool names

---

## 6) Test Quality Issues

### Pre-existing Failures (Risk: Severe)

**Failing test suites:**
1. `chat-transport.test.ts`: 17/22 failures -- mock setup misaligned with implementation
2. `database.test.ts`: 13/13 failures -- Node.js native module version mismatch

**Immediate action needed:**
- Fix `chat-transport.test.ts` mock alignment (the `onUIChunk` mock does not appear to capture the handler correctly given current transport code)
- Rebuild `better-sqlite3` for current Node version

### Flakiness (Risk: Low)

No new flakiness sources introduced. All new code is either pure functions or React components without timing-dependent logic.

### Brittleness (Risk: Low)

No new mocking patterns introduced. The extracted components have clean prop interfaces.

### Determinism (Status: Good)

- `crypto.randomUUID()` used for message IDs (non-deterministic but appropriate for runtime; would need mocking in tests)
- `new Date().toISOString()` used for timestamps (would need mocking in tests)

---

## 7) Test Level Assessment

### Correctly Leveled Tests (existing)

- `ws-to-uichunk.test.ts` (10 tests): Unit tests for pure translator -- good
- `ui-message.test.ts` (2 tests): Unit tests for message coercion -- good
- `sessions.test.ts` (2 tests): Integration tests with store mocks -- good
- `persistence.test.ts` (29 tests): Unit tests for persistence logic -- good

### Missing Tests by Appropriate Level

**Should be unit tests (pure functions, no I/O):**
- `isSafeUrl()` -- pure function, zero dependencies
- `deriveToolName()` -- pure function, zero dependencies

**Should be integration tests (React component rendering):**
- `ChatErrorBoundary` -- requires React DOM
- `PermissionRequest` -- requires React DOM + event simulation
- `ApertureMessage` -- requires React DOM + AI SDK type mocking
- `handleAddUserMessage` -- requires React hooks context

---

## 8) Positive Observations

Things done well (for balance):

- **Good extraction pattern:** Components extracted with clean, typed interfaces (PermissionRequestProps exported)
- **Security improvement:** `isSafeUrl()` added proactively to prevent protocol injection
- **Stale closure fix:** Functional `setMessages` updater is the correct React pattern
- **Error boundary:** Proactive addition of crash recovery for the chat area
- **Existing test quality:** The `ws-to-uichunk.test.ts` and `chat-transport.test.ts` (when passing) demonstrate excellent test structure with describe blocks, edge cases, and error paths
- **Clean separation:** `isSafeUrl` and `deriveToolName` are pure functions that could be trivially tested if exported

---

## 9) Recommendations

### Must Fix (BLOCKER/HIGH)

1. **TS-4**: Fix pre-existing test failures in `chat-transport.test.ts`
   - Action: Investigate mock/implementation mismatch and update tests
   - Rationale: CI must be green before merge
   - Estimated effort: 30 minutes

2. **TS-1**: Add unit tests for `isSafeUrl()`
   - Action: Export the function and add the suggested test cases
   - Rationale: Security-critical pure function with zero test cost
   - Estimated effort: 10 minutes

3. **TS-2**: Add unit tests for `deriveToolName()`
   - Action: Export the function and test both discriminant paths; verify the split logic is correct
   - Rationale: The `slice(1)` logic may be producing wrong names
   - Estimated effort: 10 minutes

4. **TS-3**: Add at least a smoke test for `handleAddUserMessage`
   - Action: Create a minimal React rendering test verifying functional updater appends correctly
   - Rationale: This is the stated purpose of the change
   - Estimated effort: 20 minutes

### Should Fix (MED)

5. **TS-5**: Add tests for `ChatErrorBoundary`
   - Action: Add React rendering tests with a throwing child component
   - Rationale: Error boundaries are hard to verify manually
   - Estimated effort: 15 minutes

6. **TS-6**: Add tests for `PermissionRequest` callback flow
   - Action: Render with mocked callbacks, simulate answer submission
   - Rationale: Critical user-facing interaction
   - Estimated effort: 15 minutes

### Consider (LOW/NIT)

7. **TS-7**: Add tests for `ConnectionStatus` color mapping
   - Estimated effort: 5 minutes

8. **TS-8**: Investigate empty `sessions.test.ts`
   - Estimated effort: 5 minutes

### Long-term

9. Add `@testing-library/react` setup if not already configured, to enable component-level testing
10. Consider co-locating test files with components (e.g., `ApertureMessage.test.tsx` next to `ApertureMessage.tsx`)

---

## 10) Coverage Metrics

**Line coverage:** Not measured (no coverage tool configured in CI)
**Branch coverage:** Not measured
**Function coverage:** Not measured

**Uncovered functions (new):**
- `web/src/components/chat/ApertureMessage.tsx`: `isSafeUrl`, `FilePart`, `ApertureMessage`
- `web/src/components/chat/ApertureToolPart.tsx`: `ApertureToolPart`, `deriveToolName`
- `web/src/components/chat/ChatErrorBoundary.tsx`: entire class
- `web/src/components/chat/ConnectionStatus.tsx`: `ConnectionStatus`
- `web/src/components/chat/PermissionRequest.tsx`: `PermissionRequest`, `handleAskUserQuestionSubmit`

**Uncovered branches:**
- `isSafeUrl`: all branches (safe protocols, dangerous protocols, malformed URLs)
- `deriveToolName`: both discriminant branches
- `ChatErrorBoundary.render`: error state vs normal state

---

## 11) CI/Runtime Considerations

**Test runtime:**
- Total: ~5s (17 test files)
- Unit: ~2s
- Integration: ~3s

**Pre-existing failures:**
- `database.test.ts`: 13 failures (Node native module version mismatch -- environment issue)
- `chat-transport.test.ts`: 17 failures (mock/implementation mismatch -- code issue)

**Test suite health:**
- 40 tests failing out of 160 total (25% failure rate)
- 6 of 17 test files failing
- The test suite is not in a healthy state for merging

---

## 12) False Positives & Disagreements Welcome

**Where I might be wrong:**

1. **TS-2 (deriveToolName logic bug)**: The `split('-').slice(1).join('-')` may be intentionally removing only the first segment (`tool-`), in which case `tool-invocation-Bash` yielding `invocation-Bash` is by design. However, the comment says "Standard ToolUIPart type is `tool-invocation-{toolName}`", which suggests the intent is to extract just the toolName.

2. **TS-4 (pre-existing failures)**: If these failures are known and tracked separately, they may not block this specific change. However, they do prevent verifying that this change does not introduce regressions in the transport layer.

3. **TS-3 (handleAddUserMessage)**: If the stale-closure fix has been manually verified and the team accepts the risk of no automated test, this could be downgraded to MED.

4. **Component tests**: If the project convention is to not unit-test React components and rely on e2e tests instead, the MED findings (TS-5, TS-6) may be acceptable.

**How to override my findings:**
- Show an e2e test suite that covers these component behaviors
- Explain the project's testing philosophy regarding React component tests
- Provide CI history showing the pre-existing failures are tracked

I'm optimizing for test reliability and coverage of security-critical and bug-fix code paths. If there's a good reason for gaps, let's discuss!

---

*Review completed: 2026-03-16*
*Session: [phase-2-usechat](../README.md)*
