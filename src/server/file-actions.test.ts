/**
 * Unit tests for the File Actions module.
 *
 * Tests security measures, request validation, and file action handling.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { IncomingMessage, ServerResponse } from 'node:http';
import { Readable, Writable } from 'node:stream';
import { homedir } from 'node:os';
import { join } from 'node:path';

// Mock child_process to avoid actually executing commands
vi.mock('node:child_process', () => ({
  exec: vi.fn((_cmd, callback) => {
    // Simulate successful execution for valid commands
    if (callback) {
      callback(null, '', '');
    }
  }),
}));

// Import after mocking
import { handleFileActionRequest } from './file-actions.ts';

/**
 * Create a mock HTTP request for testing.
 */
function createMockRequest(
  method: string,
  url: string,
  body?: Record<string, unknown>
): IncomingMessage {
  const readable = new Readable();
  readable._read = () => {};

  const req = readable as unknown as IncomingMessage;
  req.method = method;
  req.url = url;
  req.headers = {};

  // Push body if provided
  if (body) {
    readable.push(JSON.stringify(body));
    readable.push(null);
  } else {
    readable.push(null);
  }

  return req;
}

/**
 * Create a mock HTTP response for testing.
 */
function createMockResponse(): ServerResponse & {
  _statusCode: number;
  _headers: Record<string, string>;
  _body: string;
} {
  let statusCode = 200;
  const headers: Record<string, string> = {};
  let body = '';

  const writable = new Writable({
    write(chunk, _encoding, callback) {
      body += chunk.toString();
      callback();
    },
  });

  const res = writable as unknown as ServerResponse & {
    _statusCode: number;
    _headers: Record<string, string>;
    _body: string;
  };

  // @ts-expect-error - simplified mock signature
  res.writeHead = (code: number, hdrs?: Record<string, string>) => {
    statusCode = code;
    if (hdrs) Object.assign(headers, hdrs);
    return res;
  };

  res.setHeader = (name: string, value: string) => {
    headers[name] = value;
    return res;
  };

  // Expose internal state for assertions
  Object.defineProperty(res, '_statusCode', {
    get: () => statusCode,
  });
  Object.defineProperty(res, '_headers', {
    get: () => headers,
  });
  Object.defineProperty(res, '_body', {
    get: () => body,
  });

  return res;
}

describe('File Actions Handler', () => {
  const plansDir = join(homedir(), '.claude', 'plans');
  const validPlanPath = join(plansDir, 'test-plan.md');

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('URL Routing', () => {
    it('should return false for non-file-action URLs', async () => {
      const req = createMockRequest('POST', '/other-endpoint');
      const res = createMockResponse();

      const handled = await handleFileActionRequest(req, res);

      expect(handled).toBe(false);
    });

    it('should handle /file-action URL', async () => {
      const req = createMockRequest('POST', '/file-action', {
        action: 'open',
        path: validPlanPath,
      });
      const res = createMockResponse();

      const handled = await handleFileActionRequest(req, res);

      expect(handled).toBe(true);
    });
  });

  describe('CORS Headers', () => {
    it('should set CORS headers for localhost dashboard', async () => {
      const req = createMockRequest('POST', '/file-action', {
        action: 'open',
        path: validPlanPath,
      });
      const res = createMockResponse();

      await handleFileActionRequest(req, res);

      expect(res._headers['Access-Control-Allow-Origin']).toBe('http://localhost:3356');
      expect(res._headers['Access-Control-Allow-Methods']).toBe('POST, OPTIONS');
      expect(res._headers['Access-Control-Allow-Headers']).toBe('Content-Type');
    });

    it('should handle OPTIONS preflight requests', async () => {
      const req = createMockRequest('OPTIONS', '/file-action');
      const res = createMockResponse();

      const handled = await handleFileActionRequest(req, res);

      expect(handled).toBe(true);
      expect(res._statusCode).toBe(204);
    });
  });

  describe('Method Validation', () => {
    it('should reject GET requests', async () => {
      const req = createMockRequest('GET', '/file-action');
      const res = createMockResponse();

      await handleFileActionRequest(req, res);

      expect(res._statusCode).toBe(405);
      const body = JSON.parse(res._body);
      expect(body.success).toBe(false);
      expect(body.error).toBe('Method not allowed');
    });

    it('should reject PUT requests', async () => {
      const req = createMockRequest('PUT', '/file-action', {});
      const res = createMockResponse();

      await handleFileActionRequest(req, res);

      expect(res._statusCode).toBe(405);
    });
  });

  describe('Request Body Validation', () => {
    it('should reject invalid JSON body', async () => {
      const readable = new Readable();
      readable._read = () => {};
      readable.push('not valid json');
      readable.push(null);

      const req = readable as unknown as IncomingMessage;
      req.method = 'POST';
      req.url = '/file-action';
      req.headers = {};

      const res = createMockResponse();

      await handleFileActionRequest(req, res);

      expect(res._statusCode).toBe(400);
      const body = JSON.parse(res._body);
      expect(body.error).toBe('Invalid JSON body');
    });

    it('should reject requests with missing action', async () => {
      const req = createMockRequest('POST', '/file-action', {
        path: validPlanPath,
      });
      const res = createMockResponse();

      await handleFileActionRequest(req, res);

      expect(res._statusCode).toBe(400);
      const body = JSON.parse(res._body);
      expect(body.error).toContain('Invalid action');
    });

    it('should reject requests with missing path', async () => {
      const req = createMockRequest('POST', '/file-action', {
        action: 'open',
      });
      const res = createMockResponse();

      await handleFileActionRequest(req, res);

      expect(res._statusCode).toBe(400);
      const body = JSON.parse(res._body);
      expect(body.error).toContain('Invalid path');
    });

    it('should reject invalid action values', async () => {
      const req = createMockRequest('POST', '/file-action', {
        action: 'delete',
        path: validPlanPath,
      });
      const res = createMockResponse();

      await handleFileActionRequest(req, res);

      expect(res._statusCode).toBe(400);
      const body = JSON.parse(res._body);
      expect(body.error).toContain('Invalid action');
    });

    it('should accept "open" action', async () => {
      const req = createMockRequest('POST', '/file-action', {
        action: 'open',
        path: validPlanPath,
      });
      const res = createMockResponse();

      await handleFileActionRequest(req, res);

      expect(res._statusCode).toBe(200);
      const body = JSON.parse(res._body);
      expect(body.success).toBe(true);
    });

    it('should accept "reveal" action', async () => {
      const req = createMockRequest('POST', '/file-action', {
        action: 'reveal',
        path: validPlanPath,
      });
      const res = createMockResponse();

      await handleFileActionRequest(req, res);

      expect(res._statusCode).toBe(200);
      const body = JSON.parse(res._body);
      expect(body.success).toBe(true);
    });
  });

  describe('Path Security Validation', () => {
    it('should reject directory traversal attempts with ..', async () => {
      const req = createMockRequest('POST', '/file-action', {
        action: 'open',
        path: '/Users/test/../../../etc/passwd', // Literal .. in path
      });
      const res = createMockResponse();

      await handleFileActionRequest(req, res);

      expect(res._statusCode).toBe(400);
      const body = JSON.parse(res._body);
      expect(body.error).toContain('Access denied');
    });

    it('should reject deeply nested traversal attempts', async () => {
      const req = createMockRequest('POST', '/file-action', {
        action: 'open',
        path: '/Users/test/../../../etc/passwd',
      });
      const res = createMockResponse();

      await handleFileActionRequest(req, res);

      expect(res._statusCode).toBe(400);
      const body = JSON.parse(res._body);
      expect(body.error).toContain('Access denied');
    });

    it('should reject relative paths', async () => {
      const req = createMockRequest('POST', '/file-action', {
        action: 'open',
        path: 'relative/path/file.md',
      });
      const res = createMockResponse();

      await handleFileActionRequest(req, res);

      expect(res._statusCode).toBe(400);
      const body = JSON.parse(res._body);
      expect(body.error).toContain('absolute path');
    });

    it('should reject empty path', async () => {
      const req = createMockRequest('POST', '/file-action', {
        action: 'open',
        path: '',
      });
      const res = createMockResponse();

      await handleFileActionRequest(req, res);

      expect(res._statusCode).toBe(400);
      const body = JSON.parse(res._body);
      expect(body.error).toContain('Invalid path');
    });

    it('should reject non-string path', async () => {
      const req = createMockRequest('POST', '/file-action', {
        action: 'open',
        path: 123,
      });
      const res = createMockResponse();

      await handleFileActionRequest(req, res);

      expect(res._statusCode).toBe(400);
      const body = JSON.parse(res._body);
      expect(body.error).toContain('Invalid path');
    });

    it('should allow any absolute path (localhost-only tool)', async () => {
      const req = createMockRequest('POST', '/file-action', {
        action: 'open',
        path: '/tmp/any-file.md',
      });
      const res = createMockResponse();

      await handleFileActionRequest(req, res);

      expect(res._statusCode).toBe(200);
      const body = JSON.parse(res._body);
      expect(body.success).toBe(true);
    });
  });

  describe('Valid Paths', () => {
    it('should accept valid plan file path', async () => {
      const req = createMockRequest('POST', '/file-action', {
        action: 'open',
        path: validPlanPath,
      });
      const res = createMockResponse();

      await handleFileActionRequest(req, res);

      expect(res._statusCode).toBe(200);
      const body = JSON.parse(res._body);
      expect(body.success).toBe(true);
    });

    it('should accept nested plan file paths', async () => {
      const req = createMockRequest('POST', '/file-action', {
        action: 'open',
        path: join(plansDir, 'subdir', 'nested-plan.md'),
      });
      const res = createMockResponse();

      await handleFileActionRequest(req, res);

      expect(res._statusCode).toBe(200);
    });

    it('should handle paths with special characters in filenames', async () => {
      const req = createMockRequest('POST', '/file-action', {
        action: 'open',
        path: join(plansDir, 'plan-with-dashes_and_underscores.md'),
      });
      const res = createMockResponse();

      await handleFileActionRequest(req, res);

      expect(res._statusCode).toBe(200);
    });
  });

  describe('Response Format', () => {
    it('should return JSON content type', async () => {
      const req = createMockRequest('POST', '/file-action', {
        action: 'open',
        path: validPlanPath,
      });
      const res = createMockResponse();

      await handleFileActionRequest(req, res);

      expect(res._headers['Content-Type']).toBe('application/json');
    });

    it('should return success: true for valid requests', async () => {
      const req = createMockRequest('POST', '/file-action', {
        action: 'open',
        path: validPlanPath,
      });
      const res = createMockResponse();

      await handleFileActionRequest(req, res);

      const body = JSON.parse(res._body);
      expect(body.success).toBe(true);
      expect(body.error).toBeUndefined();
    });

    it('should return success: false and error message for invalid requests', async () => {
      const req = createMockRequest('POST', '/file-action', {
        action: 'open',
        path: '../etc/passwd', // Uses traversal which is rejected
      });
      const res = createMockResponse();

      await handleFileActionRequest(req, res);

      const body = JSON.parse(res._body);
      expect(body.success).toBe(false);
      expect(body.error).toBeDefined();
    });
  });
});
