/**
 * Integration tests for secret redaction in the event pipeline.
 *
 * Tests that secrets are properly redacted BEFORE broadcast to clients.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer, type Server } from 'node:http';
import { WebSocket } from 'ws';
import { WebSocketHub } from './websocket-hub.ts';
import { EventReceiver } from './event-receiver.ts';

const TEST_PORT = 3399; // Use a different port for integration tests

describe('Secret Redaction Integration', () => {
  let httpServer: Server;
  let hub: WebSocketHub;
  let receiver: EventReceiver;

  beforeAll(async () => {
    // Set up server
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
    hub.close();
    await new Promise<void>((resolve) => {
      httpServer.close(() => resolve());
    });
  });

  /**
   * Send an event to the receiver and capture what is broadcast to clients.
   */
  async function sendEventAndCaptureBroadcast(event: object): Promise<object> {
    return new Promise<object>((resolve, reject) => {
      // Connect a WebSocket client to receive the broadcast
      const ws = new WebSocket(`ws://127.0.0.1:${TEST_PORT}`);

      ws.on('open', () => {
        // Wait briefly for connection_status, then send the event
        setTimeout(() => {
          fetch(`http://127.0.0.1:${TEST_PORT}/event`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(event),
          }).catch(reject);
        }, 50);
      });

      ws.on('message', (data) => {
        const message = JSON.parse(data.toString());
        // Skip the connection_status message
        if (message.event.type === 'connection_status') {
          return;
        }
        ws.close();
        resolve(message.event);
      });

      ws.on('error', reject);

      // Timeout after 2 seconds
      setTimeout(() => {
        ws.close();
        reject(new Error('Timeout waiting for broadcast'));
      }, 2000);
    });
  }

  describe('Secrets in tool_start events', () => {
    it('should redact API keys from input field', async () => {
      const event = {
        type: 'tool_start',
        timestamp: new Date().toISOString(),
        toolName: 'Bash',
        input: 'curl -H "Authorization: Bearer sk-ant-api03-mySecretAnthropicKey123456789" https://api.example.com',
      };

      const broadcast = await sendEventAndCaptureBroadcast(event);
      expect((broadcast as { input?: string }).input).not.toContain('sk-ant-api03');
      expect((broadcast as { input?: string }).input).toContain('[REDACTED]');
    });

    it('should redact passwords from input field', async () => {
      const event = {
        type: 'tool_start',
        timestamp: new Date().toISOString(),
        toolName: 'Bash',
        input: 'mysql --password=SuperSecretPass123 -u admin database',
      };

      const broadcast = await sendEventAndCaptureBroadcast(event);
      expect((broadcast as { input?: string }).input).not.toContain('SuperSecretPass123');
      expect((broadcast as { input?: string }).input).toContain('[REDACTED]');
    });

    it('should redact database URLs with passwords', async () => {
      const event = {
        type: 'tool_start',
        timestamp: new Date().toISOString(),
        toolName: 'Write',
        input: 'DATABASE_URL=postgres://admin:myDbPassword@db.example.com:5432/prod',
      };

      const broadcast = await sendEventAndCaptureBroadcast(event);
      expect((broadcast as { input?: string }).input).not.toContain('myDbPassword');
      expect((broadcast as { input?: string }).input).toContain('[REDACTED]');
    });
  });

  describe('Secrets in tool_end events', () => {
    it('should redact API keys from output field', async () => {
      const event = {
        type: 'tool_end',
        timestamp: new Date().toISOString(),
        toolName: 'Read',
        output: '# .env\nOPENAI_API_KEY=sk-abcdefghij1234567890abcdefghij12',
      };

      const broadcast = await sendEventAndCaptureBroadcast(event);
      expect((broadcast as { output?: string }).output).not.toContain('sk-abcdefghij');
      expect((broadcast as { output?: string }).output).toContain('[REDACTED]');
    });

    it('should redact JWT tokens from output field', async () => {
      const jwt = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';
      const event = {
        type: 'tool_end',
        timestamp: new Date().toISOString(),
        toolName: 'Bash',
        output: `{"access_token": "${jwt}"}`,
      };

      const broadcast = await sendEventAndCaptureBroadcast(event);
      expect((broadcast as { output?: string }).output).not.toContain('eyJhbGciOiJIUzI1NiI');
      expect((broadcast as { output?: string }).output).toContain('[REDACTED]');
    });
  });

  describe('Secrets in thinking events', () => {
    it('should redact API keys from thinking content', async () => {
      const event = {
        type: 'thinking',
        timestamp: new Date().toISOString(),
        content: 'The user has configured GITHUB_TOKEN=ghp_aB1cD2eF3gH4iJ5kL6mN7oP8qR9sT0uV1wX2yZ',
      };

      const broadcast = await sendEventAndCaptureBroadcast(event);
      expect((broadcast as { content?: string }).content).not.toContain('ghp_aB1cD2eF3gH4');
      expect((broadcast as { content?: string }).content).toContain('[REDACTED]');
    });

    it('should redact Stripe keys from thinking content', async () => {
      const event = {
        type: 'thinking',
        timestamp: new Date().toISOString(),
        content: 'Found Stripe key sk_live_51ABC123def456ghij789klmno in config',
      };

      const broadcast = await sendEventAndCaptureBroadcast(event);
      expect((broadcast as { content?: string }).content).not.toContain('sk_live_');
      expect((broadcast as { content?: string }).content).toContain('[REDACTED]');
    });
  });

  describe('Secrets in session events', () => {
    it('should redact secrets from workingDirectory field', async () => {
      const event = {
        type: 'session_start',
        timestamp: new Date().toISOString(),
        sessionId: 'test-123',
        workingDirectory: '/home/user/password=secretpath/project',
      };

      const broadcast = await sendEventAndCaptureBroadcast(event);
      // workingDirectory with password pattern should be redacted
      expect((broadcast as { workingDirectory?: string }).workingDirectory).toContain('[REDACTED]');
    });
  });

  describe('Multiple secrets in single event', () => {
    it('should redact all secrets in a single input', async () => {
      const event = {
        type: 'tool_start',
        timestamp: new Date().toISOString(),
        toolName: 'Bash',
        input: `export AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE
export AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY
export OPENAI_API_KEY=sk-abcdefghij1234567890abcdefghij12`,
      };

      const broadcast = await sendEventAndCaptureBroadcast(event);
      const input = (broadcast as { input?: string }).input ?? '';
      expect(input).not.toContain('AKIAIOSFODNN7EXAMPLE');
      expect(input).not.toContain('wJalrXUtnFEMI');
      expect(input).not.toContain('sk-abcdefghij');
      // Should have multiple redacted markers
      expect((input.match(/\[REDACTED\]/g) || []).length).toBeGreaterThanOrEqual(3);
    });
  });

  describe('Non-secret content preserved', () => {
    it('should not over-redact normal tool output', async () => {
      const event = {
        type: 'tool_end',
        timestamp: new Date().toISOString(),
        toolName: 'Read',
        output: `# Configuration Guide

## Setting up API Keys

1. Get your API key from the dashboard
2. Export it: export MY_KEY=your-key-here
3. Verify it works

Note: Never commit secrets to git.`,
      };

      const broadcast = await sendEventAndCaptureBroadcast(event);
      const output = (broadcast as { output?: string }).output ?? '';
      // These should NOT be redacted
      expect(output).toContain('Configuration Guide');
      expect(output).toContain('Setting up API Keys');
      expect(output).toContain('Never commit secrets to git');
      // Only actual secrets should be redacted
      expect(output).not.toMatch(/\[REDACTED\].*\[REDACTED\]/); // Not over-redacted
    });
  });
});
