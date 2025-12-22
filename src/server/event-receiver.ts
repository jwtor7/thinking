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
import type { WebSocketHub } from './websocket-hub.ts';

/**
 * Event receiver that processes HTTP POST requests from hooks.
 */
export class EventReceiver {
  private hub: WebSocketHub;

  constructor(hub: WebSocketHub) {
    this.hub = hub;
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

      console.log(`[EventReceiver] Received and broadcast: ${event.type}`);
    } catch (error) {
      console.error('[EventReceiver] Error handling event:', error);
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
   */
  private async readRequestBody(req: IncomingMessage): Promise<string> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      let totalSize = 0;

      req.on('data', (chunk: Buffer) => {
        totalSize += chunk.length;

        // Reject if body exceeds max size (prevent memory exhaustion)
        if (totalSize > CONFIG.MAX_PAYLOAD_SIZE) {
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
      console.warn('[EventReceiver] Invalid JSON in request body');
      return null;
    }

    // Validate event structure
    if (!isMonitorEvent(parsed)) {
      console.warn('[EventReceiver] Invalid event structure:', parsed);
      return null;
    }

    // Truncate large payloads for specific event types
    const event = { ...parsed };

    if ('input' in event && typeof event.input === 'string') {
      event.input = truncatePayload(event.input);
    }

    if ('output' in event && typeof event.output === 'string') {
      event.output = truncatePayload(event.output);
    }

    if ('content' in event && typeof event.content === 'string') {
      event.content = truncatePayload(event.content);
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
