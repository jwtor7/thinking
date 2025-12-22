/**
 * Types for the Thinking Monitor server and dashboard.
 *
 * These types define the event structure for communication between
 * Claude Code hooks, the monitor server, and the web dashboard.
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
  // Connection status (internal)
  | 'connection_status';

/**
 * Base interface for all monitor events.
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
}

/**
 * Tool start event - sent when a tool invocation begins.
 */
export interface ToolStartEvent extends MonitorEventBase {
  type: 'tool_start';
  /** Name of the tool being invoked */
  toolName: string;
  /** Tool input (truncated to MAX_PAYLOAD_SIZE) */
  input?: string;
  /** Unique ID for correlating with tool_end */
  toolCallId?: string;
}

/**
 * Tool end event - sent when a tool invocation completes.
 */
export interface ToolEndEvent extends MonitorEventBase {
  type: 'tool_end';
  /** Name of the tool that was invoked */
  toolName: string;
  /** Tool output (truncated to MAX_PAYLOAD_SIZE) */
  output?: string;
  /** Unique ID for correlating with tool_start */
  toolCallId?: string;
  /** Duration in milliseconds (if available) */
  durationMs?: number;
}

/**
 * Agent start event - sent when a subagent is spawned.
 */
export interface AgentStartEvent extends MonitorEventBase {
  type: 'agent_start';
  /** Unique identifier for this agent instance */
  agentId: string;
  /** Human-readable agent name (e.g., "explore", "plan") */
  agentName?: string;
  /** Parent agent ID (undefined for main session) */
  parentAgentId?: string;
}

/**
 * Agent stop event - sent when a subagent completes.
 */
export interface AgentStopEvent extends MonitorEventBase {
  type: 'agent_stop';
  /** Unique identifier for this agent instance */
  agentId: string;
  /** Exit status (success, failure, cancelled) */
  status?: 'success' | 'failure' | 'cancelled';
}

/**
 * Thinking event - extracted from transcript JSONL.
 */
export interface ThinkingEvent extends MonitorEventBase {
  type: 'thinking';
  /** The thinking/reasoning content */
  content: string;
  /** Agent ID that produced this thinking */
  agentId?: string;
}

/**
 * Plan update event - sent when a plan file is created or modified.
 */
export interface PlanUpdateEvent extends MonitorEventBase {
  type: 'plan_update';
  /** Path to the plan file */
  path: string;
  /** Plan filename */
  filename: string;
  /** Plan content (markdown) */
  content?: string;
  /** File modification time in milliseconds since epoch */
  lastModified?: number;
}

/**
 * Plan delete event - sent when a plan file is removed.
 */
export interface PlanDeleteEvent extends MonitorEventBase {
  type: 'plan_delete';
  /** Path to the deleted plan file */
  path: string;
  /** Plan filename */
  filename: string;
}

/**
 * Session start event.
 */
export interface SessionStartEvent extends MonitorEventBase {
  type: 'session_start';
  /** Session ID */
  sessionId: string;
  /** Working directory for the session */
  workingDirectory?: string;
}

/**
 * Session stop event.
 */
export interface SessionStopEvent extends MonitorEventBase {
  type: 'session_stop';
  /** Session ID */
  sessionId: string;
}

/**
 * Connection status event - sent to clients on connect.
 */
export interface ConnectionStatusEvent extends MonitorEventBase {
  type: 'connection_status';
  /** Connection status */
  status: 'connected' | 'disconnected';
  /** Server version */
  serverVersion: string;
  /** Number of connected clients */
  clientCount: number;
}

/**
 * Union type for all monitor events.
 */
export type MonitorEvent =
  | ToolStartEvent
  | ToolEndEvent
  | AgentStartEvent
  | AgentStopEvent
  | ThinkingEvent
  | PlanUpdateEvent
  | PlanDeleteEvent
  | SessionStartEvent
  | SessionStopEvent
  | ConnectionStatusEvent;

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

/**
 * Configuration constants.
 */
export const CONFIG = {
  /** WebSocket and HTTP event receiver port */
  WS_PORT: 3355,
  /** Static file server port */
  STATIC_PORT: 3356,
  /** Host to bind to (localhost only for security) */
  HOST: '127.0.0.1',
  /** Maximum payload size in bytes */
  MAX_PAYLOAD_SIZE: 10 * 1024, // 10KB
  /** Server version */
  VERSION: '0.1.0',
} as const;

/**
 * Type guard to check if an object is a valid MonitorEvent.
 */
export function isMonitorEvent(obj: unknown): obj is MonitorEvent {
  if (typeof obj !== 'object' || obj === null) {
    return false;
  }

  const event = obj as Record<string, unknown>;

  // Must have type and timestamp
  if (typeof event.type !== 'string' || typeof event.timestamp !== 'string') {
    return false;
  }

  // Validate type is a known event type
  const validTypes: MonitorEventType[] = [
    'tool_start',
    'tool_end',
    'agent_start',
    'agent_stop',
    'session_start',
    'session_stop',
    'thinking',
    'plan_update',
    'plan_delete',
    'connection_status',
  ];

  return validTypes.includes(event.type as MonitorEventType);
}

/**
 * Truncate a string to the maximum payload size.
 */
export function truncatePayload(content: string | undefined): string | undefined {
  if (!content) {
    return content;
  }

  if (content.length > CONFIG.MAX_PAYLOAD_SIZE) {
    return content.slice(0, CONFIG.MAX_PAYLOAD_SIZE) + '\n... [truncated]';
  }

  return content;
}
