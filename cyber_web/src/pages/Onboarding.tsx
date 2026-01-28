import React from 'react'
import { useNavigate } from 'react-router-dom'
import { cn } from '@/utils/cn'
import {
  GridContainer,
  HUDLabel,
  HUDMicro,
  HUDTitle,
  HUDDisplay,
  HUDSeparator,
  Input,
  Button,
  StatusDot,
  Card,
} from '@/components/ui'
import { useAppStore } from '@/stores'
import { api } from '@/api/client'
import { Wifi, WifiOff, CheckCircle, AlertCircle, Loader2 } from 'lucide-react'

type ConnectionState = 'idle' | 'testing' | 'success' | 'error'

export function OnboardingPage() {
  const navigate = useNavigate()
  const { gatewayUrl, apiToken, setGatewayUrl, setApiToken, setConnected } = useAppStore()

  const [localUrl, setLocalUrl] = React.useState(gatewayUrl || 'http://localhost:8080')
  const [localToken, setLocalToken] = React.useState(apiToken || '')
  const [connectionState, setConnectionState] = React.useState<ConnectionState>('idle')
  const [errorMessage, setErrorMessage] = React.useState('')

  const handleTest = async () => {
    setConnectionState('testing')
    setErrorMessage('')

    try {
      // Configure API client temporarily
      api.configure(localUrl, localToken)

      // Test connection
      const health = await api.checkHealth()
      const ready = await api.checkReady()

      if (health.status === 'ok' && ready.status === 'ok') {
        setConnectionState('success')
        // Save to store after successful test
        setGatewayUrl(localUrl)
        setApiToken(localToken)
        setConnected(true)
      } else {
        throw new Error('Gateway not ready')
      }
    } catch (error) {
      setConnectionState('error')
      setErrorMessage(error instanceof Error ? error.message : 'Connection failed')
      setConnected(false)
    }
  }

  const handleContinue = () => {
    navigate('/sessions')
  }

  return (
    <GridContainer className="min-h-screen flex items-center justify-center p-8" showGrid showVignette>
      <div className="w-full max-w-lg">
        {/* Header */}
        <div className="text-center mb-12">
          <div className="relative inline-block mb-6">
            {/* Animated aperture logo */}
            <div className="w-24 h-24 relative mx-auto">
              <div className="absolute inset-0 border-2 border-hud-accent rounded-full animate-pulse-glow" />
              <div className="absolute inset-2 border border-hud-accent/50 rounded-full" />
              <div className="absolute inset-4 border border-dashed border-hud-accent/30 rounded-full animate-spin-slow" />
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-4 h-4 bg-hud-accent rounded-full animate-pulse" />
              </div>
            </div>
          </div>

          <HUDDisplay className="text-hud-accent text-glow-accent">APERTURE</HUDDisplay>
          <HUDLabel className="block mt-2 text-hud-text">// Cyber Interface v1.1.0</HUDLabel>
        </div>

        {/* Connection Card */}
        <Card variant="bordered" corners crosshairs className="relative">
          <div className="p-6">
            {/* Card Header */}
            <div className="flex items-center justify-between mb-6">
              <div>
                <HUDTitle className="text-lg">Gateway Connection</HUDTitle>
                <HUDMicro className="mt-1">Configure your Aperture gateway endpoint</HUDMicro>
              </div>
              <ConnectionStatusIndicator state={connectionState} />
            </div>

            <HUDSeparator />

            {/* Form */}
            <div className="space-y-4 mt-6">
              <Input
                label="Gateway URL"
                value={localUrl}
                onChange={(e) => setLocalUrl(e.target.value)}
                placeholder="http://localhost:8080"
                icon={<Wifi className="w-4 h-4" />}
              />

              <Input
                label="API Token"
                type="password"
                value={localToken}
                onChange={(e) => setLocalToken(e.target.value)}
                placeholder="Enter your bearer token"
                hint="Token will be stored in session storage"
              />

              {/* Error message */}
              {connectionState === 'error' && (
                <div className="flex items-center gap-2 p-3 bg-hud-error/10 border border-hud-error/30">
                  <AlertCircle className="w-4 h-4 text-hud-error shrink-0" />
                  <span className="text-sm text-hud-error">{errorMessage}</span>
                </div>
              )}

              {/* Success message */}
              {connectionState === 'success' && (
                <div className="flex items-center gap-2 p-3 bg-hud-success/10 border border-hud-success/30">
                  <CheckCircle className="w-4 h-4 text-hud-success shrink-0" />
                  <span className="text-sm text-hud-success">Connection established successfully</span>
                </div>
              )}
            </div>

            <HUDSeparator />

            {/* Actions */}
            <div className="flex justify-end gap-3 mt-6">
              <Button
                variant="outline"
                onClick={handleTest}
                loading={connectionState === 'testing'}
                disabled={!localUrl || !localToken}
              >
                Test Connection
              </Button>
              <Button
                variant="primary"
                onClick={handleContinue}
                disabled={connectionState !== 'success'}
              >
                Continue
              </Button>
            </div>
          </div>

          {/* Decorative data readouts */}
          <div className="absolute -bottom-6 left-4 font-mono text-3xs text-hud-text/40 flex gap-4">
            <span>SYS::INIT</span>
            <span>NET::READY</span>
            <span>AUTH::PENDING</span>
          </div>
        </Card>

        {/* Footer */}
        <div className="mt-12 text-center">
          <HUDMicro className="text-hud-text/50">
            Aperture Gateway // WebSocket + HTTP Interface for AI Agents
          </HUDMicro>
        </div>
      </div>

      {/* Decorative elements */}
      <DecorativeElements />
    </GridContainer>
  )
}

function ConnectionStatusIndicator({ state }: { state: ConnectionState }) {
  const configs = {
    idle: { icon: WifiOff, color: 'text-hud-text', label: 'Disconnected' },
    testing: { icon: Loader2, color: 'text-hud-warning', label: 'Testing...' },
    success: { icon: CheckCircle, color: 'text-hud-success', label: 'Connected' },
    error: { icon: AlertCircle, color: 'text-hud-error', label: 'Error' },
  }

  const config = configs[state]
  const Icon = config.icon

  return (
    <div className="flex items-center gap-2">
      <Icon
        className={cn(
          'w-5 h-5',
          config.color,
          state === 'testing' && 'animate-spin'
        )}
      />
      <div className="text-right">
        <HUDMicro className={config.color}>{config.label}</HUDMicro>
        <StatusDot
          status={
            state === 'success'
              ? 'connected'
              : state === 'error'
                ? 'error'
                : state === 'testing'
                  ? 'connecting'
                  : 'disconnected'
          }
          pulse={state === 'testing' || state === 'success'}
        />
      </div>
    </div>
  )
}

function DecorativeElements() {
  return (
    <>
      {/* Top left coordinates */}
      <div className="fixed top-4 left-4 font-mono text-3xs text-hud-text/30">
        <div>X: 0.00</div>
        <div>Y: 0.00</div>
      </div>

      {/* Top right data */}
      <div className="fixed top-4 right-4 font-mono text-3xs text-hud-text/30 text-right">
        <div>SECTOR: A1</div>
        <div>NODE: PRIMARY</div>
      </div>

      {/* Bottom data strips */}
      <div className="fixed bottom-4 left-4 right-4 flex justify-between font-mono text-3xs text-hud-text/20">
        <span>// STREAM SEARCH FOUNDATION</span>
        <span>// PIPELINE FUNCTION</span>
        <span>// PRIME MODE</span>
      </div>
    </>
  )
}
