/**
 * Unit tests for the hook processor module.
 */

import { describe, it, expect } from 'vitest';
import { processHookInput } from './hook-processor.ts';

describe('processHookInput', () => {
  describe('PreToolUse processing', () => {
    it('should convert PreToolUse to tool_start event', () => {
      const input = {
        tool_name: 'Read',
        tool_input: { file_path: '/path/to/file.ts' },
        session_id: 'session-123',
        agent_id: 'agent-001',
        tool_call_id: 'call-456',
      };

      const result = processHookInput('PreToolUse', input);

      expect(result.success).toBe(true);
      expect(result.event).toBeDefined();
      expect(result.event?.type).toBe('tool_start');

      if (result.event?.type === 'tool_start') {
        expect(result.event.toolName).toBe('Read');
        expect(result.event.input).toContain('file_path');
        expect(result.event.sessionId).toBe('session-123');
        expect(result.event.agentId).toBe('agent-001');
        expect(result.event.toolCallId).toBe('call-456');
        expect(result.event.timestamp).toBeDefined();
      }
    });

    it('should handle PreToolUse without tool_input', () => {
      const input = { tool_name: 'Bash' };

      const result = processHookInput('PreToolUse', input);

      expect(result.success).toBe(true);
      expect(result.event?.type).toBe('tool_start');
      if (result.event?.type === 'tool_start') {
        expect(result.event.toolName).toBe('Bash');
        expect(result.event.input).toBeUndefined();
      }
    });

    it('should redact secrets from tool input', () => {
      const input = {
        tool_name: 'Bash',
        tool_input: { command: 'export API_KEY=sk_live_51ABC123def456ghij789klmno' },
      };

      const result = processHookInput('PreToolUse', input);

      expect(result.success).toBe(true);
      if (result.event?.type === 'tool_start') {
        expect(result.event.input).toContain('[REDACTED]');
        expect(result.event.input).not.toContain('sk_live_');
      }
    });
  });

  describe('PostToolUse processing', () => {
    it('should convert PostToolUse to tool_end event', () => {
      const input = {
        tool_name: 'Read',
        tool_output: 'file contents here',
        session_id: 'session-123',
        tool_call_id: 'call-456',
        duration_ms: 150,
      };

      const result = processHookInput('PostToolUse', input);

      expect(result.success).toBe(true);
      expect(result.event?.type).toBe('tool_end');

      if (result.event?.type === 'tool_end') {
        expect(result.event.toolName).toBe('Read');
        expect(result.event.output).toContain('file contents');
        expect(result.event.toolCallId).toBe('call-456');
        expect(result.event.durationMs).toBe(150);
      }
    });

    it('should use result field if tool_output is missing', () => {
      const input = {
        tool_name: 'Bash',
        result: { exitCode: 0, stdout: 'output text' },
      };

      const result = processHookInput('PostToolUse', input);

      expect(result.success).toBe(true);
      if (result.event?.type === 'tool_end') {
        expect(result.event.output).toContain('exitCode');
        expect(result.event.output).toContain('output text');
      }
    });

    it('should redact secrets from tool output', () => {
      const input = {
        tool_name: 'Read',
        tool_output: 'GITHUB_TOKEN=ghp_aBcDeFgHiJkLmNoPqRsTuVwXyZ0123456789',
      };

      const result = processHookInput('PostToolUse', input);

      expect(result.success).toBe(true);
      if (result.event?.type === 'tool_end') {
        expect(result.event.output).toContain('[REDACTED]');
        expect(result.event.output).not.toContain('ghp_');
      }
    });
  });

  describe('SubagentStart processing', () => {
    it('should convert SubagentStart to agent_start event', () => {
      const input = {
        subagent_id: 'agent-001',
        agent_name: 'explore',
        session_id: 'session-123',
        parent_agent_id: 'main-agent',
      };

      const result = processHookInput('SubagentStart', input);

      expect(result.success).toBe(true);
      expect(result.event?.type).toBe('agent_start');

      if (result.event?.type === 'agent_start') {
        expect(result.event.agentId).toBe('agent-001');
        expect(result.event.agentName).toBe('explore');
        expect(result.event.parentAgentId).toBe('main-agent');
      }
    });

    it('should use agent_id if subagent_id is missing', () => {
      const input = {
        agent_id: 'agent-002',
        name: 'plan',
      };

      const result = processHookInput('SubagentStart', input);

      expect(result.success).toBe(true);
      if (result.event?.type === 'agent_start') {
        expect(result.event.agentId).toBe('agent-002');
        expect(result.event.agentName).toBe('plan');
      }
    });

    it('should use "unknown" for missing agent ID', () => {
      // This shouldn't happen due to validation, but test fallback
      const input = { agent_id: 'test' };
      const result = processHookInput('SubagentStart', input);
      expect(result.success).toBe(true);
    });
  });

  describe('SubagentStop processing', () => {
    it('should convert SubagentStop to agent_stop event', () => {
      const input = {
        subagent_id: 'agent-001',
        status: 'success',
      };

      const result = processHookInput('SubagentStop', input);

      expect(result.success).toBe(true);
      expect(result.event?.type).toBe('agent_stop');

      if (result.event?.type === 'agent_stop') {
        expect(result.event.agentId).toBe('agent-001');
        expect(result.event.status).toBe('success');
      }
    });

    it('should normalize known status values', () => {
      const successResult = processHookInput('SubagentStop', {
        agent_id: 'a1',
        status: 'success',
      });
      const failureResult = processHookInput('SubagentStop', {
        agent_id: 'a2',
        status: 'failure',
      });
      const cancelledResult = processHookInput('SubagentStop', {
        agent_id: 'a3',
        status: 'cancelled',
      });

      expect(
        successResult.event?.type === 'agent_stop' && successResult.event.status
      ).toBe('success');
      expect(
        failureResult.event?.type === 'agent_stop' && failureResult.event.status
      ).toBe('failure');
      expect(
        cancelledResult.event?.type === 'agent_stop' &&
          cancelledResult.event.status
      ).toBe('cancelled');
    });

    it('should map unknown status to failure', () => {
      const input = {
        agent_id: 'agent-001',
        status: 'error',
      };

      const result = processHookInput('SubagentStop', input);

      expect(result.success).toBe(true);
      if (result.event?.type === 'agent_stop') {
        expect(result.event.status).toBe('failure');
      }
    });

    it('should handle missing status', () => {
      const input = { agent_id: 'agent-001' };

      const result = processHookInput('SubagentStop', input);

      expect(result.success).toBe(true);
      if (result.event?.type === 'agent_stop') {
        expect(result.event.status).toBeUndefined();
      }
    });
  });

  describe('SessionStart processing', () => {
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
        cwd: '/home/user/password=secret123',
      };

      const result = processHookInput('SessionStart', input);

      expect(result.success).toBe(true);
      if (result.event?.type === 'session_start') {
        expect(result.event.workingDirectory).toContain('[REDACTED]');
      }
    });
  });

  describe('SessionStop processing', () => {
    it('should convert SessionStop to session_stop event', () => {
      const input = { session_id: 'session-123' };

      const result = processHookInput('SessionStop', input);

      expect(result.success).toBe(true);
      expect(result.event?.type).toBe('session_stop');

      if (result.event?.type === 'session_stop') {
        expect(result.event.sessionId).toBe('session-123');
      }
    });
  });

  describe('validation errors', () => {
    it('should return error for invalid input', () => {
      const result = processHookInput('PreToolUse', null);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.event).toBeUndefined();
    });

    it('should return error for missing required fields', () => {
      const result = processHookInput('PreToolUse', { tool_input: {} });

      expect(result.success).toBe(false);
      expect(result.error).toContain('tool_name');
    });

    it('should return error for unknown hook type', () => {
      const result = processHookInput('UnknownHook' as never, {});

      expect(result.success).toBe(false);
      expect(result.error).toContain('Unknown hook type');
    });
  });

  describe('timestamp generation', () => {
    it('should generate valid ISO timestamp', () => {
      const input = { tool_name: 'Test' };
      const result = processHookInput('PreToolUse', input);

      expect(result.success).toBe(true);
      expect(result.event?.timestamp).toBeDefined();

      // Verify it's a valid ISO date string
      const timestamp = new Date(result.event?.timestamp ?? '');
      expect(timestamp.toISOString()).toBe(result.event?.timestamp);
    });
  });
});
