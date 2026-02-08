// src/server/index.ts
import { createServer as createServer2 } from "node:http";
import { fileURLToPath } from "node:url";
import { dirname as dirname4, join as join8 } from "node:path";

// src/server/websocket-hub.ts
import { WebSocket, WebSocketServer } from "ws";

// src/server/types.ts
import { readFileSync } from "node:fs";
import { join } from "node:path";
function isClientRequest(obj) {
  if (typeof obj !== "object" || obj === null) {
    return false;
  }
  const request = obj;
  if (request.type === "plan_request") {
    return typeof request.path === "string";
  }
  return false;
}
function getVersion() {
  if (true) {
    return "1.2.3";
  }
  try {
    const packagePath = join(process.cwd(), "package.json");
    const pkg = JSON.parse(readFileSync(packagePath, "utf-8"));
    if (pkg.name === "thinking-monitor" && pkg.version) {
      return pkg.version;
    }
    return "0.0.0-dev";
  } catch {
    return "0.0.0-dev";
  }
}
function getTranscriptPollInterval() {
  const MIN_INTERVAL_MS = 100;
  const MAX_INTERVAL_MS = 1e4;
  const DEFAULT_INTERVAL_MS = 1e3;
  const envValue = process.env.THINKING_POLL_INTERVAL;
  if (!envValue) {
    return DEFAULT_INTERVAL_MS;
  }
  const parsed = parseInt(envValue, 10);
  if (isNaN(parsed)) {
    console.warn(
      `[CONFIG] Invalid THINKING_POLL_INTERVAL value "${envValue}", using default ${DEFAULT_INTERVAL_MS}ms`
    );
    return DEFAULT_INTERVAL_MS;
  }
  if (parsed < MIN_INTERVAL_MS) {
    console.warn(
      `[CONFIG] THINKING_POLL_INTERVAL ${parsed}ms is below minimum ${MIN_INTERVAL_MS}ms, using ${MIN_INTERVAL_MS}ms`
    );
    return MIN_INTERVAL_MS;
  }
  if (parsed > MAX_INTERVAL_MS) {
    console.warn(
      `[CONFIG] THINKING_POLL_INTERVAL ${parsed}ms exceeds maximum ${MAX_INTERVAL_MS}ms, using ${MAX_INTERVAL_MS}ms`
    );
    return MAX_INTERVAL_MS;
  }
  return parsed;
}
var CONFIG = {
  /** WebSocket and HTTP event receiver port */
  WS_PORT: 3355,
  /** Static file server port */
  STATIC_PORT: 3356,
  /** Host to bind to (localhost only for security) */
  HOST: "127.0.0.1",
  /** Maximum payload size in bytes */
  MAX_PAYLOAD_SIZE: 100 * 1024,
  // 100KB
  /** Server version - read from package.json */
  VERSION: getVersion(),
  /**
   * Transcript watcher polling interval in milliseconds.
   * Override with THINKING_POLL_INTERVAL env var.
   * Valid range: 100ms - 10000ms, default: 1000ms
   */
  TRANSCRIPT_POLL_INTERVAL_MS: getTranscriptPollInterval()
};
function isMonitorEvent(obj) {
  if (typeof obj !== "object" || obj === null) {
    return false;
  }
  const event = obj;
  if (typeof event.type !== "string" || typeof event.timestamp !== "string") {
    return false;
  }
  const validTypes = [
    "tool_start",
    "tool_end",
    "agent_start",
    "agent_stop",
    "session_start",
    "session_stop",
    "thinking",
    "plan_update",
    "plan_delete",
    "plan_list",
    "hook_execution",
    "subagent_mapping",
    "team_update",
    "task_update",
    "message_sent",
    "teammate_idle",
    "task_completed",
    "connection_status"
  ];
  return validTypes.includes(event.type);
}
function truncatePayload(content) {
  if (!content) {
    return content;
  }
  if (content.length > CONFIG.MAX_PAYLOAD_SIZE) {
    return content.slice(0, CONFIG.MAX_PAYLOAD_SIZE) + "\n... [truncated]";
  }
  return content;
}

// src/server/logger.ts
var LEVELS = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3
};
function getCurrentLevel() {
  const envLevel = process.env.LOG_LEVEL?.toLowerCase();
  if (envLevel && envLevel in LEVELS) {
    return envLevel;
  }
  return "info";
}
var currentLevel = getCurrentLevel();
function getCurrentFormat() {
  return process.env.LOG_FORMAT?.toLowerCase() === "json" ? "json" : "text";
}
var currentFormat = getCurrentFormat();
function toLogData(value) {
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack
    };
  }
  return value;
}
function emit(level, method, args) {
  if (LEVELS[level] < LEVELS[currentLevel]) {
    return;
  }
  if (currentFormat === "json") {
    const [first, ...rest] = args;
    const entry = {
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      level,
      message: typeof first === "string" ? first : String(first ?? "")
    };
    if (rest.length > 0) {
      entry.context = rest.map(toLogData);
    } else if (first !== void 0 && typeof first !== "string") {
      entry.context = [toLogData(first)];
    }
    console[method](JSON.stringify(entry));
    return;
  }
  console[method](...args);
}
var logger = {
  /**
   * Debug level - verbose output for troubleshooting.
   * Use for: per-event logs, polling info, detailed state changes.
   */
  debug: (...args) => {
    emit("debug", "log", args);
  },
  /**
   * Info level - standard operational messages.
   * Use for: startup messages, connection events, significant actions.
   */
  info: (...args) => {
    emit("info", "log", args);
  },
  /**
   * Warn level - warning messages that don't stop operation.
   * Use for: rejected connections, validation failures, recoverable issues.
   */
  warn: (...args) => {
    emit("warn", "warn", args);
  },
  /**
   * Error level - error messages for failures.
   * Use for: exceptions, fatal errors, operation failures.
   */
  error: (...args) => {
    emit("error", "error", args);
  }
};

// src/server/websocket-hub.ts
var WebSocketHub = class _WebSocketHub {
  wss = null;
  clients = /* @__PURE__ */ new Map();
  messageSeq = 0;
  onClientConnectCallback = null;
  clientRequestHandler = null;
  /** Ping interval for detecting stale connections (30s) */
  pingInterval = null;
  static PING_INTERVAL_MS = 3e4;
  /** Maximum concurrent WebSocket clients */
  static MAX_CONNECTIONS = 10;
  /** Maximum messages per second per client */
  static MAX_MESSAGES_PER_WINDOW = 100;
  /** Rate-limit window duration in ms */
  static MESSAGE_WINDOW_MS = 1e3;
  /** Maximum inbound message size in bytes */
  static MAX_MESSAGE_SIZE = 100 * 1024;
  // 100KB
  /**
   * Attach the WebSocket server to an existing HTTP server.
   * This allows sharing the same port for both HTTP and WebSocket.
   */
  attach(httpServer) {
    this.wss = new WebSocketServer({
      server: httpServer,
      verifyClient: this.verifyClient.bind(this)
    });
    this.wss.on("connection", this.handleConnection.bind(this));
    this.wss.on("error", (error) => {
      logger.error("[WebSocketHub] Server error:", error.message);
    });
    this.startPingInterval();
    logger.info(`[WebSocketHub] Attached to HTTP server`);
  }
  /**
   * Verify client connection. Only accepts connections from localhost origins.
   */
  verifyClient(info, callback) {
    const origin = info.req.headers.origin;
    if (!origin) {
      const remoteAddr = info.req.socket.remoteAddress || "";
      const isLoopback = remoteAddr === "127.0.0.1" || remoteAddr === "::1" || remoteAddr === "::ffff:127.0.0.1";
      if (!isLoopback) {
        logger.warn(`[WebSocketHub] Rejected origin-less connection from non-loopback: ${remoteAddr}`);
        callback(false, 403, "Forbidden: Non-loopback connection");
        return;
      }
      callback(true);
      return;
    }
    const allowedOrigins = [
      `http://localhost:${CONFIG.STATIC_PORT}`,
      `http://127.0.0.1:${CONFIG.STATIC_PORT}`
    ];
    if (allowedOrigins.includes(origin)) {
      callback(true);
    } else {
      logger.warn(`[WebSocketHub] Rejected connection from origin: ${origin}`);
      callback(false, 403, "Forbidden: Invalid origin");
    }
  }
  /**
   * Set a callback to be called when a new client connects.
   * Useful for sending initial state to new clients.
   */
  onClientConnect(callback) {
    this.onClientConnectCallback = (client) => {
      callback((event) => this.sendToClient(client, event));
    };
  }
  /**
   * Set a handler for client requests (e.g., plan_request).
   * The handler receives the request and a function to send a response back.
   */
  onClientRequest(handler) {
    this.clientRequestHandler = handler;
  }
  /**
   * Handle new WebSocket connection.
   */
  handleConnection(ws, _req) {
    if (this.clients.size >= _WebSocketHub.MAX_CONNECTIONS) {
      logger.warn("[WebSocketHub] Rejected connection: max client limit reached");
      ws.close(1013, "Server busy: too many connections");
      return;
    }
    const clientId = this.generateClientId();
    const now = Date.now();
    const client = {
      ws,
      connectedAt: /* @__PURE__ */ new Date(),
      id: clientId,
      invalidMessageCount: 0,
      messageCount: 0,
      messageWindowStart: now,
      isAlive: true
    };
    this.clients.set(clientId, client);
    logger.info(
      `[WebSocketHub] Client connected: ${clientId} (total: ${this.clients.size})`
    );
    ws.on("pong", () => {
      client.isAlive = true;
    });
    this.sendToClient(client, this.createConnectionStatusEvent("connected"));
    if (this.onClientConnectCallback) {
      this.onClientConnectCallback(client);
    }
    ws.on("close", () => {
      this.clients.delete(clientId);
      logger.info(
        `[WebSocketHub] Client disconnected: ${clientId} (total: ${this.clients.size})`
      );
    });
    ws.on("error", (error) => {
      logger.error(`[WebSocketHub] Client ${clientId} error:`, error.message);
      this.clients.delete(clientId);
    });
    ws.on("message", (data) => {
      if (!this.checkMessageRateLimit(client)) {
        ws.close(1008, "Rate limit exceeded");
        return;
      }
      const { rawLength, messageStr } = this.parseIncomingMessage(data, _WebSocketHub.MAX_MESSAGE_SIZE);
      if (rawLength > _WebSocketHub.MAX_MESSAGE_SIZE) {
        logger.warn(
          `[WebSocketHub] Rejected oversized message from ${client.id}: ${rawLength} bytes`
        );
        ws.close(1009, "Message too large");
        return;
      }
      let parsed;
      try {
        parsed = JSON.parse(messageStr);
      } catch {
        logger.warn(`[WebSocketHub] Invalid JSON from ${client.id}`);
        client.invalidMessageCount++;
        if (client.invalidMessageCount > 5) {
          logger.warn(
            `[WebSocketHub] Closing connection for ${client.id}: too many invalid messages`
          );
          ws.close(1003, "Too many invalid messages");
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
  checkMessageRateLimit(client) {
    const now = Date.now();
    if (now - client.messageWindowStart >= _WebSocketHub.MESSAGE_WINDOW_MS) {
      client.messageWindowStart = now;
      client.messageCount = 0;
    }
    client.messageCount++;
    if (client.messageCount > _WebSocketHub.MAX_MESSAGES_PER_WINDOW) {
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
  parseIncomingMessage(data, maxSize) {
    if (Buffer.isBuffer(data)) {
      if (data.length > maxSize) {
        return { rawLength: data.length, messageStr: "" };
      }
      return { rawLength: data.length, messageStr: data.toString("utf-8") };
    }
    if (Array.isArray(data)) {
      const rawLength = data.reduce((total, chunk) => total + chunk.length, 0);
      if (rawLength > maxSize) {
        return { rawLength, messageStr: "" };
      }
      const messageStr2 = Buffer.concat(data).toString("utf-8");
      return { rawLength, messageStr: messageStr2 };
    }
    if (data instanceof ArrayBuffer) {
      const rawLength = data.byteLength;
      if (rawLength > maxSize) {
        return { rawLength, messageStr: "" };
      }
      const messageStr2 = Buffer.from(data).toString("utf-8");
      return { rawLength, messageStr: messageStr2 };
    }
    if (ArrayBuffer.isView(data)) {
      const view = data;
      const rawLength = view.byteLength;
      if (rawLength > maxSize) {
        return { rawLength, messageStr: "" };
      }
      const messageStr2 = Buffer.from(view.buffer, view.byteOffset, view.byteLength).toString("utf-8");
      return { rawLength, messageStr: messageStr2 };
    }
    const messageStr = String(data ?? "");
    return { rawLength: Buffer.byteLength(messageStr), messageStr };
  }
  /**
   * Broadcast an event to all connected clients.
   */
  broadcast(event) {
    if (this.clients.size === 0) {
      return;
    }
    const message = {
      event,
      seq: ++this.messageSeq
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
            error instanceof Error ? error.message : "Unknown error"
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
  sendToClient(client, event) {
    if (client.ws.readyState !== WebSocket.OPEN) {
      return;
    }
    const message = {
      event,
      seq: ++this.messageSeq
    };
    try {
      client.ws.send(JSON.stringify(message));
    } catch (error) {
      logger.error(
        `[WebSocketHub] Failed to send to ${client.id}:`,
        error instanceof Error ? error.message : "Unknown error"
      );
    }
  }
  /**
   * Handle an incoming message from a client.
   * Expects already-parsed JSON data (validation done in message handler).
   */
  handleClientMessage(client, data) {
    if (isClientRequest(data)) {
      logger.debug(`[WebSocketHub] Received ${data.type} from ${client.id}`);
      if (this.clientRequestHandler) {
        this.clientRequestHandler(data, (event) => this.sendToClient(client, event)).catch((error) => {
          logger.error(
            `[WebSocketHub] Error handling client request:`,
            error instanceof Error ? error.message : "Unknown error"
          );
        });
      } else {
        logger.warn(`[WebSocketHub] No handler registered for client requests`);
      }
    } else {
      logger.debug(`[WebSocketHub] Unrecognized message from ${client.id}`);
    }
  }
  /**
   * Create a connection status event.
   */
  createConnectionStatusEvent(status) {
    return {
      type: "connection_status",
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      status,
      serverVersion: CONFIG.VERSION,
      clientCount: this.clients.size
    };
  }
  /**
   * Generate a unique client ID.
   */
  generateClientId() {
    return `client-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }
  /**
   * Get the number of connected clients.
   */
  getClientCount() {
    return this.clients.size;
  }
  /**
   * Start the ping interval to detect stale connections.
   * Sends a ping to all clients every 30s. Clients that don't respond
   * with a pong before the next ping are terminated.
   */
  startPingInterval() {
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
          this.clients.delete(clientId);
        }
      }
    }, _WebSocketHub.PING_INTERVAL_MS);
  }
  /**
   * Close all connections and shut down the server.
   */
  close() {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
    for (const [_clientId, client] of this.clients) {
      try {
        client.ws.close(1e3, "Server shutting down");
      } catch {
      }
    }
    this.clients.clear();
    if (this.wss) {
      this.wss.close();
      this.wss = null;
    }
    logger.info("[WebSocketHub] Shut down complete");
  }
};

// src/server/secrets.ts
var REDACTED = "[REDACTED]";
var SECRET_PATTERNS = [
  // API Key prefixes (common cloud providers and services)
  {
    name: "Stripe API key",
    pattern: /\b(sk_(?:live|test)_[a-zA-Z0-9]{24,})\b/g,
    minLength: 20
  },
  {
    name: "Stripe publishable key",
    pattern: /\b(pk_(?:live|test)_[a-zA-Z0-9]{24,})\b/g,
    minLength: 20
  },
  {
    name: "AWS access key",
    pattern: /\b(AKIA[0-9A-Z]{16})\b/g,
    minLength: 20
  },
  {
    name: "AWS secret key",
    pattern: /\b(aws_secret_access_key\s*[=:]\s*)([a-zA-Z0-9+/]{40})\b/gi
  },
  {
    name: "OpenAI API key",
    pattern: /\b(sk-[a-zA-Z0-9]{32,})\b/g,
    minLength: 20
  },
  {
    name: "OpenAI project key",
    pattern: /\b(sk-proj-[a-zA-Z0-9_-]{20,})\b/g,
    minLength: 20
  },
  {
    name: "Anthropic API key",
    pattern: /\b(sk-ant(?:-[a-zA-Z0-9]+)?-[a-zA-Z0-9_-]{20,}(?:-ant-v2)?)\b/g,
    minLength: 20
  },
  {
    name: "Databricks token",
    pattern: /\b(dapi[a-zA-Z0-9]{32,})\b/g,
    minLength: 20
  },
  {
    name: "Supabase secret key",
    pattern: /\b(sb_secret_[a-zA-Z0-9_-]{20,})\b/g,
    minLength: 20
  },
  {
    name: "Supabase service role key assignment",
    pattern: /\b((?:SUPABASE_SERVICE_ROLE_KEY|supabase_service_role_key|service_role_key)\s*[=:]\s*)["']?([a-zA-Z0-9._-]{20,})["']?/gi
  },
  {
    name: "GitHub token",
    pattern: /\b(gh[ps]_[a-zA-Z0-9]{36,})\b/g,
    minLength: 20
  },
  {
    name: "GitHub OAuth token",
    pattern: /\b(gho_[a-zA-Z0-9]{36,})\b/g,
    minLength: 20
  },
  {
    name: "Google API key",
    pattern: /\b(AIza[0-9A-Za-z_-]{32,})\b/g,
    minLength: 30
  },
  {
    name: "Slack token",
    pattern: /\b(xox[baprs]-[0-9a-zA-Z-]{10,})\b/g,
    minLength: 15
  },
  {
    name: "NPM token",
    pattern: /\b(npm_[a-zA-Z0-9]{20,})\b/g,
    minLength: 20
  },
  // JWT tokens
  {
    name: "JWT token",
    pattern: /\b(eyJ[a-zA-Z0-9_-]+\.eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+)\b/g,
    minLength: 50
  },
  // Bearer tokens in headers (real tokens are typically <128 chars)
  {
    name: "Bearer token",
    pattern: /(Bearer\s+)([a-zA-Z0-9_.-]{20,128})\b/gi
  },
  // Authorization header values
  {
    name: "Basic auth",
    pattern: /(Basic\s+)([a-zA-Z0-9+/]+={0,2})(?=\s|$)/gi
  },
  // Key-value patterns (api_key=value, apiKey: value, etc.)
  // Note: Max quantifiers ({16,80}) prevent ReDoS via catastrophic backtracking
  // Upper bound of 80 covers most real API keys while limiting backtracking
  {
    name: "API key assignment",
    pattern: /\b(api[_-]?key\s*[=:]\s*)["']?([a-zA-Z0-9_.-]{16,80})["']?/gi
  },
  {
    name: "Secret assignment",
    pattern: /\b([a-zA-Z_]*secret\s*[=:]\s*)["']?([a-zA-Z0-9_.-]{16,80})["']?/gi
  },
  {
    name: "Token assignment",
    pattern: /\b((?:access[_-]?)?token\s*[=:]\s*)["']?([a-zA-Z0-9_.-]{16,80})["']?/gi
  },
  // Password patterns
  // Max quantifier {8,40} prevents ReDoS on long password-like strings
  {
    name: "Password field",
    pattern: /\b((?:pass(?:word)?|pwd|passwd)\s*[=:]\s*)["']?([^\s"',;]{8,40})["']?/gi
  },
  // Private keys (PEM format)
  {
    name: "Private key block",
    pattern: /(-----BEGIN\s+(?:[A-Z]+\s+)?PRIVATE\s+KEY-----[\s\S]*?-----END\s+(?:[A-Z]+\s+)?PRIVATE\s+KEY-----)/g
  },
  // Generic hex strings that look like secrets (32+ chars)
  {
    name: "Hex secret",
    pattern: /\b([a-f0-9]{32,64})\b/gi,
    minLength: 32
  },
  // Connection strings with credentials
  // Bound password capture to {1,80} to prevent backtracking on malformed URLs
  {
    name: "Database URL with password",
    pattern: /((?:postgres|mysql|mongodb|redis):\/\/[^:]+:)([^@]{1,80})(@)/gi
  }
];
var MAX_REDACTION_LENGTH = 5e4;
function redactSecrets(content) {
  if (!content || typeof content !== "string") {
    return content;
  }
  let truncated = false;
  if (content.length > MAX_REDACTION_LENGTH) {
    content = content.slice(0, MAX_REDACTION_LENGTH);
    truncated = true;
  }
  let redacted = content;
  for (const { pattern, minLength } of SECRET_PATTERNS) {
    pattern.lastIndex = 0;
    redacted = redacted.replace(pattern, (...args) => {
      const groups = args.slice(1, -2);
      if (groups.length === 1) {
        const secret = groups[0];
        if (minLength && secret.length < minLength) {
          return args[0];
        }
        return REDACTED;
      } else if (groups.length >= 2) {
        const prefix = groups[0] || "";
        const secret = groups[1] || "";
        const suffix = groups[2] || "";
        if (minLength && secret.length < minLength) {
          return args[0];
        }
        return prefix + REDACTED + suffix;
      }
      return args[0];
    });
  }
  if (truncated) {
    redacted += "\n[... content truncated for security scanning ...]";
  }
  return redacted;
}

// src/server/rate-limiter.ts
var DEFAULT_RATE_LIMIT_CONFIG = {
  maxRequests: 100,
  windowMs: 1e3,
  // 1 second
  cleanupIntervalMs: 6e4
  // Clean up every minute
};
var RateLimiter = class {
  config;
  records = /* @__PURE__ */ new Map();
  cleanupTimer = null;
  constructor(config = {}) {
    this.config = {
      ...DEFAULT_RATE_LIMIT_CONFIG,
      ...config,
      cleanupIntervalMs: config.cleanupIntervalMs ?? DEFAULT_RATE_LIMIT_CONFIG.cleanupIntervalMs
    };
    this.startCleanup();
  }
  /**
   * Check if a request from the given IP is allowed.
   *
   * @param ip - The IP address of the requester
   * @returns Result indicating if request is allowed and rate limit info
   */
  check(ip) {
    const now = Date.now();
    const windowStart = now - this.config.windowMs;
    let record = this.records.get(ip);
    if (!record) {
      record = { timestamps: [], lastAccess: now };
      this.records.set(ip, record);
    }
    record.timestamps = record.timestamps.filter((ts) => ts > windowStart);
    record.lastAccess = now;
    if (record.timestamps.length < this.config.maxRequests) {
      record.timestamps.push(now);
      return {
        allowed: true,
        remaining: this.config.maxRequests - record.timestamps.length,
        retryAfterSeconds: 0
      };
    }
    const oldestTimestamp = record.timestamps[0];
    const retryAfterMs = oldestTimestamp + this.config.windowMs - now;
    const retryAfterSeconds = Math.ceil(retryAfterMs / 1e3);
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: Math.max(1, retryAfterSeconds)
    };
  }
  /**
   * Get current request count for an IP (useful for testing/monitoring).
   */
  getRequestCount(ip) {
    const record = this.records.get(ip);
    if (!record) return 0;
    const windowStart = Date.now() - this.config.windowMs;
    return record.timestamps.filter((ts) => ts > windowStart).length;
  }
  /**
   * Reset rate limit for a specific IP (useful for testing).
   */
  reset(ip) {
    this.records.delete(ip);
  }
  /**
   * Reset all rate limits (useful for testing).
   */
  resetAll() {
    this.records.clear();
  }
  /**
   * Stop the cleanup timer and release resources.
   */
  destroy() {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    this.records.clear();
  }
  /**
   * Start periodic cleanup of stale entries.
   */
  startCleanup() {
    this.cleanupTimer = setInterval(() => {
      this.cleanup();
    }, this.config.cleanupIntervalMs);
    this.cleanupTimer.unref?.();
  }
  /**
   * Remove entries that haven't been accessed recently.
   */
  cleanup() {
    const now = Date.now();
    const staleThreshold = now - this.config.windowMs * 10;
    for (const [ip, record] of this.records) {
      if (record.lastAccess < staleThreshold) {
        this.records.delete(ip);
      }
    }
  }
};

// src/server/subagent-mapper.ts
var CLEANUP_GRACE_PERIOD_MS = 5 * 60 * 1e3;
var SubagentMapper = class {
  /** agentId -> SubagentMapping */
  mappings = /* @__PURE__ */ new Map();
  /** parentSessionId -> Set<agentId> */
  sessionSubagents = /* @__PURE__ */ new Map();
  /**
   * Register a new subagent with its parent session.
   * Called when agent_start event is received.
   *
   * @param agentId Unique subagent identifier
   * @param parentSessionId Session ID of the parent that spawned this subagent
   * @param agentName Human-readable agent name
   * @param startTime ISO 8601 timestamp when the subagent started
   */
  registerSubagent(agentId, parentSessionId, agentName, startTime, parentAgentId) {
    const existing = this.mappings.get(agentId);
    if (existing) {
      if (existing.cleanupTimer) {
        clearTimeout(existing.cleanupTimer);
      }
      logger.debug(
        `[SubagentMapper] Re-registering subagent: ${agentId} (name: ${agentName})`
      );
    } else {
      logger.info(
        `[SubagentMapper] Registered subagent: ${agentId} (name: ${agentName}) under session: ${parentSessionId}${parentAgentId ? ` (parent agent: ${parentAgentId})` : ""}`
      );
    }
    this.mappings.set(agentId, {
      agentId,
      parentSessionId,
      agentName,
      startTime,
      status: "running",
      parentAgentId
    });
    let subagents = this.sessionSubagents.get(parentSessionId);
    if (!subagents) {
      subagents = /* @__PURE__ */ new Set();
      this.sessionSubagents.set(parentSessionId, subagents);
    }
    subagents.add(agentId);
  }
  /**
   * Mark a subagent as stopped and schedule cleanup.
   * Called when agent_stop event is received.
   *
   * @param agentId Unique subagent identifier
   * @param status Exit status of the subagent
   * @param endTime ISO 8601 timestamp when the subagent stopped
   */
  stopSubagent(agentId, status, endTime) {
    const mapping = this.mappings.get(agentId);
    if (!mapping) {
      logger.debug(
        `[SubagentMapper] Stop received for unknown subagent: ${agentId}`
      );
      return;
    }
    mapping.status = status;
    mapping.endTime = endTime;
    logger.info(
      `[SubagentMapper] Subagent stopped: ${agentId} (status: ${status}), scheduling cleanup in ${CLEANUP_GRACE_PERIOD_MS / 1e3}s`
    );
    mapping.cleanupTimer = setTimeout(() => {
      this.removeSubagent(agentId);
    }, CLEANUP_GRACE_PERIOD_MS);
  }
  /**
   * Remove a subagent from tracking.
   * Called after grace period or when parent session stops.
   *
   * @param agentId Unique subagent identifier
   */
  removeSubagent(agentId) {
    const mapping = this.mappings.get(agentId);
    if (!mapping) {
      return;
    }
    if (mapping.cleanupTimer) {
      clearTimeout(mapping.cleanupTimer);
    }
    const subagents = this.sessionSubagents.get(mapping.parentSessionId);
    if (subagents) {
      subagents.delete(agentId);
      if (subagents.size === 0) {
        this.sessionSubagents.delete(mapping.parentSessionId);
      }
    }
    this.mappings.delete(agentId);
    logger.debug(`[SubagentMapper] Removed subagent: ${agentId}`);
  }
  /**
   * Clean up all subagents for a session.
   * Called when parent session stops.
   *
   * @param sessionId Session ID of the parent session
   */
  cleanupSessionSubagents(sessionId) {
    const subagents = this.sessionSubagents.get(sessionId);
    if (!subagents || subagents.size === 0) {
      return;
    }
    logger.info(
      `[SubagentMapper] Cleaning up ${subagents.size} subagent(s) for session: ${sessionId}`
    );
    const agentIds = Array.from(subagents);
    for (const agentId of agentIds) {
      this.removeSubagent(agentId);
    }
  }
  /**
   * Get the parent session ID for a subagent.
   *
   * @param agentId Unique subagent identifier
   * @returns Parent session ID, or undefined if not found
   */
  getParentSession(agentId) {
    return this.mappings.get(agentId)?.parentSessionId;
  }
  /**
   * Get a subagent mapping by ID.
   *
   * @param agentId Unique subagent identifier
   * @returns Subagent mapping info, or undefined if not found
   */
  getSubagent(agentId) {
    const mapping = this.mappings.get(agentId);
    if (!mapping) {
      return void 0;
    }
    const { cleanupTimer: _, ...info } = mapping;
    return info;
  }
  /**
   * Get all subagents for a session.
   *
   * @param sessionId Session ID of the parent session
   * @returns Array of subagent mapping info
   */
  getSessionSubagents(sessionId) {
    const subagentIds = this.sessionSubagents.get(sessionId);
    if (!subagentIds || subagentIds.size === 0) {
      return [];
    }
    const result = [];
    for (const agentId of subagentIds) {
      const mapping = this.mappings.get(agentId);
      if (mapping) {
        const { cleanupTimer: _, ...info } = mapping;
        result.push(info);
      }
    }
    return result;
  }
  /**
   * Get all subagent mappings (for sending to clients on connect).
   *
   * @returns Array of all subagent mapping info
   */
  getAllMappings() {
    const result = [];
    for (const mapping of this.mappings.values()) {
      const { cleanupTimer: _, ...info } = mapping;
      result.push(info);
    }
    return result;
  }
  /**
   * Check if an agent ID is a subagent (vs main session).
   *
   * @param agentId Agent ID to check
   * @returns true if this is a tracked subagent
   */
  isSubagent(agentId) {
    return this.mappings.has(agentId);
  }
  /**
   * Clean up all resources.
   * Called on server shutdown.
   */
  destroy() {
    for (const mapping of this.mappings.values()) {
      if (mapping.cleanupTimer) {
        clearTimeout(mapping.cleanupTimer);
      }
    }
    this.mappings.clear();
    this.sessionSubagents.clear();
    logger.info("[SubagentMapper] Destroyed");
  }
};

// src/server/event-receiver.ts
var DEFAULT_EVENT_RATE_LIMIT = {
  maxRequests: 100,
  windowMs: 1e3,
  cleanupIntervalMs: 6e4
};
var EventReceiver = class _EventReceiver {
  hub;
  rateLimiter;
  /** Track tool start times for duration calculation */
  toolStartTimes = /* @__PURE__ */ new Map();
  /** Cleanup interval handle for stale tool starts */
  toolStartCleanupInterval = null;
  /** Max age for pending tool starts (5 minutes) */
  TOOL_START_TTL_MS = 5 * 60 * 1e3;
  /** Maximum number of pending tool starts to track */
  MAX_PENDING_TOOLS = 1e4;
  /** Subagent mapper for tracking parent-child relationships */
  subagentMapper;
  /** Server start time for uptime calculation */
  startTime = Date.now();
  /** Total events received counter */
  eventsReceived = 0;
  /** Events received by type */
  eventsByType = /* @__PURE__ */ new Map();
  constructor(hub, rateLimitConfig) {
    this.hub = hub;
    this.rateLimiter = new RateLimiter({
      ...DEFAULT_EVENT_RATE_LIMIT,
      ...rateLimitConfig
    });
    this.subagentMapper = new SubagentMapper();
    this.toolStartCleanupInterval = setInterval(() => this.cleanupStaleToolStarts(), 6e4);
  }
  /**
   * Clean up tool start times older than TTL.
   */
  cleanupStaleToolStarts() {
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
  destroy() {
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
  getSubagentMappings() {
    return this.subagentMapper.getAllMappings();
  }
  /**
   * Create a subagent_mapping event with current mappings.
   */
  createSubagentMappingEvent() {
    return {
      type: "subagent_mapping",
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      mappings: this.subagentMapper.getAllMappings()
    };
  }
  /**
   * Process agent lifecycle events and update subagent mappings.
   * Broadcasts mapping changes to all clients.
   */
  processAgentEvent(event) {
    if (event.type === "agent_start") {
      const agentId = event.agentId;
      const agentName = event.agentName || agentId.slice(0, 8);
      const parentSessionId = event.sessionId;
      if (agentId && parentSessionId) {
        const parentAgentId = event.parentAgentId;
        this.subagentMapper.registerSubagent(
          agentId,
          parentSessionId,
          agentName,
          event.timestamp,
          parentAgentId
        );
        this.hub.broadcast(this.createSubagentMappingEvent());
      }
    } else if (event.type === "agent_stop") {
      const agentId = event.agentId;
      const status = event.status || "success";
      if (agentId) {
        this.subagentMapper.stopSubagent(agentId, status, event.timestamp);
        this.hub.broadcast(this.createSubagentMappingEvent());
      }
    } else if (event.type === "session_stop") {
      const sessionId = event.sessionId;
      if (sessionId) {
        this.subagentMapper.cleanupSessionSubagents(sessionId);
        this.hub.broadcast(this.createSubagentMappingEvent());
      }
    }
  }
  /**
   * Handle incoming HTTP request.
   * Returns true if the request was handled, false otherwise.
   */
  async handleRequest(req, res) {
    const url = new URL(req.url || "/", `http://${req.headers.host}`);
    if (req.method === "POST" && url.pathname === "/event") {
      const clientIp = this.getClientIp(req);
      const rateLimitResult = this.rateLimiter.check(clientIp);
      if (!rateLimitResult.allowed) {
        this.sendRateLimited(res, rateLimitResult.retryAfterSeconds);
        return true;
      }
      await this.handleEventPost(req, res);
      return true;
    }
    if (req.method === "GET" && url.pathname === "/health") {
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
  getClientIp(req) {
    return req.socket.remoteAddress || "127.0.0.1";
  }
  /**
   * Send HTTP 429 Too Many Requests response.
   */
  sendRateLimited(res, retryAfterSeconds) {
    res.writeHead(429, {
      "Content-Type": "application/json",
      "X-Content-Type-Options": "nosniff",
      "Retry-After": String(retryAfterSeconds)
    });
    res.end(
      JSON.stringify({
        error: "Too Many Requests",
        retryAfter: retryAfterSeconds
      })
    );
    logger.warn("[EventReceiver] Rate limit exceeded");
  }
  /**
   * Handle POST /event - receive events from hooks.
   */
  async handleEventPost(req, res) {
    try {
      const body = await this.readRequestBody(req);
      let event = this.parseAndValidateEvent(body);
      if (!event) {
        this.sendError(res, 400, "Invalid event format");
        return;
      }
      this.eventsReceived++;
      this.eventsByType.set(event.type, (this.eventsByType.get(event.type) || 0) + 1);
      event = this.processToolTiming(event);
      this.processAgentEvent(event);
      this.hub.broadcast(event);
      res.writeHead(200, { "Content-Type": "application/json", "X-Content-Type-Options": "nosniff" });
      res.end(JSON.stringify({ success: true, type: event.type }));
      logger.debug(`[EventReceiver] Received and broadcast: ${event.type}`);
    } catch (error) {
      logger.error("[EventReceiver] Error handling event:", error);
      this.sendError(
        res,
        500,
        error instanceof Error ? error.message : "Internal server error"
      );
    }
  }
  /**
   * Process tool timing: track start times and calculate duration for end events.
   */
  processToolTiming(event) {
    if (event.type === "tool_start" && "toolCallId" in event && typeof event.toolCallId === "string") {
      if (this.toolStartTimes.has(event.toolCallId)) {
        logger.warn(`[EventReceiver] Duplicate tool_start for toolCallId=${event.toolCallId}; resetting start time`);
      }
      if (this.toolStartTimes.size >= this.MAX_PENDING_TOOLS) {
        const oldestKey = this.toolStartTimes.keys().next().value;
        if (oldestKey) this.toolStartTimes.delete(oldestKey);
      }
      this.toolStartTimes.set(event.toolCallId, Date.now());
    } else if (event.type === "tool_end" && "toolCallId" in event && typeof event.toolCallId === "string") {
      const toolCallId = event.toolCallId;
      const startTime = this.toolStartTimes.get(toolCallId);
      if (startTime) {
        const durationMs = Date.now() - startTime;
        this.toolStartTimes.delete(toolCallId);
        if (durationMs < 0) {
          logger.warn(`[EventReceiver] Ignoring negative tool duration for toolCallId=${toolCallId}`);
          return event;
        }
        if (!("durationMs" in event) || event.durationMs === void 0 || event.durationMs === null) {
          return { ...event, durationMs };
        }
      }
    }
    return event;
  }
  /**
   * Handle GET /health - health check endpoint.
   */
  handleHealthCheck(_req, res) {
    const uptimeMs = Date.now() - this.startTime;
    const status = {
      status: "ok",
      version: CONFIG.VERSION,
      uptime: uptimeMs,
      connections: this.hub.getClientCount(),
      events_received: this.eventsReceived,
      events_by_type: Object.fromEntries(this.eventsByType),
      timestamp: (/* @__PURE__ */ new Date()).toISOString()
    };
    res.writeHead(200, { "Content-Type": "application/json", "X-Content-Type-Options": "nosniff" });
    res.end(JSON.stringify(status));
  }
  /**
   * Read the request body as a string.
   *
   * Has a hard 5MB streaming limit to prevent memory exhaustion from extremely
   * large requests. This is separate from MAX_PAYLOAD_SIZE (100KB) which
   * controls content truncation in parseAndValidateEvent.
   */
  async readRequestBody(req) {
    const MAX_BODY_SIZE = 5 * 1024 * 1024;
    return new Promise((resolve4, reject) => {
      const chunks = [];
      let totalSize = 0;
      req.on("data", (chunk) => {
        totalSize += chunk.length;
        if (totalSize > MAX_BODY_SIZE) {
          req.destroy();
          reject(new Error("Request body too large"));
          return;
        }
        chunks.push(chunk);
      });
      req.on("end", () => {
        resolve4(Buffer.concat(chunks).toString("utf-8"));
      });
      req.on("error", (error) => {
        reject(error);
      });
    });
  }
  /**
   * Parse and validate the event from JSON body.
   */
  parseAndValidateEvent(body) {
    if (!body.trim()) {
      return null;
    }
    let parsed;
    try {
      parsed = JSON.parse(body);
    } catch {
      logger.warn("[EventReceiver] Invalid JSON in request body");
      return null;
    }
    if (!isMonitorEvent(parsed)) {
      const parsedObj = parsed;
      const typeValue = parsedObj?.type;
      const keys = Object.keys(parsedObj || {}).join(",");
      logger.warn(
        `[EventReceiver] Invalid event structure: type=${typeof typeValue === "string" ? typeValue : "undefined"}, keys=${keys}`
      );
      return null;
    }
    if (!this.validateIdFields(parsed)) {
      logger.warn("[EventReceiver] Rejected event with invalid ID format");
      return null;
    }
    const event = { ...parsed };
    if ("input" in event && typeof event.input === "string") {
      event.input = redactSecrets(truncatePayload(event.input) ?? "");
    }
    if ("output" in event && typeof event.output === "string") {
      event.output = redactSecrets(truncatePayload(event.output) ?? "");
    }
    if ("content" in event && typeof event.content === "string") {
      event.content = redactSecrets(truncatePayload(event.content) ?? "");
    }
    if ("workingDirectory" in event && typeof event.workingDirectory === "string") {
      event.workingDirectory = redactSecrets(event.workingDirectory);
    }
    return event;
  }
  /** Max length for ID fields */
  static MAX_ID_LENGTH = 256;
  /** Allowed characters in ID fields: alphanumeric, hyphens, underscores, dots */
  static ID_PATTERN = /^[a-zA-Z0-9._-]+$/;
  /**
   * Validate ID fields in an event (sessionId, agentId, toolCallId).
   * Rejects IDs that are too long or contain unexpected characters.
   */
  validateIdFields(event) {
    const idFields = ["sessionId", "agentId", "toolCallId"];
    for (const field of idFields) {
      const value = event[field];
      if (typeof value === "string") {
        if (value.length > _EventReceiver.MAX_ID_LENGTH) {
          return false;
        }
        if (!_EventReceiver.ID_PATTERN.test(value)) {
          return false;
        }
      }
    }
    return true;
  }
  /**
   * Send an error response.
   */
  sendError(res, code, message) {
    res.writeHead(code, { "Content-Type": "application/json", "X-Content-Type-Options": "nosniff" });
    res.end(JSON.stringify({ error: message }));
  }
};

// src/server/static-server.ts
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join as join3, resolve as resolve2 } from "node:path";

// src/server/path-validation.ts
import { realpathSync } from "node:fs";
import { basename, dirname, isAbsolute, join as join2, normalize, resolve } from "node:path";
function normalizeAbsolutePath(filePath) {
  if (typeof filePath !== "string" || filePath.length === 0 || !isAbsolute(filePath)) {
    return null;
  }
  return resolve(normalize(filePath));
}
function canonicalizePath(filePath) {
  const normalizedPath = resolve(normalize(filePath));
  const missingSegments = [];
  let probe = normalizedPath;
  while (true) {
    try {
      const realProbe = realpathSync(probe);
      if (missingSegments.length === 0) {
        return realProbe;
      }
      return join2(realProbe, ...missingSegments.reverse());
    } catch {
      const parent = dirname(probe);
      if (parent === probe) {
        return normalizedPath;
      }
      missingSegments.push(basename(probe));
      probe = parent;
    }
  }
}
function isPathWithin(filePath, baseDir) {
  const resolvedPath = canonicalizePath(filePath);
  const resolvedBaseDir = canonicalizePath(baseDir);
  return resolvedPath === resolvedBaseDir || resolvedPath.startsWith(resolvedBaseDir + "/");
}
function isPathWithinAny(filePath, baseDirs) {
  return baseDirs.some((baseDir) => isPathWithin(filePath, baseDir));
}

// src/server/static-server.ts
var MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf"
};
var StaticServer = class {
  server = null;
  dashboardDir;
  constructor(dashboardDir2) {
    this.dashboardDir = resolve2(dashboardDir2);
  }
  /**
   * Start the static file server.
   */
  start() {
    return new Promise((resolve4, reject) => {
      this.server = createServer(this.handleRequest.bind(this));
      this.server.on("error", (error) => {
        logger.error("[StaticServer] Server error:", error);
        reject(error);
      });
      this.server.listen(CONFIG.STATIC_PORT, CONFIG.HOST, () => {
        logger.info(
          `[StaticServer] Serving dashboard at http://${CONFIG.HOST}:${CONFIG.STATIC_PORT}`
        );
        resolve4();
      });
    });
  }
  /**
   * Handle incoming HTTP request.
   */
  async handleRequest(req, res) {
    try {
      if (req.method !== "GET") {
        this.sendError(res, 405, "Method Not Allowed");
        return;
      }
      const url = new URL(req.url || "/", `http://${req.headers.host}`);
      let pathname = url.pathname;
      if (pathname === "/") {
        pathname = "/index.html";
      }
      const filePath = this.resolveFilePath(pathname);
      if (!filePath) {
        this.sendError(res, 403, "Forbidden");
        return;
      }
      await this.serveFile(res, filePath);
    } catch (error) {
      logger.error("[StaticServer] Request error:", error);
      this.sendError(res, 500, "Internal Server Error");
    }
  }
  /**
   * Resolve and validate the file path.
   * Returns null if the path is outside the dashboard directory (security).
   */
  resolveFilePath(pathname) {
    const decoded = decodeURIComponent(pathname);
    const filePath = join3(this.dashboardDir, decoded);
    const resolved = resolve2(filePath);
    if (!isPathWithin(resolved, this.dashboardDir)) {
      logger.warn("[StaticServer] Path traversal attempt:", pathname);
      return null;
    }
    return resolved;
  }
  /**
   * Serve a static file.
   */
  async serveFile(res, filePath) {
    try {
      const stats = await stat(filePath);
      if (!stats.isFile()) {
        this.sendError(res, 404, "Not Found");
        return;
      }
      const content = await readFile(filePath);
      const ext = extname(filePath).toLowerCase();
      const contentType = MIME_TYPES[ext] || "application/octet-stream";
      res.writeHead(200, {
        "Content-Type": contentType,
        "Content-Length": content.length,
        "Cache-Control": "no-cache",
        // No caching during development
        "X-Content-Type-Options": "nosniff",
        // CSP: Defense-in-depth XSS protection
        // - 'self' for scripts (no inline scripts)
        // - 'unsafe-inline' for styles (required for dynamic theming)
        // - WebSocket and HTTP connections allowed to localhost WS port (for file actions API)
        "Content-Security-Policy": `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' ws://localhost:${CONFIG.WS_PORT} ws://127.0.0.1:${CONFIG.WS_PORT} http://localhost:${CONFIG.WS_PORT} http://127.0.0.1:${CONFIG.WS_PORT}`
      });
      res.end(content);
    } catch (error) {
      if (error.code === "ENOENT") {
        this.sendError(res, 404, "Not Found");
      } else {
        throw error;
      }
    }
  }
  /**
   * Send an error response.
   */
  sendError(res, code, message) {
    res.writeHead(code, { "Content-Type": "text/plain" });
    res.end(`${code} ${message}`);
  }
  /**
   * Stop the server.
   */
  stop() {
    return new Promise((resolve4) => {
      if (this.server) {
        this.server.close(() => {
          logger.info("[StaticServer] Stopped");
          resolve4();
        });
      } else {
        resolve4();
      }
    });
  }
};

// src/server/transcript-watcher.ts
import { watch, createReadStream } from "node:fs";
import { stat as stat2, readdir } from "node:fs/promises";
import { join as join4, dirname as dirname2 } from "node:path";
import * as readline from "node:readline";
import { homedir } from "node:os";
function extractWorkingDirectory(filePath) {
  const parentDir = dirname2(filePath);
  const dirName = parentDir.split("/").pop();
  if (!dirName || !dirName.startsWith("-")) {
    return void 0;
  }
  const workingDir = dirName.replace(/-/g, "/");
  if (!workingDir.startsWith("/")) {
    return void 0;
  }
  return workingDir;
}
function isValidClaudePathWithinRoot(filePath, claudeDir) {
  return isPathWithin(filePath, claudeDir);
}
var TranscriptWatcher = class _TranscriptWatcher {
  hub;
  claudeDir;
  projectsDir;
  trackedFiles = /* @__PURE__ */ new Map();
  projectsWatcher = null;
  subDirWatchers = /* @__PURE__ */ new Map();
  pollInterval = null;
  watcherReconcileInterval = null;
  isShuttingDown = false;
  /**
   * Flag to track if we're in the initial scanning phase.
   * During initial scan, files should be tracked but not processed (tail -f behavior).
   */
  isInitialScan = true;
  /**
   * Track sessions we've already announced via session_start events.
   * Maps sessionId to workingDirectory (if known).
   */
  announcedSessions = /* @__PURE__ */ new Map();
  /** Reconcile subdirectory watchers every 5 minutes to avoid stale watcher leaks. */
  static WATCHER_RECONCILE_INTERVAL_MS = 5 * 60 * 1e3;
  constructor(hub, options) {
    this.hub = hub;
    this.claudeDir = options?.claudeDir ?? (options?.projectsDir ? dirname2(options.projectsDir) : join4(homedir(), ".claude"));
    this.projectsDir = options?.projectsDir ?? join4(this.claudeDir, "projects");
  }
  /**
   * Start watching transcript files.
   */
  async start() {
    if (!this.isValidPath(this.projectsDir)) {
      logger.error("[TranscriptWatcher] Invalid projects directory path");
      return;
    }
    try {
      await stat2(this.projectsDir);
    } catch {
      logger.warn(`[TranscriptWatcher] Projects directory not found: ${this.projectsDir}`);
      logger.info("[TranscriptWatcher] Will retry when directory becomes available");
      this.startDirectoryPolling();
      return;
    }
    await this.initializeWatching();
  }
  /**
   * Poll for directory availability.
   */
  startDirectoryPolling() {
    if (this.pollInterval) {
      return;
    }
    this.pollInterval = setInterval(() => {
      (async () => {
        if (this.isShuttingDown) {
          return;
        }
        try {
          await stat2(this.projectsDir);
          this.stopPolling();
          await this.initializeWatching();
        } catch {
        }
      })().catch((error) => {
        logger.error(`[TranscriptWatcher] Error in directory polling:`, error instanceof Error ? error.message : "Unknown error");
      });
    }, CONFIG.TRANSCRIPT_POLL_INTERVAL_MS * 5);
  }
  /**
   * Stop polling interval.
   */
  stopPolling() {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
  }
  /**
   * Initialize file system watching.
   */
  async initializeWatching() {
    logger.info(`[TranscriptWatcher] Watching: ${this.projectsDir}`);
    this.isInitialScan = true;
    try {
      this.projectsWatcher = watch(this.projectsDir, { persistent: false }, (eventType, filename) => {
        if (this.isShuttingDown) return;
        if (eventType === "rename" && filename) {
          this.handleProjectChange(filename);
        }
      });
      this.projectsWatcher.on("error", (error) => {
        logger.error("[TranscriptWatcher] Projects watcher error:", error.message);
      });
    } catch (error) {
      logger.error("[TranscriptWatcher] Failed to watch projects directory:", error);
      return;
    }
    await this.scanProjectDirectories();
    this.isInitialScan = false;
    logger.debug(`[TranscriptWatcher] Initial scan complete, skipped to end of ${this.trackedFiles.size} existing files`);
    this.pollInterval = setInterval(() => {
      if (!this.isShuttingDown) {
        this.pollTrackedFiles();
      }
    }, CONFIG.TRANSCRIPT_POLL_INTERVAL_MS);
    this.startWatcherReconcileInterval();
    logger.info(`[TranscriptWatcher] Tracking ${this.trackedFiles.size} transcript files`);
  }
  /**
   * Handle changes in the projects directory.
   */
  async handleProjectChange(projectName) {
    const projectPath = join4(this.projectsDir, projectName);
    if (!this.isValidPath(projectPath)) {
      return;
    }
    try {
      const stats = await stat2(projectPath);
      if (stats.isDirectory()) {
        await this.watchProjectDirectory(projectPath);
      }
    } catch {
      this.cleanupProjectDirectory(projectPath);
    }
  }
  /**
   * Scan all project directories for transcript files.
   */
  async scanProjectDirectories() {
    try {
      const entries = await readdir(this.projectsDir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory() && !entry.name.startsWith(".")) {
          const projectPath = join4(this.projectsDir, entry.name);
          if (this.isValidPath(projectPath)) {
            await this.watchProjectDirectory(projectPath);
          }
        }
      }
    } catch (error) {
      logger.error("[TranscriptWatcher] Error scanning project directories:", error);
    }
  }
  /**
   * Watch a specific project directory for JSONL files.
   */
  async watchProjectDirectory(projectPath) {
    if (this.subDirWatchers.has(projectPath)) {
      return;
    }
    try {
      const watcher = watch(projectPath, { persistent: false }, (_eventType, filename) => {
        if (this.isShuttingDown) return;
        if (filename?.endsWith(".jsonl")) {
          this.handleFileChange(join4(projectPath, filename));
        }
      });
      watcher.on("error", (error) => {
        logger.error(`[TranscriptWatcher] Directory watcher error for ${projectPath}:`, error.message);
      });
      this.subDirWatchers.set(projectPath, watcher);
      const entries = await readdir(projectPath, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isFile() && entry.name.endsWith(".jsonl")) {
          const filePath = join4(projectPath, entry.name);
          await this.trackFile(filePath);
        }
      }
    } catch (error) {
      logger.error(`[TranscriptWatcher] Error watching project directory ${projectPath}:`, error);
    }
  }
  /**
   * Clean up watchers for a removed project directory.
   */
  cleanupProjectDirectory(projectPath) {
    const watcher = this.subDirWatchers.get(projectPath);
    if (watcher) {
      try {
        watcher.close();
      } catch {
      }
      this.subDirWatchers.delete(projectPath);
    }
    for (const [filePath, tracked] of this.trackedFiles) {
      if (dirname2(filePath) === projectPath) {
        if (tracked.watcher) {
          try {
            tracked.watcher.close();
          } catch {
          }
        }
        this.trackedFiles.delete(filePath);
      }
    }
  }
  /**
   * Periodically reconcile watched subdirectories to clean up stale watchers.
   * This prevents watcher leaks when filesystem events are missed.
   */
  startWatcherReconcileInterval() {
    if (this.watcherReconcileInterval) {
      return;
    }
    this.watcherReconcileInterval = setInterval(() => {
      if (this.isShuttingDown) {
        return;
      }
      (async () => {
        const watchedPaths = Array.from(this.subDirWatchers.keys());
        for (const projectPath of watchedPaths) {
          try {
            const stats = await stat2(projectPath);
            if (!stats.isDirectory()) {
              this.cleanupProjectDirectory(projectPath);
            }
          } catch {
            this.cleanupProjectDirectory(projectPath);
          }
        }
      })().catch((error) => {
        logger.error(
          "[TranscriptWatcher] Error reconciling subdirectory watchers:",
          error instanceof Error ? error.message : "Unknown error"
        );
      });
    }, _TranscriptWatcher.WATCHER_RECONCILE_INTERVAL_MS);
  }
  /**
   * Handle changes to a specific JSONL file.
   */
  async handleFileChange(filePath) {
    if (!this.isValidPath(filePath)) {
      return;
    }
    await this.trackFile(filePath);
  }
  /**
   * Start tracking a transcript file.
   *
   * CRITICAL: For files discovered during initial scan (startup), we skip ALL existing content
   * to avoid flooding the dashboard with historical data. We use file SIZE as the marker,
   * not line count, to ensure we only process bytes written AFTER we start tracking.
   */
  /**
   * Extract session ID from a transcript file path.
   * Transcript files are named with their session ID: {session-id}.jsonl
   */
  extractSessionIdFromPath(filePath) {
    const filename = filePath.split("/").pop();
    if (!filename || !filename.endsWith(".jsonl")) {
      return void 0;
    }
    return filename.slice(0, -6);
  }
  async trackFile(filePath) {
    if (!this.isValidPath(filePath) || this.trackedFiles.has(filePath)) {
      return;
    }
    try {
      const stats = await stat2(filePath);
      if (!stats.isFile()) {
        return;
      }
      const sessionId = this.extractSessionIdFromPath(filePath);
      const workingDirectory = extractWorkingDirectory(filePath);
      if (!this.isInitialScan && sessionId && !this.announcedSessions.has(sessionId)) {
        this.announcedSessions.set(sessionId, workingDirectory);
        this.broadcastSessionStart(sessionId, workingDirectory);
      }
      if (this.isInitialScan) {
        this.trackedFiles.set(filePath, {
          path: filePath,
          lastSize: stats.size,
          lastOffset: stats.size,
          // Start reading from end of file
          lastProcessedLine: 0,
          isInitialFile: true
        });
      } else {
        this.trackedFiles.set(filePath, {
          path: filePath,
          lastSize: 0,
          // Start from 0 so first check processes all content
          lastOffset: 0,
          // Start reading from beginning
          lastProcessedLine: 0,
          isInitialFile: false
        });
      }
    } catch (error) {
      if (error.code !== "ENOENT") {
        logger.error(`[TranscriptWatcher] Error tracking file ${filePath}:`, error);
      }
    }
  }
  /**
   * Poll tracked files for updates.
   */
  async pollTrackedFiles() {
    const promises = [];
    for (const [filePath, tracked] of this.trackedFiles) {
      promises.push(this.checkFileForUpdates(filePath, tracked));
    }
    await Promise.allSettled(promises);
  }
  /**
   * Check a specific file for updates.
   */
  async checkFileForUpdates(filePath, tracked) {
    try {
      const stats = await stat2(filePath);
      if (stats.size > tracked.lastOffset) {
        await this.processFileUpdates(filePath);
        tracked.lastSize = stats.size;
      }
    } catch (error) {
      if (error.code === "ENOENT") {
        this.trackedFiles.delete(filePath);
      }
    }
  }
  /**
   * Read new lines from a file starting at a byte offset.
   * Uses streaming to avoid loading the entire file into memory.
   *
   * @param filePath - Path to the file to read
   * @param fromOffset - Byte offset to start reading from
   * @returns Object containing the new lines and the new byte offset
   */
  async readNewLines(filePath, fromOffset) {
    const lines = [];
    return new Promise((resolve4, reject) => {
      let settled = false;
      const stream = createReadStream(filePath, {
        start: fromOffset,
        encoding: "utf-8"
      });
      const rl = readline.createInterface({
        input: stream,
        crlfDelay: Infinity
      });
      rl.on("line", (line) => {
        if (line.trim()) {
          lines.push(line);
        }
      });
      rl.on("close", async () => {
        if (settled) {
          return;
        }
        try {
          const stats = await stat2(filePath);
          settled = true;
          resolve4({ lines, newOffset: stats.size });
        } catch (error) {
          settled = true;
          reject(error);
        }
      });
      rl.on("error", (error) => {
        if (settled) {
          return;
        }
        settled = true;
        try {
          rl.close();
        } catch {
        }
        stream.destroy();
        reject(error);
      });
      stream.on("error", (error) => {
        if (settled) {
          return;
        }
        settled = true;
        try {
          rl.close();
        } catch {
        }
        stream.destroy();
        reject(error);
      });
    });
  }
  /**
   * Process new content from a transcript file.
   * Uses byte-offset streaming to only read newly appended content.
   */
  async processFileUpdates(filePath) {
    const tracked = this.trackedFiles.get(filePath);
    if (!tracked) {
      return;
    }
    try {
      const { lines, newOffset } = await this.readNewLines(filePath, tracked.lastOffset);
      for (const line of lines) {
        await this.processLine(line, filePath);
      }
      tracked.lastOffset = newOffset;
      tracked.lastProcessedLine += lines.length;
    } catch (error) {
      logger.error(`[TranscriptWatcher] Error processing file ${filePath}:`, error);
    }
  }
  /**
   * Process a single JSONL line.
   */
  async processLine(line, filePath) {
    if (!line.trim()) {
      return;
    }
    let parsed;
    try {
      parsed = JSON.parse(line);
    } catch {
      return;
    }
    const workingDirectory = extractWorkingDirectory(filePath);
    if (parsed.sessionId && !this.announcedSessions.has(parsed.sessionId)) {
      this.announcedSessions.set(parsed.sessionId, workingDirectory);
      this.broadcastSessionStart(parsed.sessionId, workingDirectory, parsed.timestamp);
    }
    const thinkingBlocks = this.extractThinking(parsed);
    for (const thinking of thinkingBlocks) {
      this.broadcastThinking(thinking, parsed.sessionId, parsed.agentId, parsed.timestamp);
    }
  }
  /**
   * Broadcast a session_start event when a new session is first seen.
   */
  broadcastSessionStart(sessionId, workingDirectory, timestamp) {
    const event = {
      type: "session_start",
      timestamp: timestamp || (/* @__PURE__ */ new Date()).toISOString(),
      sessionId,
      workingDirectory
    };
    this.hub.broadcast(event);
    logger.debug(`[TranscriptWatcher] Broadcast session_start for ${sessionId} (${workingDirectory || "no path"})`);
  }
  /**
   * Extract thinking content from a transcript line.
   */
  extractThinking(line) {
    const thinkingBlocks = [];
    if (line.message?.role !== "assistant" || !line.message?.content) {
      return thinkingBlocks;
    }
    for (const block of line.message.content) {
      if (block.type === "thinking" && block.thinking) {
        thinkingBlocks.push(block.thinking);
      }
    }
    return thinkingBlocks;
  }
  /**
   * Broadcast a thinking event to connected clients.
   */
  broadcastThinking(content, sessionId, agentId, timestamp) {
    const safeContent = redactSecrets(truncatePayload(content) ?? "");
    const event = {
      type: "thinking",
      timestamp: timestamp || (/* @__PURE__ */ new Date()).toISOString(),
      content: safeContent,
      sessionId,
      agentId
    };
    this.hub.broadcast(event);
    logger.debug(`[TranscriptWatcher] Broadcast thinking (${safeContent.slice(0, 50)}...)`);
  }
  /**
   * Get all known sessions with their working directories.
   * Used to send session_start events to newly connected clients.
   */
  getKnownSessions() {
    return Array.from(this.announcedSessions.entries()).map(([sessionId, workingDirectory]) => ({
      sessionId,
      workingDirectory
    }));
  }
  /**
   * Stop watching transcript files.
   */
  stop() {
    this.isShuttingDown = true;
    this.stopPolling();
    if (this.watcherReconcileInterval) {
      clearInterval(this.watcherReconcileInterval);
      this.watcherReconcileInterval = null;
    }
    for (const [, tracked] of this.trackedFiles) {
      if (tracked.watcher) {
        try {
          tracked.watcher.close();
        } catch {
        }
      }
    }
    this.trackedFiles.clear();
    for (const [, watcher] of this.subDirWatchers) {
      try {
        watcher.close();
      } catch {
      }
    }
    this.subDirWatchers.clear();
    if (this.projectsWatcher) {
      try {
        this.projectsWatcher.close();
      } catch {
      }
      this.projectsWatcher = null;
    }
    logger.info("[TranscriptWatcher] Stopped");
  }
  /**
   * Get the number of tracked files.
   */
  getTrackedFileCount() {
    return this.trackedFiles.size;
  }
  /**
   * Check if the watcher is running.
   */
  isRunning() {
    return !this.isShuttingDown && (this.projectsWatcher !== null || this.pollInterval !== null);
  }
  /**
   * Validate that a path is inside the configured Claude root.
   */
  isValidPath(filePath) {
    return isValidClaudePathWithinRoot(filePath, this.claudeDir);
  }
};

// src/server/plan-watcher.ts
import { watch as watch2 } from "node:fs";
import { readFile as readFile2, stat as stat3, readdir as readdir2 } from "node:fs/promises";
import { join as join5, basename as basename2 } from "node:path";
import { homedir as homedir2 } from "node:os";

// src/server/change-detection.ts
import { createHash } from "node:crypto";
function hashContent(content) {
  return createHash("sha256").update(content).digest("hex");
}
function hashContentParts(parts) {
  const hash = createHash("sha256");
  for (const part of parts) {
    hash.update(String(Buffer.byteLength(part, "utf8")));
    hash.update(":");
    hash.update(part);
    hash.update("\0");
  }
  return hash.digest("hex");
}

// src/server/plan-watcher.ts
function isValidPlanPathWithinRoot(filePath, plansDir) {
  return isPathWithin(filePath, plansDir);
}
var PlanWatcher = class _PlanWatcher {
  hub;
  plansDir;
  trackedPlans = /* @__PURE__ */ new Map();
  directoryWatcher = null;
  pollInterval = null;
  isShuttingDown = false;
  /** Polling interval for checking file updates (ms) */
  static POLL_INTERVAL_MS = 2e3;
  constructor(hub, options) {
    this.hub = hub;
    this.plansDir = options?.plansDir ?? join5(homedir2(), ".claude", "plans");
  }
  /**
   * Start watching the plans directory.
   */
  async start() {
    if (!this.isValidPath(this.plansDir)) {
      logger.error("[PlanWatcher] Invalid plans directory path");
      return;
    }
    try {
      await stat3(this.plansDir);
    } catch {
      logger.warn(`[PlanWatcher] Plans directory not found: ${this.plansDir}`);
      logger.info("[PlanWatcher] Will retry when directory becomes available");
      this.startDirectoryPolling();
      return;
    }
    await this.initializeWatching();
  }
  /**
   * Poll for directory availability.
   */
  startDirectoryPolling() {
    if (this.pollInterval) {
      return;
    }
    this.pollInterval = setInterval(async () => {
      if (this.isShuttingDown) {
        return;
      }
      try {
        await stat3(this.plansDir);
        this.stopPolling();
        await this.initializeWatching();
      } catch {
      }
    }, _PlanWatcher.POLL_INTERVAL_MS * 2);
  }
  /**
   * Stop polling interval.
   */
  stopPolling() {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
  }
  /**
   * Initialize file system watching.
   */
  async initializeWatching() {
    logger.info(`[PlanWatcher] Watching: ${this.plansDir}`);
    try {
      this.directoryWatcher = watch2(this.plansDir, { persistent: false }, (eventType, filename) => {
        if (this.isShuttingDown) return;
        if (filename?.endsWith(".md")) {
          this.handleFileEvent(eventType, filename);
        }
      });
      this.directoryWatcher.on("error", (error) => {
        logger.error("[PlanWatcher] Directory watcher error:", error.message);
      });
    } catch (error) {
      logger.error("[PlanWatcher] Failed to watch plans directory:", error);
      return;
    }
    await this.scanPlanFiles();
    this.pollInterval = setInterval(() => {
      if (!this.isShuttingDown) {
        this.pollTrackedFiles();
      }
    }, _PlanWatcher.POLL_INTERVAL_MS);
    logger.info(`[PlanWatcher] Tracking ${this.trackedPlans.size} plan files`);
  }
  /**
   * Scan the plans directory for existing .md files.
   */
  async scanPlanFiles() {
    try {
      const entries = await readdir2(this.plansDir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isFile() && entry.name.endsWith(".md")) {
          const filePath = join5(this.plansDir, entry.name);
          if (this.isValidPath(filePath)) {
            await this.trackPlanFile(filePath);
          }
        }
      }
    } catch (error) {
      logger.error("[PlanWatcher] Error scanning plans directory:", error);
    }
  }
  /**
   * Handle file system events.
   */
  handleFileEvent(_eventType, filename) {
    const filePath = join5(this.plansDir, filename);
    if (!this.isValidPath(filePath)) {
      return;
    }
    setTimeout(() => {
      (async () => {
        if (this.isShuttingDown) return;
        try {
          await stat3(filePath);
          await this.processPlanUpdate(filePath);
        } catch {
          this.handlePlanDelete(filePath, filename);
        }
      })().catch((error) => {
        logger.error(`[PlanWatcher] Error in file event handler:`, error instanceof Error ? error.message : "Unknown error");
      });
    }, 100);
  }
  /**
   * Start tracking a plan file.
   */
  async trackPlanFile(filePath) {
    if (!this.isValidPath(filePath)) {
      return;
    }
    try {
      const stats = await stat3(filePath);
      if (!stats.isFile()) {
        return;
      }
      const content = await readFile2(filePath, "utf-8");
      const filename = basename2(filePath);
      const contentHash = hashContent(content);
      this.trackedPlans.set(filePath, {
        path: filePath,
        filename,
        lastModified: stats.mtimeMs,
        contentHash
      });
      this.broadcastPlanUpdate(filePath, filename, content, stats.mtimeMs);
    } catch (error) {
      if (error.code !== "ENOENT") {
        logger.error(`[PlanWatcher] Error tracking plan file ${filePath}:`, error);
      }
    }
  }
  /**
   * Process an update to a plan file.
   */
  async processPlanUpdate(filePath) {
    if (!this.isValidPath(filePath)) {
      return;
    }
    try {
      const stats = await stat3(filePath);
      const content = await readFile2(filePath, "utf-8");
      const filename = basename2(filePath);
      const contentHash = hashContent(content);
      const tracked = this.trackedPlans.get(filePath);
      if (!tracked || tracked.contentHash !== contentHash) {
        this.trackedPlans.set(filePath, {
          path: filePath,
          filename,
          lastModified: stats.mtimeMs,
          contentHash
        });
        this.broadcastPlanUpdate(filePath, filename, content, stats.mtimeMs);
      }
    } catch (error) {
      if (error.code !== "ENOENT") {
        logger.error(`[PlanWatcher] Error processing plan update ${filePath}:`, error);
      }
    }
  }
  /**
   * Handle plan file deletion.
   */
  handlePlanDelete(filePath, filename) {
    const tracked = this.trackedPlans.get(filePath);
    if (tracked) {
      this.trackedPlans.delete(filePath);
      this.broadcastPlanDelete(filePath, filename);
    }
  }
  /**
   * Poll tracked files for updates.
   */
  async pollTrackedFiles() {
    try {
      const entries = await readdir2(this.plansDir, { withFileTypes: true });
      const currentFiles = /* @__PURE__ */ new Set();
      for (const entry of entries) {
        if (entry.isFile() && entry.name.endsWith(".md")) {
          const filePath = join5(this.plansDir, entry.name);
          currentFiles.add(filePath);
          if (this.isValidPath(filePath)) {
            if (!this.trackedPlans.has(filePath)) {
              await this.trackPlanFile(filePath);
            } else {
              await this.checkFileForUpdates(filePath);
            }
          }
        }
      }
      for (const [filePath, tracked] of this.trackedPlans) {
        if (!currentFiles.has(filePath)) {
          this.handlePlanDelete(filePath, tracked.filename);
        }
      }
    } catch (error) {
      if (error.code !== "ENOENT") {
        logger.error("[PlanWatcher] Error polling plans directory:", error);
      }
    }
  }
  /**
   * Check a specific file for updates.
   */
  async checkFileForUpdates(filePath) {
    const tracked = this.trackedPlans.get(filePath);
    if (!tracked) {
      return;
    }
    try {
      const stats = await stat3(filePath);
      if (stats.mtimeMs > tracked.lastModified) {
        await this.processPlanUpdate(filePath);
      }
    } catch (error) {
      if (error.code === "ENOENT") {
        this.handlePlanDelete(filePath, tracked.filename);
      }
    }
  }
  /**
   * Broadcast a plan update event to connected clients.
   */
  broadcastPlanUpdate(path, filename, content, lastModified) {
    const safeContent = redactSecrets(truncatePayload(content) ?? "");
    const event = {
      type: "plan_update",
      timestamp: lastModified ? new Date(lastModified).toISOString() : (/* @__PURE__ */ new Date()).toISOString(),
      path,
      filename,
      content: safeContent,
      lastModified
    };
    this.hub.broadcast(event);
    logger.debug(`[PlanWatcher] Broadcast plan update: ${filename}`);
  }
  /**
   * Broadcast a plan delete event to connected clients.
   */
  broadcastPlanDelete(path, filename) {
    const event = {
      type: "plan_delete",
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      path,
      filename
    };
    this.hub.broadcast(event);
    logger.debug(`[PlanWatcher] Broadcast plan delete: ${filename}`);
  }
  /**
   * Stop watching plan files.
   */
  stop() {
    this.isShuttingDown = true;
    this.stopPolling();
    if (this.directoryWatcher) {
      try {
        this.directoryWatcher.close();
      } catch {
      }
      this.directoryWatcher = null;
    }
    this.trackedPlans.clear();
    logger.info("[PlanWatcher] Stopped");
  }
  /**
   * Get the number of tracked plan files.
   */
  getTrackedPlanCount() {
    return this.trackedPlans.size;
  }
  /**
   * Check if the watcher is running.
   */
  isRunning() {
    return !this.isShuttingDown && (this.directoryWatcher !== null || this.pollInterval !== null);
  }
  /**
   * Get list of tracked plan filenames.
   */
  getTrackedPlans() {
    return Array.from(this.trackedPlans.values()).map((p) => p.filename);
  }
  /**
   * Get detailed info for all tracked plans.
   * Returns array sorted by lastModified (most recent first).
   */
  getAllPlansInfo() {
    return Array.from(this.trackedPlans.values()).map((p) => ({
      path: p.path,
      filename: p.filename,
      lastModified: p.lastModified
    })).sort((a, b) => b.lastModified - a.lastModified);
  }
  /**
   * Get the PlanListEvent containing all tracked plans.
   */
  getPlanListEvent() {
    return {
      type: "plan_list",
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      plans: this.getAllPlansInfo()
    };
  }
  /**
   * Get a specific plan's content by path.
   * Returns null if the plan is not tracked or cannot be read.
   */
  async getPlanContent(planPath) {
    if (!this.isValidPath(planPath)) {
      return null;
    }
    const tracked = this.trackedPlans.get(planPath);
    if (!tracked) {
      return null;
    }
    try {
      const content = await readFile2(planPath, "utf-8");
      const safeContent = redactSecrets(truncatePayload(content) ?? "");
      return {
        type: "plan_update",
        timestamp: new Date(tracked.lastModified).toISOString(),
        path: tracked.path,
        filename: tracked.filename,
        content: safeContent,
        lastModified: tracked.lastModified
      };
    } catch {
      return null;
    }
  }
  /**
   * Get the most recently modified plan as a PlanUpdateEvent.
   * Returns null if no plans are tracked.
   */
  async getMostRecentPlanEvent() {
    if (this.trackedPlans.size === 0) {
      return null;
    }
    let mostRecent = null;
    for (const plan of this.trackedPlans.values()) {
      if (!mostRecent || plan.lastModified > mostRecent.lastModified) {
        mostRecent = plan;
      }
    }
    if (!mostRecent) {
      return null;
    }
    try {
      const content = await readFile2(mostRecent.path, "utf-8");
      const safeContent = redactSecrets(truncatePayload(content) ?? "");
      return {
        type: "plan_update",
        timestamp: new Date(mostRecent.lastModified).toISOString(),
        path: mostRecent.path,
        filename: mostRecent.filename,
        content: safeContent,
        lastModified: mostRecent.lastModified
      };
    } catch {
      return null;
    }
  }
  /**
   * Validate that a path is inside the configured plans root.
   */
  isValidPath(filePath) {
    return isValidPlanPathWithinRoot(filePath, this.plansDir);
  }
};

// src/server/team-watcher.ts
import { readFile as readFile3, stat as stat4, readdir as readdir3 } from "node:fs/promises";
import { join as join6 } from "node:path";
import { homedir as homedir3 } from "node:os";
var POLL_INTERVAL_MS = 2e3;
var TeamWatcher = class {
  hub;
  teamsDir;
  tasksDir;
  trackedTeams = /* @__PURE__ */ new Map();
  trackedTaskDirs = /* @__PURE__ */ new Map();
  pollInterval = null;
  isShuttingDown = false;
  constructor(hub, options) {
    this.hub = hub;
    this.teamsDir = options?.teamsDir ?? join6(homedir3(), ".claude", "teams");
    this.tasksDir = options?.tasksDir ?? join6(homedir3(), ".claude", "tasks");
  }
  /**
   * Start watching team and task directories.
   */
  async start() {
    logger.info(`[TeamWatcher] Watching: ${this.teamsDir} and ${this.tasksDir}`);
    await this.poll();
    this.pollInterval = setInterval(() => {
      if (!this.isShuttingDown) {
        this.poll().catch((error) => {
          logger.error("[TeamWatcher] Poll error:", error instanceof Error ? error.message : "Unknown error");
        });
      }
    }, POLL_INTERVAL_MS);
    logger.info(`[TeamWatcher] Tracking ${this.trackedTeams.size} team(s), ${this.trackedTaskDirs.size} task dir(s)`);
  }
  /**
   * Stop watching.
   */
  stop() {
    this.isShuttingDown = true;
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
    this.trackedTeams.clear();
    this.trackedTaskDirs.clear();
    logger.info("[TeamWatcher] Stopped");
  }
  /**
   * Get current team events for sending to newly connected clients.
   */
  getTeamEvents() {
    const events = [];
    for (const team of this.trackedTeams.values()) {
      events.push({
        type: "team_update",
        timestamp: team.detectedAt,
        teamName: team.teamName,
        members: team.members
      });
    }
    return events;
  }
  /**
   * Get current task events for sending to newly connected clients.
   */
  getTaskEvents() {
    const events = [];
    for (const taskDir of this.trackedTaskDirs.values()) {
      events.push({
        type: "task_update",
        timestamp: taskDir.detectedAt,
        teamId: taskDir.teamId,
        tasks: taskDir.tasks
      });
    }
    return events;
  }
  /**
   * Poll both directories for changes.
   */
  async poll() {
    await Promise.all([
      this.pollTeams(),
      this.pollTasks()
    ]);
  }
  /**
   * Poll ~/.claude/teams/ for team config changes.
   */
  async pollTeams() {
    try {
      await stat4(this.teamsDir);
    } catch {
      if (this.trackedTeams.size > 0) {
        this.trackedTeams.clear();
      }
      return;
    }
    try {
      const entries = await readdir3(this.teamsDir, { withFileTypes: true });
      const currentTeamNames = /* @__PURE__ */ new Set();
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const teamName = entry.name;
        currentTeamNames.add(teamName);
        const configPath = join6(this.teamsDir, teamName, "config.json");
        if (!this.isValidPath(configPath)) continue;
        try {
          const content = await readFile3(configPath, "utf-8");
          const contentHash = hashContent(content);
          const existing = this.trackedTeams.get(teamName);
          if (!existing || existing.contentHash !== contentHash) {
            const members = this.parseTeamConfig(content);
            this.trackedTeams.set(teamName, {
              teamName,
              contentHash,
              members,
              detectedAt: existing?.detectedAt || (/* @__PURE__ */ new Date()).toISOString()
            });
            this.broadcastTeamUpdate(teamName, members);
          }
        } catch {
        }
      }
      for (const [teamName] of this.trackedTeams) {
        if (!currentTeamNames.has(teamName)) {
          this.trackedTeams.delete(teamName);
          this.broadcastTeamUpdate(teamName, []);
        }
      }
    } catch (error) {
      if (error.code !== "ENOENT") {
        logger.error("[TeamWatcher] Error polling teams directory:", error);
      }
    }
  }
  /**
   * Poll ~/.claude/tasks/ for task file changes.
   */
  async pollTasks() {
    try {
      await stat4(this.tasksDir);
    } catch {
      if (this.trackedTaskDirs.size > 0) {
        this.trackedTaskDirs.clear();
      }
      return;
    }
    try {
      const entries = await readdir3(this.tasksDir, { withFileTypes: true });
      const currentTeamIds = /* @__PURE__ */ new Set();
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const teamId = entry.name;
        currentTeamIds.add(teamId);
        const taskDirPath = join6(this.tasksDir, teamId);
        if (!this.isValidPath(taskDirPath)) continue;
        try {
          const taskFiles = await readdir3(taskDirPath, { withFileTypes: true });
          const jsonFiles = taskFiles.filter((f) => f.isFile() && f.name.endsWith(".json")).sort((a, b) => a.name.localeCompare(b.name));
          const hashParts = [];
          const tasks = [];
          const taskFileResults = await Promise.all(
            jsonFiles.map(async (taskFile) => {
              const taskPath = join6(taskDirPath, taskFile.name);
              if (!this.isValidPath(taskPath)) {
                return null;
              }
              try {
                const content = await readFile3(taskPath, "utf-8");
                return { name: taskFile.name, content };
              } catch {
                return null;
              }
            })
          );
          for (const result of taskFileResults) {
            if (!result) {
              continue;
            }
            hashParts.push(result.name, result.content);
            const task = this.parseTaskFile(result.content);
            if (task) {
              tasks.push(task);
            }
          }
          const contentHash = hashContentParts(hashParts);
          const existing = this.trackedTaskDirs.get(teamId);
          if (!existing || existing.contentHash !== contentHash) {
            this.trackedTaskDirs.set(teamId, {
              teamId,
              contentHash,
              tasks,
              detectedAt: existing?.detectedAt || (/* @__PURE__ */ new Date()).toISOString()
            });
            this.broadcastTaskUpdate(teamId, tasks);
          }
        } catch {
        }
      }
      for (const [teamId] of this.trackedTaskDirs) {
        if (!currentTeamIds.has(teamId)) {
          this.trackedTaskDirs.delete(teamId);
          this.broadcastTaskUpdate(teamId, []);
        }
      }
    } catch (error) {
      if (error.code !== "ENOENT") {
        logger.error("[TeamWatcher] Error polling tasks directory:", error);
      }
    }
  }
  /**
   * Parse a team config.json into TeamMemberInfo[].
   */
  parseTeamConfig(content) {
    try {
      const config = JSON.parse(content);
      if (!config.members || !Array.isArray(config.members)) {
        return [];
      }
      return config.members.filter((m) => m && typeof m.name === "string").map((m) => ({
        name: String(m.name),
        agentId: String(m.agentId || ""),
        agentType: String(m.agentType || ""),
        status: m.status
      }));
    } catch {
      return [];
    }
  }
  /**
   * Parse a task JSON file into TaskInfo.
   */
  parseTaskFile(content) {
    try {
      const task = JSON.parse(content);
      if (!task || typeof task.id !== "string") {
        if (!task.subject) return null;
      }
      return {
        id: String(task.id || ""),
        subject: redactSecrets(String(task.subject || "")),
        description: task.description ? redactSecrets(String(task.description)) : void 0,
        activeForm: task.activeForm ? String(task.activeForm) : void 0,
        status: this.normalizeTaskStatus(task.status),
        owner: task.owner ? String(task.owner) : void 0,
        blocks: Array.isArray(task.blocks) ? task.blocks.map(String) : [],
        blockedBy: Array.isArray(task.blockedBy) ? task.blockedBy.map(String) : []
      };
    } catch {
      return null;
    }
  }
  /**
   * Normalize task status to valid enum value.
   */
  normalizeTaskStatus(status) {
    if (status === "pending" || status === "in_progress" || status === "completed") {
      return status;
    }
    return "pending";
  }
  /**
   * Validate that a path is inside the configured teams/tasks roots.
   */
  isValidPath(filePath) {
    return isPathWithinAny(filePath, [this.teamsDir, this.tasksDir]);
  }
  /**
   * Broadcast a team update event.
   */
  broadcastTeamUpdate(teamName, members) {
    const event = {
      type: "team_update",
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      teamName,
      members
    };
    this.hub.broadcast(event);
    logger.debug(`[TeamWatcher] Broadcast team update: ${teamName} (${members.length} members)`);
  }
  /**
   * Broadcast a task update event.
   */
  broadcastTaskUpdate(teamId, tasks) {
    const event = {
      type: "task_update",
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      teamId,
      tasks
    };
    this.hub.broadcast(event);
    logger.debug(`[TeamWatcher] Broadcast task update: ${teamId} (${tasks.length} tasks)`);
  }
};

// src/server/file-actions.ts
import { spawn } from "node:child_process";
import { isAbsolute as isAbsolute2, resolve as resolve3 } from "node:path";
import { homedir as homedir4 } from "node:os";
var ALLOWED_BASE_DIR = resolve3(homedir4(), ".claude");
function isAllowedPath(filePath) {
  const normalizedPath = normalizeAbsolutePath(filePath);
  if (!normalizedPath) {
    return false;
  }
  return isPathWithin(normalizedPath, ALLOWED_BASE_DIR);
}
function isSafeRevealPath(filePath) {
  return normalizeAbsolutePath(filePath) !== null;
}
function validateRequest(body) {
  if (typeof body !== "object" || body === null) {
    return "Invalid request body";
  }
  const req = body;
  if (req.action !== "open" && req.action !== "reveal") {
    return 'Invalid action. Must be "open" or "reveal"';
  }
  if (typeof req.path !== "string" || req.path.length === 0) {
    return "Invalid path. Must be a non-empty string";
  }
  if (!isAbsolute2(req.path)) {
    return "Invalid path. Must be an absolute path starting with /";
  }
  if (req.action === "reveal") {
    if (!isSafeRevealPath(req.path)) {
      return "Invalid path for reveal action";
    }
  } else {
    if (!isAllowedPath(req.path)) {
      return "Access denied. Path must be within ~/.claude/ directory";
    }
  }
  return null;
}
function getOpenCommand() {
  switch (process.platform) {
    case "darwin":
      return { cmd: "open", revealFlag: ["-R"] };
    case "win32":
      return { cmd: "explorer", revealFlag: ["/select,"] };
    default:
      return { cmd: "xdg-open", revealFlag: [] };
  }
}
async function executeFileAction(action, filePath) {
  const { cmd, revealFlag } = getOpenCommand();
  const args = action === "reveal" && revealFlag.length > 0 ? [...revealFlag, filePath] : [filePath];
  return new Promise((resolve4, reject) => {
    const proc = spawn(cmd, args, { stdio: "ignore" });
    proc.on("close", (code) => {
      if (code === 0) {
        resolve4();
      } else {
        reject(new Error(`Command exited with code ${code}`));
      }
    });
    proc.on("error", (err) => {
      reject(err);
    });
  });
}
async function handleFileActionRequest(req, res) {
  if (req.url !== "/file-action") {
    return false;
  }
  const origin = req.headers.origin;
  const allowedOrigins = [
    `http://localhost:${CONFIG.STATIC_PORT}`,
    `http://127.0.0.1:${CONFIG.STATIC_PORT}`
  ];
  if (origin && !allowedOrigins.includes(origin)) {
    logger.warn(`[FileActions] Rejected request from invalid origin: ${origin}`);
    res.writeHead(403, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ success: false, error: "Forbidden: Invalid origin" }));
    return true;
  }
  if (origin) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Credentials", "true");
  }
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return true;
  }
  if (req.method !== "POST") {
    sendResponse(res, 405, { success: false, error: "Method not allowed" });
    return true;
  }
  let body;
  try {
    const chunks = [];
    for await (const chunk of req) {
      chunks.push(chunk);
    }
    const bodyStr = Buffer.concat(chunks).toString("utf-8");
    body = JSON.parse(bodyStr);
  } catch {
    sendResponse(res, 400, { success: false, error: "Invalid JSON body" });
    return true;
  }
  const validationError = validateRequest(body);
  if (validationError) {
    sendResponse(res, 400, { success: false, error: validationError });
    return true;
  }
  const { action, path } = body;
  try {
    await executeFileAction(action, path);
    logger.debug(`[FileActions] Executed ${action} for: ${path}`);
    sendResponse(res, 200, { success: true });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    logger.error(`[FileActions] Failed to execute ${action}:`, errorMessage);
    sendResponse(res, 500, { success: false, error: `Failed to ${action} file` });
  }
  return true;
}
function sendResponse(res, statusCode, data) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json"
  });
  res.end(JSON.stringify(data));
}

// src/server/export-handler.ts
import { writeFile, mkdir, readdir as readdir4, stat as stat5 } from "node:fs/promises";
import { realpathSync as realpathSync2 } from "node:fs";
import { dirname as dirname3, basename as basename3, isAbsolute as isAbsolute3, join as join7 } from "node:path";
import { homedir as homedir5 } from "node:os";
import { spawn as spawn2 } from "node:child_process";
import { parse as parseUrl } from "node:url";
var MAX_EXPORT_SIZE = 1024 * 1024;
function validateExportPath(filePath) {
  const normalizedPath = normalizeAbsolutePath(filePath);
  if (!normalizedPath) {
    return null;
  }
  try {
    const parentDir = dirname3(normalizedPath);
    const realParent = realpathSync2(parentDir);
    const realPath = join7(realParent, basename3(normalizedPath));
    return realPath;
  } catch {
    return normalizedPath;
  }
}
function validateExportRequestBody(body) {
  if (typeof body !== "object" || body === null) {
    return { error: "Invalid request body" };
  }
  const req = body;
  if (typeof req.path !== "string" || req.path.length === 0) {
    return { error: "Invalid path. Must be a non-empty string" };
  }
  if (!isAbsolute3(req.path)) {
    return { error: "Invalid path. Must be an absolute path" };
  }
  if (!req.path.endsWith(".md")) {
    return { error: "Invalid path. File must have .md extension" };
  }
  const normalizedPath = validateExportPath(req.path);
  if (!normalizedPath) {
    return { error: "Invalid path. Path contains invalid characters or traversal sequences" };
  }
  if (typeof req.content !== "string") {
    return { error: "Invalid content. Must be a string" };
  }
  if (req.content.length > MAX_EXPORT_SIZE) {
    return { error: `Content too large. Maximum size is ${MAX_EXPORT_SIZE} bytes` };
  }
  return {
    request: {
      path: normalizedPath,
      content: req.content
    }
  };
}
async function handleExportRequest(req, res) {
  if (req.url !== "/export-markdown") {
    return false;
  }
  const origin = req.headers.origin;
  const allowedOrigins = [
    `http://localhost:${CONFIG.STATIC_PORT}`,
    `http://127.0.0.1:${CONFIG.STATIC_PORT}`
  ];
  if (origin && !allowedOrigins.includes(origin)) {
    logger.warn(`[Export] Rejected request from invalid origin: ${origin}`);
    res.writeHead(403, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ success: false, error: "Forbidden: Invalid origin" }));
    return true;
  }
  if (origin) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Credentials", "true");
  }
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return true;
  }
  if (req.method !== "POST") {
    sendResponse2(res, 405, { success: false, error: "Method not allowed" });
    return true;
  }
  let body;
  try {
    const chunks = [];
    for await (const chunk of req) {
      chunks.push(chunk);
      const totalSize = chunks.reduce((sum, c) => sum + c.length, 0);
      if (totalSize > MAX_EXPORT_SIZE + 1024) {
        sendResponse2(res, 413, { success: false, error: "Request body too large" });
        return true;
      }
    }
    const bodyStr = Buffer.concat(chunks).toString("utf-8");
    body = JSON.parse(bodyStr);
  } catch {
    sendResponse2(res, 400, { success: false, error: "Invalid JSON body" });
    return true;
  }
  const validation = validateExportRequestBody(body);
  if ("error" in validation) {
    sendResponse2(res, 400, { success: false, error: validation.error });
    return true;
  }
  const { path: exportPath, content } = validation.request;
  try {
    const dir = dirname3(exportPath);
    await mkdir(dir, { recursive: true });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    logger.error(`[Export] Failed to create directory:`, errorMessage);
    sendResponse2(res, 500, { success: false, error: "Failed to create directory" });
    return true;
  }
  try {
    await writeFile(exportPath, content, "utf-8");
    logger.info(`[Export] Successfully exported to: ${exportPath}`);
    sendResponse2(res, 200, { success: true, path: exportPath });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    logger.error(`[Export] Failed to write file:`, errorMessage);
    sendResponse2(res, 500, { success: false, error: "Failed to write file" });
  }
  return true;
}
async function handleBrowseRequest(req, res) {
  const parsedUrl = parseUrl(req.url || "", true);
  if (!parsedUrl.pathname?.startsWith("/api/browse")) {
    return false;
  }
  const origin = req.headers.origin;
  const allowedOrigins = [
    `http://localhost:${CONFIG.STATIC_PORT}`,
    `http://127.0.0.1:${CONFIG.STATIC_PORT}`
  ];
  if (origin && !allowedOrigins.includes(origin)) {
    logger.warn(`[Browse] Rejected request from invalid origin: ${origin}`);
    res.writeHead(403, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ success: false, error: "Forbidden: Invalid origin" }));
    return true;
  }
  if (origin) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Credentials", "true");
  }
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return true;
  }
  if (req.method !== "GET") {
    sendBrowseResponse(res, 405, { success: false, error: "Method not allowed" });
    return true;
  }
  const requestedPath = parsedUrl.query.path;
  if (!requestedPath || typeof requestedPath !== "string") {
    sendBrowseResponse(res, 400, { success: false, error: "Missing path parameter" });
    return true;
  }
  let normalizedPath = requestedPath;
  if (normalizedPath.startsWith("~/")) {
    normalizedPath = join7(homedir5(), normalizedPath.slice(2));
  } else if (normalizedPath === "~") {
    normalizedPath = homedir5();
  }
  const absolutePath = normalizeAbsolutePath(normalizedPath);
  if (!absolutePath) {
    sendBrowseResponse(res, 400, { success: false, error: "Path must be absolute" });
    return true;
  }
  try {
    const pathStat = await stat5(absolutePath);
    if (!pathStat.isDirectory()) {
      sendBrowseResponse(res, 400, { success: false, error: "Path is not a directory" });
      return true;
    }
    const dirEntries = await readdir4(absolutePath, { withFileTypes: true });
    const entries = [];
    for (const entry of dirEntries) {
      if (entry.name.startsWith(".") && entry.name !== ".claude") {
        continue;
      }
      if (entry.isDirectory()) {
        entries.push({ name: entry.name, type: "directory" });
      } else if (entry.isFile() && entry.name.endsWith(".md")) {
        entries.push({ name: entry.name, type: "file" });
      }
    }
    entries.sort((a, b) => {
      if (a.type !== b.type) {
        return a.type === "directory" ? -1 : 1;
      }
      return a.name.localeCompare(b.name);
    });
    let parentPath = null;
    const parentDir = dirname3(absolutePath);
    if (parentDir !== absolutePath) {
      parentPath = parentDir;
    }
    logger.debug(`[Browse] Listed ${entries.length} entries in: ${absolutePath}`);
    sendBrowseResponse(res, 200, {
      success: true,
      path: absolutePath,
      parent: parentPath,
      entries
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    if (error.code === "ENOENT") {
      sendBrowseResponse(res, 404, { success: false, error: "Directory not found" });
    } else if (error.code === "EACCES") {
      sendBrowseResponse(res, 403, { success: false, error: "Permission denied" });
    } else {
      logger.error(`[Browse] Failed to read directory:`, errorMessage);
      sendBrowseResponse(res, 500, { success: false, error: "Failed to read directory" });
    }
  }
  return true;
}
function sendBrowseResponse(res, statusCode, data) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json"
  });
  res.end(JSON.stringify(data));
}
function sendResponse2(res, statusCode, data) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json"
  });
  res.end(JSON.stringify(data));
}
function sendRevealFileResponse(res, statusCode, data) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json"
  });
  res.end(JSON.stringify(data));
}
async function handleRevealFileRequest(req, res) {
  if (req.url !== "/api/reveal-file") {
    return false;
  }
  const origin = req.headers.origin;
  const allowedOrigins = [
    `http://localhost:${CONFIG.STATIC_PORT}`,
    `http://127.0.0.1:${CONFIG.STATIC_PORT}`
  ];
  if (origin && !allowedOrigins.includes(origin)) {
    logger.warn(`[RevealFile] Rejected request from invalid origin: ${origin}`);
    res.writeHead(403, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ success: false, error: "Forbidden: Invalid origin" }));
    return true;
  }
  if (origin) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Credentials", "true");
  }
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return true;
  }
  if (req.method !== "POST") {
    sendRevealFileResponse(res, 405, { success: false, error: "Method not allowed" });
    return true;
  }
  let body;
  try {
    const chunks = [];
    for await (const chunk of req) {
      chunks.push(chunk);
      const totalSize = chunks.reduce((sum, c) => sum + c.length, 0);
      if (totalSize > 4096) {
        sendRevealFileResponse(res, 413, { success: false, error: "Request body too large" });
        return true;
      }
    }
    const bodyStr = Buffer.concat(chunks).toString("utf-8");
    body = JSON.parse(bodyStr);
  } catch {
    sendRevealFileResponse(res, 400, { success: false, error: "Invalid JSON body" });
    return true;
  }
  if (typeof body !== "object" || body === null) {
    sendRevealFileResponse(res, 400, { success: false, error: "Invalid request body" });
    return true;
  }
  const { path: filePath } = body;
  if (typeof filePath !== "string" || filePath.length === 0) {
    sendRevealFileResponse(res, 400, { success: false, error: "Invalid path. Must be a non-empty string" });
    return true;
  }
  if (!filePath.endsWith(".md")) {
    sendRevealFileResponse(res, 400, { success: false, error: "Invalid path. Only .md files are allowed" });
    return true;
  }
  const normalizedPath = normalizeAbsolutePath(filePath);
  if (!normalizedPath) {
    sendRevealFileResponse(res, 400, { success: false, error: "Invalid path. Must be an absolute path" });
    return true;
  }
  try {
    await new Promise((resolvePromise, reject) => {
      const { cmd, revealFlag } = getOpenCommand();
      const args = revealFlag.length > 0 ? [...revealFlag, normalizedPath] : [normalizedPath];
      const proc = spawn2(cmd, args, { stdio: "ignore" });
      proc.on("error", (error) => {
        logger.error("[RevealFile] Failed to reveal file:", error);
        reject(error);
      });
      proc.on("close", (code) => {
        if (code === 0) {
          resolvePromise();
        } else {
          reject(new Error(`Command exited with code ${code}`));
        }
      });
    });
    logger.info(`[RevealFile] Revealed file in file manager: ${normalizedPath}`);
    sendRevealFileResponse(res, 200, { success: true });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    logger.error(`[RevealFile] Failed to reveal file:`, errorMessage);
    sendRevealFileResponse(res, 500, { success: false, error: "Failed to reveal file" });
  }
  return true;
}

// src/server/index.ts
var __filename = fileURLToPath(import.meta.url);
var __dirname = dirname4(__filename);
var dashboardDir = join8(__dirname, "..", "dashboard");
var srcDashboardDir = join8(__dirname, "..", "..", "src", "dashboard");
async function main() {
  logger.info(`
\u2554\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2557
\u2551           THINKING MONITOR v${CONFIG.VERSION}                        \u2551
\u2560\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2563
\u2551  Real-time monitoring for Claude Code thinking & tools    \u2551
\u255A\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u255D
`);
  const hub = new WebSocketHub();
  const eventReceiver = new EventReceiver(hub);
  const httpServer = createServer2(async (req, res) => {
    const fileActionHandled = await handleFileActionRequest(req, res);
    if (fileActionHandled) {
      return;
    }
    const browseHandled = await handleBrowseRequest(req, res);
    if (browseHandled) {
      return;
    }
    const exportHandled = await handleExportRequest(req, res);
    if (exportHandled) {
      return;
    }
    const revealFileHandled = await handleRevealFileRequest(req, res);
    if (revealFileHandled) {
      return;
    }
    const handled = await eventReceiver.handleRequest(req, res);
    if (!handled) {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("404 Not Found");
    }
  });
  hub.attach(httpServer);
  await new Promise((resolve4, reject) => {
    httpServer.on("error", reject);
    httpServer.listen(CONFIG.WS_PORT, CONFIG.HOST, () => {
      logger.info(
        `[Server] WebSocket + Events at ws://${CONFIG.HOST}:${CONFIG.WS_PORT}`
      );
      logger.info(
        `[Server] Event endpoint: POST http://${CONFIG.HOST}:${CONFIG.WS_PORT}/event`
      );
      logger.info(
        `[Server] Health check: GET http://${CONFIG.HOST}:${CONFIG.WS_PORT}/health`
      );
      resolve4();
    });
  });
  let dashboardPath;
  try {
    const { stat: stat6 } = await import("node:fs/promises");
    await stat6(join8(srcDashboardDir, "index.html"));
    dashboardPath = srcDashboardDir;
  } catch {
    dashboardPath = dashboardDir;
  }
  const staticServer = new StaticServer(dashboardPath);
  await staticServer.start();
  const transcriptWatcher = new TranscriptWatcher(hub);
  await transcriptWatcher.start();
  logger.info(`[Server] Transcript watcher started`);
  const planWatcher = new PlanWatcher(hub);
  await planWatcher.start();
  logger.info(`[Server] Plan watcher started`);
  const teamWatcher = new TeamWatcher(hub);
  await teamWatcher.start();
  logger.info(`[Server] Team/task watcher started`);
  hub.onClientConnect(async (sendEvent) => {
    const knownSessions = transcriptWatcher.getKnownSessions();
    for (const { sessionId, workingDirectory } of knownSessions) {
      sendEvent({
        type: "session_start",
        timestamp: (/* @__PURE__ */ new Date()).toISOString(),
        sessionId,
        workingDirectory
      });
    }
    const subagentMappingEvent = eventReceiver.createSubagentMappingEvent();
    if (subagentMappingEvent.mappings.length > 0) {
      sendEvent(subagentMappingEvent);
    }
    const planListEvent = planWatcher.getPlanListEvent();
    if (planListEvent.plans.length > 0) {
      sendEvent(planListEvent);
    }
    const planEvent = await planWatcher.getMostRecentPlanEvent();
    if (planEvent) {
      sendEvent(planEvent);
    }
    for (const teamEvent of teamWatcher.getTeamEvents()) {
      sendEvent(teamEvent);
    }
    for (const taskEvent of teamWatcher.getTaskEvents()) {
      sendEvent(taskEvent);
    }
  });
  hub.onClientRequest(async (request, sendResponse3) => {
    if (request.type === "plan_request") {
      logger.debug(`[Server] Plan content requested: ${request.path}`);
      const planEvent = await planWatcher.getPlanContent(request.path);
      if (planEvent) {
        sendResponse3(planEvent);
      } else {
        logger.warn(`[Server] Plan not found: ${request.path}`);
      }
    }
  });
  logger.info(`
\u2554\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2557
\u2551  DASHBOARD: http://localhost:${CONFIG.STATIC_PORT}                        \u2551
\u255A\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u255D
`);
  const shutdown = async () => {
    logger.info("\n[Server] Shutting down...");
    teamWatcher.stop();
    planWatcher.stop();
    transcriptWatcher.stop();
    eventReceiver.destroy();
    hub.close();
    await staticServer.stop();
    await new Promise((resolve4) => {
      httpServer.close(() => resolve4());
    });
    logger.info("[Server] Shutdown complete");
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
  logger.info("[Server] Ready. Press Ctrl+C to stop.\n");
}
main().catch((error) => {
  logger.error("[Server] Fatal error:", error);
  process.exit(1);
});
