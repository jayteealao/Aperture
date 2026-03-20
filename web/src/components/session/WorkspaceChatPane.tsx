// Self-contained horizontal session pane — used by both the global workspace
// view (/workspace) and the workspace-detail view (/workspaces/:id).
// Each instance owns its own useChat state, WebSocket connection, and scroll
// position. They are fully independent of each other.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { MoreHorizontal, Trash2, Info, Copy } from 'lucide-react'
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from '@/components/ai-elements/conversation'
import { Shimmer } from '@/components/ai-elements/shimmer'
import {
  PromptInput,
  PromptInputBody,
  PromptInputFooter,
  PromptInputHeader,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
  PromptInputActionMenu,
  PromptInputActionMenuTrigger,
  PromptInputActionMenuContent,
  PromptInputActionAddAttachments,
} from '@/components/ai-elements/prompt-input'
import type { PromptInputMessage } from '@/components/ai-elements/prompt-input'
import {
  ApertureMessage,
  AttachmentsPreview,
  ChatErrorBoundary,
  ConnectionStatus,
  PermissionRequest,
} from '@/components/chat'
import { useChat } from '@ai-sdk/react'
import { api } from '@/api/client'
import { useSessionsStore } from '@/stores/sessions'
import { usePersistedUIMessages } from '@/hooks/usePersistedUIMessages'
import { ApertureWebSocketTransport } from '@/api/chat-transport'
import { submitChatMessage } from '@/utils/chat-submit'
import type { ApertureUIMessage } from '@/utils/ui-message'
import type { ConnectionState, Session } from '@/api/types'
import { IMAGE_LIMITS } from '@/api/types'

// ── WorkspaceChatPaneReady ─────────────────────────────────────────────────
// Owns the useChat instance. Only rendered once session record and persisted
// messages are available, so useChat never re-initialises with stale data.

function WorkspaceChatPaneReady({
  sessionId,
  session,
  connection,
  pendingPermissions,
  initialMessages,
  persistMessages,
  reloadMessages,
  sendPermissionResponse,
  onDelete,
}: {
  sessionId: string
  session: Session
  connection: ConnectionState | null
  pendingPermissions: Array<{ toolCallId: string; toolCall: unknown; options: unknown[] }>
  initialMessages: ApertureUIMessage[]
  persistMessages: (messages: ApertureUIMessage[]) => Promise<void>
  reloadMessages: () => Promise<ApertureUIMessage[]>
  sendPermissionResponse: (
    sessionId: string,
    toolCallId: string,
    optionId: string | null,
    answers?: Record<string, string>,
  ) => void
  onDelete: () => void
}) {
  const setStreaming = useSessionsStore((s) => s.setStreaming)
  const transport = useMemo(() => new ApertureWebSocketTransport(sessionId), [sessionId])

  const { messages, sendMessage, setMessages, status, stop } = useChat<ApertureUIMessage>({
    id: sessionId,
    transport,
    messages: initialMessages,
    onFinish: ({ messages: next }) => { void persistMessages(next) },
    onError: (error) => {
      if (import.meta.env.DEV) console.error('[WorkspaceChatPane] error:', error)
      toast.error('Connection error', {
        description: error instanceof Error ? error.message : 'Chat transport failed',
      })
      setStreaming(sessionId, false)
    },
  })

  useEffect(() => { void persistMessages(messages) }, [messages, persistMessages])
  useEffect(() => () => { setStreaming(sessionId, false) }, [sessionId, setStreaming])
  useEffect(() => {
    if (connection?.status !== 'connected') {
      return
    }

    void reloadMessages().then((nextMessages) => {
      setMessages(nextMessages)
    })
  }, [connection?.status, reloadMessages, setMessages])

  const handleAddUserMessage = useCallback(
    async (content: string) => {
      const next: ApertureUIMessage = {
        id: crypto.randomUUID(),
        role: 'user',
        metadata: { timestamp: new Date().toISOString() },
        parts: [{ type: 'text', text: content }],
      }
      let updated: ApertureUIMessage[] = []
      setMessages((cur) => { updated = [...cur, next]; return updated })
      await persistMessages(updated)
    },
    [setMessages, persistMessages],
  )

  const handleSubmit = useCallback(
    async (message: PromptInputMessage) => {
      await submitChatMessage(message, {
        connection,
        sendMessage,
        notifyError: (title, body) => toast.error(title, { description: body }),
      })
    },
    [connection, sendMessage],
  )

  const handleFileError = useCallback(
    (err: { code: string; message: string }) => {
      toast.error('Attachment not added', { description: err.message })
    },
    [],
  )

  const isConnected = connection?.status === 'connected'
  const isInFlight = status === 'streaming' || status === 'submitted'
  const agentLabel = session.agent === 'claude_sdk' ? 'SDK' : 'Pi'
  const agentVariant = (session.agent === 'claude_sdk' ? 'accent' : 'secondary') as 'accent' | 'secondary'

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [showInfo, setShowInfo] = useState(false)

  const handleCopyId = useCallback(() => {
    void navigator.clipboard.writeText(session.id)
    toast.success('Session ID copied')
  }, [session.id])

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Compact pane header */}
      <div className="px-3 py-2 border-b border-border flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <ConnectionStatus status={connection?.status ?? 'disconnected'} />
          <span className="font-mono text-xs text-foreground truncate">
            {session.id.slice(0, 8)}
          </span>
          <Badge variant={agentVariant} size="sm">{agentLabel}</Badge>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {status === 'streaming' && (
            <Badge variant="accent" size="sm" className="animate-pulse">live</Badge>
          )}
          {status === 'submitted' && (
            <Badge variant="outline" size="sm">sending</Badge>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className="p-1 rounded-md hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
                aria-label="Session actions"
              >
                <MoreHorizontal size={14} />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem onClick={() => setShowInfo((v) => !v)}>
                <Info size={14} className="mr-2" />
                Session info
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleCopyId}>
                <Copy size={14} className="mr-2" />
                Copy session ID
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => setShowDeleteConfirm(true)}
                className="text-danger focus:text-danger"
              >
                <Trash2 size={14} className="mr-2" />
                Delete session
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Session info panel — inline below header */}
      {showInfo && (
        <div className="px-3 py-2 border-b border-border bg-secondary/30 text-xs space-y-1 shrink-0">
          <div className="flex justify-between">
            <span className="text-muted-foreground">ID</span>
            <span className="font-mono text-foreground">{session.id}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Agent</span>
            <span className="text-foreground">{session.agent}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Status</span>
            <span className="text-foreground">{connection?.status ?? 'disconnected'}</span>
          </div>
          {session.status?.workingDirectory && (
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground shrink-0">Directory</span>
              <span className="font-mono text-foreground truncate">{session.status.workingDirectory}</span>
            </div>
          )}
          {session.status?.isResumable && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Resumable</span>
              <span className="text-foreground">Yes</span>
            </div>
          )}
        </div>
      )}

      {/* Delete confirmation */}
      <ConfirmDialog
        open={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        onConfirm={onDelete}
        title="Delete session"
        description={`Delete session ${session.id.slice(0, 8)}? This removes the session and its message history. This cannot be undone.`}
        confirmText="Delete"
        variant="danger"
      />

      {/* Messages — scrolls inside the pane, not the page */}
      <ChatErrorBoundary>
        <Conversation className="scrollbar-thin flex-1 min-h-0">
          <ConversationContent className="px-3">
            {messages.length === 0 ? (
              <ConversationEmptyState
                title="Start a conversation"
                description="Type a message below"
              />
            ) : (
              messages.map((msg) => <ApertureMessage key={msg.id} message={msg} />)
            )}
            {status === 'submitted' && (
              <div className="flex items-center gap-2 text-sm text-foreground/40">
                <Shimmer>Thinking...</Shimmer>
              </div>
            )}
          </ConversationContent>
          <ConversationScrollButton className="bg-accent text-nebula-bg-primary hover:bg-accent/90 shadow-lg" />
        </Conversation>
      </ChatErrorBoundary>

      {/* Permission requests */}
      {pendingPermissions.length > 0 && (
        <div className="px-3 py-2 border-t border-border bg-warning/5 shrink-0">
          <PermissionRequest
            permission={pendingPermissions[0]}
            onAddUserMessage={handleAddUserMessage}
            onRespond={(toolCallId, optionId, answers) => {
              sendPermissionResponse(sessionId, toolCallId, optionId, answers)
            }}
          />
        </div>
      )}

      {/* Input */}
      <div className="px-3 py-3 border-t border-border bg-card shrink-0">
        <PromptInput
          accept={IMAGE_LIMITS.ALLOWED_MIME_TYPES.join(',')}
          maxFileSize={IMAGE_LIMITS.MAX_BYTES}
          maxFiles={IMAGE_LIMITS.MAX_COUNT}
          multiple
          onError={handleFileError}
          onSubmit={handleSubmit}
        >
          <PromptInputHeader>
            <AttachmentsPreview maxFiles={IMAGE_LIMITS.MAX_COUNT} />
          </PromptInputHeader>
          <PromptInputBody>
            <PromptInputTextarea
              disabled={!isConnected}
              placeholder={isConnected ? 'Message...' : 'Connecting...'}
            />
          </PromptInputBody>
          <PromptInputFooter>
            <PromptInputTools>
              <PromptInputActionMenu>
                <PromptInputActionMenuTrigger />
                <PromptInputActionMenuContent>
                  <PromptInputActionAddAttachments />
                </PromptInputActionMenuContent>
              </PromptInputActionMenu>
            </PromptInputTools>
            <PromptInputSubmit
              disabled={!isConnected && !isInFlight}
              onStop={stop}
              status={status}
            />
          </PromptInputFooter>
        </PromptInput>
      </div>
    </div>
  )
}

// ── WorkspaceChatPane ──────────────────────────────────────────────────────
// Public export. Resolves session + message history, auto-connects the
// WebSocket on mount, then delegates to WorkspaceChatPaneReady.

export function WorkspaceChatPane({ sessionId }: { sessionId: string }) {
  const session = useSessionsStore((s) => s.sessions.find((item) => item.id === sessionId) ?? null)
  const connection = useSessionsStore((s) => s.connections[sessionId] ?? null)
  // useShallow: derived array — new reference on every call without it, which
  // triggers "getSnapshot should be cached" and an infinite re-render loop.
  const pendingPermissions = useSessionsStore(
    useShallow((s) =>
      Object.entries(s.pendingPermissions)
        .filter(([key]) => key.startsWith(`${sessionId}:`))
        .map(([, perm]) => perm),
    ),
  )
  const sendPermissionResponse = useSessionsStore((s) => s.sendPermissionResponse)
  const connectSession = useSessionsStore((s) => s.connectSession)
  const removeSession = useSessionsStore((s) => s.removeSession)
  const { initialMessages, persistMessages, reloadMessages } = usePersistedUIMessages(sessionId)

  // Connect exactly once per sessionId. Ref guards against StrictMode double-invoke.
  const hasConnected = useRef(false)
  useEffect(() => {
    if (hasConnected.current) return
    hasConnected.current = true
    void connectSession(sessionId)
  }, [sessionId, connectSession])

  const handleDelete = useCallback(async () => {
    try {
      await api.deleteSession(sessionId)
      await removeSession(sessionId)
      toast.success('Session deleted')
    } catch (err) {
      toast.error('Failed to delete session', {
        description: err instanceof Error ? err.message : 'Unknown error',
      })
    }
  }, [sessionId, removeSession])

  if (!session || initialMessages === null) {
    return (
      <div className="flex flex-col flex-1 min-h-0 items-center justify-center text-sm text-muted-foreground">
        Loading...
      </div>
    )
  }

  return (
    <WorkspaceChatPaneReady
      connection={connection}
      initialMessages={initialMessages}
      pendingPermissions={pendingPermissions}
      persistMessages={persistMessages}
      reloadMessages={reloadMessages}
      sendPermissionResponse={sendPermissionResponse}
      session={session}
      sessionId={sessionId}
      onDelete={handleDelete}
    />
  )
}
