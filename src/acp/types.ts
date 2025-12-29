/**
 * ACP (Agent Client Protocol) Type Definitions
 * Based on https://agentclientprotocol.com/protocol/schema
 */

// =============================================================================
// JSON-RPC 2.0 Base Types
// =============================================================================

export type JsonRpcRequest<P = unknown> = {
  jsonrpc: '2.0';
  id: string | number;
  method: string;
  params?: P;
};

export type JsonRpcResult<R = unknown> = {
  jsonrpc: '2.0';
  id: string | number;
  result: R;
};

export type JsonRpcError = {
  jsonrpc: '2.0';
  id: string | number | null;
  error: { code: number; message: string; data?: unknown };
};

export type JsonRpcNotification<P = unknown> = {
  jsonrpc: '2.0';
  method: string;
  params?: P;
};

export type JsonRpcResponse<R = unknown> = JsonRpcResult<R> | JsonRpcError;

// =============================================================================
// Content Types
// =============================================================================

export type Annotations = unknown;

export type TextContent = {
  type: 'text';
  text: string;
  annotations?: Annotations;
  _meta?: Record<string, unknown> | null;
};

export type ImageContent = {
  type: 'image';
  data: string; // base64
  mimeType: string;
  uri?: string;
  annotations?: Annotations;
  _meta?: Record<string, unknown> | null;
};

export type AudioContent = {
  type: 'audio';
  data: string; // base64
  mimeType: string;
  annotations?: Annotations;
  _meta?: Record<string, unknown> | null;
};

export type EmbeddedResourceText = {
  uri: string;
  text: string;
  mimeType?: string;
  _meta?: Record<string, unknown> | null;
};

export type EmbeddedResourceBlob = {
  uri: string;
  blob: string; // base64
  mimeType?: string;
  _meta?: Record<string, unknown> | null;
};

export type EmbeddedResourceResource = EmbeddedResourceText | EmbeddedResourceBlob;

export type ResourceContent = {
  type: 'resource';
  resource: EmbeddedResourceResource;
  annotations?: Annotations;
  _meta?: Record<string, unknown> | null;
};

export type ResourceLinkContent = {
  type: 'resource_link';
  uri: string;
  name: string;
  mimeType?: string;
  title?: string;
  description?: string;
  size?: number;
  annotations?: Annotations;
  _meta?: Record<string, unknown> | null;
};

export type ContentBlock =
  | TextContent
  | ImageContent
  | AudioContent
  | ResourceContent
  | ResourceLinkContent;

// =============================================================================
// Client Capabilities
// =============================================================================

export type ClientCapabilities = {
  fs?: {
    readTextFile?: boolean;
    writeTextFile?: boolean;
  };
  terminal?: boolean;
  _meta?: Record<string, unknown> | null;
};

export type ClientInfo = {
  name: string;
  version: string;
  _meta?: Record<string, unknown> | null;
};

// =============================================================================
// Agent Capabilities
// =============================================================================

export type AgentCapabilities = {
  loadSession?: boolean;
  mcpCapabilities?: {
    http?: boolean;
    sse?: boolean;
  };
  promptCapabilities?: {
    audio?: boolean;
    embeddedContext?: boolean;
    image?: boolean;
  };
  sessionCapabilities?: Record<string, unknown>;
  _meta?: Record<string, unknown> | null;
};

export type AgentInfo = {
  name: string;
  version: string;
  _meta?: Record<string, unknown> | null;
};

export type AuthMethod = {
  methodId: string;
  name?: string;
  _meta?: Record<string, unknown> | null;
};

// =============================================================================
// MCP Server Configuration
// =============================================================================

export type McpServerStdio = {
  type: 'stdio';
  name: string;
  command: string;
  args?: string[];
  env?: Record<string, string>;
  _meta?: Record<string, unknown> | null;
};

export type McpServerHttp = {
  type: 'http';
  name: string;
  url: string;
  headers?: Record<string, string>;
  _meta?: Record<string, unknown> | null;
};

export type McpServerSse = {
  type: 'sse';
  name: string;
  url: string;
  headers?: Record<string, string>;
  _meta?: Record<string, unknown> | null;
};

export type McpServer = McpServerStdio | McpServerHttp | McpServerSse;

// =============================================================================
// Session Modes
// =============================================================================

export type SessionMode = {
  modeId: string;
  name?: string;
  description?: string;
  _meta?: Record<string, unknown> | null;
};

// =============================================================================
// Initialize (Client → Agent)
// =============================================================================

export type InitializeParams = {
  protocolVersion: number; // claude-code-acp uses number, not string
  clientCapabilities?: ClientCapabilities;
  clientInfo?: ClientInfo;
  _meta?: Record<string, unknown> | null;
};

export type InitializeResult = {
  protocolVersion: number; // claude-code-acp uses number, not string
  agentCapabilities?: AgentCapabilities;
  agentInfo?: AgentInfo;
  authMethods?: AuthMethod[];
  _meta?: Record<string, unknown> | null;
};

// =============================================================================
// Authenticate (Client → Agent)
// =============================================================================

export type AuthenticateParams = {
  methodId: string;
  _meta?: Record<string, unknown> | null;
};

export type AuthenticateResult = {
  _meta?: Record<string, unknown> | null;
};

// =============================================================================
// Session/New (Client → Agent)
// =============================================================================

export type NewSessionParams = {
  cwd: string;
  mcpServers: McpServer[];
  _meta?: Record<string, unknown> | null;
};

export type NewSessionResult = {
  sessionId: string;
  modes?: SessionMode[];
  _meta?: Record<string, unknown> | null;
};

// =============================================================================
// Session/Load (Client → Agent)
// =============================================================================

export type LoadSessionParams = {
  sessionId: string;
  cwd: string;
  mcpServers: McpServer[];
  _meta?: Record<string, unknown> | null;
};

export type LoadSessionResult = {
  modes?: SessionMode[];
  _meta?: Record<string, unknown> | null;
};

// =============================================================================
// Session/Prompt (Client → Agent)
// =============================================================================

export type PromptParams = {
  sessionId: string;
  prompt: ContentBlock[];
  _meta?: Record<string, unknown> | null;
};

export type StopReason = 'end_turn' | 'max_tokens' | 'max_turn_requests' | 'refusal' | 'cancelled';

export type PromptResult = {
  stopReason: StopReason;
  _meta?: Record<string, unknown> | null;
};

// =============================================================================
// Session/SetMode (Client → Agent)
// =============================================================================

export type SetModeParams = {
  sessionId: string;
  modeId: string;
  _meta?: Record<string, unknown> | null;
};

export type SetModeResult = {
  _meta?: Record<string, unknown> | null;
};

// =============================================================================
// Session/Cancel (Client → Agent, Notification)
// =============================================================================

export type CancelParams = {
  sessionId: string;
  _meta?: Record<string, unknown> | null;
};

// =============================================================================
// Session/Update (Agent → Client, Notification)
// =============================================================================

export type ToolCallKind = 'read' | 'edit' | 'delete' | 'move' | 'search' | 'execute' | 'think' | 'fetch' | 'other';
export type ToolCallStatus = 'pending' | 'in_progress' | 'completed' | 'failed';

export type ToolCallLocation = {
  uri: string;
  range?: {
    start: { line: number; character: number };
    end: { line: number; character: number };
  };
  _meta?: Record<string, unknown> | null;
};

export type ToolCallContentBlock =
  | { type: 'content'; content: ContentBlock }
  | { type: 'input'; input: string }
  | { type: 'output'; output: string };

export type PlanPriority = 'high' | 'medium' | 'low';
export type PlanStatus = 'pending' | 'in_progress' | 'completed' | 'failed';

export type PlanEntry = {
  content: string;
  priority: PlanPriority;
  status: PlanStatus;
  _meta?: Record<string, unknown> | null;
};

// Session Update variants (tagged union on sessionUpdate)
export type UserMessageChunkUpdate = {
  sessionUpdate: 'user_message_chunk';
  content: ContentBlock;
  _meta?: Record<string, unknown> | null;
};

export type AgentMessageChunkUpdate = {
  sessionUpdate: 'agent_message_chunk';
  content: ContentBlock;
  _meta?: Record<string, unknown> | null;
};

export type AgentThoughtChunkUpdate = {
  sessionUpdate: 'agent_thought_chunk';
  content: ContentBlock;
  _meta?: Record<string, unknown> | null;
};

export type ToolCallUpdate = {
  sessionUpdate: 'tool_call';
  toolCallId: string;
  title: string;
  status: ToolCallStatus;
  kind?: ToolCallKind;
  content?: ToolCallContentBlock[];
  locations?: ToolCallLocation[];
  rawInput?: Record<string, unknown>;
  rawOutput?: Record<string, unknown>;
  _meta?: Record<string, unknown> | null;
};

export type ToolCallUpdateUpdate = {
  sessionUpdate: 'tool_call_update';
  toolCallId: string;
  title?: string;
  status?: ToolCallStatus;
  kind?: ToolCallKind;
  content?: ToolCallContentBlock[];
  locations?: ToolCallLocation[];
  rawInput?: Record<string, unknown>;
  rawOutput?: Record<string, unknown>;
  _meta?: Record<string, unknown> | null;
};

export type PlanUpdate = {
  sessionUpdate: 'plan';
  entries: PlanEntry[];
  _meta?: Record<string, unknown> | null;
};

export type AvailableCommand = {
  commandId: string;
  name: string;
  description?: string;
  _meta?: Record<string, unknown> | null;
};

export type AvailableCommandsUpdate = {
  sessionUpdate: 'available_commands_update';
  availableCommands: AvailableCommand[];
  _meta?: Record<string, unknown> | null;
};

export type CurrentModeUpdate = {
  sessionUpdate: 'current_mode_update';
  currentModeId: string;
  _meta?: Record<string, unknown> | null;
};

export type SessionUpdate =
  | UserMessageChunkUpdate
  | AgentMessageChunkUpdate
  | AgentThoughtChunkUpdate
  | ToolCallUpdate
  | ToolCallUpdateUpdate
  | PlanUpdate
  | AvailableCommandsUpdate
  | CurrentModeUpdate;

export type SessionUpdateParams = {
  sessionId: string;
  update: SessionUpdate;
  _meta?: Record<string, unknown> | null;
};

// =============================================================================
// Session/RequestPermission (Agent → Client)
// =============================================================================

export type PermissionOptionKind = 'allow_once' | 'allow_always' | 'reject_once' | 'reject_always';

export type PermissionOption = {
  optionId: string;
  name: string;
  kind: PermissionOptionKind;
  _meta?: Record<string, unknown> | null;
};

export type RequestPermissionParams = {
  sessionId: string;
  toolCall: {
    toolCallId: string;
    title?: string;
    kind?: ToolCallKind;
    content?: ToolCallContentBlock[];
    rawInput?: Record<string, unknown>;
  };
  options: PermissionOption[];
  _meta?: Record<string, unknown> | null;
};

export type PermissionOutcome =
  | { outcome: 'selected'; optionId: string }
  | { outcome: 'cancelled' };

export type RequestPermissionResult = {
  outcome: PermissionOutcome;
  _meta?: Record<string, unknown> | null;
};

// =============================================================================
// File System Methods (Agent → Client)
// =============================================================================

export type FsReadTextFileParams = {
  sessionId: string;
  path: string;
  line?: number;
  limit?: number;
  _meta?: Record<string, unknown> | null;
};

export type FsReadTextFileResult = {
  content: string;
  _meta?: Record<string, unknown> | null;
};

export type FsWriteTextFileParams = {
  sessionId: string;
  path: string;
  content: string;
  _meta?: Record<string, unknown> | null;
};

export type FsWriteTextFileResult = {
  _meta?: Record<string, unknown> | null;
};

// =============================================================================
// Terminal Methods (Agent → Client)
// =============================================================================

export type TerminalCreateParams = {
  sessionId: string;
  command: string;
  args?: string[];
  cwd?: string;
  env?: Record<string, string>;
  outputByteLimit?: number;
  _meta?: Record<string, unknown> | null;
};

export type TerminalCreateResult = {
  terminalId: string;
  _meta?: Record<string, unknown> | null;
};

export type TerminalOutputParams = {
  sessionId: string;
  terminalId: string;
  _meta?: Record<string, unknown> | null;
};

export type TerminalExitStatus = {
  exitCode: number | null;
  signal: string | null;
};

export type TerminalOutputResult = {
  output: string;
  truncated: boolean;
  exitStatus?: TerminalExitStatus;
  _meta?: Record<string, unknown> | null;
};

export type TerminalKillParams = {
  sessionId: string;
  terminalId: string;
  _meta?: Record<string, unknown> | null;
};

export type TerminalKillResult = {
  _meta?: Record<string, unknown> | null;
};

export type TerminalWaitForExitParams = {
  sessionId: string;
  terminalId: string;
  _meta?: Record<string, unknown> | null;
};

export type TerminalWaitForExitResult = {
  exitCode: number | null;
  signal: string | null;
  _meta?: Record<string, unknown> | null;
};

export type TerminalReleaseParams = {
  sessionId: string;
  terminalId: string;
  _meta?: Record<string, unknown> | null;
};

export type TerminalReleaseResult = {
  _meta?: Record<string, unknown> | null;
};

// =============================================================================
// Helper type guards
// =============================================================================

export function isSessionUpdate(msg: unknown): msg is JsonRpcNotification<SessionUpdateParams> {
  const m = msg as JsonRpcNotification<SessionUpdateParams>;
  return m.jsonrpc === '2.0' && m.method === 'session/update' && !('id' in m);
}

export function isRequestPermission(msg: unknown): msg is JsonRpcRequest<RequestPermissionParams> {
  const m = msg as JsonRpcRequest<RequestPermissionParams>;
  return m.jsonrpc === '2.0' && m.method === 'session/request_permission' && 'id' in m;
}

export function isAgentMessageChunk(update: SessionUpdate): update is AgentMessageChunkUpdate {
  return update.sessionUpdate === 'agent_message_chunk';
}

export function isToolCall(update: SessionUpdate): update is ToolCallUpdate {
  return update.sessionUpdate === 'tool_call';
}

export function isToolCallUpdate(update: SessionUpdate): update is ToolCallUpdateUpdate {
  return update.sessionUpdate === 'tool_call_update';
}

export function isPlan(update: SessionUpdate): update is PlanUpdate {
  return update.sessionUpdate === 'plan';
}
