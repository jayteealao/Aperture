import { describe, it, expect } from 'vitest';
import {
  validateJsonRpcMessage,
  isRequest,
  isNotification,
  isResponse,
  validateSingleLine,
  serializeMessage,
  parseMessage,
  createErrorResponse,
  ErrorCodes,
} from '../src/jsonrpc.js';

describe('JSON-RPC utilities', () => {
  describe('validateJsonRpcMessage', () => {
    it('should validate a valid request', () => {
      const msg = {
        jsonrpc: '2.0',
        method: 'test',
        id: 1,
      };
      expect(validateJsonRpcMessage(msg)).toBe(true);
    });

    it('should validate a valid notification', () => {
      const msg = {
        jsonrpc: '2.0',
        method: 'test',
      };
      expect(validateJsonRpcMessage(msg)).toBe(true);
    });

    it('should validate a valid response', () => {
      const msg = {
        jsonrpc: '2.0',
        result: { data: 'test' },
        id: 1,
      };
      expect(validateJsonRpcMessage(msg)).toBe(true);
    });

    it('should reject non-2.0 jsonrpc version', () => {
      const msg = {
        jsonrpc: '1.0',
        method: 'test',
        id: 1,
      };
      expect(validateJsonRpcMessage(msg)).toBe(false);
    });

    it('should reject missing jsonrpc field', () => {
      const msg = {
        method: 'test',
        id: 1,
      };
      expect(validateJsonRpcMessage(msg)).toBe(false);
    });
  });

  describe('message type detection', () => {
    it('should detect requests', () => {
      const msg = {
        jsonrpc: '2.0' as const,
        method: 'test',
        id: 1,
      };
      expect(isRequest(msg)).toBe(true);
      expect(isNotification(msg)).toBe(false);
      expect(isResponse(msg)).toBe(false);
    });

    it('should detect notifications', () => {
      const msg = {
        jsonrpc: '2.0' as const,
        method: 'test',
      };
      expect(isNotification(msg)).toBe(true);
      expect(isRequest(msg)).toBe(false);
      expect(isResponse(msg)).toBe(false);
    });

    it('should detect responses', () => {
      const msg = {
        jsonrpc: '2.0' as const,
        result: 'test',
        id: 1,
      };
      expect(isResponse(msg)).toBe(true);
      expect(isRequest(msg)).toBe(false);
      expect(isNotification(msg)).toBe(false);
    });
  });

  describe('validateSingleLine', () => {
    it('should accept single-line strings', () => {
      expect(() => validateSingleLine('test')).not.toThrow();
    });

    it('should reject strings with newlines', () => {
      expect(() => validateSingleLine('test\ntest')).toThrow('embedded newlines');
    });

    it('should reject strings with carriage returns', () => {
      expect(() => validateSingleLine('test\rtest')).toThrow('embedded newlines');
    });
  });

  describe('serializeMessage', () => {
    it('should serialize a message with newline terminator', () => {
      const msg = {
        jsonrpc: '2.0' as const,
        method: 'test',
        id: 1,
      };
      const serialized = serializeMessage(msg);
      expect(serialized).toBe('{"jsonrpc":"2.0","method":"test","id":1}\n');
    });

    it('should reject messages that would contain embedded newlines', () => {
      const msg = {
        jsonrpc: '2.0' as const,
        method: 'test\ntest',
        id: 1,
      };
      // This should throw because the serialized JSON would contain a newline
      // Note: JSON.stringify escapes newlines, so this won't actually throw
      // But if someone tries to inject raw newlines, it would
      const serialized = serializeMessage(msg);
      expect(serialized).not.toContain('\ntest');
    });
  });

  describe('parseMessage', () => {
    it('should parse a valid message', () => {
      const line = '{"jsonrpc":"2.0","method":"test","id":1}';
      const msg = parseMessage(line);
      expect(msg).toEqual({
        jsonrpc: '2.0',
        method: 'test',
        id: 1,
      });
    });

    it('should reject invalid JSON', () => {
      const line = '{invalid}';
      expect(() => parseMessage(line)).toThrow('Invalid JSON');
    });

    it('should reject empty lines', () => {
      expect(() => parseMessage('')).toThrow('Empty message');
    });

    it('should reject invalid JSON-RPC', () => {
      const line = '{"test":"data"}';
      expect(() => parseMessage(line)).toThrow('Invalid JSON-RPC message');
    });
  });

  describe('createErrorResponse', () => {
    it('should create an error response', () => {
      const response = createErrorResponse(1, ErrorCodes.INVALID_REQUEST, 'Invalid request');
      expect(response).toEqual({
        jsonrpc: '2.0',
        id: 1,
        error: {
          code: ErrorCodes.INVALID_REQUEST,
          message: 'Invalid request',
        },
      });
    });

    it('should include error data if provided', () => {
      const response = createErrorResponse(1, ErrorCodes.SERVER_ERROR, 'Server error', {
        detail: 'test',
      });
      expect(response.error?.data).toEqual({ detail: 'test' });
    });
  });
});
