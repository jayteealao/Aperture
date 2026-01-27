import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/api/client'
import { useToast } from '@/components/ui/Toast'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Dialog, ConfirmDialog } from '@/components/ui/Dialog'
import { SkeletonCard } from '@/components/ui/Skeleton'
import type { Credential, ProviderKey } from '@/api/types'
import { Plus, Trash2, Key, Shield, Clock } from 'lucide-react'

const providerColors: Record<ProviderKey, string> = {
  anthropic: 'accent',
  openai: 'success',
  google: 'warning',
  groq: 'danger',
  openrouter: 'outline',
}

const providerLabels: Record<ProviderKey, string> = {
  anthropic: 'Anthropic',
  openai: 'OpenAI',
  google: 'Google',
  groq: 'Groq',
  openrouter: 'OpenRouter',
}

export default function Credentials() {
  const queryClient = useQueryClient()
  const toast = useToast()

  const [showAddDialog, setShowAddDialog] = useState(false)
  const [deleteCredentialId, setDeleteCredentialId] = useState<string | null>(null)

  // Fetch credentials
  const { data, isLoading } = useQuery({
    queryKey: ['credentials'],
    queryFn: () => api.listCredentials(),
  })

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.deleteCredential(id),
    onSuccess: () => {
      toast.success('Credential deleted')
      queryClient.invalidateQueries({ queryKey: ['credentials'] })
    },
    onError: (error) => {
      toast.error('Failed to delete credential', error.message)
    },
  })

  const credentials = data?.credentials || []

  // Group by provider
  const groupedCredentials = credentials.reduce((acc, cred) => {
    if (!acc[cred.provider]) {
      acc[cred.provider] = []
    }
    acc[cred.provider].push(cred)
    return acc
  }, {} as Record<ProviderKey, Credential[]>)

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold text-[var(--color-text-primary)]">Credentials</h2>
            <p className="text-[var(--color-text-secondary)]">
              Manage your stored API keys securely
            </p>
          </div>
          <Button
            variant="primary"
            onClick={() => setShowAddDialog(true)}
            leftIcon={<Plus size={18} />}
          >
            Add Credential
          </Button>
        </div>

        {/* Security notice */}
        <Card variant="glass" padding="md" className="mb-6">
          <div className="flex items-start gap-3">
            <Shield size={20} className="text-accent shrink-0 mt-0.5" />
            <div>
              <p className="text-sm text-[var(--color-text-primary)] font-medium">
                Security Notice
              </p>
              <p className="text-sm text-[var(--color-text-secondary)] mt-1">
                API keys are stored securely on the gateway server. Keys are never sent back to
                this browser after creation. Use stored credentials to avoid pasting keys repeatedly.
              </p>
            </div>
          </div>
        </Card>

        {/* Credentials list */}
        {isLoading ? (
          <div className="space-y-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
        ) : credentials.length === 0 ? (
          <Card variant="glass" padding="lg" className="text-center">
            <div className="py-8">
              <Key size={48} className="mx-auto text-[var(--color-text-muted)] mb-4" />
              <h3 className="text-lg font-semibold text-[var(--color-text-primary)]">
                No credentials stored
              </h3>
              <p className="text-[var(--color-text-secondary)] mb-4">
                Add your API keys to use them across sessions without re-entering
              </p>
              <Button
                variant="primary"
                onClick={() => setShowAddDialog(true)}
                leftIcon={<Plus size={18} />}
              >
                Add Your First Credential
              </Button>
            </div>
          </Card>
        ) : (
          <div className="space-y-6">
            {(Object.entries(groupedCredentials) as [ProviderKey, Credential[]][]).map(
              ([provider, creds]) => (
                <div key={provider}>
                  <h3 className="text-sm font-semibold text-[var(--color-text-secondary)] uppercase tracking-wider mb-3">
                    {providerLabels[provider]}
                  </h3>
                  <div className="space-y-3">
                    {creds.map((cred) => (
                      <CredentialCard
                        key={cred.id}
                        credential={cred}
                        onDelete={() => setDeleteCredentialId(cred.id)}
                      />
                    ))}
                  </div>
                </div>
              )
            )}
          </div>
        )}

        {/* Add Dialog */}
        <AddCredentialDialog
          open={showAddDialog}
          onClose={() => setShowAddDialog(false)}
          onAdded={() => {
            setShowAddDialog(false)
            queryClient.invalidateQueries({ queryKey: ['credentials'] })
          }}
        />

        {/* Delete Confirmation */}
        <ConfirmDialog
          open={!!deleteCredentialId}
          onClose={() => setDeleteCredentialId(null)}
          onConfirm={() => {
            if (deleteCredentialId) {
              deleteMutation.mutate(deleteCredentialId)
              setDeleteCredentialId(null)
            }
          }}
          title="Delete Credential"
          description="Are you sure you want to delete this credential? Sessions using this credential will need a new API key."
          confirmText="Delete"
          variant="danger"
          loading={deleteMutation.isPending}
        />
      </div>
    </div>
  )
}

function CredentialCard({
  credential,
  onDelete,
}: {
  credential: Credential
  onDelete: () => void
}) {
  const createdDate = new Date(credential.createdAt).toLocaleDateString()

  return (
    <Card variant="glass" padding="md">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-[var(--color-surface)] flex items-center justify-center">
            <Key size={20} className="text-accent" />
          </div>
          <div>
            <p className="font-medium text-[var(--color-text-primary)]">{credential.label}</p>
            <div className="flex items-center gap-2 mt-1">
              <Badge variant={providerColors[credential.provider] as 'accent' | 'success' | 'warning'} size="sm">
                {providerLabels[credential.provider]}
              </Badge>
              <span className="flex items-center gap-1 text-xs text-[var(--color-text-muted)]">
                <Clock size={12} />
                {createdDate}
              </span>
            </div>
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={onDelete}
          className="text-danger hover:text-danger"
        >
          <Trash2 size={16} />
        </Button>
      </div>
    </Card>
  )
}

function AddCredentialDialog({
  open,
  onClose,
  onAdded,
}: {
  open: boolean
  onClose: () => void
  onAdded: () => void
}) {
  const toast = useToast()
  const [provider, setProvider] = useState<ProviderKey>('anthropic')
  const [label, setLabel] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [isAdding, setIsAdding] = useState(false)

  const providerOptions = [
    { value: 'anthropic', label: 'Anthropic (Claude)' },
    { value: 'openai', label: 'OpenAI (Codex)' },
    { value: 'google', label: 'Google (Gemini)' },
  ]

  async function handleAdd() {
    if (!label || !apiKey) return

    setIsAdding(true)
    try {
      await api.createCredential({
        provider,
        label,
        apiKey,
      })
      toast.success('Credential added', `"${label}" is now available for sessions`)
      setLabel('')
      setApiKey('')
      onAdded()
    } catch (error) {
      toast.error('Failed to add credential', error instanceof Error ? error.message : 'Unknown error')
    } finally {
      setIsAdding(false)
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title="Add Credential" size="md">
      <div className="space-y-4">
        <Select
          label="Provider"
          options={providerOptions}
          value={provider}
          onChange={(e) => setProvider(e.target.value as ProviderKey)}
        />

        <Input
          label="Label"
          placeholder="e.g., Personal API Key"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          hint="A friendly name to identify this credential"
        />

        <Input
          label="API Key"
          type="password"
          placeholder="sk-..."
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          hint="This key will be stored securely on the gateway"
        />

        <div className="flex justify-end gap-3 pt-4">
          <Button variant="ghost" onClick={onClose} disabled={isAdding}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={handleAdd}
            loading={isAdding}
            disabled={!label || !apiKey}
          >
            Add Credential
          </Button>
        </div>
      </div>
    </Dialog>
  )
}
