/**
 * Tests for the rate limiter.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { RateLimiter, DEFAULT_RATE_LIMIT_CONFIG } from './rate-limiter.ts';

describe('RateLimiter', () => {
  let limiter: RateLimiter;

  afterEach(() => {
    limiter?.destroy();
  });

  describe('basic functionality', () => {
    beforeEach(() => {
      limiter = new RateLimiter({
        maxRequests: 5,
        windowMs: 1000,
        cleanupIntervalMs: 60000,
      });
    });

    it('should allow requests under the limit', () => {
      const ip = '127.0.0.1';

      for (let i = 0; i < 5; i++) {
        const result = limiter.check(ip);
        expect(result.allowed).toBe(true);
        expect(result.remaining).toBe(4 - i);
      }
    });

    it('should block requests over the limit', () => {
      const ip = '127.0.0.1';

      // Use up all allowed requests
      for (let i = 0; i < 5; i++) {
        limiter.check(ip);
      }

      // Next request should be blocked
      const result = limiter.check(ip);
      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
      expect(result.retryAfterSeconds).toBeGreaterThanOrEqual(1);
    });

    it('should track different IPs separately', () => {
      const ip1 = '127.0.0.1';
      const ip2 = '::1';

      // Use up limit for ip1
      for (let i = 0; i < 5; i++) {
        limiter.check(ip1);
      }

      // ip1 should be blocked
      expect(limiter.check(ip1).allowed).toBe(false);

      // ip2 should still be allowed
      expect(limiter.check(ip2).allowed).toBe(true);
    });

    it('should report correct request count', () => {
      const ip = '127.0.0.1';

      expect(limiter.getRequestCount(ip)).toBe(0);

      limiter.check(ip);
      expect(limiter.getRequestCount(ip)).toBe(1);

      limiter.check(ip);
      limiter.check(ip);
      expect(limiter.getRequestCount(ip)).toBe(3);
    });
  });

  describe('sliding window behavior', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      limiter = new RateLimiter({
        maxRequests: 5,
        windowMs: 1000,
        cleanupIntervalMs: 60000,
      });
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should reset limit after window expires', () => {
      const ip = '127.0.0.1';

      // Use up all requests
      for (let i = 0; i < 5; i++) {
        limiter.check(ip);
      }
      expect(limiter.check(ip).allowed).toBe(false);

      // Advance time past the window
      vi.advanceTimersByTime(1001);

      // Should be allowed again
      const result = limiter.check(ip);
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(4);
    });

    it('should use sliding window (not fixed window)', () => {
      const ip = '127.0.0.1';

      // Make 3 requests at t=0
      for (let i = 0; i < 3; i++) {
        limiter.check(ip);
      }

      // Advance 500ms
      vi.advanceTimersByTime(500);

      // Make 2 more requests at t=500
      for (let i = 0; i < 2; i++) {
        limiter.check(ip);
      }

      // Should be blocked (5 requests within last 1000ms)
      expect(limiter.check(ip).allowed).toBe(false);

      // Advance 501ms (now at t=1001)
      // The first 3 requests should have expired
      vi.advanceTimersByTime(501);

      // Should be allowed again (only 2 requests from t=500 still in window)
      const result = limiter.check(ip);
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(2); // 5 - 2 existing - 1 new = 2
    });
  });

  describe('reset functionality', () => {
    beforeEach(() => {
      limiter = new RateLimiter({
        maxRequests: 3,
        windowMs: 1000,
      });
    });

    it('should reset limit for specific IP', () => {
      const ip = '127.0.0.1';

      // Use up all requests
      for (let i = 0; i < 3; i++) {
        limiter.check(ip);
      }
      expect(limiter.check(ip).allowed).toBe(false);

      // Reset
      limiter.reset(ip);

      // Should be allowed again
      expect(limiter.check(ip).allowed).toBe(true);
    });

    it('should reset all limits', () => {
      const ip1 = '127.0.0.1';
      const ip2 = '::1';

      // Use up limits for both IPs
      for (let i = 0; i < 3; i++) {
        limiter.check(ip1);
        limiter.check(ip2);
      }

      expect(limiter.check(ip1).allowed).toBe(false);
      expect(limiter.check(ip2).allowed).toBe(false);

      // Reset all
      limiter.resetAll();

      // Both should be allowed
      expect(limiter.check(ip1).allowed).toBe(true);
      expect(limiter.check(ip2).allowed).toBe(true);
    });
  });

  describe('cleanup', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should clean up stale entries', () => {
      limiter = new RateLimiter({
        maxRequests: 5,
        windowMs: 1000,
        cleanupIntervalMs: 1000,
      });

      const ip = '127.0.0.1';
      limiter.check(ip);

      // Verify entry exists
      expect(limiter.getRequestCount(ip)).toBe(1);

      // Advance time past cleanup threshold (10x window duration = 10s)
      vi.advanceTimersByTime(15000);

      // Entry should have been cleaned up, so count should be 0
      expect(limiter.getRequestCount(ip)).toBe(0);
    });
  });

  describe('default configuration', () => {
    it('should use default config values', () => {
      expect(DEFAULT_RATE_LIMIT_CONFIG.maxRequests).toBe(100);
      expect(DEFAULT_RATE_LIMIT_CONFIG.windowMs).toBe(1000);
      expect(DEFAULT_RATE_LIMIT_CONFIG.cleanupIntervalMs).toBe(60000);
    });

    it('should work with default config', () => {
      limiter = new RateLimiter();
      const ip = '127.0.0.1';

      // Should allow up to 100 requests
      for (let i = 0; i < 100; i++) {
        expect(limiter.check(ip).allowed).toBe(true);
      }

      // 101st should be blocked
      expect(limiter.check(ip).allowed).toBe(false);
    });
  });

  describe('retry-after calculation', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      limiter = new RateLimiter({
        maxRequests: 2,
        windowMs: 2000,
      });
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should provide correct retry-after value', () => {
      const ip = '127.0.0.1';

      // Make 2 requests at t=0
      limiter.check(ip);
      limiter.check(ip);

      // Advance 500ms
      vi.advanceTimersByTime(500);

      // Request should be blocked with ~1.5s retry-after (rounded up to 2)
      const result = limiter.check(ip);
      expect(result.allowed).toBe(false);
      expect(result.retryAfterSeconds).toBe(2);
    });

    it('should return at least 1 second for retry-after', () => {
      const ip = '127.0.0.1';

      // Use up limit
      limiter.check(ip);
      limiter.check(ip);

      // Advance to just before window expires
      vi.advanceTimersByTime(1999);

      const result = limiter.check(ip);
      expect(result.allowed).toBe(false);
      expect(result.retryAfterSeconds).toBeGreaterThanOrEqual(1);
    });
  });

  describe('edge cases', () => {
    beforeEach(() => {
      limiter = new RateLimiter({
        maxRequests: 5,
        windowMs: 1000,
      });
    });

    it('should handle empty IP string', () => {
      const result = limiter.check('');
      expect(result.allowed).toBe(true);
    });

    it('should handle IPv6 addresses', () => {
      const ip = '::ffff:127.0.0.1';
      const result = limiter.check(ip);
      expect(result.allowed).toBe(true);
    });

    it('should handle non-existent IP in getRequestCount', () => {
      expect(limiter.getRequestCount('nonexistent')).toBe(0);
    });

    it('should handle reset on non-existent IP', () => {
      // Should not throw
      expect(() => limiter.reset('nonexistent')).not.toThrow();
    });

    it('should handle destroy being called multiple times', () => {
      limiter.destroy();
      expect(() => limiter.destroy()).not.toThrow();
    });
  });
});

describe('RateLimiter integration with EventReceiver', () => {
  /**
   * These tests verify the rate limiter behavior in the context
   * of the EventReceiver's usage patterns.
   */

  let limiter: RateLimiter;

  beforeEach(() => {
    // Use the same config as EventReceiver default
    limiter = new RateLimiter({
      maxRequests: 100,
      windowMs: 1000,
      cleanupIntervalMs: 60000,
    });
  });

  afterEach(() => {
    limiter.destroy();
  });

  it('should handle burst of events within limit', () => {
    const ip = '127.0.0.1';

    // Simulate rapid event posting (50 events)
    for (let i = 0; i < 50; i++) {
      expect(limiter.check(ip).allowed).toBe(true);
    }
  });

  it('should block flood attack simulation', () => {
    const ip = '127.0.0.1';

    // Simulate flood (200 events rapidly)
    let blockedCount = 0;
    for (let i = 0; i < 200; i++) {
      if (!limiter.check(ip).allowed) {
        blockedCount++;
      }
    }

    // Should have blocked ~100 requests (200 - 100 allowed)
    expect(blockedCount).toBe(100);
  });

  it('should provide meaningful error response info', () => {
    const ip = '127.0.0.1';

    // Exhaust limit
    for (let i = 0; i < 100; i++) {
      limiter.check(ip);
    }

    const result = limiter.check(ip);

    // Verify all fields needed for HTTP 429 response
    expect(result.allowed).toBe(false);
    expect(typeof result.retryAfterSeconds).toBe('number');
    expect(result.retryAfterSeconds).toBeGreaterThanOrEqual(1);
    expect(result.remaining).toBe(0);
  });
});
