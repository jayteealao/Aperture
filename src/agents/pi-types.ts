/**
 * Pi Coding Agent SDK Types
 * All types for Pi SDK configuration, events, session management, and results
 */

// =============================================================================
// Thinking Levels (Pi-specific - more granular than Claude SDK)
// =============================================================================

export type PiThinkingLevel = 'off' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh';

// =============================================================================
// Session Management Modes
// =============================================================================

export type PiSessionMode = 'inMemory' | 'create' | 'continueRecent' | 'open';

// =============================================================================
// Tool Sets
// =============================================================================

export type PiToolSet = 'codingTools' | 'readOnlyTools' | 'custom';

// =============================================================================
// Provider Types (Pi supports multiple providers)
// =============================================================================

export type PiProvider = 'anthropic' | 'openai' | 'google' | 'groq' | 'openrouter';

// =============================================================================
// Event Types from Pi SDK
// =============================================================================

export type PiEventType =
  | 'message_update'
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
  | 'extension_error';

// =============================================================================
// Assistant Message Event Delta Types
// =============================================================================

export type PiDeltaType =
  | 'text_start'
  | 'text_delta'
  | 'text_end'
  | 'thinking_start'
  | 'thinking_delta'
  | 'thinking_end'
  | 'toolcall_start'
  | 'toolcall_delta'
  | 'toolcall_end'
  | 'start'
  | 'done'
  | 'error';

// =============================================================================
// Session Tree Types (Pi-specific - enables branching/forking)
// =============================================================================

export type PiSessionEntryType =
  | 'message'
  | 'thinking_level_change'
  | 'model_change'
  | 'compaction'
  | 'branch_summary'
  | 'label';

export interface PiSessionEntry {
  id: string;
  parentId: string | null;
  type: PiSessionEntryType;
  timestamp: number;
  data: unknown;
}

export interface PiSessionTree {
  entries: PiSessionEntry[];
  leafId: string;
  branches: Record<string, string[]>; // parentId -> childIds
  labels: Record<string, string>; // entryId -> label
}

// =============================================================================
// Session Configuration
// =============================================================================

export interface PiModelConfig {
  provider: PiProvider;
  modelId: string;
}

export interface PiSessionConfig {
  // Session management
  sessionMode?: PiSessionMode;
  sessionPath?: string; // For 'open' mode - path to existing session file
  agentDir?: string; // Global config location (default: ~/.pi/agent)

  // Model selection
  model?: PiModelConfig;
  thinkingLevel?: PiThinkingLevel;
  scopedModels?: PiModelConfig[]; // Array for cycling with cycleModel()

  // Tools
  toolSet?: PiToolSet;
  customTools?: string[]; // Tool names when toolSet='custom'

  // Resources
  systemPromptOverride?: string;
  skillsOverride?: string[];
  extensionPaths?: string[];

  // Behavior
  autoCompaction?: boolean;
  autoRetry?: boolean;
  maxRetries?: number;

  // Streaming behavior when agent is active
  streamingBehavior?: 'steer' | 'followUp';
}

// =============================================================================
// Session Stats
// =============================================================================

export interface PiSessionStats {
  inputTokens: number;
  outputTokens: number;
  totalCost: number;
  turnCount: number;
  modelId?: string;
  provider?: string;
}

// =============================================================================
// Available Model Info
// =============================================================================

export interface PiModelInfo {
  provider: PiProvider;
  modelId: string;
  displayName: string;
  supportsThinking: boolean;
  contextWindow?: number;
  maxOutputTokens?: number;
}

// =============================================================================
// Compaction Info
// =============================================================================

export interface PiCompactionInfo {
  trigger: 'manual' | 'auto';
  preTokens: number;
  postTokens?: number;
  savedTokens?: number;
  instructions?: string;
}

// =============================================================================
// Tool Execution Types
// =============================================================================

export interface PiToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface PiToolResult {
  toolCallId: string;
  toolName: string;
  result?: unknown;
  error?: string;
  isError: boolean;
}

// =============================================================================
// Message Types
// =============================================================================

export interface PiUserMessage {
  role: 'user';
  content: string;
  attachments?: PiAttachment[];
  timestamp: number;
}

export interface PiAssistantMessage {
  role: 'assistant';
  content: PiAssistantContent[];
  usage?: PiUsageInfo;
  stopReason?: string;
  timestamp: number;
}

export interface PiToolResultMessage {
  role: 'tool_result';
  toolCallId: string;
  toolName: string;
  result: unknown;
  isError: boolean;
  timestamp: number;
}

export type PiMessage = PiUserMessage | PiAssistantMessage | PiToolResultMessage;

// =============================================================================
// Content Block Types
// =============================================================================

export type PiAssistantContentType = 'text' | 'thinking' | 'tool_call';

export interface PiTextContent {
  type: 'text';
  text: string;
}

export interface PiThinkingContent {
  type: 'thinking';
  thinking: string;
}

export interface PiToolCallContent {
  type: 'tool_call';
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export type PiAssistantContent = PiTextContent | PiThinkingContent | PiToolCallContent;

// =============================================================================
// Attachment Types
// =============================================================================

export interface PiAttachment {
  type: 'image';
  mimeType: string;
  base64: string;
  filename?: string;
}

// =============================================================================
// Usage Info
// =============================================================================

export interface PiUsageInfo {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
}

// =============================================================================
// Event Payload Types
// =============================================================================

export interface PiMessageUpdateEvent {
  type: 'message_update';
  assistantMessageEvent: {
    type: PiDeltaType;
    delta?: string;
    toolCallId?: string;
    toolName?: string;
    inputJson?: string;
    error?: string;
  };
}

export interface PiToolExecutionStartEvent {
  type: 'tool_execution_start';
  toolName: string;
  toolCallId: string;
  input: Record<string, unknown>;
}

export interface PiToolExecutionUpdateEvent {
  type: 'tool_execution_update';
  toolName: string;
  toolCallId: string;
  partialResult?: unknown;
}

export interface PiToolExecutionEndEvent {
  type: 'tool_execution_end';
  toolName: string;
  toolCallId: string;
  result?: unknown;
  error?: string;
  isError: boolean;
}

export interface PiAgentStartEvent {
  type: 'agent_start';
}

export interface PiAgentEndEvent {
  type: 'agent_end';
  result?: string;
  error?: string;
}

export interface PiTurnStartEvent {
  type: 'turn_start';
  turnIndex: number;
}

export interface PiTurnEndEvent {
  type: 'turn_end';
  turnIndex: number;
  usage?: PiUsageInfo;
  stopReason?: string;
}

export interface PiCompactionStartEvent {
  type: 'auto_compaction_start';
  preTokens: number;
}

export interface PiCompactionEndEvent {
  type: 'auto_compaction_end';
  preTokens: number;
  postTokens: number;
}

export interface PiRetryStartEvent {
  type: 'auto_retry_start';
  attempt: number;
  maxAttempts: number;
  delayMs: number;
  error: string;
}

export interface PiRetryEndEvent {
  type: 'auto_retry_end';
  attempt: number;
  success: boolean;
}

export interface PiExtensionErrorEvent {
  type: 'extension_error';
  extensionName: string;
  error: string;
}

export interface PiMessageStartEvent {
  type: 'message_start';
}

export interface PiMessageEndEvent {
  type: 'message_end';
}

export type PiEvent =
  | PiMessageUpdateEvent
  | PiToolExecutionStartEvent
  | PiToolExecutionUpdateEvent
  | PiToolExecutionEndEvent
  | PiAgentStartEvent
  | PiAgentEndEvent
  | PiTurnStartEvent
  | PiTurnEndEvent
  | PiCompactionStartEvent
  | PiCompactionEndEvent
  | PiRetryStartEvent
  | PiRetryEndEvent
  | PiExtensionErrorEvent
  | PiMessageStartEvent
  | PiMessageEndEvent;

// =============================================================================
// WebSocket Message Types
// =============================================================================

export interface PiWsMessage {
  kind: 'pi';
  sessionId: string;
  type: string;
  payload: unknown;
}

// =============================================================================
// Session Status
// =============================================================================

export interface PiSessionStatus {
  id: string;
  agent: 'pi_sdk';
  authMode: string;
  running: boolean;
  pendingRequests: number;
  lastActivityTime: number;
  idleMs: number;
  piSessionPath: string | null;
  isResumable: boolean;
  workingDirectory?: string;
  thinkingLevel?: PiThinkingLevel;
  currentModel?: PiModelConfig;
  isStreaming: boolean;
}

// =============================================================================
// Fork/Branch Types
// =============================================================================

export interface PiForkableEntry {
  id: string;
  type: 'user_message';
  content: string;
  timestamp: number;
}

export interface PiBranchInfo {
  branchId: string;
  parentEntryId: string;
  label?: string;
  createdAt: number;
}
