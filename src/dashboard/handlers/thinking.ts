/**
 * Thinking Event Handler
 *
 * Processes thinking events from the monitor server and renders them
 * in the dashboard's thinking panel. Supports filtering and auto-scroll.
 *
 * Two rendering modes:
 * - Full content: Local models write actual thinking text (renders as expanded entries)
 * - Redacted: Claude Code API models (>=2.1.69) write empty thinking blocks
 *   (renders as compact aggregated markers per session+agent)
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
import { indexEntry } from '../ui/search-index.ts';

let ctx: AppContext | null = null;
let nextThinkingId = 0;

/** Tracks the last redacted-thinking aggregate marker per session+agent */
interface RedactedGroup {
  element: HTMLElement;
  count: number;
  firstTimestamp: string;
  lastTimestamp: string;
}

const redactedGroups: Map<string, RedactedGroup> = new Map();

/**
 * Clear aggregation state. Called on reconnect/panel clear.
 */
export function resetRedactedGroups(): void {
  redactedGroups.clear();
}

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
 */
export function handleThinking(event: ThinkingEvent): void {
  if (!ctx) {
    console.error('[Thinking Handler] Not initialized - call initThinking() first');
    return;
  }

  state.thinkingCount++;
  updateThinkingCount();
  updateTabBadge('thinking', state.thinkingCount);

  const content = event.content;
  const isRedacted = content === '[Extended thinking]';
  const sessionId = event.sessionId;

  // Resolve agent context
  const eventAgentId = event.agentId;
  let agentId = eventAgentId;
  if (!agentId) {
    const contextAgentId = ctx.agents.getCurrentContext();
    const contextAgent = subagentState.subagents.get(contextAgentId);
    if (contextAgent && contextAgent.parentSessionId === sessionId) {
      agentId = contextAgentId;
    } else {
      agentId = 'main';
    }
  }

  // Clear empty state if present
  const emptyState = elements.thinkingContent.querySelector('.empty-state');
  if (emptyState) {
    emptyState.remove();
  }

  // Subagent detection
  const subagentMapping = eventAgentId ? subagentState.subagents.get(eventAgentId) : undefined;
  const parentSessionId = subagentMapping?.parentSessionId;

  // Build badges (shared by both paths)
  const session = state.sessions.get(sessionId || '');
  const folderName = session?.workingDirectory
    ? getSessionDisplayName(session.workingDirectory)
    : null;

  const folderBadge = (sessionId && folderName)
    ? `<span class="entry-folder-badge" style="background: ${escapeCssValue(getSessionColorByFolder(folderName))}" title="Session: ${escapeHtml(sessionId)}">${escapeHtml(folderName)}</span>`
    : '';

  const sessionBadge = (sessionId && !folderName)
    ? `<span class="entry-session-badge" style="background: ${escapeCssValue(getSessionColorByHash(sessionId))}" title="Session: ${escapeHtml(sessionId)}">${escapeHtml(getShortSessionId(sessionId))}</span>`
    : '';

  if (isRedacted) {
    handleRedactedThinking(event, agentId, sessionId, folderBadge, sessionBadge, parentSessionId);
  } else {
    handleFullThinking(event, content, agentId, sessionId, folderBadge, sessionBadge, subagentMapping, parentSessionId);
  }
}

/**
 * Handle a redacted thinking event - aggregate into compact markers.
 */
function handleRedactedThinking(
  event: ThinkingEvent,
  agentId: string,
  sessionId: string | undefined,
  folderBadge: string,
  sessionBadge: string,
  parentSessionId: string | undefined,
): void {
  const groupKey = (sessionId || '__none') + ':' + agentId;
  const group = redactedGroups.get(groupKey);

  // Merge into existing group if it's still in the DOM
  if (group && group.element.parentNode) {
    group.count++;
    group.lastTimestamp = event.timestamp;
    updateRedactedMarker(group);
    applyThinkingFilter(group.element);
    ctx!.ui.smartScroll(elements.thinkingContent);
    return;
  }

  // Create new compact marker
  redactedGroups.delete(groupKey);
  const entry = document.createElement('div');
  entry.className = 'thinking-entry thinking-redacted-marker new';
  entry.id = `thinking-${nextThinkingId++}`;
  entry.dataset.agent = agentId;
  entry.dataset.session = sessionId || '';
  entry.dataset.content = 'extended thinking';
  entry.dataset.timestamp = String(Date.now());
  entry.dataset.eventTimestamp = event.timestamp;
  entry.dataset.redactedCount = '1';
  if (parentSessionId) {
    entry.dataset.parentSession = parentSessionId;
  }

  const time = formatTime(event.timestamp);

  entry.innerHTML = `
    <div class="redacted-marker-content">
      <span class="redacted-marker-indicator"></span>
      <span class="thinking-time">${escapeHtml(time)}</span>
      ${folderBadge}
      ${sessionBadge}
      <span class="redacted-marker-label">1 thinking block</span>
    </div>
  `;

  const newGroup: RedactedGroup = {
    element: entry,
    count: 1,
    firstTimestamp: event.timestamp,
    lastTimestamp: event.timestamp,
  };
  redactedGroups.set(groupKey, newGroup);

  applyThinkingFilter(entry);
  ctx!.ui.appendAndTrim(elements.thinkingContent, entry);
  indexEntry(entry.id, entry.dataset.content || '');
  ctx!.ui.smartScroll(elements.thinkingContent);
  setTimeout(() => entry.classList.remove('new'), 1000);
}

/**
 * Update a redacted marker's label and time range.
 */
function updateRedactedMarker(group: RedactedGroup): void {
  const label = group.element.querySelector('.redacted-marker-label');
  if (label) {
    label.textContent = `${group.count} thinking blocks`;
  }
  const timeEl = group.element.querySelector('.thinking-time');
  if (timeEl) {
    const first = formatTime(group.firstTimestamp);
    const last = formatTime(group.lastTimestamp);
    timeEl.textContent = first === last ? first : `${first}\u2013${last}`;
  }
  group.element.dataset.redactedCount = String(group.count);

  // Re-trigger highlight animation
  group.element.classList.add('new');
  setTimeout(() => group.element.classList.remove('new'), 1000);
}

/**
 * Handle a full thinking event - render as expanded entry with content.
 */
function handleFullThinking(
  event: ThinkingEvent,
  content: string,
  agentId: string,
  sessionId: string | undefined,
  folderBadge: string,
  sessionBadge: string,
  subagentMapping: { agentName: string } | undefined,
  parentSessionId: string | undefined,
): void {
  // Break any active redacted group for this session+agent
  const groupKey = (sessionId || '__none') + ':' + agentId;
  redactedGroups.delete(groupKey);

  const isSubagentThinking = !!subagentMapping;
  const agentDisplayName = ctx!.agents.getDisplayName(agentId);
  const agentBadgeColors = getAgentBadgeColors(agentDisplayName);
  const time = formatTime(event.timestamp);
  const preview = content.slice(0, 80).replace(/\n/g, ' ');

  const subagentBadge = isSubagentThinking
    ? `<span class="entry-subagent-badge" title="Subagent thinking">${escapeHtml(subagentMapping!.agentName)}</span>`
    : '';

  const entry = document.createElement('div');
  entry.className = isSubagentThinking ? 'thinking-entry subagent-entry new' : 'thinking-entry new';
  entry.id = `thinking-${nextThinkingId++}`;
  entry.dataset.agent = agentId;
  entry.dataset.session = sessionId || '';
  entry.dataset.content = content.toLowerCase();
  entry.dataset.timestamp = String(Date.now());
  entry.dataset.eventTimestamp = event.timestamp;
  if (parentSessionId) {
    entry.dataset.parentSession = parentSessionId;
  }

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

  applyThinkingFilter(entry);
  ctx!.ui.appendAndTrim(elements.thinkingContent, entry);
  indexEntry(entry.id, entry.dataset.content || '');
  ctx!.ui.smartScroll(elements.thinkingContent);
  setTimeout(() => entry.classList.remove('new'), 1000);
}
