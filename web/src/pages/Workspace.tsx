import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { cn } from '@/utils/cn'
import { useSessionsStore } from '@/stores/sessions'
import { useToast } from '@/components/ui/Toast'
import { Button } from '@/components/ui/Button'
import { Textarea } from '@/components/ui/Textarea'
import { Badge } from '@/components/ui/Badge'
import { Card } from '@/components/ui/Card'
import type { Message, ContentBlock, PermissionOption } from '@/api/types'
import {
  Send,
  StopCircle,
  Plus,
  Copy,
  Check,
  AlertCircle,
  Terminal,
} from 'lucide-react'

export default function Workspace() {
  const navigate = useNavigate()
  const { sessionId: urlSessionId } = useParams()
  const toast = useToast()

  const {
    sessions,
    messages,
    connections,
    activeSessionId,
    pendingPermissions,
    setActiveSession,
    connectSession,
    sendMessage,
    sendPermissionResponse,
    cancelPrompt,
  } = useSessionsStore()

  const [input, setInput] = useState('')
  const [isSending, setIsSending] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const activeSession = useMemo(
    () => sessions.find((s) => s.id === activeSessionId),
    [sessions, activeSessionId]
  )
  const sessionMessages = useMemo(
    () => (activeSessionId ? messages[activeSessionId] || [] : []),
    [activeSessionId, messages]
  )
  const connection = activeSessionId ? connections[activeSessionId] : null

  // Handle URL session ID (sync URL param with store)
  useEffect(() => {
    if (urlSessionId && urlSessionId !== activeSessionId) {
      const exists = sessions.find((s) => s.id === urlSessionId)
      if (exists) {
        setActiveSession(urlSessionId)
        connectSession(urlSessionId)
      }
    }
    // Only depend on URL and sessions, not on store actions/activeSessionId to avoid loops
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlSessionId, sessions])

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [sessionMessages])

  // Get pending permissions for active session
  const activePermissions = useMemo(() => {
    if (!activeSessionId) return []
    return Object.entries(pendingPermissions)
      .filter(([key]) => key.startsWith(activeSessionId))
      .map(([_, perm]) => perm)
  }, [pendingPermissions, activeSessionId])

  const handleSend = useCallback(async () => {
    if (!input.trim() || !activeSessionId || isSending) return
    if (connection?.isStreaming) return

    const content = input.trim()
    setInput('')
    setIsSending(true)

    try {
      await sendMessage(activeSessionId, content)
    } catch (error) {
      toast.error('Failed to send', error instanceof Error ? error.message : 'Unknown error')
      setInput(content) // Restore input on error
    } finally {
      setIsSending(false)
    }
  }, [input, activeSessionId, connection?.isStreaming, isSending, sendMessage, toast])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        handleSend()
      }
    },
    [handleSend]
  )

  const handleCancel = useCallback(() => {
    if (activeSessionId) {
      cancelPrompt(activeSessionId)
    }
  }, [activeSessionId, cancelPrompt])

  // Empty state
  if (!activeSession) {
    return (
      <div className="h-full flex items-center justify-center p-6">
        <Card variant="glass" padding="lg" className="max-w-md text-center">
          <div className="py-8">
            <Terminal size={48} className="mx-auto text-[var(--color-text-muted)] mb-4" />
            <h3 className="text-lg font-semibold text-[var(--color-text-primary)]">
              No active session
            </h3>
            <p className="text-[var(--color-text-secondary)] mb-4">
              Select a session from the sidebar or create a new one to start chatting
            </p>
            <Button
              variant="primary"
              onClick={() => navigate('/sessions/new')}
              leftIcon={<Plus size={18} />}
            >
              New Session
            </Button>
          </div>
        </Card>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col">
      {/* Session header */}
      <div className="px-4 py-3 border-b border-[var(--color-border)] flex items-center justify-between">
        <div className="flex items-center gap-3">
          <ConnectionStatus status={connection?.status || 'disconnected'} />
          <div>
            <h3 className="font-mono text-sm text-[var(--color-text-primary)]">
              {activeSession.id.slice(0, 12)}...
            </h3>
            <p className="text-xs text-[var(--color-text-muted)]">{activeSession.agent}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {connection?.isStreaming && (
            <Badge variant="accent" size="sm" className="animate-pulse">
              Streaming...
            </Badge>
          )}
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto scrollbar-thin">
        <div className="max-w-3xl mx-auto px-4 py-6 space-y-4">
          {sessionMessages.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-[var(--color-text-muted)]">
                Send a message to start the conversation
              </p>
            </div>
          ) : (
            sessionMessages.map((msg) => (
              <MessageBubble
                key={msg.id}
                message={msg}
                isStreaming={
                  !!(connection?.isStreaming &&
                  connection.currentStreamMessageId === msg.id)
                }
              />
            ))
          )}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Permission requests */}
      {activePermissions.length > 0 && (
        <div className="px-4 py-3 border-t border-[var(--color-border)] bg-warning/5">
          <PermissionRequest
            sessionId={activeSessionId!}
            permission={activePermissions[0]}
            onRespond={sendPermissionResponse}
          />
        </div>
      )}

      {/* Composer */}
      <div className="px-4 py-4 border-t border-[var(--color-border)] bg-[var(--color-bg-secondary)]">
        <div className="max-w-3xl mx-auto">
          <div className="flex items-end gap-3">
            <div className="flex-1">
              <Textarea
                placeholder="Type your message... (Shift+Enter for new line)"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                autoGrow
                maxHeight={200}
                disabled={connection?.status === 'disconnected' || connection?.status === 'error'}
                className="min-h-[44px]"
              />
            </div>
            {connection?.isStreaming ? (
              <Button variant="danger" size="lg" onClick={handleCancel}>
                <StopCircle size={20} />
              </Button>
            ) : (
              <Button
                variant="primary"
                size="lg"
                onClick={handleSend}
                disabled={!input.trim() || isSending || connection?.status !== 'connected'}
                loading={isSending}
              >
                <Send size={20} />
              </Button>
            )}
          </div>
          <div className="mt-2 flex items-center justify-between text-xs text-[var(--color-text-muted)]">
            <span>
              {connection?.status === 'connected' ? (
                'Connected via WebSocket'
              ) : connection?.status === 'reconnecting' ? (
                `Reconnecting (attempt ${connection.retryCount})...`
              ) : (
                'Disconnected'
              )}
            </span>
            <span>Press Enter to send</span>
          </div>
        </div>
      </div>
    </div>
  )
}

function ConnectionStatus({ status }: { status: string }) {
  const colors: Record<string, string> = {
    connected: 'bg-success',
    connecting: 'bg-warning animate-pulse',
    reconnecting: 'bg-warning animate-pulse',
    disconnected: 'bg-[var(--color-text-muted)]',
    error: 'bg-danger',
    ended: 'bg-[var(--color-text-muted)]',
  }

  return (
    <span
      className={cn('w-2.5 h-2.5 rounded-full shrink-0', colors[status] || colors.disconnected)}
      title={status}
    />
  )
}

function MessageBubble({
  message,
  isStreaming,
}: {
  message: Message
  isStreaming: boolean
}) {
  const [copied, setCopied] = useState(false)
  const isUser = message.role === 'user'
  const content = extractText(message.content)

  const handleCopy = () => {
    navigator.clipboard.writeText(content)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className={cn('flex', isUser ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'max-w-[85%] rounded-2xl px-4 py-3 animate-in',
          isUser
            ? 'bg-accent text-[#0a0a0f] rounded-br-md'
            : 'glass rounded-bl-md'
        )}
      >
        <div className="flex items-start justify-between gap-2 mb-1">
          <span className="text-xs font-medium opacity-70">
            {isUser ? 'You' : message.role === 'assistant' ? 'Assistant' : message.role}
          </span>
          {!isUser && (
            <button
              onClick={handleCopy}
              className="opacity-0 group-hover:opacity-100 hover:opacity-100 transition-opacity p-1 rounded hover:bg-[var(--color-surface)]"
              title="Copy message"
            >
              {copied ? <Check size={14} /> : <Copy size={14} />}
            </button>
          )}
        </div>
        <div className="prose prose-sm max-w-none">
          <MessageContent content={content} />
          {isStreaming && <span className="inline-block w-2 h-4 bg-current animate-typing ml-0.5" />}
        </div>
        <div className="mt-2 text-2xs opacity-50">
          {new Date(message.timestamp).toLocaleTimeString()}
        </div>
      </div>
    </div>
  )
}

function MessageContent({ content }: { content: string }) {
  // Simple markdown-like rendering
  const parts = content.split(/(```[\s\S]*?```|`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*)/g)

  return (
    <div className="whitespace-pre-wrap break-words">
      {parts.map((part, i) => {
        if (part.startsWith('```')) {
          const code = part.slice(3, -3).replace(/^\w+\n/, '')
          return (
            <pre key={i} className="my-2 p-3 rounded-lg bg-[var(--color-bg-tertiary)] overflow-x-auto text-xs">
              <code>{code}</code>
            </pre>
          )
        }
        if (part.startsWith('`') && part.endsWith('`')) {
          return (
            <code key={i} className="px-1 py-0.5 rounded bg-[var(--color-surface)] text-sm">
              {part.slice(1, -1)}
            </code>
          )
        }
        if (part.startsWith('**') && part.endsWith('**')) {
          return <strong key={i}>{part.slice(2, -2)}</strong>
        }
        if (part.startsWith('*') && part.endsWith('*')) {
          return <em key={i}>{part.slice(1, -1)}</em>
        }
        return <span key={i}>{part}</span>
      })}
    </div>
  )
}

function PermissionRequest({
  sessionId,
  permission,
  onRespond,
}: {
  sessionId: string
  permission: { toolCallId: string; toolCall: unknown; options: unknown[] }
  onRespond: (sessionId: string, toolCallId: string, optionId: string | null) => void
}) {
  const toolCall = permission.toolCall as { title?: string; rawInput?: unknown }
  const options = permission.options as PermissionOption[]

  return (
    <Card variant="glass" padding="md" className="border-l-4 border-l-warning">
      <div className="flex items-start gap-3">
        <AlertCircle size={20} className="text-warning shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <h4 className="font-medium text-[var(--color-text-primary)]">
            Permission Required
          </h4>
          <p className="text-sm text-[var(--color-text-secondary)] mt-1">
            {toolCall?.title || 'The agent wants to perform an action'}
          </p>
          {toolCall?.rawInput ? (
            <pre className="mt-2 p-2 rounded bg-[var(--color-bg-tertiary)] text-xs overflow-x-auto">
              {JSON.stringify(toolCall.rawInput, null, 2)}
            </pre>
          ) : null}
          <div className="flex flex-wrap gap-2 mt-3">
            {options.map((opt) => {
              const isAllow = opt.kind?.includes('allow')
              return (
                <Button
                  key={opt.optionId}
                  variant={isAllow ? 'primary' : 'secondary'}
                  size="sm"
                  onClick={() => onRespond(sessionId, permission.toolCallId, opt.optionId)}
                >
                  {opt.name}
                </Button>
              )
            })}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onRespond(sessionId, permission.toolCallId, null)}
            >
              Deny
            </Button>
          </div>
        </div>
      </div>
    </Card>
  )
}

// Helper to extract text from content blocks
function extractText(content: string | ContentBlock[]): string {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return String(content)

  return content
    .map((block) => {
      if (block.type === 'text' && block.text) return block.text
      if (block.type === 'tool_use') return `[Tool: ${block.name}]`
      if (block.type === 'tool_result') {
        if (typeof block.content === 'string') return block.content
        return extractText(block.content || [])
      }
      return ''
    })
    .join('\n')
}
