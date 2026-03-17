// Pi SDK Control Panel - Collapsible right panel matching SDK panel design

import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Badge } from '@/components/ui/Badge'
import { Spinner } from '@/components/ui/Spinner'
import { PanelSection } from '@/components/ui/PanelSection'
import { usePiSession } from '@/hooks/usePiSession'
import type { PiSessionStats, PiModelInfo, PiForkableEntry } from '@/api/pi-types'
import {
  PanelRightClose,
  PanelRight,
  Settings2,
  Activity,
  Cpu,
  GitFork,
  Radio,
  RefreshCw,
} from 'lucide-react'

interface PiControlPanelProps {
  sessionId: string
  isStreaming: boolean
  isOpen: boolean
  onToggle: () => void
}

export function PiControlPanel({ sessionId, isStreaming, isOpen, onToggle }: PiControlPanelProps) {
  const [steerContent, setSteerContent] = useState('')
  const [followUpContent, setFollowUpContent] = useState('')
  const [compactInstructions, setCompactInstructions] = useState('')

  const {
    stats,
    models,
    forkableEntries,
    thinkingLevel,
    isPiSession,
    isLoading,
    errors,
    compact,
    newSession,
    fork,
    cycleModel,
    cycleThinking,
    refreshStats,
    refreshModels,
    refreshForkable,
    steer,
    followUp,
  } = usePiSession(sessionId)

  if (!isPiSession) {
    return null
  }

  // Collapsed state
  if (!isOpen) {
    return (
      <div className="h-full flex flex-col border-l border-(--color-border) bg-(--color-bg-secondary)">
        <Button
          variant="ghost"
          size="sm"
          onClick={onToggle}
          className="m-2"
          title="Open Pi Controls (Cmd+.)"
        >
          <PanelRight size={18} />
        </Button>
      </div>
    )
  }

  const handleSteer = () => {
    if (steerContent.trim()) {
      steer(steerContent)
      setSteerContent('')
    }
  }

  const handleFollowUp = () => {
    if (followUpContent.trim()) {
      followUp(followUpContent)
      setFollowUpContent('')
    }
  }

  const handleCompact = () => {
    compact(compactInstructions || undefined)
    setCompactInstructions('')
  }

  return (
    <div className="h-full w-[280px] flex flex-col border-l border-(--color-border) bg-(--color-bg-secondary)">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-(--color-border)">
        <h2 className="text-sm font-semibold text-(--color-text-primary)">Pi Controls</h2>
        <Button
          variant="ghost"
          size="sm"
          onClick={onToggle}
          className="h-7 w-7 p-0"
          title="Close (Cmd+.)"
        >
          <PanelRightClose size={16} />
        </Button>
      </div>

      {/* Sections */}
      <div className="flex-1 overflow-y-auto scrollbar-thin">
        <PanelSection title="Session" icon={Settings2} defaultOpen>
          <SessionSection
            thinkingLevel={thinkingLevel}
            isStreaming={isStreaming}
            compactInstructions={compactInstructions}
            onCompactInstructionsChange={setCompactInstructions}
            onCompact={handleCompact}
            onNewSession={newSession}
            onCycleModel={cycleModel}
            onCycleThinking={cycleThinking}
          />
        </PanelSection>

        <PanelSection title="Streaming" icon={Radio}>
          <StreamingSection
            isStreaming={isStreaming}
            steerContent={steerContent}
            followUpContent={followUpContent}
            onSteerContentChange={setSteerContent}
            onFollowUpContentChange={setFollowUpContent}
            onSteer={handleSteer}
            onFollowUp={handleFollowUp}
          />
        </PanelSection>

        <PanelSection title="Usage" icon={Activity} defaultOpen>
          <UsageSection
            stats={stats}
            loading={isLoading.stats || false}
            error={errors.stats}
            onRefresh={refreshStats}
          />
        </PanelSection>

        <PanelSection title="Models" icon={Cpu}>
          <ModelsSection
            models={models}
            loading={isLoading.models || false}
            error={errors.models}
            onRefresh={refreshModels}
          />
        </PanelSection>

        <PanelSection title="Forkable Messages" icon={GitFork}>
          <ForkableSection
            entries={forkableEntries}
            loading={isLoading.forkable || false}
            isStreaming={isStreaming}
            onFork={fork}
            onRefresh={refreshForkable}
          />
        </PanelSection>
      </div>

      {/* Footer */}
      <div className="px-3 py-2 border-t border-(--color-border) text-2xs text-(--color-text-muted)">
        Pi SDK Session
      </div>
    </div>
  )
}

// --- Section Content ---

function SessionSection({
  thinkingLevel,
  isStreaming,
  compactInstructions,
  onCompactInstructionsChange,
  onCompact,
  onNewSession,
  onCycleModel,
  onCycleThinking,
}: {
  thinkingLevel: string
  isStreaming: boolean
  compactInstructions: string
  onCompactInstructionsChange: (v: string) => void
  onCompact: () => void
  onNewSession: () => void
  onCycleModel: () => void
  onCycleThinking: () => void
}) {
  return (
    <div className="space-y-2">
      <div className="flex gap-1.5">
        <Button onClick={onCycleModel} size="sm" variant="outline" className="flex-1 text-xs" disabled={isStreaming} title="Switch to the next available Pi model">
          Cycle Model
        </Button>
        <Button onClick={onCycleThinking} size="sm" variant="outline" className="flex-1 text-xs" disabled={isStreaming} title="Cycle through thinking intensity levels (auto → low → medium → high → max → none)">
          Thinking: {thinkingLevel}
        </Button>
      </div>
      <div className="flex gap-1.5">
        <Input
          placeholder="Compact instructions..."
          value={compactInstructions}
          onChange={(e) => onCompactInstructionsChange(e.target.value)}
          className="flex-1 text-xs"
          disabled={isStreaming}
        />
        <Button onClick={onCompact} size="sm" variant="secondary" disabled={isStreaming} title="Summarise the conversation to reduce context length">
          Compact
        </Button>
      </div>
      <Button onClick={onNewSession} variant="outline" size="sm" disabled={isStreaming} className="w-full text-xs">
        New Session
      </Button>
    </div>
  )
}

function StreamingSection({
  isStreaming,
  steerContent,
  followUpContent,
  onSteerContentChange,
  onFollowUpContentChange,
  onSteer,
  onFollowUp,
}: {
  isStreaming: boolean
  steerContent: string
  followUpContent: string
  onSteerContentChange: (v: string) => void
  onFollowUpContentChange: (v: string) => void
  onSteer: () => void
  onFollowUp: () => void
}) {
  if (!isStreaming) {
    return (
      <p className="text-xs text-(--color-text-muted)">
        Streaming controls available while the model is generating.
      </p>
    )
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-1.5">
        <Input
          placeholder="Steer (interrupt)..."
          value={steerContent}
          onChange={(e) => onSteerContentChange(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && onSteer()}
          className="flex-1 text-xs"
        />
        <Button onClick={onSteer} size="sm" variant="secondary" title="Interrupt the current stream with new direction">
          Steer
        </Button>
      </div>
      <div className="flex gap-1.5">
        <Input
          placeholder="Follow-up (queue)..."
          value={followUpContent}
          onChange={(e) => onFollowUpContentChange(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && onFollowUp()}
          className="flex-1 text-xs"
        />
        <Button onClick={onFollowUp} size="sm" variant="secondary" title="Queue a follow-up message to send after the current stream finishes">
          Queue
        </Button>
      </div>
    </div>
  )
}

function UsageSection({
  stats,
  loading,
  error,
  onRefresh,
}: {
  stats: PiSessionStats | null
  loading: boolean
  error?: string
  onRefresh: () => void
}) {
  return (
    <div className="space-y-2">
      <div className="flex justify-end">
        <Button onClick={onRefresh} size="sm" variant="ghost" disabled={loading} className="h-6 w-6 p-0">
          {loading ? <Spinner className="h-3.5 w-3.5" /> : <RefreshCw size={14} />}
        </Button>
      </div>
      {error && <p className="text-xs text-danger">{error}</p>}
      {stats ? (
        <div className="space-y-1 text-xs">
          <div className="flex justify-between">
            <span className="text-(--color-text-muted)">Input Tokens</span>
            <span className="text-(--color-text-secondary)">{stats.inputTokens.toLocaleString()}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-(--color-text-muted)">Output Tokens</span>
            <span className="text-(--color-text-secondary)">{stats.outputTokens.toLocaleString()}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-(--color-text-muted)">Total Cost</span>
            <span className="text-(--color-text-secondary)">${stats.totalCost.toFixed(4)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-(--color-text-muted)">Turns</span>
            <span className="text-(--color-text-secondary)">{stats.turnCount}</span>
          </div>
        </div>
      ) : (
        <p className="text-xs text-(--color-text-muted)">No stats yet. Send a message to begin.</p>
      )}
    </div>
  )
}

function ModelsSection({
  models,
  loading,
  error,
  onRefresh,
}: {
  models: PiModelInfo[]
  loading: boolean
  error?: string
  onRefresh: () => void
}) {
  return (
    <div className="space-y-2">
      <div className="flex justify-end">
        <Button onClick={onRefresh} size="sm" variant="ghost" disabled={loading} className="h-6 w-6 p-0">
          {loading ? <Spinner className="h-3.5 w-3.5" /> : <RefreshCw size={14} />}
        </Button>
      </div>
      {error && <p className="text-xs text-danger">{error}</p>}
      {models.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {models.map((model) => (
            <Badge key={`${model.provider}-${model.modelId}`} variant="outline" className="text-xs">
              {model.provider}/{model.modelId}
              {model.supportsThinking && ' *'}
            </Badge>
          ))}
        </div>
      ) : (
        <p className="text-xs text-(--color-text-muted)">No models loaded yet.</p>
      )}
    </div>
  )
}

function ForkableSection({
  entries,
  loading,
  isStreaming,
  onFork,
  onRefresh,
}: {
  entries: PiForkableEntry[]
  loading: boolean
  isStreaming: boolean
  onFork: (entryId: string) => void
  onRefresh: () => void
}) {
  return (
    <div className="space-y-2">
      <div className="flex justify-end">
        <Button onClick={onRefresh} size="sm" variant="ghost" disabled={loading} className="h-6 w-6 p-0">
          {loading ? <Spinner className="h-3.5 w-3.5" /> : <RefreshCw size={14} />}
        </Button>
      </div>
      {entries.length > 0 ? (
        <div className="space-y-1.5 max-h-40 overflow-y-auto">
          {entries.map((entry) => (
            <div key={entry.id} className="flex items-center gap-1.5 text-xs">
              <span
                className="flex-1 truncate text-(--color-text-muted)"
                title={entry.content}
              >
                {entry.content.slice(0, 50)}...
              </span>
              <Button onClick={() => onFork(entry.id)} size="sm" variant="outline" disabled={isStreaming} className="text-xs h-6 px-2" title="Fork a new session branching from this message">
                Fork
              </Button>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-(--color-text-muted)">No branch points yet. Branch-capable messages will appear here during a session.</p>
      )}
    </div>
  )
}
