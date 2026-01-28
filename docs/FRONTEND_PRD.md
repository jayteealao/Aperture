# Aperture Frontend - Product Requirements Document

> A design-agnostic specification for building a frontend interface to the Aperture AI agent gateway.

## Table of Contents

1. [Overview](#1-overview)
2. [Architecture](#2-architecture)
3. [Authentication & Authorization](#3-authentication--authorization)
4. [Session Management](#4-session-management)
5. [Real-Time Communication](#5-real-time-communication)
6. [Claude SDK Features](#6-claude-sdk-features)
7. [Pi SDK Features](#7-pi-sdk-features)
8. [Workspace & Repository Management](#8-workspace--repository-management)
9. [Credential Management](#9-credential-management)
10. [Message & Content Types](#10-message--content-types)
11. [Permission System](#11-permission-system)
12. [State Management](#12-state-management)
13. [Error Handling](#13-error-handling)
14. [Persistence](#14-persistence)

---

## 1. Overview

Aperture is a gateway for AI coding agents that supports two distinct agent types:
- **Claude SDK** (`claude_sdk`): Anthropic's Claude with extended thinking, tool use, MCP servers, and fine-grained permission control
- **Pi SDK** (`pi_sdk`): A coding-focused agent with model cycling, thinking levels, session branching/forking, and streaming control

The frontend must provide:
- Session lifecycle management (create, connect, resume, delete)
- Real-time bidirectional communication with agents
- Message display with streaming support
- Tool execution visualization
- Permission request handling
- Agent-specific control panels
- Workspace and repository management
- Credential storage

---

## 2. Architecture

### 2.1 Communication Protocols

| Protocol | Endpoint | Purpose |
|----------|----------|---------|
| REST | `/v1/*` | CRUD operations, configuration, one-off queries |
| WebSocket | `/v1/sessions/:id/ws` | Bidirectional real-time messaging |
| SSE | `/v1/sessions/:id/events` | Unidirectional event stream (alternative to WS) |

### 2.2 Base URL

The gateway runs on a configurable host/port. Default: `http://localhost:8080`

### 2.3 Message Format

All WebSocket messages use JSON-RPC 2.0 format:

```typescript
interface JsonRpcMessage {
  jsonrpc: '2.0'
  method?: string        // For notifications/requests from server
  params?: unknown       // Method parameters
  result?: unknown       // For responses
  error?: {
    code: number
    message: string
  }
  id?: string | number | null
}
```

---

## 3. Authentication & Authorization

### 3.1 Session Authentication

When creating a session, authentication can be provided via:

```typescript
interface SessionAuth {
  mode: 'api_key' | 'oauth'
  providerKey?: 'anthropic' | 'openai' | 'google' | 'groq' | 'openrouter'
  apiKeyRef?: 'inline' | 'stored' | 'none'
  apiKey?: string                    // If apiKeyRef is 'inline'
  storedCredentialId?: string        // If apiKeyRef is 'stored'
}
```

### 3.2 Provider Support

| Provider | Claude SDK | Pi SDK |
|----------|------------|--------|
| Anthropic | ✅ | ✅ |
| OpenAI | ❌ | ✅ |
| Google | ❌ | ✅ |
| Groq | ❌ | ✅ |
| OpenRouter | ❌ | ✅ |

---

## 4. Session Management

### 4.1 Session Lifecycle

```
┌─────────────┐     ┌──────────────┐     ┌─────────────┐
│   Create    │────▶│   Connect    │────▶│   Active    │
│   Session   │     │  (WebSocket) │     │  (Running)  │
└─────────────┘     └──────────────┘     └─────────────┘
                                                │
                    ┌──────────────┐            │
                    │   Resumable  │◀───────────┤
                    │   (Stored)   │            │
                    └──────────────┘            ▼
                                         ┌─────────────┐
                                         │   Deleted   │
                                         │   (Ended)   │
                                         └─────────────┘
```

### 4.2 REST Endpoints

#### Create Session
```
POST /v1/sessions
```
**Request:**
```typescript
{
  agent?: 'claude_sdk' | 'pi_sdk'  // Default: 'claude_sdk'
  auth?: SessionAuth
  env?: Record<string, string>     // Environment variables
  workspaceId?: string             // For workspace isolation
  repoPath?: string                // Direct repo path (no isolation)
  sdk?: SdkSessionConfig           // Claude SDK config
  pi?: PiSessionConfig             // Pi SDK config
}
```
**Response (201):**
```typescript
{
  id: string
  agent: 'claude_sdk' | 'pi_sdk'
  status: SessionStatus
}
```

#### List Sessions
```
GET /v1/sessions
```
**Response:**
```typescript
{
  sessions: SessionStatus[]
  total: number
}
```

#### Get Session
```
GET /v1/sessions/:id
```
**Response:** `SessionStatus`

#### Delete Session
```
DELETE /v1/sessions/:id
```
**Response:** 204 No Content

#### Get Resumable Sessions
```
GET /v1/sessions/resumable
```
**Response:**
```typescript
{
  sessions: ResumableSession[]
  total: number
}
```

#### Connect to Session (Resume)
```
POST /v1/sessions/:id/connect
```
**Response:**
```typescript
{
  id: string
  agent: 'claude_sdk' | 'pi_sdk'
  status: SessionStatus
  restored: boolean  // true if session was restored from storage
}
```

#### Get Session History (from database)
```
GET /v1/sessions/history?status=active&userId=xxx
```

#### Get Messages
```
GET /v1/sessions/:id/messages?limit=1000&offset=0
```
**Response:**
```typescript
{
  messages: Message[]
  total: number
  limit: number
  offset: number
}
```

### 4.3 Session Status

```typescript
interface SessionStatus {
  id: string
  agent: 'claude_sdk' | 'pi_sdk'
  authMode: string
  running: boolean
  pendingRequests: number
  lastActivityTime: number
  idleMs: number

  // Claude SDK specific
  acpSessionId: string | null
  sdkSessionId: string | null

  // Pi SDK specific
  piSessionPath?: string | null
  isResumable?: boolean
  thinkingLevel?: string

  workingDirectory?: string
}
```

### 4.4 Connection State

The frontend should track:

```typescript
interface ConnectionState {
  status: 'disconnected' | 'connecting' | 'connected' | 'reconnecting' | 'error' | 'ended'
  error: string | null
  retryCount: number
  isStreaming: boolean
  hasUnread: boolean
  unreadCount: number
  lastActivity: number
  currentStreamMessageId?: string
}
```

---

## 5. Real-Time Communication

### 5.1 WebSocket Connection

```
GET /v1/sessions/:id/ws (WebSocket upgrade)
```

### 5.2 Outbound Messages (Frontend → Backend)

#### Send User Message
```typescript
{
  type: 'user_message'
  content: string
  images?: ImageAttachment[]  // Up to 5 images, max 10MB total
  toolsAllowed?: boolean
  requireApprovals?: boolean
}
```

#### Respond to Permission Request
```typescript
{
  type: 'permission_response'
  toolCallId: string
  optionId: string | null  // null to cancel/deny
  answers?: Record<string, string>  // For AskUserQuestion tool
}
```

#### Cancel/Interrupt
```typescript
{ type: 'cancel' }
{ type: 'interrupt' }
```

### 5.3 Inbound Messages (Backend → Frontend)

#### Session Update
```typescript
{
  jsonrpc: '2.0',
  method: 'session/update',
  params: {
    update: {
      sessionUpdate: string  // 'agent_message_chunk' | 'prompt_complete' | 'prompt_error' | etc.
      content?: ContentBlock
      // Additional fields vary by update type
    }
  }
}
```

#### Permission Request
```typescript
{
  jsonrpc: '2.0',
  method: 'session/request_permission',
  params: {
    toolCallId: string
    toolCall: ToolCall
    options: PermissionOption[]
  }
}
```

#### Session Exit
```typescript
{
  jsonrpc: '2.0',
  method: 'session/exit',
  params: { code: number | null, signal: string | null }
}
```

#### Error
```typescript
{
  jsonrpc: '2.0',
  error: { code: number, message: string },
  id: null
}
```

### 5.4 Image Attachments

```typescript
interface ImageAttachment {
  data: string              // Base64-encoded (no data URI prefix)
  mimeType: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp'
  filename?: string
}

const IMAGE_LIMITS = {
  MAX_COUNT: 5,
  MAX_BYTES: 10 * 1024 * 1024  // 10 MB total
}
```

---

## 6. Claude SDK Features

### 6.1 Configuration

```typescript
interface SdkSessionConfig {
  // Session resumption
  resume?: string                    // SDK session ID to resume
  resumeSessionAt?: string           // Message ID checkpoint
  forkSession?: boolean              // Create branch from checkpoint
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
  systemPrompt?: string | SystemPromptPreset

  // Advanced
  additionalDirectories?: string[]
  settingSources?: ('user' | 'project' | 'local')[]
}
```

### 6.2 Permission Modes

```typescript
type PermissionMode =
  | 'default'           // Ask for all permissions
  | 'acceptEdits'       // Auto-approve file edits
  | 'bypassPermissions' // Skip all permission checks
  | 'plan'              // Planning mode (read-only)
  | 'delegate'          // Delegate to subagents
  | 'dontAsk'           // Deny all permissions
```

### 6.3 REST Endpoints (Claude SDK Only)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/v1/sessions/:id/config` | GET | Get session config |
| `/v1/sessions/:id/config` | PATCH | Update config |
| `/v1/sessions/:id/resume` | POST | Resume from checkpoint |
| `/v1/sessions/:id/checkpoints` | GET | List checkpoint message IDs |
| `/v1/sessions/:id/rewind` | POST | Revert file changes |
| `/v1/sessions/:id/mcp/status` | GET | MCP server status |
| `/v1/sessions/:id/mcp/servers` | POST | Configure MCP servers |
| `/v1/sessions/:id/account` | GET | Account info |
| `/v1/sessions/:id/models` | GET | Available models |
| `/v1/sessions/:id/commands` | GET | Slash commands |
| `/v1/sessions/:id/permission-mode` | POST | Set permission mode |
| `/v1/sessions/:id/model` | POST | Change model |
| `/v1/sessions/:id/thinking-tokens` | POST | Set thinking budget |
| `/v1/sessions/:id/result` | GET | Session result/usage |
| `/v1/sessions/:id/permission-denials` | GET | Denied tools |
| `/v1/sessions/:id/interrupt` | POST | Interrupt execution |

### 6.4 WebSocket Commands (Claude SDK)

```typescript
// Set permission mode
{ type: 'set_permission_mode', mode: PermissionMode }

// Set model
{ type: 'set_model', model?: string }

// Set thinking token budget
{ type: 'set_thinking_tokens', tokens: number | null }

// Rewind files to checkpoint
{ type: 'rewind_files', messageId: string, dryRun?: boolean }

// MCP server operations
{ type: 'get_mcp_status' }
{ type: 'set_mcp_servers', servers: Record<string, McpServerConfig> }

// Account info
{ type: 'get_account_info' }

// Model/command discovery
{ type: 'get_supported_models' }
{ type: 'get_supported_commands' }

// Config update
{ type: 'update_config', config: Partial<SdkSessionConfig> }
```

### 6.5 WebSocket Responses (Claude SDK)

```typescript
// First-class SDK streaming messages
{
  kind: 'sdk',
  sessionId: string,
  type: 'content_block_start' | 'assistant_delta' | 'content_block_stop' |
        'assistant_message' | 'prompt_complete' | 'prompt_error' | 'permission_request',
  payload: unknown
}

// JSON-RPC responses
{ method: 'session/rewind_result', params: RewindFilesResult }
{ method: 'session/mcp_status', params: { servers: McpServerStatus[] } }
{ method: 'session/mcp_servers_updated', params: McpSetServersResult }
{ method: 'session/account_info', params: AccountInfo }
{ method: 'session/supported_models', params: { models: ModelInfo[] } }
{ method: 'session/supported_commands', params: { commands: SlashCommand[] } }
{ method: 'session/config_updated', params: { config: SdkSessionConfig } }
{ method: 'session/checkpoints', params: { checkpoints: string[] } }
{ method: 'session/usage_update', params: SessionResult }
```

### 6.6 MCP Server Configuration

```typescript
type McpServerConfig =
  | { type?: 'stdio', command: string, args?: string[], env?: Record<string, string> }
  | { type: 'sse', url: string, headers?: Record<string, string> }
  | { type: 'http', url: string, headers?: Record<string, string> }

interface McpServerStatus {
  name: string
  status: 'connected' | 'failed' | 'needs-auth' | 'pending'
  serverInfo?: { name: string, version: string }
  error?: string
}
```

### 6.7 File Rewind

```typescript
interface RewindFilesResult {
  canRewind: boolean
  error?: string
  filesChanged?: string[]
  insertions?: number
  deletions?: number
}
```

### 6.8 Usage Tracking

```typescript
interface SessionResult {
  success: boolean
  result?: string
  errors?: string[]
  subtype: 'success' | 'error_during_execution' | 'error_max_turns' |
           'error_max_budget_usd' | 'error_max_structured_output_retries'
  numTurns: number
  durationMs: number
  durationApiMs: number
  totalCostUsd: number
  usage: Record<string, ModelUsage>
  structuredOutput?: unknown
  permissionDenials: PermissionDenial[]
}

interface ModelUsage {
  inputTokens: number
  outputTokens: number
  cacheReadInputTokens: number
  cacheCreationInputTokens: number
  webSearchRequests: number
  costUSD: number
  contextWindow?: number
  maxOutputTokens?: number
}
```

---

## 7. Pi SDK Features

### 7.1 Configuration

```typescript
interface PiSessionConfig {
  // Session management
  sessionMode?: 'inMemory' | 'create' | 'continueRecent' | 'open'
  sessionPath?: string
  agentDir?: string

  // Model selection
  model?: { provider: PiProvider, modelId: string }
  thinkingLevel?: PiThinkingLevel
  scopedModels?: Array<{ provider: PiProvider, modelId: string }>

  // Tools
  toolSet?: 'codingTools' | 'readOnlyTools' | 'custom'
  customTools?: string[]

  // Resources
  systemPromptOverride?: string
  skillsOverride?: string[]
  extensionPaths?: string[]

  // Behavior
  autoCompaction?: boolean
  autoRetry?: boolean
  maxRetries?: number

  // Streaming behavior when agent is active
  streamingBehavior?: 'steer' | 'followUp'
}
```

### 7.2 Thinking Levels

```typescript
type PiThinkingLevel = 'off' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh'
```

### 7.3 WebSocket Commands (Pi SDK)

```typescript
// Streaming control (while agent is generating)
{ type: 'pi_steer', content: string }      // Interrupt and redirect
{ type: 'pi_follow_up', content: string }  // Queue for after completion

// Context management
{ type: 'pi_compact', instructions?: string }  // Compress conversation
{ type: 'pi_new_session' }                     // Clear context

// Branching/forking
{ type: 'pi_fork', entryId: string }       // Branch from entry
{ type: 'pi_navigate', entryId: string }   // Jump to entry
{ type: 'pi_get_tree' }                    // Get session tree
{ type: 'pi_get_forkable' }                // Get forkable points

// Model/thinking control
{ type: 'pi_set_model', provider: string, modelId: string }
{ type: 'pi_cycle_model' }
{ type: 'pi_set_thinking_level', level: PiThinkingLevel }
{ type: 'pi_cycle_thinking' }

// Stats/info
{ type: 'pi_get_stats' }
{ type: 'pi_get_models' }
```

### 7.4 WebSocket Responses (Pi SDK)

```typescript
// First-class Pi streaming messages
{
  kind: 'pi',
  sessionId: string,
  type: PiEventType,  // See below
  payload: unknown
}

// JSON-RPC responses
{ method: 'pi/model_cycled', params: { provider, modelId } }
{ method: 'pi/thinking_level_set', params: { level } }
{ method: 'pi/thinking_level_cycled', params: { level } }
{ method: 'pi/session_tree', params: { tree: PiSessionTree } }
{ method: 'pi/forkable_entries', params: { entries: PiForkableEntry[] } }
{ method: 'pi/session_stats', params: { stats: PiSessionStats } }
{ method: 'pi/available_models', params: { models: PiModelInfo[] } }
```

### 7.5 Event Types

```typescript
type PiEventType =
  | 'message_update'          // Streaming text/thinking/tool deltas
  | 'tool_execution_start'
  | 'tool_execution_update'
  | 'tool_execution_end'
  | 'message_start'
  | 'message_end'
  | 'agent_start'
  | 'agent_end'
  | 'turn_start'
  | 'turn_end'
  | 'auto_compaction_start'
  | 'auto_compaction_end'
  | 'auto_retry_start'
  | 'auto_retry_end'
  | 'extension_error'

type PiDeltaType =
  | 'text_start' | 'text_delta' | 'text_end'
  | 'thinking_start' | 'thinking_delta' | 'thinking_end'
  | 'toolcall_start' | 'toolcall_delta' | 'toolcall_end'
  | 'start' | 'done' | 'error'
```

### 7.6 Session Tree (Branching)

```typescript
interface PiSessionEntry {
  id: string
  parentId: string | null
  type: 'message' | 'thinking_level_change' | 'model_change' |
        'compaction' | 'branch_summary' | 'label'
  timestamp: number
  data: unknown
}

interface PiSessionTree {
  entries: PiSessionEntry[]
  leafId: string                           // Current position
  branches: Record<string, string[]>       // parentId -> childIds
  labels: Record<string, string>           // entryId -> label
}

interface PiForkableEntry {
  id: string
  type: 'user_message'
  content: string
  timestamp: number
}
```

### 7.7 Stats

```typescript
interface PiSessionStats {
  inputTokens: number
  outputTokens: number
  totalCost: number
  turnCount: number
  modelId?: string
  provider?: string
}
```

### 7.8 Model Info

```typescript
interface PiModelInfo {
  provider: 'anthropic' | 'openai' | 'google' | 'groq' | 'openrouter'
  modelId: string
  displayName: string
  supportsThinking: boolean
  contextWindow?: number
  maxOutputTokens?: number
}
```

---

## 8. Workspace & Repository Management

### 8.1 Concepts

- **Workspace**: A named reference to a git repository with metadata
- **Agent**: An isolated worktree within a workspace for a session
- **Worktree**: Git worktree providing branch isolation

### 8.2 REST Endpoints

#### Workspaces

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/v1/workspaces` | GET | List all workspaces |
| `/v1/workspaces` | POST | Create workspace |
| `/v1/workspaces/:id` | GET | Get workspace |
| `/v1/workspaces/:id` | DELETE | Delete workspace |
| `/v1/workspaces/:id/agents` | GET | List agents in workspace |
| `/v1/workspaces/:id/agents/:agentId` | DELETE | Remove agent |
| `/v1/workspaces/:id/worktrees` | GET | List worktrees |
| `/v1/workspaces/clone` | POST | Clone remote repo |
| `/v1/workspaces/init` | POST | Initialize git repo |

#### Discovery

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/v1/discovery/scan` | POST | Scan directory for git repos |

### 8.3 Types

```typescript
interface WorkspaceRecord {
  id: string
  name: string
  repoRoot: string
  description: string | null
  createdAt: string
  updatedAt: string
  metadata: string | null
}

interface WorkspaceAgentRecord {
  id: string
  workspaceId: string
  sessionId: string | null
  branch: string
  worktreePath: string
  createdAt: string
  updatedAt: string
}

interface WorktreeInfo {
  branch: string
  path: string
  isMain: boolean
  isLocked: boolean
}

interface DiscoveredRepo {
  path: string
  name: string
  remoteUrl?: string
  hasOrigin: boolean
}
```

### 8.4 Operations

#### Create Workspace
```typescript
POST /v1/workspaces
{
  name?: string
  repoRoot: string
  description?: string
}
```

#### Clone Repository
```typescript
POST /v1/workspaces/clone
{
  remoteUrl: string
  targetDirectory: string
  name?: string
}
```

#### Initialize Repository
```typescript
POST /v1/workspaces/init
{
  path: string
  name?: string
  createWorkspace?: boolean
}
```

#### Scan for Repositories
```typescript
POST /v1/discovery/scan
{
  path: string
}

// Response
{
  repos: DiscoveredRepo[]
  scannedDirectories: number
  errors: Array<{ path: string, error: string }>
}
```

---

## 9. Credential Management

### 9.1 REST Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/v1/credentials` | GET | List credentials (no keys) |
| `/v1/credentials` | POST | Store new credential |
| `/v1/credentials/:id` | DELETE | Delete credential |

### 9.2 Types

```typescript
interface Credential {
  id: string
  provider: 'anthropic' | 'openai' | 'google' | 'groq' | 'openrouter'
  label: string
  createdAt: number
}

// Create request (key never returned)
interface CreateCredentialRequest {
  provider: ProviderKey
  label: string
  apiKey: string
}
```

### 9.3 Security

- API keys are encrypted at rest
- Keys are never returned in API responses
- Frontend only receives credential metadata (id, provider, label, createdAt)

---

## 10. Message & Content Types

### 10.1 Message Structure

```typescript
interface Message {
  id: string
  sessionId?: string
  role: 'user' | 'assistant' | 'system'
  content: string | ContentBlock[]
  timestamp: string
  toolCalls?: ToolCall[]
}
```

### 10.2 Content Blocks

```typescript
interface ContentBlock {
  type: 'text' | 'tool_use' | 'tool_result' | 'thinking' | 'image'

  // For type: 'text'
  text?: string

  // For type: 'thinking'
  thinking?: string
  signature?: string

  // For type: 'tool_use'
  id?: string
  name?: string
  input?: unknown

  // For type: 'tool_result'
  toolCallId?: string
  tool_use_id?: string
  content?: string | ContentBlock[]
  is_error?: boolean

  // For type: 'image'
  mimeType?: string
  data?: string          // Base64
  filename?: string
}
```

### 10.3 Tool Calls

```typescript
interface ToolCall {
  toolCallId: string
  name: string
  input: unknown
  title?: string
  rawInput?: unknown
}
```

### 10.4 Streaming State

For building messages during streaming:

```typescript
// Claude SDK
interface SdkStreamingState {
  messageId: string
  contentBlocks: SdkContentBlock[]
  currentBlockIndex: number
  isStreaming: boolean
}

// Pi SDK
interface PiStreamingState {
  messageId: string
  contentBlocks: PiContentBlock[]
  currentBlockIndex: number
  isStreaming: boolean
}
```

---

## 11. Permission System

### 11.1 Permission Request Flow

```
Agent requests tool use
        ↓
Backend sends permission_request
        ↓
Frontend displays options to user
        ↓
User selects option (or cancels)
        ↓
Frontend sends permission_response
        ↓
Agent continues or handles denial
```

### 11.2 Permission Request

```typescript
interface PermissionRequestParams {
  toolCallId: string
  toolCall: ToolCall
  options: PermissionOption[]
}

interface PermissionOption {
  optionId: string
  name: string
  kind: string
}
```

### 11.3 Extended Permission Context (Claude SDK)

```typescript
interface PermissionContext {
  blockedPath?: string
  decisionReason?: string
  agentID?: string
  suggestions?: PermissionUpdate[]
}

interface PermissionUpdate {
  type: 'addRules' | 'replaceRules' | 'removeRules' | 'setMode' |
        'addDirectories' | 'removeDirectories'
  destination: 'userSettings' | 'projectSettings' | 'localSettings' | 'session' | 'cliArg'
  behavior: 'allow' | 'deny' | 'ask'
  toolName?: string
  pattern?: string
  paths?: string[]
}
```

### 11.4 Special Case: AskUserQuestion

When `toolCall.name === 'AskUserQuestion'`, the frontend must:
1. Display the question from `toolCall.input.question`
2. Collect user's text answer
3. Send response with `answers: { answer: "user's response" }`

---

## 12. State Management

### 12.1 Global App State

```typescript
interface AppState {
  gatewayUrl: string
  apiToken: string
  isConnected: boolean
  theme: 'light' | 'dark'
  sidebarOpen: boolean
  commandPaletteOpen: boolean
  sdkPanelOpen: boolean
}
```

### 12.2 Sessions State

```typescript
interface SessionsState {
  // Core
  sessions: Session[]
  messages: Record<sessionId, Message[]>
  connections: Record<sessionId, ConnectionState>
  activeSessionId: string | null
  pendingPermissions: Record<key, PermissionRequest>

  // Claude SDK specific (keyed by sessionId)
  sdkConfig: Record<string, SdkSessionConfig>
  sdkUsage: Record<string, SessionResult | null>
  sdkAccountInfo: Record<string, AccountInfo | null>
  sdkModels: Record<string, ModelInfo[]>
  sdkCommands: Record<string, SlashCommand[]>
  sdkMcpStatus: Record<string, McpServerStatus[]>
  sdkCheckpoints: Record<string, string[]>
  sdkLoading: Record<string, LoadingState>
  sdkErrors: Record<string, ErrorState>
  sdkRewindResult: Record<string, RewindFilesResult | null>
  sdkStreamingState: Record<string, StreamingState | null>

  // Pi SDK specific (keyed by sessionId)
  piConfig: Record<string, PiSessionConfig>
  piStats: Record<string, PiSessionStats | null>
  piModels: Record<string, PiModelInfo[]>
  piSessionTree: Record<string, PiSessionTree | null>
  piForkableEntries: Record<string, PiForkableEntry[]>
  piThinkingLevel: Record<string, PiThinkingLevel>
  piLoading: Record<string, LoadingState>
  piErrors: Record<string, ErrorState>
  piStreamingState: Record<string, StreamingState | null>
}
```

### 12.3 Loading/Error State

```typescript
interface LoadingState {
  config?: boolean
  models?: boolean
  commands?: boolean
  mcpStatus?: boolean
  accountInfo?: boolean
  checkpoints?: boolean
  stats?: boolean
  tree?: boolean
  forkable?: boolean
}

interface ErrorState {
  models?: string
  commands?: string
  mcpStatus?: string
  accountInfo?: string
  stats?: string
  tree?: string
}
```

---

## 13. Error Handling

### 13.1 HTTP Error Responses

```typescript
{
  error: string
  message?: string
}
```

| Status | Meaning |
|--------|---------|
| 400 | Bad request / validation error |
| 404 | Resource not found |
| 500 | Internal server error |
| 503 | Service unavailable |

### 13.2 WebSocket Errors

```typescript
{
  jsonrpc: '2.0',
  error: {
    code: number,
    message: string
  },
  id: null
}
```

| Code | Meaning |
|------|---------|
| -32700 | Parse error |
| -32000 | Message too large |

### 13.3 WebSocket Close Codes

| Code | Meaning | Should Reconnect |
|------|---------|------------------|
| 1000 | Normal close (session ended) | No |
| 1008 | Session not found | No |
| Other | Unexpected disconnect | Yes (with backoff) |

---

## 14. Persistence

### 14.1 Message Persistence

Messages should be persisted locally (e.g., IndexedDB) for:
- Offline access to history
- Fast initial load
- Resuming sessions

```typescript
interface PersistedMessage {
  id: string
  sessionId: string
  role: 'user' | 'assistant' | 'system'
  content: string | ContentBlock[]
  timestamp: string
  toolCalls?: ToolCall[]
}
```

### 14.2 Session Restoration

On page load:
1. Load persisted sessions from local storage
2. For each session, check if it exists via `GET /v1/sessions/:id`
3. If session exists, restore WebSocket connection
4. If session is resumable, offer to reconnect via `POST /v1/sessions/:id/connect`

### 14.3 App Settings

Persist to localStorage:
- Gateway URL
- API token
- Theme preference
- UI state (sidebar, panels)

---

## Appendix A: Health Checks

### Liveness
```
GET /healthz
Response: { status: 'ok' }
```

### Readiness
```
GET /readyz
Response (ready): { status: 'ready', claudePath: string }
Response (not ready): { status: 'not ready', errors: string[] }
```

---

## Appendix B: Complete Type Reference

See `web/src/api/types.ts` and `web/src/api/pi-types.ts` for complete TypeScript type definitions.

---

## Appendix C: User Workflows

### C.1 New Session Flow
1. User selects agent type (Claude SDK or Pi SDK)
2. User configures authentication (stored credential, inline key, or OAuth)
3. User optionally selects workspace
4. User optionally configures agent-specific settings
5. POST /v1/sessions creates session
6. WebSocket connection established
7. Session ready for interaction

### C.2 Message Flow
1. User types message (optionally attaches images)
2. Frontend sends `user_message` via WebSocket
3. Backend streams responses via SDK-specific events
4. Frontend builds message from content block deltas
5. On `prompt_complete`, message finalized

### C.3 Permission Flow
1. Agent requests tool use requiring approval
2. Backend sends `session/request_permission`
3. Frontend displays permission dialog with options
4. User selects option or cancels
5. Frontend sends `permission_response`
6. Agent continues based on response

### C.4 Resume Session Flow
1. User views resumable sessions list
2. User selects session to resume
3. POST /v1/sessions/:id/connect restores session
4. WebSocket connection established
5. Frontend loads message history
6. Session continues

---

*Document Version: 1.0*
*Generated: 2026-01-28*
