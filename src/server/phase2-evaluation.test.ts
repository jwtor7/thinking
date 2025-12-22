/**
 * Phase 2 (Hook Integration) Evaluation Tests
 *
 * This test file comprehensively evaluates the Phase 2 implementation
 * per the PRD requirements at ~/.claude/plans/splendid-hopping-fairy.md
 *
 * Phase 2 Requirements:
 * 5. Create universal hook script (handles all hook types)
 * 6. Register hooks in ~/.claude/settings.json
 * 7. Verify events reach server
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer, type Server } from 'node:http';
import { WebSocket } from 'ws';
import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { WebSocketHub } from './websocket-hub.ts';
import { EventReceiver } from './event-receiver.ts';
import { processHookInput } from './hook-processor.ts';
import {
  validateHookInput,
  isValidHookType,
  safeStringify,
  type HookType,
} from './hook-types.ts';

const HOOKS_DIR = '/Users/<REDACTED>/dev/thinking/hooks';
const SCRIPTS_DIR = '/Users/<REDACTED>/dev/thinking/scripts';

describe('Phase 2.5: Universal Hook Script', () => {
  describe('Hook Script Structure', () => {
    it('should have the main universal hook script', () => {
      expect(existsSync(`${HOOKS_DIR}/thinking-monitor-hook.sh`)).toBe(true);
    });

    it('should have wrapper scripts for each hook type', () => {
      const wrapperScripts = [
        'pre-tool-use.sh',
        'post-tool-use.sh',
        'subagent-start.sh',
        'subagent-stop.sh',
        'session-start.sh',
      ];

      for (const script of wrapperScripts) {
        expect(existsSync(`${HOOKS_DIR}/${script}`)).toBe(true);
      }
    });

    it('should have all scripts executable', () => {
      const scripts = [
        'thinking-monitor-hook.sh',
        'pre-tool-use.sh',
        'post-tool-use.sh',
        'subagent-start.sh',
        'subagent-stop.sh',
        'session-start.sh',
      ];

      for (const script of scripts) {
        const stats = execSync(`stat -f '%Sp' "${HOOKS_DIR}/${script}"`).toString().trim();
        expect(stats[3]).toBe('x'); // Owner execute bit
      }
    });

    it('should have valid bash syntax', () => {
      const scripts = [
        'thinking-monitor-hook.sh',
        'pre-tool-use.sh',
        'post-tool-use.sh',
        'subagent-start.sh',
        'subagent-stop.sh',
        'session-start.sh',
      ];

      for (const script of scripts) {
        const result = execSync(`bash -n "${HOOKS_DIR}/${script}" 2>&1 || echo "SYNTAX_ERROR"`, {
          encoding: 'utf-8',
        });
        expect(result).not.toContain('SYNTAX_ERROR');
      }
    });
  });

  describe('Hook Script Security', () => {
    it('should use localhost-only URL (127.0.0.1)', () => {
      const content = readFileSync(`${HOOKS_DIR}/thinking-monitor-hook.sh`, 'utf-8');
      expect(content).toContain('127.0.0.1:3355');
      expect(content).not.toContain('0.0.0.0');
    });

    it('should have timeout enforcement', () => {
      const content = readFileSync(`${HOOKS_DIR}/thinking-monitor-hook.sh`, 'utf-8');
      expect(content).toContain('--max-time');
      expect(content).toContain('--connect-timeout');
    });

    it('should always exit 0', () => {
      const content = readFileSync(`${HOOKS_DIR}/thinking-monitor-hook.sh`, 'utf-8');
      expect(content).toContain('exit 0');
    });

    it('should run curl in background (non-blocking)', () => {
      const content = readFileSync(`${HOOKS_DIR}/thinking-monitor-hook.sh`, 'utf-8');
      // Check for background execution pattern
      expect(content).toMatch(/curl.*&/s);
      expect(content).toContain('disown');
    });

    it('should suppress curl output', () => {
      const content = readFileSync(`${HOOKS_DIR}/thinking-monitor-hook.sh`, 'utf-8');
      expect(content).toContain('>/dev/null');
      expect(content).toContain('2>&1');
    });

    it('should truncate large payloads', () => {
      const content = readFileSync(`${HOOKS_DIR}/thinking-monitor-hook.sh`, 'utf-8');
      expect(content).toContain('head -c');
    });
  });

  describe('Hook Script Event Types', () => {
    const hookTypes: HookType[] = [
      'PreToolUse',
      'PostToolUse',
      'SubagentStart',
      'SubagentStop',
      'SessionStart',
    ];

    for (const hookType of hookTypes) {
      it(`should handle ${hookType} hook type`, () => {
        const content = readFileSync(`${HOOKS_DIR}/thinking-monitor-hook.sh`, 'utf-8');
        expect(content).toContain(`"${hookType}"`);
      });
    }

    it('should handle unknown hook types gracefully', () => {
      const content = readFileSync(`${HOOKS_DIR}/thinking-monitor-hook.sh`, 'utf-8');
      // Should have a default case that exits 0
      expect(content).toContain('*');
      expect(content).toContain('exit 0');
    });
  });
});

describe('Phase 2.6: Setup Script', () => {
  it('should have the setup script', () => {
    expect(existsSync(`${SCRIPTS_DIR}/setup.sh`)).toBe(true);
  });

  it('should have valid bash syntax', () => {
    const result = execSync(`bash -n "${SCRIPTS_DIR}/setup.sh" 2>&1 || echo "SYNTAX_ERROR"`, {
      encoding: 'utf-8',
    });
    expect(result).not.toContain('SYNTAX_ERROR');
  });

  it('should support --install, --uninstall, --status options', () => {
    const content = readFileSync(`${SCRIPTS_DIR}/setup.sh`, 'utf-8');
    expect(content).toContain('--install');
    expect(content).toContain('--uninstall');
    expect(content).toContain('--status');
  });

  it('should backup settings before modifying', () => {
    const content = readFileSync(`${SCRIPTS_DIR}/setup.sh`, 'utf-8');
    expect(content).toContain('backup');
  });

  it('should check for required dependencies', () => {
    const content = readFileSync(`${SCRIPTS_DIR}/setup.sh`, 'utf-8');
    expect(content).toContain('jq');
    expect(content).toContain('curl');
  });

  it('should configure all required hook types', () => {
    const content = readFileSync(`${SCRIPTS_DIR}/setup.sh`, 'utf-8');
    expect(content).toContain('PreToolUse');
    expect(content).toContain('PostToolUse');
    expect(content).toContain('SubagentStart');
    expect(content).toContain('SubagentStop');
    expect(content).toContain('SessionStart');
  });
});

describe('Phase 2.7: Hook Types TypeScript Module', () => {
  describe('Hook Type Validation', () => {
    it('should validate all supported hook types', () => {
      expect(isValidHookType('PreToolUse')).toBe(true);
      expect(isValidHookType('PostToolUse')).toBe(true);
      expect(isValidHookType('SubagentStart')).toBe(true);
      expect(isValidHookType('SubagentStop')).toBe(true);
      expect(isValidHookType('SessionStart')).toBe(true);
      expect(isValidHookType('SessionStop')).toBe(true);
    });

    it('should reject invalid hook types', () => {
      expect(isValidHookType('InvalidHook')).toBe(false);
      expect(isValidHookType('')).toBe(false);
      expect(isValidHookType('pretooluse')).toBe(false); // case sensitive
    });
  });

  describe('Input Validation', () => {
    it('should validate PreToolUse inputs correctly', () => {
      const valid = { tool_name: 'Read', tool_input: { file_path: '/test.ts' } };
      const invalid = { tool_input: {} };

      expect(validateHookInput('PreToolUse', valid).valid).toBe(true);
      expect(validateHookInput('PreToolUse', invalid).valid).toBe(false);
    });

    it('should validate PostToolUse inputs correctly', () => {
      const valid = { tool_name: 'Bash', tool_output: 'output' };
      const invalid = {};

      expect(validateHookInput('PostToolUse', valid).valid).toBe(true);
      expect(validateHookInput('PostToolUse', invalid).valid).toBe(false);
    });

    it('should validate SubagentStart inputs correctly', () => {
      const validSubagentId = { subagent_id: 'agent-001', agent_name: 'explore' };
      const validAgentId = { agent_id: 'agent-001' };
      const invalid = { agent_name: 'test' };

      expect(validateHookInput('SubagentStart', validSubagentId).valid).toBe(true);
      expect(validateHookInput('SubagentStart', validAgentId).valid).toBe(true);
      expect(validateHookInput('SubagentStart', invalid).valid).toBe(false);
    });

    it('should validate SessionStart inputs correctly', () => {
      const valid = { session_id: 'session-123', cwd: '/path' };
      const invalid = { cwd: '/path' };

      expect(validateHookInput('SessionStart', valid).valid).toBe(true);
      expect(validateHookInput('SessionStart', invalid).valid).toBe(false);
    });

    it('should reject null and undefined inputs', () => {
      expect(validateHookInput('PreToolUse', null).valid).toBe(false);
      expect(validateHookInput('PreToolUse', undefined).valid).toBe(false);
    });
  });

  describe('Safe Stringify', () => {
    it('should handle normal objects', () => {
      const obj = { a: 1, b: 'test' };
      expect(safeStringify(obj)).toBe('{"a":1,"b":"test"}');
    });

    it('should truncate large objects', () => {
      const large = { data: 'x'.repeat(20000) };
      const result = safeStringify(large, 1000);
      expect(result.length).toBeLessThanOrEqual(1020);
      expect(result).toContain('truncated');
    });

    it('should handle circular references', () => {
      const circular: Record<string, unknown> = { a: 1 };
      circular.self = circular;
      expect(safeStringify(circular)).toBe('[unstringifiable object]');
    });
  });
});

describe('Phase 2.7: Hook Processor Module', () => {
  describe('PreToolUse Processing', () => {
    it('should convert PreToolUse to tool_start event', () => {
      const input = {
        tool_name: 'Read',
        tool_input: { file_path: '/test.ts' },
        session_id: 'session-123',
        agent_id: 'agent-001',
      };

      const result = processHookInput('PreToolUse', input);

      expect(result.success).toBe(true);
      expect(result.event?.type).toBe('tool_start');
      if (result.event?.type === 'tool_start') {
        expect(result.event.toolName).toBe('Read');
        expect(result.event.sessionId).toBe('session-123');
        expect(result.event.agentId).toBe('agent-001');
      }
    });

    it('should redact secrets from tool input', () => {
      const input = {
        tool_name: 'Bash',
        tool_input: { command: 'API_KEY=sk_live_abcdef123456789012345678' },
      };

      const result = processHookInput('PreToolUse', input);

      expect(result.success).toBe(true);
      if (result.event?.type === 'tool_start') {
        expect(result.event.input).toContain('[REDACTED]');
        expect(result.event.input).not.toContain('sk_live_');
      }
    });
  });

  describe('PostToolUse Processing', () => {
    it('should convert PostToolUse to tool_end event', () => {
      const input = {
        tool_name: 'Read',
        tool_output: 'file contents',
        duration_ms: 100,
      };

      const result = processHookInput('PostToolUse', input);

      expect(result.success).toBe(true);
      expect(result.event?.type).toBe('tool_end');
      if (result.event?.type === 'tool_end') {
        expect(result.event.toolName).toBe('Read');
        expect(result.event.durationMs).toBe(100);
      }
    });

    it('should handle result field as alternative to tool_output', () => {
      const input = {
        tool_name: 'Bash',
        result: { exitCode: 0, stdout: 'output' },
      };

      const result = processHookInput('PostToolUse', input);

      expect(result.success).toBe(true);
      if (result.event?.type === 'tool_end') {
        expect(result.event.output).toContain('exitCode');
      }
    });
  });

  describe('SubagentStart Processing', () => {
    it('should convert SubagentStart to agent_start event', () => {
      const input = {
        subagent_id: 'agent-002',
        agent_name: 'explore',
        parent_agent_id: 'agent-001',
      };

      const result = processHookInput('SubagentStart', input);

      expect(result.success).toBe(true);
      expect(result.event?.type).toBe('agent_start');
      if (result.event?.type === 'agent_start') {
        expect(result.event.agentId).toBe('agent-002');
        expect(result.event.agentName).toBe('explore');
        expect(result.event.parentAgentId).toBe('agent-001');
      }
    });

    it('should handle agent_id field as alternative to subagent_id', () => {
      const input = { agent_id: 'agent-003', name: 'plan' };

      const result = processHookInput('SubagentStart', input);

      expect(result.success).toBe(true);
      if (result.event?.type === 'agent_start') {
        expect(result.event.agentId).toBe('agent-003');
        expect(result.event.agentName).toBe('plan');
      }
    });
  });

  describe('SubagentStop Processing', () => {
    it('should convert SubagentStop to agent_stop event', () => {
      const input = {
        subagent_id: 'agent-002',
        status: 'success',
      };

      const result = processHookInput('SubagentStop', input);

      expect(result.success).toBe(true);
      expect(result.event?.type).toBe('agent_stop');
      if (result.event?.type === 'agent_stop') {
        expect(result.event.agentId).toBe('agent-002');
        expect(result.event.status).toBe('success');
      }
    });

    it('should normalize unknown status to failure', () => {
      const input = { agent_id: 'agent-002', status: 'error' };

      const result = processHookInput('SubagentStop', input);

      expect(result.success).toBe(true);
      if (result.event?.type === 'agent_stop') {
        expect(result.event.status).toBe('failure');
      }
    });
  });

  describe('SessionStart Processing', () => {
    it('should convert SessionStart to session_start event', () => {
      const input = {
        session_id: 'session-123',
        cwd: '/path/to/project',
      };

      const result = processHookInput('SessionStart', input);

      expect(result.success).toBe(true);
      expect(result.event?.type).toBe('session_start');
      if (result.event?.type === 'session_start') {
        expect(result.event.sessionId).toBe('session-123');
        expect(result.event.workingDirectory).toBe('/path/to/project');
      }
    });

    it('should redact secrets from working directory', () => {
      const input = {
        session_id: 'session-123',
        cwd: '/home/password=secret123/project',
      };

      const result = processHookInput('SessionStart', input);

      expect(result.success).toBe(true);
      if (result.event?.type === 'session_start') {
        expect(result.event.workingDirectory).toContain('[REDACTED]');
      }
    });
  });

  describe('Error Handling', () => {
    it('should return error for invalid input', () => {
      const result = processHookInput('PreToolUse', null);
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should return error for unknown hook type', () => {
      const result = processHookInput('UnknownHook' as HookType, {});
      expect(result.success).toBe(false);
      expect(result.error).toContain('Unknown hook type');
    });
  });
});

describe('Phase 2.7: Events Reach Server Integration', () => {
  let server: Server;
  let hub: WebSocketHub;
  let receiver: EventReceiver;
  const TEST_PORT = 3397; // Use a different port from other integration tests

  beforeAll(async () => {
    server = createServer();
    hub = new WebSocketHub();
    hub.attach(server);
    receiver = new EventReceiver(hub);

    server.on('request', async (req, res) => {
      const handled = await receiver.handleRequest(req, res);
      if (!handled) {
        res.writeHead(404);
        res.end();
      }
    });

    await new Promise<void>((resolve) => {
      server.listen(TEST_PORT, '127.0.0.1', resolve);
    });
  });

  afterAll(async () => {
    hub.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('should receive tool_start events via HTTP POST', async () => {
    const event = {
      type: 'tool_start',
      timestamp: new Date().toISOString(),
      toolName: 'Read',
      input: '{"file_path":"/test.ts"}',
    };

    const response = await fetch(`http://127.0.0.1:${TEST_PORT}/event`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(event),
    });

    expect(response.ok).toBe(true);
    const result = await response.json();
    expect(result.success).toBe(true);
    expect(result.type).toBe('tool_start');
  });

  it('should receive tool_end events via HTTP POST', async () => {
    const event = {
      type: 'tool_end',
      timestamp: new Date().toISOString(),
      toolName: 'Read',
      output: 'file contents',
    };

    const response = await fetch(`http://127.0.0.1:${TEST_PORT}/event`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(event),
    });

    expect(response.ok).toBe(true);
    const result = await response.json();
    expect(result.success).toBe(true);
    expect(result.type).toBe('tool_end');
  });

  it('should receive agent_start events via HTTP POST', async () => {
    const event = {
      type: 'agent_start',
      timestamp: new Date().toISOString(),
      agentId: 'agent-001',
      agentName: 'explore',
    };

    const response = await fetch(`http://127.0.0.1:${TEST_PORT}/event`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(event),
    });

    expect(response.ok).toBe(true);
    const result = await response.json();
    expect(result.success).toBe(true);
    expect(result.type).toBe('agent_start');
  });

  it('should receive session_start events via HTTP POST', async () => {
    const event = {
      type: 'session_start',
      timestamp: new Date().toISOString(),
      sessionId: 'session-123',
      workingDirectory: '/path/to/project',
    };

    const response = await fetch(`http://127.0.0.1:${TEST_PORT}/event`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(event),
    });

    expect(response.ok).toBe(true);
    const result = await response.json();
    expect(result.success).toBe(true);
    expect(result.type).toBe('session_start');
  });

  it('should broadcast received events to WebSocket clients', async () => {
    // Connect a WebSocket client
    const ws = new WebSocket(`ws://127.0.0.1:${TEST_PORT}`);

    const receivedEvents: unknown[] = [];
    const connectionPromise = new Promise<void>((resolve, reject) => {
      ws.on('open', () => resolve());
      ws.on('error', reject);
      setTimeout(() => reject(new Error('Connection timeout')), 5000);
    });

    await connectionPromise;

    // Listen for messages
    ws.on('message', (data) => {
      receivedEvents.push(JSON.parse(data.toString()));
    });

    // Skip the connection_status message
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Send an event via HTTP
    const event = {
      type: 'tool_start',
      timestamp: new Date().toISOString(),
      toolName: 'Glob',
      input: '**/*.ts',
    };

    await fetch(`http://127.0.0.1:${TEST_PORT}/event`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(event),
    });

    // Wait for the event to be broadcast
    await new Promise((resolve) => setTimeout(resolve, 100));

    ws.close();

    // Should have received at least the tool_start event
    const toolStartEvent = receivedEvents.find(
      (e: unknown) => (e as { event?: { type?: string } })?.event?.type === 'tool_start'
    );
    expect(toolStartEvent).toBeDefined();
  });

  it('should reject invalid event format with 400', async () => {
    const response = await fetch(`http://127.0.0.1:${TEST_PORT}/event`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ invalid: 'data' }),
    });

    expect(response.status).toBe(400);
  });

  it('should reject malformed JSON with 400', async () => {
    const response = await fetch(`http://127.0.0.1:${TEST_PORT}/event`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not valid json',
    });

    expect(response.status).toBe(400);
  });

  it('should respond to health check endpoint', async () => {
    const response = await fetch(`http://127.0.0.1:${TEST_PORT}/health`);
    expect(response.ok).toBe(true);

    const data = await response.json();
    expect(data.status).toBe('ok');
    expect(data.version).toBeDefined();
  });

  it('should redact secrets from received events', async () => {
    // Connect a WebSocket client
    const ws = new WebSocket(`ws://127.0.0.1:${TEST_PORT}`);

    await new Promise<void>((resolve, reject) => {
      ws.on('open', () => resolve());
      ws.on('error', reject);
    });

    const receivedEvents: unknown[] = [];
    ws.on('message', (data) => {
      receivedEvents.push(JSON.parse(data.toString()));
    });

    // Wait for connection_status
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Send event with a secret
    const event = {
      type: 'tool_start',
      timestamp: new Date().toISOString(),
      toolName: 'Bash',
      input: 'export API_KEY=sk_live_abcdef123456789012345678',
    };

    await fetch(`http://127.0.0.1:${TEST_PORT}/event`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(event),
    });

    await new Promise((resolve) => setTimeout(resolve, 100));
    ws.close();

    const toolStartEvent = receivedEvents.find(
      (e: unknown) => (e as { event?: { type?: string } })?.event?.type === 'tool_start'
    ) as { event: { input?: string } } | undefined;

    expect(toolStartEvent?.event?.input).toContain('[REDACTED]');
    expect(toolStartEvent?.event?.input).not.toContain('sk_live_');
  });
});

describe('Security Requirements Verification', () => {
  it('should bind to localhost only (127.0.0.1)', () => {
    // Verify in types.ts
    const typesContent = readFileSync('/Users/<REDACTED>/dev/thinking/src/server/types.ts', 'utf-8');
    expect(typesContent).toContain("HOST: '127.0.0.1'");
    expect(typesContent).not.toContain("HOST: '0.0.0.0'");
  });

  it('should have secret redaction patterns defined', () => {
    const secretsContent = readFileSync('/Users/<REDACTED>/dev/thinking/src/server/secrets.ts', 'utf-8');

    // Check for key secret patterns
    expect(secretsContent).toContain('Stripe');
    expect(secretsContent).toContain('AWS');
    expect(secretsContent).toContain('OpenAI');
    expect(secretsContent).toContain('GitHub');
    expect(secretsContent).toContain('JWT');
    expect(secretsContent).toContain('password');
  });

  it('should have payload truncation implemented', () => {
    const typesContent = readFileSync('/Users/<REDACTED>/dev/thinking/src/server/types.ts', 'utf-8');
    expect(typesContent).toContain('MAX_PAYLOAD_SIZE');
    expect(typesContent).toContain('truncatePayload');
  });

  it('should have input validation in hook processor', () => {
    const processorContent = readFileSync('/Users/<REDACTED>/dev/thinking/src/server/hook-processor.ts', 'utf-8');
    expect(processorContent).toContain('validateHookInput');
    expect(processorContent).toContain('redactSecrets');
    expect(processorContent).toContain('truncatePayload');
  });
});
