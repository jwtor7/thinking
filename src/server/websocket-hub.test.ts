/**
 * WebSocket Hub tests - Message validation and security.
 *
 * Tests the WebSocket message validation security fix:
 * - Oversized message rejection (close code 1009)
 * - Invalid JSON handling with threshold closing (close code 1003)
 * - Valid message processing
 * - Per-client invalid message counting
 */

import { describe, it, expect } from 'vitest';
import { createServer, type Server } from 'node:http';
import { WebSocket } from 'ws';
import { WebSocketHub } from './websocket-hub.ts';

// Use random high ports to avoid conflicts between parallel test runs
function getRandomPort(): number {
  return 33600 + Math.floor(Math.random() * 1000);
}

/**
 * Creates an isolated test server with its own port.
 */
async function createTestServer(): Promise<{
  httpServer: Server;
  hub: WebSocketHub;
  port: number;
  cleanup: () => Promise<void>;
}> {
  const port = getRandomPort();
  const httpServer = createServer();
  const hub = new WebSocketHub();
  hub.attach(httpServer);

  await new Promise<void>((resolve, reject) => {
    httpServer.on('error', reject);
    httpServer.listen(port, '127.0.0.1', () => resolve());
  });

  const cleanup = async () => {
    hub.close();
    await new Promise<void>((resolve) => {
      httpServer.close(() => resolve());
    });
  };

  return { httpServer, hub, port, cleanup };
}

/**
 * Helper to create a connected WebSocket client and wait for connection_status.
 * Sets up listeners BEFORE connection to avoid missing initial messages.
 */
function connectAndWaitForStatus(port: number): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}`);
    const timeout = setTimeout(() => {
      ws.close();
      reject(new Error('Connection timeout'));
    }, 5000);

    ws.on('error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });

    ws.on('open', () => {
      // Set up message listener immediately on open
      ws.once('message', () => {
        clearTimeout(timeout);
        resolve(ws);
      });
    });
  });
}

/**
 * Helper to wait for a close event with specific code.
 */
function waitForClose(
  ws: WebSocket,
  timeoutMs = 3000
): Promise<{ code: number; reason: string }> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`Close event not received within ${timeoutMs}ms`));
    }, timeoutMs);

    ws.on('close', (code, reason) => {
      clearTimeout(timeout);
      resolve({ code, reason: reason.toString() });
    });
  });
}

describe('WebSocket message validation', () => {
  describe('Oversized message rejection', () => {
    it('should reject messages over 100KB with close code 1009', async () => {
      const { port, cleanup } = await createTestServer();
      try {
        const ws = await connectAndWaitForStatus(port);

        // Create oversized message (> 100KB)
        const oversizedMessage = JSON.stringify({
          type: 'plan_request',
          path: 'x'.repeat(150 * 1024), // 150KB of path data
        });

        // Start listening for close before sending
        const closePromise = waitForClose(ws);

        // Send oversized message
        ws.send(oversizedMessage);

        // Should close with code 1009 "Message too large"
        const { code, reason } = await closePromise;
        expect(code).toBe(1009);
        expect(reason).toContain('Message too large');
      } finally {
        await cleanup();
      }
    });

    it('should accept messages under 100KB', async () => {
      const { port, cleanup } = await createTestServer();
      try {
        const ws = await connectAndWaitForStatus(port);

        // Create message just under limit
        const validMessage = JSON.stringify({
          type: 'plan_request',
          path: '/some/plan/path',
        });

        // Should not close the connection
        let closed = false;
        ws.on('close', () => {
          closed = true;
        });

        ws.send(validMessage);

        // Wait a bit to ensure no close happens
        await new Promise((resolve) => setTimeout(resolve, 100));
        expect(closed).toBe(false);

        // Clean up
        ws.close();
      } finally {
        await cleanup();
      }
    });
  });

  describe('Invalid JSON handling', () => {
    it('should not close connection on first invalid JSON message', async () => {
      const { port, cleanup } = await createTestServer();
      try {
        const ws = await connectAndWaitForStatus(port);

        let closed = false;
        ws.on('close', () => {
          closed = true;
        });

        // Send invalid JSON
        ws.send('not valid json {{{');

        // Wait a bit
        await new Promise((resolve) => setTimeout(resolve, 100));

        // Should still be connected
        expect(closed).toBe(false);
        expect(ws.readyState).toBe(WebSocket.OPEN);

        // Clean up
        ws.close();
      } finally {
        await cleanup();
      }
    });

    it('should close connection after 6+ invalid JSON messages with code 1003', async () => {
      const { port, cleanup } = await createTestServer();
      try {
        const ws = await connectAndWaitForStatus(port);

        // Start listening for close before sending bad messages
        const closePromise = waitForClose(ws, 5000);

        // Send 6 invalid JSON messages (threshold is > 5)
        for (let i = 0; i < 6; i++) {
          ws.send(`invalid json ${i} {{{`);
          // Small delay between sends to ensure processing
          await new Promise((resolve) => setTimeout(resolve, 10));
        }

        // Should close with code 1003 "Too many invalid messages"
        const { code, reason } = await closePromise;
        expect(code).toBe(1003);
        expect(reason).toContain('Too many invalid messages');
      } finally {
        await cleanup();
      }
    });

    it('should tolerate up to 5 invalid JSON messages', async () => {
      const { port, cleanup } = await createTestServer();
      try {
        const ws = await connectAndWaitForStatus(port);

        let closed = false;
        ws.on('close', () => {
          closed = true;
        });

        // Send exactly 5 invalid JSON messages (threshold is > 5, so 5 should be OK)
        for (let i = 0; i < 5; i++) {
          ws.send(`bad json ${i}`);
          await new Promise((resolve) => setTimeout(resolve, 10));
        }

        // Wait a bit to ensure no close happens
        await new Promise((resolve) => setTimeout(resolve, 100));

        // Should still be connected
        expect(closed).toBe(false);
        expect(ws.readyState).toBe(WebSocket.OPEN);

        // Clean up
        ws.close();
      } finally {
        await cleanup();
      }
    });
  });

  describe('Valid message processing', () => {
    it('should process valid JSON messages without closing', async () => {
      const { port, cleanup } = await createTestServer();
      try {
        const ws = await connectAndWaitForStatus(port);

        let closed = false;
        ws.on('close', () => {
          closed = true;
        });

        // Send valid JSON (even if not a recognized client request type)
        ws.send(JSON.stringify({ type: 'unknown', data: 'test' }));

        // Wait a bit
        await new Promise((resolve) => setTimeout(resolve, 100));

        // Should still be connected
        expect(closed).toBe(false);
        expect(ws.readyState).toBe(WebSocket.OPEN);

        // Clean up
        ws.close();
      } finally {
        await cleanup();
      }
    });

    it('should process valid plan_request messages', async () => {
      const { port, cleanup } = await createTestServer();
      try {
        const ws = await connectAndWaitForStatus(port);

        let closed = false;
        ws.on('close', () => {
          closed = true;
        });

        // Send valid plan request
        ws.send(
          JSON.stringify({
            type: 'plan_request',
            path: '/Users/test/.claude/plans/test.md',
          })
        );

        // Wait a bit
        await new Promise((resolve) => setTimeout(resolve, 100));

        // Should still be connected
        expect(closed).toBe(false);
        expect(ws.readyState).toBe(WebSocket.OPEN);

        // Clean up
        ws.close();
      } finally {
        await cleanup();
      }
    });
  });

  describe('Per-client message counters', () => {
    it('should track invalid message count independently per client', async () => {
      const { port, cleanup } = await createTestServer();
      try {
        const ws1 = await connectAndWaitForStatus(port);
        const ws2 = await connectAndWaitForStatus(port);

        // Track close states
        let ws1Closed = false;
        let ws2Closed = false;
        ws1.on('close', () => {
          ws1Closed = true;
        });
        ws2.on('close', () => {
          ws2Closed = true;
        });

        // Send 4 invalid messages to ws1 (under threshold)
        for (let i = 0; i < 4; i++) {
          ws1.send(`bad from ws1: ${i}`);
          await new Promise((resolve) => setTimeout(resolve, 10));
        }

        // Send 2 invalid messages to ws2 (under threshold)
        for (let i = 0; i < 2; i++) {
          ws2.send(`bad from ws2: ${i}`);
          await new Promise((resolve) => setTimeout(resolve, 10));
        }

        // Wait a bit
        await new Promise((resolve) => setTimeout(resolve, 100));

        // Neither should be closed
        expect(ws1Closed).toBe(false);
        expect(ws2Closed).toBe(false);

        // Now push ws1 over the threshold (needs 2 more to exceed 5)
        const ws1ClosePromise = waitForClose(ws1, 3000);
        ws1.send('bad 5');
        await new Promise((resolve) => setTimeout(resolve, 10));
        ws1.send('bad 6');

        // ws1 should close
        const { code } = await ws1ClosePromise;
        expect(code).toBe(1003);

        // Wait a bit to ensure ws2 is unaffected
        await new Promise((resolve) => setTimeout(resolve, 100));

        // ws2 should still be open
        expect(ws2Closed).toBe(false);
        expect(ws2.readyState).toBe(WebSocket.OPEN);

        // Clean up
        ws2.close();
      } finally {
        await cleanup();
      }
    });
  });

  describe('Edge cases', () => {
    it('should handle empty messages as invalid JSON', async () => {
      const { port, cleanup } = await createTestServer();
      try {
        const ws = await connectAndWaitForStatus(port);

        let closed = false;
        ws.on('close', () => {
          closed = true;
        });

        // Send empty message
        ws.send('');

        // Wait a bit
        await new Promise((resolve) => setTimeout(resolve, 100));

        // Should still be connected (1 invalid < 6)
        expect(closed).toBe(false);

        // Clean up
        ws.close();
      } finally {
        await cleanup();
      }
    });

    it('should handle binary messages by converting to string', async () => {
      const { port, cleanup } = await createTestServer();
      try {
        const ws = await connectAndWaitForStatus(port);

        let closed = false;
        ws.on('close', () => {
          closed = true;
        });

        // Send binary data that is valid JSON when converted to string
        const jsonBuffer = Buffer.from(JSON.stringify({ type: 'test' }));
        ws.send(jsonBuffer);

        // Wait a bit
        await new Promise((resolve) => setTimeout(resolve, 100));

        // Should still be connected
        expect(closed).toBe(false);

        // Clean up
        ws.close();
      } finally {
        await cleanup();
      }
    });

    it('should start fresh with zero invalid count on new connection', async () => {
      const { port, cleanup } = await createTestServer();
      try {
        // Connect first client and push close to threshold
        const ws1 = await connectAndWaitForStatus(port);

        // Send 5 bad messages (at threshold but not over)
        for (let i = 0; i < 5; i++) {
          ws1.send(`bad ${i}`);
          await new Promise((resolve) => setTimeout(resolve, 10));
        }

        // Close manually
        ws1.close();
        await new Promise((resolve) => setTimeout(resolve, 50));

        // Connect new client - should start fresh
        const ws2 = await connectAndWaitForStatus(port);

        let closed = false;
        ws2.on('close', () => {
          closed = true;
        });

        // Send 1 bad message - should be fine since counter is fresh
        ws2.send('bad message');
        await new Promise((resolve) => setTimeout(resolve, 100));

        expect(closed).toBe(false);
        expect(ws2.readyState).toBe(WebSocket.OPEN);

        ws2.close();
      } finally {
        await cleanup();
      }
    });
  });

  describe('Rate limiting', () => {
    it('should close a client that exceeds message rate limit', async () => {
      const { port, cleanup } = await createTestServer();
      try {
        const ws = await connectAndWaitForStatus(port);
        const closePromise = waitForClose(ws, 5000);

        // Burst >100 messages in the same second
        for (let i = 0; i < 101; i++) {
          ws.send(JSON.stringify({ type: 'plan_request', path: `/tmp/p${i}.md` }));
        }

        const { code, reason } = await closePromise;
        expect(code).toBe(1008);
        expect(reason).toContain('Rate limit exceeded');
      } finally {
        await cleanup();
      }
    });
  });

  describe('Connection limiting', () => {
    it('should reject the 11th concurrent connection', async () => {
      const { port, cleanup } = await createTestServer();
      const clients: WebSocket[] = [];
      try {
        // Open 10 clients (limit)
        for (let i = 0; i < 10; i++) {
          clients.push(await connectAndWaitForStatus(port));
        }

        // 11th should be closed by server
        const overflow = new WebSocket(`ws://127.0.0.1:${port}`);
        clients.push(overflow);

        const { code, reason } = await waitForClose(overflow, 5000);
        expect(code).toBe(1013);
        expect(reason).toContain('too many connections');
      } finally {
        for (const ws of clients) {
          try {
            ws.close();
          } catch {
            // Ignore close failures in tests
          }
        }
        await cleanup();
      }
    });
  });
});
