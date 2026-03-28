// SDK Control Panel - Main collapsible right panel for SDK session controls

import { useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { PanelSection } from '@/components/ui/PanelSection'
import { useSdkSession } from '@/hooks/useSdkSession'
import { SdkUsageDisplay } from './SdkUsageDisplay'
import { SdkAccountInfo } from './SdkAccountInfo'
import { SdkMcpStatus } from './SdkMcpStatus'
import { SdkCheckpoints } from './SdkCheckpoints'
import { SdkCommandsList } from './SdkCommandsList'
import { SdkRuntimeStatus } from './SdkRuntimeStatus'
import { SdkRuntimeActivity } from './SdkRuntimeActivity'
import {
  PanelRightClose,
  Activity,
  User,
  Server,
  History,
  Terminal,
  Bot,
} from 'lucide-react'

interface SdkControlPanelProps {
  sessionId: string
  connected: boolean
  isOpen: boolean
  onToggle: () => void
}

export function SdkControlPanel({ sessionId, connected, isOpen, onToggle }: SdkControlPanelProps) {

  const {
    isSdkSession,
    usage,
    accountInfo,
    commands,
    mcpStatus,
    mcpUpdateResult,
    checkpoints,
    authStatus,
    runtimeStatus,
    runtimeActivity,
    loading,
    errors,
    rewindResult,
    getCommands,
    getMcpStatus,
    getAccountInfo,
    getCheckpoints,
    rewindFiles,
    clearRewindResult,
    clearRuntimeActivity,
  } = useSdkSession(sessionId)
  const hasLoadedRef = useRef(false)

  useEffect(() => {
    if (!isOpen || !connected || !isSdkSession || hasLoadedRef.current) {
      return
    }

    hasLoadedRef.current = true
    getCommands()
    getMcpStatus()
    getAccountInfo()
    void getCheckpoints()
  }, [connected, getAccountInfo, getCheckpoints, getCommands, getMcpStatus, isOpen, isSdkSession])

  // Don't render for non-SDK sessions or when closed
  // (the toggle lives in the top header bar, not here)
  if (!isSdkSession || !isOpen) {
    return null
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
        <PanelSection title="Usage" icon={Activity} defaultOpen>
          <SdkUsageDisplay usage={usage} />
        </PanelSection>

        <PanelSection title="Runtime" icon={Bot} defaultOpen>
          <div className="space-y-4">
            <SdkRuntimeStatus
              authStatus={authStatus}
              runtimeStatus={runtimeStatus}
              mcpUpdateResult={mcpUpdateResult}
            />
            <SdkRuntimeActivity
              activity={runtimeActivity}
              onClear={clearRuntimeActivity}
            />
          </div>
        </PanelSection>

        <PanelSection title="Account" icon={User}>
          <SdkAccountInfo
            accountInfo={accountInfo}
            loading={loading.accountInfo || false}
            error={errors.accountInfo}
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
