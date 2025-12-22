/**
 * TypeScript types for Claude Code hook inputs.
 *
 * These types define the structure of JSON payloads sent to hooks
 * by Claude Code. They are used for validation and type-safe processing
 * of hook events before converting to MonitorEvent types.
 */

/**
 * Supported hook types from Claude Code.
 */
export type HookType =
  | 'PreToolUse'
  | 'PostToolUse'
  | 'SubagentStart'
  | 'SubagentStop'
  | 'SessionStart'
  | 'SessionStop';

/**
 * Base interface for all hook inputs.
 * These fields are common to most hook payloads.
 */
export interface HookInputBase {
  /** Claude Code session ID */
  session_id?: string;
  /** Agent ID (main session or subagent) */
  agent_id?: string;
  /** Current working directory */
  cwd?: string;
}

/**
 * PreToolUse hook input - fires before a tool is executed.
 */
export interface PreToolUseInput extends HookInputBase {
  /** Name of the tool being invoked */
  tool_name: string;
  /** Tool input parameters */
  tool_input?: Record<string, unknown>;
  /** Unique ID for this tool call */
  tool_call_id?: string;
}

/**
 * PostToolUse hook input - fires after a tool completes.
 */
export interface PostToolUseInput extends HookInputBase {
  /** Name of the tool that was invoked */
  tool_name: string;
  /** Tool input parameters */
  tool_input?: Record<string, unknown>;
  /** Tool output/result */
  tool_output?: unknown;
  /** Alternative field for result */
  result?: unknown;
  /** Unique ID for this tool call */
  tool_call_id?: string;
  /** Duration in milliseconds */
  duration_ms?: number;
}

/**
 * SubagentStart hook input - fires when a subagent spawns.
 */
export interface SubagentStartInput extends HookInputBase {
  /** Subagent unique ID */
  subagent_id?: string;
  /** Alternative field for agent ID */
  agent_id?: string;
  /** Agent name/type */
  agent_name?: string;
  /** Alternative field for name */
  name?: string;
  /** Parent agent ID */
  parent_agent_id?: string;
}

/**
 * SubagentStop hook input - fires when a subagent completes.
 */
export interface SubagentStopInput extends HookInputBase {
  /** Subagent unique ID */
  subagent_id?: string;
  /** Alternative field for agent ID */
  agent_id?: string;
  /** Exit status */
  status?: 'success' | 'failure' | 'cancelled' | string;
}

/**
 * SessionStart hook input - fires when a session starts.
 */
export interface SessionStartInput extends HookInputBase {
  /** Session ID */
  session_id: string;
}

/**
 * SessionStop hook input - fires when a session ends.
 */
export interface SessionStopInput extends HookInputBase {
  /** Session ID */
  session_id: string;
}

/**
 * Union type for all hook inputs.
 */
export type HookInput =
  | PreToolUseInput
  | PostToolUseInput
  | SubagentStartInput
  | SubagentStopInput
  | SessionStartInput
  | SessionStopInput;

/**
 * Validation result structure.
 */
export interface ValidationResult {
  /** Whether the input is valid */
  valid: boolean;
  /** Error message if invalid */
  error?: string;
  /** The validated and normalized input */
  data?: HookInput;
}

/**
 * Validate that an object is a valid hook input.
 * Performs minimal validation to ensure required fields exist.
 *
 * @param hookType - The type of hook
 * @param input - The input object to validate
 * @returns Validation result with error or normalized data
 */
export function validateHookInput(
  hookType: HookType,
  input: unknown
): ValidationResult {
  if (typeof input !== 'object' || input === null) {
    return { valid: false, error: 'Input must be a non-null object' };
  }

  const data = input as Record<string, unknown>;

  switch (hookType) {
    case 'PreToolUse':
    case 'PostToolUse':
      if (typeof data.tool_name !== 'string' || !data.tool_name) {
        return { valid: false, error: 'tool_name is required and must be a string' };
      }
      break;

    case 'SubagentStart':
      // Subagent ID can come from multiple fields
      if (!data.subagent_id && !data.agent_id) {
        return { valid: false, error: 'subagent_id or agent_id is required' };
      }
      break;

    case 'SubagentStop':
      // Similar to SubagentStart
      if (!data.subagent_id && !data.agent_id) {
        return { valid: false, error: 'subagent_id or agent_id is required' };
      }
      break;

    case 'SessionStart':
    case 'SessionStop':
      if (typeof data.session_id !== 'string' || !data.session_id) {
        return { valid: false, error: 'session_id is required and must be a string' };
      }
      break;

    default:
      return { valid: false, error: `Unknown hook type: ${hookType}` };
  }

  return { valid: true, data: data as HookInput };
}

/**
 * Check if a string is a valid hook type.
 */
export function isValidHookType(value: string): value is HookType {
  const validTypes: HookType[] = [
    'PreToolUse',
    'PostToolUse',
    'SubagentStart',
    'SubagentStop',
    'SessionStart',
    'SessionStop',
  ];
  return validTypes.includes(value as HookType);
}

/**
 * Safely stringify an object for logging/transmission.
 * Truncates large values to prevent memory issues.
 *
 * @param obj - Object to stringify
 * @param maxLength - Maximum length of the resulting string
 * @returns Truncated JSON string
 */
export function safeStringify(obj: unknown, maxLength = 10240): string {
  try {
    const json = JSON.stringify(obj);
    if (json.length > maxLength) {
      return json.slice(0, maxLength) + '... [truncated]';
    }
    return json;
  } catch {
    return '[unstringifiable object]';
  }
}
