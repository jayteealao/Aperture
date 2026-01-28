import React from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { cn } from '@/utils/cn'
import {
  HUDLabel,
  HUDMicro,
  HUDTitle,
  HUDData,
  Button,
  Badge,
  StatusDot,
  Textarea,
  Spinner,
  Corners,
} from '@/components/ui'
import { Shell, Topbar, Sidebar } from '@/components/layout'
import { PiControlPanel } from '@/components/pi/PiControlPanel'
import { SdkControlPanel } from '@/components/sdk/SdkControlPanel'
import { useSessionsStore, useAppStore } from '@/stores'
import type { Message, ContentBlock, Session } from '@/api/types'
import {
  Send,
  StopCircle,
  Bot,
  User,
  Cpu,
  Wrench,
  Brain,
  AlertCircle,
  Image as ImageIcon,
} from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism'

export function WorkspacePage() {
  const { sessionId } = useParams<{ sessionId: string }>()
  const navigate = useNavigate()
  const { sidebarOpen, sdkPanelOpen } = useAppStore()
  const {
    sessions,
    messages,
    connections,
    activeSessionId,
    setActiveSession,
    connectSession,
    sendMessage,
    cancelPrompt,
    loadMessagesForSession,
  } = useSessionsStore()

  const [input, setInput] = React.useState('')
  const [isSending, setIsSending] = React.useState(false)
  const messagesEndRef = React.useRef<HTMLDivElement>(null)

  const session = sessions.find((s) => s.id === sessionId)
  const sessionMessages = sessionId ? messages[sessionId] || [] : []
  const connection = sessionId ? connections[sessionId] : undefined
  const isStreaming = connection?.isStreaming || false
  const isConnected = connection?.status === 'connected'

  // Connect to session on mount
  React.useEffect(() => {
    if (sessionId && sessionId !== activeSessionId) {
      setActiveSession(sessionId)
      loadMessagesForSession(sessionId)
      connectSession(sessionId)
    }
  }, [sessionId])

  // Scroll to bottom on new messages
  React.useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [sessionMessages])

  // Redirect if session not found
  React.useEffect(() => {
    if (sessionId && sessions.length > 0 && !session) {
      navigate('/sessions')
    }
  }, [session, sessions])

  const handleSend = async () => {
    if (!input.trim() || !sessionId || !isConnected) return

    setIsSending(true)
    try {
      await sendMessage(sessionId, input.trim())
      setInput('')
    } catch (error) {
      console.error('Failed to send message:', error)
    } finally {
      setIsSending(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleCancel = () => {
    if (sessionId) {
      cancelPrompt(sessionId)
    }
  }

  if (!session) {
    return (
      <Shell sidebarOpen={sidebarOpen} topbar={<Topbar />} sidebar={<Sidebar />}>
        <div className="flex-1 flex items-center justify-center">
          <Spinner size="lg" />
        </div>
      </Shell>
    )
  }

  const rightPanel =
    session.agent === 'pi_sdk' ? (
      <PiControlPanel sessionId={sessionId!} />
    ) : (
      <SdkControlPanel sessionId={sessionId!} />
    )

  return (
    <Shell
      sidebarOpen={sidebarOpen}
      rightPanelOpen={sdkPanelOpen}
      topbar={<Topbar />}
      sidebar={<Sidebar />}
      rightPanel={rightPanel}
    >
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Session header */}
        <SessionHeader session={session} connection={connection} />

        {/* Messages area */}
        <div className="flex-1 overflow-y-auto p-4 scrollbar-hide">
          {sessionMessages.length === 0 ? (
            <EmptyMessages agent={session.agent} />
          ) : (
            <div className="space-y-4 max-w-4xl mx-auto">
              {sessionMessages.map((message) => (
                <MessageBubble key={message.id} message={message} agent={session.agent} />
              ))}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Input area */}
        <div className="shrink-0 border-t border-hud-gray/50 p-4">
          <div className="max-w-4xl mx-auto">
            <div className="relative">
              <Textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={isConnected ? 'Type your message...' : 'Connecting...'}
                disabled={!isConnected || isStreaming}
                className="pr-24 min-h-[60px] max-h-[200px] resize-none"
              />
              <div className="absolute bottom-2 right-2 flex items-center gap-2">
                {isStreaming ? (
                  <Button
                    variant="danger"
                    size="sm"
                    icon={<StopCircle className="w-4 h-4" />}
                    onClick={handleCancel}
                  >
                    Stop
                  </Button>
                ) : (
                  <Button
                    variant="primary"
                    size="sm"
                    icon={<Send className="w-4 h-4" />}
                    onClick={handleSend}
                    disabled={!input.trim() || !isConnected}
                    loading={isSending}
                  >
                    Send
                  </Button>
                )}
              </div>
            </div>
            <HUDMicro className="mt-2 text-hud-text/50">
              Press Enter to send, Shift+Enter for new line
            </HUDMicro>
          </div>
        </div>
      </div>
    </Shell>
  )
}

interface SessionHeaderProps {
  session: Session
  connection?: { status: string; isStreaming: boolean }
}

function SessionHeader({ session, connection }: SessionHeaderProps) {
  const status = connection?.status || 'disconnected'
  const isStreaming = connection?.isStreaming || false

  const getStatusColor = (): 'connected' | 'disconnected' | 'connecting' | 'error' => {
    switch (status) {
      case 'connected':
        return 'connected'
      case 'connecting':
      case 'reconnecting':
        return 'connecting'
      case 'error':
        return 'error'
      default:
        return 'disconnected'
    }
  }

  return (
    <div className="shrink-0 border-b border-hud-gray/50 px-4 py-3 bg-hud-black/50">
      <div className="flex items-center justify-between max-w-4xl mx-auto">
        <div className="flex items-center gap-4">
          <div
            className={cn(
              'w-10 h-10 flex items-center justify-center border',
              session.agent === 'claude_sdk' ? 'border-hud-info' : 'border-hud-success'
            )}
          >
            {session.agent === 'claude_sdk' ? (
              <Bot className="w-5 h-5 text-hud-info" />
            ) : (
              <Cpu className="w-5 h-5 text-hud-success" />
            )}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <HUDLabel className="text-hud-white">
                {session.agent === 'claude_sdk' ? 'Claude SDK' : 'Pi SDK'}
              </HUDLabel>
              <Badge variant="outline" size="sm">
                {session.id.slice(0, 8)}
              </Badge>
            </div>
            <div className="flex items-center gap-2 mt-0.5">
              <StatusDot status={getStatusColor()} pulse={isStreaming} />
              <HUDMicro>{status.toUpperCase()}</HUDMicro>
              {isStreaming && (
                <>
                  <span className="text-hud-text/30">|</span>
                  <Spinner size="sm" />
                  <HUDMicro className="text-hud-accent">Streaming</HUDMicro>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Session info */}
        {session.status.workingDirectory && (
          <HUDData className="max-w-xs truncate">{session.status.workingDirectory}</HUDData>
        )}
      </div>
    </div>
  )
}

function EmptyMessages({ agent }: { agent: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center">
      <div className="w-24 h-24 mb-6 relative">
        <div className="absolute inset-0 border border-hud-gray/50 rounded-full" />
        <div className="absolute inset-2 border border-dashed border-hud-gray/30 rounded-full animate-spin-slow" />
        <div className="absolute inset-0 flex items-center justify-center">
          {agent === 'claude_sdk' ? (
            <Bot className="w-10 h-10 text-hud-text/30" />
          ) : (
            <Cpu className="w-10 h-10 text-hud-text/30" />
          )}
        </div>
      </div>
      <HUDTitle className="text-lg text-hud-text">Session Ready</HUDTitle>
      <HUDMicro className="mt-2 max-w-xs">
        Start a conversation with the {agent === 'claude_sdk' ? 'Claude' : 'Pi'} agent
      </HUDMicro>
    </div>
  )
}

interface MessageBubbleProps {
  message: Message
  agent: string
}

function MessageBubble({ message, agent }: MessageBubbleProps) {
  const isUser = message.role === 'user'

  // Parse content blocks if array
  const contentBlocks: ContentBlock[] =
    typeof message.content === 'string'
      ? [{ type: 'text', text: message.content }]
      : (message.content as ContentBlock[])

  return (
    <div className={cn('flex gap-3', isUser ? 'justify-end' : 'justify-start')}>
      {/* Avatar */}
      {!isUser && (
        <div
          className={cn(
            'shrink-0 w-8 h-8 flex items-center justify-center border mt-1',
            agent === 'claude_sdk' ? 'border-hud-info' : 'border-hud-success'
          )}
        >
          {agent === 'claude_sdk' ? (
            <Bot className="w-4 h-4 text-hud-info" />
          ) : (
            <Cpu className="w-4 h-4 text-hud-success" />
          )}
        </div>
      )}

      {/* Message content */}
      <div
        className={cn(
          'relative max-w-[80%] p-3 border',
          isUser
            ? 'bg-hud-accent/10 border-hud-accent/30'
            : 'bg-hud-dark border-hud-gray/50'
        )}
      >
        <Corners size="sm" accent={isUser} />

        {/* Content blocks */}
        <div className="space-y-2">
          {contentBlocks.map((block, index) => (
            <ContentBlockRenderer key={index} block={block} />
          ))}
        </div>

        {/* Timestamp */}
        <HUDMicro className="block mt-2 text-hud-text/40">
          {new Date(message.timestamp).toLocaleTimeString()}
        </HUDMicro>
      </div>

      {/* User avatar */}
      {isUser && (
        <div className="shrink-0 w-8 h-8 flex items-center justify-center border border-hud-accent mt-1">
          <User className="w-4 h-4 text-hud-accent" />
        </div>
      )}
    </div>
  )
}

function ContentBlockRenderer({ block }: { block: ContentBlock }) {
  switch (block.type) {
    case 'text':
      return (
        <div className="prose prose-invert prose-sm max-w-none">
          <ReactMarkdown
            components={{
              code({ node, className, children, ...props }) {
                const match = /language-(\w+)/.exec(className || '')
                const isInline = !match
                return isInline ? (
                  <code
                    className="bg-hud-gray/50 px-1 py-0.5 text-hud-accent font-mono text-sm"
                    {...props}
                  >
                    {children}
                  </code>
                ) : (
                  <SyntaxHighlighter
                    style={oneDark}
                    language={match[1]}
                    PreTag="div"
                    customStyle={{
                      background: '#0A0A0A',
                      border: '1px solid #1A1A1A',
                      borderRadius: 0,
                      fontSize: '0.75rem',
                    }}
                  >
                    {String(children).replace(/\n$/, '')}
                  </SyntaxHighlighter>
                )
              },
            }}
          >
            {block.text || ''}
          </ReactMarkdown>
        </div>
      )

    case 'thinking':
      return (
        <div className="flex items-start gap-2 p-2 bg-hud-warning/5 border border-hud-warning/20">
          <Brain className="w-4 h-4 text-hud-warning shrink-0 mt-0.5" />
          <div className="text-sm text-hud-text/70 italic">{block.thinking}</div>
        </div>
      )

    case 'tool_use':
      return (
        <div className="p-2 bg-hud-info/5 border border-hud-info/20">
          <div className="flex items-center gap-2 mb-2">
            <Wrench className="w-4 h-4 text-hud-info" />
            <HUDLabel className="text-hud-info">{block.name}</HUDLabel>
          </div>
          <pre className="font-mono text-2xs text-hud-text/70 overflow-auto max-h-32">
            {JSON.stringify(block.input, null, 2)}
          </pre>
        </div>
      )

    case 'tool_result':
      return (
        <div
          className={cn(
            'p-2 border',
            block.is_error
              ? 'bg-hud-error/5 border-hud-error/20'
              : 'bg-hud-success/5 border-hud-success/20'
          )}
        >
          <div className="flex items-center gap-2 mb-2">
            {block.is_error ? (
              <AlertCircle className="w-4 h-4 text-hud-error" />
            ) : (
              <Wrench className="w-4 h-4 text-hud-success" />
            )}
            <HUDLabel className={block.is_error ? 'text-hud-error' : 'text-hud-success'}>
              Tool Result
            </HUDLabel>
          </div>
          <pre className="font-mono text-2xs text-hud-text/70 overflow-auto max-h-32">
            {typeof block.content === 'string' ? block.content : JSON.stringify(block.content, null, 2)}
          </pre>
        </div>
      )

    case 'image':
      return (
        <div className="flex items-center gap-2 p-2 bg-hud-gray/20 border border-hud-gray/30">
          <ImageIcon className="w-4 h-4 text-hud-text" />
          <span className="text-sm text-hud-text">{block.filename || 'Image attachment'}</span>
        </div>
      )

    default:
      return null
  }
}
