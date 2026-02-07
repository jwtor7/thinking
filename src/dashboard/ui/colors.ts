import { debug } from '../utils/debug.ts';

// ============================================
// CSS Variable Helpers
// ============================================

/**
 * Get a CSS variable value from the document root.
 * Returns the computed value of the CSS custom property.
 */
function getCssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

/**
 * Lazily initialized CSS variable values.
 * These are populated on first access after DOM is ready.
 */
let cssVarsInitialized = false;
let SESSION_COLORS: string[] = [];
let AGENT_COLORS: Record<string, string> = {};
let AGENT_FALLBACK_COLORS: string[] = [];

/**
 * Initialize color values from CSS variables.
 * Called once when colors are first needed.
 */
function initCssColors(): void {
  if (cssVarsInitialized) return;

  // Session colors for visual distinction
  SESSION_COLORS = [
    getCssVar('--color-session-1'),  // blue
    getCssVar('--color-session-2'),  // green
    getCssVar('--color-session-3'),  // purple
    getCssVar('--color-session-4'),  // cyan
    getCssVar('--color-session-5'),  // yellow
    getCssVar('--color-session-6'),  // orange
    getCssVar('--color-session-7'),  // red
    getCssVar('--color-session-8'),  // gray
  ];

  // Agent colors for visual distinction in tool activity panel
  // Each agent type gets a consistent color for quick identification
  AGENT_COLORS = {
    'main': getCssVar('--color-agent-main'),                        // gray - main conversation (default)
    'code-implementer': getCssVar('--color-agent-code-implementer'), // green - implementation work
    'code-test-evaluator': getCssVar('--color-agent-code-test-evaluator'), // cyan/teal - testing/evaluation
    'haiku-general-agent': getCssVar('--color-agent-haiku'),        // orange - haiku agent
    'opus-general-purpose': getCssVar('--color-agent-opus'),        // gold/yellow - opus general purpose
    'general-purpose': getCssVar('--color-agent-general'),          // blue - general purpose (sonnet)
  };

  // Fallback colors for agents not in the predefined list
  AGENT_FALLBACK_COLORS = [
    getCssVar('--color-agent-fallback-1'),  // red
    getCssVar('--color-agent-fallback-2'),  // purple
    getCssVar('--color-agent-fallback-3'),  // coral
    getCssVar('--color-agent-fallback-4'),  // light green
    getCssVar('--color-agent-fallback-5'),  // light blue
    getCssVar('--color-agent-fallback-6'),  // peach
  ];

  cssVarsInitialized = true;
}

/**
 * Get a consistent color for a session ID using a hash.
 * This ensures the same session ID always gets the same color,
 * and different session IDs are likely to get different colors.
 */
export function getSessionColorByHash(sessionId: string): string {
  initCssColors();
  if (!sessionId || SESSION_COLORS.length === 0) {
    return 'var(--color-text-muted)';
  }

  // Simple hash function for session ID
  let hash = 0;
  for (let i = 0; i < sessionId.length; i++) {
    const char = sessionId.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }

  // Use absolute value and modulo to get color index
  const colorIndex = Math.abs(hash) % SESSION_COLORS.length;
  return SESSION_COLORS[colorIndex];
}

/**
 * Get a consistent color for a folder name using a hash.
 * Sessions in the same folder will get the same color for visual grouping.
 * Falls back to session ID hash if no folder name provided.
 */
export function getSessionColorByFolder(folderName: string, fallbackSessionId?: string): string {
  initCssColors();

  // Use folder name if available, otherwise fall back to session ID
  const hashSource = folderName || fallbackSessionId;
  if (!hashSource || SESSION_COLORS.length === 0) {
    return 'var(--color-text-muted)';
  }

  // Simple hash function for folder name
  let hash = 0;
  for (let i = 0; i < hashSource.length; i++) {
    const char = hashSource.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }

  // Use absolute value and modulo to get color index
  const colorIndex = Math.abs(hash) % SESSION_COLORS.length;
  return SESSION_COLORS[colorIndex];
}

/**
 * Get the display color for an agent.
 * Returns a consistent color based on the agent name.
 * Known agents get predefined colors; unknown agents cycle through fallback colors.
 */
export function getAgentColor(agentName: string): string {
  // Ensure CSS colors are initialized
  initCssColors();

  // Check for predefined color
  if (AGENT_COLORS[agentName]) {
    return AGENT_COLORS[agentName];
  }

  // For unknown agents, generate a consistent color based on name hash
  let hash = 0;
  for (let i = 0; i < agentName.length; i++) {
    hash = ((hash << 5) - hash) + agentName.charCodeAt(i);
    hash = hash & hash; // Convert to 32-bit integer
  }
  const index = Math.abs(hash) % AGENT_FALLBACK_COLORS.length;
  return AGENT_FALLBACK_COLORS[index];
}

/**
 * Badge color pair (background and text).
 */
export interface BadgeColors {
  bg: string;
  text: string;
}

/**
 * Lazily initialized badge color values.
 * Maps color type (green, orange, etc.) to badge colors.
 */
let badgeColorsInitialized = false;
let BADGE_COLORS: Record<string, BadgeColors> = {};

/**
 * Initialize badge color values from CSS variables.
 * Called once when badge colors are first needed.
 */
function initBadgeColors(): void {
  if (badgeColorsInitialized) return;

  BADGE_COLORS = {
    green: {
      bg: getCssVar('--color-badge-green-bg'),
      text: getCssVar('--color-badge-green-text'),
    },
    yellow: {
      bg: getCssVar('--color-badge-yellow-bg'),
      text: getCssVar('--color-badge-yellow-text'),
    },
    orange: {
      bg: getCssVar('--color-badge-orange-bg'),
      text: getCssVar('--color-badge-orange-text'),
    },
    blue: {
      bg: getCssVar('--color-badge-blue-bg'),
      text: getCssVar('--color-badge-blue-text'),
    },
    purple: {
      bg: getCssVar('--color-badge-purple-bg'),
      text: getCssVar('--color-badge-purple-text'),
    },
    cyan: {
      bg: getCssVar('--color-badge-cyan-bg'),
      text: getCssVar('--color-badge-cyan-text'),
    },
    red: {
      bg: getCssVar('--color-badge-red-bg'),
      text: getCssVar('--color-badge-red-text'),
    },
    gray: {
      bg: getCssVar('--color-badge-gray-bg'),
      text: getCssVar('--color-badge-gray-text'),
    },
  };

  badgeColorsInitialized = true;
}

/**
 * Map of known agent names to their badge color type.
 * This maps agent names to color categories (green, orange, etc.)
 */
const AGENT_BADGE_COLOR_MAP: Record<string, string> = {
  // Core agents
  'main': 'gray',
  'code-implementer': 'green',
  'code-test-evaluator': 'cyan',
  'haiku-general-agent': 'orange',
  'opus-general-purpose': 'yellow',
  'general-purpose': 'blue',
  // Subagent types (from Task tool)
  'Explore': 'orange',
  'Plan': 'green',
  'Bash': 'purple',
  'Discover': 'cyan',
  'Research': 'blue',
};

/**
 * Fallback badge color types for unknown agents.
 * Cycles through these based on name hash.
 */
const FALLBACK_BADGE_TYPES = ['red', 'purple', 'orange', 'green', 'blue', 'cyan'];

/**
 * Get badge colors (background + text) for an agent.
 * Returns WCAG AA compliant color pairs for themed badges.
 *
 * @param agentName - The agent name or type
 * @returns Badge colors with bg and text properties
 */
export function getAgentBadgeColors(agentName: string): BadgeColors {
  // Ensure badge colors are initialized
  initBadgeColors();

  // Check for predefined color mapping
  const colorType = AGENT_BADGE_COLOR_MAP[agentName];
  if (colorType && BADGE_COLORS[colorType]) {
    return BADGE_COLORS[colorType];
  }

  // For unknown agents, generate a consistent color based on name hash
  let hash = 0;
  for (let i = 0; i < agentName.length; i++) {
    hash = ((hash << 5) - hash) + agentName.charCodeAt(i);
    hash = hash & hash; // Convert to 32-bit integer
  }
  const fallbackType = FALLBACK_BADGE_TYPES[Math.abs(hash) % FALLBACK_BADGE_TYPES.length];
  return BADGE_COLORS[fallbackType] || BADGE_COLORS.gray;
}

/**
 * Reset the color cache so colors are re-read from CSS variables.
 * Call this when the theme changes to ensure session/agent colors
 * pick up the new theme's accent colors.
 */
export function resetColorCache(): void {
  cssVarsInitialized = false;
  badgeColorsInitialized = false;
  SESSION_COLORS = [];
  AGENT_COLORS = {};
  AGENT_FALLBACK_COLORS = [];
  BADGE_COLORS = {};
  debug('[Colors] Color cache reset - will re-read CSS variables on next access');
}

// Export public functions
export { getCssVar, initCssColors };
