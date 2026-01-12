/**
 * Thinking Event Handler
 *
 * Processes thinking events from the monitor server and renders them
 * in the dashboard's thinking panel. Supports filtering and auto-scroll.
 *
 * Uses a callback pattern for functions that would cause circular imports.
 */

import type { ThinkingEvent } from '../types.ts';
import { state, subagentState } from '../state.ts';
import { elements } from '../ui/elements.ts';
import { formatTime } from '../utils/formatting.ts';
import { escapeHtml, escapeCssValue } from '../utils/html.ts';
import {
  getShortSessionId,
  applyThinkingFilter,
  updateThinkingCount,
} from '../ui/filters.ts';
import { getAgentColor, getAgentBadgeColors, getSessionColorByFolder, getSessionColorByHash } from '../ui/colors.ts';
import { getSessionDisplayName } from './sessions.ts';

/**
 * Callback interface for functions that would cause circular imports.
 * Implemented in app.ts and passed via initThinking().
 */
export interface ThinkingCallbacks {
  /**
   * Get the current agent context from the stack.
   * Returns the agent ID of the most recently started active agent.
   */
  getCurrentAgentContext: () => string;

  /**
   * Get the display name for an agent ID.
   * First looks up in the agents map, then falls back to truncated ID.
   */
  getAgentDisplayName: (agentId: string) => string;

  /**
   * Append an element to a container and trim old entries if needed.
   * Maintains a maximum number of entries in the container.
   */
  appendAndTrim: (container: HTMLElement, element: HTMLElement) => void;

  /**
   * Smart scroll the container to the bottom if auto-scroll is enabled.
   * Respects user scroll position and won't force scroll if user scrolled up.
   */
  smartScroll: (container: HTMLElement) => void;
}

/**
 * Callbacks instance - initialized via initThinking().
 */
let callbacks: ThinkingCallbacks | null = null;

/**
 * Initialize the thinking handler with required callbacks.
 * Must be called before any thinking events are processed.
 *
 * @param cbs Callbacks for functions that would cause circular imports
 */
export function initThinking(cbs: ThinkingCallbacks): void {
  callbacks = cbs;
}

/**
 * Handle a thinking event from the monitor server.
 * Creates a thinking entry in the dashboard with proper formatting and filtering.
 * Supports agent context tracking and session filtering.
 *
 * @param event The thinking event to process
 */
export function handleThinking(event: ThinkingEvent): void {
  // Validate callbacks have been initialized
  if (!callbacks) {
    console.error('[Thinking Handler] Callbacks not initialized - call initThinking() first');
    return;
  }

  state.thinkingCount++;
  updateThinkingCount();

  const content = event.content;
  const time = formatTime(event.timestamp);
  const sessionId = event.sessionId;
  const preview = content.slice(0, 80).replace(/\n/g, ' ');

  // Determine agent context
  // IMPORTANT: Only use global agent context if the agent belongs to this session
  // Otherwise thinking from session A gets incorrectly attributed to session B's agents
  const eventAgentId = event.agentId;
  let agentId = eventAgentId;
  if (!agentId) {
    const contextAgentId = callbacks.getCurrentAgentContext();
    // Check if context agent belongs to this session
    const contextAgent = subagentState.subagents.get(contextAgentId);
    if (contextAgent && contextAgent.parentSessionId === sessionId) {
      agentId = contextAgentId;
    } else {
      agentId = 'main';
    }
  }
  const agentDisplayName = callbacks.getAgentDisplayName(agentId);

  // Clear empty state if present
  const emptyState = elements.thinkingContent.querySelector('.empty-state');
  if (emptyState) {
    emptyState.remove();
  }

  // Check if this is from a subagent
  const subagentMapping = eventAgentId ? subagentState.subagents.get(eventAgentId) : undefined;
  const isSubagentThinking = !!subagentMapping;
  const parentSessionId = subagentMapping?.parentSessionId;

  // Create thinking entry (non-collapsible, always expanded)
  const entry = document.createElement('div');
  entry.className = isSubagentThinking ? 'thinking-entry subagent-entry new' : 'thinking-entry new';
  entry.dataset.agent = agentId;
  entry.dataset.session = sessionId || '';
  entry.dataset.content = content.toLowerCase(); // For filtering
  // Track parent session for subagent filtering
  if (parentSessionId) {
    entry.dataset.parentSession = parentSessionId;
  }

  // Get folder name for folder badge
  const session = state.sessions.get(sessionId || '');
  const folderName = session?.workingDirectory
    ? getSessionDisplayName(session.workingDirectory)
    : null;

  // Folder badge - same color for all sessions in same folder
  // SECURITY: escapeCssValue prevents CSS injection in style attributes
  // This is the PRIMARY identifier when available - shows project/folder name
  const folderBadge = (sessionId && folderName)
    ? `<span class="entry-folder-badge" style="background: ${escapeCssValue(getSessionColorByFolder(folderName))}" title="Session: ${escapeHtml(sessionId)}">${escapeHtml(folderName)}</span>`
    : '';

  // Session ID badge - ONLY shown when no folder name is available
  // When folder badge exists, it becomes the primary identifier with session ID in tooltip
  const sessionBadge = (sessionId && !folderName)
    ? `<span class="entry-session-badge" style="background: ${escapeCssValue(getSessionColorByHash(sessionId))}" title="Session: ${escapeHtml(sessionId)}">${escapeHtml(getShortSessionId(sessionId))}</span>`
    : '';

  // Subagent badge - show when this thinking is from a subagent
  const subagentBadge = isSubagentThinking
    ? `<span class="entry-subagent-badge" title="Subagent thinking">${escapeHtml(subagentMapping.agentName)}</span>`
    : '';

  // Get agent badge colors for visual distinction (WCAG AA compliant)
  const agentBadgeColors = getAgentBadgeColors(agentDisplayName);

  entry.innerHTML = `
    <div class="thinking-entry-header">
      <span class="thinking-time">${escapeHtml(time)}</span>
      ${folderBadge}
      ${sessionBadge}
      ${subagentBadge}
      <span class="thinking-agent" style="background: ${escapeCssValue(agentBadgeColors.bg)}; color: ${escapeCssValue(agentBadgeColors.text)}">${escapeHtml(agentDisplayName)}</span>
      <span class="thinking-preview">${escapeHtml(preview)}...</span>
    </div>
    <div class="thinking-text">${escapeHtml(content)}</div>
  `;

  // Apply filter visibility
  applyThinkingFilter(entry);

  // Append to container and maintain max entries
  callbacks.appendAndTrim(elements.thinkingContent, entry);

  // Smart scroll if auto-scroll is enabled
  callbacks.smartScroll(elements.thinkingContent);

  // Remove 'new' class after animation
  setTimeout(() => entry.classList.remove('new'), 1000);
}
