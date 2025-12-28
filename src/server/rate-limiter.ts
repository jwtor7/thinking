/**
 * Simple in-memory rate limiter using a sliding window algorithm.
 *
 * Limits requests per IP address to prevent abuse from local processes.
 */

/**
 * Configuration for the rate limiter.
 */
export interface RateLimiterConfig {
  /** Maximum requests allowed per window */
  maxRequests: number;
  /** Window duration in milliseconds */
  windowMs: number;
  /** Cleanup interval in milliseconds (removes stale entries) */
  cleanupIntervalMs?: number;
}

/**
 * Default rate limiter configuration.
 * 100 requests per second per IP.
 */
export const DEFAULT_RATE_LIMIT_CONFIG: RateLimiterConfig = {
  maxRequests: 100,
  windowMs: 1000, // 1 second
  cleanupIntervalMs: 60000, // Clean up every minute
};

/**
 * Tracks request timestamps for a single IP.
 */
interface RequestRecord {
  /** Timestamps of requests within the current window */
  timestamps: number[];
  /** Last access time for cleanup purposes */
  lastAccess: number;
}

/**
 * Result of a rate limit check.
 */
export interface RateLimitResult {
  /** Whether the request is allowed */
  allowed: boolean;
  /** Number of remaining requests in the current window */
  remaining: number;
  /** Seconds until the rate limit resets */
  retryAfterSeconds: number;
}

/**
 * Simple sliding window rate limiter.
 *
 * Tracks request counts per IP address and enforces rate limits.
 * Automatically cleans up stale entries to prevent memory leaks.
 */
export class RateLimiter {
  private config: Required<RateLimiterConfig>;
  private records: Map<string, RequestRecord> = new Map();
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  constructor(config: Partial<RateLimiterConfig> = {}) {
    this.config = {
      ...DEFAULT_RATE_LIMIT_CONFIG,
      ...config,
      cleanupIntervalMs:
        config.cleanupIntervalMs ?? DEFAULT_RATE_LIMIT_CONFIG.cleanupIntervalMs!,
    };

    // Start periodic cleanup
    this.startCleanup();
  }

  /**
   * Check if a request from the given IP is allowed.
   *
   * @param ip - The IP address of the requester
   * @returns Result indicating if request is allowed and rate limit info
   */
  check(ip: string): RateLimitResult {
    const now = Date.now();
    const windowStart = now - this.config.windowMs;

    // Get or create record for this IP
    let record = this.records.get(ip);
    if (!record) {
      record = { timestamps: [], lastAccess: now };
      this.records.set(ip, record);
    }

    // Filter out timestamps outside the current window
    record.timestamps = record.timestamps.filter((ts) => ts > windowStart);
    record.lastAccess = now;

    // Check if under the limit
    if (record.timestamps.length < this.config.maxRequests) {
      // Allow request and record timestamp
      record.timestamps.push(now);
      return {
        allowed: true,
        remaining: this.config.maxRequests - record.timestamps.length,
        retryAfterSeconds: 0,
      };
    }

    // Rate limited - calculate when the oldest request in window expires
    const oldestTimestamp = record.timestamps[0];
    const retryAfterMs = oldestTimestamp + this.config.windowMs - now;
    const retryAfterSeconds = Math.ceil(retryAfterMs / 1000);

    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: Math.max(1, retryAfterSeconds),
    };
  }

  /**
   * Get current request count for an IP (useful for testing/monitoring).
   */
  getRequestCount(ip: string): number {
    const record = this.records.get(ip);
    if (!record) return 0;

    const windowStart = Date.now() - this.config.windowMs;
    return record.timestamps.filter((ts) => ts > windowStart).length;
  }

  /**
   * Reset rate limit for a specific IP (useful for testing).
   */
  reset(ip: string): void {
    this.records.delete(ip);
  }

  /**
   * Reset all rate limits (useful for testing).
   */
  resetAll(): void {
    this.records.clear();
  }

  /**
   * Stop the cleanup timer and release resources.
   */
  destroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    this.records.clear();
  }

  /**
   * Start periodic cleanup of stale entries.
   */
  private startCleanup(): void {
    this.cleanupTimer = setInterval(() => {
      this.cleanup();
    }, this.config.cleanupIntervalMs);

    // Unref so the timer doesn't prevent process exit
    this.cleanupTimer.unref?.();
  }

  /**
   * Remove entries that haven't been accessed recently.
   */
  private cleanup(): void {
    const now = Date.now();
    const staleThreshold = now - this.config.windowMs * 10; // 10x window duration

    for (const [ip, record] of this.records) {
      if (record.lastAccess < staleThreshold) {
        this.records.delete(ip);
      }
    }
  }
}
