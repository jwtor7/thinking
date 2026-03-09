/**
 * Unified Filter Service
 *
 * Centralizes session matching logic (including subagent parent resolution),
 * agent filtering, and text filtering. Panels compose on top for panel-specific
 * filters (hook type, timeline category, etc.).
 */

import { state, subagentState } from '../state.ts';

/**
 * Check if an entry's session matches the current session filter.
 *
 * Handles three matching strategies:
 * 1. Direct session match
 * 2. Parent session match (via data-parent-session attribute)
 * 3. Subagent lookup (checks if entry's agent belongs to selected session)
 */
export function matchesSessionFilter(
  entrySession: string,
  parentSession?: string,
  agentId?: string,
): boolean {
  if (state.selectedSession === 'all') return true;

  // Direct match
  if (entrySession === state.selectedSession) return true;

  // Parent session match
  if (parentSession && parentSession === state.selectedSession) return true;

  // Subagent parent resolution
  if (agentId) {
    const subagent = subagentState.subagents.get(agentId);
    if (subagent && subagent.parentSessionId === state.selectedSession) return true;
  }

  return false;
}

/**
 * Check if an entry matches the per-agent filter.
 * When selectedAgentId is set, only show events from that agent.
 */
export function matchesAgentFilter(agentId?: string): boolean {
  if (!state.selectedAgentId) return true;
  return (agentId || '') === state.selectedAgentId;
}

/**
 * Check if text content matches a filter string (case-insensitive).
 */
export function matchesTextFilter(content: string, filter: string): boolean {
  if (!filter) return true;
  return content.includes(filter.toLowerCase());
}

/**
 * Extract filter-relevant data attributes from a DOM element.
 */
export function getEntryFilterData(el: HTMLElement): {
  session: string;
  parentSession: string;
  agent: string;
} {
  return {
    session: el.dataset.session || '',
    parentSession: el.dataset.parentSession || '',
    agent: el.dataset.agent || '',
  };
}

/**
 * Check if a DOM entry matches session + agent filters.
 * This is the common filter applied to all panel entries.
 */
export function matchesCommonFilters(el: HTMLElement): boolean {
  const data = getEntryFilterData(el);
  return (
    matchesSessionFilter(data.session, data.parentSession, data.agent) &&
    matchesAgentFilter(data.agent)
  );
}
