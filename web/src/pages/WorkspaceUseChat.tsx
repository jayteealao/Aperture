import { useChat } from '@ai-sdk/react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { cn } from '@/utils/cn'
import { useSessionsStore } from '@/stores/sessions'
import { useAppStore } from '@/stores/app'
import { useToast } from '@/components/ui/Toast'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Card } from '@/components/ui/Card'
import { SaveRepoPrompt } from '@/components/session/SaveRepoPrompt'
import { SdkControlPanel } from '@/components/sdk'
import { PiControlPanel } from '@/components/pi/PiControlPanel'
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
import type { ConnectionState, Session } from '@/api/types'
import { IMAGE_LIMITS } from '@/api/types'
import { ApertureWebSocketTransport } from '@/api/chat-transport'
import { submitChatMessage } from '@/utils/chat-submit'
import { usePersistedUIMessages } from '@/hooks/usePersistedUIMessages'
import type { ApertureUIMessage } from '@/utils/ui-message'
import { Plus, Terminal } from 'lucide-react'

function WorkspaceChatView({ sessionId, isActive }: { sessionId: string; isActive: boolean }) {
  const session = useSessionsStore((state) => state.sessions.find((item) => item.id === sessionId) ?? null)
  const connection = useSessionsStore((state) => state.connections[sessionId] ?? null)
  const pendingPermissions = useSessionsStore((state) =>
    Object.entries(state.pendingPermissions)
      .filter(([key]) => key.startsWith(`${sessionId}:`))
      .map(([, permission]) => permission)
  )
  const sendPermissionResponse = useSessionsStore((state) => state.sendPermissionResponse)
  const setStreaming = useSessionsStore((state) => state.setStreaming)
  const { initialMessages, persistMessages } = usePersistedUIMessages(sessionId)

  if (!session || initialMessages === null) {
    return (
      <div className={cn('flex-1 flex items-center justify-center', !isActive && 'hidden')}>
        <div className="glass rounded-2xl px-4 py-3 text-sm text-(--color-text-secondary)">
          Loading conversation...
        </div>
      </div>
    )
  }

  return (
    <WorkspaceChatSessionReady
      connection={connection}
      initialMessages={initialMessages}
      isActive={isActive}
      pendingPermissions={pendingPermissions}
      persistMessages={persistMessages}
      sendPermissionResponse={sendPermissionResponse}
      session={session}
      sessionId={sessionId}
      setStreaming={setStreaming}
    />
  )
}

function WorkspaceChatSessionReady({
  sessionId,
  session,
  connection,
  isActive,
  pendingPermissions,
  initialMessages,
  persistMessages,
  sendPermissionResponse,
  setStreaming,
}: {
  sessionId: string
  session: Session
  connection: ConnectionState | null
  isActive: boolean
  pendingPermissions: Array<{ toolCallId: string; toolCall: unknown; options: unknown[] }>
  initialMessages: ApertureUIMessage[]
  persistMessages: (messages: ApertureUIMessage[]) => Promise<void>
  sendPermissionResponse: (sessionId: string, toolCallId: string, optionId: string | null, answers?: Record<string, string>) => void
  setStreaming: (sessionId: string, isStreaming: boolean) => void
}) {
  const toast = useToast()
  const transport = useMemo(() => new ApertureWebSocketTransport(sessionId), [sessionId])

  const { messages, sendMessage, setMessages, status, stop } = useChat<ApertureUIMessage>({
    id: sessionId,
    transport,
    messages: initialMessages,
    onFinish: ({ messages: nextMessages }) => {
      void persistMessages(nextMessages)
    },
    onError: (error) => {
      console.error('[useChat] Chat error:', error)
    },
  })

  useEffect(() => {
    void persistMessages(messages)
  }, [messages, persistMessages])

  /**
   * 6.2 sync: Bridge useChat.status back to the Zustand connection slice so that
   * SdkControlPanel, PiControlPanel, and Sidebar can read isStreaming from the
   * store without calling useChat (which is only available in this component).
   */
  useEffect(() => {
    setStreaming(sessionId, status === 'streaming')
  }, [sessionId, status, setStreaming])

  /**
   * MED-4 fix: Functional setMessages updater avoids stale closure over `messages`.
   * RS-1 fix: Explicit persistMessages call ensures the message is saved before
   * the caller sends the permission response over WebSocket.
   */
  const handleAddUserMessage = useCallback(
    async (content: string) => {
      const nextMessage: ApertureUIMessage = {
        id: crypto.randomUUID(),
        role: 'user',
        metadata: { timestamp: new Date().toISOString() },
        parts: [{ type: 'text', text: content }],
      }
      // Capture the updated array from the functional updater (runs synchronously)
      let updatedMessages: ApertureUIMessage[] = []
      setMessages((current) => {
        updatedMessages = [...current, nextMessage]
        return updatedMessages
      })
      // Persist explicitly — don't rely on useEffect timing for permission flow
      await persistMessages(updatedMessages)
    },
    [setMessages, persistMessages]
  )

  /**
   * PromptInput submit handler — receives { text, files } with files already
   * converted from blob URLs to data URLs by PromptInput's internal handler.
   * If this throws, PromptInput preserves the user's input for retry.
   */
  const handleSubmit = useCallback(
    async (message: PromptInputMessage) => {
      await submitChatMessage(message, {
        connection,
        sendMessage,
        notifyError: toast.error,
      })
    },
    [connection, sendMessage, toast]
  )

  /** Show a toast when PromptInput rejects a file (wrong type, too large, too many). */
  const handleFileError = useCallback(
    (err: { code: string; message: string }) => {
      toast.error('Attachment not added', err.message)
    },
    [toast]
  )

  const isConnected = connection?.status === 'connected'
  const isStreaming = status === 'streaming' || status === 'submitted'

  return (
    <div className={cn('flex h-full flex-col', !isActive && 'hidden')}>
      <div className="px-4 py-3 border-b border-(--color-border) flex items-center justify-between">
        <div className="flex items-center gap-3">
          <ConnectionStatus status={connection?.status || 'disconnected'} />
          <div>
            <h3 className="font-mono text-sm text-(--color-text-primary)">
              {session.id.slice(0, 12)}...
            </h3>
            <p className="text-xs text-(--color-text-muted)">{session.agent}</p>
          </div>
        </div>
        {status === 'streaming' && (
          <Badge variant="accent" size="sm" className="animate-pulse">
            Streaming...
          </Badge>
        )}
        {status === 'submitted' && (
          <Badge variant="outline" size="sm">
            Sending...
          </Badge>
        )}
      </div>

      <ChatErrorBoundary>
        <Conversation className="scrollbar-thin">
          <ConversationContent className="max-w-3xl mx-auto">
            {messages.length === 0 ? (
              <ConversationEmptyState
                description="Type a message below to get started"
                title="Start a conversation"
              />
            ) : (
              messages.map((message) => (
                <ApertureMessage key={message.id} message={message} />
              ))
            )}
            {status === 'submitted' && (
              <div className="flex items-center gap-2 text-sm text-(--color-text-muted)">
                <Shimmer>Thinking...</Shimmer>
              </div>
            )}
          </ConversationContent>
          <ConversationScrollButton className="bg-accent text-nebula-bg-primary hover:bg-accent/90 shadow-lg" />
        </Conversation>
      </ChatErrorBoundary>

      {pendingPermissions.length > 0 && (
        <div className="px-4 py-3 border-t border-(--color-border) bg-warning/5">
          <PermissionRequest
            onAddUserMessage={handleAddUserMessage}
            onRespond={(toolCallId, optionId, answers) => {
              sendPermissionResponse(sessionId, toolCallId, optionId, answers)
            }}
            permission={pendingPermissions[0]}
          />
        </div>
      )}

      <div className="px-4 py-4 border-t border-(--color-border) bg-(--color-bg-secondary)">
        <div className="max-w-3xl mx-auto">
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
                placeholder="Type your message... (Shift+Enter for new line)"
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
                disabled={!isConnected && !isStreaming}
                onStop={stop}
                status={status}
              />
            </PromptInputFooter>
          </PromptInput>

          <div className="mt-2 flex items-center justify-between text-xs text-(--color-text-muted)">
            <span>
              {isConnected
                ? 'Connected via WebSocket'
                : connection?.status === 'reconnecting'
                  ? `Reconnecting (attempt ${connection.retryCount})...`
                  : 'Disconnected'}
            </span>
            <span>Press Enter to send | Cmd+. for controls</span>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function WorkspaceUseChat() {
  const navigate = useNavigate()
  const { sessionId: urlSessionId } = useParams()
  const { sdkPanelOpen, toggleSdkPanel } = useAppStore()
  const { sessions, connections, activeSessionId, setActiveSession, connectSession } = useSessionsStore()

  const [showSaveRepoPrompt, setShowSaveRepoPrompt] = useState(false)
  const [pendingSaveRepoPath, setPendingSaveRepoPath] = useState<string | null>(null)

  useEffect(() => {
    const pending = sessionStorage.getItem('pendingSaveRepo')
    if (!pending) {
      return
    }

    try {
      const { repoPath } = JSON.parse(pending)
      setPendingSaveRepoPath(repoPath)
      setShowSaveRepoPrompt(true)
    } catch {
      // Ignore invalid session storage payloads.
    } finally {
      sessionStorage.removeItem('pendingSaveRepo')
    }
  }, [])

  const connectingRef = useRef<string | null>(null)
  useEffect(() => {
    if (urlSessionId && urlSessionId !== activeSessionId) {
      const exists = sessions.find((session) => session.id === urlSessionId)
      if (exists) {
        setActiveSession(urlSessionId)
        // Guard against redundant connectSession calls on re-renders
        if (connectingRef.current !== urlSessionId) {
          connectingRef.current = urlSessionId
          void connectSession(urlSessionId)
        }
      }
    }
  }, [activeSessionId, connectSession, sessions, setActiveSession, urlSessionId])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === '.') {
        event.preventDefault()
        toggleSdkPanel()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [toggleSdkPanel])

  const activeSession = useMemo(
    () => sessions.find((session) => session.id === activeSessionId) ?? null,
    [activeSessionId, sessions]
  )

  const mountedSessions = useMemo(
    () =>
      sessions.filter((session) => {
        if (session.id === activeSessionId) {
          return true
        }
        const connection = connections[session.id]
        return connection
          ? ['connected', 'connecting', 'reconnecting'].includes(connection.status)
          : false
      }),
    [activeSessionId, connections, sessions]
  )

  if (!activeSession) {
    return (
      <div className="h-full flex items-center justify-center p-6">
        <Card variant="glass" padding="lg" className="max-w-md text-center">
          <div className="py-8">
            <Terminal size={48} className="mx-auto text-(--color-text-muted) mb-4" />
            <h3 className="text-lg font-semibold text-(--color-text-primary)">No active session</h3>
            <p className="text-(--color-text-secondary) mb-4">
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
    <div className="h-full flex">
      <div className="flex-1 flex flex-col min-w-0">
        {showSaveRepoPrompt && pendingSaveRepoPath && (
          <SaveRepoPrompt
            open={showSaveRepoPrompt}
            onClose={() => {
              setShowSaveRepoPrompt(false)
              setPendingSaveRepoPath(null)
            }}
            repoPath={pendingSaveRepoPath}
          />
        )}

        {mountedSessions.map((session) => (
          <WorkspaceChatView
            key={session.id}
            isActive={session.id === activeSessionId}
            sessionId={session.id}
          />
        ))}
      </div>

      {activeSession.agent === 'claude_sdk' && (
        <SdkControlPanel
          sessionId={activeSessionId!}
          isOpen={sdkPanelOpen}
          onToggle={toggleSdkPanel}
        />
      )}
      {activeSession.agent === 'pi_sdk' && (
        <PiControlPanel
          sessionId={activeSessionId!}
          isStreaming={connections[activeSessionId!]?.isStreaming || false}
          isOpen={sdkPanelOpen}
          onToggle={toggleSdkPanel}
        />
      )}
    </div>
  )
}
