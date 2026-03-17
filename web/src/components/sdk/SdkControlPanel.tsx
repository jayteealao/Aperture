// SDK Control Panel - Main collapsible right panel for SDK session controls

import { Button } from '@/components/ui/Button'
import { PanelSection } from '@/components/ui/PanelSection'
import { useSdkSession } from '@/hooks/useSdkSession'
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
  isStreaming: boolean
  isOpen: boolean
  onToggle: () => void
}

export function SdkControlPanel({ sessionId, isStreaming, isOpen, onToggle }: SdkControlPanelProps) {

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

  // Don't render for non-SDK sessions
  if (!isSdkSession) {
    return null
  }

  // Collapsed state - just show toggle button
  if (!isOpen) {
    return (
      <div className="h-full flex flex-col border-l border-border bg-card">
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
    <div className="h-full w-[280px] flex flex-col border-l border-border bg-card">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <h2 className="text-sm font-semibold text-foreground">SDK Controls</h2>
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
        </PanelSection>

        <PanelSection title="Usage" icon={Activity} defaultOpen>
          <SdkUsageDisplay usage={usage} />
        </PanelSection>

        <PanelSection title="Account" icon={User}>
          <SdkAccountInfo
            accountInfo={accountInfo}
            loading={loading.accountInfo || false}
            error={errors.accountInfo}
          />
        </PanelSection>

        <PanelSection title="Configuration" icon={Sliders}>
          <SdkConfigControls
            config={config}
            onThinkingTokensChange={setThinkingTokens}
            onConfigUpdate={updateConfig}
          />
        </PanelSection>

        <PanelSection title="MCP Servers" icon={Server}>
          <SdkMcpStatus
            mcpStatus={mcpStatus}
            loading={loading.mcpStatus || false}
            error={errors.mcpStatus}
            onRefresh={getMcpStatus}
          />
        </PanelSection>

        <PanelSection title="Checkpoints" icon={History}>
          <SdkCheckpoints
            checkpoints={checkpoints}
            loading={loading.checkpoints || false}
            rewindResult={rewindResult}
            onRewind={rewindFiles}
            onClearResult={clearRewindResult}
          />
        </PanelSection>

        <PanelSection title="Commands" icon={Terminal}>
          <SdkCommandsList
            commands={commands}
            loading={loading.commands || false}
            error={errors.commands}
            onRefresh={getCommands}
          />
        </PanelSection>
      </div>

      {/* Footer */}
      <div className="px-3 py-2 border-t border-border text-2xs text-foreground/40">
        Claude SDK Session
      </div>
    </div>
  )
}
