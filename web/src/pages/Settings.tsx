import { useState } from 'react'
import { useNavigate } from 'react-router'
import { useAppStore } from '@/stores/app'
import { useSessionsStore } from '@/stores/sessions'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { InputField } from '@/components/ui/input-field'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import {
  Moon,
  Sun,
  Trash2,
  Server,
  Database,
  RefreshCw,
  Keyboard,
} from 'lucide-react'

export default function Settings() {
  const navigate = useNavigate()
  const { theme, toggleTheme, gatewayUrl, setGatewayUrl, clearStorage, isConnected } = useAppStore()
  const { sessions, clearAll } = useSessionsStore()

  const modKey = /Mac|iPhone|iPad/.test(navigator.userAgent) ? '⌘' : 'Ctrl'
  const [showClearDialog, setShowClearDialog] = useState(false)
  const [editUrl, setEditUrl] = useState(gatewayUrl)
  const [isClearing, setIsClearing] = useState(false)

  const handleSaveUrl = () => {
    setGatewayUrl(editUrl)
    toast.success('Gateway URL updated', { description: 'Reconnect to apply changes' })
  }

  const handleClearAll = async () => {
    setIsClearing(true)
    try {
      await clearAll()
      clearStorage()
      toast.success('All data cleared')
      navigate('/onboarding')
    } catch (error) {
      toast.error('Could not clear data', { description: error instanceof Error ? error.message : 'Something went wrong' })
    } finally {
      setIsClearing(false)
      setShowClearDialog(false)
    }
  }

  return (
    <div className="h-full overflow-y-auto p-6 lg:p-8">
      <div className="max-w-5xl mx-auto">
        <h2 className="text-2xl font-bold text-foreground mb-8">Settings</h2>

        {/* Top row: Appearance + Connection side by side on desktop */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          {/* Appearance */}
          <Card padding="lg">
            <div className="flex items-center gap-3 mb-4">
              {theme === 'dark' ? <Moon size={20} className="text-muted-foreground" /> : <Sun size={20} className="text-muted-foreground" />}
              <h3 className="text-base font-semibold text-foreground">Appearance</h3>
            </div>
            <CardContent className="mt-0">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-foreground">Theme</p>
                  <p className="text-sm text-muted-foreground">
                    {theme === 'dark' ? 'Dark' : 'Light'}
                  </p>
                </div>
                <Button variant="secondary" onClick={toggleTheme}>
                  Switch to {theme === 'dark' ? 'Light' : 'Dark'}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Connection */}
          <Card padding="lg">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <Server size={20} className="text-muted-foreground" />
                <h3 className="text-base font-semibold text-foreground">Connection</h3>
              </div>
              <Badge variant={isConnected ? 'success' : 'danger'}>
                {isConnected ? 'Connected' : 'Disconnected'}
              </Badge>
            </div>
            <CardContent className="mt-0">
              <div className="space-y-4">
                <InputField
                  label="Gateway URL"
                  value={editUrl}
                  onChange={(e) => setEditUrl(e.target.value)}
                  placeholder="http://localhost:8080"
                />
                {editUrl !== gatewayUrl && (
                  <div className="flex justify-end gap-2">
                    <Button variant="ghost" size="sm" onClick={() => setEditUrl(gatewayUrl)}>
                      Cancel
                    </Button>
                    <Button variant="default" size="sm" onClick={handleSaveUrl}>
                      Save URL
                    </Button>
                  </div>
                )}
                <div className="flex items-center justify-between pt-3 border-t border-border">
                  <div>
                    <p className="font-medium text-foreground">Reconnect</p>
                    <p className="text-sm text-muted-foreground">Test connection and refresh</p>
                  </div>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      clearStorage()
                      navigate('/onboarding')
                    }}
                  >
                    <RefreshCw size={14} />
                    Reconnect
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Keyboard Shortcuts — full width, compact */}
        <Card padding="lg" className="mb-6">
          <div className="flex items-center gap-3 mb-4">
            <Keyboard size={20} className="text-muted-foreground" />
            <h3 className="text-base font-semibold text-foreground">Keyboard Shortcuts</h3>
          </div>
          <CardContent className="mt-0">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-12 gap-y-2">
              <ShortcutRow keys={[modKey, 'K']} description="Open command palette" />
              <ShortcutRow keys={['Enter']} description="Send message" />
              <ShortcutRow keys={['Shift', 'Enter']} description="New line in message" />
              <ShortcutRow keys={['Escape']} description="Close dialogs" />
            </div>
          </CardContent>
        </Card>

        {/* Bottom row: Data Management + About side by side */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Data Management — takes 2 cols */}
          <Card padding="lg" className="lg:col-span-2">
            <div className="flex items-center gap-3 mb-4">
              <Database size={20} className="text-muted-foreground" />
              <h3 className="text-base font-semibold text-foreground">Data Management</h3>
            </div>
            <CardContent className="mt-0">
              <div className="space-y-4">
                <div className="flex items-center justify-between py-2">
                  <div>
                    <p className="font-medium text-foreground">Local Sessions</p>
                    <p className="text-sm text-muted-foreground">
                      {sessions.length} session{sessions.length !== 1 ? 's' : ''} stored locally
                    </p>
                  </div>
                </div>
                <div className="flex items-center justify-between p-4 rounded-lg bg-danger/5 border border-danger/20">
                  <div>
                    <p className="font-medium text-foreground">Clear All Data</p>
                    <p className="text-sm text-muted-foreground">
                      Remove all local sessions and credentials
                    </p>
                  </div>
                  <Button variant="destructive" onClick={() => setShowClearDialog(true)}>
                    <Trash2 size={14} />
                    Clear Data
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* About — takes 1 col */}
          <Card padding="lg">
            <h3 className="text-base font-semibold text-foreground mb-4">About</h3>
            <CardContent className="mt-0">
              <div className="space-y-3 text-sm text-muted-foreground">
                <p className="font-mono text-xs text-foreground/60">v1.0.0</p>
                <p>
                  AI Workspace for ACP-compatible agents including Claude Code, Codex, and Gemini.
                </p>
                <a
                  href="https://github.com/jayteealao/Aperture"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block text-accent hover:underline"
                >
                  View on GitHub
                </a>
              </div>
            </CardContent>
          </Card>
        </div>

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
    <div className="flex items-center justify-between py-2">
      <span className="text-sm text-muted-foreground">{description}</span>
      <div className="flex items-center gap-1">
        {keys.map((key, i) => (
          <span key={i}>
            {i > 0 && <span className="mx-1 text-foreground/40">+</span>}
            <kbd className="px-2 py-1 text-xs font-mono bg-secondary border border-border rounded-sm">
              {key}
            </kbd>
          </span>
        ))}
      </div>
    </div>
  )
}
