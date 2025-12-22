/**
 * Unit tests for the types module.
 *
 * Tests the isMonitorEvent type guard and truncatePayload function.
 */

import { describe, it, expect } from 'vitest';
import { isMonitorEvent, truncatePayload, CONFIG } from './types.ts';

describe('isMonitorEvent', () => {
  it('should return true for valid thinking event', () => {
    const event = {
      type: 'thinking',
      timestamp: '2025-12-21T00:00:00Z',
      content: 'Test content',
    };
    expect(isMonitorEvent(event)).toBe(true);
  });

  it('should return true for valid tool_start event', () => {
    const event = {
      type: 'tool_start',
      timestamp: '2025-12-21T00:00:00Z',
      toolName: 'Read',
      toolCallId: 'test-123',
    };
    expect(isMonitorEvent(event)).toBe(true);
  });

  it('should return true for valid tool_end event', () => {
    const event = {
      type: 'tool_end',
      timestamp: '2025-12-21T00:00:00Z',
      toolName: 'Read',
      toolCallId: 'test-123',
      durationMs: 150,
    };
    expect(isMonitorEvent(event)).toBe(true);
  });

  it('should return true for valid agent_start event', () => {
    const event = {
      type: 'agent_start',
      timestamp: '2025-12-21T00:00:00Z',
      agentId: 'subagent-001',
      agentName: 'explore',
    };
    expect(isMonitorEvent(event)).toBe(true);
  });

  it('should return true for valid agent_stop event', () => {
    const event = {
      type: 'agent_stop',
      timestamp: '2025-12-21T00:00:00Z',
      agentId: 'subagent-001',
      status: 'success',
    };
    expect(isMonitorEvent(event)).toBe(true);
  });

  it('should return true for valid session_start event', () => {
    const event = {
      type: 'session_start',
      timestamp: '2025-12-21T00:00:00Z',
      sessionId: 'session-001',
    };
    expect(isMonitorEvent(event)).toBe(true);
  });

  it('should return true for valid plan_update event', () => {
    const event = {
      type: 'plan_update',
      timestamp: '2025-12-21T00:00:00Z',
      path: '/path/to/plan.md',
      filename: 'plan.md',
      content: '# Plan',
    };
    expect(isMonitorEvent(event)).toBe(true);
  });

  it('should return true for valid connection_status event', () => {
    const event = {
      type: 'connection_status',
      timestamp: '2025-12-21T00:00:00Z',
      status: 'connected',
      serverVersion: '0.1.0',
      clientCount: 1,
    };
    expect(isMonitorEvent(event)).toBe(true);
  });

  it('should return false for null', () => {
    expect(isMonitorEvent(null)).toBe(false);
  });

  it('should return false for undefined', () => {
    expect(isMonitorEvent(undefined)).toBe(false);
  });

  it('should return false for non-object', () => {
    expect(isMonitorEvent('string')).toBe(false);
    expect(isMonitorEvent(123)).toBe(false);
    expect(isMonitorEvent(true)).toBe(false);
  });

  it('should return false for missing type', () => {
    const event = {
      timestamp: '2025-12-21T00:00:00Z',
      content: 'Test',
    };
    expect(isMonitorEvent(event)).toBe(false);
  });

  it('should return false for missing timestamp', () => {
    const event = {
      type: 'thinking',
      content: 'Test',
    };
    expect(isMonitorEvent(event)).toBe(false);
  });

  it('should return false for invalid type', () => {
    const event = {
      type: 'unknown_event',
      timestamp: '2025-12-21T00:00:00Z',
    };
    expect(isMonitorEvent(event)).toBe(false);
  });

  it('should return false for non-string type', () => {
    const event = {
      type: 123,
      timestamp: '2025-12-21T00:00:00Z',
    };
    expect(isMonitorEvent(event)).toBe(false);
  });

  it('should return false for non-string timestamp', () => {
    const event = {
      type: 'thinking',
      timestamp: Date.now(),
    };
    expect(isMonitorEvent(event)).toBe(false);
  });
});

describe('truncatePayload', () => {
  it('should return undefined for undefined input', () => {
    expect(truncatePayload(undefined)).toBeUndefined();
  });

  it('should return empty string for empty input', () => {
    expect(truncatePayload('')).toBe('');
  });

  it('should not truncate short content', () => {
    const content = 'Short content';
    expect(truncatePayload(content)).toBe(content);
  });

  it('should not truncate content at exactly MAX_PAYLOAD_SIZE', () => {
    const content = 'A'.repeat(CONFIG.MAX_PAYLOAD_SIZE);
    expect(truncatePayload(content)).toBe(content);
  });

  it('should truncate content exceeding MAX_PAYLOAD_SIZE', () => {
    const content = 'A'.repeat(CONFIG.MAX_PAYLOAD_SIZE + 100);
    const result = truncatePayload(content);
    expect(result).not.toBeUndefined();
    expect(result!.length).toBeLessThan(content.length);
    expect(result!.endsWith('\n... [truncated]')).toBe(true);
  });

  it('should truncate to MAX_PAYLOAD_SIZE plus suffix length', () => {
    const content = 'A'.repeat(CONFIG.MAX_PAYLOAD_SIZE + 1000);
    const result = truncatePayload(content);
    const expectedPrefix = content.slice(0, CONFIG.MAX_PAYLOAD_SIZE);
    expect(result).toBe(expectedPrefix + '\n... [truncated]');
  });
});

describe('CONFIG', () => {
  it('should have WS_PORT as 3355', () => {
    expect(CONFIG.WS_PORT).toBe(3355);
  });

  it('should have STATIC_PORT as 3356', () => {
    expect(CONFIG.STATIC_PORT).toBe(3356);
  });

  it('should have HOST as 127.0.0.1', () => {
    expect(CONFIG.HOST).toBe('127.0.0.1');
  });

  it('should have MAX_PAYLOAD_SIZE as 10KB', () => {
    expect(CONFIG.MAX_PAYLOAD_SIZE).toBe(10 * 1024);
  });

  it('should have VERSION defined', () => {
    expect(CONFIG.VERSION).toBeDefined();
    expect(typeof CONFIG.VERSION).toBe('string');
  });
});
