/**
 * Thinking Monitor Dashboard - Type Definitions
 *
 * Shared TypeScript types and interfaces for the dashboard client.
 * These types are used across multiple modules for type-safe communication
 * with the WebSocket server and internal state management.
 */

// Re-export shared types for use in dashboard modules
export type {
  MonitorEventType,
  MonitorEvent,
  MonitorEventBase,
  WebSocketMessage,
  StrictMonitorEvent,
  ToolStartEvent,
  ToolEndEvent,
  ThinkingEvent,
  AgentStartEvent,
  AgentStopEvent,
  SessionStartEvent,
  SessionStopEvent,
  PlanUpdateEvent,
  PlanDeleteEvent,
  PlanListEvent,
  ConnectionStatusEvent,
  HookExecutionEvent,
  HookType,
  HookDecision,
} from '../shared/types.js';

// ============================================
// Theme Types
// ============================================

/**
 * Theme identifier for the dashboard.
 * 'system' follows OS dark/light preference.
 */
export type ThemeId = 'dark' | 'light' | 'solarized' | 'solarized-dark' | 'system';

// ============================================
// Application State
// ============================================

/**
 * Top-level application state containing all dashboard data
 */
export interface AppState {
  connected: boolean;
  autoScroll: boolean;
  userScrolledUp: boolean;
  eventCount: number;
  thinkingCount: number;
  toolsCount: number;
  hooksCount: number;
  agentsCount: number;
  agents: Map<string, AgentInfo>;
  pendingTools: Map<string, ToolInfo>;
  thinkingFilter: string;
  toolsFilter: string;
  reconnectAttempt: number;
  reconnectCountdown: number;
  keyboardMode: boolean;
  // Theme preference
  theme: ThemeId;
  // Session tracking for multi-session support
  sessions: Map<string, SessionInfo>;
  currentSessionId: string | null;
  // Session filtering - 'all' or a specific session ID
  selectedSession: string;
  // Plan tracking for multi-plan support
  plans: Map<string, PlanInfo>;
  currentPlanPath: string | null;
  // Plan list from server (metadata only, no content)
  planList: PlanListItem[];
  // Plan selector dropdown open state
  planSelectorOpen: boolean;
  // Context menu state
  contextMenuFilePath: string | null;
  // Active view tab for navigation
  activeView: 'all' | 'thinking' | 'tools' | 'todo' | 'plan';
  // Todo tracking - maps session ID to todos for that session
  sessionTodos: SessionTodosMap;
  // Session-plan associations - maps session ID to the plan path that session uses
  sessionPlanMap: Map<string, string>;
  // Current session's todos (derived from sessionTodos based on currentSessionId)
  todos: TodoItem[];
  // Panel collapse states - maps panel name to collapsed boolean
  panelCollapseState: Record<string, boolean>;
  // Panel visibility states - which panels are shown/hidden
  panelVisibility: PanelVisibility;
}

// ============================================
// Panel Visibility Types
// ============================================

/**
 * Panel visibility configuration.
 * Controls which panels are shown in the dashboard.
 */
export interface PanelVisibility {
  thinking: boolean;
  todo: boolean;
  tools: boolean;
  hooks: boolean;
  plan: boolean;
}

// ============================================
// Plan Types
// ============================================

/**
 * Plan information with full content and metadata
 */
export interface PlanInfo {
  path: string;
  filename: string;
  content: string;
  lastModified: number; // Timestamp from when we received the update
  sessionId?: string;
  agentId?: string; // The agent that was active when this plan was modified
}

/**
 * Plan metadata from the server's plan list (no content)
 */
export interface PlanListItem {
  path: string;
  filename: string;
  lastModified: number;
}

/**
 * Stored plan association with timestamp for cleanup
 */
export interface StoredPlanAssociation {
  planPath: string;
  timestamp: number; // Date.now() when association was created
}

// ============================================
// Session Types
// ============================================

/**
 * Session information tracking across the lifetime of a session
 */
export interface SessionInfo {
  id: string;
  workingDirectory?: string;
  startTime: string;
  endTime?: string;
  active: boolean;
  color: string; // For visual distinction
  lastActivityTime?: number; // Timestamp of last activity (for pulsing)
}

// ============================================
// Agent Types
// ============================================

/**
 * Agent information and status
 */
export interface AgentInfo {
  id: string;
  name?: string;
  parentId?: string;
  sessionId?: string;
  active: boolean;
  status?: 'running' | 'success' | 'failure' | 'cancelled';
  startTime: string;
  endTime?: string;
}

/**
 * Stack of active agent IDs, ordered by start time (most recent last).
 * Used to determine which agent context applies to tool calls that
 * don't have an explicit agentId.
 *
 * When a subagent starts, its ID is pushed onto the stack.
 * When a subagent stops, its ID is removed from the stack.
 * The top of the stack represents the currently active agent.
 */
export type AgentContextStack = string[];

// ============================================
// Tool Types
// ============================================

/**
 * Tool call information and execution status
 */
export interface ToolInfo {
  id: string;
  name: string;
  input?: string;
  startTime: string;
  element?: HTMLElement;
}

// ============================================
// Todo Types
// ============================================

/**
 * Individual todo item with status tracking
 */
export interface TodoItem {
  content: string;
  status: 'pending' | 'in_progress' | 'completed';
  activeForm: string;
}

/**
 * Map of session ID to todo items for that session
 */
export type SessionTodosMap = Map<string, TodoItem[]>;
