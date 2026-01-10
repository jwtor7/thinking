import { state } from '../state';
import { elements } from '../ui/elements';
import type { StrictMonitorEvent, ConnectionStatusEvent } from '../types';
import { trackSession, handleSessionStart, handleSessionStop, updateSessionActivity } from './sessions';
import { handleThinking } from './thinking';
import { handleToolStart, handleToolEnd } from './tools';
import { handleAgentStart, handleAgentStop } from './agents';
import { handlePlanList, handlePlanUpdate, handlePlanDelete } from './plans.js';
import { handleHookExecution } from './hooks.js';

/**
 * Main event dispatcher that routes incoming WebSocket events to appropriate handlers.
 * Uses StrictMonitorEvent for type-safe dispatch - TypeScript narrows the type in each case.
 */
export function handleEvent(event: StrictMonitorEvent): void {
  state.eventCount++;
  elements.eventCount.textContent = `Events: ${state.eventCount}`;

  console.log(`[Dashboard] Event received:`, {
    type: event.type,
    sessionId: event.sessionId,
    agentId: event.agentId,
    timestamp: event.timestamp,
  });

  if (event.sessionId) {
    trackSession(event.sessionId, event.timestamp);
  }

  switch (event.type) {
    case 'connection_status':
      handleConnectionStatus(event);
      break;
    case 'thinking':
      handleThinking(event);
      // Update activity for thinking events
      if (event.sessionId) {
        updateSessionActivity(event.sessionId);
      }
      break;
    case 'tool_start':
      handleToolStart(event);
      // Update activity for tool events
      if (event.sessionId) {
        updateSessionActivity(event.sessionId);
      }
      break;
    case 'tool_end':
      handleToolEnd(event);
      // Update activity for tool events
      if (event.sessionId) {
        updateSessionActivity(event.sessionId);
      }
      break;
    case 'agent_start':
      handleAgentStart(event);
      break;
    case 'agent_stop':
      handleAgentStop(event);
      break;
    case 'session_start':
      handleSessionStart(event);
      break;
    case 'session_stop':
      handleSessionStop(event);
      break;
    case 'plan_update':
      handlePlanUpdate(event);
      break;
    case 'plan_delete':
      handlePlanDelete(event);
      break;
    case 'plan_list':
      handlePlanList(event);
      break;
    case 'hook_execution':
      handleHookExecution(event);
      // Update activity for hook events
      if (event.sessionId) {
        updateSessionActivity(event.sessionId);
      }
      break;
    default:
      console.log('[Dashboard] Unhandled event type:', event.type);
  }
}

/**
 * Handle connection_status events from the server
 */
export function handleConnectionStatus(event: ConnectionStatusEvent): void {
  const version = event.serverVersion || 'unknown';
  elements.serverInfo.textContent = `Server: v${version}`;
}
