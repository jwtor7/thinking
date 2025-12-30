import { state } from '../state';
import { elements } from '../ui/elements';
import { MonitorEvent } from '../types';
import { trackSession, handleSessionStart, handleSessionStop } from './sessions';
import { handleThinking } from './thinking';
import { handleToolStart, handleToolEnd } from './tools';
import { handleAgentStart, handleAgentStop } from './agents';
import { handlePlanList, handlePlanUpdate, handlePlanDelete } from './plans';

/**
 * Main event dispatcher that routes incoming WebSocket events to appropriate handlers
 */
export function handleEvent(event: MonitorEvent): void {
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
      break;
    case 'tool_start':
      handleToolStart(event);
      break;
    case 'tool_end':
      handleToolEnd(event);
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
    default:
      console.log('[Dashboard] Unhandled event type:', event.type);
  }
}

/**
 * Handle connection_status events from the server
 */
export function handleConnectionStatus(event: MonitorEvent): void {
  const version = (event.serverVersion as string) || 'unknown';
  elements.serverInfo.textContent = `Server: v${version}`;
}
