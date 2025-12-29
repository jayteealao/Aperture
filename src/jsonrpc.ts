/**
 * JSON-RPC 2.0 utilities for ACP protocol
 *
 * ACP over stdio uses newline-delimited JSON-RPC.
 * Each message must be a single JSON object on one line.
 */

export interface JsonRpcRequest {
  jsonrpc: '2.0';
  method: string;
  params?: unknown;
  id?: string | number | null;
}

export interface JsonRpcResponse {
  jsonrpc: '2.0';
  result?: unknown;
  error?: JsonRpcError;
  id: string | number | null;
}

export interface JsonRpcError {
  code: number;
  message: string;
  data?: unknown;
}

export interface JsonRpcNotification {
  jsonrpc: '2.0';
  method: string;
  params?: unknown;
}

export type JsonRpcMessage = JsonRpcRequest | JsonRpcResponse | JsonRpcNotification;

/**
 * Validates that a message is valid JSON-RPC
 */
export function validateJsonRpcMessage(obj: unknown): obj is JsonRpcMessage {
  if (typeof obj !== 'object' || obj === null) {
    return false;
  }

  const msg = obj as Record<string, unknown>;

  // Must have jsonrpc: "2.0"
  if (msg.jsonrpc !== '2.0') {
    return false;
  }

  // Must have a method (request/notification) or result/error (response)
  const hasMethod = typeof msg.method === 'string';
  const hasResult = 'result' in msg;
  const hasError = 'error' in msg;
  const hasId = 'id' in msg;

  // Request: has method and id
  // Notification: has method, no id
  // Response: has id and (result or error)
  if (hasMethod) {
    return true; // request or notification
  }

  if (hasId && (hasResult || hasError)) {
    return true; // response
  }

  return false;
}

/**
 * Checks if a JSON-RPC message is a request (has id)
 */
export function isRequest(msg: JsonRpcMessage): msg is JsonRpcRequest {
  return 'id' in msg && msg.id !== undefined && 'method' in msg;
}

/**
 * Checks if a JSON-RPC message is a notification (no id)
 */
export function isNotification(msg: JsonRpcMessage): msg is JsonRpcNotification {
  return !('id' in msg) && 'method' in msg;
}

/**
 * Checks if a JSON-RPC message is a response
 */
export function isResponse(msg: JsonRpcMessage): msg is JsonRpcResponse {
  return 'id' in msg && !('method' in msg);
}

/**
 * Validates that a string contains no embedded newlines (critical for stdio framing)
 */
export function validateSingleLine(str: string): void {
  if (str.includes('\n') || str.includes('\r')) {
    throw new Error('JSON-RPC messages must not contain embedded newlines');
  }
}

/**
 * Serializes a JSON-RPC message to a single line with newline terminator
 */
export function serializeMessage(msg: JsonRpcMessage): string {
  const json = JSON.stringify(msg);
  validateSingleLine(json);
  return json + '\n';
}

/**
 * Parses a single-line JSON-RPC message
 */
export function parseMessage(line: string): JsonRpcMessage {
  const trimmed = line.trim();
  if (!trimmed) {
    throw new Error('Empty message');
  }

  let obj: unknown;
  try {
    obj = JSON.parse(trimmed);
  } catch (err) {
    throw new Error(`Invalid JSON: ${(err as Error).message}`);
  }

  if (!validateJsonRpcMessage(obj)) {
    throw new Error('Invalid JSON-RPC message');
  }

  return obj;
}

/**
 * Creates a JSON-RPC error response
 */
export function createErrorResponse(
  id: string | number | null,
  code: number,
  message: string,
  data?: unknown
): JsonRpcResponse {
  return {
    jsonrpc: '2.0',
    id,
    error: {
      code,
      message,
      data,
    },
  };
}

/**
 * Standard JSON-RPC error codes
 */
export const ErrorCodes = {
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,
  SERVER_ERROR: -32000,
  TIMEOUT: -32001,
} as const;
