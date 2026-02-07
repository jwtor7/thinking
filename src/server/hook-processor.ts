/**
 * Hook Processor - Converts Claude Code hook inputs to MonitorEvents.
 *
 * This module provides the logic to transform raw hook inputs into
 * properly typed and validated MonitorEvent objects that can be
 * broadcast to connected dashboard clients.
 */

import type {
  MonitorEvent,
  ToolStartEvent,
  ToolEndEvent,
  AgentStartEvent,
  AgentStopEvent,
  SessionStartEvent,
  SessionStopEvent,
  TeammateIdleEvent,
  TaskCompletedEvent,
} from './types.ts';
import { truncatePayload } from './types.ts';
import { redactSecrets } from './secrets.ts';
import type {
  HookType,
  PreToolUseInput,
  PostToolUseInput,
  SubagentStartInput,
  SubagentStopInput,
  SessionStartInput,
  SessionStopInput,
  TeammateIdleInput,
  TaskCompletedInput,
} from './hook-types.ts';
import { validateHookInput, safeStringify } from './hook-types.ts';

/**
 * Result of processing a hook input.
 */
export interface ProcessingResult {
  /** Whether processing succeeded */
  success: boolean;
  /** The generated event (if successful) */
  event?: MonitorEvent;
  /** Error message (if failed) */
  error?: string;
}

/**
 * Process a PreToolUse hook input into a ToolStartEvent.
 */
function processPreToolUse(input: PreToolUseInput): ToolStartEvent {
  const inputStr = input.tool_input
    ? safeStringify(input.tool_input)
    : undefined;

  return {
    type: 'tool_start',
    timestamp: new Date().toISOString(),
    sessionId: input.session_id,
    agentId: input.agent_id,
    toolName: input.tool_name,
    input: inputStr ? redactSecrets(truncatePayload(inputStr) ?? '') : undefined,
    toolCallId: input.tool_call_id,
  };
}

/**
 * Process a PostToolUse hook input into a ToolEndEvent.
 */
function processPostToolUse(input: PostToolUseInput): ToolEndEvent {
  // Output can be in tool_output or result field
  const rawOutput = input.tool_output ?? input.result;
  const outputStr = rawOutput ? safeStringify(rawOutput) : undefined;

  return {
    type: 'tool_end',
    timestamp: new Date().toISOString(),
    sessionId: input.session_id,
    agentId: input.agent_id,
    toolName: input.tool_name,
    output: outputStr ? redactSecrets(truncatePayload(outputStr) ?? '') : undefined,
    toolCallId: input.tool_call_id,
    durationMs: input.duration_ms,
  };
}

/**
 * Process a SubagentStart hook input into an AgentStartEvent.
 */
function processSubagentStart(input: SubagentStartInput): AgentStartEvent {
  // Agent ID can come from multiple fields
  const agentId = input.subagent_id || input.agent_id || 'unknown';
  // Agent name can come from multiple fields
  const agentName = input.agent_name || input.name;

  return {
    type: 'agent_start',
    timestamp: new Date().toISOString(),
    sessionId: input.session_id,
    agentId,
    agentName,
    parentAgentId: input.parent_agent_id,
  };
}

/**
 * Process a SubagentStop hook input into an AgentStopEvent.
 */
function processSubagentStop(input: SubagentStopInput): AgentStopEvent {
  // Agent ID can come from multiple fields
  const agentId = input.subagent_id || input.agent_id || 'unknown';

  // Normalize status to expected values
  let status: 'success' | 'failure' | 'cancelled' | undefined;
  if (input.status) {
    if (input.status === 'success' || input.status === 'failure' || input.status === 'cancelled') {
      status = input.status;
    } else {
      // Map unknown status strings to failure
      status = 'failure';
    }
  }

  return {
    type: 'agent_stop',
    timestamp: new Date().toISOString(),
    sessionId: input.session_id,
    agentId,
    status,
  };
}

/**
 * Process a SessionStart hook input into a SessionStartEvent.
 */
function processSessionStart(input: SessionStartInput): SessionStartEvent {
  return {
    type: 'session_start',
    timestamp: new Date().toISOString(),
    sessionId: input.session_id,
    workingDirectory: input.cwd ? redactSecrets(input.cwd) : undefined,
  };
}

/**
 * Process a SessionStop hook input into a SessionStopEvent.
 */
function processSessionStop(input: SessionStopInput): SessionStopEvent {
  return {
    type: 'session_stop',
    timestamp: new Date().toISOString(),
    sessionId: input.session_id,
  };
}

/**
 * Process a TeammateIdle hook input into a TeammateIdleEvent.
 */
function processTeammateIdle(input: TeammateIdleInput): TeammateIdleEvent {
  return {
    type: 'teammate_idle',
    timestamp: new Date().toISOString(),
    sessionId: input.session_id,
    agentId: input.agent_id,
    teammateName: input.teammate_name || 'unknown',
    teamName: input.team_name,
  };
}

/**
 * Process a TaskCompleted hook input into a TaskCompletedEvent.
 */
function processTaskCompleted(input: TaskCompletedInput): TaskCompletedEvent {
  return {
    type: 'task_completed',
    timestamp: new Date().toISOString(),
    sessionId: input.session_id,
    agentId: input.agent_id,
    taskId: input.task_id || 'unknown',
    taskSubject: input.task_subject ? redactSecrets(input.task_subject) : 'unknown',
    teamId: input.team_id,
  };
}

/**
 * Process a raw hook input into a MonitorEvent.
 *
 * @param hookType - The type of hook that triggered
 * @param rawInput - The raw input from the hook (parsed JSON)
 * @returns Processing result with event or error
 *
 * @example
 * ```typescript
 * const result = processHookInput('PreToolUse', {
 *   tool_name: 'Read',
 *   tool_input: { file_path: '/path/to/file.ts' },
 *   session_id: 'session-123'
 * });
 *
 * if (result.success && result.event) {
 *   hub.broadcast(result.event);
 * }
 * ```
 */
export function processHookInput(
  hookType: HookType,
  rawInput: unknown
): ProcessingResult {
  // Validate the input structure
  const validation = validateHookInput(hookType, rawInput);
  if (!validation.valid || !validation.data) {
    return {
      success: false,
      error: validation.error ?? 'Validation failed',
    };
  }

  const input = validation.data;

  try {
    let event: MonitorEvent;

    switch (hookType) {
      case 'PreToolUse':
        event = processPreToolUse(input as PreToolUseInput);
        break;

      case 'PostToolUse':
        event = processPostToolUse(input as PostToolUseInput);
        break;

      case 'SubagentStart':
        event = processSubagentStart(input as SubagentStartInput);
        break;

      case 'SubagentStop':
        event = processSubagentStop(input as SubagentStopInput);
        break;

      case 'SessionStart':
        event = processSessionStart(input as SessionStartInput);
        break;

      case 'SessionStop':
        event = processSessionStop(input as SessionStopInput);
        break;

      case 'TeammateIdle':
        event = processTeammateIdle(input as TeammateIdleInput);
        break;

      case 'TaskCompleted':
        event = processTaskCompleted(input as TaskCompletedInput);
        break;

      default:
        return {
          success: false,
          error: `Unknown hook type: ${hookType}`,
        };
    }

    return { success: true, event };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown processing error',
    };
  }
}
