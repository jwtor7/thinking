/**
 * HTTP Event Receiver for the Thinking Monitor.
 *
 * Receives POST requests from Claude Code hooks and forwards them
 * to the WebSocket hub for broadcast to dashboard clients.
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  type MonitorEvent,
  isMonitorEvent,
  truncatePayload,
  CONFIG,
} from './types.ts';
import { redactSecrets } from './secrets.ts';
import type { WebSocketHub } from './websocket-hub.ts';
import { RateLimiter, type RateLimiterConfig } from './rate-limiter.ts';
import { logger } from './logger.ts';

/**
 * Default rate limit: 100 events per second per IP.
 */
const DEFAULT_EVENT_RATE_LIMIT: RateLimiterConfig = {
  maxRequests: 100,
  windowMs: 1000,
  cleanupIntervalMs: 60000,
};

/**
 * Event receiver that processes HTTP POST requests from hooks.
 */
export class EventReceiver {
  private hub: WebSocketHub;
  private rateLimiter: RateLimiter;

  constructor(hub: WebSocketHub, rateLimitConfig?: Partial<RateLimiterConfig>) {
    this.hub = hub;
    this.rateLimiter = new RateLimiter({
      ...DEFAULT_EVENT_RATE_LIMIT,
      ...rateLimitConfig,
    });
  }

  /**
   * Clean up resources (rate limiter timer, etc.).
   */
  destroy(): void {
    this.rateLimiter.destroy();
  }

  /**
   * Handle incoming HTTP request.
   * Returns true if the request was handled, false otherwise.
   */
  async handleRequest(
    req: IncomingMessage,
    res: ServerResponse
  ): Promise<boolean> {
    const url = new URL(req.url || '/', `http://${req.headers.host}`);

    // Only handle POST /event
    if (req.method === 'POST' && url.pathname === '/event') {
      // Apply rate limiting early in the request flow
      const clientIp = this.getClientIp(req);
      const rateLimitResult = this.rateLimiter.check(clientIp);

      if (!rateLimitResult.allowed) {
        this.sendRateLimited(res, rateLimitResult.retryAfterSeconds);
        return true;
      }

      await this.handleEventPost(req, res);
      return true;
    }

    // Health check endpoint
    if (req.method === 'GET' && url.pathname === '/health') {
      this.handleHealthCheck(req, res);
      return true;
    }

    return false;
  }

  /**
   * Extract client IP from request.
   * Since we only bind to 127.0.0.1, this will always be localhost,
   * but we still track by socket address for consistency.
   */
  private getClientIp(req: IncomingMessage): string {
    // For localhost-only server, use socket remoteAddress
    // X-Forwarded-For is not trusted since this is a local-only server
    return req.socket.remoteAddress || '127.0.0.1';
  }

  /**
   * Send HTTP 429 Too Many Requests response.
   */
  private sendRateLimited(res: ServerResponse, retryAfterSeconds: number): void {
    res.writeHead(429, {
      'Content-Type': 'application/json',
      'Retry-After': String(retryAfterSeconds),
    });
    res.end(
      JSON.stringify({
        error: 'Too Many Requests',
        retryAfter: retryAfterSeconds,
      })
    );
    logger.warn('[EventReceiver] Rate limit exceeded');
  }

  /**
   * Handle POST /event - receive events from hooks.
   */
  private async handleEventPost(
    req: IncomingMessage,
    res: ServerResponse
  ): Promise<void> {
    try {
      const body = await this.readRequestBody(req);
      const event = this.parseAndValidateEvent(body);

      if (!event) {
        this.sendError(res, 400, 'Invalid event format');
        return;
      }

      // Broadcast to connected WebSocket clients
      this.hub.broadcast(event);

      // Respond with success
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, type: event.type }));

      logger.debug(`[EventReceiver] Received and broadcast: ${event.type}`);
    } catch (error) {
      logger.error('[EventReceiver] Error handling event:', error);
      this.sendError(
        res,
        500,
        error instanceof Error ? error.message : 'Internal server error'
      );
    }
  }

  /**
   * Handle GET /health - health check endpoint.
   */
  private handleHealthCheck(_req: IncomingMessage, res: ServerResponse): void {
    const status = {
      status: 'ok',
      version: CONFIG.VERSION,
      clients: this.hub.getClientCount(),
      timestamp: new Date().toISOString(),
    };

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(status));
  }

  /**
   * Read the request body as a string.
   *
   * Has a hard 5MB streaming limit to prevent memory exhaustion from extremely
   * large requests. This is separate from MAX_PAYLOAD_SIZE (100KB) which
   * controls content truncation in parseAndValidateEvent.
   */
  private async readRequestBody(req: IncomingMessage): Promise<string> {
    const MAX_BODY_SIZE = 5 * 1024 * 1024; // 5MB hard limit for memory safety

    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      let totalSize = 0;

      req.on('data', (chunk: Buffer) => {
        totalSize += chunk.length;

        // Hard limit to prevent memory exhaustion (content truncation happens later)
        if (totalSize > MAX_BODY_SIZE) {
          req.destroy();
          reject(new Error('Request body too large'));
          return;
        }

        chunks.push(chunk);
      });

      req.on('end', () => {
        resolve(Buffer.concat(chunks).toString('utf-8'));
      });

      req.on('error', (error) => {
        reject(error);
      });
    });
  }

  /**
   * Parse and validate the event from JSON body.
   */
  private parseAndValidateEvent(body: string): MonitorEvent | null {
    if (!body.trim()) {
      return null;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(body);
    } catch {
      logger.warn('[EventReceiver] Invalid JSON in request body');
      return null;
    }

    // Validate event structure
    if (!isMonitorEvent(parsed)) {
      // Log only structure shape, not values (could contain secrets)
      const parsedObj = parsed as Record<string, unknown> | null | undefined;
      const typeValue = parsedObj?.type;
      const keys = Object.keys(parsedObj || {}).join(',');
      logger.warn(
        `[EventReceiver] Invalid event structure: type=${typeof typeValue === 'string' ? typeValue : 'undefined'}, keys=${keys}`
      );
      return null;
    }

    // Process payloads: truncate large content and redact secrets
    const event = { ...parsed };

    if ('input' in event && typeof event.input === 'string') {
      event.input = redactSecrets(truncatePayload(event.input) ?? '');
    }

    if ('output' in event && typeof event.output === 'string') {
      event.output = redactSecrets(truncatePayload(event.output) ?? '');
    }

    if ('content' in event && typeof event.content === 'string') {
      event.content = redactSecrets(truncatePayload(event.content) ?? '');
    }

    // Also redact secrets from workingDirectory if present
    if ('workingDirectory' in event && typeof event.workingDirectory === 'string') {
      event.workingDirectory = redactSecrets(event.workingDirectory);
    }

    return event as MonitorEvent;
  }

  /**
   * Send an error response.
   */
  private sendError(res: ServerResponse, code: number, message: string): void {
    res.writeHead(code, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: message }));
  }
}
