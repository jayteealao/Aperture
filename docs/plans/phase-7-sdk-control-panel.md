# Phase 7: Control Panel Refinements (SDK + Pi)

> Update SDK and Pi control panels to use ai-elements components where applicable

**Prerequisite:** Phase 0 (ai-elements installed), Phase 1 (Shiki), Phase 6 (status prop plumbing)
**Independently deployable:** Yes
**Risk:** Low — mostly cosmetic improvements to existing panels

---

## Current state

### `SdkControlPanel.tsx` (242 lines)

Right-side panel with 7 accordion sections:

| Section ID | Component | Icon | Lines |
|------------|-----------|------|-------|
| `controls` | `SdkSessionHeader` (98 lines) | Settings2 | Model selector, permission mode, interrupt |
| `usage` | `SdkUsageDisplay` (110 lines) | Activity | Cost, turns, token stats |
| `account` | `SdkAccountInfo` (91 lines) | User | Email, org, plan, auth |
| `config` | `SdkConfigControls` (124 lines) | Sliders | Thinking tokens, budget, max turns |
| `mcp` | `SdkMcpStatus` (105 lines) | Server | MCP server list with status |
| `checkpoints` | `SdkCheckpoints` (160 lines) | History | Checkpoint list with rewind |
| `commands` | `SdkCommandsList` (131 lines) | Terminal | Searchable slash-command list |

### Accordion pattern (inline)

Custom `AccordionSection` defined inline in `SdkControlPanel.tsx:209`. Uses `Set<SectionId>` for expand/collapse state. No shared accordion primitive.

### Total: 14 files, 1,560 lines in `web/src/components/sdk/`

---

## Changes

### 7.1 Create shared `PanelSection` component with Radix `Collapsible`

Create `PanelSection` directly in the shared location — both SDK and Pi panels import from here. Do NOT define it inline first and extract later (that creates unnecessary churn).

**File:** `web/src/components/ui/PanelSection.tsx`

```tsx
import * as Collapsible from '@radix-ui/react-collapsible'
import { ChevronDown } from 'lucide-react'

interface PanelSectionProps {
  title: string
  icon: React.ComponentType<{ className?: string }>
  defaultOpen?: boolean
  children: React.ReactNode
}

export function PanelSection({ title, icon: Icon, defaultOpen = false, children }: PanelSectionProps) {
  return (
    <Collapsible.Root defaultOpen={defaultOpen}>
      <Collapsible.Trigger className="flex items-center gap-2 w-full px-3 py-2 hover:bg-secondary text-sm">
        <Icon className="size-3.5" />
        <span className="flex-1 text-left">{title}</span>
        <ChevronDown className="size-3 transition-transform data-[state=open]:rotate-180" />
      </Collapsible.Trigger>
      <Collapsible.Content className="px-3 py-2">
        {children}
      </Collapsible.Content>
    </Collapsible.Root>
  )
}
```

Uses `@radix-ui/react-collapsible` (already a dependency from ai-elements). This replaces the 30-line inline `AccordionSection` + the `expandedSections` Set state management in both `SdkControlPanel` and `PiControlPanel`.

**Benefit:** Animated open/close transitions via Radix's built-in animation support. The current implementation has no animation.

### 7.2 Replace `SdkCheckpoints` with `<Checkpoint>`

**Current:** `SdkCheckpoints.tsx` (160 lines) — custom checkpoint list with preview/rewind buttons.

**New:** Use ai-elements `<Checkpoint>` component for each checkpoint entry:

```tsx
import { Checkpoint, CheckpointIcon, CheckpointTrigger } from '@/components/ai-elements/checkpoint'

function SdkCheckpoints({ sessionId }: { sessionId: string }) {
  const { checkpoints, rewindFiles } = useSdkSession(sessionId)

  if (!checkpoints?.length) return <p className="text-xs text-muted-foreground">No checkpoints yet</p>

  return (
    <div className="space-y-1">
      {checkpoints.map((cp, i) => (
        <Checkpoint key={cp.id || i}>
          <CheckpointIcon />
          <CheckpointTrigger onClick={() => rewindFiles(cp.messageId)}>
            Restore to checkpoint #{i + 1}
            {cp.hash && <span className="font-mono text-2xs ml-1">{cp.hash.slice(0, 7)}</span>}
          </CheckpointTrigger>
        </Checkpoint>
      ))}
    </div>
  )
}
```

This preserves the rewind functionality while using ai-elements styling. The dry-run preview feature (if used) stays as a modal triggered from the checkpoint action.

### 7.3 Use `<Terminal>` for log/output display

Currently no dedicated terminal/log component exists. The SDK panel shows tool results in `<pre>` tags. For any future log/output views, use ai-elements `<Terminal>`:

```tsx
import { Terminal } from '@/components/ai-elements/terminal'

<Terminal>{logOutput}</Terminal>
```

**Current usage:** No immediate replacement needed. This is an enhancement for future SDK debugging views.

### 7.4 Update `ToolInputDisplay` syntax highlighting

Already handled in Phase 1 — `SyntaxHighlighter` replaced with `CodeHighlight` component. No additional changes needed here.

### 7.5 Keep all other SDK components as-is

These components are unique to Aperture with no ai-elements equivalents:

| Component | Reason to keep |
|-----------|---------------|
| `SdkSessionHeader` | Model selector, permission mode — Aperture-specific |
| `SdkUsageDisplay` | Token/cost stats grid — Aperture-specific |
| `SdkAccountInfo` | Account info display — Aperture-specific |
| `SdkConfigControls` | Config inputs — Aperture-specific |
| `SdkMcpStatus` | MCP server status — Aperture-specific |
| `SdkCommandsList` | Slash command list — Aperture-specific |
| `ToolInputDisplay` | Tool-specific rendering — reused in Phase 3 |

---

## 7.6 Pi Control Panel — shared accordion pattern

`PiControlPanel.tsx` (currently uses its own inline accordion) should use the same `PanelSection` component from 7.1:

### Current state

`PiControlPanel` and `SdkControlPanel` both render in Workspace.tsx but self-gate: `PiControlPanel` returns `null` if `!isPiSession`, `SdkControlPanel` returns `null` if `!isSdkSession`. Both share the same `sdkPanelOpen` toggle.

### Update

Replace Pi's inline section rendering with the shared `PanelSection` from Radix Collapsible:

```tsx
// web/src/components/pi/PiControlPanel.tsx
import { PanelSection } from '@/components/ui/PanelSection'

// Sections:
<PanelSection title="Session" icon={Settings2} defaultOpen>
  {/* Model cycle, thinking level, compact, new session */}
</PanelSection>

<PanelSection title="Streaming" icon={Radio}>
  {/* Steer/follow-up — only visible when streaming */}
</PanelSection>

<PanelSection title="Session Tree" icon={GitBranch}>
  <PiSessionTree ... />
</PanelSection>

<PanelSection title="Usage" icon={Activity}>
  {/* Stats display */}
</PanelSection>
```

### Use shared `PanelSection`

Both SDK and Pi panels import `PanelSection` from `@/components/ui/PanelSection` (created in section 7.1 above). No extraction step needed — it's created in the shared location from the start.

### Keep Pi-specific components as-is

| Component | Reason to keep |
|-----------|---------------|
| `PiSessionHeader` | Pi badge, model display, thinking level — Pi-specific |
| `PiSessionTree` | Recursive branch visualization — no equivalent |
| `PiThinkingLevelSelector` | 6-level selector with cycle mode — Pi-specific |

---

## Files changed

| Action | File | Details |
|--------|------|---------|
| **Add** | `web/src/components/ui/PanelSection.tsx` | Shared Radix Collapsible section |
| **Modify** | `web/src/components/sdk/SdkControlPanel.tsx` | Use shared PanelSection |
| **Modify** | `web/src/components/sdk/SdkCheckpoints.tsx` | Use ai-elements Checkpoint |
| **Modify** | `web/src/components/pi/PiControlPanel.tsx` | Use shared PanelSection |

---

## Verification

```bash
pnpm --filter aperture-web typecheck
pnpm --filter aperture-web build

# Manual — SDK panel:
# 1. Open SDK control panel → sections expand/collapse with animation
# 2. Checkpoint list renders with icons
# 3. Click checkpoint → rewind triggers
# 4. All SDK controls still functional (model, permissions, MCP, etc.)

# Manual — Pi panel:
# 5. Open Pi control panel → sections expand/collapse with same animation
# 6. Session tree renders correctly
# 7. Thinking level selector works
# 8. Steer/follow-up visible during streaming
# 9. Model cycle button works
```
