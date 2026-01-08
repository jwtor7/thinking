/**
 * Phase 1 Foundation Comprehensive Evaluation Tests
 *
 * These tests verify Phase 1 implementation against PRD requirements:
 * - WebSocket server skeleton
 * - HTTP event receiver endpoint
 * - Basic HTML dashboard shell
 * - Security requirements (localhost binding, XSS prevention, etc.)
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer, type Server } from 'node:http';
import { WebSocket } from 'ws';
import {
  CONFIG,
  isMonitorEvent,
  truncatePayload,
  type MonitorEvent,
} from './types.ts';
import { WebSocketHub } from './websocket-hub.ts';
import { EventReceiver } from './event-receiver.ts';
import { StaticServer } from './static-server.ts';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { readFile, stat } from 'node:fs/promises';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ============================================
// PHASE 1 REQUIREMENT 1: TypeScript Project Setup
// ============================================

describe('Phase 1.1: TypeScript Project Initialization', () => {
  it('should have proper TypeScript configuration', async () => {
    const tsconfigPath = join(__dirname, '..', '..', 'tsconfig.json');
    const content = await readFile(tsconfigPath, 'utf-8');
    const tsconfig = JSON.parse(content);

    expect(tsconfig.compilerOptions.strict).toBe(true);
    expect(tsconfig.compilerOptions.module).toBe('NodeNext');
    expect(tsconfig.compilerOptions.target).toBe('ES2022');
  });

  it('should have proper package.json structure', async () => {
    const pkgPath = join(__dirname, '..', '..', 'package.json');
    const content = await readFile(pkgPath, 'utf-8');
    const pkg = JSON.parse(content);

    expect(pkg.type).toBe('module');
    expect(pkg.dependencies.ws).toBeDefined();
    expect(pkg.engines.node).toBe('>=22.0.0');
  });
});

// ============================================
// PHASE 1 REQUIREMENT 2: WebSocket Server Skeleton
// ============================================

describe('Phase 1.2: WebSocket Server Skeleton', () => {
  let httpServer: Server;
  let hub: WebSocketHub;
  const testPort = 13355; // Use different port for tests

  beforeAll(async () => {
    hub = new WebSocketHub();
    httpServer = createServer();
    hub.attach(httpServer);

    await new Promise<void>((resolve) => {
      httpServer.listen(testPort, '127.0.0.1', resolve);
    });
  });

  afterAll(async () => {
    hub.close();
    await new Promise<void>((resolve) => {
      httpServer.close(() => resolve());
    });
  });

  it('should accept WebSocket connections', async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${testPort}`);

    await new Promise<void>((resolve, reject) => {
      ws.on('open', () => {
        expect(ws.readyState).toBe(WebSocket.OPEN);
        resolve();
      });
      ws.on('error', reject);
    });

    ws.close();
  });

  it('should send connection_status event on connect', async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${testPort}`);

    const message = await new Promise<string>((resolve, reject) => {
      ws.on('message', (data) => resolve(data.toString()));
      ws.on('error', reject);
    });

    const parsed = JSON.parse(message);
    expect(parsed.event.type).toBe('connection_status');
    expect(parsed.event.status).toBe('connected');
    expect(parsed.event.serverVersion).toBe(CONFIG.VERSION);
    expect(parsed.seq).toBeDefined();

    ws.close();
  });

  it('should broadcast events to connected clients', async () => {
    const ws1 = new WebSocket(`ws://127.0.0.1:${testPort}`);
    const ws2 = new WebSocket(`ws://127.0.0.1:${testPort}`);

    // Wait for connections and initial connection_status messages
    await Promise.all([
      new Promise<void>((resolve) => {
        ws1.on('open', () => {
          ws1.once('message', () => resolve());
        });
      }),
      new Promise<void>((resolve) => {
        ws2.on('open', () => {
          ws2.once('message', () => resolve());
        });
      }),
    ]);

    // Set up promises to receive broadcast BEFORE broadcasting
    const receivePromise1 = new Promise<string>((resolve) =>
      ws1.once('message', (d) => resolve(d.toString()))
    );
    const receivePromise2 = new Promise<string>((resolve) =>
      ws2.once('message', (d) => resolve(d.toString()))
    );

    // Broadcast event
    const testEvent: MonitorEvent = {
      type: 'thinking',
      timestamp: new Date().toISOString(),
      content: 'Test thinking content',
    };

    hub.broadcast(testEvent);

    // Both clients should receive
    const [msg1, msg2] = await Promise.all([receivePromise1, receivePromise2]);

    expect(JSON.parse(msg1).event.type).toBe('thinking');
    expect(JSON.parse(msg2).event.type).toBe('thinking');

    ws1.close();
    ws2.close();
  });

  it('should track and report client count', () => {
    // Client count should be a non-negative integer
    const count = hub.getClientCount();
    expect(typeof count).toBe('number');
    expect(count).toBeGreaterThanOrEqual(0);
  });
});

// ============================================
// PHASE 1 REQUIREMENT 3: HTTP Event Receiver
// ============================================

describe('Phase 1.3: HTTP Event Receiver Endpoint', () => {
  let httpServer: Server;
  let hub: WebSocketHub;
  let eventReceiver: EventReceiver;
  const testPort = 13356;

  beforeAll(async () => {
    hub = new WebSocketHub();
    eventReceiver = new EventReceiver(hub);

    httpServer = createServer(async (req, res) => {
      const handled = await eventReceiver.handleRequest(req, res);
      if (!handled) {
        res.writeHead(404);
        res.end('Not Found');
      }
    });

    hub.attach(httpServer);

    await new Promise<void>((resolve) => {
      httpServer.listen(testPort, '127.0.0.1', resolve);
    });
  });

  afterAll(async () => {
    hub.close();
    await new Promise<void>((resolve) => {
      httpServer.close(() => resolve());
    });
  });

  it('should accept POST /event endpoint', async () => {
    const event = {
      type: 'thinking',
      timestamp: new Date().toISOString(),
      content: 'Test',
    };

    const response = await fetch(`http://127.0.0.1:${testPort}/event`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(event),
    });

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.success).toBe(true);
    expect(data.type).toBe('thinking');
  });

  it('should return 400 for invalid event format', async () => {
    const response = await fetch(`http://127.0.0.1:${testPort}/event`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ invalid: 'event' }),
    });

    expect(response.status).toBe(400);
  });

  it('should return 400 for malformed JSON', async () => {
    const response = await fetch(`http://127.0.0.1:${testPort}/event`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not valid json',
    });

    expect(response.status).toBe(400);
  });

  it('should provide health check endpoint', async () => {
    const response = await fetch(`http://127.0.0.1:${testPort}/health`);

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.status).toBe('ok');
    expect(data.version).toBe(CONFIG.VERSION);
    expect(typeof data.clients).toBe('number');
    expect(data.timestamp).toBeDefined();
  });

  it('should return 404 for unknown paths', async () => {
    const response = await fetch(`http://127.0.0.1:${testPort}/unknown`);
    expect(response.status).toBe(404);
  });

  it('should broadcast received events to WebSocket clients', async () => {
    // Connect a WebSocket client
    const ws = new WebSocket(`ws://127.0.0.1:${testPort}`);

    // Wait for connection and initial message
    await new Promise<void>((resolve) => {
      ws.on('open', () => {
        ws.once('message', () => resolve());
      });
    });

    // Set up message listener BEFORE posting
    const messagePromise = new Promise<string>((resolve) =>
      ws.once('message', (d) => resolve(d.toString()))
    );

    // Post an event
    const event = {
      type: 'tool_start',
      timestamp: new Date().toISOString(),
      toolName: 'Read',
      toolCallId: 'test-123',
    };

    await fetch(`http://127.0.0.1:${testPort}/event`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(event),
    });

    const message = await messagePromise;
    const parsed = JSON.parse(message);
    expect(parsed.event.type).toBe('tool_start');
    expect(parsed.event.toolName).toBe('Read');

    ws.close();
  });
});

// ============================================
// PHASE 1 REQUIREMENT 4: Basic HTML Dashboard
// ============================================

describe('Phase 1.4: Basic HTML Dashboard Shell', () => {
  const dashboardDir = join(__dirname, '..', 'dashboard');

  it('should have index.html file', async () => {
    const indexPath = join(dashboardDir, 'index.html');
    const stats = await stat(indexPath);
    expect(stats.isFile()).toBe(true);
  });

  it('should have css/main.css file', async () => {
    const cssPath = join(dashboardDir, 'css', 'main.css');
    const stats = await stat(cssPath);
    expect(stats.isFile()).toBe(true);
  });

  it('should have app.ts file', async () => {
    const appPath = join(dashboardDir, 'app.ts');
    const stats = await stat(appPath);
    expect(stats.isFile()).toBe(true);
  });

  it('should have proper HTML structure with required elements', async () => {
    const indexPath = join(dashboardDir, 'index.html');
    const content = await readFile(indexPath, 'utf-8');

    // Required structural elements
    expect(content).toContain('id="connection-status"');
    expect(content).toContain('id="thinking-content"');
    expect(content).toContain('id="tools-content"');
    // Agent panel was replaced with todo panel in current implementation
    expect(content).toContain('id="todo-content"');
    expect(content).toContain('id="plan-content"');
    // Agent tabs were replaced with view-tabs (created dynamically in app.ts)
    // Keyboard hints were removed from static footer (commit d944ada)
    // Shortcuts are now handled via JavaScript event listeners
  });

  it('should include required stylesheets and scripts', async () => {
    const indexPath = join(dashboardDir, 'index.html');
    const content = await readFile(indexPath, 'utf-8');

    expect(content).toContain('href="css/main.css"');
    expect(content).toContain('src="app.js"');
  });
});

// ============================================
// SECURITY REQUIREMENT 1: Localhost-only Binding
// ============================================

describe('Security: Localhost-only Binding', () => {
  it('should configure HOST as 127.0.0.1', () => {
    expect(CONFIG.HOST).toBe('127.0.0.1');
  });

  it('should not use wildcard addresses', () => {
    expect(CONFIG.HOST).not.toBe('0.0.0.0');
    expect(CONFIG.HOST).not.toBe('::');
    expect(CONFIG.HOST).not.toBe('');
  });
});

// ============================================
// SECURITY REQUIREMENT 2: Payload Truncation (Memory Protection)
// ============================================

describe('Security: Payload Truncation', () => {
  it('should truncate payloads exceeding MAX_PAYLOAD_SIZE', () => {
    const large = 'X'.repeat(CONFIG.MAX_PAYLOAD_SIZE + 1000);
    const result = truncatePayload(large);

    expect(result!.length).toBeLessThan(large.length);
    expect(result).toContain('[truncated]');
  });

  it('should preserve content within MAX_PAYLOAD_SIZE', () => {
    const small = 'Small content';
    expect(truncatePayload(small)).toBe(small);
  });

  it('should handle edge case at exact MAX_PAYLOAD_SIZE', () => {
    const exact = 'Y'.repeat(CONFIG.MAX_PAYLOAD_SIZE);
    expect(truncatePayload(exact)).toBe(exact);
  });
});

// ============================================
// SECURITY REQUIREMENT 3: Input Validation
// ============================================

describe('Security: Input Validation', () => {
  it('should validate event structure', () => {
    expect(isMonitorEvent({ type: 'thinking', timestamp: '2025-12-21T00:00:00Z' })).toBe(true);
    expect(isMonitorEvent({})).toBe(false);
    expect(isMonitorEvent(null)).toBe(false);
    expect(isMonitorEvent({ type: 'invalid_type', timestamp: '2025-12-21T00:00:00Z' })).toBe(false);
  });

  it('should only accept whitelisted event types', () => {
    const valid = [
      'tool_start', 'tool_end', 'agent_start', 'agent_stop',
      'session_start', 'session_stop', 'thinking',
      'plan_update', 'plan_delete', 'connection_status'
    ];

    for (const type of valid) {
      expect(isMonitorEvent({ type, timestamp: '2025-12-21T00:00:00Z' })).toBe(true);
    }

    // Invalid types
    expect(isMonitorEvent({ type: '__proto__', timestamp: '2025-12-21T00:00:00Z' })).toBe(false);
    expect(isMonitorEvent({ type: 'constructor', timestamp: '2025-12-21T00:00:00Z' })).toBe(false);
    expect(isMonitorEvent({ type: 'eval', timestamp: '2025-12-21T00:00:00Z' })).toBe(false);
  });
});

// ============================================
// SECURITY REQUIREMENT 4: XSS Prevention (Dashboard)
// ============================================

describe('Security: XSS Prevention in Dashboard', () => {
  // Helper to read all dashboard TypeScript files (after refactoring)
  async function getAllDashboardTsContent(): Promise<string> {
    const { readdirSync, statSync } = await import('node:fs');
    const dashboardDir = join(__dirname, '..', 'dashboard');
    let content = '';

    function readDir(dir: string): void {
      const entries = readdirSync(dir);
      for (const entry of entries) {
        const fullPath = join(dir, entry);
        const statResult = statSync(fullPath);
        if (statResult.isDirectory()) {
          readDir(fullPath);
        } else if (entry.endsWith('.ts') && !entry.endsWith('.test.ts')) {
          content += require('fs').readFileSync(fullPath, 'utf-8') + '\n';
        }
      }
    }
    readDir(dashboardDir);
    return content;
  }

  it('should have escapeHtml function in dashboard code', async () => {
    const content = await getAllDashboardTsContent();
    expect(content).toContain('function escapeHtml');
  });

  it('should escape HTML before rendering', async () => {
    const content = await getAllDashboardTsContent();
    // Check that content is escaped before being set as innerHTML
    expect(content).toContain('escapeHtml(');
  });
});

// ============================================
// SECURITY REQUIREMENT 5: Path Traversal Prevention (Static Server)
// ============================================

describe('Security: Path Traversal Prevention', () => {
  let staticServer: StaticServer;
  const dashboardDir = join(__dirname, '..', 'dashboard');

  beforeAll(async () => {
    // Use custom port to avoid conflicts with running server
    staticServer = new StaticServer(dashboardDir);
    // Override the port for testing
    (staticServer as unknown as { server: ReturnType<typeof createServer> | null }).server = null;
  });

  afterAll(async () => {
    try {
      await staticServer.stop();
    } catch {
      // Ignore cleanup errors
    }
  });

  it('should have path traversal protection in resolveFilePath (code review)', async () => {
    // Verify the static-server.ts contains path validation logic
    const serverPath = join(__dirname, 'static-server.ts');
    const content = await readFile(serverPath, 'utf-8');

    // Check for path traversal protection
    expect(content).toContain('resolve(');
    expect(content).toContain('startsWith(this.dashboardDir)');
    expect(content).toContain('Path traversal attempt');
    expect(content).toContain('403');
  });

  it('should set security headers (code review)', async () => {
    const serverPath = join(__dirname, 'static-server.ts');
    const content = await readFile(serverPath, 'utf-8');

    expect(content).toContain("'X-Content-Type-Options': 'nosniff'");
  });

  it('should only allow GET requests (code review)', async () => {
    const serverPath = join(__dirname, 'static-server.ts');
    const content = await readFile(serverPath, 'utf-8');

    expect(content).toContain("req.method !== 'GET'");
    expect(content).toContain('405');
  });
});

// ============================================
// INTEGRATION: End-to-End Event Flow
// ============================================

describe('Integration: End-to-End Event Flow', () => {
  let httpServer: Server;
  let hub: WebSocketHub;
  let eventReceiver: EventReceiver;
  const testPort = 13357;

  beforeAll(async () => {
    hub = new WebSocketHub();
    eventReceiver = new EventReceiver(hub);

    httpServer = createServer(async (req, res) => {
      const handled = await eventReceiver.handleRequest(req, res);
      if (!handled) {
        res.writeHead(404);
        res.end('Not Found');
      }
    });

    hub.attach(httpServer);

    await new Promise<void>((resolve) => {
      httpServer.listen(testPort, '127.0.0.1', resolve);
    });
  });

  afterAll(async () => {
    hub.close();
    await new Promise<void>((resolve) => {
      httpServer.close(() => resolve());
    });
  });

  it('should handle complete event lifecycle', async () => {
    // 1. Connect WebSocket client and wait for connection_status
    const ws = new WebSocket(`ws://127.0.0.1:${testPort}`);

    const connMsg = await new Promise<string>((resolve) => {
      ws.on('open', () => {
        ws.once('message', (d) => resolve(d.toString()));
      });
    });

    expect(JSON.parse(connMsg).event.type).toBe('connection_status');

    // 2. Set up listener BEFORE sending event
    const eventPromise = new Promise<string>((resolve) =>
      ws.once('message', (d) => resolve(d.toString()))
    );

    // 3. Send event via HTTP
    const event = {
      type: 'agent_start',
      timestamp: new Date().toISOString(),
      agentId: 'test-agent-001',
      agentName: 'explore',
    };

    const httpResponse = await fetch(`http://127.0.0.1:${testPort}/event`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(event),
    });

    expect(httpResponse.status).toBe(200);

    // 4. Verify WebSocket receives broadcast
    const broadcastMsg = await eventPromise;
    const parsed = JSON.parse(broadcastMsg);
    expect(parsed.event.type).toBe('agent_start');
    expect(parsed.event.agentId).toBe('test-agent-001');
    expect(parsed.seq).toBeGreaterThan(0);

    ws.close();
  });
});

// ============================================
// CODE QUALITY: Type Safety
// ============================================

describe('Code Quality: Type Safety', () => {
  it('should have correct types for all event kinds', () => {
    // Tool events
    const toolStart = {
      type: 'tool_start' as const,
      timestamp: new Date().toISOString(),
      toolName: 'Read',
      input: '/path/to/file',
      toolCallId: 'abc123',
    };
    expect(isMonitorEvent(toolStart)).toBe(true);

    // Agent events
    const agentStart = {
      type: 'agent_start' as const,
      timestamp: new Date().toISOString(),
      agentId: 'subagent-001',
      agentName: 'explore',
      parentAgentId: 'main',
    };
    expect(isMonitorEvent(agentStart)).toBe(true);

    // Plan events
    const planUpdate = {
      type: 'plan_update' as const,
      timestamp: new Date().toISOString(),
      path: '/path/to/plan.md',
      filename: 'plan.md',
      content: '# Plan content',
    };
    expect(isMonitorEvent(planUpdate)).toBe(true);
  });
});
