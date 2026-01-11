/**
 * Hook event handlers for the Thinking Monitor Dashboard.
 *
 * Handles hook_execution events, creating entries in the Hooks panel
 * with hook type, tool name, decision, and timing information.
 */

import { state } from '../state.js';
import { elements } from '../ui/elements.js';
import { formatTime } from '../utils/formatting.js';
import { escapeHtml, escapeCssValue } from '../utils/html.js';
import { getAgentColor, getSessionColorByHash } from '../ui/colors.js';
import type { HookExecutionEvent } from '../types.js';

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
    default:
      return '';
  }
}

/**
 * Apply filter to a single hook entry.
 */
function applyHooksFilter(entry: HTMLElement): void {
  const hookType = entry.dataset.hookType || '';
  const decision = entry.dataset.decision || '';

  let visible = true;
  switch (hooksFilter) {
    case 'allow':
      visible = decision === 'allow';
      break;
    case 'deny':
      visible = decision === 'deny';
      break;
    case 'pre':
      visible = hookType === 'pretooluse';
      break;
    case 'post':
      visible = hookType === 'posttooluse';
      break;
    case 'subagent':
      visible = hookType.startsWith('subagent');
      break;
    case 'deny-subagent':
      visible = decision === 'deny' || hookType.startsWith('subagent');
      break;
    default:
      visible = true;
  }

  entry.style.display = visible ? '' : 'none';
}

/**
 * Apply filter to all existing hook entries.
 */
function filterAllHooks(): void {
  if (!elements.hooksContent) return;

  const entries = elements.hooksContent.querySelectorAll('.hook-entry');
  entries.forEach((entry) => {
    applyHooksFilter(entry as HTMLElement);
  });
}

/**
 * Update the hooks count badge in the panel header.
 * Shows visible count / total count when filtered.
 */
export function updateHooksCount(): void {
  if (!elements.hooksCount) return;

  if (hooksFilter === 'all') {
    elements.hooksCount.textContent = String(state.hooksCount);
  } else {
    // Count visible entries
    const visibleCount = elements.hooksContent
      ? elements.hooksContent.querySelectorAll('.hook-entry:not([style*="display: none"])').length
      : 0;
    elements.hooksCount.textContent = `${visibleCount}/${state.hooksCount}`;
  }
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
  const decision = event.decision;
  const hookName = event.hookName;
  const output = event.output;
  const time = formatTime(event.timestamp);
  const sessionId = event.sessionId;

  state.hooksCount++;
  updateHooksCount();

  // Clear empty state if present
  const emptyState = elements.hooksContent?.querySelector('.empty-state');
  if (emptyState) {
    emptyState.remove();
  }

  // Build the decision badge HTML
  let decisionBadge = '';
  if (decision) {
    decisionBadge = `<span class="hook-decision ${getDecisionClass(decision)}">${escapeHtml(decision)}</span>`;
  } else if (hookType === 'PostToolUse') {
    // PostToolUse hooks don't make decisions, show "observed" badge
    decisionBadge = `<span class="hook-decision hook-decision-observed">observed</span>`;
  } else if (hookType === 'SubagentStart' || hookType === 'SubagentStop') {
    // For SubagentStart/SubagentStop, show agent name as colored badge
    // Extract agent name from output (format: "agent-name" or "agent-name: status")
    const agentName = output?.split(':')[0]?.trim() || 'agent';
    const agentColor = getAgentColor(agentName);
    decisionBadge = `<span class="hook-agent-badge" style="background: ${escapeCssValue(agentColor)}">${escapeHtml(agentName)}</span>`;
  }

  // Build the tool name HTML
  const toolInfo = toolName
    ? `<span class="hook-tool">${escapeHtml(toolName)}</span>`
    : '';

  // Build the output preview (truncated)
  const outputPreview = output
    ? `<div class="hook-output">${escapeHtml(output.length > 100 ? output.slice(0, 100) + '...' : output)}</div>`
    : '';

  // Build session badge for subagent hooks
  let sessionBadge = '';
  if ((hookType === 'SubagentStart' || hookType === 'SubagentStop') && sessionId) {
    const sessionColor = getSessionColorByHash(sessionId);
    sessionBadge = `<span class="hook-session-badge" style="background: ${escapeCssValue(sessionColor)}">${escapeHtml(sessionId)}</span>`;
  }

  // For subagent hooks, don't render the content section
  const isSubagentHook = hookType === 'SubagentStart' || hookType === 'SubagentStop';
  const contentSection = isSubagentHook
    ? ''
    : `<div class="hook-entry-content">
        <span class="hook-name">${escapeHtml(hookName)}</span>
        ${outputPreview}
      </div>`;

  // Create hook entry
  const entry = document.createElement('div');
  entry.className = 'hook-entry';
  entry.dataset.hookType = hookType.toLowerCase();
  entry.dataset.session = sessionId || '';
  entry.dataset.decision = decision?.toLowerCase() || '';

  entry.innerHTML = `
    <div class="hook-entry-header">
      <span class="hook-time">${escapeHtml(time)}</span>
      <span class="hook-type ${getHookTypeClass(hookType)}">${escapeHtml(hookType)}</span>
      ${toolInfo}
      ${sessionBadge}
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

  // Remove 'new' class after animation
  entry.classList.add('new');
  setTimeout(() => entry.classList.remove('new'), 1000);
}
