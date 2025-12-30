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
  // Connection status (internal)
  | 'connection_status';

/**
 * Base monitor event interface.
 *
 * This interface defines the common fields for all monitor events.
 * The index signature allows for event-specific fields while maintaining
 * type safety for the core properties.
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
 * Message envelope for WebSocket communication.
 * Wraps events with optional metadata.
 */
export interface WebSocketMessage {
  /** The event payload */
  event: MonitorEvent;
  /** Message sequence number (for ordering) */
  seq?: number;
}
