import { useState } from 'react'
import { useNavigate, useLocation } from 'react-router'
import { useAppStore } from '@/stores/app'
import { api } from '@/api/client'
import { Button } from '@/components/ui/button'
import { InputField } from '@/components/ui/input-field'
import { Card, CardContent } from '@/components/ui/card'
import { Check, X, Aperture, Globe, Shield } from 'lucide-react'

type ConnectionStep = 'idle' | 'testing' | 'success' | 'error'

interface ConnectionTest {
  health: 'pending' | 'success' | 'error'
  ready: 'pending' | 'success' | 'error'
  claudePath?: string
  errors?: string[]
}

export default function Onboarding() {
  const navigate = useNavigate()
  const location = useLocation()
  const { setGatewayUrl, setApiToken, setConnected } = useAppStore()

  const [url, setUrl] = useState('http://localhost:8080')
  const [token, setToken] = useState('')
  const [step, setStep] = useState<ConnectionStep>('idle')
  const [test, setTest] = useState<ConnectionTest>({ health: 'pending', ready: 'pending' })
  const [error, setError] = useState('')

  const from = (location.state as { from?: { pathname: string } })?.from?.pathname || '/workspaces'

  async function handleConnect() {
    if (!url || !token) {
      setError('Please enter both URL and token')
      return
    }

    setStep('testing')
    setError('')
    setTest({ health: 'pending', ready: 'pending' })

    // Configure API client
    api.configure(url, token)

    let healthPassed = false

    try {
      // Test health endpoint
      await api.checkHealth()
      healthPassed = true
      setTest((t) => ({ ...t, health: 'success' }))

      // Test readiness endpoint
      const ready = await api.checkReady()
      if (ready.status === 'ready') {
        setTest((t) => ({
          ...t,
          ready: 'success',
          claudePath: ready.claudePath,
        }))
      } else {
        setTest((t) => ({
          ...t,
          ready: 'error',
          errors: ready.errors,
        }))
        throw new Error('Gateway not ready')
      }

      // Success!
      setStep('success')

      // Save credentials and navigate
      setGatewayUrl(url)
      setApiToken(token)
      setConnected(true)

      setTimeout(() => {
        navigate(from, { replace: true })
      }, 1500)
    } catch (err) {
      setStep('error')
      setError(err instanceof Error ? err.message : 'Connection failed')

      // Update test states based on where we failed
      if (!healthPassed) {
        setTest((t) => ({ ...t, health: 'error' }))
      }
    }
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-sm stagger-in">
        {/* Brand mark */}
        <div className="text-center mb-10">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-accent/15 text-accent flex items-center justify-center mb-5">
            <Aperture size={28} strokeWidth={1.5} />
          </div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Aperture</h1>
          <p className="text-sm text-muted-foreground mt-1.5">
            Connect to your gateway to get started.
          </p>
        </div>

        {/* Connection form — no card wrapper, just the form */}
        <div className="space-y-4 mb-8">
          <InputField
            label="Gateway URL"
            placeholder="http://localhost:8080"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            leftIcon={<Globe size={16} />}
            disabled={step === 'testing'}
          />

          <InputField
            label="API Token"
            type="password"
            placeholder="Enter your bearer token"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            leftIcon={<Shield size={16} />}
            disabled={step === 'testing'}
            hint="Stored in this browser session only"
          />

          {/* Error message */}
          {error && (
            <div className="p-3 rounded-lg bg-danger/10 border border-danger/20">
              <p className="text-sm text-danger">{error}</p>
            </div>
          )}

          {/* Connection test results */}
          {step !== 'idle' && (
            <div className="space-y-2 pt-1">
              <TestResult label="Health" status={test.health} />
              <TestResult
                label="Ready"
                status={test.ready}
                detail={test.claudePath ? `Claude: ${test.claudePath}` : undefined}
              />
              {test.errors?.map((err, i) => (
                <p key={i} className="text-xs text-danger pl-6">{err}</p>
              ))}
            </div>
          )}

          <Button
            variant="default"
            size="lg"
            className="w-full"
            onClick={handleConnect}
            loading={step === 'testing'}
            disabled={step === 'success'}
          >
            {step === 'success' ? (
              <>
                <Check size={16} />
                Connected
              </>
            ) : step === 'testing' ? (
              'Connecting...'
            ) : (
              'Connect'
            )}
          </Button>
        </div>

        {/* Version — minimal */}
        <p className="text-center text-xs text-foreground/30 font-mono">
          v1.0.0
        </p>
      </div>
    </div>
  )
}

function TestResult({
  label,
  status,
  detail,
}: {
  label: string
  status: 'pending' | 'success' | 'error'
  detail?: string
}) {
  const icons = {
    pending: <div className="w-4 h-4 rounded-full border-2 border-foreground/40 animate-pulse" />,
    success: <Check size={16} className="text-success" />,
    error: <X size={16} className="text-danger" />,
  }

  return (
    <div className="flex items-center gap-2">
      {icons[status]}
      <span className="text-sm text-muted-foreground">{label}</span>
      {detail && (
        <span className="text-xs text-foreground/40 ml-auto font-mono truncate max-w-[150px]">
          {detail}
        </span>
      )}
    </div>
  )
}
