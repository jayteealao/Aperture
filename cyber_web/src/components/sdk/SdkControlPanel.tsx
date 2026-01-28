import { cn } from '@/utils/cn'
import {
  HUDLabel,
  HUDMicro,
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
  Button,
  IconButton,
  Badge,
  StatCard,
  Select,
  Spinner,
} from '@/components/ui'
import { useSdkSession } from '@/hooks/useSdkSession'
import {
  Settings,
  BarChart3,
  Cpu,
  RefreshCw,
  User,
  Bot,
  Server,
} from 'lucide-react'
import type { PermissionMode } from '@/api/types'

interface SdkControlPanelProps {
  sessionId: string
  className?: string
}

export function SdkControlPanel({ sessionId, className }: SdkControlPanelProps) {
  const {
    config,
    usage,
    accountInfo,
    models,
    mcpStatus,
    loading,
    setModel,
    setThinkingTokens,
    setPermissionMode,
    getModels,
    getMcpStatus,
    getAccountInfo,
  } = useSdkSession(sessionId)

  return (
    <div className={cn('h-full flex flex-col bg-hud-black/50', className)}>
      {/* Header */}
      <div className="shrink-0 p-4 border-b border-hud-gray/30">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 flex items-center justify-center border border-hud-info">
            <Bot className="w-4 h-4 text-hud-info" />
          </div>
          <div>
            <HUDLabel className="text-hud-info">Claude SDK</HUDLabel>
            <HUDMicro>Control Panel</HUDMicro>
          </div>
        </div>
      </div>

      {/* Accordion sections */}
      <div className="flex-1 overflow-y-auto scrollbar-hide">
        <Accordion type="multiple" defaultValue={['config', 'usage']}>
          {/* Configuration Section */}
          <AccordionItem id="config">
            <AccordionTrigger
              id="config"
              icon={<Settings className="w-4 h-4" />}
            >
              Configuration
            </AccordionTrigger>
            <AccordionContent id="config">
              <div className="space-y-4">
                {/* Model Selection */}
                <Select
                  label="Model"
                  value={config?.model || 'sonnet'}
                  onChange={(v) => setModel(v)}
                  options={models.map((m) => ({
                    value: m.value,
                    label: m.displayName,
                    description: m.description,
                  }))}
                />

                {/* Thinking Tokens */}
                <div>
                  <HUDMicro className="mb-2">Thinking Tokens</HUDMicro>
                  <div className="flex gap-2">
                    {[null, 1024, 4096, 8192, 16384].map((tokens) => (
                      <Button
                        key={tokens ?? 'off'}
                        variant={config?.maxThinkingTokens === tokens ? 'primary' : 'outline'}
                        size="sm"
                        onClick={() => setThinkingTokens(tokens)}
                      >
                        {tokens ? `${(tokens / 1024).toFixed(0)}k` : 'Off'}
                      </Button>
                    ))}
                  </div>
                </div>

                {/* Permission Mode */}
                <Select
                  label="Permission Mode"
                  value={config?.permissionMode || 'default'}
                  onChange={(v) => setPermissionMode(v as PermissionMode)}
                  options={[
                    { value: 'default', label: 'Default', description: 'Ask for each action' },
                    { value: 'acceptEdits', label: 'Accept Edits', description: 'Auto-approve file edits' },
                    { value: 'bypassPermissions', label: 'Bypass All', description: 'Skip all permission checks' },
                    { value: 'plan', label: 'Plan Mode', description: 'Plan without executing' },
                  ]}
                />
              </div>
            </AccordionContent>
          </AccordionItem>

          {/* Usage Section */}
          <AccordionItem id="usage">
            <AccordionTrigger
              id="usage"
              icon={<BarChart3 className="w-4 h-4" />}
            >
              Usage
            </AccordionTrigger>
            <AccordionContent id="usage">
              {usage ? (
                <div className="grid grid-cols-2 gap-4">
                  <StatCard
                    label="Turns"
                    value={usage.numTurns}
                  />
                  <StatCard
                    label="Total Cost"
                    value={`$${usage.totalCostUsd.toFixed(4)}`}
                    accent
                  />
                  <StatCard
                    label="Duration"
                    value={`${(usage.durationMs / 1000).toFixed(1)}s`}
                  />
                  <StatCard
                    label="API Time"
                    value={`${(usage.durationApiMs / 1000).toFixed(1)}s`}
                  />
                </div>
              ) : (
                <HUDMicro className="text-hud-text/50">No usage data yet</HUDMicro>
              )}
            </AccordionContent>
          </AccordionItem>

          {/* Account Section */}
          <AccordionItem id="account">
            <AccordionTrigger
              id="account"
              icon={<User className="w-4 h-4" />}
              badge={
                <IconButton
                  icon={<RefreshCw className="w-3 h-3" />}
                  label="Refresh"
                  size="sm"
                  variant="ghost"
                  onClick={(e) => {
                    e.stopPropagation()
                    getAccountInfo()
                  }}
                />
              }
            >
              Account
            </AccordionTrigger>
            <AccordionContent id="account">
              {loading.accountInfo ? (
                <div className="flex justify-center py-4">
                  <Spinner size="sm" />
                </div>
              ) : accountInfo ? (
                <div className="space-y-2">
                  {accountInfo.email && (
                    <div className="flex justify-between">
                      <HUDMicro>Email</HUDMicro>
                      <HUDMicro className="text-hud-white">{accountInfo.email}</HUDMicro>
                    </div>
                  )}
                  {accountInfo.organization && (
                    <div className="flex justify-between">
                      <HUDMicro>Organization</HUDMicro>
                      <HUDMicro className="text-hud-white">{accountInfo.organization}</HUDMicro>
                    </div>
                  )}
                  {accountInfo.subscriptionType && (
                    <div className="flex justify-between">
                      <HUDMicro>Subscription</HUDMicro>
                      <Badge variant="outline" size="sm">{accountInfo.subscriptionType}</Badge>
                    </div>
                  )}
                  {accountInfo.tokenSource && (
                    <div className="flex justify-between">
                      <HUDMicro>Token Source</HUDMicro>
                      <HUDMicro className="text-hud-white">{accountInfo.tokenSource}</HUDMicro>
                    </div>
                  )}
                </div>
              ) : (
                <HUDMicro className="text-hud-text/50">No account info available</HUDMicro>
              )}
            </AccordionContent>
          </AccordionItem>

          {/* Models Section */}
          <AccordionItem id="models">
            <AccordionTrigger
              id="models"
              icon={<Cpu className="w-4 h-4" />}
              badge={
                <>
                  <Badge variant="outline" size="sm">{models.length}</Badge>
                  <IconButton
                    icon={<RefreshCw className="w-3 h-3" />}
                    label="Refresh"
                    size="sm"
                    variant="ghost"
                    onClick={(e) => {
                      e.stopPropagation()
                      getModels()
                    }}
                  />
                </>
              }
            >
              Available Models
            </AccordionTrigger>
            <AccordionContent id="models">
              {loading.models ? (
                <div className="flex justify-center py-4">
                  <Spinner size="sm" />
                </div>
              ) : models.length > 0 ? (
                <div className="space-y-2">
                  {models.map((model) => (
                    <div
                      key={model.value}
                      className={cn(
                        'flex items-center justify-between p-2 border border-hud-gray/30',
                        config?.model === model.value && 'border-hud-accent/50 bg-hud-accent/5'
                      )}
                    >
                      <div>
                        <HUDMicro className="text-hud-white">{model.displayName}</HUDMicro>
                        <HUDMicro className="text-hud-text/50">{model.description}</HUDMicro>
                      </div>
                      {config?.model === model.value && (
                        <Badge variant="accent" size="sm">Active</Badge>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <HUDMicro className="text-hud-text/50">No models available</HUDMicro>
              )}
            </AccordionContent>
          </AccordionItem>

          {/* MCP Servers Section */}
          <AccordionItem id="mcp">
            <AccordionTrigger
              id="mcp"
              icon={<Server className="w-4 h-4" />}
              badge={
                <>
                  <Badge variant="outline" size="sm">{mcpStatus.length}</Badge>
                  <IconButton
                    icon={<RefreshCw className="w-3 h-3" />}
                    label="Refresh"
                    size="sm"
                    variant="ghost"
                    onClick={(e) => {
                      e.stopPropagation()
                      getMcpStatus()
                    }}
                  />
                </>
              }
            >
              MCP Servers
            </AccordionTrigger>
            <AccordionContent id="mcp">
              {loading.mcpStatus ? (
                <div className="flex justify-center py-4">
                  <Spinner size="sm" />
                </div>
              ) : mcpStatus.length > 0 ? (
                <div className="space-y-2">
                  {mcpStatus.map((server) => (
                    <div
                      key={server.name}
                      className="flex items-center justify-between p-2 border border-hud-gray/30"
                    >
                      <div>
                        <HUDMicro className="text-hud-white">{server.name}</HUDMicro>
                        {server.serverInfo && (
                          <HUDMicro className="text-hud-text/50">
                            v{server.serverInfo.version}
                          </HUDMicro>
                        )}
                      </div>
                      <Badge
                        variant={
                          server.status === 'connected'
                            ? 'success'
                            : server.status === 'failed'
                              ? 'error'
                              : 'warning'
                        }
                        size="sm"
                      >
                        {server.status}
                      </Badge>
                    </div>
                  ))}
                </div>
              ) : (
                <HUDMicro className="text-hud-text/50">No MCP servers configured</HUDMicro>
              )}
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </div>
    </div>
  )
}
