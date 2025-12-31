// API Types for Aperture Gateway

export type AgentType = 'claude_code' | 'codex' | 'gemini'

export type AuthMode = 'interactive' | 'api_key' | 'oauth' | 'vertex'

export type ApiKeyRef = 'inline' | 'stored' | 'none'

export type ProviderKey = 'anthropic' | 'openai' | 'google'

export interface SessionAuth {
  mode: AuthMode
  providerKey?: ProviderKey
  apiKeyRef?: ApiKeyRef
  apiKey?: string
  storedCredentialId?: string
  vertexProjectId?: string
  vertexLocation?: string
  vertexCredentialsPath?: string
}

export interface CreateSessionRequest {
  agent?: AgentType
  auth?: SessionAuth
  env?: Record<string, string>
}

export interface SessionStatus {
  id: string
  agent: AgentType
  authMode: string
  running: boolean
  pendingRequests: number
  lastActivityTime: number
  idleMs: number
  acpSessionId: string | null
}

export interface Session {
  id: string
  agent: AgentType
  status: SessionStatus
}

export interface Credential {
  id: string
  provider: ProviderKey
  label: string
  createdAt: number
}

export interface CreateCredentialRequest {
  provider: ProviderKey
  label: string
  apiKey: string
}

export interface HealthResponse {
  status: string
}

export interface ReadyResponse {
  status: string
  claudePath?: string
  errors?: string[]
}

export interface ListSessionsResponse {
  sessions: SessionStatus[]
  total: number
}

export interface ListCredentialsResponse {
  credentials: Credential[]
  total: number
}

export interface MessagesResponse {
  messages: Message[]
  total: number
  limit: number
  offset: number
}

// Message types for the chat
export interface ContentBlock {
  type: 'text' | 'tool_use' | 'tool_result'
  text?: string
  name?: string
  input?: unknown
  content?: string | ContentBlock[]
  toolCallId?: string
}

export interface Message {
  id: string
  sessionId?: string
  role: 'user' | 'assistant' | 'system'
  content: string | ContentBlock[]
  timestamp: string
  toolCalls?: ToolCall[]
}

export interface ToolCall {
  toolCallId: string
  name: string
  input: unknown
  title?: string
  rawInput?: unknown
}

// WebSocket message types
export interface UserMessage {
  type: 'user_message'
  content: string
  toolsAllowed?: boolean
  requireApprovals?: boolean
}

export interface PermissionResponse {
  type: 'permission_response'
  toolCallId: string
  optionId: string | null
}

export interface CancelMessage {
  type: 'cancel'
}

export type OutboundMessage = UserMessage | PermissionResponse | CancelMessage

// Inbound WebSocket messages
export interface JsonRpcMessage {
  jsonrpc: '2.0'
  method?: string
  params?: unknown
  result?: unknown
  error?: { code: number; message: string }
  id?: string | number | null
}

export interface SessionUpdateParams {
  update: {
    sessionUpdate: string
    content?: ContentBlock
    [key: string]: unknown
  }
}

export interface PermissionRequestParams {
  toolCallId: string
  toolCall: ToolCall
  options: PermissionOption[]
}

export interface PermissionOption {
  optionId: string
  name: string
  kind: string
}

// Connection state
export type ConnectionStatus =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'error'
  | 'ended'

export interface ConnectionState {
  status: ConnectionStatus
  error: string | null
  retryCount: number
  isStreaming: boolean
  hasUnread: boolean
  unreadCount: number
  lastActivity: number
  currentStreamMessageId?: string
}
