import React from 'react'
import { cn } from '@/utils/cn'
import {
  HUDLabel,
  HUDMicro,
  HUDSeparator,
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
  Button,
  IconButton,
  Badge,
  StatCard,
  Spinner,
  Input,
} from '@/components/ui'
import { usePiSession } from '@/hooks/usePiSession'
import {
  Settings,
  Zap,
  BarChart3,
  Cpu,
  GitBranch,
  RefreshCw,
  Brain,
  ArrowRight,
  Plus,
  Minus,
  Compass,
} from 'lucide-react'
import type { PiForkableEntry, PiModelInfo } from '@/api/pi-types'

interface PiControlPanelProps {
  sessionId: string
  className?: string
}

export function PiControlPanel({ sessionId, className }: PiControlPanelProps) {
  const {
    stats,
    models,
    thinkingLevel,
    forkableEntries,
    isLoading,
    cycleModel,
    cycleThinking,
    compact,
    newSession,
    steer,
    followUp,
    fork,
    refreshStats,
    refreshForkable,
  } = usePiSession(sessionId)

  // Check if streaming is active based on session state
  const isStreaming = false // TODO: Connect to actual streaming state

  return (
    <div className={cn('h-full flex flex-col bg-hud-black/50', className)}>
      {/* Header */}
      <div className="shrink-0 p-4 border-b border-hud-gray/30">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 flex items-center justify-center border border-hud-success">
            <Cpu className="w-4 h-4 text-hud-success" />
          </div>
          <div>
            <HUDLabel className="text-hud-success">Pi SDK</HUDLabel>
            <HUDMicro>Control Panel</HUDMicro>
          </div>
        </div>
      </div>

      {/* Accordion sections */}
      <div className="flex-1 overflow-y-auto scrollbar-hide">
        <Accordion type="multiple" defaultValue={['session', 'usage']}>
          {/* Session Section */}
          <AccordionItem id="session">
            <AccordionTrigger
              id="session"
              icon={<Settings className="w-4 h-4" />}
              badge={<Badge variant="outline" size="sm">{thinkingLevel || 'off'}</Badge>}
            >
              Session
            </AccordionTrigger>
            <AccordionContent id="session">
              <div className="space-y-3">
                {/* Model Cycle */}
                <div className="flex items-center justify-between">
                  <HUDMicro>Model</HUDMicro>
                  <Button variant="outline" size="sm" onClick={cycleModel}>
                    Cycle Model
                  </Button>
                </div>

                {/* Thinking Level Cycle */}
                <div className="flex items-center justify-between">
                  <HUDMicro>Thinking</HUDMicro>
                  <Button variant="outline" size="sm" onClick={cycleThinking}>
                    <Brain className="w-3 h-3 mr-1" />
                    {thinkingLevel || 'off'}
                  </Button>
                </div>

                <HUDSeparator className="my-2" />

                {/* Compact Context */}
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full justify-start"
                  onClick={() => compact()}
                >
                  <Minus className="w-3 h-3 mr-2" />
                  Compact Context
                </Button>

                {/* New Session */}
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full justify-start"
                  onClick={newSession}
                >
                  <Plus className="w-3 h-3 mr-2" />
                  New Session
                </Button>
              </div>
            </AccordionContent>
          </AccordionItem>

          {/* Streaming Section - Only when streaming */}
          {isStreaming && (
            <AccordionItem id="streaming">
              <AccordionTrigger
                id="streaming"
                icon={<Zap className="w-4 h-4" />}
                badge={<Badge variant="accent" size="sm" pulse>Active</Badge>}
              >
                Streaming
              </AccordionTrigger>
              <AccordionContent id="streaming">
                <StreamingControls sessionId={sessionId} steer={steer} followUp={followUp} />
              </AccordionContent>
            </AccordionItem>
          )}

          {/* Usage Section */}
          <AccordionItem id="usage">
            <AccordionTrigger
              id="usage"
              icon={<BarChart3 className="w-4 h-4" />}
              badge={
                <IconButton
                  icon={<RefreshCw className="w-3 h-3" />}
                  label="Refresh"
                  size="sm"
                  variant="ghost"
                  onClick={(e) => {
                    e.stopPropagation()
                    refreshStats()
                  }}
                />
              }
            >
              Usage
            </AccordionTrigger>
            <AccordionContent id="usage">
              {isLoading.stats ? (
                <div className="flex justify-center py-4">
                  <Spinner size="sm" />
                </div>
              ) : stats ? (
                <div className="grid grid-cols-2 gap-4">
                  <StatCard
                    label="Input Tokens"
                    value={stats.inputTokens.toLocaleString()}
                  />
                  <StatCard
                    label="Output Tokens"
                    value={stats.outputTokens.toLocaleString()}
                  />
                  <StatCard
                    label="Total Cost"
                    value={`$${stats.totalCost.toFixed(4)}`}
                    accent
                  />
                  <StatCard
                    label="Turns"
                    value={stats.turnCount}
                  />
                </div>
              ) : (
                <HUDMicro className="text-hud-text/50">No usage data</HUDMicro>
              )}
            </AccordionContent>
          </AccordionItem>

          {/* Models Section */}
          <AccordionItem id="models">
            <AccordionTrigger
              id="models"
              icon={<Cpu className="w-4 h-4" />}
              badge={
                <Badge variant="outline" size="sm">
                  {models.length}
                </Badge>
              }
            >
              Models
            </AccordionTrigger>
            <AccordionContent id="models">
              {isLoading.models ? (
                <div className="flex justify-center py-4">
                  <Spinner size="sm" />
                </div>
              ) : models.length > 0 ? (
                <div className="space-y-2">
                  {models.map((model) => (
                    <ModelItem key={`${model.provider}-${model.modelId}`} model={model} />
                  ))}
                </div>
              ) : (
                <HUDMicro className="text-hud-text/50">No models available</HUDMicro>
              )}
            </AccordionContent>
          </AccordionItem>

          {/* Forkable Section */}
          <AccordionItem id="forkable">
            <AccordionTrigger
              id="forkable"
              icon={<GitBranch className="w-4 h-4" />}
              badge={
                <>
                  <Badge variant="outline" size="sm">
                    {forkableEntries.length}
                  </Badge>
                  <IconButton
                    icon={<RefreshCw className="w-3 h-3" />}
                    label="Refresh"
                    size="sm"
                    variant="ghost"
                    onClick={(e) => {
                      e.stopPropagation()
                      refreshForkable()
                    }}
                  />
                </>
              }
            >
              Forkable
            </AccordionTrigger>
            <AccordionContent id="forkable">
              {isLoading.forkable ? (
                <div className="flex justify-center py-4">
                  <Spinner size="sm" />
                </div>
              ) : forkableEntries.length > 0 ? (
                <div className="space-y-2">
                  {forkableEntries.map((entry) => (
                    <ForkableItem key={entry.id} entry={entry} onFork={() => fork(entry.id)} />
                  ))}
                </div>
              ) : (
                <HUDMicro className="text-hud-text/50">No forkable entries</HUDMicro>
              )}
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </div>
    </div>
  )
}

interface StreamingControlsProps {
  sessionId: string
  steer: (content: string) => void
  followUp: (content: string) => void
}

function StreamingControls({ steer, followUp }: StreamingControlsProps) {
  const [steerInput, setSteerInput] = React.useState('')
  const [followUpInput, setFollowUpInput] = React.useState('')

  const handleSteer = () => {
    if (steerInput.trim()) {
      steer(steerInput.trim())
      setSteerInput('')
    }
  }

  const handleFollowUp = () => {
    if (followUpInput.trim()) {
      followUp(followUpInput.trim())
      setFollowUpInput('')
    }
  }

  return (
    <div className="space-y-4">
      {/* Steer (interrupt) */}
      <div>
        <HUDMicro className="mb-2">Steer (Interrupt)</HUDMicro>
        <div className="flex gap-2">
          <Input
            value={steerInput}
            onChange={(e) => setSteerInput(e.target.value)}
            placeholder="Redirect conversation..."
            className="flex-1"
          />
          <Button variant="primary" size="sm" onClick={handleSteer}>
            <Compass className="w-3 h-3" />
          </Button>
        </div>
      </div>

      {/* Follow-up (queue) */}
      <div>
        <HUDMicro className="mb-2">Follow-up (Queue)</HUDMicro>
        <div className="flex gap-2">
          <Input
            value={followUpInput}
            onChange={(e) => setFollowUpInput(e.target.value)}
            placeholder="Queue next message..."
            className="flex-1"
          />
          <Button variant="outline" size="sm" onClick={handleFollowUp}>
            <ArrowRight className="w-3 h-3" />
          </Button>
        </div>
      </div>
    </div>
  )
}

interface ModelItemProps {
  model: PiModelInfo
}

function ModelItem({ model }: ModelItemProps) {
  return (
    <div className="flex items-center justify-between p-2 border border-hud-gray/30 hover:border-hud-gray/50 transition-colors">
      <div>
        <HUDMicro className="text-hud-white">{model.displayName}</HUDMicro>
        <HUDMicro className="text-hud-text/50">{model.provider}</HUDMicro>
      </div>
      {model.supportsThinking && (
        <Badge variant="success" size="sm">
          <Brain className="w-3 h-3 mr-1" />
          Thinking
        </Badge>
      )}
    </div>
  )
}

interface ForkableItemProps {
  entry: PiForkableEntry
  onFork: () => void
}

function ForkableItem({ entry, onFork }: ForkableItemProps) {
  return (
    <div className="flex items-start justify-between p-2 border border-hud-gray/30 hover:border-hud-accent/30 transition-colors">
      <div className="flex-1 min-w-0">
        <HUDMicro className="text-hud-white truncate">{entry.content.slice(0, 50)}...</HUDMicro>
        <HUDMicro className="text-hud-text/50">
          {new Date(entry.timestamp).toLocaleTimeString()}
        </HUDMicro>
      </div>
      <IconButton
        icon={<GitBranch className="w-3 h-3" />}
        label="Fork at this point"
        variant="ghost"
        size="sm"
        onClick={onFork}
      />
    </div>
  )
}
