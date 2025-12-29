import { describe, it, expect } from 'vitest';
import { parseJsonRpcMessage, formatJsonRpcMessage } from '../src/jsonrpc';

describe('JSON-RPC Utils', () => {
  it('should parse valid JSON-RPC messages', () => {
    const valid = '{"jsonrpc": "2.0", "method": "test", "params": [1], "id": 1}';
    const result = parseJsonRpcMessage(valid);
    expect(result).not.toBeNull();
    expect((result as any).method).toBe('test');
  });

  it('should reject messages with newlines', () => {
    const invalid = '{"jsonrpc": "2.0", \n "method": "test"}';
    expect(() => parseJsonRpcMessage(invalid)).toThrow('Message contains embedded newlines');
  });

  it('should format message without newlines', () => {
    const msg = { jsonrpc: '2.0', method: 'test', params: { a: 1 }, id: 1 } as any;
    const result = formatJsonRpcMessage(msg);
    expect(result).not.toContain('\n');
    expect(JSON.parse(result)).toEqual(msg);
  });
});
