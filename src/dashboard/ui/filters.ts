/**
 * Filtering functions for dashboard entries.
 * Delegates to FilterService for session/agent/text matching.
 * Handles DOM operations and count updates.
 */

import { state } from '../state.ts';
import { elements } from './elements.ts';
import { filterAllHooks, updateHooksCount } from '../handlers/hooks.ts';
import {
  matchesCommonFilters,
  matchesTextFilter,
} from '../services/filter-service.ts';
import { filterEntries } from '../services/dom-filter.ts';

// ============================================
// Session Filtering
// ============================================

export function filterAllBySession(): void {
  // Filter thinking entries
  filterEntries(elements.thinkingContent, '.thinking-entry', (el) => {
    return matchesCommonFilters(el) &&
      matchesTextFilter(el.dataset.content || '', state.thinkingFilter);
  });

  // Filter tool entries
  filterEntries(elements.toolsContent, '.tool-entry', (el) => {
    const filter = state.toolsFilter.toLowerCase();
    return matchesCommonFilters(el) &&
      matchesTextFilter((el.dataset.toolName || '') + ' ' + (el.dataset.input || ''), filter ? state.toolsFilter : '');
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
 * Also considers text filter, agent filter, and subagent parent relationships.
 */
export function applySessionFilter(entry: HTMLElement): void {
  const common = matchesCommonFilters(entry);

  const isThinkingEntry = entry.classList.contains('thinking-entry');

  if (isThinkingEntry) {
    const matchesText = matchesTextFilter(entry.dataset.content || '', state.thinkingFilter);
    entry.style.display = (common && matchesText) ? '' : 'none';
  } else {
    // Tool entry
    const toolName = entry.dataset.toolName || '';
    const input = entry.dataset.input || '';
    const filter = state.toolsFilter.toLowerCase();
    const matchesText = !filter || toolName.includes(filter) || input.includes(filter);
    entry.style.display = (common && matchesText) ? '' : 'none';
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
  applySessionFilter(entry);
}

export function applyToolsFilter(entry: HTMLElement): void {
  applySessionFilter(entry);
}

export function filterAllThinking(): void {
  filterEntries(elements.thinkingContent, '.thinking-entry', (el) => {
    return matchesCommonFilters(el) &&
      matchesTextFilter(el.dataset.content || '', state.thinkingFilter);
  });

  // Show/hide clear button
  if (state.thinkingFilter) {
    elements.thinkingFilterClear.classList.remove('panel-filter-hidden');
  } else {
    elements.thinkingFilterClear.classList.add('panel-filter-hidden');
  }

  updateThinkingCount();
}

export function filterAllTools(): void {
  filterEntries(elements.toolsContent, '.tool-entry', (el) => {
    const filter = state.toolsFilter.toLowerCase();
    const toolName = el.dataset.toolName || '';
    const input = el.dataset.input || '';
    return matchesCommonFilters(el) && (!filter || toolName.includes(filter) || input.includes(filter));
  });

  // Show/hide clear button
  if (state.toolsFilter) {
    elements.toolsFilterClear.classList.remove('panel-filter-hidden');
  } else {
    elements.toolsFilterClear.classList.add('panel-filter-hidden');
  }

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
  const hasFilter = state.thinkingFilter || state.selectedSession !== 'all' || state.selectedAgentId;

  if (hasFilter) {
    const entries = elements.thinkingContent.querySelectorAll('.thinking-entry');
    let visibleCount = 0;
    entries.forEach((entry: Element) => {
      if ((entry as HTMLElement).style.display !== 'none') visibleCount++;
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
  const hasFilter = state.toolsFilter || state.selectedSession !== 'all' || state.selectedAgentId;

  if (hasFilter) {
    const entries = elements.toolsContent.querySelectorAll('.tool-entry');
    let visibleCount = 0;
    entries.forEach((entry: Element) => {
      if ((entry as HTMLElement).style.display !== 'none') visibleCount++;
    });
    elements.toolsCount.textContent = `${visibleCount}/${state.toolsCount}`;
  } else {
    elements.toolsCount.textContent = String(state.toolsCount);
  }
}
