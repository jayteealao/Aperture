import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism'
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
import { SdkControlPanel, ThinkingBlock, ToolUseBlock, ToolCallGroup, LoadingIndicator } from '@/components/sdk'
import type { Message, ContentBlock, PermissionOption } from '@/api/types'
import {
  Send,
  StopCircle,
  Plus,
  Copy,
  Check,
  AlertCircle,
  Terminal,
  ChevronDown,
  ChevronRight,
  Wrench,
  CheckCircle2,
  ArrowDown,
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
    addUserMessageOnly,
  } = useSessionsStore()

  const { sdkPanelOpen, toggleSdkPanel } = useAppStore()

  const [input, setInput] = useState('')
  const [isSending, setIsSending] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const [isAtBottom, setIsAtBottom] = useState(true)

  // Save repo prompt state
  const [showSaveRepoPrompt, setShowSaveRepoPrompt] = useState(false)
  const [pendingSaveRepoPath, setPendingSaveRepoPath] = useState<string | null>(null)

  // Check for pending save repo prompt on mount
  useEffect(() => {
    const pending = sessionStorage.getItem('pendingSaveRepo')
    if (pending) {
      try {
        const { repoPath } = JSON.parse(pending)
        setPendingSaveRepoPath(repoPath)
        setShowSaveRepoPrompt(true)
        sessionStorage.removeItem('pendingSaveRepo')
      } catch {
        sessionStorage.removeItem('pendingSaveRepo')
      }
    }
  }, [])

  // Keyboard shortcut for SDK panel toggle (Cmd+. or Ctrl+.)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === '.') {
        e.preventDefault()
        toggleSdkPanel()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [toggleSdkPanel])

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

  // Track scroll position to determine if user is at bottom
  const handleScroll = useCallback(() => {
    const container = scrollContainerRef.current
    if (!container) return
    const threshold = 100 // pixels from bottom to consider "at bottom"
    const atBottom = container.scrollHeight - container.scrollTop - container.clientHeight < threshold
    setIsAtBottom(atBottom)
  }, [])

  // Smart auto-scroll: only scroll if user is already at bottom
  useEffect(() => {
    if (isAtBottom) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [sessionMessages, isAtBottom])

  // Scroll to bottom helper for FAB
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    setIsAtBottom(true)
  }, [])

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
    <div className="h-full flex">
      {/* Main content area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Save repo prompt */}
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
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto scrollbar-thin relative"
      >
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
          {/* Loading indicator when awaiting SDK response */}
          {connection?.isStreaming && !sessionMessages.some(m => m.id === connection.currentStreamMessageId) && (
            <div className="flex justify-start">
              <div className="glass rounded-2xl rounded-bl-md px-4 py-3">
                <LoadingIndicator />
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
        {/* Scroll to bottom FAB */}
        {!isAtBottom && (
          <button
            onClick={scrollToBottom}
            className="sticky bottom-4 left-1/2 -translate-x-1/2 p-3 bg-accent text-[#0a0a0f] rounded-full shadow-lg hover:bg-accent/90 transition-colors z-10"
            title="Scroll to bottom"
          >
            <ArrowDown className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Permission requests */}
      {activePermissions.length > 0 && (
        <div className="px-4 py-3 border-t border-[var(--color-border)] bg-warning/5">
          <PermissionRequest
            sessionId={activeSessionId!}
            permission={activePermissions[0]}
            onRespond={sendPermissionResponse}
            onAddUserMessage={addUserMessageOnly}
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
            <span>Press Enter to send | Cmd+. for controls</span>
          </div>
        </div>
      </div>
      </div>

      {/* Control Panel */}
      <SdkControlPanel
        sessionId={activeSessionId!}
        isOpen={sdkPanelOpen}
        onToggle={toggleSdkPanel}
      />
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
  const { textContent, thinkingBlocks, toolUseBlocks, toolResults } = extractContentBlocks(message.content)

  const handleCopy = () => {
    navigator.clipboard.writeText(textContent)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  // Check if we have any content blocks (for SDK native messages)
  const hasContentBlocks = thinkingBlocks.length > 0 || toolUseBlocks.length > 0 || toolResults.length > 0

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
              aria-label={copied ? 'Message copied' : 'Copy message'}
            >
              {copied ? <Check size={14} /> : <Copy size={14} />}
            </button>
          )}
        </div>

        {/* Thinking blocks - collapsed by default */}
        {thinkingBlocks.length > 0 && (
          <div className="mb-3 space-y-2">
            {thinkingBlocks.map((block, i) => (
              <ThinkingBlock
                key={i}
                thinking={block.thinking}
                signature={block.signature}
                isStreaming={isStreaming && i === thinkingBlocks.length - 1}
              />
            ))}
          </div>
        )}

        {/* Text content */}
        {textContent && (
          <div className="prose prose-sm max-w-none dark:prose-invert">
            <MarkdownContent content={textContent} />
            {isStreaming && !hasContentBlocks && (
              <span className="inline-block w-2 h-4 bg-current animate-pulse ml-0.5" />
            )}
          </div>
        )}

        {/* Tool use blocks with their results */}
        {toolUseBlocks.length > 0 && (
          <div className="mt-3 space-y-2">
            {toolUseBlocks.length >= 2 ? (
              <ToolCallGroup
                toolCalls={toolUseBlocks.map((block) => {
                  const result = toolResults.find(r => r.tool_use_id === block.id)
                  return {
                    id: block.id,
                    name: block.name,
                    input: block.input,
                    result: result ? { content: result.content, is_error: result.is_error } : undefined,
                    isExecuting: isStreaming && !result,
                  }
                })}
              />
            ) : (
              toolUseBlocks.map((block) => {
                const result = toolResults.find(r => r.tool_use_id === block.id)
                return (
                  <ToolUseBlock
                    key={block.id}
                    id={block.id}
                    name={block.name}
                    input={block.input}
                    result={result ? { content: result.content, is_error: result.is_error } : undefined}
                    isExecuting={isStreaming && !result}
                  />
                )
              })
            )}
          </div>
        )}

        {/* Orphan tool results (without matching tool_use) - legacy fallback */}
        {toolResults.filter(r => !toolUseBlocks.find(t => t.id === r.tool_use_id)).map((result, i) => (
          <div key={i} className="mt-3">
            <ToolBlock block={{ type: 'tool_result', content: result.content }} />
          </div>
        ))}

        <div className="mt-2 text-2xs opacity-50">
          {new Date(message.timestamp).toLocaleTimeString()}
        </div>
      </div>
    </div>
  )
}

function MarkdownContent({ content }: { content: string }) {
  return (
    <div className="whitespace-pre-wrap break-words">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
        code({ className, children, ...props }) {
          const match = /language-(\w+)/.exec(className || '')
          const isInline = !match && !className

          if (isInline) {
            return (
              <code className="px-1.5 py-0.5 rounded bg-[var(--color-surface)] text-sm font-mono" {...props}>
                {children}
              </code>
            )
          }

          return (
            <SyntaxHighlighter
              style={oneDark}
              language={match?.[1] || 'text'}
              PreTag="div"
              className="!my-2 !rounded-lg !text-xs"
              customStyle={{
                margin: 0,
                borderRadius: '0.5rem',
              }}
            >
              {String(children).replace(/\n$/, '')}
            </SyntaxHighlighter>
          )
        },
        pre({ children }) {
          return <>{children}</>
        },
        p({ children }) {
          return <p className="mb-2 last:mb-0">{children}</p>
        },
        ul({ children }) {
          return <ul className="list-disc list-inside mb-2">{children}</ul>
        },
        ol({ children }) {
          return <ol className="list-decimal list-inside mb-2">{children}</ol>
        },
        a({ href, children }) {
          return (
            <a href={href} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">
              {children}
            </a>
          )
        },
      }}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}

function ToolBlock({ block }: { block: { type: 'tool_use' | 'tool_result'; name?: string; input?: unknown; content?: string | ContentBlock[] } }) {
  const [isExpanded, setIsExpanded] = useState(false)
  const isToolUse = block.type === 'tool_use'

  return (
    <div className={cn(
      'rounded-lg border text-xs overflow-hidden',
      isToolUse
        ? 'border-[var(--color-border)] bg-[var(--color-surface)]'
        : 'border-success/30 bg-success/5'
    )}>
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center gap-2 px-3 py-2 hover:bg-[var(--color-surface-hover)] transition-colors"
      >
        {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        {isToolUse ? (
          <Wrench size={14} className="text-[var(--color-text-muted)]" />
        ) : (
          <CheckCircle2 size={14} className="text-success" />
        )}
        <span className="font-medium">
          {isToolUse ? `Tool: ${block.name}` : 'Tool Result'}
        </span>
      </button>
      {isExpanded && (
        <div className="px-3 py-2 border-t border-[var(--color-border)] bg-[var(--color-bg-tertiary)]">
          {isToolUse && block.input !== undefined && (
            <pre className="overflow-x-auto text-[10px] leading-relaxed">
              {typeof block.input === 'string' ? block.input : JSON.stringify(block.input, null, 2)}
            </pre>
          )}
          {!isToolUse && block.content !== undefined && (
            <div className="overflow-x-auto">
              <pre className="text-[10px] leading-relaxed whitespace-pre-wrap">
                {typeof block.content === 'string' ? block.content : JSON.stringify(block.content, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function PermissionRequest({
  sessionId,
  permission,
  onRespond,
  onAddUserMessage,
}: {
  sessionId: string
  permission: { toolCallId: string; toolCall: unknown; options: unknown[] }
  onRespond: (sessionId: string, toolCallId: string, optionId: string | null, answers?: Record<string, string>) => void
  onAddUserMessage: (sessionId: string, content: string) => Promise<void>
}) {
  const toolCall = permission.toolCall as { name?: string; title?: string; rawInput?: unknown }
  const options = permission.options as PermissionOption[]

  // Check if this is an AskUserQuestion tool - check both name and title
  const toolName = toolCall?.name || toolCall?.title
  const isAskUserQuestion = toolName === 'AskUserQuestion' && isAskUserQuestionInput(toolCall.rawInput)

  // Find the "allow" option to use when submitting answers
  const allowOption = options.find(opt => opt.kind?.includes('allow'))

  const handleAskUserQuestionSubmit = async (answers: Record<string, string>) => {
    console.log('[AskUserQuestion] Submitting answers:', answers)
    // Submit with the allow option and include the answers
    if (allowOption) {
      // 1. Add answer message FIRST (before agent can start responding)
      const answerText = Object.entries(answers)
        .map(([header, value]) => `${header}: ${value}`)
        .join('\n')
      await onAddUserMessage(sessionId, `My answers:\n${answerText}`)

      // 2. THEN send permission response
      onRespond(sessionId, permission.toolCallId, allowOption.optionId, answers)
    }
  }

  return (
    <Card variant="glass" padding="md" className={cn(
      "border-l-4",
      isAskUserQuestion ? "border-l-accent" : "border-l-warning"
    )}>
      <div className="flex items-start gap-3">
        <AlertCircle size={20} className={cn(
          "shrink-0 mt-0.5",
          isAskUserQuestion ? "text-accent" : "text-warning"
        )} />
        <div className="flex-1 min-w-0">
          <h4 className="font-medium text-[var(--color-text-primary)]">
            {isAskUserQuestion ? 'Question from Agent' : 'Permission Required'}
          </h4>
          {!isAskUserQuestion && (
            <p className="text-sm text-[var(--color-text-secondary)] mt-1">
              {toolCall?.title || 'The agent wants to perform an action'}
            </p>
          )}

          {/* Render AskUserQuestion specially, otherwise use ToolCallDisplay */}
          {isAskUserQuestion ? (
            <AskUserQuestionDisplay
              input={toolCall.rawInput as { questions: Array<{ question: string; header: string; options: Array<{ label: string; description: string }>; multiSelect: boolean }> }}
              onSubmit={handleAskUserQuestionSubmit}
            />
          ) : toolCall?.rawInput ? (
            <>
              <ToolCallDisplay
                name={toolCall.name}
                rawInput={toolCall.rawInput as Record<string, unknown>}
              />
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
            </>
          ) : (
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
          )}
        </div>
      </div>
    </Card>
  )
}

// Helper to extract content blocks by type
interface ThinkingBlockData {
  type: 'thinking'
  thinking: string
  signature?: string
}

interface ToolUseBlockData {
  type: 'tool_use'
  id: string
  name: string
  input: unknown
}

interface ToolResultBlockData {
  type: 'tool_result'
  tool_use_id: string
  content: string
  is_error?: boolean
}

interface ExtractedContent {
  textContent: string
  thinkingBlocks: ThinkingBlockData[]
  toolUseBlocks: ToolUseBlockData[]
  toolResults: ToolResultBlockData[]
}

function extractContentBlocks(content: string | ContentBlock[]): ExtractedContent {
  if (typeof content === 'string') {
    return { textContent: content, thinkingBlocks: [], toolUseBlocks: [], toolResults: [] }
  }
  if (!Array.isArray(content)) {
    return { textContent: String(content), thinkingBlocks: [], toolUseBlocks: [], toolResults: [] }
  }

  // Debug: log raw content blocks
  console.log('[extractContentBlocks] Raw content blocks:', content)

  const textParts: string[] = []
  const thinkingBlocks: ThinkingBlockData[] = []
  const toolUseBlocks: ToolUseBlockData[] = []
  const toolResults: ToolResultBlockData[] = []

  for (const block of content) {
    if (block.type === 'text' && block.text) {
      textParts.push(block.text)
    } else if (block.type === 'thinking') {
      console.log('[extractContentBlocks] Found thinking block:', block)
      thinkingBlocks.push({
        type: 'thinking',
        thinking: block.thinking || '',
        signature: block.signature,
      })
    } else if (block.type === 'tool_use') {
      toolUseBlocks.push({
        type: 'tool_use',
        id: block.id || block.toolCallId || `tool-${Date.now()}`,
        name: block.name || 'unknown',
        input: block.input,
      })
    } else if (block.type === 'tool_result') {
      toolResults.push({
        type: 'tool_result',
        tool_use_id: block.tool_use_id || block.toolCallId || '',
        content: typeof block.content === 'string' ? block.content : JSON.stringify(block.content),
        is_error: block.is_error,
      })
    }
  }

  console.log('[extractContentBlocks] Extracted thinking blocks:', thinkingBlocks.length)

  return {
    textContent: textParts.join('\n'),
    thinkingBlocks,
    toolUseBlocks,
    toolResults,
  }
}
