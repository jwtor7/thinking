/**
 * Tests for the event dispatcher
 *
 * The dispatcher is a browser-side module that routes WebSocket events to handlers.
 * It imports from many browser modules (DOM elements, state, etc.), so we use
 * static analysis tests to verify patterns without requiring a DOM.
 *
 * Test categories:
 * 1. Event Type Coverage - all 17 event types have handlers
 * 2. Handler Imports - each handler is imported from correct module
 * 3. Session Tracking - trackSession called for events with sessionId
 * 4. Session Activity Updates - updateSessionActivity called for specific events
 * 5. Timeline Integration - addTimelineEntry called before dispatch
 * 6. Event Counter - state.eventCount and elements.eventCount updated
 * 7. Exhaustive Switch - never type check in default case
 * 8. Connection Status - handleConnectionStatus uses serverVersion with fallback
 * 9. Subagent Mapping - updateSessionFilter called after handleSubagentMapping
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const dispatcherPath = join(__dirname, 'dispatcher.ts');
const dispatcherContent = readFileSync(dispatcherPath, 'utf-8');

describe('Event Dispatcher - Static Analysis', () => {
  describe('Imports Structure', () => {
    it('should import state from state.ts', () => {
      expect(dispatcherContent).toContain("import { state } from '../state.ts'");
    });

    it('should import elements from ui/elements.ts', () => {
      expect(dispatcherContent).toContain("import { elements } from '../ui/elements.ts'");
    });

    it('should import types from types.ts', () => {
      expect(dispatcherContent).toContain("import type { StrictMonitorEvent, ConnectionStatusEvent } from '../types.ts'");
    });

    it('should import handler functions from sessions.ts', () => {
      expect(dispatcherContent).toContain(
        "import { trackSession, handleSessionStart, handleSessionStop, updateSessionActivity, updateSessionFilter } from './sessions.ts'"
      );
    });

    it('should import handler functions from thinking.ts', () => {
      expect(dispatcherContent).toContain("import { handleThinking } from './thinking.ts'");
    });

    it('should import handler functions from tools.ts', () => {
      expect(dispatcherContent).toContain("import { handleToolStart, handleToolEnd } from './tools.ts'");
    });

    it('should import handler functions from agents.ts', () => {
      expect(dispatcherContent).toContain("import { handleAgentStart, handleAgentStop, handleSubagentMapping } from './agents.ts'");
    });

    it('should import handler functions from plans.ts', () => {
      expect(dispatcherContent).toContain("import { handlePlanList, handlePlanUpdate, handlePlanDelete } from './plans.ts'");
    });

    it('should import handler functions from hooks.ts', () => {
      expect(dispatcherContent).toContain("import { handleHookExecution } from './hooks.ts'");
    });

    it('should import handler functions from team.ts', () => {
      expect(dispatcherContent).toContain("import { handleTeamUpdate, handleTeammateIdle, handleMessageSent } from './team.ts'");
    });

    it('should import handler functions from tasks.ts', () => {
      expect(dispatcherContent).toContain("import { handleTaskUpdate, handleTaskCompleted } from './tasks.ts'");
    });

    it('should import addTimelineEntry from timeline.ts', () => {
      expect(dispatcherContent).toContain("import { addTimelineEntry } from './timeline.ts'");
    });
  });

  describe('Event Type Coverage', () => {
    const eventTypes = [
      'connection_status',
      'thinking',
      'tool_start',
      'tool_end',
      'agent_start',
      'agent_stop',
      'session_start',
      'session_stop',
      'plan_update',
      'plan_delete',
      'plan_list',
      'hook_execution',
      'subagent_mapping',
      'team_update',
      'task_update',
      'message_sent',
      'teammate_idle',
      'task_completed',
    ];

    eventTypes.forEach((eventType) => {
      it(`should have a case handler for '${eventType}'`, () => {
        const casePattern = new RegExp(`case\\s+['"]${eventType}['"]\\s*:`);
        expect(dispatcherContent).toMatch(casePattern);
      });
    });

    it('should have exactly 18 case statements', () => {
      // Count case statements (excluding the case in 'case:' comments)
      const caseMatches = dispatcherContent.match(/^\s*case\s+/gm);
      expect(caseMatches).toBeTruthy();
      // We expect at least 18 cases
      expect(caseMatches!.length).toBeGreaterThanOrEqual(18);
    });

    it('should have all cases within the switch statement', () => {
      // Verify the switch statement contains all event types
      const switchStart = dispatcherContent.indexOf('switch (event.type)');
      expect(switchStart).toBeGreaterThanOrEqual(0);

      eventTypes.forEach((eventType) => {
        // Each event type should have a case statement somewhere after the switch
        const casePattern = `case '${eventType}'`;
        const caseIndex = dispatcherContent.indexOf(casePattern, switchStart);
        expect(caseIndex).toBeGreaterThan(switchStart);
      });
    });
  });

  describe('Handler Function Calls', () => {
    it('should call handleConnectionStatus for connection_status events', () => {
      expect(dispatcherContent).toContain(
        "case 'connection_status':\n        handleConnectionStatus(event);"
      );
    });

    it('should call handleThinking for thinking events', () => {
      expect(dispatcherContent).toMatch(/case 'thinking':\s+handleThinking\(event\)/);
    });

    it('should call handleToolStart for tool_start events', () => {
      expect(dispatcherContent).toMatch(/case 'tool_start':\s+handleToolStart\(event\)/);
    });

    it('should call handleToolEnd for tool_end events', () => {
      expect(dispatcherContent).toMatch(/case 'tool_end':\s+handleToolEnd\(event\)/);
    });

    it('should call handleAgentStart for agent_start events', () => {
      expect(dispatcherContent).toMatch(/case 'agent_start':\s+handleAgentStart\(event\)/);
    });

    it('should call handleAgentStop for agent_stop events', () => {
      expect(dispatcherContent).toMatch(/case 'agent_stop':\s+handleAgentStop\(event\)/);
    });

    it('should call handleSessionStart for session_start events', () => {
      expect(dispatcherContent).toMatch(/case 'session_start':\s+handleSessionStart\(event\)/);
    });

    it('should call handleSessionStop for session_stop events', () => {
      expect(dispatcherContent).toMatch(/case 'session_stop':\s+handleSessionStop\(event\)/);
    });

    it('should call handlePlanUpdate for plan_update events', () => {
      expect(dispatcherContent).toMatch(/case 'plan_update':\s+handlePlanUpdate\(event\)/);
    });

    it('should call handlePlanDelete for plan_delete events', () => {
      expect(dispatcherContent).toMatch(/case 'plan_delete':\s+handlePlanDelete\(event\)/);
    });

    it('should call handlePlanList for plan_list events', () => {
      expect(dispatcherContent).toMatch(/case 'plan_list':\s+handlePlanList\(event\)/);
    });

    it('should call handleHookExecution for hook_execution events', () => {
      expect(dispatcherContent).toMatch(/case 'hook_execution':\s+handleHookExecution\(event\)/);
    });

    it('should call handleSubagentMapping for subagent_mapping events', () => {
      expect(dispatcherContent).toMatch(/case 'subagent_mapping':\s+handleSubagentMapping\(event\)/);
    });

    it('should call handleTeamUpdate for team_update events', () => {
      expect(dispatcherContent).toMatch(/case 'team_update':\s+handleTeamUpdate\(event\)/);
    });

    it('should call handleTaskUpdate for task_update events', () => {
      expect(dispatcherContent).toMatch(/case 'task_update':\s+handleTaskUpdate\(event\)/);
    });

    it('should call handleMessageSent for message_sent events', () => {
      expect(dispatcherContent).toMatch(/case 'message_sent':\s+handleMessageSent\(event\)/);
    });

    it('should call handleTeammateIdle for teammate_idle events', () => {
      expect(dispatcherContent).toMatch(/case 'teammate_idle':\s+handleTeammateIdle\(event\)/);
    });

    it('should call handleTaskCompleted for task_completed events', () => {
      expect(dispatcherContent).toMatch(/case 'task_completed':\s+handleTaskCompleted\(event\)/);
    });
  });

  describe('Timeline Integration', () => {
    it('should import addTimelineEntry from timeline.ts', () => {
      expect(dispatcherContent).toContain("import { addTimelineEntry } from './timeline.ts'");
    });

    it('should call addTimelineEntry before switch dispatch', () => {
      // Verify addTimelineEntry is called before the switch statement
      const beforeSwitch = dispatcherContent.split('switch (event.type)')[0];
      expect(beforeSwitch).toContain('addTimelineEntry(event)');
    });

    it('should pass event to addTimelineEntry', () => {
      expect(dispatcherContent).toContain('addTimelineEntry(event)');
    });
  });

  describe('Session Tracking', () => {
    it('should import trackSession from sessions.ts', () => {
      expect(dispatcherContent).toContain('trackSession');
    });

    it('should call trackSession if event has sessionId', () => {
      expect(dispatcherContent).toMatch(/if\s*\(\s*event\.sessionId\s*\)\s*\{\s*trackSession\(event\.sessionId/);
    });

    it('should pass sessionId and timestamp to trackSession', () => {
      expect(dispatcherContent).toContain('trackSession(event.sessionId, event.timestamp)');
    });

    it('should check sessionId before calling trackSession', () => {
      // Verify the conditional is present
      expect(dispatcherContent).toMatch(/if\s*\(\s*event\.sessionId\s*\)/);
    });
  });

  describe('Session Activity Updates', () => {
    const eventsWithActivity = ['thinking', 'tool_start', 'tool_end', 'hook_execution'];

    eventsWithActivity.forEach((eventType) => {
      it(`should call updateSessionActivity for ${eventType} events with sessionId`, () => {
        // Find the case block for this event type
        const caseStart = dispatcherContent.indexOf(`case '${eventType}':`);
        expect(caseStart).toBeGreaterThanOrEqual(0);

        // Find the next case or default to delimit the block
        const nextCaseStart = dispatcherContent.indexOf("case '", caseStart + 1);
        const defaultStart = dispatcherContent.indexOf('default:', caseStart);

        let caseEnd = nextCaseStart;
        if (defaultStart > caseStart && (caseEnd < 0 || defaultStart < caseEnd)) {
          caseEnd = defaultStart;
        }

        const caseBody = dispatcherContent.substring(caseStart, caseEnd > 0 ? caseEnd : dispatcherContent.length);

        // Verify both patterns exist in this case
        expect(caseBody).toContain('if (event.sessionId)');
        expect(caseBody).toContain('updateSessionActivity(event.sessionId)');
      });
    });

    it('should NOT call updateSessionActivity for session_start events', () => {
      const caseStart = dispatcherContent.indexOf("case 'session_start':");
      expect(caseStart).toBeGreaterThanOrEqual(0);

      // Find the break statement for this case
      const breakPos = dispatcherContent.indexOf('break;', caseStart);
      const caseBody = dispatcherContent.substring(caseStart, breakPos + 6);

      // The case should not have updateSessionActivity within it
      expect(caseBody).not.toContain('updateSessionActivity');
    });

    it('should NOT call updateSessionActivity for agent_start events', () => {
      const caseStart = dispatcherContent.indexOf("case 'agent_start':");
      expect(caseStart).toBeGreaterThanOrEqual(0);

      const breakPos = dispatcherContent.indexOf('break;', caseStart);
      const caseBody = dispatcherContent.substring(caseStart, breakPos + 6);

      expect(caseBody).not.toContain('updateSessionActivity');
    });
  });

  describe('Event Counter Management', () => {
    it('should increment state.eventCount', () => {
      expect(dispatcherContent).toContain('state.eventCount++');
    });

    it('should update elements.eventCount.textContent with count', () => {
      expect(dispatcherContent).toContain('elements.eventCount.textContent = `Events: ${state.eventCount}`');
    });

    it('should update event count before processing event', () => {
      const handlerStart = dispatcherContent.indexOf('export function handleEvent');
      const counterUpdate = dispatcherContent.indexOf('state.eventCount++', handlerStart);
      const timelineAdd = dispatcherContent.indexOf('addTimelineEntry', handlerStart);
      expect(counterUpdate).toBeGreaterThanOrEqual(0);
      expect(timelineAdd).toBeGreaterThanOrEqual(0);
      expect(counterUpdate).toBeLessThan(timelineAdd);
    });
  });

  describe('Logging', () => {
    it('should log event details via debug()', () => {
      expect(dispatcherContent).toContain("debug(`[Dashboard] Event received:`");
    });

    it('should log event type in console output', () => {
      expect(dispatcherContent).toMatch(/type:\s*event\.type/);
    });

    it('should log sessionId in console output', () => {
      expect(dispatcherContent).toMatch(/sessionId:\s*event\.sessionId/);
    });

    it('should log agentId in console output', () => {
      expect(dispatcherContent).toMatch(/agentId:\s*event\.agentId/);
    });

    it('should log timestamp in console output', () => {
      expect(dispatcherContent).toMatch(/timestamp:\s*event\.timestamp/);
    });
  });

  describe('Exhaustive Switch Check', () => {
    it('should have default case in switch statement', () => {
      expect(dispatcherContent).toMatch(/default\s*:\s*\{/);
    });

    it('should use never type for exhaustiveness check', () => {
      expect(dispatcherContent).toContain('const exhaustiveCheck: never = event');
    });

    it('should have type assertion in default case', () => {
      expect(dispatcherContent).toMatch(/exhaustiveCheck\s+as\s*\{\s*type:\s*string\s*\}/);
    });

    it('should log unhandled event types', () => {
      expect(dispatcherContent).toContain("debug('[Dashboard] Unhandled event type:'");
    });

    it('should extract type from exhaustive check assertion', () => {
      expect(dispatcherContent).toContain('(exhaustiveCheck as { type: string }).type');
    });
  });

  describe('Connection Status Handler', () => {
    it('should have separate handleConnectionStatus function', () => {
      expect(dispatcherContent).toContain('export function handleConnectionStatus(event: ConnectionStatusEvent)');
    });

    it('should use serverVersion from event with fallback to unknown', () => {
      expect(dispatcherContent).toContain("const version = event.serverVersion || 'unknown'");
    });

    it('should update elements.serverInfo.textContent', () => {
      expect(dispatcherContent).toContain('elements.serverInfo.textContent = `Server: v${version}`');
    });

    it('should handle missing serverVersion gracefully', () => {
      // Verify the || 'unknown' pattern is used
      expect(dispatcherContent).toMatch(/event\.serverVersion\s*\|\|\s*['"]unknown['"]/);
    });

    it('should format version with v prefix', () => {
      expect(dispatcherContent).toContain('`Server: v${version}`');
    });
  });

  describe('Subagent Mapping Special Case', () => {
    it('should call handleSubagentMapping for subagent_mapping events', () => {
      expect(dispatcherContent).toMatch(/case 'subagent_mapping':\s+handleSubagentMapping\(event\)/);
    });

    it('should call updateSessionFilter after handleSubagentMapping', () => {
      const subagentCase = dispatcherContent.match(/case 'subagent_mapping':[^}]*?break;/s);
      expect(subagentCase).toBeTruthy();
      const caseBody = subagentCase![0];
      const mapIndex = caseBody.indexOf('handleSubagentMapping');
      const filterIndex = caseBody.indexOf('updateSessionFilter');
      expect(mapIndex).toBeLessThan(filterIndex);
    });

    it('should call updateSessionFilter without parameters', () => {
      expect(dispatcherContent).toContain('updateSessionFilter()');
    });

    it('should import updateSessionFilter from sessions.ts', () => {
      expect(dispatcherContent).toContain('updateSessionFilter');
    });
  });

  describe('Export Signature', () => {
    it('should export handleEvent function', () => {
      expect(dispatcherContent).toContain('export function handleEvent');
    });

    it('should accept StrictMonitorEvent parameter', () => {
      expect(dispatcherContent).toContain('handleEvent(event: StrictMonitorEvent)');
    });

    it('should return void', () => {
      expect(dispatcherContent).toContain('handleEvent(event: StrictMonitorEvent): void');
    });

    it('should export handleConnectionStatus function', () => {
      expect(dispatcherContent).toContain('export function handleConnectionStatus');
    });

    it('should accept ConnectionStatusEvent parameter', () => {
      expect(dispatcherContent).toContain('handleConnectionStatus(event: ConnectionStatusEvent)');
    });
  });

  describe('Code Structure', () => {
    it('should have switch statement for event type dispatch', () => {
      expect(dispatcherContent).toMatch(/switch\s*\(\s*event\.type\s*\)\s*\{/);
    });

    it('should use break statements to exit cases', () => {
      const breakCount = (dispatcherContent.match(/break;/g) || []).length;
      expect(breakCount).toBeGreaterThan(0);
    });

    it('should have comments documenting key functions', () => {
      expect(dispatcherContent).toContain('/**');
      expect(dispatcherContent).toContain('*');
      expect(dispatcherContent).toContain('*/');
    });

    it('should add timeline before dispatch', () => {
      const beforeSwitch = dispatcherContent.split('switch (event.type)')[0];
      expect(beforeSwitch).toContain('addTimelineEntry(event)');
      expect(beforeSwitch).toContain('debug(');
    });
  });

  describe('Integration Flow', () => {
    it('should follow the correct event handling sequence', () => {
      const handlerBody = dispatcherContent.split('export function handleEvent')[1];
      expect(handlerBody).toBeTruthy();

      // Extract indices for key operations
      const countIdx = handlerBody.indexOf('state.eventCount++');
      const timelineIdx = handlerBody.indexOf('addTimelineEntry');
      const logIdx = handlerBody.indexOf('debug(');
      const sessionTrackIdx = handlerBody.indexOf('trackSession');
      const switchIdx = handlerBody.indexOf('switch');

      // Verify order: count -> timeline -> log -> session track -> switch
      expect(countIdx).toBeGreaterThanOrEqual(0);
      expect(timelineIdx).toBeGreaterThan(countIdx);
      expect(logIdx).toBeGreaterThan(timelineIdx);
      expect(switchIdx).toBeGreaterThan(sessionTrackIdx);
    });
  });
});
