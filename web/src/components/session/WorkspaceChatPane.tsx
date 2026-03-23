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
import { MoreHorizontal, Trash2, Info, Copy, ChevronDown, ChevronUp, PanelRight, PanelRightClose } from 'lucide-react'
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from '@/components/ai-elements/conversation'
import { Message, MessageContent } from '@/components/ai-elements/message'
import { Shimmer } from '@/components/ai-elements/shimmer'
import {
  PromptInput,
  PromptInputBody,
  PromptInputButton,
  PromptInputFooter,
  PromptInputHeader,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
  PromptInputActionMenu,
  PromptInputActionMenuTrigger,
  PromptInputActionMenuContent,
  PromptInputActionAddAttachments,
  usePromptInputAttachments,
} from '@/components/ai-elements/prompt-input'
import type { PromptInputMessage } from '@/components/ai-elements/prompt-input'
import {
  ApertureMessage,
  ApertureToolGroup,
  AttachmentsPreview,
  ChatErrorBoundary,
  ConnectionStatus,
  PermissionRequest,
} from '@/components/chat'
import { buildConversationRenderItems } from '@/components/chat/conversation-grouping'
import type { ToolPartUnion } from '@/components/chat/ApertureToolPart'
import { useChat } from '@ai-sdk/react'
import { api } from '@/api/client'
import { useSessionsStore } from '@/stores/sessions'
import { usePersistedUIMessages } from '@/hooks/usePersistedUIMessages'
import { ApertureWebSocketTransport } from '@/api/chat-transport'
import { wsManager } from '@/api/websocket'
import { submitChatMessage } from '@/utils/chat-submit'
import { formatMessageTimestamp } from '@/utils/format'
import type { ApertureUIMessage } from '@/utils/ui-message'
import type { ConnectionState, Session, TurnDiffSummary } from '@/api/types'
import { IMAGE_LIMITS } from '@/api/types'
import { SdkComposerControls, SdkControlPanel, SdkOverflowMenu } from '@/components/sdk'
import { cn } from '@/utils/cn'

// ── AttachmentCountBadge ───────────────────────────────────────────────────
// Reads attachment count from the PromptInput context and renders a small
// badge. Rendered only when the input is collapsed and attachments exist.

function AttachmentCountBadge() {
  const { files } = usePromptInputAttachments()
  if (files.length === 0) return null
  return (
    <span className="pointer-events-none absolute -right-0.5 -top-0.5 flex size-4 items-center justify-center rounded-full bg-accent text-[10px] font-bold leading-none text-nebula-bg-primary">
      {files.length}
    </span>
  )
}

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
  turnDiffSummaryByAssistantMessageId,
  reloadTurnDiffSummaries,
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
  turnDiffSummaryByAssistantMessageId: Map<string, TurnDiffSummary>
  reloadTurnDiffSummaries: () => Promise<TurnDiffSummary[]>
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
    void reloadTurnDiffSummaries()
  }, [connection?.status, reloadMessages, reloadTurnDiffSummaries, setMessages])

  const previousStreamingRef = useRef<boolean>(false)
  const previousPendingPermissionCountRef = useRef<number>(pendingPermissions.length)
  useEffect(() => {
    const wasStreaming = previousStreamingRef.current
    const hasStreaming = Boolean(connection?.isStreaming)
    const previousPendingCount = previousPendingPermissionCountRef.current
    const hasPendingPermissions = pendingPermissions.length > 0

    previousStreamingRef.current = hasStreaming
    previousPendingPermissionCountRef.current = pendingPermissions.length

    if (connection?.status !== 'connected') {
      return
    }

    const permissionResolved = previousPendingCount > 0 && !hasPendingPermissions
    const promptSettled = wasStreaming && !hasStreaming

    if (!permissionResolved && !promptSettled) {
      return
    }

    void reloadMessages().then((nextMessages) => {
      setMessages(nextMessages)
    })
    void reloadTurnDiffSummaries()
  }, [
    connection?.isStreaming,
    connection?.status,
    pendingPermissions.length,
    reloadMessages,
    reloadTurnDiffSummaries,
    setMessages,
  ])

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

  const handleFileError = useCallback(
    (err: { code: string; message: string }) => {
      toast.error('Attachment not added', { description: err.message })
    },
    [],
  )

  const isConnected = connection?.status === 'connected'
  const isInFlight = status === 'streaming' || status === 'submitted'
  const renderedConversationItems = useMemo(() => buildConversationRenderItems(messages), [messages])
  const hasPendingPermission = pendingPermissions.length > 0
  const activityLabel = hasPendingPermission
    ? 'Awaiting approval'
    : status === 'streaming'
      ? 'Agent active'
      : status === 'submitted'
        ? 'Starting'
        : null
  const agentLabel = session.agent === 'claude_sdk' ? 'SDK' : 'Pi'
  const agentVariant = (session.agent === 'claude_sdk' ? 'accent' : 'secondary') as 'accent' | 'secondary'

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [showInfo, setShowInfo] = useState(false)
  const [mobileHeaderCollapsed, setMobileHeaderCollapsed] = useState(true)
  const [sdkSidebarOpen, setSdkSidebarOpen] = useState(false)

  // ── Collapsible input state ──────────────────────────────────────────────
  const [isInputExpanded, setIsInputExpanded] = useState(true)
  const [inputValue, setInputValue] = useState('')
  // Ref keeps a fresh copy of inputValue accessible inside setTimeout callbacks
  // without stale-closure issues.
  const inputValueRef = useRef('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const blurTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Keep ref in sync with state
  useEffect(() => {
    inputValueRef.current = inputValue
  }, [inputValue])

  // Clean up any pending blur timer on unmount
  useEffect(() => {
    return () => {
      if (blurTimerRef.current) clearTimeout(blurTimerRef.current)
    }
  }, [])

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      inputValueRef.current = e.target.value
      setInputValue(e.target.value)
    },
    [],
  )

  // Expand and focus the textarea (used by click-to-expand and toggle)
  const expandAndFocus = useCallback(() => {
    setIsInputExpanded(true)
    // Small delay so the grid animation begins before we attempt focus
    setTimeout(() => textareaRef.current?.focus(), 10)
  }, [])

  // Toggle button handler
  const handleToggleExpand = useCallback(() => {
    setIsInputExpanded((prev) => {
      if (!prev) {
        setTimeout(() => textareaRef.current?.focus(), 10)
      }
      return !prev
    })
  }, [])

  // Triggered when the collapsed preview text is clicked
  const handleExpand = useCallback(() => {
    expandAndFocus()
  }, [expandAndFocus])

  // Auto-expand on textarea focus
  const handleTextareaFocus = useCallback(() => {
    if (blurTimerRef.current) {
      clearTimeout(blurTimerRef.current)
      blurTimerRef.current = null
    }
    setIsInputExpanded(true)
  }, [])

  // Auto-collapse on textarea blur if input is empty.
  // 150ms delay prevents collapsing when focus shifts to toolbar buttons.
  const handleTextareaBlur = useCallback(() => {
    blurTimerRef.current = setTimeout(() => {
      blurTimerRef.current = null
      if (inputValueRef.current.trim() === '') {
        setIsInputExpanded(false)
      }
    }, 150)
  }, [])

  const handleCopyId = useCallback(() => {
    void navigator.clipboard.writeText(session.id)
    toast.success('Session ID copied')
  }, [session.id])

  const handleStop = useCallback(() => {
    wsManager.send(sessionId, { type: 'interrupt' })
    stop()
  }, [sessionId, stop])

  const handleSubmit = useCallback(
    async (message: PromptInputMessage) => {
      // Clear and collapse on submit
      setInputValue('')
      inputValueRef.current = ''
      setIsInputExpanded(false)

      await submitChatMessage(message, {
        connection,
        sendMessage,
        notifyError: (title, body) => toast.error(title, { description: body }),
      })
    },
    [connection, sendMessage],
  )

  return (
    <div className="flex h-full min-h-0 max-w-full flex-1 overflow-hidden">
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
      {/* Compact pane header */}
      <div className="hidden shrink-0 items-center justify-between border-b border-border px-3 py-2 sm:flex">
        <div className="flex items-center gap-2 min-w-0">
          <ConnectionStatus status={connection?.status ?? 'disconnected'} />
          <span className="font-mono text-xs text-foreground truncate">
            {session.id.slice(0, 8)}
          </span>
          <Badge variant={agentVariant} size="sm">{agentLabel}</Badge>
          {activityLabel && (
            <div className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
              <span className="size-2 shrink-0 rounded-full bg-accent animate-pulse" />
              <Shimmer>{activityLabel}</Shimmer>
            </div>
          )}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {session.agent === 'claude_sdk' && (
            <button
              type="button"
              className="rounded-md p-1 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
              aria-label={sdkSidebarOpen ? 'Close SDK sidebar' : 'Open SDK sidebar'}
              onClick={() => setSdkSidebarOpen((value) => !value)}
            >
              {sdkSidebarOpen ? <PanelRightClose size={14} /> : <PanelRight size={14} />}
            </button>
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

      <div className="flex shrink-0 items-center justify-between border-b border-border px-2 py-1.5 sm:hidden">
        <div className="flex min-w-0 items-center gap-2">
          <ConnectionStatus status={connection?.status ?? 'disconnected'} />
          <span className="font-mono text-xs text-foreground truncate">
            {session.id.slice(0, 8)}
          </span>
          <Badge variant={agentVariant} size="sm">{agentLabel}</Badge>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            className="rounded-md p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
            onClick={() => setMobileHeaderCollapsed((value) => !value)}
            aria-label={mobileHeaderCollapsed ? 'Expand session controls' : 'Collapse session controls'}
          >
            {mobileHeaderCollapsed ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className="rounded-md p-1 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
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

      {activityLabel && (
        <div className="flex shrink-0 items-center gap-1.5 border-b border-border px-3 py-1.5 text-xs text-muted-foreground sm:hidden">
          <span className="size-2 shrink-0 rounded-full bg-accent animate-pulse" />
          <Shimmer>{activityLabel}</Shimmer>
        </div>
      )}

      {/* Session info panel — inline below header */}
      {showInfo && !mobileHeaderCollapsed && (
        <div className="border-b border-border bg-secondary/30 px-3 py-2 text-xs space-y-1 shrink-0 sm:hidden">
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
        </div>
      )}

      {showInfo && (
        <div className="hidden shrink-0 space-y-1 border-b border-border bg-secondary/30 px-3 py-2 text-xs sm:block">
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
          <ConversationContent className="max-w-full overflow-x-hidden px-3">
            {messages.length === 0 ? (
              <ConversationEmptyState
                title="Start a conversation"
                description="Type a message below"
              />
            ) : (
              renderedConversationItems.map((item) =>
                item.kind === 'message' ? (
                  <ApertureMessage
                    key={item.key}
                    message={item.message}
                    sessionId={sessionId}
                    turnDiffSummary={turnDiffSummaryByAssistantMessageId.get(item.message.id) ?? null}
                  />
                ) : (
                  <GroupedToolMessages
                    key={item.key}
                    parts={item.parts}
                    timestamp={item.timestamp}
                  />
                ),
              )
            )}
            {status === 'submitted' && !hasPendingPermission && (
              <div className="flex max-w-full items-center gap-2 text-sm text-foreground/40">
                <span className="size-2 shrink-0 rounded-full bg-accent animate-pulse" />
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
          {/* ── Collapsible section: attachments preview + textarea ─────── */}
          {/* Uses the CSS grid trick for smooth zero-height animation.      */}
          {/* The inner flex-col div ensures correct header/body stacking.   */}
          <div
            className={cn(
              'w-full grid transition-[grid-template-rows] duration-200 ease-in-out',
              isInputExpanded ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]',
            )}
          >
            <div className="flex min-h-0 flex-col overflow-hidden">
              <PromptInputHeader>
                <AttachmentsPreview maxFiles={IMAGE_LIMITS.MAX_COUNT} />
              </PromptInputHeader>
              <PromptInputBody>
                <PromptInputTextarea
                  ref={textareaRef}
                  disabled={!isConnected}
                  placeholder={isConnected ? 'Message...' : 'Connecting...'}
                  value={inputValue}
                  onChange={handleInputChange}
                  onFocus={handleTextareaFocus}
                  onBlur={handleTextareaBlur}
                />
              </PromptInputBody>
            </div>
          </div>

          {/* ── Footer toolbar: always visible ──────────────────────────── */}
          <PromptInputFooter>
            {/* Left side: toggle + attachment + model + collapsed preview */}
            <PromptInputTools className="min-w-0 flex-1">
              {/* Collapse / expand toggle */}
              <PromptInputButton
                onClick={handleToggleExpand}
                aria-label={isInputExpanded ? 'Collapse input' : 'Expand input'}
                aria-expanded={isInputExpanded}
                tooltip={{ content: isInputExpanded ? 'Collapse' : 'Expand', side: 'top' }}
              >
                {isInputExpanded
                  ? <ChevronDown className="size-4" />
                  : <ChevronUp className="size-4" />}
              </PromptInputButton>

              {/* Add files — with attachment count badge when collapsed */}
              <div className="relative">
                <PromptInputActionMenu>
                  <PromptInputActionMenuTrigger />
                  <PromptInputActionMenuContent>
                    <PromptInputActionAddAttachments />
                  </PromptInputActionMenuContent>
                </PromptInputActionMenu>
                {!isInputExpanded && <AttachmentCountBadge />}
              </div>

              {/* Model selector — always visible */}
              <SdkComposerControls
                connected={isConnected}
                sessionId={sessionId}
                variant="toolbar"
              />

              {/* Collapsed text preview — fills remaining space, click to expand */}
              {!isInputExpanded && (
                <button
                  type="button"
                  className="min-h-8 min-w-0 flex-1 truncate px-1 text-left text-sm opacity-50 hover:opacity-70 transition-opacity"
                  onClick={handleExpand}
                  aria-label="Expand message input"
                >
                  {inputValue.trim() !== '' ? inputValue : 'Message...'}
                </button>
              )}
            </PromptInputTools>

            {/* Right side: overflow settings + submit */}
            <div className="flex shrink-0 items-center gap-1">
              <SdkOverflowMenu connected={isConnected} sessionId={sessionId} />
              <PromptInputSubmit
                disabled={!isConnected && !isInFlight}
                onStop={handleStop}
                status={status}
              />
            </div>
          </PromptInputFooter>
        </PromptInput>
      </div>
      </div>

      {session.agent === 'claude_sdk' && (
        <div className="hidden h-full shrink-0 md:flex">
          <SdkControlPanel
            connected={isConnected}
            isOpen={sdkSidebarOpen}
            onToggle={() => setSdkSidebarOpen((value) => !value)}
            sessionId={sessionId}
          />
        </div>
      )}
    </div>
  )
}

function GroupedToolMessages({
  parts,
  timestamp,
}: {
  parts: ToolPartUnion[]
  timestamp: string | null
}) {
  return (
    <Message from="assistant">
      <MessageContent>
        <ApertureToolGroup parts={parts} />
        {timestamp && (
          <div className="mt-2 text-2xs opacity-50">
            {formatMessageTimestamp(timestamp)}
          </div>
        )}
      </MessageContent>
    </Message>
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
  const updateConnection = useSessionsStore((s) => s.updateConnection)
  const removeSession = useSessionsStore((s) => s.removeSession)
  const { initialMessages, persistMessages, reloadMessages } = usePersistedUIMessages(sessionId)
  const [turnDiffSummaries, setTurnDiffSummaries] = useState<TurnDiffSummary[]>([])

  const shouldConnect = !!session && (session.status.running || !!session.status.isResumable)
  const reloadTurnDiffSummaries = useCallback(async () => {
    try {
      const response = await api.listTurnDiffSummaries(sessionId)
      setTurnDiffSummaries(response.summaries)
      return response.summaries
    } catch {
      setTurnDiffSummaries([])
      return []
    }
  }, [sessionId])

  // Connect exactly once per sessionId. Ref guards against StrictMode double-invoke.
  const hasConnected = useRef(false)
  useEffect(() => {
    if (hasConnected.current) return
    hasConnected.current = true
    if (shouldConnect) {
      void connectSession(sessionId)
      return
    }

    updateConnection(sessionId, { status: 'ended', error: null, isStreaming: false })
  }, [sessionId, connectSession, shouldConnect, updateConnection])

  useEffect(() => {
    void reloadTurnDiffSummaries()
  }, [reloadTurnDiffSummaries])

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
      <div className="flex h-full min-h-0 flex-1 flex-col items-center justify-center text-sm text-muted-foreground">
        Loading...
      </div>
    )
  }

  const turnDiffSummaryByAssistantMessageId = new Map(
    turnDiffSummaries.map((summary) => [summary.assistantMessageId, summary] as const)
  )

  return (
    <WorkspaceChatPaneReady
      connection={connection}
      initialMessages={initialMessages}
      pendingPermissions={pendingPermissions}
      persistMessages={persistMessages}
      reloadMessages={reloadMessages}
      turnDiffSummaryByAssistantMessageId={turnDiffSummaryByAssistantMessageId}
      reloadTurnDiffSummaries={reloadTurnDiffSummaries}
      sendPermissionResponse={sendPermissionResponse}
      session={session}
      sessionId={sessionId}
      onDelete={handleDelete}
    />
  )
}
