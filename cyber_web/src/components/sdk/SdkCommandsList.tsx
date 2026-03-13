// SDK Commands List - Available slash commands (click to insert)

import { useState } from 'react'
import { Button, Input, Spinner } from '@/components/ui'
import { Terminal, Search, Copy, Check } from 'lucide-react'
import type { SlashCommand } from '@/api/types'

interface SdkCommandsListProps {
  commands: SlashCommand[]
  loading: boolean
  error?: string
  onRefresh: () => void
  onInsert?: (command: string) => void
}

export function SdkCommandsList({
  commands,
  loading,
  error,
  onRefresh,
  onInsert,
}: SdkCommandsListProps) {
  const [search, setSearch] = useState('')
  const [copiedCommand, setCopiedCommand] = useState<string | null>(null)

  // Check if we need to send a prompt first
  const needsPrompt = error?.includes('No active query')

  if (loading) {
    return (
      <div className="flex items-center justify-center py-4">
        <Spinner size="sm" />
      </div>
    )
  }

  if (needsPrompt) {
    return (
      <div className="text-center py-3">
        <Terminal size={24} className="mx-auto text-hud-text/50 mb-2" />
        <p className="text-xs text-hud-text/50">Commands load after the first prompt</p>
      </div>
    )
  }

  if (commands.length === 0) {
    return (
      <div className="text-center py-3">
        <Terminal size={24} className="mx-auto text-hud-text/50 mb-2" />
        <p className="text-xs text-hud-text/50">No commands available</p>
        <Button variant="outline" onClick={onRefresh} className="mt-2">
          Refresh
        </Button>
      </div>
    )
  }

  const filteredCommands = commands.filter(
    (cmd) =>
      cmd.name.toLowerCase().includes(search.toLowerCase()) ||
      cmd.description.toLowerCase().includes(search.toLowerCase())
  )

  const handleCopy = (command: string) => {
    const fullCommand = `/${command}`
    navigator.clipboard.writeText(fullCommand)
    setCopiedCommand(command)
    setTimeout(() => setCopiedCommand(null), 2000)

    if (onInsert) {
      onInsert(fullCommand)
    }
  }

  return (
    <div className="space-y-2">
      {/* Search */}
      <Input
        placeholder="Search commands..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        icon={<Search size={14} />}
        className="text-xs"
      />

      {/* Command List */}
      <div className="space-y-1 max-h-[300px] overflow-y-auto">
        {filteredCommands.map((cmd) => (
          <button
            key={cmd.name}
            onClick={() => handleCopy(cmd.name)}
            className="w-full text-left p-2 bg-hud-gray/20 border border-hud-gray/30 hover:bg-hud-gray/30 transition-colors group"
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="text-hud-accent font-mono text-xs">/{cmd.name}</span>
                {cmd.argumentHint && (
                  <span className="text-2xs text-hud-text/50 truncate">
                    {cmd.argumentHint}
                  </span>
                )}
              </div>
              <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                {copiedCommand === cmd.name ? (
                  <Check size={12} className="text-hud-success" />
                ) : (
                  <Copy size={12} className="text-hud-text/50" />
                )}
              </div>
            </div>
            <p className="text-2xs text-hud-text/50 mt-0.5 line-clamp-2">
              {cmd.description}
            </p>
          </button>
        ))}
      </div>

      {filteredCommands.length === 0 && search && (
        <div className="text-xs text-hud-text/50 text-center py-2">
          No commands match "{search}"
        </div>
      )}

      <div className="text-2xs text-hud-text/30 text-center">
        {commands.length} command{commands.length !== 1 ? 's' : ''} available
      </div>
    </div>
  )
}
