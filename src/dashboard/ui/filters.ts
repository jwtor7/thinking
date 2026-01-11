/**
 * Filtering functions for dashboard entries.
 * Handles session, thinking, tools, and hooks filtering with count updates.
 */

import { state, subagentState } from '../state';
import { elements } from './elements';
import { filterAllHooks, updateHooksCount } from '../handlers/hooks';

// ============================================
// Session Filtering
// ============================================

export function filterAllBySession(): void {
  // Filter thinking entries
  const thinkingEntries = elements.thinkingContent.querySelectorAll('.thinking-entry');
  thinkingEntries.forEach((entry: Element) => {
    const el = entry as HTMLElement;
    applySessionFilter(el);
  });

  // Filter tool entries
  const toolEntries = elements.toolsContent.querySelectorAll('.tool-entry');
  toolEntries.forEach((entry: Element) => {
    const el = entry as HTMLElement;
    applySessionFilter(el);
  });

  // Filter hook entries
  filterAllHooks();

  // Update counts to reflect filtered entries
  updateThinkingCount();
  updateToolsCount();
  updateHooksCount();
}

/**
 * Apply session filter to a single entry element.
 * Also considers text filter and subagent parent relationships.
 */
export function applySessionFilter(entry: HTMLElement): void {
  const entrySession = entry.dataset.session || '';
  const parentSession = entry.dataset.parentSession || '';

  // Session matching: also include entries from subagents when parent session is selected
  let matchesSession = false;
  if (state.selectedSession === 'all') {
    matchesSession = true;
  } else if (entrySession === state.selectedSession) {
    // Direct session match
    matchesSession = true;
  } else if (parentSession === state.selectedSession) {
    // This entry's parent session matches the selected session
    matchesSession = true;
  } else {
    // Check if this entry's agent is a subagent of the selected session
    const agentId = entry.dataset.agent;
    if (agentId) {
      const subagent = subagentState.subagents.get(agentId);
      if (subagent && subagent.parentSessionId === state.selectedSession) {
        matchesSession = true;
      }
    }
  }

  // Check if this is a thinking entry or tool entry
  const isThinkingEntry = entry.classList.contains('thinking-entry');

  if (isThinkingEntry) {
    const matchesText = !state.thinkingFilter ||
      (entry.dataset.content || '').includes(state.thinkingFilter.toLowerCase());
    entry.style.display = (matchesSession && matchesText) ? '' : 'none';
  } else {
    // Tool entry
    const toolName = entry.dataset.toolName || '';
    const input = entry.dataset.input || '';
    const filter = state.toolsFilter.toLowerCase();
    const matchesText = !filter || toolName.includes(filter) || input.includes(filter);
    entry.style.display = (matchesSession && matchesText) ? '' : 'none';
  }
}

/**
 * Get the color for a session ID.
 */
export function getSessionColor(sessionId: string | undefined): string {
  if (!sessionId) return 'var(--color-text-muted)';
  const session = state.sessions.get(sessionId);
  return session?.color || 'var(--color-text-muted)';
}

/**
 * Get a short display version of a session ID.
 */
export function getShortSessionId(sessionId: string | undefined): string {
  if (!sessionId) return '';
  return sessionId.slice(0, 8);
}

// ============================================
// Panel Filtering
// ============================================

export function applyThinkingFilter(entry: HTMLElement): void {
  const content = entry.dataset.content || '';
  const matchesText = !state.thinkingFilter || content.includes(state.thinkingFilter.toLowerCase());

  // Session matching: also include subagent thinking when parent session is selected
  let sessionMatches = false;
  if (state.selectedSession === 'all') {
    sessionMatches = true;
  } else if (entry.dataset.session === state.selectedSession) {
    // Direct session match
    sessionMatches = true;
  } else if (entry.dataset.parentSession === state.selectedSession) {
    // This is subagent thinking whose parent session is selected
    sessionMatches = true;
  } else {
    // Check if this entry's agent is a subagent of the selected session
    const agentId = entry.dataset.agent;
    if (agentId) {
      const subagent = subagentState.subagents.get(agentId);
      if (subagent && subagent.parentSessionId === state.selectedSession) {
        sessionMatches = true;
      }
    }
  }

  entry.style.display = (matchesText && sessionMatches) ? '' : 'none';
}

export function applyToolsFilter(entry: HTMLElement): void {
  const toolName = entry.dataset.toolName || '';
  const input = entry.dataset.input || '';
  const filter = state.toolsFilter.toLowerCase();
  const matchesText = !filter || toolName.includes(filter) || input.includes(filter);
  const sessionMatches = state.selectedSession === 'all' || entry.dataset.session === state.selectedSession;
  entry.style.display = (matchesText && sessionMatches) ? '' : 'none';
}

export function filterAllThinking(): void {
  const entries = elements.thinkingContent.querySelectorAll('.thinking-entry');
  entries.forEach((entry: Element) => {
    applyThinkingFilter(entry as HTMLElement);
  });

  // Show/hide clear button
  if (state.thinkingFilter) {
    elements.thinkingFilterClear.classList.remove('panel-filter-hidden');
  } else {
    elements.thinkingFilterClear.classList.add('panel-filter-hidden');
  }

  // Update count to reflect filtered entries
  updateThinkingCount();
}

export function filterAllTools(): void {
  const entries = elements.toolsContent.querySelectorAll('.tool-entry');
  entries.forEach((entry: Element) => {
    applyToolsFilter(entry as HTMLElement);
  });

  // Show/hide clear button
  if (state.toolsFilter) {
    elements.toolsFilterClear.classList.remove('panel-filter-hidden');
  } else {
    elements.toolsFilterClear.classList.add('panel-filter-hidden');
  }

  // Update count to reflect filtered entries
  updateToolsCount();
}

// ============================================
// Count Updates
// ============================================

/**
 * Update the thinking count display.
 * Shows "filtered/total" format when a filter is active, otherwise just the total.
 */
export function updateThinkingCount(): void {
  const hasFilter = state.thinkingFilter || state.selectedSession !== 'all';

  if (hasFilter) {
    // Count visible entries
    const entries = elements.thinkingContent.querySelectorAll('.thinking-entry');
    let visibleCount = 0;
    entries.forEach((entry: Element) => {
      const el = entry as HTMLElement;
      if (el.style.display !== 'none') {
        visibleCount++;
      }
    });
    elements.thinkingCount.textContent = `${visibleCount}/${state.thinkingCount}`;
  } else {
    elements.thinkingCount.textContent = String(state.thinkingCount);
  }
}

/**
 * Update the tools count display.
 * Shows "filtered/total" format when a filter is active, otherwise just the total.
 */
export function updateToolsCount(): void {
  const hasFilter = state.toolsFilter || state.selectedSession !== 'all';

  if (hasFilter) {
    // Count visible entries
    const entries = elements.toolsContent.querySelectorAll('.tool-entry');
    let visibleCount = 0;
    entries.forEach((entry: Element) => {
      const el = entry as HTMLElement;
      if (el.style.display !== 'none') {
        visibleCount++;
      }
    });
    elements.toolsCount.textContent = `${visibleCount}/${state.toolsCount}`;
  } else {
    elements.toolsCount.textContent = String(state.toolsCount);
  }
}
