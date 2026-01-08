/**
 * Configuration Constants
 *
 * Centralized configuration for the Thinking Monitor dashboard.
 * WebSocket settings, storage keys, and performance tuning parameters.
 */

// WebSocket connection settings
export const WS_URL = 'ws://localhost:3355';
export const RECONNECT_BASE_DELAY_MS = 1000;
export const RECONNECT_MAX_DELAY_MS = 30000;

// UI and performance constants
export const MAX_ENTRIES = 500; // Max entries per panel to prevent memory issues
export const SCROLL_THRESHOLD = 50; // Pixels from bottom to consider "at bottom"

// Session state storage keys
export const STORAGE_KEY_TODOS = 'thinking-monitor-session-todos';
export const STORAGE_KEY_PANEL_COLLAPSE = 'thinking-monitor-panel-collapse-state';
export const STORAGE_KEY_PANEL_VISIBILITY = 'thinking-monitor-panel-visibility';
export const STORAGE_KEY_THEME = 'thinking-monitor-theme';

// Theme defaults
export const DEFAULT_THEME = 'system';

// Plan association persistence constants
export const PLAN_ASSOCIATION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
export const PLAN_ASSOCIATION_MAX_ENTRIES = 100;
export const PLAN_ASSOCIATION_STORAGE_KEY = 'sessionPlanAssociations';

// Agent context stack limits to prevent memory leaks
export const MAX_AGENT_STACK_SIZE = 100; // Maximum number of agents in the stack
export const AGENT_STACK_STALE_MS = 60 * 60 * 1000; // 1 hour - entries older than this are considered stale
export const AGENT_STACK_CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // Run cleanup every 5 minutes
