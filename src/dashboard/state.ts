/**
 * Global State Management
 *
 * Centralized state for the Thinking Monitor dashboard.
 */

import { AppState, AgentContextStack, SubagentMappingInfo, TeamMemberInfo, TaskInfo, MessageSentEvent } from './types.ts';

/**
 * Subagent tracking state.
 * Separate from AppState to avoid modifying the interface.
 */
export interface SubagentState {
  /** agentId -> SubagentMappingInfo */
  subagents: Map<string, SubagentMappingInfo>;
  /** parentSessionId -> Set<agentId> */
  sessionSubagents: Map<string, Set<string>>;
  /** agentId -> Set<childAgentId> for nested agent hierarchies */
  agentChildren: Map<string, Set<string>>;
}

/**
 * Global subagent state.
 * Tracks parent-child relationships between sessions and subagents.
 */
export const subagentState: SubagentState = {
  subagents: new Map(),
  sessionSubagents: new Map(),
  agentChildren: new Map(),
};

/**
 * Team/task tracking state.
 * Separate from AppState for team dashboard panels.
 */
export interface TeamState {
  /** teamName -> team members */
  teams: Map<string, TeamMemberInfo[]>;
  /** teamId -> tasks */
  teamTasks: Map<string, TaskInfo[]>;
  /** Chronological message log */
  teamMessages: MessageSentEvent[];
  /** teamName -> sessionId mapping for session scoping */
  teamSessionMap: Map<string, string>;
}

/**
 * Global team state.
 */
export const teamState: TeamState = {
  teams: new Map(),
  teamTasks: new Map(),
  teamMessages: [],
  teamSessionMap: new Map(),
};

/**
 * Activity tracking for pulse indicator.
 * Ring buffer of event timestamps from the last 60 seconds.
 */
export const activityTracker = {
  timestamps: [] as number[],
  eventsPerSec: 0,
};

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
  hooksCount: 0,
  agentsCount: 0,
  agents: new Map(),
  pendingTools: new Map(),
  thinkingFilter: '',
  toolsFilter: '',
  timelineFilter: '',
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
  activeView: 'thinking',
  selectedAgentId: null,
  sessionPlanMap: new Map(),
  panelCollapseState: {
    thinking: false,
    tools: false,
    hooks: false,
    plan: false,
    team: false,
    tasks: false,
    timeline: false,
    agents: false,
  },
  panelVisibility: {
    thinking: true,
    tools: true,
    hooks: true,
    plan: true,
    team: true,
    tasks: true,
    timeline: true,
    agents: true,
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
