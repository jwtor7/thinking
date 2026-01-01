/**
 * Tests for the EventReceiver HTTP handler.
 *
 * Tests request body size limits and other HTTP-level behaviors.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer, type Server } from 'node:http';
import { WebSocketHub } from './websocket-hub.ts';
import { EventReceiver } from './event-receiver.ts';

const TEST_PORT = 3398; // Use a unique port for these tests

describe('EventReceiver', () => {
  let httpServer: Server;
  let hub: WebSocketHub;
  let receiver: EventReceiver;

  beforeAll(async () => {
    hub = new WebSocketHub();
    receiver = new EventReceiver(hub);

    httpServer = createServer(async (req, res) => {
      const handled = await receiver.handleRequest(req, res);
      if (!handled) {
        res.writeHead(404);
        res.end('Not Found');
      }
    });

    hub.attach(httpServer);

    await new Promise<void>((resolve) => {
      httpServer.listen(TEST_PORT, '127.0.0.1', () => {
        resolve();
      });
    });
  });

  afterAll(async () => {
    receiver.destroy();
    hub.close();
    await new Promise<void>((resolve) => {
      httpServer.close(() => resolve());
    });
  });

  describe('Request body size limits', () => {
    it('should accept bodies under 5MB', async () => {
      // Create a 1MB payload (well under 5MB limit)
      const largeContent = 'x'.repeat(1024 * 1024); // 1MB
      const event = {
        type: 'tool_start',
        timestamp: new Date().toISOString(),
        toolName: 'Test',
        input: largeContent,
      };

      const response = await fetch(`http://127.0.0.1:${TEST_PORT}/event`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(event),
      });

      // Should succeed (200) - content will be truncated at 100KB but request accepted
      expect(response.status).toBe(200);
      const result = await response.json();
      expect(result.success).toBe(true);
    });

    it('should accept bodies close to but under 5MB', async () => {
      // Create ~4.9MB of content (leave room for JSON wrapper)
      // JSON wrapper adds: {"type":"tool_start","timestamp":"...","toolName":"Test","input":"..."}
      // That's roughly 100 bytes, so we use 4.9MB to be safe
      const almostFiveMB = 'y'.repeat(4.9 * 1024 * 1024);
      const event = {
        type: 'tool_start',
        timestamp: new Date().toISOString(),
        toolName: 'Test',
        input: almostFiveMB,
      };

      const response = await fetch(`http://127.0.0.1:${TEST_PORT}/event`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(event),
      });

      // Should succeed - under the 5MB limit
      expect(response.status).toBe(200);
    });

    it('should reject bodies over 5MB by closing the connection', async () => {
      // Create 6MB payload (over 5MB limit)
      const oversizedContent = 'z'.repeat(6 * 1024 * 1024); // 6MB
      const event = {
        type: 'tool_start',
        timestamp: new Date().toISOString(),
        toolName: 'Test',
        input: oversizedContent,
      };

      // When the server destroys the request stream, fetch will throw an error
      // because the connection is closed mid-request
      let fetchError: Error | null = null;
      try {
        await fetch(`http://127.0.0.1:${TEST_PORT}/event`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(event),
        });
      } catch (error) {
        fetchError = error as Error;
      }

      // The server closes the connection when body exceeds 5MB
      // This causes a socket/write error on the client side
      expect(fetchError).not.toBeNull();
      // Error could be EPIPE (write error) or socket closed error
      expect(fetchError!.message).toMatch(/fetch failed|EPIPE|socket|closed/i);
    });
  });

  describe('Content truncation (separate from body size limit)', () => {
    it('should truncate content fields at 100KB but accept large requests', async () => {
      // Create 200KB content - over truncation limit but under body limit
      const largeInput = 'a'.repeat(200 * 1024); // 200KB
      const event = {
        type: 'tool_start',
        timestamp: new Date().toISOString(),
        toolName: 'Test',
        input: largeInput,
      };

      const response = await fetch(`http://127.0.0.1:${TEST_PORT}/event`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(event),
      });

      // Request should succeed
      expect(response.status).toBe(200);

      // Note: Actual truncation verification would require connecting
      // a WebSocket client to see the broadcast content
    });
  });

  describe('Basic request handling', () => {
    it('should accept valid events', async () => {
      const event = {
        type: 'tool_start',
        timestamp: new Date().toISOString(),
        toolName: 'Read',
        input: '{ "file_path": "/test/path" }',
      };

      const response = await fetch(`http://127.0.0.1:${TEST_PORT}/event`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(event),
      });

      expect(response.status).toBe(200);
      const result = await response.json();
      expect(result.success).toBe(true);
      expect(result.type).toBe('tool_start');
    });

    it('should reject invalid JSON', async () => {
      const response = await fetch(`http://127.0.0.1:${TEST_PORT}/event`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'not valid json{',
      });

      expect(response.status).toBe(400);
      const result = await response.json();
      expect(result.error).toBe('Invalid event format');
    });

    it('should reject invalid event structure', async () => {
      const response = await fetch(`http://127.0.0.1:${TEST_PORT}/event`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'unknown_type', timestamp: new Date().toISOString() }),
      });

      expect(response.status).toBe(400);
    });

    it('should return health check', async () => {
      const response = await fetch(`http://127.0.0.1:${TEST_PORT}/health`, {
        method: 'GET',
      });

      expect(response.status).toBe(200);
      const result = await response.json();
      expect(result.status).toBe('ok');
      expect(result.version).toBeDefined();
    });
  });
});
