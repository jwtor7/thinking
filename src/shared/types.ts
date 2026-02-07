/**
 * Shared types for Thinking Monitor.
 *
 * These types are used by both the server and dashboard to ensure
 * type consistency and prevent drift between the two codebases.
 */

/**
 * Event types that can be sent from Claude Code hooks or internal watchers.
 */
export type MonitorEventType =
  // Tool lifecycle events (from PreToolUse/PostToolUse hooks)
  | 'tool_start'
  | 'tool_end'
  // Agent lifecycle events (from SubagentStart/SubagentStop hooks)
  | 'agent_start'
  | 'agent_stop'
  // Session lifecycle events
  | 'session_start'
  | 'session_stop'
  // Thinking content (from transcript watcher)
  | 'thinking'
  // Plan file events (from plan watcher)
  | 'plan_update'
  | 'plan_delete'
  | 'plan_list'
  // Hook execution events (from PreToolUse/PostToolUse/Stop/UserPromptSubmit hooks)
  | 'hook_execution'
  // Subagent mapping events (for parent-child relationship tracking)
  | 'subagent_mapping'
  // Team/task events (from team/task file watchers and hooks)
  | 'team_update'
  | 'task_update'
  | 'message_sent'
  | 'teammate_idle'
  | 'task_completed'
  // Connection status (internal)
  | 'connection_status';

/**
 * Base monitor event interface (loose).
 *
 * This interface defines the common fields for all monitor events.
 * The index signature allows for event-specific fields from external hooks.
 * Use StrictMonitorEvent for type-safe handling in dashboard handlers.
 */
export interface MonitorEvent {
  /** Event type identifier */
  type: MonitorEventType;
  /** ISO 8601 timestamp of when the event occurred */
  timestamp: string;
  /** Optional session ID for multi-session support */
  sessionId?: string;
  /** Agent ID (main session or subagent ID) */
  agentId?: string;
  /** Allow additional event-specific properties */
  [key: string]: unknown;
}

/**
 * Base interface for strict event types.
 * Includes index signature for compatibility with MonitorEvent.
 */
export interface MonitorEventBase {
  /** Event type identifier */
  type: MonitorEventType;
  /** ISO 8601 timestamp of when the event occurred */
  timestamp: string;
  /** Optional session ID for multi-session support */
  sessionId?: string;
  /** Agent ID (main session or subagent ID) */
  agentId?: string;
  /** Allow additional event-specific properties (for MonitorEvent compatibility) */
  [key: string]: unknown;
}

// ============================================================================
// Specific Event Interfaces (for type-safe handling)
// ============================================================================

/** Tool start event - emitted when a tool begins execution */
export interface ToolStartEvent extends MonitorEventBase {
  type: 'tool_start';
  /** Name of the tool being executed */
  toolName: string;
  /** Unique identifier for this tool call */
  toolCallId?: string;
  /** Tool input (truncated, secrets redacted) */
  input?: string;
}

/** Tool end event - emitted when a tool completes execution */
export interface ToolEndEvent extends MonitorEventBase {
  type: 'tool_end';
  /** Name of the tool that completed */
  toolName: string;
  /** Unique identifier for this tool call */
  toolCallId?: string;
  /** Tool output (truncated, secrets redacted) */
  output?: string;
  /** Duration in milliseconds */
  durationMs?: number;
}

/** Thinking event - extracted from Claude's thinking blocks */
export interface ThinkingEvent extends MonitorEventBase {
  type: 'thinking';
  /** Thinking content (truncated, secrets redacted) */
  content: string;
}

/** Agent start event - emitted when a subagent is spawned */
export interface AgentStartEvent extends MonitorEventBase {
  type: 'agent_start';
  /** Unique identifier for this agent */
  agentId: string;
  /** Human-readable agent name */
  agentName?: string;
  /** Parent agent ID if nested */
  parentAgentId?: string;
}

/** Agent stop event - emitted when a subagent completes */
export interface AgentStopEvent extends MonitorEventBase {
  type: 'agent_stop';
  /** Unique identifier for this agent */
  agentId: string;
  /** Exit status */
  status?: 'success' | 'failure' | 'cancelled';
}

/** Session start event - emitted when a Claude Code session begins */
export interface SessionStartEvent extends MonitorEventBase {
  type: 'session_start';
  /** Unique session identifier */
  sessionId: string;
  /** Working directory for the session */
  workingDirectory?: string;
}

/** Session stop event - emitted when a Claude Code session ends */
export interface SessionStopEvent extends MonitorEventBase {
  type: 'session_stop';
  /** Unique session identifier */
  sessionId: string;
}

/** Plan update event - emitted when a plan file is created or modified */
export interface PlanUpdateEvent extends MonitorEventBase {
  type: 'plan_update';
  /** Full path to the plan file */
  path: string;
  /** Filename of the plan */
  filename: string;
  /** Plan content (markdown, truncated, secrets redacted) */
  content?: string;
  /** Last modification timestamp (ms since epoch) */
  lastModified?: number;
}

/** Plan delete event - emitted when a plan file is removed */
export interface PlanDeleteEvent extends MonitorEventBase {
  type: 'plan_delete';
  /** Full path to the deleted plan file */
  path: string;
  /** Filename of the deleted plan */
  filename: string;
}

/** Plan list event - sent on connection with all available plans */
export interface PlanListEvent extends MonitorEventBase {
  type: 'plan_list';
  /** Array of plan metadata */
  plans: Array<{
    path: string;
    filename: string;
    lastModified: number;
  }>;
}

/** Connection status event - internal server status */
export interface ConnectionStatusEvent extends MonitorEventBase {
  type: 'connection_status';
  /** Connection state */
  status: 'connected' | 'disconnected';
  /** Server version string */
  serverVersion: string;
  /** Number of connected clients */
  clientCount: number;
}

/** Subagent mapping info for client consumption */
export interface SubagentMappingInfo {
  /** Unique subagent identifier */
  agentId: string;
  /** Session ID of the parent session that spawned this subagent */
  parentSessionId: string;
  /** Human-readable agent name */
  agentName: string;
  /** ISO 8601 timestamp when the subagent started */
  startTime: string;
  /** Current status of the subagent */
  status: 'running' | 'success' | 'failure' | 'cancelled';
  /** ISO 8601 timestamp when the subagent stopped (if stopped) */
  endTime?: string;
  /** Parent agent ID for nested agent hierarchies */
  parentAgentId?: string;
}

/** Subagent mapping event - sent on connect and when mappings change */
export interface SubagentMappingEvent extends MonitorEventBase {
  type: 'subagent_mapping';
  /** All current subagent mappings */
  mappings: SubagentMappingInfo[];
}

// ============================================================================
// Team/Task Event Interfaces
// ============================================================================

/** Team member info (from team config JSON) */
export interface TeamMemberInfo {
  name: string;
  agentId: string;
  agentType: string;
  status?: 'active' | 'idle' | 'shutdown';
}

/** Team state changed (members joined/left, status changed) */
export interface TeamUpdateEvent extends MonitorEventBase {
  type: 'team_update';
  teamName: string;
  members: TeamMemberInfo[];
}

/** Task info (from task JSON files) */
export interface TaskInfo {
  id: string;
  subject: string;
  description?: string;
  activeForm?: string;
  status: 'pending' | 'in_progress' | 'completed';
  owner?: string;
  blocks: string[];
  blockedBy: string[];
}

/** Task state changed (created, assigned, completed) */
export interface TaskUpdateEvent extends MonitorEventBase {
  type: 'task_update';
  teamId: string;
  tasks: TaskInfo[];
}

/** Inter-agent message sent (detected from SendMessage tool calls) */
export interface MessageSentEvent extends MonitorEventBase {
  type: 'message_sent';
  sender: string;
  recipient: string;
  messageType: 'message' | 'broadcast' | 'shutdown_request' | 'shutdown_response';
  summary?: string;
  content?: string;
}

/** Teammate went idle */
export interface TeammateIdleEvent extends MonitorEventBase {
  type: 'teammate_idle';
  teammateName: string;
  teamName?: string;
}

/** Task completed notification */
export interface TaskCompletedEvent extends MonitorEventBase {
  type: 'task_completed';
  taskId: string;
  taskSubject: string;
  teamId?: string;
}

/** Hook type identifiers */
export type HookType =
  | 'PreToolUse'
  | 'PostToolUse'
  | 'SubagentStart'
  | 'SubagentStop'
  | 'SessionStart'
  | 'SessionStop'
  | 'Stop'
  | 'UserPromptSubmit'
  | 'TeammateIdle'
  | 'TaskCompleted';

/** Hook decision identifiers */
export type HookDecision = 'allow' | 'deny' | 'ask';

/** Hook execution event - emitted when a hook runs */
export interface HookExecutionEvent extends MonitorEventBase {
  type: 'hook_execution';
  /** Type of hook that executed */
  hookType: HookType;
  /** Name of the tool (for PreToolUse/PostToolUse hooks) */
  toolName?: string;
  /** Tool call ID for correlating PreToolUse/PostToolUse pairs */
  toolCallId?: string;
  /** Decision made by the hook (for PreToolUse hooks) */
  decision?: HookDecision;
  /** Name of the hook that ran */
  hookName: string;
  /** Output from the hook execution */
  output?: string;
  /** Whether the hook runs asynchronously */
  async?: boolean;
  /** Execution type of the hook */
  hookExecType?: 'command' | 'agent' | 'prompt';
}

// ============================================================================
// Discriminated Union Type
// ============================================================================

/**
 * Strict monitor event union for type-safe handling.
 *
 * Use this type in dashboard handlers to get proper type narrowing
 * when switching on event.type.
 */
export type StrictMonitorEvent =
  | ToolStartEvent
  | ToolEndEvent
  | ThinkingEvent
  | AgentStartEvent
  | AgentStopEvent
  | SessionStartEvent
  | SessionStopEvent
  | PlanUpdateEvent
  | PlanDeleteEvent
  | PlanListEvent
  | ConnectionStatusEvent
  | SubagentMappingEvent
  | HookExecutionEvent
  | TeamUpdateEvent
  | TaskUpdateEvent
  | MessageSentEvent
  | TeammateIdleEvent
  | TaskCompletedEvent;

/**
 * Message envelope for WebSocket communication.
 * Wraps events with optional metadata.
 */
export interface WebSocketMessage {
  /** The event payload */
  event: MonitorEvent;
  /** Message sequence number (for ordering) */
  seq?: number;
}
