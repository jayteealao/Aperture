// SDK Session Header - Model selector, permission mode, interrupt button

import { FormSelect } from '@/components/ui/form-select'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/Spinner'
import { StopCircle } from 'lucide-react'
import type { PermissionMode, ModelInfo, SdkSessionConfig } from '@/api/types'

const PERMISSION_MODES: Array<{ value: PermissionMode; label: string }> = [
  { value: 'default', label: 'Default' },
  { value: 'acceptEdits', label: 'Accept Edits' },
  { value: 'bypassPermissions', label: 'Bypass All' },
  { value: 'plan', label: 'Plan Mode' },
  { value: 'dontAsk', label: "Don't Ask" },
]

interface SdkSessionHeaderProps {
  config?: SdkSessionConfig
  models: ModelInfo[]
  loading: { models?: boolean }
  errors: { models?: string }
  isStreaming: boolean
  onModelChange: (model?: string) => void
  onPermissionModeChange: (mode: PermissionMode) => void
  onInterrupt: () => void
}

export function SdkSessionHeader({
  config,
  models,
  loading,
  errors,
  isStreaming,
  onModelChange,
  onPermissionModeChange,
  onInterrupt,
}: SdkSessionHeaderProps) {
  // Check if models require sending a prompt first (only if no models available)
  const modelsNeedPrompt = models.length === 0 && errors.models?.includes('No active query')
  const modelOptions = models.map((m) => ({
    value: m.value,
    label: m.displayName,
  }))

  return (
    <div className="space-y-3">
      {/* Model Selector */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label className="text-xs font-medium text-muted-foreground">
            Model
          </label>
          {loading.models && <Spinner size="sm" />}
        </div>
        {modelsNeedPrompt ? (
          <div className="text-xs text-foreground/40 py-2">
            Send a prompt to load models
          </div>
        ) : (
          <FormSelect
            options={modelOptions}
            value={config?.model || ''}
            onChange={(e) => onModelChange(e.target.value || undefined)}
            placeholder="Default model"
            disabled={loading.models || modelOptions.length === 0}
            className="text-xs"
          />
        )}
      </div>

      {/* Permission Mode */}
      <div>
        <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
          Permission Mode
        </label>
        <FormSelect
          options={PERMISSION_MODES}
          value={config?.permissionMode || 'default'}
          onChange={(e) => onPermissionModeChange(e.target.value as PermissionMode)}
          className="text-xs"
        />
      </div>

      {/* Interrupt Button */}
      {isStreaming && (
        <Button
          variant="destructive"
          size="sm"
          onClick={onInterrupt}
          leftIcon={<StopCircle size={16} />}
          className="w-full"
        >
          Interrupt
        </Button>
      )}
    </div>
  )
}
