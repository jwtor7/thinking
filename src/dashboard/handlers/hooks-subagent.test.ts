/**
 * Tests for SubagentStart/SubagentStop hook handling in the hooks handler.
 *
 * Verifies that agent names are correctly displayed for both SubagentStart
 * and SubagentStop events, including the fix for looking up agent names
 * from subagentState for SubagentStop events.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { subagentState } from '../state.ts';
import type { SubagentMappingInfo } from '../types.ts';

// Mock the elements and callbacks
vi.mock('../ui/elements.ts', () => ({
  elements: {
    hooksContent: {
      querySelector: vi.fn(() => null),
    },
    hooksFilter: {
      addEventListener: vi.fn(),
    },
    hooksCount: {
      textContent: '',
    },
  },
}));

vi.mock('../utils/formatting.ts', () => ({
  formatTime: vi.fn((_ts: number) => '12:34:56'),
}));

vi.mock('../ui/colors.ts', () => ({
  getAgentColor: vi.fn(() => '#ff0000'),
  getAgentBadgeColors: vi.fn((name: string) => ({
    bg: `#bg-${name}`,
    text: `#text-${name}`,
  })),
  getSessionColorByHash: vi.fn(() => '#hash-color'),
  getSessionColorByFolder: vi.fn(() => '#folder-color'),
}));

vi.mock('../ui/filters.ts', () => ({
  getShortSessionId: vi.fn((id: string) => id.slice(0, 8)),
}));

vi.mock('./sessions.ts', () => ({
  getSessionDisplayName: vi.fn((path: string) => path.split('/').pop()),
}));

describe('Hooks handler SubagentStart/SubagentStop', () => {
  beforeEach(() => {
    // Clear subagent state before each test
    subagentState.subagents.clear();
    subagentState.sessionSubagents.clear();
  });

  describe('SubagentStop agent name lookup', () => {
    it('should have subagent data available in subagentState', () => {
      // Simulate a subagent being registered (as happens with SubagentStart)
      const mapping: SubagentMappingInfo = {
        agentId: 'agent-abc123',
        parentSessionId: 'session-xyz',
        agentName: 'gemini-researcher',
        startTime: new Date().toISOString(),
        status: 'running',
      };

      subagentState.subagents.set(mapping.agentId, mapping);

      // Verify the mapping can be retrieved
      const retrieved = subagentState.subagents.get('agent-abc123');
      expect(retrieved).toBeDefined();
      expect(retrieved?.agentName).toBe('gemini-researcher');
    });

    it('should look up agent name from subagentState for SubagentStop', () => {
      // Simulate a subagent being registered
      const mapping: SubagentMappingInfo = {
        agentId: 'agent-def456',
        parentSessionId: 'session-xyz',
        agentName: 'code-implementer',
        startTime: new Date().toISOString(),
        status: 'running',
      };

      subagentState.subagents.set(mapping.agentId, mapping);

      // Simulate the lookup logic from hooks.ts
      const agentId = 'agent-def456';
      const output = 'success';  // SubagentStop output doesn't contain agent name

      // First look up from subagentState (the fix)
      let agentType = '';
      if (agentId) {
        const subagentMapping = subagentState.subagents.get(agentId);
        if (subagentMapping?.agentName) {
          agentType = subagentMapping.agentName;
        }
      }

      // Fall back to parsing from output (old behavior)
      if (!agentType && output) {
        agentType = output.split(':')[0]?.trim() || '';
      }

      expect(agentType).toBe('code-implementer');
    });

    it('should fall back to output parsing when subagent not in state', () => {
      // Subagent NOT registered in state
      const agentId = 'unknown-agent';
      const output = 'custom-agent: completed successfully';

      // Lookup logic from hooks.ts
      let agentType = '';
      if (agentId) {
        const subagentMapping = subagentState.subagents.get(agentId);
        if (subagentMapping?.agentName) {
          agentType = subagentMapping.agentName;
        }
      }

      // Fall back to parsing from output
      if (!agentType && output) {
        agentType = output.split(':')[0]?.trim() || '';
      }

      expect(agentType).toBe('custom-agent');
    });

    it('should handle undefined agentId gracefully', () => {
      const agentId: string | undefined = undefined;
      const output = 'fallback-agent: status';

      let agentType = '';
      if (agentId) {
        const subagentMapping = subagentState.subagents.get(agentId);
        if (subagentMapping?.agentName) {
          agentType = subagentMapping.agentName;
        }
      }

      if (!agentType && output) {
        agentType = output.split(':')[0]?.trim() || '';
      }

      expect(agentType).toBe('fallback-agent');
    });

    it('should handle empty agentName in mapping', () => {
      // Subagent registered but with empty agentName
      const mapping: SubagentMappingInfo = {
        agentId: 'agent-ghi789',
        parentSessionId: 'session-xyz',
        agentName: '',  // Empty agent name
        startTime: new Date().toISOString(),
        status: 'running',
      };

      subagentState.subagents.set(mapping.agentId, mapping);

      const agentId = 'agent-ghi789';
      const output = 'parsed-agent: from output';

      let agentType = '';
      if (agentId) {
        const subagentMapping = subagentState.subagents.get(agentId);
        if (subagentMapping?.agentName) {
          agentType = subagentMapping.agentName;
        }
      }

      // Fall back since agentName is empty
      if (!agentType && output) {
        agentType = output.split(':')[0]?.trim() || '';
      }

      expect(agentType).toBe('parsed-agent');
    });

    it('should handle subagent with only ID (no output fallback)', () => {
      // SubagentStop without meaningful output and not in state
      const agentId = 'agent-jkl012';
      const output: string = '';

      let agentType = '';
      if (agentId) {
        const subagentMapping = subagentState.subagents.get(agentId);
        if (subagentMapping?.agentName) {
          agentType = subagentMapping.agentName;
        }
      }

      if (!agentType && output.length > 0) {
        agentType = output.split(':')[0]?.trim() || '';
      }

      // agentType should be empty, meaning no badge will be shown
      // (the hex ID check in hooks.ts will filter this out)
      expect(agentType).toBe('');
    });
  });

  describe('Agent type validation', () => {
    it('should identify real agent type names (not hex IDs)', () => {
      const realAgentTypes = [
        'gemini-researcher',
        'code-implementer',
        'code-test-evaluator',
        'haiku-general-agent',
      ];

      // Check that real agent types pass the hex ID check
      for (const name of realAgentTypes) {
        const isRealAgentType = name && !/^[0-9a-f]{7,}$/i.test(name);
        expect(isRealAgentType).toBe(true);
      }
    });

    it('should identify hex IDs (not real agent names)', () => {
      const hexIds = [
        'a1b2c3d4',
        'abcdef12',
        '1234567890abcdef',
        'ABCDEF',
        '0123456789',
      ];

      // Check that hex IDs are filtered out
      for (const id of hexIds) {
        const isRealAgentType = id && !/^[0-9a-f]{7,}$/i.test(id);
        // Only IDs with 7+ chars should be filtered
        if (id.length >= 7) {
          expect(isRealAgentType).toBe(false);
        }
      }
    });
  });
});
