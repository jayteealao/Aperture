import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAppStore } from '@/stores/app'
import { useSessionsStore } from '@/stores/sessions'
import { useToast } from '@/components/ui/Toast'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Card, CardHeader, CardContent } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { ConfirmDialog } from '@/components/ui/Dialog'
import {
  Moon,
  Sun,
  Trash2,
  Server,
  Database,
  RefreshCw,
} from 'lucide-react'

export default function Settings() {
  const navigate = useNavigate()
  const toast = useToast()
  const { theme, toggleTheme, gatewayUrl, setGatewayUrl, clearStorage, isConnected } = useAppStore()
  const { sessions, clearAll } = useSessionsStore()

  const [showClearDialog, setShowClearDialog] = useState(false)
  const [editUrl, setEditUrl] = useState(gatewayUrl)
  const [isClearing, setIsClearing] = useState(false)

  const handleSaveUrl = () => {
    setGatewayUrl(editUrl)
    toast.success('Gateway URL updated', 'Reconnect to apply changes')
  }

  const handleClearAll = async () => {
    setIsClearing(true)
    try {
      await clearAll()
      clearStorage()
      toast.success('All data cleared')
      navigate('/onboarding')
    } catch (error) {
      toast.error('Failed to clear data', error instanceof Error ? error.message : 'Unknown error')
    } finally {
      setIsClearing(false)
      setShowClearDialog(false)
    }
  }

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="max-w-2xl mx-auto">
        <h2 className="text-2xl font-bold text-[var(--color-text-primary)] mb-6">Settings</h2>

        {/* Appearance */}
        <Card variant="glass" padding="lg" className="mb-6">
          <CardHeader
            title="Appearance"
            subtitle="Customize the look and feel"
          />
          <CardContent>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {theme === 'dark' ? <Moon size={20} /> : <Sun size={20} />}
                <div>
                  <p className="font-medium text-[var(--color-text-primary)]">Theme</p>
                  <p className="text-sm text-[var(--color-text-secondary)]">
                    {theme === 'dark' ? 'Nebula Glass (Dark)' : 'Pearl Glass (Light)'}
                  </p>
                </div>
              </div>
              <Button variant="secondary" onClick={toggleTheme}>
                Switch to {theme === 'dark' ? 'Light' : 'Dark'}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Connection */}
        <Card variant="glass" padding="lg" className="mb-6">
          <CardHeader
            title="Connection"
            subtitle="Gateway server configuration"
            action={
              <Badge variant={isConnected ? 'success' : 'danger'}>
                {isConnected ? 'Connected' : 'Disconnected'}
              </Badge>
            }
          />
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <Server size={20} className="mt-2.5 text-[var(--color-text-muted)]" />
                <div className="flex-1">
                  <Input
                    label="Gateway URL"
                    value={editUrl}
                    onChange={(e) => setEditUrl(e.target.value)}
                    placeholder="http://localhost:8080"
                  />
                </div>
              </div>
              {editUrl !== gatewayUrl && (
                <div className="flex justify-end gap-2">
                  <Button variant="ghost" size="sm" onClick={() => setEditUrl(gatewayUrl)}>
                    Cancel
                  </Button>
                  <Button variant="primary" size="sm" onClick={handleSaveUrl}>
                    Save URL
                  </Button>
                </div>
              )}

              <div className="pt-4 border-t border-[var(--color-border)]">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <RefreshCw size={20} className="text-[var(--color-text-muted)]" />
                    <div>
                      <p className="font-medium text-[var(--color-text-primary)]">Reconnect</p>
                      <p className="text-sm text-[var(--color-text-secondary)]">
                        Test connection and refresh session list
                      </p>
                    </div>
                  </div>
                  <Button
                    variant="secondary"
                    onClick={() => {
                      clearStorage()
                      navigate('/onboarding')
                    }}
                  >
                    Reconnect
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Keyboard Shortcuts */}
        <Card variant="glass" padding="lg" className="mb-6">
          <CardHeader
            title="Keyboard Shortcuts"
            subtitle="Quick actions for power users"
          />
          <CardContent>
            <div className="space-y-3">
              <ShortcutRow keys={['Cmd', 'K']} description="Open command palette" />
              <ShortcutRow keys={['Enter']} description="Send message" />
              <ShortcutRow keys={['Shift', 'Enter']} description="New line in message" />
              <ShortcutRow keys={['Escape']} description="Close dialogs" />
            </div>
          </CardContent>
        </Card>

        {/* Data Management */}
        <Card variant="glass" padding="lg" className="mb-6">
          <CardHeader
            title="Data Management"
            subtitle="Manage local data and storage"
          />
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center justify-between p-3 rounded-lg bg-[var(--color-surface)]">
                <div className="flex items-center gap-3">
                  <Database size={20} className="text-[var(--color-text-muted)]" />
                  <div>
                    <p className="font-medium text-[var(--color-text-primary)]">Local Sessions</p>
                    <p className="text-sm text-[var(--color-text-secondary)]">
                      {sessions.length} session{sessions.length !== 1 ? 's' : ''} stored locally
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between p-3 rounded-lg bg-danger/5 border border-danger/20">
                <div className="flex items-center gap-3">
                  <Trash2 size={20} className="text-danger" />
                  <div>
                    <p className="font-medium text-[var(--color-text-primary)]">Clear All Data</p>
                    <p className="text-sm text-[var(--color-text-secondary)]">
                      Remove all local sessions, messages, and credentials
                    </p>
                  </div>
                </div>
                <Button variant="danger" onClick={() => setShowClearDialog(true)}>
                  Clear Data
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* About */}
        <Card variant="glass" padding="lg">
          <CardHeader
            title="About Aperture"
            subtitle="AI Workspace for ACP Agents"
          />
          <CardContent>
            <div className="space-y-2 text-sm text-[var(--color-text-secondary)]">
              <p>Version: 1.0.0</p>
              <p>
                Aperture provides a beautiful, high-performance interface for interacting with
                ACP-compatible AI agents including Claude Code, Codex, and Gemini.
              </p>
              <a
                href="https://github.com/jayteealao/Aperture"
                target="_blank"
                rel="noopener noreferrer"
                className="text-accent hover:underline"
              >
                View on GitHub
              </a>
            </div>
          </CardContent>
        </Card>

        {/* Clear Dialog */}
        <ConfirmDialog
          open={showClearDialog}
          onClose={() => setShowClearDialog(false)}
          onConfirm={handleClearAll}
          title="Clear All Data"
          description="This will permanently delete all your local sessions, messages, and stored credentials. You will need to reconnect to the gateway. This action cannot be undone."
          confirmText="Clear Everything"
          variant="danger"
          loading={isClearing}
        />
      </div>
    </div>
  )
}

function ShortcutRow({ keys, description }: { keys: string[]; description: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-[var(--color-text-secondary)]">{description}</span>
      <div className="flex items-center gap-1">
        {keys.map((key, i) => (
          <span key={i}>
            {i > 0 && <span className="mx-1 text-[var(--color-text-muted)]">+</span>}
            <kbd className="px-2 py-1 text-xs font-mono bg-[var(--color-surface)] border border-[var(--color-border)] rounded">
              {key}
            </kbd>
          </span>
        ))}
      </div>
    </div>
  )
}
