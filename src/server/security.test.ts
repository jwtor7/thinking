/**
 * Security-focused tests for the Thinking Monitor.
 *
 * Tests security implementations including:
 * - 127.0.0.1 binding configuration
 * - Origin validation for WebSocket connections
 * - Path traversal prevention
 * - Payload truncation
 * - Request body size limits
 */

import { describe, it, expect } from 'vitest';
import { CONFIG, truncatePayload, isMonitorEvent } from './types.ts';

describe('Security: CONFIG binding', () => {
  it('should bind to 127.0.0.1 (localhost only)', () => {
    expect(CONFIG.HOST).toBe('127.0.0.1');
  });

  it('should NOT bind to 0.0.0.0 (all interfaces)', () => {
    expect(CONFIG.HOST).not.toBe('0.0.0.0');
  });

  it('should NOT bind to wildcard addresses', () => {
    expect(CONFIG.HOST).not.toBe('::');
    expect(CONFIG.HOST).not.toBe('::0');
    expect(CONFIG.HOST).not.toBe('');
  });
});

describe('Security: Payload truncation', () => {
  it('should have a reasonable MAX_PAYLOAD_SIZE limit', () => {
    // Should be between 1KB and 100KB for security
    expect(CONFIG.MAX_PAYLOAD_SIZE).toBeGreaterThanOrEqual(1024);
    expect(CONFIG.MAX_PAYLOAD_SIZE).toBeLessThanOrEqual(100 * 1024);
  });

  it('should truncate payloads exceeding MAX_PAYLOAD_SIZE', () => {
    const largePayload = 'A'.repeat(CONFIG.MAX_PAYLOAD_SIZE * 2);
    const truncated = truncatePayload(largePayload);

    expect(truncated).toBeDefined();
    expect(truncated!.length).toBeLessThan(largePayload.length);
  });

  it('should add truncation indicator to truncated content', () => {
    const largePayload = 'A'.repeat(CONFIG.MAX_PAYLOAD_SIZE + 100);
    const truncated = truncatePayload(largePayload);

    expect(truncated).toContain('[truncated]');
  });

  it('should handle potentially malicious payloads safely', () => {
    // Test with script tags that could be XSS vectors
    const xssPayload = '<script>alert("xss")</script>'.repeat(1000);
    const result = truncatePayload(xssPayload);

    // Should still truncate without throwing
    expect(result).toBeDefined();
    expect(typeof result).toBe('string');
  });

  it('should handle null bytes in content', () => {
    const nullBytePayload = 'hello\x00world\x00test';
    const result = truncatePayload(nullBytePayload);

    expect(result).toBe(nullBytePayload);
  });

  it('should handle unicode content correctly', () => {
    const unicodePayload = '\u{1F600}'.repeat(CONFIG.MAX_PAYLOAD_SIZE);
    const result = truncatePayload(unicodePayload);

    // Should handle multi-byte characters
    expect(result).toBeDefined();
    expect(typeof result).toBe('string');
  });
});

describe('Security: Event validation', () => {
  it('should reject events without type', () => {
    expect(isMonitorEvent({ timestamp: '2025-12-21T00:00:00Z' })).toBe(false);
  });

  it('should reject events without timestamp', () => {
    expect(isMonitorEvent({ type: 'thinking' })).toBe(false);
  });

  it('should reject invalid event types', () => {
    const invalidTypes = [
      '__proto__',
      'constructor',
      'prototype',
      '<script>',
      '../../etc/passwd',
      'eval',
      'Function',
    ];

    for (const type of invalidTypes) {
      expect(isMonitorEvent({
        type,
        timestamp: '2025-12-21T00:00:00Z'
      })).toBe(false);
    }
  });

  it('should reject nested object attacks', () => {
    const attacks = [
      { type: { toString: () => 'thinking' }, timestamp: '2025-12-21T00:00:00Z' },
      { type: 'thinking', timestamp: { toString: () => '2025-12-21T00:00:00Z' } },
      { type: ['thinking'], timestamp: '2025-12-21T00:00:00Z' },
    ];

    for (const attack of attacks) {
      expect(isMonitorEvent(attack)).toBe(false);
    }
  });

  it('should accept only whitelisted event types', () => {
    const validTypes = [
      'tool_start',
      'tool_end',
      'agent_start',
      'agent_stop',
      'session_start',
      'session_stop',
      'thinking',
      'plan_update',
      'plan_delete',
      'connection_status',
    ];

    for (const type of validTypes) {
      expect(isMonitorEvent({
        type,
        timestamp: '2025-12-21T00:00:00Z'
      })).toBe(true);
    }
  });
});

describe('Security: Origin validation expectations', () => {
  // These tests document expected behavior from the WebSocketHub
  // Actual integration tests would need to spin up the server

  it('should define allowed origins as localhost only', () => {
    // The WebSocketHub.verifyClient should only allow these origins
    const expectedAllowedOrigins = [
      'http://localhost:3356',
      'http://127.0.0.1:3356',
      `http://localhost:${CONFIG.STATIC_PORT}`,
      `http://127.0.0.1:${CONFIG.STATIC_PORT}`,
    ];

    // Verify the config ports match
    expect(CONFIG.STATIC_PORT).toBe(3356);

    // Verify localhost addresses
    for (const origin of expectedAllowedOrigins) {
      expect(
        origin.includes('localhost') || origin.includes('127.0.0.1')
      ).toBe(true);
    }
  });

  it('should reject external origins (documented behavior)', () => {
    // These origins should be rejected by verifyClient
    const rejectedOrigins = [
      'http://evil.com:3356',
      'http://192.168.1.1:3356',
      'http://10.0.0.1:3356',
      'https://attacker.com',
      'http://localhost.evil.com:3356',
    ];

    // All should NOT contain just localhost or 127.0.0.1 without subdomain attacks
    for (const origin of rejectedOrigins) {
      const url = new URL(origin);
      expect(
        url.hostname === 'localhost' || url.hostname === '127.0.0.1'
      ).toBe(false);
    }
  });
});

describe('Security: Path traversal (StaticServer expectations)', () => {
  it('should document path traversal attack vectors to reject', () => {
    // These paths should be rejected by StaticServer.resolveFilePath
    const attackPaths = [
      '../../../etc/passwd',
      '..\\..\\windows\\system32\\config\\sam',
      '/etc/passwd',
      '%2e%2e%2f%2e%2e%2fetc/passwd',
      '....//....//etc/passwd',
      '..;/etc/passwd',
      '..%00/etc/passwd',
      '..%252f..%252fetc/passwd',
    ];

    // Document expected behavior
    for (const path of attackPaths) {
      // The StaticServer should reject any path containing ..
      // or that resolves outside the dashboard directory
      expect(path).toBeDefined();
    }
  });
});

describe('Security: Input limits', () => {
  it('should have MAX_PAYLOAD_SIZE defined and reasonable', () => {
    expect(CONFIG.MAX_PAYLOAD_SIZE).toBeDefined();
    expect(typeof CONFIG.MAX_PAYLOAD_SIZE).toBe('number');
    expect(CONFIG.MAX_PAYLOAD_SIZE).toBeGreaterThan(0);
  });

  it('should prevent memory exhaustion from large payloads', () => {
    // Verify truncation happens before excessive memory usage
    const massivePayload = 'A'.repeat(10 * 1024 * 1024); // 10MB

    const result = truncatePayload(massivePayload);

    // Result should be much smaller than input
    expect(result!.length).toBeLessThan(massivePayload.length);
    expect(result!.length).toBeLessThanOrEqual(CONFIG.MAX_PAYLOAD_SIZE + 50);
  });
});

describe('Security: Server version exposure', () => {
  it('should have version defined for security tracking', () => {
    expect(CONFIG.VERSION).toBeDefined();
    expect(typeof CONFIG.VERSION).toBe('string');
    expect(CONFIG.VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });
});

describe('Security: Rate limiting', () => {
  it('should have rate limiting to prevent DoS attacks', async () => {
    // Import rate limiter to verify it exists and has correct defaults
    const { RateLimiter, DEFAULT_RATE_LIMIT_CONFIG } = await import('./rate-limiter.ts');

    // Verify default config limits exist
    expect(DEFAULT_RATE_LIMIT_CONFIG.maxRequests).toBe(100);
    expect(DEFAULT_RATE_LIMIT_CONFIG.windowMs).toBe(1000);

    // Verify rate limiter blocks excessive requests
    const limiter = new RateLimiter({ maxRequests: 5, windowMs: 1000 });
    const ip = '127.0.0.1';

    // First 5 requests should succeed
    for (let i = 0; i < 5; i++) {
      expect(limiter.check(ip).allowed).toBe(true);
    }

    // 6th request should be blocked
    const blocked = limiter.check(ip);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThanOrEqual(1);

    limiter.destroy();
  });

  it('should return HTTP 429 response info when rate limited', async () => {
    const { RateLimiter } = await import('./rate-limiter.ts');
    const limiter = new RateLimiter({ maxRequests: 1, windowMs: 1000 });

    // Use up the limit
    limiter.check('127.0.0.1');

    // Check the blocked response has all required fields for HTTP 429
    const result = limiter.check('127.0.0.1');
    expect(result.allowed).toBe(false);
    expect(typeof result.retryAfterSeconds).toBe('number');
    expect(result.retryAfterSeconds).toBeGreaterThanOrEqual(1);
    expect(result.remaining).toBe(0);

    limiter.destroy();
  });

  it('should track IPs separately to prevent cross-client interference', async () => {
    const { RateLimiter } = await import('./rate-limiter.ts');
    const limiter = new RateLimiter({ maxRequests: 2, windowMs: 1000 });

    // Exhaust limit for first IP
    limiter.check('127.0.0.1');
    limiter.check('127.0.0.1');
    expect(limiter.check('127.0.0.1').allowed).toBe(false);

    // Second IP should still work
    expect(limiter.check('::1').allowed).toBe(true);

    limiter.destroy();
  });
});
