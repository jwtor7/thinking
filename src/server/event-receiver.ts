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
import type { SubagentMappingEvent, SubagentMappingInfo } from '../shared/types.ts';
import { redactSecrets } from './secrets.ts';
import type { WebSocketHub } from './websocket-hub.ts';
import { RateLimiter, type RateLimiterConfig } from './rate-limiter.ts';
import { SubagentMapper } from './subagent-mapper.ts';
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
  /** Track tool start times for duration calculation */
  private toolStartTimes: Map<string, number> = new Map();
  /** Interval handle for stale tool cleanup */
  private toolStartCleanupInterval: ReturnType<typeof setInterval> | null = null;
  /** Max age for pending tool starts (5 minutes) */
  private readonly TOOL_START_TTL_MS = 5 * 60 * 1000;
  /** Maximum number of pending tool starts to track */
  private readonly MAX_PENDING_TOOLS = 10_000;
  /** Subagent mapper for tracking parent-child relationships */
  private subagentMapper: SubagentMapper;
  /** Server start time for uptime calculation */
  private readonly startTime = Date.now();
  /** Total events received counter */
  private eventsReceived = 0;
  /** Events received by type */
  private eventsByType: Map<string, number> = new Map();

  constructor(hub: WebSocketHub, rateLimitConfig?: Partial<RateLimiterConfig>) {
    this.hub = hub;
    this.rateLimiter = new RateLimiter({
      ...DEFAULT_EVENT_RATE_LIMIT,
      ...rateLimitConfig,
    });
    this.subagentMapper = new SubagentMapper();
    // Periodically clean up stale tool start times
    this.toolStartCleanupInterval = setInterval(() => this.cleanupStaleToolStarts(), 60000);
  }

  /**
   * Clean up tool start times older than TTL.
   */
  private cleanupStaleToolStarts(): void {
    const now = Date.now();
    for (const [id, startTime] of this.toolStartTimes) {
      if (now - startTime > this.TOOL_START_TTL_MS) {
        this.toolStartTimes.delete(id);
      }
    }
  }

  /**
   * Clean up resources (rate limiter timer, subagent mapper, etc.).
   */
  destroy(): void {
    this.rateLimiter.destroy();
    this.subagentMapper.destroy();
    if (this.toolStartCleanupInterval) {
      clearInterval(this.toolStartCleanupInterval);
      this.toolStartCleanupInterval = null;
    }
    this.toolStartTimes.clear();
  }

  /**
   * Get all current subagent mappings.
   * Used by server to send initial state to new clients.
   */
  getSubagentMappings(): SubagentMappingInfo[] {
    return this.subagentMapper.getAllMappings();
  }

  /**
   * Create a subagent_mapping event with current mappings.
   */
  createSubagentMappingEvent(): SubagentMappingEvent {
    return {
      type: 'subagent_mapping',
      timestamp: new Date().toISOString(),
      mappings: this.subagentMapper.getAllMappings(),
    };
  }

  /**
   * Process agent lifecycle events and update subagent mappings.
   * Broadcasts mapping changes to all clients.
   */
  private processAgentEvent(event: MonitorEvent): void {
    if (event.type === 'agent_start') {
      const agentId = event.agentId as string;
      const agentName = (event.agentName as string) || agentId.slice(0, 8);
      // The sessionId in agent_start is the parent session ID
      const parentSessionId = event.sessionId;

      if (agentId && parentSessionId) {
        const parentAgentId = event.parentAgentId as string | undefined;
        this.subagentMapper.registerSubagent(
          agentId,
          parentSessionId,
          agentName,
          event.timestamp,
          parentAgentId
        );
        // Broadcast updated mappings to all clients
        this.hub.broadcast(this.createSubagentMappingEvent());
      }
    } else if (event.type === 'agent_stop') {
      const agentId = event.agentId as string;
      const status = (event.status as 'success' | 'failure' | 'cancelled') || 'success';

      if (agentId) {
        this.subagentMapper.stopSubagent(agentId, status, event.timestamp);
        // Broadcast updated mappings to all clients
        this.hub.broadcast(this.createSubagentMappingEvent());
      }
    } else if (event.type === 'session_stop') {
      // Clean up all subagents when parent session stops
      const sessionId = event.sessionId;
      if (sessionId) {
        this.subagentMapper.cleanupSessionSubagents(sessionId);
        // Broadcast updated mappings to all clients
        this.hub.broadcast(this.createSubagentMappingEvent());
      }
    }
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
      'X-Content-Type-Options': 'nosniff',
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
      let event = this.parseAndValidateEvent(body);

      if (!event) {
        this.sendError(res, 400, 'Invalid event format');
        return;
      }

      // Track event metrics
      this.eventsReceived++;
      this.eventsByType.set(event.type, (this.eventsByType.get(event.type) || 0) + 1);

      // Track tool timing for duration calculation
      event = this.processToolTiming(event);

      // Process agent lifecycle events for subagent tracking
      this.processAgentEvent(event);

      // Broadcast to connected WebSocket clients
      this.hub.broadcast(event);

      // Respond with success
      res.writeHead(200, { 'Content-Type': 'application/json', 'X-Content-Type-Options': 'nosniff' });
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
   * Process tool timing: track start times and calculate duration for end events.
   */
  private processToolTiming(event: MonitorEvent): MonitorEvent {
    if (event.type === 'tool_start' && 'toolCallId' in event && typeof event.toolCallId === 'string') {
      if (this.toolStartTimes.has(event.toolCallId)) {
        logger.warn(`[EventReceiver] Duplicate tool_start for toolCallId=${event.toolCallId}; resetting start time`);
      }
      // Cap pending tools to prevent unbounded memory growth
      if (this.toolStartTimes.size >= this.MAX_PENDING_TOOLS) {
        // Evict oldest entry
        const oldestKey = this.toolStartTimes.keys().next().value;
        if (oldestKey) this.toolStartTimes.delete(oldestKey);
      }
      // Record start time for duration calculation
      this.toolStartTimes.set(event.toolCallId, Date.now());
    } else if (event.type === 'tool_end' && 'toolCallId' in event && typeof event.toolCallId === 'string') {
      // Calculate duration if we have a start time
      const toolCallId = event.toolCallId;
      const startTime = this.toolStartTimes.get(toolCallId);
      if (startTime) {
        const durationMs = Date.now() - startTime;
        this.toolStartTimes.delete(toolCallId);
        if (durationMs < 0) {
          logger.warn(`[EventReceiver] Ignoring negative tool duration for toolCallId=${toolCallId}`);
          return event;
        }
        // Add duration to event (override null/undefined from hook)
        if (!('durationMs' in event) || event.durationMs === undefined || event.durationMs === null) {
          return { ...event, durationMs };
        }
      }
    }
    return event;
  }

  /**
   * Handle GET /health - health check endpoint.
   */
  private handleHealthCheck(_req: IncomingMessage, res: ServerResponse): void {
    const uptimeMs = Date.now() - this.startTime;
    const status = {
      status: 'ok',
      version: CONFIG.VERSION,
      uptime: uptimeMs,
      connections: this.hub.getClientCount(),
      events_received: this.eventsReceived,
      events_by_type: Object.fromEntries(this.eventsByType),
      timestamp: new Date().toISOString(),
    };

    res.writeHead(200, { 'Content-Type': 'application/json', 'X-Content-Type-Options': 'nosniff' });
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

    // Validate ID fields (prevent unbounded memory from malicious IDs)
    if (!this.validateIdFields(parsed)) {
      logger.warn('[EventReceiver] Rejected event with invalid ID format');
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

  /** Max length for ID fields */
  private static readonly MAX_ID_LENGTH = 256;
  /** Allowed characters in ID fields: alphanumeric, hyphens, underscores, dots */
  private static readonly ID_PATTERN = /^[a-zA-Z0-9._-]+$/;

  /**
   * Validate ID fields in an event (sessionId, agentId, toolCallId).
   * Rejects IDs that are too long or contain unexpected characters.
   */
  private validateIdFields(event: MonitorEvent): boolean {
    const idFields = ['sessionId', 'agentId', 'toolCallId'] as const;
    for (const field of idFields) {
      const value = event[field];
      if (typeof value === 'string') {
        if (value.length > EventReceiver.MAX_ID_LENGTH) {
          return false;
        }
        if (!EventReceiver.ID_PATTERN.test(value)) {
          return false;
        }
      }
    }
    return true;
  }

  /**
   * Send an error response.
   */
  private sendError(res: ServerResponse, code: number, message: string): void {
    res.writeHead(code, { 'Content-Type': 'application/json', 'X-Content-Type-Options': 'nosniff' });
    res.end(JSON.stringify({ error: message }));
  }
}
