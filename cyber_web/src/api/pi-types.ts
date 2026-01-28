/**
 * Pi Coding Agent SDK Types for Frontend
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
  sessionPath?: string;
  agentDir?: string;

  // Model selection
  model?: PiModelConfig;
  thinkingLevel?: PiThinkingLevel;
  scopedModels?: PiModelConfig[];

  // Tools
  toolSet?: PiToolSet;
  customTools?: string[];

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
// Forkable Entry
// =============================================================================

export interface PiForkableEntry {
  id: string;
  type: 'user_message';
  content: string;
  timestamp: number;
}

// =============================================================================
// WebSocket Message Types
// =============================================================================

export interface PiWsMessage {
  kind: 'pi';
  sessionId: string;
  type: string;
  payload: unknown;
}

/**
 * Type guard to check if a message is a Pi WebSocket message
 */
export function isPiWsMessage(msg: unknown): msg is PiWsMessage {
  return (
    typeof msg === 'object' &&
    msg !== null &&
    (msg as Record<string, unknown>).kind === 'pi'
  );
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
// Event Payload Types
// =============================================================================

export interface PiMessageUpdatePayload {
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

export interface PiToolExecutionStartPayload {
  type: 'tool_execution_start';
  toolName: string;
  toolCallId: string;
  input: Record<string, unknown>;
}

export interface PiToolExecutionEndPayload {
  type: 'tool_execution_end';
  toolName: string;
  toolCallId: string;
  result?: unknown;
  error?: string;
  isError: boolean;
}

export interface PiAgentStartPayload {
  type: 'agent_start';
}

export interface PiAgentEndPayload {
  type: 'agent_end';
  result?: string;
  error?: string;
}

export interface PiCompactionStartPayload {
  type: 'auto_compaction_start';
  preTokens: number;
}

export interface PiCompactionEndPayload {
  type: 'auto_compaction_end';
  preTokens: number;
  postTokens: number;
}

// =============================================================================
// Content Block Types (for streaming state)
// =============================================================================

export type PiContentBlockType = 'text' | 'thinking' | 'tool_call';

export interface PiTextContentBlock {
  type: 'text';
  text: string;
}

export interface PiThinkingContentBlock {
  type: 'thinking';
  thinking: string;
}

export interface PiToolCallContentBlock {
  type: 'tool_call';
  id: string;
  name: string;
  input: string; // JSON string being built up
}

export type PiContentBlock = PiTextContentBlock | PiThinkingContentBlock | PiToolCallContentBlock;

// =============================================================================
// Streaming State
// =============================================================================

export interface PiStreamingState {
  messageId: string;
  contentBlocks: PiContentBlock[];
  currentBlockIndex: number;
  isStreaming: boolean;
}
