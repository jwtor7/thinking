/**
 * Test Suite for SubagentMapper
 *
 * Tests the server-side parent/child relationship tracking for subagents.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SubagentMapper } from './subagent-mapper.ts';

describe('SubagentMapper', () => {
  let mapper: SubagentMapper;

  beforeEach(() => {
    mapper = new SubagentMapper();
    // Clear timers before each test
    vi.useFakeTimers();
  });

  afterEach(() => {
    mapper.destroy();
    vi.useRealTimers();
  });

  describe('Registration', () => {
    it('should register a new subagent', () => {
      mapper.registerSubagent(
        'agent-123',
        'session-abc',
        'test-agent',
        '2026-01-11T12:00:00Z'
      );

      const subagent = mapper.getSubagent('agent-123');
      expect(subagent).toBeDefined();
      expect(subagent?.agentId).toBe('agent-123');
      expect(subagent?.parentSessionId).toBe('session-abc');
      expect(subagent?.agentName).toBe('test-agent');
      expect(subagent?.status).toBe('running');
    });

    it('should track subagent under parent session', () => {
      mapper.registerSubagent(
        'agent-123',
        'session-abc',
        'test-agent',
        '2026-01-11T12:00:00Z'
      );

      const subagents = mapper.getSessionSubagents('session-abc');
      expect(subagents).toHaveLength(1);
      expect(subagents[0].agentId).toBe('agent-123');
    });

    it('should allow multiple subagents for same session', () => {
      mapper.registerSubagent(
        'agent-1',
        'session-abc',
        'agent-one',
        '2026-01-11T12:00:00Z'
      );
      mapper.registerSubagent(
        'agent-2',
        'session-abc',
        'agent-two',
        '2026-01-11T12:00:01Z'
      );

      const subagents = mapper.getSessionSubagents('session-abc');
      expect(subagents).toHaveLength(2);
    });

    it('should clear pending cleanup timer when re-registering', () => {
      // Register and stop
      mapper.registerSubagent(
        'agent-123',
        'session-abc',
        'test-agent',
        '2026-01-11T12:00:00Z'
      );
      mapper.stopSubagent('agent-123', 'success', '2026-01-11T12:01:00Z');

      // Re-register before cleanup
      mapper.registerSubagent(
        'agent-123',
        'session-abc',
        'test-agent',
        '2026-01-11T12:02:00Z'
      );

      const subagent = mapper.getSubagent('agent-123');
      expect(subagent?.status).toBe('running');
    });
  });

  describe('Parent Session Lookup', () => {
    it('should return parent session ID for a subagent', () => {
      mapper.registerSubagent(
        'agent-123',
        'session-abc',
        'test-agent',
        '2026-01-11T12:00:00Z'
      );

      const parentId = mapper.getParentSession('agent-123');
      expect(parentId).toBe('session-abc');
    });

    it('should return undefined for unknown subagent', () => {
      const parentId = mapper.getParentSession('unknown-agent');
      expect(parentId).toBeUndefined();
    });
  });

  describe('Subagent Identification', () => {
    it('should identify registered subagents', () => {
      mapper.registerSubagent(
        'agent-123',
        'session-abc',
        'test-agent',
        '2026-01-11T12:00:00Z'
      );

      expect(mapper.isSubagent('agent-123')).toBe(true);
    });

    it('should not identify unregistered agents', () => {
      expect(mapper.isSubagent('unknown-agent')).toBe(false);
    });
  });

  describe('Stopping Subagents', () => {
    it('should mark subagent as stopped', () => {
      mapper.registerSubagent(
        'agent-123',
        'session-abc',
        'test-agent',
        '2026-01-11T12:00:00Z'
      );
      mapper.stopSubagent('agent-123', 'success', '2026-01-11T12:01:00Z');

      const subagent = mapper.getSubagent('agent-123');
      expect(subagent?.status).toBe('success');
      expect(subagent?.endTime).toBe('2026-01-11T12:01:00Z');
    });

    it('should handle different stop statuses', () => {
      mapper.registerSubagent(
        'agent-1',
        'session-abc',
        'agent-one',
        '2026-01-11T12:00:00Z'
      );
      mapper.registerSubagent(
        'agent-2',
        'session-abc',
        'agent-two',
        '2026-01-11T12:00:00Z'
      );
      mapper.registerSubagent(
        'agent-3',
        'session-abc',
        'agent-three',
        '2026-01-11T12:00:00Z'
      );

      mapper.stopSubagent('agent-1', 'success', '2026-01-11T12:01:00Z');
      mapper.stopSubagent('agent-2', 'failure', '2026-01-11T12:01:00Z');
      mapper.stopSubagent('agent-3', 'cancelled', '2026-01-11T12:01:00Z');

      expect(mapper.getSubagent('agent-1')?.status).toBe('success');
      expect(mapper.getSubagent('agent-2')?.status).toBe('failure');
      expect(mapper.getSubagent('agent-3')?.status).toBe('cancelled');
    });

    it('should gracefully handle stopping unknown subagent', () => {
      // Should not throw
      mapper.stopSubagent('unknown-agent', 'success', '2026-01-11T12:01:00Z');
      expect(mapper.getSubagent('unknown-agent')).toBeUndefined();
    });
  });

  describe('Cleanup After Grace Period', () => {
    it('should schedule cleanup after stopping', () => {
      mapper.registerSubagent(
        'agent-123',
        'session-abc',
        'test-agent',
        '2026-01-11T12:00:00Z'
      );
      mapper.stopSubagent('agent-123', 'success', '2026-01-11T12:01:00Z');

      // Before grace period
      expect(mapper.getSubagent('agent-123')).toBeDefined();

      // After grace period (5 minutes)
      vi.advanceTimersByTime(5 * 60 * 1000);

      expect(mapper.getSubagent('agent-123')).toBeUndefined();
    });

    it('should remove subagent from session tracking after cleanup', () => {
      mapper.registerSubagent(
        'agent-123',
        'session-abc',
        'test-agent',
        '2026-01-11T12:00:00Z'
      );
      mapper.stopSubagent('agent-123', 'success', '2026-01-11T12:01:00Z');

      // Before cleanup
      expect(mapper.getSessionSubagents('session-abc')).toHaveLength(1);

      // After cleanup
      vi.advanceTimersByTime(5 * 60 * 1000);

      expect(mapper.getSessionSubagents('session-abc')).toHaveLength(0);
    });
  });

  describe('Session Cleanup', () => {
    it('should clean up all subagents when session stops', () => {
      mapper.registerSubagent(
        'agent-1',
        'session-abc',
        'agent-one',
        '2026-01-11T12:00:00Z'
      );
      mapper.registerSubagent(
        'agent-2',
        'session-abc',
        'agent-two',
        '2026-01-11T12:00:01Z'
      );

      mapper.cleanupSessionSubagents('session-abc');

      expect(mapper.getSubagent('agent-1')).toBeUndefined();
      expect(mapper.getSubagent('agent-2')).toBeUndefined();
      expect(mapper.getSessionSubagents('session-abc')).toHaveLength(0);
    });

    it('should cancel pending cleanup timers on session cleanup', () => {
      mapper.registerSubagent(
        'agent-123',
        'session-abc',
        'test-agent',
        '2026-01-11T12:00:00Z'
      );
      mapper.stopSubagent('agent-123', 'success', '2026-01-11T12:01:00Z');

      // Cleanup before grace period
      mapper.cleanupSessionSubagents('session-abc');

      expect(mapper.getSubagent('agent-123')).toBeUndefined();
    });

    it('should only affect subagents of the specified session', () => {
      mapper.registerSubagent(
        'agent-1',
        'session-abc',
        'agent-one',
        '2026-01-11T12:00:00Z'
      );
      mapper.registerSubagent(
        'agent-2',
        'session-xyz',
        'agent-two',
        '2026-01-11T12:00:00Z'
      );

      mapper.cleanupSessionSubagents('session-abc');

      expect(mapper.getSubagent('agent-1')).toBeUndefined();
      expect(mapper.getSubagent('agent-2')).toBeDefined();
    });

    it('should handle cleanup of session with no subagents', () => {
      // Should not throw
      mapper.cleanupSessionSubagents('unknown-session');
      expect(mapper.getSessionSubagents('unknown-session')).toHaveLength(0);
    });
  });

  describe('Get All Mappings', () => {
    it('should return all registered subagents', () => {
      mapper.registerSubagent(
        'agent-1',
        'session-abc',
        'agent-one',
        '2026-01-11T12:00:00Z'
      );
      mapper.registerSubagent(
        'agent-2',
        'session-xyz',
        'agent-two',
        '2026-01-11T12:00:00Z'
      );

      const all = mapper.getAllMappings();
      expect(all).toHaveLength(2);
    });

    it('should return empty array when no subagents registered', () => {
      const all = mapper.getAllMappings();
      expect(all).toHaveLength(0);
    });

    it('should not include internal cleanupTimer field', () => {
      mapper.registerSubagent(
        'agent-123',
        'session-abc',
        'test-agent',
        '2026-01-11T12:00:00Z'
      );

      const all = mapper.getAllMappings();
      expect(all[0]).not.toHaveProperty('cleanupTimer');
    });
  });

  describe('Edge Cases', () => {
    it('should handle rapid start-stop-start cycles', () => {
      // Start
      mapper.registerSubagent(
        'agent-123',
        'session-abc',
        'test-agent',
        '2026-01-11T12:00:00Z'
      );

      // Stop
      mapper.stopSubagent('agent-123', 'success', '2026-01-11T12:01:00Z');
      expect(mapper.getSubagent('agent-123')?.status).toBe('success');

      // Restart before cleanup
      mapper.registerSubagent(
        'agent-123',
        'session-abc',
        'test-agent',
        '2026-01-11T12:02:00Z'
      );
      expect(mapper.getSubagent('agent-123')?.status).toBe('running');

      // Grace period should not remove it
      vi.advanceTimersByTime(5 * 60 * 1000);
      expect(mapper.getSubagent('agent-123')).toBeDefined();
    });

    it('should handle empty session subagents cleanup', () => {
      // Register subagent
      mapper.registerSubagent(
        'agent-123',
        'session-abc',
        'test-agent',
        '2026-01-11T12:00:00Z'
      );

      // Stop and let it clean up automatically
      mapper.stopSubagent('agent-123', 'success', '2026-01-11T12:01:00Z');
      vi.advanceTimersByTime(5 * 60 * 1000);

      // Now trying to cleanup session should not error
      mapper.cleanupSessionSubagents('session-abc');
    });
  });

  describe('Destroy', () => {
    it('should clear all mappings and timers', () => {
      mapper.registerSubagent(
        'agent-1',
        'session-abc',
        'agent-one',
        '2026-01-11T12:00:00Z'
      );
      mapper.registerSubagent(
        'agent-2',
        'session-xyz',
        'agent-two',
        '2026-01-11T12:00:00Z'
      );
      mapper.stopSubagent('agent-1', 'success', '2026-01-11T12:01:00Z');

      mapper.destroy();

      expect(mapper.getAllMappings()).toHaveLength(0);
      expect(mapper.getSessionSubagents('session-abc')).toHaveLength(0);
      expect(mapper.getSessionSubagents('session-xyz')).toHaveLength(0);
    });

    it('should be safe to call destroy multiple times', () => {
      mapper.registerSubagent(
        'agent-123',
        'session-abc',
        'test-agent',
        '2026-01-11T12:00:00Z'
      );

      mapper.destroy();
      mapper.destroy(); // Should not throw

      expect(mapper.getAllMappings()).toHaveLength(0);
    });
  });
});
