/**
 * Unit tests for the File Actions module.
 *
 * Tests security measures, request validation, and file action handling.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { IncomingMessage, ServerResponse } from 'node:http';
import { Readable, Writable } from 'node:stream';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

// Mock child_process to avoid actually executing commands
vi.mock('node:child_process', () => ({
  spawn: vi.fn(() => {
    const handlers: Record<string, (code?: number) => void> = {};
    return {
      on: vi.fn((event: string, callback: (code?: number) => void) => {
        handlers[event] = callback;
        // Simulate successful exit
        if (event === 'close') {
          process.nextTick(() => callback(0));
        }
      }),
    };
  }),
}));

// Import after mocking
import { handleFileActionRequest, isAllowedPath } from './file-actions.ts';

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

    it('should reject paths outside ~/.claude/ directory', async () => {
      const req = createMockRequest('POST', '/file-action', {
        action: 'open',
        path: '/tmp/any-file.md',
      });
      const res = createMockResponse();

      await handleFileActionRequest(req, res);

      expect(res._statusCode).toBe(400);
      const body = JSON.parse(res._body);
      expect(body.error).toContain('Access denied');
    });

    it('should reject paths in home directory outside .claude', async () => {
      const req = createMockRequest('POST', '/file-action', {
        action: 'open',
        path: join(homedir(), '.ssh', 'id_rsa'),
      });
      const res = createMockResponse();

      await handleFileActionRequest(req, res);

      expect(res._statusCode).toBe(400);
      const body = JSON.parse(res._body);
      expect(body.error).toContain('Access denied');
    });

    it('should reject system paths', async () => {
      const req = createMockRequest('POST', '/file-action', {
        action: 'open',
        path: '/etc/passwd',
      });
      const res = createMockResponse();

      await handleFileActionRequest(req, res);

      expect(res._statusCode).toBe(400);
      const body = JSON.parse(res._body);
      expect(body.error).toContain('Access denied');
    });

    it('should reject paths starting with similar names to .claude', async () => {
      const req = createMockRequest('POST', '/file-action', {
        action: 'open',
        path: join(homedir(), '.claude-backup', 'file.txt'),
      });
      const res = createMockResponse();

      await handleFileActionRequest(req, res);

      expect(res._statusCode).toBe(400);
      const body = JSON.parse(res._body);
      expect(body.error).toContain('Access denied');
    });

    it('should reject traversal attempts that escape ~/.claude/', async () => {
      const req = createMockRequest('POST', '/file-action', {
        action: 'open',
        path: join(homedir(), '.claude', '..', '.ssh', 'id_rsa'),
      });
      const res = createMockResponse();

      await handleFileActionRequest(req, res);

      expect(res._statusCode).toBe(400);
      const body = JSON.parse(res._body);
      expect(body.error).toContain('Access denied');
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

/**
 * Dedicated tests for the isAllowedPath function.
 * These test the path validation logic independently of the HTTP handler.
 */
describe('isAllowedPath', () => {
  const HOME = homedir();
  const CLAUDE_DIR = resolve(HOME, '.claude');

  describe('valid paths within ~/.claude/', () => {
    it('should allow the ~/.claude/ directory itself', () => {
      expect(isAllowedPath(CLAUDE_DIR)).toBe(true);
    });

    it('should allow files directly in ~/.claude/', () => {
      expect(isAllowedPath(`${CLAUDE_DIR}/CLAUDE.md`)).toBe(true);
      expect(isAllowedPath(`${CLAUDE_DIR}/settings.json`)).toBe(true);
    });

    it('should allow files in subdirectories of ~/.claude/', () => {
      expect(isAllowedPath(`${CLAUDE_DIR}/plans/some-plan.md`)).toBe(true);
      expect(isAllowedPath(`${CLAUDE_DIR}/logs/session.log`)).toBe(true);
      expect(isAllowedPath(`${CLAUDE_DIR}/deep/nested/path/file.txt`)).toBe(true);
    });

    it('should allow paths with trailing slashes', () => {
      expect(isAllowedPath(`${CLAUDE_DIR}/`)).toBe(true);
      expect(isAllowedPath(`${CLAUDE_DIR}/plans/`)).toBe(true);
    });
  });

  describe('invalid paths outside ~/.claude/', () => {
    it('should reject paths in home directory outside .claude', () => {
      expect(isAllowedPath(`${HOME}/.ssh/id_rsa`)).toBe(false);
      expect(isAllowedPath(`${HOME}/.zshrc`)).toBe(false);
      expect(isAllowedPath(`${HOME}/Documents/secret.txt`)).toBe(false);
    });

    it('should reject system paths', () => {
      expect(isAllowedPath('/etc/passwd')).toBe(false);
      expect(isAllowedPath('/var/log/system.log')).toBe(false);
      expect(isAllowedPath('/usr/bin/bash')).toBe(false);
    });

    it('should reject paths starting with similar names', () => {
      // Ensure we don't accidentally allow ~/.claudeXXX directories
      expect(isAllowedPath(`${HOME}/.claude-backup/file.txt`)).toBe(false);
      expect(isAllowedPath(`${HOME}/.clauderc`)).toBe(false);
      expect(isAllowedPath(`${HOME}/.claude_old/file.txt`)).toBe(false);
    });

    it('should reject the parent directory', () => {
      expect(isAllowedPath(HOME)).toBe(false);
      expect(isAllowedPath(`${HOME}/`)).toBe(false);
    });
  });

  describe('traversal attempts', () => {
    it('should reject path traversal to escape ~/.claude/', () => {
      expect(isAllowedPath(`${CLAUDE_DIR}/../.ssh/id_rsa`)).toBe(false);
      expect(isAllowedPath(`${CLAUDE_DIR}/../.zshrc`)).toBe(false);
    });

    it('should reject multiple traversal attempts', () => {
      expect(isAllowedPath(`${CLAUDE_DIR}/../../etc/passwd`)).toBe(false);
      expect(isAllowedPath(`${CLAUDE_DIR}/../../../var/log/system.log`)).toBe(false);
    });

    it('should reject traversal in the middle of path', () => {
      expect(isAllowedPath(`${CLAUDE_DIR}/plans/../../../.ssh/id_rsa`)).toBe(false);
    });

    it('should allow traversal that stays within ~/.claude/', () => {
      // This should be allowed because after normalization it's still inside ~/.claude/
      expect(isAllowedPath(`${CLAUDE_DIR}/plans/../logs/session.log`)).toBe(true);
      expect(isAllowedPath(`${CLAUDE_DIR}/a/b/../c/file.txt`)).toBe(true);
    });
  });

  describe('edge cases', () => {
    it('should reject empty path', () => {
      expect(isAllowedPath('')).toBe(false);
    });

    it('should reject non-absolute paths', () => {
      expect(isAllowedPath('.claude/file.txt')).toBe(false);
      expect(isAllowedPath('~/.claude/file.txt')).toBe(false); // Tilde is not expanded
      expect(isAllowedPath('relative/path.txt')).toBe(false);
    });

    it('should reject null and undefined', () => {
      expect(isAllowedPath(null as unknown as string)).toBe(false);
      expect(isAllowedPath(undefined as unknown as string)).toBe(false);
    });

    it('should reject non-string types', () => {
      expect(isAllowedPath(123 as unknown as string)).toBe(false);
      expect(isAllowedPath({} as unknown as string)).toBe(false);
      expect(isAllowedPath([] as unknown as string)).toBe(false);
    });

    it('should handle paths with special characters', () => {
      expect(isAllowedPath(`${CLAUDE_DIR}/file with spaces.txt`)).toBe(true);
      expect(isAllowedPath(`${CLAUDE_DIR}/file-with-dashes.txt`)).toBe(true);
      expect(isAllowedPath(`${CLAUDE_DIR}/file_with_underscores.txt`)).toBe(true);
    });

    it('should handle paths with dots in filenames', () => {
      expect(isAllowedPath(`${CLAUDE_DIR}/.hidden-file`)).toBe(true);
      expect(isAllowedPath(`${CLAUDE_DIR}/file.name.with.dots.txt`)).toBe(true);
    });

    it('should handle double slashes', () => {
      expect(isAllowedPath(`${CLAUDE_DIR}//file.txt`)).toBe(true);
      expect(isAllowedPath(`${CLAUDE_DIR}/plans//nested/file.txt`)).toBe(true);
    });
  });
});
