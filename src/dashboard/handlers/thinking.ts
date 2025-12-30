/**
 * Thinking Event Handler
 *
 * Processes thinking events from the monitor server and renders them
 * in the dashboard's thinking panel. Supports filtering and auto-scroll.
 *
 * Uses a callback pattern for functions that would cause circular imports.
 */

import type { ThinkingEvent } from '../types';
import { state } from '../state';
import { elements } from '../ui/elements';
import { formatTime } from '../utils/formatting';
import { escapeHtml } from '../utils/html';
import {
  getSessionColor,
  getShortSessionId,
  applyThinkingFilter,
  updateThinkingCount,
} from '../ui/filters';
import { getAgentColor } from '../ui/colors';

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

  // Determine agent context (same logic as tool calls)
  const eventAgentId = event.agentId;
  const agentId = eventAgentId || callbacks.getCurrentAgentContext();
  const agentDisplayName = callbacks.getAgentDisplayName(agentId);

  // Clear empty state if present
  const emptyState = elements.thinkingContent.querySelector('.empty-state');
  if (emptyState) {
    emptyState.remove();
  }

  // Create thinking entry (non-collapsible, always expanded)
  const entry = document.createElement('div');
  entry.className = 'thinking-entry new';
  entry.dataset.agent = agentId;
  entry.dataset.session = sessionId || '';
  entry.dataset.content = content.toLowerCase(); // For filtering

  // Session badge HTML if we have a session ID
  const sessionBadge = sessionId
    ? `<span class="entry-session-badge" style="background: ${getSessionColor(sessionId)}" title="Session: ${escapeHtml(sessionId)}">${escapeHtml(getShortSessionId(sessionId))}</span>`
    : '';

  // Get agent color for visual distinction
  const agentColor = getAgentColor(agentDisplayName);

  entry.innerHTML = `
    <div class="thinking-entry-header">
      <span class="thinking-time">${escapeHtml(time)}</span>
      ${sessionBadge}
      <span class="thinking-agent" style="color: ${agentColor}">${escapeHtml(agentDisplayName)}</span>
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
