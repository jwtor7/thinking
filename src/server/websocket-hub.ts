/**
 * WebSocket Hub for the Thinking Monitor.
 *
 * Manages WebSocket connections from dashboard clients and broadcasts
 * events to all connected clients. Implements security measures including
 * Origin header validation and localhost-only binding.
 */

import { WebSocket, WebSocketServer } from 'ws';
import type { IncomingMessage } from 'node:http';
import type { Server as HttpServer } from 'node:http';
import {
  type MonitorEvent,
  type WebSocketMessage,
  type ConnectionStatusEvent,
  type ClientRequest,
  isClientRequest,
  CONFIG,
} from './types.ts';
import { logger } from './logger.ts';

/** Connected client metadata */
interface ConnectedClient {
  ws: WebSocket;
  connectedAt: Date;
  id: string;
  /** Counter for invalid messages received from this client */
  invalidMessageCount: number;
  /** Message count in current rate-limit window */
  messageCount: number;
  /** Start timestamp for current message rate-limit window */
  messageWindowStart: number;
  /** Whether the client responded to the last ping */
  isAlive: boolean;
}

/**
 * WebSocket Hub for broadcasting events to connected dashboard clients.
 */
/** Handler for client requests */
export type ClientRequestHandler = (
  request: ClientRequest,
  sendResponse: (event: MonitorEvent) => void
) => Promise<void>;

export class WebSocketHub {
  private wss: WebSocketServer | null = null;
  private clients: Map<string, ConnectedClient> = new Map();
  private messageSeq = 0;
  private onClientConnectCallback: ((client: ConnectedClient) => void) | null = null;
  private clientRequestHandler: ClientRequestHandler | null = null;
  /** Ping interval for detecting stale connections (30s) */
  private pingInterval: ReturnType<typeof setInterval> | null = null;
  private static readonly PING_INTERVAL_MS = 30_000;
  /** Maximum concurrent WebSocket clients */
  private static readonly MAX_CONNECTIONS = 10;
  /** Maximum messages per second per client */
  private static readonly MAX_MESSAGES_PER_WINDOW = 100;
  /** Rate-limit window duration in ms */
  private static readonly MESSAGE_WINDOW_MS = 1_000;
  /** Maximum inbound message size in bytes */
  private static readonly MAX_MESSAGE_SIZE = 100 * 1024; // 100KB

  /**
   * Attach the WebSocket server to an existing HTTP server.
   * This allows sharing the same port for both HTTP and WebSocket.
   */
  attach(httpServer: HttpServer): void {
    this.wss = new WebSocketServer({
      server: httpServer,
      verifyClient: this.verifyClient.bind(this),
    });

    this.wss.on('connection', this.handleConnection.bind(this));
    this.wss.on('error', (error) => {
      logger.error('[WebSocketHub] Server error:', error.message);
    });

    // Start heartbeat to detect stale connections
    this.startPingInterval();

    logger.info(`[WebSocketHub] Attached to HTTP server`);
  }

  /**
   * Verify client connection. Only accepts connections from localhost origins.
   */
  private verifyClient(
    info: { origin: string; secure: boolean; req: IncomingMessage },
    callback: (result: boolean, code?: number, message?: string) => void
  ): void {
    const origin = info.req.headers.origin;

    // Allow connections without origin (e.g., CLI tools, testing)
    // Still verify connection comes from loopback
    if (!origin) {
      const remoteAddr = info.req.socket.remoteAddress || '';
      const isLoopback = remoteAddr === '127.0.0.1' || remoteAddr === '::1' || remoteAddr === '::ffff:127.0.0.1';
      if (!isLoopback) {
        logger.warn(`[WebSocketHub] Rejected origin-less connection from non-loopback: ${remoteAddr}`);
        callback(false, 403, 'Forbidden: Non-loopback connection');
        return;
      }
      callback(true);
      return;
    }

    // Validate origin is from localhost
    const allowedOrigins = [
      `http://localhost:${CONFIG.STATIC_PORT}`,
      `http://127.0.0.1:${CONFIG.STATIC_PORT}`,
    ];

    if (allowedOrigins.includes(origin)) {
      callback(true);
    } else {
      logger.warn(`[WebSocketHub] Rejected connection from origin: ${origin}`);
      callback(false, 403, 'Forbidden: Invalid origin');
    }
  }

  /**
   * Set a callback to be called when a new client connects.
   * Useful for sending initial state to new clients.
   */
  onClientConnect(callback: (sendEvent: (event: MonitorEvent) => void) => void): void {
    this.onClientConnectCallback = (client) => {
      callback((event) => this.sendToClient(client, event));
    };
  }

  /**
   * Set a handler for client requests (e.g., plan_request).
   * The handler receives the request and a function to send a response back.
   */
  onClientRequest(handler: ClientRequestHandler): void {
    this.clientRequestHandler = handler;
  }

  /**
   * Handle new WebSocket connection.
   */
  private handleConnection(ws: WebSocket, _req: IncomingMessage): void {
    if (this.clients.size >= WebSocketHub.MAX_CONNECTIONS) {
      logger.warn('[WebSocketHub] Rejected connection: max client limit reached');
      ws.close(1013, 'Server busy: too many connections');
      return;
    }

    const clientId = this.generateClientId();
    const now = Date.now();
    const client: ConnectedClient = {
      ws,
      connectedAt: new Date(),
      id: clientId,
      invalidMessageCount: 0,
      messageCount: 0,
      messageWindowStart: now,
      isAlive: true,
    };

    this.clients.set(clientId, client);
    logger.info(
      `[WebSocketHub] Client connected: ${clientId} (total: ${this.clients.size})`
    );

    // Handle pong responses for heartbeat
    ws.on('pong', () => {
      client.isAlive = true;
    });

    // Send connection status to the new client
    this.sendToClient(client, this.createConnectionStatusEvent('connected'));

    // Call the onClientConnect callback if set (to send initial state)
    if (this.onClientConnectCallback) {
      this.onClientConnectCallback(client);
    }

    // Handle client disconnect
    ws.on('close', () => {
      this.clients.delete(clientId);
      logger.info(
        `[WebSocketHub] Client disconnected: ${clientId} (total: ${this.clients.size})`
      );
    });

    // Handle client errors
    ws.on('error', (error) => {
      logger.error(`[WebSocketHub] Client ${clientId} error:`, error.message);
      this.clients.delete(clientId);
    });

    // Handle incoming messages from clients
    ws.on('message', (data) => {
      if (!this.checkMessageRateLimit(client)) {
        ws.close(1008, 'Rate limit exceeded');
        return;
      }

      const { rawLength, messageStr } = this.parseIncomingMessage(data, WebSocketHub.MAX_MESSAGE_SIZE);

      // Security: Reject oversized messages to prevent DoS
      if (rawLength > WebSocketHub.MAX_MESSAGE_SIZE) {
        logger.warn(
          `[WebSocketHub] Rejected oversized message from ${client.id}: ${rawLength} bytes`
        );
        ws.close(1009, 'Message too large');
        return;
      }

      // Early JSON validation before processing
      let parsed: unknown;
      try {
        parsed = JSON.parse(messageStr);
      } catch {
        logger.warn(`[WebSocketHub] Invalid JSON from ${client.id}`);
        client.invalidMessageCount++;
        if (client.invalidMessageCount > 5) {
          logger.warn(
            `[WebSocketHub] Closing connection for ${client.id}: too many invalid messages`
          );
          ws.close(1003, 'Too many invalid messages');
        }
        return;
      }

      this.handleClientMessage(client, parsed);
    });
  }

  /**
   * Enforce per-client message rate limits.
   * Returns false when the client exceeded the configured window limit.
   */
  private checkMessageRateLimit(client: ConnectedClient): boolean {
    const now = Date.now();
    if (now - client.messageWindowStart >= WebSocketHub.MESSAGE_WINDOW_MS) {
      client.messageWindowStart = now;
      client.messageCount = 0;
    }

    client.messageCount++;
    if (client.messageCount > WebSocketHub.MAX_MESSAGES_PER_WINDOW) {
      logger.warn(
        `[WebSocketHub] Rate limit exceeded for ${client.id}: ${client.messageCount} msg/s`
      );
      return false;
    }

    return true;
  }

  /**
   * Parse incoming ws payload without unnecessary string conversions.
   * For Buffer-like inputs, size is checked before UTF-8 conversion.
   */
  private parseIncomingMessage(
    data: unknown,
    maxSize: number
  ): { rawLength: number; messageStr: string } {
    if (Buffer.isBuffer(data)) {
      if (data.length > maxSize) {
        return { rawLength: data.length, messageStr: '' };
      }
      return { rawLength: data.length, messageStr: data.toString('utf-8') };
    }

    if (Array.isArray(data)) {
      const rawLength = data.reduce((total, chunk) => total + chunk.length, 0);
      if (rawLength > maxSize) {
        return { rawLength, messageStr: '' };
      }
      const messageStr = Buffer.concat(data).toString('utf-8');
      return { rawLength, messageStr };
    }

    if (data instanceof ArrayBuffer) {
      const rawLength = data.byteLength;
      if (rawLength > maxSize) {
        return { rawLength, messageStr: '' };
      }
      const messageStr = Buffer.from(data).toString('utf-8');
      return { rawLength, messageStr };
    }

    if (ArrayBuffer.isView(data)) {
      const view = data as ArrayBufferView;
      const rawLength = view.byteLength;
      if (rawLength > maxSize) {
        return { rawLength, messageStr: '' };
      }
      const messageStr = Buffer.from(view.buffer, view.byteOffset, view.byteLength).toString('utf-8');
      return { rawLength, messageStr };
    }

    const messageStr = String(data ?? '');
    return { rawLength: Buffer.byteLength(messageStr), messageStr };
  }

  /**
   * Broadcast an event to all connected clients.
   */
  broadcast(event: MonitorEvent): void {
    if (this.clients.size === 0) {
      return;
    }

    const message: WebSocketMessage = {
      event,
      seq: ++this.messageSeq,
    };

    const payload = JSON.stringify(message);
    let sentCount = 0;

    for (const [clientId, client] of this.clients) {
      if (client.ws.readyState === WebSocket.OPEN) {
        try {
          client.ws.send(payload);
          sentCount++;
        } catch (error) {
          logger.error(
            `[WebSocketHub] Failed to send to ${clientId}:`,
            error instanceof Error ? error.message : 'Unknown error'
          );
        }
      }
    }

    logger.debug(
      `[WebSocketHub] Broadcast ${event.type} to ${sentCount}/${this.clients.size} clients`
    );
  }

  /**
   * Send an event to a specific client.
   */
  private sendToClient(client: ConnectedClient, event: MonitorEvent): void {
    if (client.ws.readyState !== WebSocket.OPEN) {
      return;
    }

    const message: WebSocketMessage = {
      event,
      seq: ++this.messageSeq,
    };

    try {
      client.ws.send(JSON.stringify(message));
    } catch (error) {
      logger.error(
        `[WebSocketHub] Failed to send to ${client.id}:`,
        error instanceof Error ? error.message : 'Unknown error'
      );
    }
  }

  /**
   * Handle an incoming message from a client.
   * Expects already-parsed JSON data (validation done in message handler).
   */
  private handleClientMessage(client: ConnectedClient, data: unknown): void {
    if (isClientRequest(data)) {
      logger.debug(`[WebSocketHub] Received ${data.type} from ${client.id}`);

      if (this.clientRequestHandler) {
        this.clientRequestHandler(data, (event) => this.sendToClient(client, event))
          .catch((error) => {
            logger.error(
              `[WebSocketHub] Error handling client request:`,
              error instanceof Error ? error.message : 'Unknown error'
            );
          });
      } else {
        logger.warn(`[WebSocketHub] No handler registered for client requests`);
      }
    } else {
      // Log unrecognized message (content already validated as JSON)
      logger.debug(`[WebSocketHub] Unrecognized message from ${client.id}`);
    }
  }

  /**
   * Create a connection status event.
   */
  private createConnectionStatusEvent(
    status: 'connected' | 'disconnected'
  ): ConnectionStatusEvent {
    return {
      type: 'connection_status',
      timestamp: new Date().toISOString(),
      status,
      serverVersion: CONFIG.VERSION,
      clientCount: this.clients.size,
    };
  }

  /**
   * Generate a unique client ID.
   */
  private generateClientId(): string {
    return `client-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  /**
   * Get the number of connected clients.
   */
  getClientCount(): number {
    return this.clients.size;
  }

  /**
   * Start the ping interval to detect stale connections.
   * Sends a ping to all clients every 30s. Clients that don't respond
   * with a pong before the next ping are terminated.
   */
  private startPingInterval(): void {
    if (this.pingInterval) return;

    this.pingInterval = setInterval(() => {
      for (const [clientId, client] of this.clients) {
        if (!client.isAlive) {
          logger.info(`[WebSocketHub] Terminating unresponsive client: ${clientId}`);
          client.ws.terminate();
          this.clients.delete(clientId);
          continue;
        }
        client.isAlive = false;
        try {
          client.ws.ping();
        } catch {
          // Client already gone
          this.clients.delete(clientId);
        }
      }
    }, WebSocketHub.PING_INTERVAL_MS);
  }

  /**
   * Close all connections and shut down the server.
   */
  close(): void {
    // Stop ping interval
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }

    // Close all client connections
    for (const [_clientId, client] of this.clients) {
      try {
        client.ws.close(1000, 'Server shutting down');
      } catch {
        // Ignore errors during shutdown
      }
    }
    this.clients.clear();

    // Close the WebSocket server
    if (this.wss) {
      this.wss.close();
      this.wss = null;
    }

    logger.info('[WebSocketHub] Shut down complete');
  }
}
