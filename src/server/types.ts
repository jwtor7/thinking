/**
 * Types for the Thinking Monitor server and dashboard.
 *
 * These types define the event structure for communication between
 * Claude Code hooks, the monitor server, and the web dashboard.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Re-export all shared types
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
  TeamMemberInfo,
  TeamUpdateEvent,
  TaskInfo,
  TaskUpdateEvent,
  MessageSentEvent,
  TeammateIdleEvent,
  TaskCompletedEvent,
} from '../shared/types.js';

// Import for local use
import type { MonitorEventType, MonitorEvent, StrictMonitorEvent } from '../shared/types.js';

/**
 * Server-side union type alias (for backward compatibility).
 * Use StrictMonitorEvent from shared/types.ts for new code.
 */
export type ServerMonitorEvent = StrictMonitorEvent;

/**
 * Client request types for bidirectional communication.
 */
export type ClientRequestType = 'plan_request';

/**
 * Request from client to fetch a specific plan's content.
 */
export interface PlanRequestMessage {
  type: 'plan_request';
  /** Path to the plan file to fetch */
  path: string;
}

/**
 * Union type for all client request messages.
 */
export type ClientRequest = PlanRequestMessage;

/**
 * Type guard to check if an object is a valid ClientRequest.
 */
export function isClientRequest(obj: unknown): obj is ClientRequest {
  if (typeof obj !== 'object' || obj === null) {
    return false;
  }

  const request = obj as Record<string, unknown>;

  if (request.type === 'plan_request') {
    return typeof request.path === 'string';
  }

  return false;
}

/**
 * Package version injected at build time by esbuild.
 * For development with --experimental-strip-types, falls back to reading package.json.
 */
declare const __PACKAGE_VERSION__: string | undefined;

/**
 * Get the package version, with fallback for development mode.
 */
function getVersion(): string {
  // Build-time injected version (production builds)
  if (typeof __PACKAGE_VERSION__ !== 'undefined') {
    return __PACKAGE_VERSION__;
  }

  // Development fallback: read from package.json synchronously
  // This path works when running from project root with --experimental-strip-types
  try {
    const packagePath = join(process.cwd(), 'package.json');
    const pkg = JSON.parse(readFileSync(packagePath, 'utf-8'));
    if (pkg.name === 'thinking-monitor' && pkg.version) {
      return pkg.version;
    }
    return '0.0.0-dev';
  } catch {
    return '0.0.0-dev';
  }
}

/**
 * Parse and validate the transcript poll interval from environment variable.
 * Returns the validated interval in milliseconds, clamped to [100, 10000].
 */
function getTranscriptPollInterval(): number {
  const MIN_INTERVAL_MS = 100;
  const MAX_INTERVAL_MS = 10000;
  const DEFAULT_INTERVAL_MS = 1000;

  const envValue = process.env.THINKING_POLL_INTERVAL;
  if (!envValue) {
    return DEFAULT_INTERVAL_MS;
  }

  const parsed = parseInt(envValue, 10);
  if (isNaN(parsed)) {
    console.warn(
      `[CONFIG] Invalid THINKING_POLL_INTERVAL value "${envValue}", using default ${DEFAULT_INTERVAL_MS}ms`
    );
    return DEFAULT_INTERVAL_MS;
  }

  if (parsed < MIN_INTERVAL_MS) {
    console.warn(
      `[CONFIG] THINKING_POLL_INTERVAL ${parsed}ms is below minimum ${MIN_INTERVAL_MS}ms, using ${MIN_INTERVAL_MS}ms`
    );
    return MIN_INTERVAL_MS;
  }

  if (parsed > MAX_INTERVAL_MS) {
    console.warn(
      `[CONFIG] THINKING_POLL_INTERVAL ${parsed}ms exceeds maximum ${MAX_INTERVAL_MS}ms, using ${MAX_INTERVAL_MS}ms`
    );
    return MAX_INTERVAL_MS;
  }

  return parsed;
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
  MAX_PAYLOAD_SIZE: 100 * 1024, // 100KB
  /** Server version - read from package.json */
  VERSION: getVersion(),
  /**
   * Transcript watcher polling interval in milliseconds.
   * Override with THINKING_POLL_INTERVAL env var.
   * Valid range: 100ms - 10000ms, default: 1000ms
   */
  TRANSCRIPT_POLL_INTERVAL_MS: getTranscriptPollInterval(),
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
    'plan_list',
    'hook_execution',
    'subagent_mapping',
    'team_update',
    'task_update',
    'message_sent',
    'teammate_idle',
    'task_completed',
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
