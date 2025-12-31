import { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAppStore } from '@/stores/app'
import { api } from '@/api/client'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Card, CardHeader, CardContent } from '@/components/ui/Card'
import { Check, X, Zap, Shield, Globe } from 'lucide-react'

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

  const from = (location.state as { from?: { pathname: string } })?.from?.pathname || '/workspace'

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

    try {
      // Test health endpoint
      await api.checkHealth()
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
      if (test.health !== 'success') {
        setTest((t) => ({ ...t, health: 'error' }))
      }
    }
  }

  return (
    <div className="min-h-screen bg-gradient-mesh flex items-center justify-center p-4">
      <div className="w-full max-w-md animate-in">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-accent flex items-center justify-center mb-4 shadow-lg shadow-accent/30">
            <svg viewBox="0 0 24 24" className="w-10 h-10" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="9" />
              <circle cx="12" cy="12" r="4" />
            </svg>
          </div>
          <h1 className="text-3xl font-bold text-[var(--color-text-primary)]">Aperture</h1>
          <p className="text-[var(--color-text-secondary)] mt-2">AI Workspace for ACP Agents</p>
        </div>

        {/* Connection Card */}
        <Card variant="glass" padding="lg" className="mb-6">
          <CardHeader
            title="Connect to Gateway"
            subtitle="Enter your Aperture Gateway URL and authentication token"
          />
          <CardContent>
            <div className="space-y-4">
              <Input
                label="Gateway URL"
                placeholder="http://localhost:8080"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                leftIcon={<Globe size={18} />}
                disabled={step === 'testing'}
              />

              <Input
                label="API Token"
                type="password"
                placeholder="Enter your bearer token"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                leftIcon={<Shield size={18} />}
                disabled={step === 'testing'}
                hint="Your token is stored securely in this browser session"
              />

              {/* Error message */}
              {error && (
                <div className="p-3 rounded-lg bg-danger/10 border border-danger/20">
                  <p className="text-sm text-danger">{error}</p>
                </div>
              )}

              {/* Connection test results */}
              {step !== 'idle' && (
                <div className="space-y-2 pt-2">
                  <TestResult label="Health Check" status={test.health} />
                  <TestResult
                    label="Readiness Check"
                    status={test.ready}
                    detail={test.claudePath ? `Claude: ${test.claudePath}` : undefined}
                  />
                  {test.errors?.map((err, i) => (
                    <p key={i} className="text-xs text-danger pl-6">{err}</p>
                  ))}
                </div>
              )}

              <Button
                variant="primary"
                size="lg"
                className="w-full mt-4"
                onClick={handleConnect}
                loading={step === 'testing'}
                disabled={step === 'success'}
              >
                {step === 'success' ? (
                  <>
                    <Check size={18} />
                    Connected!
                  </>
                ) : step === 'testing' ? (
                  'Testing Connection...'
                ) : (
                  <>
                    <Zap size={18} />
                    Connect
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Features */}
        <div className="grid grid-cols-3 gap-4 text-center">
          <Feature icon={<Zap size={20} />} label="Fast" />
          <Feature icon={<Shield size={20} />} label="Secure" />
          <Feature icon={<Globe size={20} />} label="Multi-Agent" />
        </div>

        {/* Version */}
        <p className="text-center text-xs text-[var(--color-text-muted)] mt-8">
          Aperture Web v1.0.0
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
    pending: <div className="w-4 h-4 rounded-full border-2 border-[var(--color-text-muted)] animate-pulse" />,
    success: <Check size={16} className="text-success" />,
    error: <X size={16} className="text-danger" />,
  }

  return (
    <div className="flex items-center gap-2">
      {icons[status]}
      <span className="text-sm text-[var(--color-text-secondary)]">{label}</span>
      {detail && (
        <span className="text-xs text-[var(--color-text-muted)] ml-auto font-mono truncate max-w-[150px]">
          {detail}
        </span>
      )}
    </div>
  )
}

function Feature({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="flex flex-col items-center gap-2 p-3 rounded-lg glass">
      <span className="text-accent">{icon}</span>
      <span className="text-xs text-[var(--color-text-secondary)]">{label}</span>
    </div>
  )
}
