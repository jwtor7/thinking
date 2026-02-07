/**
 * Agents View Handler
 *
 * Provides a dedicated view for browsing sub-agent thinking.
 * Sidebar lists all known agents (main + subagents) with status indicators.
 * Detail pane shows filtered thinking entries for the selected agent.
 */

import { state, subagentState } from '../state.ts';
import { elements } from '../ui/elements.ts';
import { escapeHtml } from '../utils/html.ts';
import { formatTime } from '../utils/formatting.ts';
import { getSessionDisplayName } from './sessions.ts';
import { updateTabBadge } from '../ui/views.ts';
import type { ThinkingEvent } from '../types.ts';

// ============================================
// State
// ============================================

/** Currently selected agent in the agents view */
let selectedViewAgent: string | null = null;

/** Per-agent thinking count */
const agentThinkingCounts: Map<string, number> = new Map();

/** Per-agent thinking entries (stored as HTML strings with metadata) */
interface AgentThinkingEntry {
  timestamp: string;
  content: string;
  sessionId: string;
}
const agentThinkingEntries: Map<string, AgentThinkingEntry[]> = new Map();

const MAX_ENTRIES_PER_AGENT = 200;

// ============================================
// Initialization
// ============================================

/**
 * Initialize the agents view.
 */
export function initAgentsView(): void {
  // Nothing to initialize with callbacks - this module is self-contained
}

// ============================================
// Agent List Rendering
// ============================================

/**
 * Render the agent list in the sidebar.
 * Shows "main" + all known subagents with status and thinking counts.
 */
export function renderAgentsList(): void {
  const sidebar = elements.agentsSidebar;
  if (!sidebar) return;

  const items: string[] = [];

  // "Main" entry - always present
  const mainCount = agentThinkingCounts.get('main') || 0;
  const mainSelected = selectedViewAgent === 'main';
  items.push(`
    <div class="agent-list-item${mainSelected ? ' selected' : ''}" data-agent-id="main">
      <span class="agent-list-dot running"></span>
      <span class="agent-list-name">main</span>
      <span class="agent-list-count">${mainCount}</span>
    </div>
  `);

  // Subagents grouped by session
  for (const [agentId, mapping] of subagentState.subagents) {
    const count = agentThinkingCounts.get(agentId) || 0;
    const isSelected = selectedViewAgent === agentId;
    const dotClass = mapping.status === 'running' ? 'running'
      : mapping.status === 'success' || mapping.status === 'failure' || mapping.status === 'cancelled' ? 'stopped'
      : 'idle';

    const session = state.sessions.get(mapping.parentSessionId);
    const sessionLabel = getSessionDisplayName(session?.workingDirectory, mapping.parentSessionId);

    items.push(`
      <div class="agent-list-item${isSelected ? ' selected' : ''}" data-agent-id="${escapeHtml(agentId)}" title="${escapeHtml(mapping.agentName)} (${escapeHtml(mapping.status)})\nSession: ${escapeHtml(sessionLabel)}">
        <span class="agent-list-dot ${dotClass}"></span>
        <span class="agent-list-name">${escapeHtml(mapping.agentName)}</span>
        <span class="agent-list-count">${count}</span>
      </div>
    `);
  }

  sidebar.innerHTML = items.join('');

  // Attach click handlers
  sidebar.querySelectorAll('.agent-list-item').forEach((item) => {
    item.addEventListener('click', () => {
      const agentId = (item as HTMLElement).dataset.agentId;
      if (agentId) {
        selectAgentInView(agentId);
      }
    });
  });
}

// ============================================
// Agent Selection
// ============================================

/**
 * Select an agent in the agents view.
 * Updates sidebar highlight and renders thinking entries in detail pane.
 */
export function selectAgentInView(agentId: string): void {
  selectedViewAgent = agentId;
  renderAgentsList();
  renderAgentDetail();
}

/**
 * Render the detail pane for the selected agent.
 * Shows thinking entries filtered to that agent.
 */
function renderAgentDetail(): void {
  const detail = elements.agentsDetail;
  if (!detail) return;

  if (!selectedViewAgent) {
    detail.innerHTML = `<div class="empty-state"><p>Select an agent to view its thinking</p></div>`;
    return;
  }

  const entries = agentThinkingEntries.get(selectedViewAgent) || [];

  if (entries.length === 0) {
    const agentName = selectedViewAgent === 'main' ? 'main' : (subagentState.subagents.get(selectedViewAgent)?.agentName || selectedViewAgent);
    detail.innerHTML = `<div class="empty-state"><p>No thinking entries for ${escapeHtml(agentName)}</p></div>`;
    return;
  }

  const html = entries.map(entry => {
    const time = formatTime(entry.timestamp);
    const preview = entry.content.slice(0, 80).replace(/\n/g, ' ');
    return `
      <div class="thinking-entry">
        <div class="thinking-entry-header">
          <span class="thinking-time">${escapeHtml(time)}</span>
          <span class="thinking-preview">${escapeHtml(preview)}...</span>
        </div>
        <div class="thinking-text">${escapeHtml(entry.content)}</div>
      </div>
    `;
  }).join('');

  detail.innerHTML = html;

  // Scroll to bottom
  detail.scrollTop = detail.scrollHeight;
}

// ============================================
// Event Integration
// ============================================

/**
 * Track a thinking event for the agents view.
 * Called from the dispatcher after handleThinking.
 */
export function addAgentThinking(event: ThinkingEvent): void {
  // Determine which agent this belongs to
  const eventAgentId = event.agentId;
  let agentId = eventAgentId || 'main';

  // If no explicit agentId, check if there's a subagent context for this session
  if (!eventAgentId && event.sessionId) {
    // Default to main for this session
    agentId = 'main';
  }

  // Increment count
  agentThinkingCounts.set(agentId, (agentThinkingCounts.get(agentId) || 0) + 1);

  // Store entry
  let entries = agentThinkingEntries.get(agentId);
  if (!entries) {
    entries = [];
    agentThinkingEntries.set(agentId, entries);
  }
  entries.push({
    timestamp: event.timestamp,
    content: event.content,
    sessionId: event.sessionId || '',
  });

  // Trim old entries
  while (entries.length > MAX_ENTRIES_PER_AGENT) {
    entries.shift();
  }

  // Update total badge
  const totalCount = Array.from(agentThinkingCounts.values()).reduce((a, b) => a + b, 0);
  updateTabBadge('agents', totalCount);

  // Re-render if this agent is currently selected
  if (selectedViewAgent === agentId) {
    renderAgentDetail();
  }

  // Update sidebar counts
  renderAgentsList();
}

/**
 * Reset agents view state (called from clearAllPanels).
 */
export function resetAgentsView(): void {
  selectedViewAgent = null;
  agentThinkingCounts.clear();
  agentThinkingEntries.clear();
  renderAgentsList();

  const detail = elements.agentsDetail;
  if (detail) {
    detail.innerHTML = `<div class="empty-state"><p>Select an agent to view its thinking</p></div>`;
  }
}
