/**
 * Hook event handlers for the Thinking Monitor Dashboard.
 *
 * Handles hook_execution events, creating entries in the Hooks panel
 * with hook type, tool name, decision, and timing information.
 */

import { state } from '../state.js';
import { elements } from '../ui/elements.js';
import { formatTime } from '../utils/formatting.js';
import { escapeHtml } from '../utils/html.js';
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

/**
 * Initialize the hooks handler with required callbacks.
 * Must be called before handling any hook events.
 */
export function initHooks(cbs: HooksCallbacks): void {
  callbacks = cbs;
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
    default:
      return '';
  }
}

/**
 * Update the hooks count badge in the panel header.
 */
export function updateHooksCount(): void {
  if (elements.hooksCount) {
    elements.hooksCount.textContent = String(state.hooksCount);
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
  const decisionBadge = decision
    ? `<span class="hook-decision ${getDecisionClass(decision)}">${escapeHtml(decision)}</span>`
    : '';

  // Build the tool name HTML
  const toolInfo = toolName
    ? `<span class="hook-tool">${escapeHtml(toolName)}</span>`
    : '';

  // Build the output preview (truncated)
  const outputPreview = output
    ? `<div class="hook-output">${escapeHtml(output.length > 100 ? output.slice(0, 100) + '...' : output)}</div>`
    : '';

  // Create hook entry
  const entry = document.createElement('div');
  entry.className = 'hook-entry';
  entry.dataset.hookType = hookType.toLowerCase();
  entry.dataset.session = sessionId || '';

  entry.innerHTML = `
    <div class="hook-entry-header">
      <span class="hook-time">${escapeHtml(time)}</span>
      <span class="hook-type ${getHookTypeClass(hookType)}">${escapeHtml(hookType)}</span>
      ${toolInfo}
      ${decisionBadge}
    </div>
    <div class="hook-entry-content">
      <span class="hook-name">${escapeHtml(hookName)}</span>
      ${outputPreview}
    </div>
  `;

  if (elements.hooksContent) {
    callbacks.appendAndTrim(elements.hooksContent, entry);
    callbacks.smartScroll(elements.hooksContent);
  }

  // Remove 'new' class after animation
  entry.classList.add('new');
  setTimeout(() => entry.classList.remove('new'), 1000);
}
