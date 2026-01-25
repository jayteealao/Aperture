/**
 * Claude Agent SDK Extended Types
 * All types for SDK configuration, MCP, hooks, agents, and results
 */

// Permission modes from SDK
export type PermissionMode =
  | 'default'
  | 'acceptEdits'
  | 'bypassPermissions'
  | 'plan'
  | 'delegate'
  | 'dontAsk';

// Hook event types from SDK
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
  | 'Setup';

// =============================================================================
// MCP Server Configuration Types
// =============================================================================

export interface McpStdioServer {
  type?: 'stdio';
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

export interface McpSseServer {
  type: 'sse';
  url: string;
  headers?: Record<string, string>;
}

export interface McpHttpServer {
  type: 'http';
  url: string;
  headers?: Record<string, string>;
}

export type McpServerConfig = McpStdioServer | McpSseServer | McpHttpServer;

export interface McpServerStatus {
  name: string;
  status: 'connected' | 'failed' | 'needs-auth' | 'pending';
  serverInfo?: { name: string; version: string };
  error?: string;
}

export interface McpSetServersResult {
  added: string[];
  removed: string[];
  errors: Record<string, string>;
}

// =============================================================================
// Agent Definition Types
// =============================================================================

export type AgentModel = 'sonnet' | 'opus' | 'haiku' | 'inherit';

export interface AgentDefinition {
  description: string;
  prompt: string;
  model?: AgentModel;
  tools?: string[];
  disallowedTools?: string[];
  maxTurns?: number;
  skills?: string[];
  mcpServers?: string[]; // References to mcpServers keys
  criticalSystemReminder_EXPERIMENTAL?: string;
}

// =============================================================================
// Sandbox Configuration Types
// =============================================================================

export interface SandboxNetworkConfig {
  allowedDomains?: string[];
  allowUnixSockets?: string[];
  allowAllUnixSockets?: boolean;
  allowLocalBinding?: boolean;
  httpProxyPort?: number;
  socksProxyPort?: number;
}

export interface SandboxConfig {
  enabled?: boolean;
  autoAllowBashIfSandboxed?: boolean;
  allowUnsandboxedCommands?: boolean;
  network?: SandboxNetworkConfig;
  ignoreViolations?: Record<string, string[]>;
  enableWeakerNestedSandbox?: boolean;
  excludedCommands?: string[];
  ripgrep?: { command: string; args?: string[] };
}

// =============================================================================
// Plugin Configuration Types
// =============================================================================

export interface PluginConfig {
  type: 'local';
  path: string;
}

// =============================================================================
// Output Format Types
// =============================================================================

export interface OutputFormat {
  type: 'json_schema';
  schema: Record<string, unknown>;
}

// =============================================================================
// Hook Configuration Types
// =============================================================================

export interface HookCallbackMatcher {
  matcher?: string;
  timeout?: number;
}

// =============================================================================
// System Prompt Types
// =============================================================================

export interface SystemPromptPreset {
  type: 'preset';
  preset: 'claude_code';
  append?: string;
}

export type SystemPromptConfig = string | SystemPromptPreset;

// =============================================================================
// SDK Session Configuration
// =============================================================================

export interface SdkSessionConfig {
  // Session resumption
  resume?: string;
  resumeSessionAt?: string;
  forkSession?: boolean;
  continue?: boolean;
  persistSession?: boolean;

  // File checkpointing
  enableFileCheckpointing?: boolean;

  // Permission control
  permissionMode?: PermissionMode;
  allowedTools?: string[];
  disallowedTools?: string[];
  allowDangerouslySkipPermissions?: boolean;

  // Budget and limits
  maxBudgetUsd?: number;
  maxTurns?: number;
  maxThinkingTokens?: number;

  // Model selection
  model?: string;
  fallbackModel?: string;
  betas?: string[];

  // MCP servers
  mcpServers?: Record<string, McpServerConfig>;

  // Agents
  agent?: string;
  agents?: Record<string, AgentDefinition>;

  // Hooks (simplified - actual hooks handled by manager)
  hookMatchers?: Partial<Record<HookEvent, HookCallbackMatcher[]>>;

  // Sandbox
  sandbox?: SandboxConfig;

  // Plugins
  plugins?: PluginConfig[];

  // Output
  outputFormat?: OutputFormat;

  // System prompt
  systemPrompt?: SystemPromptConfig;

  // Advanced
  additionalDirectories?: string[];
  settingSources?: ('user' | 'project' | 'local')[];
}

// =============================================================================
// Usage & Result Tracking Types
// =============================================================================

export interface ModelUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadInputTokens: number;
  cacheCreationInputTokens: number;
  webSearchRequests: number;
  costUSD: number;
  contextWindow?: number;
  maxOutputTokens?: number;
}

export interface PermissionDenial {
  toolName: string;
  toolInput: Record<string, unknown>;
  message: string;
}

export type ResultSubtype =
  | 'success'
  | 'error_during_execution'
  | 'error_max_turns'
  | 'error_max_budget_usd'
  | 'error_max_structured_output_retries';

export interface SessionResult {
  success: boolean;
  result?: string;
  errors?: string[];
  subtype: ResultSubtype;
  numTurns: number;
  durationMs: number;
  durationApiMs: number;
  totalCostUsd: number;
  usage: Record<string, ModelUsage>;
  structuredOutput?: unknown;
  permissionDenials: PermissionDenial[];
}

// =============================================================================
// Account & Discovery Types
// =============================================================================

export interface AccountInfo {
  email?: string;
  organization?: string;
  subscriptionType?: string;
  tokenSource?: string;
  apiKeySource?: string;
}

export interface SlashCommand {
  name: string;
  description: string;
  argumentHint: string;
}

export interface ModelInfo {
  value: string;
  displayName: string;
  description: string;
}

// =============================================================================
// File Checkpointing Types
// =============================================================================

export interface RewindFilesResult {
  canRewind: boolean;
  error?: string;
  filesChanged?: string[];
  insertions?: number;
  deletions?: number;
}

// =============================================================================
// Permission Types
// =============================================================================

export type PermissionBehavior = 'allow' | 'deny' | 'ask';

export type PermissionUpdateType =
  | 'addRules'
  | 'replaceRules'
  | 'removeRules'
  | 'setMode'
  | 'addDirectories'
  | 'removeDirectories';

export type PermissionDestination =
  | 'userSettings'
  | 'projectSettings'
  | 'localSettings'
  | 'session'
  | 'cliArg';

export interface PermissionUpdate {
  type: PermissionUpdateType;
  destination: PermissionDestination;
  behavior: PermissionBehavior;
  toolName?: string;
  pattern?: string;
  paths?: string[];
}

export interface PermissionOption {
  optionId: string;
  name: string;
  kind: string;
  suggestion?: PermissionUpdate;
}

export interface PermissionContext {
  blockedPath?: string;
  decisionReason?: string;
  agentID?: string;
  suggestions?: PermissionUpdate[];
}

// =============================================================================
// Error Types
// =============================================================================

export type SDKErrorType =
  | 'authentication_failed'
  | 'billing_error'
  | 'rate_limit'
  | 'invalid_request'
  | 'server_error'
  | 'unknown';

// =============================================================================
// Task/Notification Types
// =============================================================================

export interface TaskNotification {
  taskId: string;
  status: 'completed' | 'failed' | 'stopped';
  outputFile: string;
  summary: string;
}

// =============================================================================
// Context Compaction Types
// =============================================================================

export interface CompactMetadata {
  trigger: 'manual' | 'auto';
  preTokens: number;
}
