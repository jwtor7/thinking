import { describe, it, expect, beforeEach } from 'vitest';
import { matchesSessionFilter, matchesAgentFilter, matchesTextFilter } from './filter-service.ts';
import { state, subagentState } from '../state.ts';

describe('FilterService', () => {
  beforeEach(() => {
    state.selectedSession = 'all';
    state.selectedAgentId = null;
    subagentState.subagents.clear();
    subagentState.sessionSubagents.clear();
    subagentState.agentChildren.clear();
  });

  describe('matchesSessionFilter', () => {
    it('matches everything when selectedSession is "all"', () => {
      state.selectedSession = 'all';
      expect(matchesSessionFilter('session-1')).toBe(true);
      expect(matchesSessionFilter('')).toBe(true);
    });

    it('matches direct session', () => {
      state.selectedSession = 'session-1';
      expect(matchesSessionFilter('session-1')).toBe(true);
      expect(matchesSessionFilter('session-2')).toBe(false);
    });

    it('matches via parent session', () => {
      state.selectedSession = 'session-1';
      expect(matchesSessionFilter('session-child', 'session-1')).toBe(true);
      expect(matchesSessionFilter('session-child', 'session-2')).toBe(false);
    });

    it('matches via subagent parent resolution', () => {
      state.selectedSession = 'session-1';
      subagentState.subagents.set('agent-42', {
        agentId: 'agent-42',
        parentSessionId: 'session-1',
        agentName: 'test-agent',
        startTime: new Date().toISOString(),
        status: 'running',
      });
      expect(matchesSessionFilter('session-unknown', undefined, 'agent-42')).toBe(true);
    });

    it('does not match unrelated subagent', () => {
      state.selectedSession = 'session-1';
      subagentState.subagents.set('agent-42', {
        agentId: 'agent-42',
        parentSessionId: 'session-2',
        agentName: 'test-agent',
        startTime: new Date().toISOString(),
        status: 'running',
      });
      expect(matchesSessionFilter('session-unknown', undefined, 'agent-42')).toBe(false);
    });
  });

  describe('matchesAgentFilter', () => {
    it('matches all when no agent filter is set', () => {
      state.selectedAgentId = null;
      expect(matchesAgentFilter('any-agent')).toBe(true);
      expect(matchesAgentFilter(undefined)).toBe(true);
    });

    it('matches only selected agent', () => {
      state.selectedAgentId = 'agent-1';
      expect(matchesAgentFilter('agent-1')).toBe(true);
      expect(matchesAgentFilter('agent-2')).toBe(false);
      expect(matchesAgentFilter(undefined)).toBe(false);
    });
  });

  describe('matchesTextFilter', () => {
    it('matches everything when filter is empty', () => {
      expect(matchesTextFilter('anything', '')).toBe(true);
    });

    it('matches case-insensitively', () => {
      expect(matchesTextFilter('hello world', 'Hello')).toBe(true);
      expect(matchesTextFilter('hello world', 'WORLD')).toBe(true);
    });

    it('rejects non-matching text', () => {
      expect(matchesTextFilter('hello world', 'xyz')).toBe(false);
    });
  });
});
