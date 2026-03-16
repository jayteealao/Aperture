import { useChat } from '@ai-sdk/react'
import type { FileUIPart } from 'ai'
import { isTextUIPart, isReasoningUIPart, isFileUIPart, isToolUIPart } from 'ai'
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
import { ToolCallDisplay } from '@/components/session/ToolCallDisplay'
import { AskUserQuestionDisplay, isAskUserQuestionInput } from '@/components/session/AskUserQuestionDisplay'
import { SdkControlPanel } from '@/components/sdk'
import { PiControlPanel } from '@/components/pi/PiControlPanel'
import { Reasoning, ReasoningContent, ReasoningTrigger } from '@/components/ai-elements/reasoning'
import { Tool, ToolContent, ToolHeader, ToolInput, ToolOutput } from '@/components/ai-elements/tool'
import { MessageResponse } from '@/components/ai-elements/message'
import type { ConnectionState, PermissionOption, ImageAttachment, Session } from '@/api/types'
import { IMAGE_LIMITS } from '@/api/types'
import { ApertureWebSocketTransport } from '@/api/chat-transport'
import { usePersistedUIMessages } from '@/hooks/usePersistedUIMessages'
import type { ApertureUIMessage } from '@/utils/ui-message'
import { getMessageTimestamp } from '@/utils/ui-message'
import {
  Send,
  StopCircle,
  Plus,
  AlertCircle,
  Terminal,
  ArrowDown,
  Paperclip,
  X,
} from 'lucide-react'

function ConnectionStatus({ status }: { status: string }) {
  const colors: Record<string, string> = {
    connected: 'bg-success',
    connecting: 'bg-warning animate-pulse',
    reconnecting: 'bg-warning animate-pulse',
    disconnected: 'bg-(--color-text-muted)',
    error: 'bg-danger',
    ended: 'bg-(--color-text-muted)',
  }

  return (
    <span
      className={cn('w-2.5 h-2.5 rounded-full shrink-0', colors[status] || colors.disconnected)}
      title={status}
    />
  )
}

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
  const [isAtBottom, setIsAtBottom] = useState(true)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
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

  const handleScroll = useCallback(() => {
    const container = scrollContainerRef.current
    if (!container) {
      return
    }

    const threshold = 100
    const nextIsAtBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight < threshold
    setIsAtBottom(nextIsAtBottom)
  }, [])

  useEffect(() => {
    if (!isActive || !isAtBottom) {
      return
    }

    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [isActive, isAtBottom, messages])

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    setIsAtBottom(true)
  }, [])

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
      toast.error('Failed to send', error instanceof Error ? error.message : 'Unknown error')
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

      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto scrollbar-thin relative"
      >
        <div className="max-w-3xl mx-auto px-4 py-6 space-y-4">
          {messages.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-(--color-text-muted)">Send a message to start the conversation</p>
            </div>
          ) : (
            messages.map((message) => <UIMessageBubble key={message.id} message={message} />)
          )}
          <div ref={messagesEndRef} />
        </div>
        {!isAtBottom && (
          <button
            onClick={scrollToBottom}
            className="sticky bottom-4 left-1/2 -translate-x-1/2 p-3 bg-accent text-nebula-bg-primary rounded-full shadow-lg hover:bg-accent/90 transition-colors z-10"
            title="Scroll to bottom"
          >
            <ArrowDown className="w-5 h-5" />
          </button>
        )}
      </div>

      {pendingPermissions.length > 0 && (
        <div className="px-4 py-3 border-t border-(--color-border) bg-warning/5">
          <PermissionRequest
            permission={pendingPermissions[0]}
            onAddUserMessage={(content) => {
              const nextMessage: ApertureUIMessage = {
                id: crypto.randomUUID(),
                role: 'user',
                metadata: { timestamp: new Date().toISOString() },
                parts: [{ type: 'text', text: content }],
              }

              setMessages((current) => [...current, nextMessage])
              return persistMessages([...messages, nextMessage])
            }}
            onRespond={(toolCallId, optionId, answers) => {
              sendPermissionResponse(sessionId, toolCallId, optionId, answers)
            }}
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

function UIMessageBubble({ message }: { message: ApertureUIMessage }) {
  const isUser = message.role === 'user'
  const textParts = message.parts.filter(isTextUIPart)
  const reasoningParts = message.parts.filter(isReasoningUIPart)
  const fileParts = message.parts.filter(isFileUIPart)
  const toolParts = message.parts.filter(isToolUIPart)
  const timestamp = getMessageTimestamp(message)

  return (
    <div className={cn('flex', isUser ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'max-w-[85%] rounded-2xl px-4 py-3 animate-in',
          isUser ? 'bg-accent text-nebula-bg-primary rounded-br-md' : 'glass rounded-bl-md'
        )}
      >
        <div className="text-xs font-medium opacity-70 mb-2">
          {isUser ? 'You' : message.role === 'assistant' ? 'Assistant' : message.role}
        </div>

        {fileParts.length > 0 && (
          <div className="mb-3 flex flex-wrap gap-2">
            {fileParts.map((part) => (
              part.mediaType.startsWith('image/') ? (
                <img
                  key={part.url}
                  src={part.url}
                  alt={part.filename || 'Attachment'}
                  className="max-h-48 max-w-[280px] rounded-lg object-contain border border-(--color-border)"
                />
              ) : (
                <a
                  key={part.url}
                  href={part.url}
                  download={part.filename}
                  className="text-sm underline underline-offset-4"
                >
                  {part.filename || part.mediaType}
                </a>
              )
            ))}
          </div>
        )}

        {reasoningParts.length > 0 && (
          <div className="mb-3 space-y-2">
            {reasoningParts.map((part, index) => (
              <Reasoning key={`${message.id}-reasoning-${index}`} isStreaming={part.state === 'streaming'}>
                <ReasoningTrigger />
                <ReasoningContent>{part.text}</ReasoningContent>
              </Reasoning>
            ))}
          </div>
        )}

        {textParts.length > 0 && (
          <div className="prose prose-sm max-w-none dark:prose-invert">
            {textParts.map((part, index) => (
              <MessageResponse key={`${message.id}-text-${index}`} isAnimating={part.state === 'streaming'}>
                {part.text}
              </MessageResponse>
            ))}
          </div>
        )}

        {toolParts.length > 0 && (
          <div className="mt-3 space-y-2">
            {toolParts.map((part) => {
              const toolName =
                part.type === 'dynamic-tool'
                  ? part.toolName
                  : part.type.split('-').slice(1).join('-')
              return (
                <Tool key={part.toolCallId} defaultOpen={part.state !== 'output-available'}>
                  {part.type === 'dynamic-tool' ? (
                    <ToolHeader
                      state={part.state}
                      title={toolName}
                      type={part.type}
                      toolName={toolName}
                    />
                  ) : (
                    <ToolHeader state={part.state} title={toolName} type={part.type} />
                  )}
                  <ToolContent>
                    {part.input !== undefined && <ToolInput input={part.input} />}
                    <ToolOutput
                      errorText={'errorText' in part ? part.errorText : undefined}
                      output={'output' in part ? part.output : undefined}
                    />
                  </ToolContent>
                </Tool>
              )
            })}
          </div>
        )}

        {timestamp && (
          <div className="mt-2 text-2xs opacity-50">
            {new Date(timestamp).toLocaleTimeString()}
          </div>
        )}
      </div>
    </div>
  )
}

function PermissionRequest({
  permission,
  onRespond,
  onAddUserMessage,
}: {
  permission: { toolCallId: string; toolCall: unknown; options: unknown[] }
  onRespond: (toolCallId: string, optionId: string | null, answers?: Record<string, string>) => void
  onAddUserMessage: (content: string) => Promise<void>
}) {
  const toolCall = permission.toolCall as { name?: string; title?: string; rawInput?: unknown }
  const options = permission.options as PermissionOption[]
  const toolName = toolCall?.name || toolCall?.title
  const isAskUserQuestion = toolName === 'AskUserQuestion' && isAskUserQuestionInput(toolCall.rawInput)
  const allowOption = options.find((option) => option.kind?.includes('allow'))

  const handleAskUserQuestionSubmit = async (answers: Record<string, string>) => {
    if (!allowOption) {
      return
    }

    const answerText = Object.entries(answers)
      .map(([header, value]) => `${header}: ${value}`)
      .join('\n')

    await onAddUserMessage(`My answers:\n${answerText}`)
    onRespond(permission.toolCallId, allowOption.optionId, answers)
  }

  return (
    <Card variant="glass" padding="md" className={cn('border-l-4', isAskUserQuestion ? 'border-l-accent' : 'border-l-warning')}>
      <div className="flex items-start gap-3">
        <AlertCircle size={20} className={cn('shrink-0 mt-0.5', isAskUserQuestion ? 'text-accent' : 'text-warning')} />
        <div className="flex-1 min-w-0">
          <h4 className="font-medium text-(--color-text-primary)">
            {isAskUserQuestion ? 'Question from Agent' : 'Permission Required'}
          </h4>

          {!isAskUserQuestion && (
            <p className="text-sm text-(--color-text-secondary) mt-1">
              {toolCall?.title || 'The agent wants to perform an action'}
            </p>
          )}

          {isAskUserQuestion ? (
            <AskUserQuestionDisplay
              input={toolCall.rawInput as { questions: Array<{ question: string; header: string; options: Array<{ label: string; description: string }>; multiSelect: boolean }> }}
              onSubmit={handleAskUserQuestionSubmit}
            />
          ) : toolCall?.rawInput ? (
            <>
              <ToolCallDisplay name={toolCall.name} rawInput={toolCall.rawInput as Record<string, unknown>} />
              <div className="flex flex-wrap gap-2 mt-3">
                {options.map((option) => {
                  const isAllow = option.kind?.includes('allow')
                  return (
                    <Button
                      key={option.optionId}
                      variant={isAllow ? 'primary' : 'secondary'}
                      size="sm"
                      onClick={() => onRespond(permission.toolCallId, option.optionId)}
                    >
                      {option.name}
                    </Button>
                  )
                })}
                <Button variant="ghost" size="sm" onClick={() => onRespond(permission.toolCallId, null)}>
                  Deny
                </Button>
              </div>
            </>
          ) : null}
        </div>
      </div>
    </Card>
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
