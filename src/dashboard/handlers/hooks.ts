/**
 * Hook event handlers for the Thinking Monitor Dashboard.
 *
 * Handles hook_execution events, creating entries in the Hooks panel
 * with hook type, tool name, decision, and timing information.
 */

import { state, subagentState } from '../state.ts';
import { elements } from '../ui/elements.ts';
import { formatTime } from '../utils/formatting.ts';
import { escapeHtml, escapeCssValue } from '../utils/html.ts';
import { getAgentBadgeColors, getSessionColorByHash, getSessionColorByFolder } from '../ui/colors.ts';
import { getShortSessionId } from '../ui/filters.ts';
import { getSessionDisplayName } from './sessions.ts';
import type { HookExecutionEvent } from '../types.ts';
import { updateTabBadge, selectView } from '../ui/views.ts';

// ============================================
// Callback Interface
// ============================================

/**
 * Callbacks for functions that cannot be directly imported
 * due to circular dependency concerns.
 */
export interface HooksCallbacks {
  appendAndTrim: (container: HTMLElement, element: HTMLElement) => void;
  smartScroll: (container: HTMLElement) => void;
}

let callbacks: HooksCallbacks | null = null;

// Current filter state
let hooksFilter: string = 'all';

/**
 * Initialize the hooks handler with required callbacks.
 * Must be called before handling any hook events.
 */
export function initHooks(cbs: HooksCallbacks): void {
  callbacks = cbs;

  // Set up filter change listener
  elements.hooksFilter?.addEventListener('change', (e) => {
    hooksFilter = (e.target as HTMLSelectElement).value;
    filterAllHooks();
    updateHooksCount();
  });
}

// ============================================
// Utilities
// ============================================

/**
 * Get the CSS class for a hook decision.
 */
function getDecisionClass(decision?: string): string {
  switch (decision) {
    case 'allow':
      return 'hook-decision-allow';
    case 'deny':
      return 'hook-decision-deny';
    case 'ask':
      return 'hook-decision-ask';
    default:
      return '';
  }
}

/**
 * Get the CSS class for a hook type.
 */
function getHookTypeClass(hookType: string): string {
  switch (hookType) {
    case 'PreToolUse':
      return 'hook-type-pre';
    case 'PostToolUse':
      return 'hook-type-post';
    case 'Stop':
      return 'hook-type-stop';
    case 'UserPromptSubmit':
      return 'hook-type-prompt';
    case 'SubagentStart':
    case 'SubagentStop':
      return 'hook-type-subagent';
    case 'TeammateIdle':
      return 'hook-type-teammate';
    case 'TaskCompleted':
      return 'hook-type-task';
    default:
      return '';
  }
}

/**
 * Apply filter to a single hook entry.
 * Considers both the hook type/decision filter and the session filter.
 */
function applyHooksFilter(entry: HTMLElement): void {
  const hookType = entry.dataset.hookType || '';
  const decision = entry.dataset.decision || '';
  const entrySession = entry.dataset.session || '';

  // Check session filter first
  const matchesSession = state.selectedSession === 'all' || entrySession === state.selectedSession;

  // Check hook type/decision filter
  let matchesHookFilter = true;
  switch (hooksFilter) {
    case 'allow':
      matchesHookFilter = decision === 'allow';
      break;
    case 'deny':
      matchesHookFilter = decision === 'deny';
      break;
    case 'pre':
      matchesHookFilter = hookType === 'pretooluse';
      break;
    case 'post':
      matchesHookFilter = hookType === 'posttooluse';
      break;
    case 'subagent':
      matchesHookFilter = hookType.startsWith('subagent');
      break;
    case 'deny-subagent':
      matchesHookFilter = decision === 'deny' || hookType.startsWith('subagent');
      break;
    case 'teammate':
      matchesHookFilter = hookType === 'teammateidle';
      break;
    case 'task':
      matchesHookFilter = hookType === 'taskcompleted';
      break;
    case 'team-all':
      matchesHookFilter = hookType === 'teammateidle' || hookType === 'taskcompleted';
      break;
    default:
      matchesHookFilter = true;
  }

  entry.style.display = (matchesSession && matchesHookFilter) ? '' : 'none';
}

/**
 * Apply filter to all existing hook entries.
 * Exported so it can be called when session filter changes.
 * Shows an empty state message when filter matches zero entries.
 */
export function filterAllHooks(): void {
  if (!elements.hooksContent) return;

  // Remove any existing filter empty state
  const existingFilterEmpty = elements.hooksContent.querySelector('.filter-empty');
  if (existingFilterEmpty) existingFilterEmpty.remove();

  const entries = elements.hooksContent.querySelectorAll('.hook-entry');
  let visibleCount = 0;
  entries.forEach((entry) => {
    applyHooksFilter(entry as HTMLElement);
    if ((entry as HTMLElement).style.display !== 'none') visibleCount++;
  });

  // Show empty state when filter yields zero results but entries exist
  if (visibleCount === 0 && entries.length > 0 && hooksFilter !== 'all') {
    const emptyEl = document.createElement('div');
    emptyEl.className = 'empty-state filter-empty';
    emptyEl.innerHTML = `
      <div class="empty-state-icon">&#9881;</div>
      <p class="empty-state-title">No matching hook events</p>
      <p class="empty-state-subtitle">Try changing the filter above</p>
    `;
    elements.hooksContent.appendChild(emptyEl);
  }
}

/**
 * Update the hooks count badge in the panel header.
 * Shows visible count / total count when filtered by hook type, decision, or session.
 */
export function updateHooksCount(): void {
  if (!elements.hooksCount) return;

  const hasFilter = hooksFilter !== 'all' || state.selectedSession !== 'all';

  if (!hasFilter) {
    elements.hooksCount.textContent = String(state.hooksCount);
  } else {
    // Count visible entries
    const visibleCount = elements.hooksContent
      ? elements.hooksContent.querySelectorAll('.hook-entry:not([style*="display: none"])').length
      : 0;
    elements.hooksCount.textContent = `${visibleCount}/${state.hooksCount}`;
  }

  updateTabBadge('hooks', state.hooksCount);
}

// ============================================
// Event Handlers
// ============================================

/**
 * Handle a hook_execution event.
 *
 * Creates a new hook entry in the Hooks panel with:
 * - Time and hook type badge
 * - Tool name (if applicable)
 * - Decision badge (for PreToolUse hooks)
 * - Hook name
 * - Output preview (if present)
 */
export function handleHookExecution(event: HookExecutionEvent): void {
  if (!callbacks) {
    console.error('[Hooks] Handler not initialized - call initHooks first');
    return;
  }

  const hookType = event.hookType;
  const toolName = event.toolName;
  const toolCallId = event.toolCallId;
  const decision = event.decision;
  const hookName = event.hookName;
  const output = event.output;
  const time = formatTime(event.timestamp);
  const sessionId = event.sessionId;
  const agentId = event.agentId;

  // Try to merge PostToolUse with existing PreToolUse entry by toolCallId
  if (hookType === 'PostToolUse' && toolCallId) {
    const existingEntry = elements.hooksContent?.querySelector(
      `.hook-entry[data-hook-call-id="${CSS.escape(toolCallId)}"]`
    ) as HTMLElement | null;

    if (existingEntry) {
      // Merge: update the existing PreToolUse entry to show grouped state
      const typeEl = existingEntry.querySelector('.hook-type');
      if (typeEl) {
        typeEl.textContent = 'Pre\u2192Post';
        typeEl.className = 'hook-type hook-type-grouped';
      }

      // Add "observed" decision badge if not already present
      const headerEl = existingEntry.querySelector('.hook-entry-header');
      if (headerEl && !headerEl.querySelector('.hook-decision-observed')) {
        const observedBadge = document.createElement('span');
        observedBadge.className = 'hook-decision hook-decision-observed';
        observedBadge.textContent = 'observed';
        headerEl.appendChild(observedBadge);
      }

      // Flash the merged entry
      existingEntry.classList.add('new');
      setTimeout(() => existingEntry.classList.remove('new'), 1000);

      // DON'T increment hooksCount, DON'T create new entry
      return;
    }
  }

  state.hooksCount++;
  updateHooksCount();

  // Clear empty state if present
  const emptyState = elements.hooksContent?.querySelector('.empty-state');
  if (emptyState) {
    emptyState.remove();
  }

  // Build the decision badge HTML (right-aligned)
  let decisionBadge = '';
  if (decision) {
    decisionBadge = `<span class="hook-decision ${getDecisionClass(decision)}">${escapeHtml(decision)}</span>`;
  } else if (hookType === 'PostToolUse') {
    // PostToolUse hooks don't make decisions, show "observed" badge
    decisionBadge = `<span class="hook-decision hook-decision-observed">observed</span>`;
  }
  // SubagentStart/Stop don't have decisions - agent type shown in toolInfo instead

  // Build the tool name HTML (or agent type for subagent hooks)
  let toolInfo = '';
  if (hookType === 'SubagentStart' || hookType === 'SubagentStop') {
    // For subagent hooks, show agent type name in tool position
    // First, try to look up the agent name from subagent state using the event's agentId
    // This is more reliable than parsing output, especially for SubagentStop
    let agentType = '';

    if (agentId) {
      const subagentMapping = subagentState.subagents.get(agentId);
      if (subagentMapping?.agentName) {
        agentType = subagentMapping.agentName;
      }
    }

    // Fall back to extracting from output (format: "agent-type" or "agent-type: status")
    if (!agentType && output) {
      agentType = output.split(':')[0]?.trim() || '';
    }

    // Check if it looks like a real agent type name (contains letters and dashes) vs just an ID (hex)
    const isRealAgentType = agentType && !/^[0-9a-f]{7,}$/i.test(agentType);
    if (isRealAgentType) {
      const badgeColors = getAgentBadgeColors(agentType);
      toolInfo = `<span class="hook-tool hook-agent-type" style="background: ${escapeCssValue(badgeColors.bg)}; color: ${escapeCssValue(badgeColors.text)};">${escapeHtml(agentType)}</span>`;
    }
    // If it's just an ID, don't show a badge (the agent ID is already in agentBadge if relevant)
  } else if (toolName) {
    toolInfo = `<span class="hook-tool">${escapeHtml(toolName)}</span>`;
  }

  // Build the output preview (truncated)
  const outputPreview = output
    ? `<div class="hook-output">${escapeHtml(output.length > 100 ? output.slice(0, 100) + '...' : output)}</div>`
    : '';

  // Get folder name for folder badge
  const session = state.sessions.get(sessionId || '');
  const folderName = session?.workingDirectory
    ? getSessionDisplayName(session.workingDirectory)
    : null;

  // Folder badge - same color for all sessions in same folder
  // This is the PRIMARY identifier when available - shows project/folder name
  const folderBadge = (sessionId && folderName)
    ? `<span class="entry-folder-badge" style="background: ${escapeCssValue(getSessionColorByFolder(folderName))}" title="Session: ${escapeHtml(sessionId)}">${escapeHtml(folderName)}</span>`
    : '';

  // Session ID badge - ONLY shown when no folder name is available
  // When folder badge exists, it becomes the primary identifier with session ID in tooltip
  const sessionBadge = (sessionId && !folderName)
    ? `<span class="hook-session-badge" style="background: ${escapeCssValue(getSessionColorByHash(sessionId))}" title="Session: ${escapeHtml(sessionId)}">${escapeHtml(getShortSessionId(sessionId))}</span>`
    : '';

  // Build agent badge when running in a subagent (skip for SubagentStart/Stop which show agent name in decisionBadge)
  const isSubagentHook = hookType === 'SubagentStart' || hookType === 'SubagentStop';
  let agentBadge = '';
  if (agentId && agentId !== sessionId && !isSubagentHook) {
    const agentBadgeColors = getAgentBadgeColors(agentId);
    agentBadge = `<span class="hook-agent-badge" style="background: ${escapeCssValue(agentBadgeColors.bg)}; color: ${escapeCssValue(agentBadgeColors.text)}">${escapeHtml(getShortSessionId(agentId))}</span>`;
  }

  // Async badge
  const asyncBadge = event.async
    ? `<span class="hook-async-badge" title="Async hook">async</span>`
    : '';

  // Hook exec type indicator
  let execTypeBadge = '';
  if (event.hookExecType) {
    const execTypeClass = `hook-exec-${event.hookExecType}`;
    execTypeBadge = `<span class="hook-exec-type ${execTypeClass}">${escapeHtml(event.hookExecType)}</span>`;
  }

  // For subagent hooks or our own hook, don't render the content section
  const isOurHook = hookName === 'thinking-monitor-hook';
  const contentSection = (isSubagentHook || isOurHook)
    ? ''
    : `<div class="hook-entry-content">
        <span class="hook-name">${escapeHtml(hookName)}</span>
        ${asyncBadge}
        ${execTypeBadge}
        ${outputPreview}
      </div>`;

  // Create hook entry
  const entry = document.createElement('div');
  entry.className = 'hook-entry';
  entry.dataset.hookType = hookType.toLowerCase();
  entry.dataset.session = sessionId || '';
  entry.dataset.decision = decision?.toLowerCase() || '';
  entry.dataset.timestamp = String(Date.now());
  if (toolCallId) {
    entry.dataset.hookCallId = toolCallId;
  }

  entry.innerHTML = `
    <div class="hook-entry-header">
      <span class="hook-time">${escapeHtml(time)}</span>
      <span class="hook-type ${getHookTypeClass(hookType)}">${escapeHtml(hookType)}</span>
      ${toolInfo}
      ${folderBadge}
      ${sessionBadge}
      ${agentBadge}
      <span class="hook-header-spacer"></span>
      ${decisionBadge}
    </div>
    ${contentSection}
  `;

  if (elements.hooksContent) {
    // Apply filter before adding to DOM
    applyHooksFilter(entry);
    callbacks.appendAndTrim(elements.hooksContent, entry);
    callbacks.smartScroll(elements.hooksContent);
  }

  // Add click handler for tool name -> scroll to matching tool entry
  const toolEl = entry.querySelector('.hook-tool') as HTMLElement | null;
  if (toolEl && toolName && !isSubagentHook) {
    toolEl.style.cursor = 'pointer';
    toolEl.title = 'Click to find in Tools panel';

    toolEl.addEventListener('click', (e) => {
      e.stopPropagation();
      selectView('tools');

      // Small delay to allow view switch to render
      setTimeout(() => {
        const toolEntries = document.querySelectorAll(
          `#tools-content .tool-entry[data-tool-name="${CSS.escape(toolName.toLowerCase())}"]`
        );
        const lastEntry = toolEntries[toolEntries.length - 1] as HTMLElement | null;

        if (lastEntry) {
          lastEntry.scrollIntoView({ behavior: 'smooth', block: 'center' });
          lastEntry.classList.add('flash');
          setTimeout(() => lastEntry.classList.remove('flash'), 1500);
        }
      }, 100);
    });
  }

  // Remove 'new' class after animation
  entry.classList.add('new');
  setTimeout(() => entry.classList.remove('new'), 1000);
}
