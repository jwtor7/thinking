/**
 * Global State Management
 *
 * Centralized state for the Thinking Monitor dashboard.
 */

import { AppState, AgentContextStack } from './types';

/**
 * Global application state.
 * Shared across all modules.
 */
export const state: AppState = {
  connected: false,
  autoScroll: true,
  userScrolledUp: false,
  eventCount: 0,
  thinkingCount: 0,
  toolsCount: 0,
  agentsCount: 0,
  agents: new Map(),
  pendingTools: new Map(),
  thinkingFilter: '',
  toolsFilter: '',
  reconnectAttempt: 0,
  reconnectCountdown: 0,
  keyboardMode: false,
  theme: 'system',
  sessions: new Map(),
  currentSessionId: null,
  selectedSession: 'all',
  plans: new Map(),
  currentPlanPath: null,
  planList: [],
  planSelectorOpen: false,
  contextMenuFilePath: null,
  activeView: 'all',
  sessionTodos: new Map(),
  sessionPlanMap: new Map(),
  todos: [],
  panelCollapseState: {
    thinking: false,
    todo: false,
    tools: false,
    plan: false,
  },
};

/**
 * Stack of currently active agent IDs.
 * The last element is the most deeply nested active agent.
 * 'main' represents the main conversation (no subagent).
 *
 * Memory leak prevention:
 * - Maximum stack size is enforced (MAX_AGENT_STACK_SIZE)
 * - Stale entries (older than AGENT_STACK_STALE_MS) are periodically cleaned up
 * - This handles cases where agent_stop events are missed due to connection drops
 */
export const agentContextStack: AgentContextStack = ['main'];

/**
 * Timestamps for when each agent was added to the context stack.
 * Used to identify and clean up stale entries that may have missed agent_stop events.
 * Key: agentId, Value: timestamp (ms since epoch)
 */
export const agentContextTimestamps: Map<string, number> = new Map();
