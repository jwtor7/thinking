/**
 * Unit tests for hook types and validation functions.
 */

import { describe, it, expect } from 'vitest';
import {
  validateHookInput,
  isValidHookType,
  safeStringify,
  type HookType,
} from './hook-types.ts';

describe('isValidHookType', () => {
  it('should return true for PreToolUse', () => {
    expect(isValidHookType('PreToolUse')).toBe(true);
  });

  it('should return true for PostToolUse', () => {
    expect(isValidHookType('PostToolUse')).toBe(true);
  });

  it('should return true for SubagentStart', () => {
    expect(isValidHookType('SubagentStart')).toBe(true);
  });

  it('should return true for SubagentStop', () => {
    expect(isValidHookType('SubagentStop')).toBe(true);
  });

  it('should return true for SessionStart', () => {
    expect(isValidHookType('SessionStart')).toBe(true);
  });

  it('should return true for SessionStop', () => {
    expect(isValidHookType('SessionStop')).toBe(true);
  });

  it('should return false for invalid hook types', () => {
    expect(isValidHookType('InvalidHook')).toBe(false);
    expect(isValidHookType('')).toBe(false);
    expect(isValidHookType('pretooluse')).toBe(false); // case sensitive
    expect(isValidHookType('PRETOOLUSE')).toBe(false);
  });
});

describe('validateHookInput', () => {
  describe('common validation', () => {
    it('should reject null input', () => {
      const result = validateHookInput('PreToolUse', null);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Input must be a non-null object');
    });

    it('should reject undefined input', () => {
      const result = validateHookInput('PreToolUse', undefined);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Input must be a non-null object');
    });

    it('should reject non-object input', () => {
      expect(validateHookInput('PreToolUse', 'string').valid).toBe(false);
      expect(validateHookInput('PreToolUse', 123).valid).toBe(false);
      expect(validateHookInput('PreToolUse', true).valid).toBe(false);
      expect(validateHookInput('PreToolUse', []).valid).toBe(false);
    });
  });

  describe('PreToolUse validation', () => {
    it('should accept valid PreToolUse input', () => {
      const input = {
        tool_name: 'Read',
        tool_input: { file_path: '/path/to/file.ts' },
        session_id: 'session-123',
      };
      const result = validateHookInput('PreToolUse', input);
      expect(result.valid).toBe(true);
      expect(result.data).toEqual(input);
    });

    it('should accept minimal PreToolUse input', () => {
      const input = { tool_name: 'Bash' };
      const result = validateHookInput('PreToolUse', input);
      expect(result.valid).toBe(true);
    });

    it('should reject PreToolUse without tool_name', () => {
      const input = { tool_input: {} };
      const result = validateHookInput('PreToolUse', input);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('tool_name');
    });

    it('should reject PreToolUse with empty tool_name', () => {
      const input = { tool_name: '' };
      const result = validateHookInput('PreToolUse', input);
      expect(result.valid).toBe(false);
    });

    it('should reject PreToolUse with non-string tool_name', () => {
      const input = { tool_name: 123 };
      const result = validateHookInput('PreToolUse', input);
      expect(result.valid).toBe(false);
    });
  });

  describe('PostToolUse validation', () => {
    it('should accept valid PostToolUse input', () => {
      const input = {
        tool_name: 'Read',
        tool_output: 'file contents here',
        tool_call_id: 'call-123',
        duration_ms: 150,
      };
      const result = validateHookInput('PostToolUse', input);
      expect(result.valid).toBe(true);
    });

    it('should accept PostToolUse with result field', () => {
      const input = {
        tool_name: 'Bash',
        result: { exitCode: 0, stdout: 'output' },
      };
      const result = validateHookInput('PostToolUse', input);
      expect(result.valid).toBe(true);
    });

    it('should reject PostToolUse without tool_name', () => {
      const input = { tool_output: 'result' };
      const result = validateHookInput('PostToolUse', input);
      expect(result.valid).toBe(false);
    });
  });

  describe('SubagentStart validation', () => {
    it('should accept valid SubagentStart with subagent_id', () => {
      const input = {
        subagent_id: 'agent-001',
        agent_name: 'explore',
        session_id: 'session-123',
      };
      const result = validateHookInput('SubagentStart', input);
      expect(result.valid).toBe(true);
    });

    it('should accept SubagentStart with agent_id instead of subagent_id', () => {
      const input = {
        agent_id: 'agent-001',
        name: 'plan',
      };
      const result = validateHookInput('SubagentStart', input);
      expect(result.valid).toBe(true);
    });

    it('should reject SubagentStart without any agent ID', () => {
      const input = { agent_name: 'test' };
      const result = validateHookInput('SubagentStart', input);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('agent_id');
    });
  });

  describe('SubagentStop validation', () => {
    it('should accept valid SubagentStop input', () => {
      const input = {
        subagent_id: 'agent-001',
        status: 'success',
      };
      const result = validateHookInput('SubagentStop', input);
      expect(result.valid).toBe(true);
    });

    it('should accept SubagentStop with agent_id', () => {
      const input = {
        agent_id: 'agent-001',
        status: 'failure',
      };
      const result = validateHookInput('SubagentStop', input);
      expect(result.valid).toBe(true);
    });

    it('should reject SubagentStop without agent ID', () => {
      const input = { status: 'success' };
      const result = validateHookInput('SubagentStop', input);
      expect(result.valid).toBe(false);
    });
  });

  describe('SessionStart validation', () => {
    it('should accept valid SessionStart input', () => {
      const input = {
        session_id: 'session-123',
        cwd: '/path/to/project',
      };
      const result = validateHookInput('SessionStart', input);
      expect(result.valid).toBe(true);
    });

    it('should reject SessionStart without session_id', () => {
      const input = { cwd: '/path' };
      const result = validateHookInput('SessionStart', input);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('session_id');
    });

    it('should reject SessionStart with empty session_id', () => {
      const input = { session_id: '' };
      const result = validateHookInput('SessionStart', input);
      expect(result.valid).toBe(false);
    });
  });

  describe('SessionStop validation', () => {
    it('should accept valid SessionStop input', () => {
      const input = { session_id: 'session-123' };
      const result = validateHookInput('SessionStop', input);
      expect(result.valid).toBe(true);
    });

    it('should reject SessionStop without session_id', () => {
      const input = {};
      const result = validateHookInput('SessionStop', input);
      expect(result.valid).toBe(false);
    });
  });

  describe('unknown hook type', () => {
    it('should reject unknown hook types', () => {
      const input = { tool_name: 'Test' };
      const result = validateHookInput('UnknownHook' as HookType, input);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Unknown hook type');
    });
  });
});

describe('safeStringify', () => {
  it('should stringify simple objects', () => {
    const obj = { a: 1, b: 'hello' };
    expect(safeStringify(obj)).toBe('{"a":1,"b":"hello"}');
  });

  it('should stringify arrays', () => {
    const arr = [1, 2, 3];
    expect(safeStringify(arr)).toBe('[1,2,3]');
  });

  it('should stringify primitives', () => {
    expect(safeStringify('string')).toBe('"string"');
    expect(safeStringify(123)).toBe('123');
    expect(safeStringify(true)).toBe('true');
    expect(safeStringify(null)).toBe('null');
  });

  it('should truncate long strings', () => {
    const obj = { data: 'x'.repeat(20000) };
    const result = safeStringify(obj, 1000);
    expect(result.length).toBeLessThanOrEqual(1020); // 1000 + "... [truncated]"
    expect(result).toContain('... [truncated]');
  });

  it('should not truncate short strings', () => {
    const obj = { data: 'short' };
    const result = safeStringify(obj, 1000);
    expect(result).not.toContain('truncated');
  });

  it('should handle circular references', () => {
    const obj: Record<string, unknown> = { a: 1 };
    obj.self = obj;
    const result = safeStringify(obj);
    expect(result).toBe('[unstringifiable object]');
  });

  it('should use default maxLength if not specified', () => {
    const obj = { data: 'x'.repeat(20000) };
    const result = safeStringify(obj);
    expect(result.length).toBeLessThanOrEqual(10260); // 10240 + "... [truncated]"
  });
});
