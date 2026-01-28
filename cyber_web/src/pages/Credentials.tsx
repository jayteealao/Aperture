import React from 'react'
import {
  HUDLabel,
  HUDMicro,
  HUDTitle,
  HUDSeparator,
  Card,
  Button,
  IconButton,
  Badge,
  Input,
  Select,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogBody,
  DialogFooter,
  ConfirmDialog,
  Skeleton,
} from '@/components/ui'
import { Shell, Topbar, Sidebar } from '@/components/layout'
import { useAppStore } from '@/stores'
import { api } from '@/api/client'
import type { Credential, ProviderKey } from '@/api/types'
import {
  Plus,
  KeyRound,
  Trash2,
  RefreshCw,
  Eye,
  EyeOff,
  Shield,
} from 'lucide-react'

const PROVIDERS: { value: ProviderKey; label: string; description: string }[] = [
  { value: 'anthropic', label: 'Anthropic', description: 'Claude API' },
  { value: 'openai', label: 'OpenAI', description: 'GPT API' },
  { value: 'google', label: 'Google', description: 'Gemini API' },
  { value: 'groq', label: 'Groq', description: 'Fast inference' },
  { value: 'openrouter', label: 'OpenRouter', description: 'Multi-provider' },
]

export function CredentialsPage() {
  const { sidebarOpen } = useAppStore()
  const [credentials, setCredentials] = React.useState<Credential[]>([])
  const [isLoading, setIsLoading] = React.useState(true)
  const [isNewDialogOpen, setIsNewDialogOpen] = React.useState(false)
  const [deleteCredential, setDeleteCredential] = React.useState<Credential | null>(null)

  // Load credentials on mount
  React.useEffect(() => {
    loadCredentials()
  }, [])

  const loadCredentials = async () => {
    setIsLoading(true)
    try {
      const response = await api.listCredentials()
      setCredentials(response.credentials)
    } catch (error) {
      console.error('Failed to load credentials:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleDelete = async () => {
    if (!deleteCredential) return
    try {
      await api.deleteCredential(deleteCredential.id)
      setCredentials((prev) => prev.filter((c) => c.id !== deleteCredential.id))
      setDeleteCredential(null)
    } catch (error) {
      console.error('Failed to delete credential:', error)
    }
  }

  return (
    <Shell
      sidebarOpen={sidebarOpen}
      rightPanelOpen={false}
      topbar={<Topbar />}
      sidebar={<Sidebar />}
    >
      <div className="flex-1 overflow-auto p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <HUDTitle>Credential Vault</HUDTitle>
            <HUDMicro className="mt-1">Securely manage API keys</HUDMicro>
          </div>
          <div className="flex items-center gap-3">
            <IconButton
              icon={<RefreshCw className="w-4 h-4" />}
              label="Refresh"
              variant="outline"
              onClick={loadCredentials}
            />
            <Button
              variant="primary"
              icon={<Plus className="w-4 h-4" />}
              onClick={() => setIsNewDialogOpen(true)}
            >
              Add Credential
            </Button>
          </div>
        </div>

        {/* Security notice */}
        <Card variant="ghost" className="mb-6">
          <div className="flex items-start gap-3">
            <Shield className="w-5 h-5 text-hud-success shrink-0 mt-0.5" />
            <div>
              <HUDLabel className="text-hud-success">Encrypted Storage</HUDLabel>
              <HUDMicro className="mt-1">
                All API keys are encrypted at rest using AES-256 encryption. Keys are only
                decrypted when needed for API requests.
              </HUDMicro>
            </div>
          </div>
        </Card>

        <HUDSeparator />

        {/* Credentials list */}
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-6">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} variant="rectangular" height={120} />
            ))}
          </div>
        ) : credentials.length === 0 ? (
          <EmptyState onAdd={() => setIsNewDialogOpen(true)} />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-6">
            {credentials.map((credential) => (
              <CredentialCard
                key={credential.id}
                credential={credential}
                onDelete={() => setDeleteCredential(credential)}
              />
            ))}
          </div>
        )}
      </div>

      {/* New Credential Dialog */}
      <NewCredentialDialog
        open={isNewDialogOpen}
        onOpenChange={setIsNewDialogOpen}
        onSuccess={(credential) => {
          setCredentials((prev) => [...prev, credential])
          setIsNewDialogOpen(false)
        }}
      />

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={!!deleteCredential}
        onOpenChange={(open) => !open && setDeleteCredential(null)}
        title="Delete Credential"
        description={`Are you sure you want to delete "${deleteCredential?.label}"? This action cannot be undone.`}
        confirmLabel="Delete"
        variant="danger"
        onConfirm={handleDelete}
      />
    </Shell>
  )
}

interface CredentialCardProps {
  credential: Credential
  onDelete: () => void
}

function CredentialCard({ credential, onDelete }: CredentialCardProps) {
  const provider = PROVIDERS.find((p) => p.value === credential.provider)

  return (
    <Card variant="bordered" corners>
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 flex items-center justify-center border border-hud-accent">
            <KeyRound className="w-5 h-5 text-hud-accent" />
          </div>
          <div>
            <HUDLabel className="text-hud-white">{credential.label}</HUDLabel>
            <HUDMicro className="mt-0.5">{provider?.label || credential.provider}</HUDMicro>
          </div>
        </div>
        <IconButton
          icon={<Trash2 className="w-4 h-4" />}
          label="Delete credential"
          variant="ghost"
          size="sm"
          className="text-hud-error"
          onClick={onDelete}
        />
      </div>

      <HUDSeparator className="my-3" />

      <div className="flex items-center justify-between">
        <HUDMicro className="text-hud-text/50">
          Created {new Date(credential.createdAt).toLocaleDateString()}
        </HUDMicro>
        <Badge variant="outline" size="sm">
          {credential.id.slice(0, 8)}
        </Badge>
      </div>
    </Card>
  )
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-16">
      <div className="w-20 h-20 mb-6 relative">
        <div className="absolute inset-0 border border-hud-gray rounded-full" />
        <div className="absolute inset-2 border border-dashed border-hud-gray/50 rounded-full" />
        <div className="absolute inset-0 flex items-center justify-center">
          <KeyRound className="w-8 h-8 text-hud-text/30" />
        </div>
      </div>
      <HUDTitle className="text-lg text-hud-text">No Credentials</HUDTitle>
      <HUDMicro className="mt-2 mb-6">Add API keys to use stored authentication</HUDMicro>
      <Button variant="primary" icon={<Plus className="w-4 h-4" />} onClick={onAdd}>
        Add Credential
      </Button>
    </div>
  )
}

interface NewCredentialDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: (credential: Credential) => void
}

function NewCredentialDialog({ open, onOpenChange, onSuccess }: NewCredentialDialogProps) {
  const [provider, setProvider] = React.useState<ProviderKey>('anthropic')
  const [label, setLabel] = React.useState('')
  const [apiKey, setApiKey] = React.useState('')
  const [showKey, setShowKey] = React.useState(false)
  const [isLoading, setIsLoading] = React.useState(false)
  const [error, setError] = React.useState('')

  const handleCreate = async () => {
    if (!label.trim() || !apiKey.trim()) return

    setIsLoading(true)
    setError('')

    try {
      const credential = await api.createCredential({
        provider,
        label: label.trim(),
        apiKey: apiKey.trim(),
      })
      onSuccess(credential)
      // Reset form
      setLabel('')
      setApiKey('')
      setProvider('anthropic')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create credential')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md">
        <DialogHeader onClose={() => onOpenChange(false)}>Add Credential</DialogHeader>
        <DialogBody className="space-y-4">
          <Select
            label="Provider"
            value={provider}
            onChange={(v) => setProvider(v as ProviderKey)}
            options={PROVIDERS}
          />

          <Input
            label="Label"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="My API Key"
            hint="A friendly name for this credential"
          />

          <div className="relative">
            <Input
              label="API Key"
              type={showKey ? 'text' : 'password'}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="sk-..."
            />
            <button
              type="button"
              className="absolute right-3 top-8 text-hud-text hover:text-hud-white transition-colors"
              onClick={() => setShowKey(!showKey)}
            >
              {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>

          {error && (
            <div className="p-3 bg-hud-error/10 border border-hud-error/30 text-sm text-hud-error">
              {error}
            </div>
          )}
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={handleCreate}
            loading={isLoading}
            disabled={!label.trim() || !apiKey.trim()}
          >
            Add Credential
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
