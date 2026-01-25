// SDK Control Panel - Main collapsible right panel for SDK session controls

import { useState, useCallback } from 'react'
import { cn } from '@/utils/cn'
import { Button } from '@/components/ui/Button'
import { useSdkSession } from '@/hooks/useSdkSession'
import { useSessionsStore } from '@/stores/sessions'
import { SdkSessionHeader } from './SdkSessionHeader'
import { SdkUsageDisplay } from './SdkUsageDisplay'
import { SdkAccountInfo } from './SdkAccountInfo'
import { SdkConfigControls } from './SdkConfigControls'
import { SdkMcpStatus } from './SdkMcpStatus'
import { SdkCheckpoints } from './SdkCheckpoints'
import { SdkCommandsList } from './SdkCommandsList'
import {
  PanelRightClose,
  PanelRight,
  ChevronDown,
  ChevronRight,
  Settings2,
  Activity,
  User,
  Sliders,
  Server,
  History,
  Terminal,
} from 'lucide-react'

interface SdkControlPanelProps {
  sessionId: string
  isOpen: boolean
  onToggle: () => void
}

type SectionId = 'controls' | 'usage' | 'account' | 'config' | 'mcp' | 'checkpoints' | 'commands'

interface Section {
  id: SectionId
  title: string
  icon: React.ReactNode
}

const SECTIONS: Section[] = [
  { id: 'controls', title: 'Session', icon: <Settings2 size={14} /> },
  { id: 'usage', title: 'Usage', icon: <Activity size={14} /> },
  { id: 'account', title: 'Account', icon: <User size={14} /> },
  { id: 'config', title: 'Configuration', icon: <Sliders size={14} /> },
  { id: 'mcp', title: 'MCP Servers', icon: <Server size={14} /> },
  { id: 'checkpoints', title: 'Checkpoints', icon: <History size={14} /> },
  { id: 'commands', title: 'Commands', icon: <Terminal size={14} /> },
]

export function SdkControlPanel({ sessionId, isOpen, onToggle }: SdkControlPanelProps) {
  const [expandedSections, setExpandedSections] = useState<Set<SectionId>>(
    new Set(['controls', 'usage'])
  )

  const { connections } = useSessionsStore()
  const connection = connections[sessionId]
  const isStreaming = connection?.isStreaming || false

  const {
    isSdkSession,
    config,
    usage,
    accountInfo,
    models,
    commands,
    mcpStatus,
    checkpoints,
    loading,
    errors,
    rewindResult,
    setModel,
    setPermissionMode,
    interrupt,
    setThinkingTokens,
    updateConfig,
    getCommands,
    getMcpStatus,
    rewindFiles,
    clearRewindResult,
  } = useSdkSession(sessionId)

  const toggleSection = useCallback((sectionId: SectionId) => {
    setExpandedSections((prev) => {
      const next = new Set(prev)
      if (next.has(sectionId)) {
        next.delete(sectionId)
      } else {
        next.add(sectionId)
      }
      return next
    })
  }, [])

  // Don't render for non-SDK sessions
  if (!isSdkSession) {
    return null
  }

  // Collapsed state - just show toggle button
  if (!isOpen) {
    return (
      <div className="h-full flex flex-col border-l border-[var(--color-border)] bg-[var(--color-bg-secondary)]">
        <Button
          variant="ghost"
          size="sm"
          onClick={onToggle}
          className="m-2"
          title="Open SDK Controls (Cmd+.)"
        >
          <PanelRight size={18} />
        </Button>
      </div>
    )
  }

  return (
    <div className="h-full w-[280px] flex flex-col border-l border-[var(--color-border)] bg-[var(--color-bg-secondary)]">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--color-border)]">
        <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">SDK Controls</h2>
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
        {SECTIONS.map((section) => (
          <AccordionSection
            key={section.id}
            title={section.title}
            icon={section.icon}
            isExpanded={expandedSections.has(section.id)}
            onToggle={() => toggleSection(section.id)}
          >
            {section.id === 'controls' && (
              <SdkSessionHeader
                config={config}
                models={models}
                loading={loading}
                errors={errors}
                isStreaming={isStreaming}
                onModelChange={setModel}
                onPermissionModeChange={setPermissionMode}
                onInterrupt={interrupt}
              />
            )}
            {section.id === 'usage' && <SdkUsageDisplay usage={usage} />}
            {section.id === 'account' && (
              <SdkAccountInfo
                accountInfo={accountInfo}
                loading={loading.accountInfo || false}
                error={errors.accountInfo}
              />
            )}
            {section.id === 'config' && (
              <SdkConfigControls
                config={config}
                onThinkingTokensChange={setThinkingTokens}
                onConfigUpdate={updateConfig}
              />
            )}
            {section.id === 'mcp' && (
              <SdkMcpStatus
                mcpStatus={mcpStatus}
                loading={loading.mcpStatus || false}
                error={errors.mcpStatus}
                onRefresh={getMcpStatus}
              />
            )}
            {section.id === 'checkpoints' && (
              <SdkCheckpoints
                checkpoints={checkpoints}
                loading={loading.checkpoints || false}
                rewindResult={rewindResult}
                onRewind={rewindFiles}
                onClearResult={clearRewindResult}
              />
            )}
            {section.id === 'commands' && (
              <SdkCommandsList
                commands={commands}
                loading={loading.commands || false}
                error={errors.commands}
                onRefresh={getCommands}
              />
            )}
          </AccordionSection>
        ))}
      </div>

      {/* Footer */}
      <div className="px-3 py-2 border-t border-[var(--color-border)] text-2xs text-[var(--color-text-muted)]">
        Claude SDK Session
      </div>
    </div>
  )
}

function AccordionSection({
  title,
  icon,
  isExpanded,
  onToggle,
  children,
}: {
  title: string
  icon: React.ReactNode
  isExpanded: boolean
  onToggle: () => void
  children: React.ReactNode
}) {
  return (
    <div className="border-b border-[var(--color-border)]">
      <button
        onClick={onToggle}
        className={cn(
          'w-full flex items-center gap-2 px-3 py-2 text-left',
          'hover:bg-[var(--color-surface-hover)] transition-colors'
        )}
      >
        {isExpanded ? (
          <ChevronDown size={14} className="text-[var(--color-text-muted)]" />
        ) : (
          <ChevronRight size={14} className="text-[var(--color-text-muted)]" />
        )}
        <span className="text-[var(--color-text-muted)]">{icon}</span>
        <span className="text-sm font-medium text-[var(--color-text-secondary)]">{title}</span>
      </button>
      {isExpanded && <div className="px-3 pb-3">{children}</div>}
    </div>
  )
}
