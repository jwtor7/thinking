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
import { updateTabBadge } from '../ui/views.ts';
import { getAgentBadgeColors, getSessionColorByFolder, getSessionColorByHash } from '../ui/colors.ts';
import { getSessionDisplayName } from './sessions.ts';
import type { AppContext } from '../services/app-context.ts';
import type { Disposable } from '../services/lifecycle.ts';

let ctx: AppContext | null = null;

/**
 * Initialize the thinking handler with app context.
 * Must be called before any thinking events are processed.
 */
export function initThinking(appCtx: AppContext): Disposable {
  ctx = appCtx;
  return { dispose: () => { ctx = null; } };
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
  if (!ctx) {
    console.error('[Thinking Handler] Not initialized - call initThinking() first');
    return;
  }

  state.thinkingCount++;
  updateThinkingCount();
  updateTabBadge('thinking', state.thinkingCount);

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
    const contextAgentId = ctx.agents.getCurrentContext();
    // Check if context agent belongs to this session
    const contextAgent = subagentState.subagents.get(contextAgentId);
    if (contextAgent && contextAgent.parentSessionId === sessionId) {
      agentId = contextAgentId;
    } else {
      agentId = 'main';
    }
  }
  const agentDisplayName = ctx.agents.getDisplayName(agentId);

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
  entry.dataset.timestamp = String(Date.now());
  entry.dataset.eventTimestamp = event.timestamp; // For timeline click navigation
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
  ctx.ui.appendAndTrim(elements.thinkingContent, entry);

  // Smart scroll if auto-scroll is enabled
  ctx.ui.smartScroll(elements.thinkingContent);

  // Remove 'new' class after animation
  setTimeout(() => entry.classList.remove('new'), 1000);
}
