import {
  HUDLabel,
  HUDMicro,
  HUDTitle,
  HUDSeparator,
  Card,
  Button,
  Badge,
  Select,
} from '@/components/ui'
import { Shell, Topbar, Sidebar } from '@/components/layout'
import { useAppStore } from '@/stores'
import {
  Settings as SettingsIcon,
  Server,
  Trash2,
} from 'lucide-react'

export function SettingsPage() {
  const {
    sidebarOpen,
    gatewayUrl,
    theme,
    setTheme,
    clearStorage,
  } = useAppStore()

  const handleClearData = () => {
    if (confirm('Are you sure you want to clear all local data? This will remove all sessions and settings.')) {
      clearStorage()
      window.location.reload()
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
        <div className="flex items-center gap-3 mb-6">
          <SettingsIcon className="w-6 h-6 text-hud-accent" />
          <div>
            <HUDTitle>System Configuration</HUDTitle>
            <HUDMicro className="mt-1">Customize your Aperture experience</HUDMicro>
          </div>
        </div>

        <HUDSeparator />

        <div className="max-w-2xl space-y-6 mt-6">
          {/* Gateway Settings */}
          <Card variant="bordered" corners header="Gateway Connection">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <HUDLabel>Gateway URL</HUDLabel>
                  <HUDMicro className="mt-1 font-mono">{gatewayUrl}</HUDMicro>
                </div>
                <Badge variant="success" size="sm">Connected</Badge>
              </div>
              <Button variant="outline" size="sm" onClick={() => window.location.href = '/'}>
                <Server className="w-4 h-4 mr-2" />
                Reconfigure Gateway
              </Button>
            </div>
          </Card>

          {/* Appearance */}
          <Card variant="bordered" corners header="Appearance">
            <div className="space-y-4">
              <Select
                label="Theme"
                value={theme}
                onChange={(v) => setTheme(v as 'light' | 'dark')}
                options={[
                  { value: 'dark', label: 'Dark Mode', description: 'HUD-style dark interface' },
                  { value: 'light', label: 'Light Mode', description: 'Light interface (coming soon)', disabled: true },
                ]}
              />
            </div>
          </Card>

          {/* Keyboard Shortcuts */}
          <Card variant="bordered" corners header="Keyboard Shortcuts">
            <div className="space-y-2">
              <ShortcutRow label="Toggle Sidebar" shortcut="Cmd + B" />
              <ShortcutRow label="Toggle Control Panel" shortcut="Cmd + ." />
              <ShortcutRow label="New Session" shortcut="Cmd + N" />
              <ShortcutRow label="Command Palette" shortcut="Cmd + K" />
              <ShortcutRow label="Focus Input" shortcut="Cmd + L" />
            </div>
          </Card>

          {/* Data Management */}
          <Card variant="bordered" corners header="Data Management">
            <div className="space-y-4">
              <div>
                <HUDLabel className="text-hud-error">Danger Zone</HUDLabel>
                <HUDMicro className="mt-1">
                  Clear all local data including sessions, messages, and settings.
                </HUDMicro>
              </div>
              <Button variant="danger" size="sm" onClick={handleClearData}>
                <Trash2 className="w-4 h-4 mr-2" />
                Clear All Data
              </Button>
            </div>
          </Card>

          {/* About */}
          <Card variant="bordered" corners header="About">
            <div className="space-y-2">
              <div className="flex justify-between">
                <HUDMicro>Version</HUDMicro>
                <HUDLabel className="text-hud-white">1.1.0</HUDLabel>
              </div>
              <div className="flex justify-between">
                <HUDMicro>Interface</HUDMicro>
                <HUDLabel className="text-hud-accent">Cyber HUD</HUDLabel>
              </div>
              <div className="flex justify-between">
                <HUDMicro>Build</HUDMicro>
                <HUDLabel className="text-hud-white">Production</HUDLabel>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </Shell>
  )
}

interface ShortcutRowProps {
  label: string
  shortcut: string
}

function ShortcutRow({ label, shortcut }: ShortcutRowProps) {
  return (
    <div className="flex items-center justify-between py-1">
      <HUDMicro>{label}</HUDMicro>
      <kbd className="px-2 py-0.5 bg-hud-gray/50 border border-hud-gray text-2xs font-mono text-hud-white">
        {shortcut}
      </kbd>
    </div>
  )
}
