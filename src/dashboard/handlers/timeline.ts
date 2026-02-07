/**
 * Timeline handler for the Thinking Monitor Dashboard.
 *
 * Provides a unified chronological view of all events across panels.
 */

import { state } from '../state.ts';
import { elements } from '../ui/elements.ts';
import { formatTime, shortenToolName } from '../utils/formatting.ts';
import { escapeHtml, escapeCssValue } from '../utils/html.ts';
import { getAgentBadgeColors } from '../ui/colors.ts';
import type { StrictMonitorEvent } from '../../shared/types.ts';

// ============================================
// Constants
// ============================================

const MAX_TIMELINE_ENTRIES = 500;


/** Type icons mapping */
const TYPE_ICONS: Record<string, string> = {
  thinking: '&#129504;',      // brain
  tool_start: '&#128295;',    // wrench
  tool_end: '&#128295;',      // wrench
  hook_execution: '&#9881;',  // gear
  agent_start: '&#129302;',   // robot
  agent_stop: '&#129302;',    // robot
  session_start: '&#128225;', // satellite
  session_stop: '&#128225;',  // satellite
  team_update: '&#128101;',   // people
  task_update: '&#128203;',   // clipboard
  task_completed: '&#9989;',  // check
  message_sent: '&#128172;',  // speech
  teammate_idle: '&#128164;', // zzz
  plan_update: '&#128196;',   // document
  plan_delete: '&#128196;',   // document
  plan_list: '&#128196;',     // document
  connection_status: '&#128268;',  // plug
  subagent_mapping: '&#128279;',   // link
};

/** Timeline category definitions for filter chips */
const TIMELINE_CATEGORIES: Record<string, { label: string; types: string[]; color: string; icon: string }> = {
  thinking: { label: 'Thinking', types: ['thinking'], color: 'var(--color-accent-blue)', icon: '&#129504;' },
  tools: { label: 'Tools', types: ['tool_start', 'tool_end'], color: 'var(--color-accent-green)', icon: '&#128295;' },
  hooks: { label: 'Hooks', types: ['hook_execution'], color: 'var(--color-accent-yellow)', icon: '&#9881;' },
  agents: { label: 'Agents', types: ['agent_start', 'agent_stop'], color: 'var(--color-accent-purple)', icon: '&#129302;' },
  team: { label: 'Team', types: ['team_update', 'task_update', 'task_completed', 'message_sent', 'teammate_idle'], color: 'var(--color-accent-orange)', icon: '&#128101;' },
  plans: { label: 'Plans', types: ['plan_update', 'plan_delete'], color: 'var(--color-text-muted)', icon: '&#128196;' },
};

/** Reverse lookup: event type -> category */
const TYPE_TO_CATEGORY: Record<string, string> = {};
for (const [cat, def] of Object.entries(TIMELINE_CATEGORIES)) {
  for (const t of def.types) {
    TYPE_TO_CATEGORY[t] = cat;
  }
}

/** Category filter state (all active by default) */
const typeFilterState: Map<string, boolean> = new Map();

/** Category event counts */
const typeCounts: Map<string, number> = new Map();

/** Chip button elements for count updates */
const chipElements: Map<string, HTMLElement> = new Map();

const STORAGE_KEY = 'tm-timeline-type-filter';

// ============================================
// Callback Interface
// ============================================

export interface TimelineCallbacks {
  appendAndTrim: (container: HTMLElement, element: HTMLElement) => void;
  smartScroll: (container: HTMLElement) => void;
}

let callbacks: TimelineCallbacks | null = null;
let timelineCount = 0;

/**
 * Initialize the timeline handler with required callbacks.
 */
export function initTimeline(cbs: TimelineCallbacks): void {
  callbacks = cbs;
  initTimelineFilter();
  initTypeChips();
}

/**
 * Set up the timeline filter input event listeners.
 */
function initTimelineFilter(): void {
  const filterInput = elements.timelineFilter;
  const clearBtn = elements.timelineFilterClear;

  if (filterInput) {
    filterInput.addEventListener('input', () => {
      state.timelineFilter = filterInput.value.toLowerCase();
      applyTimelineFilter();
      if (clearBtn) {
        clearBtn.classList.toggle('panel-filter-hidden', !filterInput.value);
      }
    });
  }

  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      if (filterInput) {
        filterInput.value = '';
        state.timelineFilter = '';
        applyTimelineFilter();
        clearBtn.classList.add('panel-filter-hidden');
      }
    });
  }
}

/**
 * Initialize timeline type filter chips.
 */
function initTypeChips(): void {
  const container = elements.timelineTypeChips;
  if (!container) return;

  // Load saved state
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      for (const [cat, enabled] of Object.entries(parsed)) {
        typeFilterState.set(cat, enabled as boolean);
      }
    }
  } catch { /* ignore */ }

  // Initialize defaults and counts
  for (const cat of Object.keys(TIMELINE_CATEGORIES)) {
    if (!typeFilterState.has(cat)) typeFilterState.set(cat, true);
    typeCounts.set(cat, 0);
  }

  // Create chip buttons
  for (const [cat, def] of Object.entries(TIMELINE_CATEGORIES)) {
    const chip = document.createElement('button');
    chip.className = 'timeline-chip' + (typeFilterState.get(cat) ? ' active' : '');
    chip.dataset.category = cat;
    if (typeFilterState.get(cat)) {
      chip.style.background = def.color;
    }
    chip.innerHTML = `${def.icon} ${def.label} <span class="chip-count">0</span>`;
    chip.addEventListener('click', () => {
      const current = typeFilterState.get(cat) ?? true;
      typeFilterState.set(cat, !current);
      chip.classList.toggle('active', !current);
      chip.style.background = !current ? def.color : '';
      saveTypeFilterState();
      applyTimelineFilter();
    });
    container.appendChild(chip);
    chipElements.set(cat, chip);
  }
}

function saveTypeFilterState(): void {
  try {
    const obj: Record<string, boolean> = {};
    for (const [cat, enabled] of typeFilterState) {
      obj[cat] = enabled;
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(obj));
  } catch { /* ignore */ }
}

/**
 * Reset type chip counts and filter state (called from clearAllPanels).
 */
export function resetTypeChips(): void {
  for (const cat of Object.keys(TIMELINE_CATEGORIES)) {
    typeCounts.set(cat, 0);
    typeFilterState.set(cat, true);
    const chip = chipElements.get(cat);
    if (chip) {
      chip.classList.add('active');
      chip.style.background = TIMELINE_CATEGORIES[cat].color;
      const countEl = chip.querySelector('.chip-count');
      if (countEl) countEl.textContent = '0';
    }
  }
  saveTypeFilterState();
}

/**
 * Apply the current timeline filter to all entries.
 * Always re-evaluates all three filter criteria (text, type, session)
 * for every entry to ensure toggling any filter correctly shows/hides entries.
 */
export function applyTimelineFilter(): void {
  const container = elements.timelineEntries;
  if (!container) return;

  const filter = state.timelineFilter;
  let visible = 0;

  for (const child of Array.from(container.children)) {
    const el = child as HTMLElement;
    if (!el.dataset.filterText) continue;

    const matchesText = !filter || el.dataset.filterText.includes(filter);
    const elCategory = el.dataset.category || '';
    const matchesType = !elCategory || typeFilterState.get(elCategory) !== false;
    const matchesSession = state.selectedSession === 'all'
      || !el.dataset.session
      || el.dataset.session === state.selectedSession;

    if (matchesText && matchesType && matchesSession) {
      el.style.display = '';
      visible++;
    } else {
      el.style.display = 'none';
    }
  }

  if (elements.timelineCount) {
    const anyTypeDisabled = Array.from(typeFilterState.values()).some(v => !v);
    const hasActiveFilter = !!filter || anyTypeDisabled || state.selectedSession !== 'all';
    elements.timelineCount.textContent = hasActiveFilter
      ? `${visible}/${timelineCount}`
      : String(timelineCount);
  }
}

/**
 * Get a one-line summary for a timeline entry based on event type.
 */
function getEventSummary(event: StrictMonitorEvent): string {
  switch (event.type) {
    case 'thinking':
      return event.content.slice(0, 60).replace(/\n/g, ' ') + (event.content.length > 60 ? '...' : '');
    case 'tool_start':
      return `${shortenToolName(event.toolName)} started` + (event.input ? ': ' + event.input.slice(0, 40) : '');
    case 'tool_end':
      return `${shortenToolName(event.toolName)} completed` + (event.durationMs ? ` (${event.durationMs}ms)` : '');
    case 'hook_execution':
      return `${event.hookType}` + (event.toolName ? ` \u2192 ${shortenToolName(event.toolName)}` : '') + (event.decision ? ` [${event.decision}]` : '');
    case 'agent_start':
      return `Agent started: ${event.agentName || event.agentId}`;
    case 'agent_stop':
      return `Agent stopped: ${event.agentId} (${event.status || 'unknown'})`;
    case 'session_start':
      return `Session started` + (event.workingDirectory ? `: ${event.workingDirectory}` : '');
    case 'session_stop':
      return `Session stopped`;
    case 'team_update':
      return `Team ${event.teamName}: ${event.members.length} members`;
    case 'task_update':
      return `Tasks updated: ${event.tasks.length} tasks`;
    case 'task_completed':
      return `Task completed: ${event.taskSubject}`;
    case 'message_sent':
      return `${event.sender} \u2192 ${event.recipient}: ${event.summary || ''}`;
    case 'teammate_idle':
      return `${event.teammateName} went idle`;
    case 'plan_update':
      return `Plan updated: ${event.filename}`;
    case 'plan_delete':
      return `Plan deleted: ${event.filename}`;
    case 'plan_list':
      return `${event.plans.length} plan(s) available`;
    case 'connection_status':
      return `Server ${event.status} (v${event.serverVersion})`;
    case 'subagent_mapping':
      return `${event.mappings.length} subagent mapping(s)`;
    default:
      return 'Unknown event';
  }
}

/**
 * Get the current timeline entry count.
 */
export function getTimelineCount(): number {
  return timelineCount;
}

/**
 * Add a timeline entry for an event.
 */
export function addTimelineEntry(event: StrictMonitorEvent): void {
  if (!callbacks) return;

  const entriesContainer = elements.timelineEntries;
  if (!entriesContainer) return;

  // Skip internal/noisy events
  if (event.type === 'connection_status' || event.type === 'subagent_mapping' || event.type === 'plan_list') {
    return;
  }

  // Clear empty state if present
  const emptyState = entriesContainer.querySelector('.empty-state');
  if (emptyState) {
    emptyState.remove();
  }

  timelineCount++;

  // Track category count and update chip
  const category = TYPE_TO_CATEGORY[event.type] || '';
  if (category) {
    typeCounts.set(category, (typeCounts.get(category) || 0) + 1);
    const chip = chipElements.get(category);
    if (chip) {
      const countEl = chip.querySelector('.chip-count');
      if (countEl) countEl.textContent = String(typeCounts.get(category));
    }
  }

  // Update badge count
  if (elements.timelineCount) {
    elements.timelineCount.textContent = String(timelineCount);
  }

  const time = formatTime(event.timestamp);
  const icon = TYPE_ICONS[event.type] || '&#9679;';
  const summary = getEventSummary(event);
  const agentId = event.agentId || 'main';
  const agentBadgeColors = getAgentBadgeColors(agentId === 'main' ? 'main' : agentId);
  const agentLabel = agentId === 'main' ? 'main' : (agentId.length > 12 ? agentId.slice(0, 12) : agentId);

  // Type class for color coding
  const typeClass = event.type.replace(/_/g, '-');

  // Build filter text for search (lowercase for case-insensitive matching)
  const typeLabel = event.type.replace(/_/g, ' ');
  const filterText = `${typeLabel} ${summary} ${agentLabel}`.toLowerCase();

  const entry = document.createElement('div');
  entry.className = `timeline-entry timeline-${typeClass} new`;
  entry.dataset.timestamp = String(Date.now());
  entry.dataset.type = event.type;
  entry.dataset.session = event.sessionId || '';
  entry.dataset.filterText = filterText;
  entry.dataset.category = category;

  entry.innerHTML = `
    <span class="timeline-icon">${icon}</span>
    <span class="timeline-time">${escapeHtml(time)}</span>
    <span class="timeline-type">${escapeHtml(typeLabel)}</span>
    <span class="timeline-summary">${escapeHtml(summary)}</span>
    <span class="timeline-agent" style="background: ${escapeCssValue(agentBadgeColors.bg)}; color: ${escapeCssValue(agentBadgeColors.text)}">${escapeHtml(agentLabel)}</span>
  `;

  // Apply session filter
  if (state.selectedSession !== 'all' && event.sessionId && event.sessionId !== state.selectedSession) {
    entry.style.display = 'none';
  }

  // Apply text filter
  if (state.timelineFilter && !filterText.includes(state.timelineFilter)) {
    entry.style.display = 'none';
  }

  // Apply type filter
  if (category && typeFilterState.get(category) === false) {
    entry.style.display = 'none';
  }

  // Trim old entries if over limit
  const children = entriesContainer.children;
  while (children.length >= MAX_TIMELINE_ENTRIES) {
    children[0].remove();
  }

  entriesContainer.appendChild(entry);
  callbacks.smartScroll(entriesContainer);

  // Remove 'new' class after animation
  setTimeout(() => entry.classList.remove('new'), 1000);
}
