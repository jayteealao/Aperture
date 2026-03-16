import { useChat } from '@ai-sdk/react'
import type { FileUIPart } from 'ai'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { cn } from '@/utils/cn'
import { useSessionsStore } from '@/stores/sessions'
import { useAppStore } from '@/stores/app'
import { useToast } from '@/components/ui/Toast'
import { Button } from '@/components/ui/Button'
import { Textarea } from '@/components/ui/Textarea'
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
  ApertureMessage,
  ChatErrorBoundary,
  ConnectionStatus,
  PermissionRequest,
} from '@/components/chat'
import type { ConnectionState, ImageAttachment, Session } from '@/api/types'
import { IMAGE_LIMITS } from '@/api/types'
import { ApertureWebSocketTransport } from '@/api/chat-transport'
import { usePersistedUIMessages } from '@/hooks/usePersistedUIMessages'
import type { ApertureUIMessage } from '@/utils/ui-message'
import {
  Send,
  StopCircle,
  Plus,
  Terminal,
  Paperclip,
  X,
} from 'lucide-react'

function WorkspaceChatView({ sessionId, isActive }: { sessionId: string; isActive: boolean }) {
  const session = useSessionsStore((state) => state.sessions.find((item) => item.id === sessionId) ?? null)
  const connection = useSessionsStore((state) => state.connections[sessionId] ?? null)
  const pendingPermissions = useSessionsStore((state) =>
    Object.entries(state.pendingPermissions)
      .filter(([key]) => key.startsWith(`${sessionId}:`))
      .map(([, permission]) => permission)
  )
  const sendPermissionResponse = useSessionsStore((state) => state.sendPermissionResponse)
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
}: {
  sessionId: string
  session: Session
  connection: ConnectionState | null
  isActive: boolean
  pendingPermissions: Array<{ toolCallId: string; toolCall: unknown; options: unknown[] }>
  initialMessages: ApertureUIMessage[]
  persistMessages: (messages: ApertureUIMessage[]) => Promise<void>
  sendPermissionResponse: (sessionId: string, toolCallId: string, optionId: string | null, answers?: Record<string, string>) => void
}) {
  const toast = useToast()
  const [input, setInput] = useState('')
  const [attachedImages, setAttachedImages] = useState<ImageAttachment[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)
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

  const addImageFiles = useCallback((files: FileList | File[]) => {
    const fileArray = Array.from(files)
    const allowedTypes = IMAGE_LIMITS.ALLOWED_MIME_TYPES as readonly string[]

    for (const file of fileArray) {
      if (attachedImages.length >= IMAGE_LIMITS.MAX_COUNT) {
        break
      }
      if (!allowedTypes.includes(file.type)) {
        continue
      }
      if (file.size > IMAGE_LIMITS.MAX_BYTES) {
        continue
      }

      const reader = new FileReader()
      reader.onload = () => {
        const dataUrl = reader.result as string
        const base64 = dataUrl.split(',')[1]
        if (!base64) {
          return
        }

        setAttachedImages((current) => {
          if (current.length >= IMAGE_LIMITS.MAX_COUNT) {
            return current
          }
          return [
            ...current,
            {
              data: base64,
              mimeType: file.type as ImageAttachment['mimeType'],
              filename: file.name,
            },
          ]
        })
      }
      reader.readAsDataURL(file)
    }
  }, [attachedImages.length])

  const handleSend = useCallback(async () => {
    if (!input.trim()) {
      return
    }
    if (!connection || connection.status !== 'connected') {
      return
    }
    if (status === 'submitted' || status === 'streaming') {
      return
    }

    const content = input.trim()
    const files: FileUIPart[] | undefined =
      attachedImages.length > 0
        ? attachedImages.map((image) => ({
            type: 'file',
            mediaType: image.mimeType,
            filename: image.filename,
            url: `data:${image.mimeType};base64,${image.data}`,
          }))
        : undefined

    setInput('')
    setAttachedImages([])

    try {
      await sendMessage({
        text: content,
        files,
        metadata: { timestamp: new Date().toISOString() },
      })
    } catch (error) {
      console.error('[useChat] Send error:', error)
      toast.error('Failed to send message', 'Check your connection and try again.')
      setInput(content)
    }
  }, [attachedImages, connection, input, sendMessage, status, toast])

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault()
        void handleSend()
      }
    },
    [handleSend]
  )

  const handlePaste = useCallback((event: React.ClipboardEvent) => {
    const items = event.clipboardData?.items
    if (!items) {
      return
    }

    const imageFiles: File[] = []
    for (const item of Array.from(items)) {
      if (!item.type.startsWith('image/')) {
        continue
      }
      const file = item.getAsFile()
      if (file) {
        imageFiles.push(file)
      }
    }

    if (imageFiles.length > 0) {
      addImageFiles(imageFiles)
    }
  }, [addImageFiles])

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

  const isSending = status === 'submitted'
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
        {isStreaming && (
          <Badge variant="accent" size="sm" className="animate-pulse">
            Streaming...
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
            {isSending && (
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
          {attachedImages.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-2">
              {attachedImages.map((image, index) => (
                <div key={`${image.filename}-${index}`} className="relative group">
                  <img
                    src={`data:${image.mimeType};base64,${image.data}`}
                    alt={image.filename || `Image ${index + 1}`}
                    className="h-16 w-16 rounded-lg object-cover border border-(--color-border)"
                  />
                  <button
                    onClick={() => setAttachedImages((current) => current.filter((_, currentIndex) => currentIndex !== index))}
                    className="absolute -top-1.5 -right-1.5 p-0.5 rounded-full bg-(--color-bg-primary) border border-(--color-border) opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Remove image"
                  >
                    <X size={12} />
                  </button>
                </div>
              ))}
              {attachedImages.length < IMAGE_LIMITS.MAX_COUNT && (
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="h-16 w-16 rounded-lg border border-dashed border-(--color-border) flex items-center justify-center text-(--color-text-muted) hover:text-(--color-text-secondary) hover:border-(--color-text-muted) transition-colors"
                  title="Add more images"
                >
                  <Plus size={20} />
                </button>
              )}
            </div>
          )}

          <input
            ref={fileInputRef}
            type="file"
            accept={IMAGE_LIMITS.ALLOWED_MIME_TYPES.join(',')}
            multiple
            className="hidden"
            onChange={(event) => {
              if (event.target.files) {
                addImageFiles(event.target.files)
              }
              event.target.value = ''
            }}
          />

          <div className="flex items-end gap-3">
            <button
              onClick={() => fileInputRef.current?.click()}
              className="p-2.5 rounded-lg text-(--color-text-muted) hover:text-(--color-text-secondary) hover:bg-(--color-surface) transition-colors"
              title="Attach images"
              disabled={connection?.status !== 'connected'}
            >
              <Paperclip size={20} />
            </button>

            <div className="flex-1">
              <Textarea
                placeholder="Type your message... (Shift+Enter for new line)"
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={handleKeyDown}
                onPaste={handlePaste}
                autoGrow
                maxHeight={200}
                disabled={connection?.status !== 'connected'}
                className="min-h-[44px]"
              />
            </div>

            {isStreaming ? (
              <Button variant="danger" size="lg" onClick={() => void stop()}>
                <StopCircle size={20} />
              </Button>
            ) : (
              <Button
                variant="primary"
                size="lg"
                onClick={() => void handleSend()}
                disabled={!input.trim() || isSending || connection?.status !== 'connected'}
                loading={isSending}
              >
                <Send size={20} />
              </Button>
            )}
          </div>

          <div className="mt-2 flex items-center justify-between text-xs text-(--color-text-muted)">
            <span>
              {connection?.status === 'connected'
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
