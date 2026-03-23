import { useEffect, useMemo, useRef } from 'react'
import type { ClaudeEffort, PermissionMode } from '@/api/types'
import { useSdkSession } from '@/hooks/useSdkSession'
import {
  PromptInputSelect,
  PromptInputSelectContent,
  PromptInputSelectItem,
  PromptInputSelectTrigger,
  PromptInputSelectValue,
} from '@/components/ai-elements/prompt-input'

const PERMISSION_MODES: Array<{ value: PermissionMode; label: string }> = [
  { value: 'default', label: 'Default' },
  { value: 'acceptEdits', label: 'Accept edits' },
  { value: 'bypassPermissions', label: 'Bypass' },
  { value: 'plan', label: 'Plan' },
  { value: 'dontAsk', label: "Don't ask" },
]

const THINKING_OPTIONS = [
  { value: 'auto', label: 'Thinking: Auto', tokens: null },
  { value: '4000', label: 'Think 4k', tokens: 4000 },
  { value: '8000', label: 'Think 8k', tokens: 8000 },
  { value: '16000', label: 'Think 16k', tokens: 16000 },
  { value: '32000', label: 'Think 32k', tokens: 32000 },
] as const

const EFFORT_OPTIONS: Array<{ value: ClaudeEffort; label: string }> = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'max', label: 'Max' },
]

function getThinkingValue(tokens: number | undefined) {
  if (tokens == null) {
    return 'auto'
  }

  const preset = THINKING_OPTIONS.find((option) => option.tokens === tokens)
  return preset?.value ?? String(tokens)
}

function getThinkingLabel(tokens: number | undefined) {
  if (tokens == null) {
    return 'Thinking: Auto'
  }

  const preset = THINKING_OPTIONS.find((option) => option.tokens === tokens)
  return preset?.label ?? `Think ${tokens.toLocaleString()}`
}

interface SdkComposerControlsProps {
  sessionId: string
  connected: boolean
  /**
   * 'toolbar' — renders only the model selector inline (default).
   * 'overflow' — renders permission mode, thinking tokens, and effort
   *              as a labeled vertical stack for use inside a popover.
   */
  variant?: 'toolbar' | 'overflow'
}

export function SdkComposerControls({
  sessionId,
  connected,
  variant = 'toolbar',
}: SdkComposerControlsProps) {
  const { isSdkSession, config, models, getModels, setModel, setPermissionMode, setThinkingTokens, setEffort } =
    useSdkSession(sessionId)
  const hasRequestedModels = useRef(false)

  useEffect(() => {
    if (!isSdkSession || !connected || hasRequestedModels.current) {
      return
    }

    hasRequestedModels.current = true
    getModels()
  }, [connected, getModels, isSdkSession])

  const modelOptions = useMemo(() => {
    const currentModel = config?.model
    const options = models.map((model) => ({
      value: model.value,
      label: model.displayName || model.value,
    }))

    if (currentModel && !options.some((option) => option.value === currentModel)) {
      options.unshift({ value: currentModel, label: currentModel })
    }

    return options
  }, [config?.model, models])

  if (!isSdkSession) {
    return null
  }

  const toolbarTriggerClassName =
    'h-7 min-w-0 max-w-[9rem] rounded-md px-2 text-xs [&>span]:truncate'
  const overflowTriggerClassName =
    'h-7 w-full rounded-md px-2 text-xs [&>span]:truncate'
  const modelValue = config?.model ?? '__default__'
  const thinkingValue = getThinkingValue(config?.maxThinkingTokens)
  const effortValue = config?.effort ?? 'medium'

  // ── Toolbar variant: model selector only ─────────────────────────────────
  if (variant === 'toolbar') {
    return (
      <div className="flex min-w-0 items-center gap-1">
        <PromptInputSelect
          disabled={!connected}
          onValueChange={(value) => setModel(value === '__default__' ? undefined : value)}
          value={modelValue}
        >
          <PromptInputSelectTrigger className={toolbarTriggerClassName}>
            <PromptInputSelectValue placeholder="Model" />
          </PromptInputSelectTrigger>
          <PromptInputSelectContent>
            <PromptInputSelectItem value="__default__">Default model</PromptInputSelectItem>
            {modelOptions.map((option) => (
              <PromptInputSelectItem key={option.value} value={option.value}>
                {option.label}
              </PromptInputSelectItem>
            ))}
          </PromptInputSelectContent>
        </PromptInputSelect>
      </div>
    )
  }

  // ── Overflow variant: permission mode + thinking + effort ─────────────────
  return (
    <div className="flex flex-col gap-0.5 p-1">
      {/* Permission mode */}
      <div className="flex items-center justify-between gap-2 px-1 py-0.5">
        <span className="shrink-0 text-xs text-muted-foreground">Permission</span>
        <PromptInputSelect
          disabled={!connected}
          onValueChange={(value) => setPermissionMode(value as PermissionMode)}
          value={config?.permissionMode ?? 'default'}
        >
          <PromptInputSelectTrigger className={overflowTriggerClassName}>
            <PromptInputSelectValue placeholder="Mode" />
          </PromptInputSelectTrigger>
          <PromptInputSelectContent>
            {PERMISSION_MODES.map((option) => (
              <PromptInputSelectItem key={option.value} value={option.value}>
                {option.label}
              </PromptInputSelectItem>
            ))}
          </PromptInputSelectContent>
        </PromptInputSelect>
      </div>

      {/* Thinking tokens */}
      <div className="flex items-center justify-between gap-2 px-1 py-0.5">
        <span className="shrink-0 text-xs text-muted-foreground">Thinking</span>
        <PromptInputSelect
          disabled={!connected}
          onValueChange={(value) => {
            const next = THINKING_OPTIONS.find((option) => option.value === value)
            setThinkingTokens(next?.tokens ?? null)
          }}
          value={thinkingValue}
        >
          <PromptInputSelectTrigger className={overflowTriggerClassName}>
            <PromptInputSelectValue aria-label={getThinkingLabel(config?.maxThinkingTokens)} />
          </PromptInputSelectTrigger>
          <PromptInputSelectContent>
            {THINKING_OPTIONS.map((option) => (
              <PromptInputSelectItem key={option.value} value={option.value}>
                {option.label}
              </PromptInputSelectItem>
            ))}
          </PromptInputSelectContent>
        </PromptInputSelect>
      </div>

      {/* Effort */}
      <div className="flex items-center justify-between gap-2 px-1 py-0.5">
        <span className="shrink-0 text-xs text-muted-foreground">Effort</span>
        <PromptInputSelect
          disabled={!connected}
          onValueChange={(value) => setEffort(value as ClaudeEffort)}
          value={effortValue}
        >
          <PromptInputSelectTrigger className={overflowTriggerClassName}>
            <PromptInputSelectValue placeholder="Effort" />
          </PromptInputSelectTrigger>
          <PromptInputSelectContent>
            {EFFORT_OPTIONS.map((option) => (
              <PromptInputSelectItem key={option.value} value={option.value}>
                {option.label}
              </PromptInputSelectItem>
            ))}
          </PromptInputSelectContent>
        </PromptInputSelect>
      </div>
    </div>
  )
}
