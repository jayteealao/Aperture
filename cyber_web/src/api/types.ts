// API Types for Aperture Gateway

import type { PiSessionConfig } from './pi-types'

export type AgentType = 'claude_sdk' | 'pi_sdk'

// =============================================================================
// Image Attachment Types (mirrors backend types.ts)
// =============================================================================

export type ImageMimeType = 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp'

export interface ImageAttachment {
  /** Base64-encoded image data (no data URI prefix) */
  data: string
  /** MIME type of the image */
  mimeType: ImageMimeType
  /** Optional filename for display */
  filename?: string
}

export const IMAGE_LIMITS = {
  MAX_COUNT: 5,
  MAX_BYTES: 10 * 1024 * 1024, // 10 MB
  ALLOWED_MIME_TYPES: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'] as const,
} as const

export type AuthMode = 'api_key' | 'oauth'

export type ApiKeyRef = 'inline' | 'stored' | 'none'

export type ProviderKey = 'anthropic' | 'openai' | 'google' | 'groq' | 'openrouter'

export interface SessionAuth {
  mode: AuthMode
  providerKey?: ProviderKey
  apiKeyRef?: ApiKeyRef
  apiKey?: string
  storedCredentialId?: string
}

export interface CreateSessionRequest {
  agent?: AgentType
  auth?: SessionAuth
  env?: Record<string, string>
  workspaceId?: string
  repoPath?: string
  sdk?: SdkSessionConfig
  pi?: PiSessionConfig
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
  sdkSessionId: string | null
  piSessionPath?: string | null
  isResumable?: boolean
  workingDirectory?: string
  thinkingLevel?: string
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

// Resumable session info
export interface ResumableSession {
  id: string
  agent: string
  sdkSessionId?: string
  piSessionPath?: string
  lastActivity: number
  workingDirectory: string | null
}

export interface ListResumableSessionsResponse {
  sessions: ResumableSession[]
  total: number
}

export interface ConnectSessionResponse {
  id: string
  agent: AgentType
  status: SessionStatus
  restored: boolean
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
  type: 'text' | 'tool_use' | 'tool_result' | 'thinking' | 'image'
  text?: string
  thinking?: string
  signature?: string
  id?: string
  name?: string
  input?: unknown
  content?: string | ContentBlock[]
  toolCallId?: string
  tool_use_id?: string
  is_error?: boolean
  // Image fields (for type: 'image')
  mimeType?: string
  data?: string
  filename?: string
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
  images?: ImageAttachment[]
  toolsAllowed?: boolean
  requireApprovals?: boolean
}

export interface PermissionResponse {
  type: 'permission_response'
  toolCallId: string
  optionId: string | null
  answers?: Record<string, string>  // For AskUserQuestion tool
}

export interface CancelMessage {
  type: 'cancel'
}

// --- Pi SDK outbound messages ---

export interface PiSteerMessage {
  type: 'pi_steer'
  content: string
}

export interface PiFollowUpMessage {
  type: 'pi_follow_up'
  content: string
}

export interface PiCompactMessage {
  type: 'pi_compact'
  instructions?: string
}

export interface PiForkMessage {
  type: 'pi_fork'
  entryId: string
}

export interface PiNavigateMessage {
  type: 'pi_navigate'
  entryId: string
}

export interface PiSetModelMessage {
  type: 'pi_set_model'
  provider: string
  modelId: string
}

export interface PiCycleModelMessage {
  type: 'pi_cycle_model'
}

export interface PiSetThinkingLevelMessage {
  type: 'pi_set_thinking_level'
  level: string
}

export interface PiCycleThinkingMessage {
  type: 'pi_cycle_thinking'
}

export interface PiNewSessionMessage {
  type: 'pi_new_session'
}

export interface PiGetTreeMessage {
  type: 'pi_get_tree'
}

export interface PiGetForkableMessage {
  type: 'pi_get_forkable'
}

export interface PiGetStatsMessage {
  type: 'pi_get_stats'
}

export interface PiGetModelsMessage {
  type: 'pi_get_models'
}

export type PiOutboundMessage =
  | PiSteerMessage
  | PiFollowUpMessage
  | PiCompactMessage
  | PiForkMessage
  | PiNavigateMessage
  | PiSetModelMessage
  | PiCycleModelMessage
  | PiSetThinkingLevelMessage
  | PiCycleThinkingMessage
  | PiNewSessionMessage
  | PiGetTreeMessage
  | PiGetForkableMessage
  | PiGetStatsMessage
  | PiGetModelsMessage

// Unified outbound message type for all SDKs
export type OutboundMessage =
  | UserMessage
  | PermissionResponse
  | CancelMessage
  | InterruptMessage
  | SetPermissionModeMessage
  | SetModelMessage
  | SetThinkingTokensMessage
  | RewindFilesMessage
  | GetMcpStatusMessage
  | SetMcpServersMessage
  | GetAccountInfoMessage
  | GetSupportedModelsMessage
  | GetSupportedCommandsMessage
  | UpdateConfigMessage
  | PiOutboundMessage

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

// Workspace types
export interface WorkspaceRecord {
  id: string
  name: string
  repoRoot: string
  description: string | null
  createdAt: string
  updatedAt: string
  metadata: string | null
}

export interface WorkspaceAgentRecord {
  id: string
  workspaceId: string
  sessionId: string | null
  branch: string
  worktreePath: string
  createdAt: string
  updatedAt: string
}

export interface WorktreeInfo {
  branch: string
  path: string
  isMain: boolean
  isLocked: boolean
}

export interface CreateWorkspaceRequest {
  name?: string
  repoRoot?: string
  description?: string
}

export interface ListWorkspacesResponse {
  workspaces: WorkspaceRecord[]
  total: number
}

export interface ListWorkspaceAgentsResponse {
  agents: WorkspaceAgentRecord[]
  total: number
}

export interface ListWorktreesResponse {
  worktrees: WorktreeInfo[]
  total: number
}

// Discovery types
export interface DiscoveredRepo {
  path: string
  name: string
  remoteUrl?: string
  hasOrigin: boolean
}

export interface DiscoveryResult {
  repos: DiscoveredRepo[]
  scannedDirectories: number
  errors: Array<{ path: string; error: string }>
}

export interface CloneWorkspaceRequest {
  remoteUrl: string
  targetDirectory: string
  name?: string
}

export interface CloneWorkspaceResponse {
  workspace: WorkspaceRecord
}

export interface InitRepoRequest {
  path: string
  name?: string
  createWorkspace?: boolean
}

export interface InitRepoResponse {
  path: string
  workspace: WorkspaceRecord | null
}

// =============================================================================
// SDK Content Block Types (First-Class Support)
// =============================================================================

export interface TextContentBlock {
  type: 'text'
  text: string
}

export interface ThinkingContentBlock {
  type: 'thinking'
  thinking: string
  signature?: string
}

export interface ToolUseContentBlock {
  type: 'tool_use'
  id: string
  name: string
  input: unknown
}

export interface ToolResultContentBlock {
  type: 'tool_result'
  tool_use_id: string
  content: string
  is_error?: boolean
}

export type SdkContentBlock =
  | TextContentBlock
  | ThinkingContentBlock
  | ToolUseContentBlock
  | ToolResultContentBlock

export interface SdkMessage {
  id: string
  sessionId: string
  role: 'user' | 'assistant' | 'system'
  content: SdkContentBlock[]
  timestamp: string
  messageId?: string
  stopReason?: string
  usage?: { input_tokens: number; output_tokens: number }
}

export interface SdkWsMessage {
  kind: 'sdk'
  sessionId: string
  type: string
  payload: unknown
}

export function isSdkWsMessage(msg: unknown): msg is SdkWsMessage {
  return typeof msg === 'object' && msg !== null &&
         (msg as Record<string, unknown>).kind === 'sdk'
}

// =============================================================================
// Claude SDK Types
// =============================================================================

export type PermissionMode =
  | 'default'
  | 'acceptEdits'
  | 'bypassPermissions'
  | 'plan'
  | 'delegate'
  | 'dontAsk'

export type HookEvent =
  | 'PreToolUse'
  | 'PostToolUse'
  | 'PostToolUseFailure'
  | 'Notification'
  | 'UserPromptSubmit'
  | 'SessionStart'
  | 'SessionEnd'
  | 'Stop'
  | 'SubagentStart'
  | 'SubagentStop'
  | 'PreCompact'
  | 'PermissionRequest'
  | 'Setup'

// MCP Server Configuration
export interface McpStdioServer {
  type?: 'stdio'
  command: string
  args?: string[]
  env?: Record<string, string>
}

export interface McpSseServer {
  type: 'sse'
  url: string
  headers?: Record<string, string>
}

export interface McpHttpServer {
  type: 'http'
  url: string
  headers?: Record<string, string>
}

export type McpServerConfig = McpStdioServer | McpSseServer | McpHttpServer

export interface McpServerStatus {
  name: string
  status: 'connected' | 'failed' | 'needs-auth' | 'pending'
  serverInfo?: { name: string; version: string }
  error?: string
}

export interface McpSetServersResult {
  added: string[]
  removed: string[]
  errors: Record<string, string>
}

// Agent Definition
export type AgentModel = 'sonnet' | 'opus' | 'haiku' | 'inherit'

export interface AgentDefinition {
  description: string
  prompt: string
  model?: AgentModel
  tools?: string[]
  disallowedTools?: string[]
  maxTurns?: number
  skills?: string[]
  mcpServers?: string[]
}

// Sandbox Configuration
export interface SandboxNetworkConfig {
  allowedDomains?: string[]
  allowUnixSockets?: string[]
  allowAllUnixSockets?: boolean
  allowLocalBinding?: boolean
  httpProxyPort?: number
  socksProxyPort?: number
}

export interface SandboxConfig {
  enabled?: boolean
  autoAllowBashIfSandboxed?: boolean
  allowUnsandboxedCommands?: boolean
  network?: SandboxNetworkConfig
  ignoreViolations?: Record<string, string[]>
  excludedCommands?: string[]
}

// Plugin Configuration
export interface PluginConfig {
  type: 'local'
  path: string
}

// Output Format
export interface OutputFormat {
  type: 'json_schema'
  schema: Record<string, unknown>
}

// Hook Configuration
export interface HookCallbackMatcher {
  matcher?: string
  timeout?: number
}

// System Prompt
export interface SystemPromptPreset {
  type: 'preset'
  preset: 'claude_code'
  append?: string
}

export type SystemPromptConfig = string | SystemPromptPreset

// SDK Session Configuration
export interface SdkSessionConfig {
  // Session resumption
  resume?: string
  resumeSessionAt?: string
  forkSession?: boolean
  continue?: boolean
  persistSession?: boolean

  // File checkpointing
  enableFileCheckpointing?: boolean

  // Permission control
  permissionMode?: PermissionMode
  allowedTools?: string[]
  disallowedTools?: string[]
  allowDangerouslySkipPermissions?: boolean

  // Budget and limits
  maxBudgetUsd?: number
  maxTurns?: number
  maxThinkingTokens?: number

  // Model selection
  model?: string
  fallbackModel?: string
  betas?: string[]

  // MCP servers
  mcpServers?: Record<string, McpServerConfig>

  // Agents
  agent?: string
  agents?: Record<string, AgentDefinition>

  // Hooks
  hookMatchers?: Partial<Record<HookEvent, HookCallbackMatcher[]>>

  // Sandbox
  sandbox?: SandboxConfig

  // Plugins
  plugins?: PluginConfig[]

  // Output
  outputFormat?: OutputFormat

  // System prompt
  systemPrompt?: SystemPromptConfig

  // Advanced
  additionalDirectories?: string[]
  settingSources?: ('user' | 'project' | 'local')[]
}

// Usage Tracking
export interface ModelUsage {
  inputTokens: number
  outputTokens: number
  cacheReadInputTokens: number
  cacheCreationInputTokens: number
  webSearchRequests: number
  costUSD: number
  contextWindow?: number
  maxOutputTokens?: number
}

// Permission Denial
export interface PermissionDenial {
  toolName: string
  toolInput: Record<string, unknown>
  message: string
}

export type ResultSubtype =
  | 'success'
  | 'error_during_execution'
  | 'error_max_turns'
  | 'error_max_budget_usd'
  | 'error_max_structured_output_retries'

// Session Result
export interface SessionResult {
  success: boolean
  result?: string
  errors?: string[]
  subtype: ResultSubtype
  numTurns: number
  durationMs: number
  durationApiMs: number
  totalCostUsd: number
  usage: Record<string, ModelUsage>
  structuredOutput?: unknown
  permissionDenials: PermissionDenial[]
}

// Account Info
export interface AccountInfo {
  email?: string
  organization?: string
  subscriptionType?: string
  tokenSource?: string
  apiKeySource?: string
}

// Slash Command / Skill
export interface SlashCommand {
  name: string
  description: string
  argumentHint: string
}

// Model Info
export interface ModelInfo {
  value: string
  displayName: string
  description: string
}

// File Rewind Result
export interface RewindFilesResult {
  canRewind: boolean
  error?: string
  filesChanged?: string[]
  insertions?: number
  deletions?: number
}

// Permission Update Types
export type PermissionBehavior = 'allow' | 'deny' | 'ask'

export type PermissionUpdateType =
  | 'addRules'
  | 'replaceRules'
  | 'removeRules'
  | 'setMode'
  | 'addDirectories'
  | 'removeDirectories'

export type PermissionDestination =
  | 'userSettings'
  | 'projectSettings'
  | 'localSettings'
  | 'session'
  | 'cliArg'

export interface PermissionUpdate {
  type: PermissionUpdateType
  destination: PermissionDestination
  behavior: PermissionBehavior
  toolName?: string
  pattern?: string
  paths?: string[]
}

export interface PermissionContext {
  blockedPath?: string
  decisionReason?: string
  agentID?: string
  suggestions?: PermissionUpdate[]
}

// Extended Permission Option with suggestion
export interface ExtendedPermissionOption extends PermissionOption {
  suggestion?: PermissionUpdate
}

// Extended Permission Request with context
export interface ExtendedPermissionRequestParams extends PermissionRequestParams {
  context?: PermissionContext
}

// SDK Session Status (extends base SessionStatus)
export interface SdkSessionStatus extends SessionStatus {
  config: SdkSessionConfig
  lastResult: SessionResult | null
}

// =============================================================================
// SDK WebSocket Message Types
// =============================================================================

export interface InterruptMessage {
  type: 'interrupt'
}

export interface SetPermissionModeMessage {
  type: 'set_permission_mode'
  mode: PermissionMode
}

export interface SetModelMessage {
  type: 'set_model'
  model?: string
}

export interface SetThinkingTokensMessage {
  type: 'set_thinking_tokens'
  tokens: number | null
}

export interface RewindFilesMessage {
  type: 'rewind_files'
  messageId: string
  dryRun?: boolean
}

export interface GetMcpStatusMessage {
  type: 'get_mcp_status'
}

export interface SetMcpServersMessage {
  type: 'set_mcp_servers'
  servers: Record<string, McpServerConfig>
}

export interface GetAccountInfoMessage {
  type: 'get_account_info'
}

export interface GetSupportedModelsMessage {
  type: 'get_supported_models'
}

export interface GetSupportedCommandsMessage {
  type: 'get_supported_commands'
}

export interface UpdateConfigMessage {
  type: 'update_config'
  config: Partial<SdkSessionConfig>
}

// SdkOutboundMessage and ExtendedOutboundMessage are now part of OutboundMessage
export type SdkOutboundMessage = OutboundMessage
export type ExtendedOutboundMessage = OutboundMessage
