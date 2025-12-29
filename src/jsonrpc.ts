import { z } from 'zod';

export interface JsonRpcRequest {
  jsonrpc: '2.0';
  method: string;
  params?: any;
  id?: string | number | null;
}

export interface JsonRpcResponse {
  jsonrpc: '2.0';
  result?: any;
  error?: {
    code: number;
    message: string;
    data?: any;
  };
  id: string | number | null;
}

export interface JsonRpcNotification {
  jsonrpc: '2.0';
  method: string;
  params?: any;
}

export type JsonRpcMessage = JsonRpcRequest | JsonRpcResponse | JsonRpcNotification;

export const JsonRpcMessageSchema = z.object({
  jsonrpc: z.literal('2.0'),
  method: z.string().optional(),
  params: z.any().optional(),
  result: z.any().optional(),
  error: z.object({
    code: z.number(),
    message: z.string(),
    data: z.any().optional(),
  }).optional(),
  id: z.union([z.string(), z.number(), z.null()]).optional(),
});

export function parseJsonRpcMessage(line: string): JsonRpcMessage | null {
  if (line.includes('\n')) {
    throw new Error('Message contains embedded newlines, which breaks framing.');
  }
  try {
    const parsed = JSON.parse(line);
    const result = JsonRpcMessageSchema.safeParse(parsed);
    if (result.success) {
      return result.data as JsonRpcMessage;
    }
    return null;
  } catch (e) {
    return null;
  }
}

export function formatJsonRpcMessage(message: JsonRpcMessage): string {
  const str = JSON.stringify(message);
  if (str.includes('\n')) {
    throw new Error('Serialized message contains newlines, invalid for stdio transport.');
  }
  return str;
}
