/**
 * Persistence types for Thinking Monitor session storage and summaries.
 *
 * These types define the structure for persisting session data,
 * generating summaries, and enabling session resume capabilities.
 */

// ============================================================================
// Session Persistence
// ============================================================================

/**
 * Status of a persisted session.
 */
export type SessionStatus = 'active' | 'completed' | 'interrupted';

/**
 * Persisted session state saved to disk.
 *
 * Contains all metadata needed to understand a session's history
 * and enable resumption via `claude --resume`.
 */
export interface PersistedSession {
  /** Unique identifier for this persisted session */
  id: string;
  /** Claude session ID for `claude --resume` */
  claudeSessionId: string;
  /** ISO 8601 timestamp when session started */
  startTime: string;
  /** ISO 8601 timestamp when session ended (if completed) */
  endTime?: string;
  /** Working directory for the session */
  workingDirectory?: string;
  /** Current session status */
  status: SessionStatus;
  /** Path to associated plan file (if any) */
  planPath?: string;
  /** Counts of captured events */
  eventCounts: SessionEventCounts;
  /** Generated summary (if available) */
  summary?: SessionSummary;
}

/**
 * Event counts for a session.
 */
export interface SessionEventCounts {
  /** Number of thinking blocks captured */
  thinking: number;
  /** Number of tool calls captured */
  toolCalls: number;
  /** Number of agent spawns captured */
  agents: number;
}

/**
 * AI-generated session summary.
 *
 * Created when a session ends or is captured manually.
 * Provides high-level understanding of what happened.
 */
export interface SessionSummary {
  /** ISO 8601 timestamp when summary was generated */
  generatedAt: string;
  /** Natural language summary of the session */
  content: string;
  /** Key decisions made during the session */
  keyDecisions: string[];
  /** Items explicitly deferred for later */
  deferredItems: string[];
  /** Files that were modified during the session */
  filesModified: string[];
  /** Suggested next steps for continuation */
  suggestedNextSteps: string[];
}

// ============================================================================
// Configuration
// ============================================================================

/**
 * Persistence configuration.
 *
 * Controls where and how session data is stored.
 */
export interface PersistenceConfig {
  /** Config version for migration support */
  version: number;
  /** Whether persistence is enabled */
  enabled: boolean;
  /** Base directory for persisted session files */
  baseDir: string;
  /** Content size limits to prevent excessive storage */
  limits: ContentLimits;
  /** Summarizer configuration */
  summarizer: SummarizerConfig;
}

/**
 * Content limits for captured session data.
 *
 * Prevents excessive storage by limiting the number and size
 * of captured items. Oldest items are dropped when limits are reached.
 */
export interface ContentLimits {
  /** Maximum number of thinking blocks to capture */
  thinkingBlocks: number;
  /** Maximum characters per thinking block */
  thinkingBlockMaxChars: number;
  /** Maximum number of tool calls to capture */
  toolCalls: number;
  /** Maximum characters per tool call (input + output) */
  toolCallMaxChars: number;
  /** Maximum number of user prompts to capture */
  prompts: number;
  /** Maximum characters per prompt */
  promptMaxChars: number;
  /** Maximum number of assistant responses to capture */
  responses: number;
  /** Maximum characters per response */
  responseMaxChars: number;
}

/**
 * Summarizer configuration.
 */
export interface SummarizerConfig {
  /** Whether automatic summarization is enabled */
  enabled: boolean;
  /** Timeout for summarization requests in milliseconds */
  timeoutMs: number;
}

// ============================================================================
// Session Index
// ============================================================================

/**
 * Session index entry for quick lookup.
 *
 * Lightweight metadata stored in a central index file
 * for fast session listing without reading full session files.
 */
export interface SessionIndexEntry {
  /** Unique identifier for this persisted session */
  id: string;
  /** Claude session ID for `claude --resume` */
  claudeSessionId: string;
  /** Date in YYYY-MM-DD format for grouping */
  date: string;
  /** ISO 8601 timestamp when session started */
  startTime: string;
  /** ISO 8601 timestamp when session ended (if completed) */
  endTime?: string;
  /** Working directory for the session */
  workingDirectory?: string;
  /** Current session status */
  status: SessionStatus;
  /** Whether a summary has been generated */
  summaryExists: boolean;
}

// ============================================================================
// Capture API
// ============================================================================

/**
 * Request to capture session data.
 */
export interface CaptureRequest {
  /** Specific session ID to capture (omit for all active sessions) */
  sessionId?: string;
}

/**
 * Result of a capture operation.
 */
export interface CaptureResult {
  /** Whether the capture completed successfully */
  success: boolean;
  /** Number of sessions that were captured */
  sessionsCaptured: number;
  /** Whether the dashboard was notified of updates */
  dashboardUpdated: boolean;
  /** Error message if capture failed */
  error?: string;
}

// ============================================================================
// Summarization
// ============================================================================

/**
 * Context provided to the summarizer.
 *
 * Contains truncated session content for generating summaries.
 * All content has already been limited according to ContentLimits.
 */
export interface SummarizationContext {
  /** Project working directory */
  projectPath: string;
  /** Path to associated plan file (if any) */
  planPath?: string;
  /** Captured thinking blocks (truncated) */
  thinkingBlocks: string[];
  /** Captured tool calls with input/output (truncated) */
  toolCalls: Array<{
    name: string;
    input?: string;
    output?: string;
  }>;
  /** Captured user prompts (truncated) */
  prompts: string[];
  /** Captured assistant responses (truncated) */
  responses: string[];
  /** Current todo items from session */
  todos: Array<{
    content: string;
    status: string;
  }>;
}

// ============================================================================
// Default Configuration
// ============================================================================

/**
 * Default persistence configuration.
 *
 * These values are used when no user configuration is provided.
 */
export const DEFAULT_PERSISTENCE_CONFIG: PersistenceConfig = {
  version: 1,
  enabled: true,
  baseDir: '',  // User must configure via UI or settings file
  limits: {
    thinkingBlocks: 10,
    thinkingBlockMaxChars: 2000,
    toolCalls: 20,
    toolCallMaxChars: 500,
    prompts: 5,
    promptMaxChars: 1000,
    responses: 5,
    responseMaxChars: 2000,
  },
  summarizer: {
    enabled: true,
    timeoutMs: 60000,
  },
};

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get a deep copy of the default persistence configuration.
 *
 * Returns a new object to prevent accidental mutation of defaults.
 *
 * @returns Deep copy of DEFAULT_PERSISTENCE_CONFIG
 */
export function getDefaultConfig(): PersistenceConfig {
  return JSON.parse(JSON.stringify(DEFAULT_PERSISTENCE_CONFIG));
}
