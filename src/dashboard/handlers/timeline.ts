/**
 * Timeline handler for the Thinking Monitor Dashboard.
 *
 * Provides a unified chronological view of all events across panels.
 */

import { state, subagentState, teamState, ALL_SESSIONS } from '../state.ts';
import { elements } from '../ui/elements.ts';
import { formatTime, shortenToolName, summarizeInput } from '../utils/formatting.ts';
import { escapeHtml, escapeCssValue } from '../utils/html.ts';
import { getAgentBadgeColors } from '../ui/colors.ts';
import { getSessionDisplayName, getSessionFolderName, resolveSessionId } from './sessions.ts';
import { selectView } from '../ui/views.ts';
import type { StrictMonitorEvent } from '../../shared/types.ts';

// ============================================
// Constants
// ============================================

const MAX_TIMELINE_ENTRIES = 500;


/** Concise display labels for timeline type badges (must fit ~100px at 10px uppercase) */
const TYPE_LABELS: Record<string, string> = {
  thinking: 'thinking',
  tool_start: 'tool start',
  tool_end: 'tool end',
  hook_execution: 'hook',
  agent_start: 'agent start',
  agent_stop: 'agent stop',
  session_start: 'session',
  session_stop: 'session',
  team_update: 'team',
  task_update: 'task',
  task_completed: 'task done',
  message_sent: 'message',
  teammate_idle: 'idle',
  plan_update: 'plan',
  plan_delete: 'plan',
  plan_list: 'plan',
  connection_status: 'connection',
  subagent_mapping: 'subagent',
};

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
  agents: { label: 'Agents', types: ['agent_start', 'agent_stop', 'session_start', 'session_stop'], color: 'var(--color-accent-purple)', icon: '&#129302;' },
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
const SESSION_STORAGE_KEY = 'tm-timeline-session-filter';

/** Session filter state: sessionId → enabled. All disabled by default (user opts in). */
const sessionFilterState: Map<string, boolean> = new Map();

/** Session event counts for chip badges */
const sessionCounts: Map<string, number> = new Map();

/** Session chip elements for count updates */
const sessionChipElements: Map<string, HTMLElement> = new Map();

// ============================================
// Callback Interface
// ============================================

export interface TimelineCallbacks {
  appendAndTrim: (container: HTMLElement, element: HTMLElement) => void;
  smartScroll: (container: HTMLElement) => void;
  selectSession: (sessionId: string) => void;
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
  loadSessionFilterState();
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

  // If all categories are disabled (unintentional state), reset to all enabled
  const allDisabled = Array.from(typeFilterState.values()).every(v => !v);
  if (allDisabled) {
    for (const cat of Object.keys(TIMELINE_CATEGORIES)) {
      typeFilterState.set(cat, true);
    }
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
  resetSessionChips();
}

// ============================================
// Session Filter Chips
// ============================================

/**
 * Load session filter state from localStorage.
 */
function loadSessionFilterState(): void {
  try {
    const saved = localStorage.getItem(SESSION_STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      for (const [id, enabled] of Object.entries(parsed)) {
        sessionFilterState.set(id, enabled as boolean);
      }
    }
  } catch { /* ignore */ }
}

function saveSessionFilterState(): void {
  try {
    const obj: Record<string, boolean> = {};
    for (const [id, enabled] of sessionFilterState) {
      obj[id] = enabled;
    }
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(obj));
  } catch { /* ignore */ }
}

/**
 * Merge stale/alias chips (short IDs or folder names) into a canonical session chip.
 * This keeps timeline chips stable when richer session metadata arrives later.
 */
function mergeSessionAliases(canonicalSessionId: string, displayLabel: string): void {
  const aliasIds = Array.from(sessionChipElements.keys()).filter((candidateId) => {
    if (candidateId === canonicalSessionId) return false;

    const candidateSession = state.sessions.get(candidateId);
    const looksLikeAlias = !candidateSession?.workingDirectory;
    if (!looksLikeAlias) return false;

    return candidateId === displayLabel
      || canonicalSessionId.startsWith(candidateId)
      || candidateId.startsWith(canonicalSessionId);
  });

  if (aliasIds.length === 0) return;

  for (const aliasId of aliasIds) {
    const aliasChip = sessionChipElements.get(aliasId);
    if (aliasChip) {
      aliasChip.remove();
    }
    sessionChipElements.delete(aliasId);

    const aliasCount = sessionCounts.get(aliasId) || 0;
    if (aliasCount > 0) {
      sessionCounts.set(canonicalSessionId, (sessionCounts.get(canonicalSessionId) || 0) + aliasCount);
    }
    sessionCounts.delete(aliasId);

    const aliasEnabled = sessionFilterState.get(aliasId) === true;
    if (aliasEnabled) {
      sessionFilterState.set(canonicalSessionId, true);
    }
    sessionFilterState.delete(aliasId);

    const entriesContainer = elements.timelineEntries;
    if (entriesContainer) {
      for (const child of Array.from(entriesContainer.children)) {
        const el = child as HTMLElement;
        if (el.dataset.session === aliasId) {
          el.dataset.session = canonicalSessionId;
        }
      }
    }
  }

  saveSessionFilterState();
}

/**
 * Add or update a session chip when a new session appears.
 * Chips start disabled (user opts in to see session events).
 */
function addOrUpdateSessionChip(sessionId: string): void {
  const container = elements.timelineSessionChips;
  if (!container) return;

  const session = state.sessions.get(sessionId);
  const label = getSessionDisplayName(session?.workingDirectory, sessionId);
  mergeSessionAliases(sessionId, label);

  // Already exists - update count and label (label may have been UUID, now resolved to project name)
  if (sessionChipElements.has(sessionId)) {
    const chip = sessionChipElements.get(sessionId)!;
    const color = session?.color || 'var(--color-text-muted)';

    // Update chip label if it has changed (preserving the count span)
    const countEl = chip.querySelector('.chip-count');
    const currentCount = String(sessionCounts.get(sessionId) || 0);
    if (countEl) {
      countEl.textContent = currentCount;
      // Update the text node before the span with the new label
      chip.childNodes[0].textContent = label + ' ';
    }

    // Update color if active
    const isActive = sessionFilterState.get(sessionId) ?? false;
    if (isActive) {
      chip.style.background = color;
    }
    chip.title = `Session: ${sessionId}`;
    return;
  }

  // Load saved state or default to disabled
  if (!sessionFilterState.has(sessionId)) {
    sessionFilterState.set(sessionId, false);
  }

  const color = session?.color || 'var(--color-text-muted)';
  const isActive = sessionFilterState.get(sessionId) ?? false;

  const chip = document.createElement('button');
  chip.className = 'timeline-chip timeline-session-chip' + (isActive ? ' active' : '');
  chip.dataset.sessionId = sessionId;
  if (isActive) {
    chip.style.background = color;
  }
  chip.title = `Session: ${sessionId}`;
  chip.innerHTML = `${escapeHtml(label)} <span class="chip-count">${sessionCounts.get(sessionId) || 0}</span>`;

  chip.addEventListener('click', () => {
    const current = sessionFilterState.get(sessionId) ?? false;
    sessionFilterState.set(sessionId, !current);
    chip.classList.toggle('active', !current);
    chip.style.background = !current ? color : '';
    saveSessionFilterState();
    applyTimelineFilter();
  });

  container.appendChild(chip);
  sessionChipElements.set(sessionId, chip);
}

/**
 * Reset session chips (called from clearAllPanels).
 */
function resetSessionChips(): void {
  sessionFilterState.clear();
  sessionCounts.clear();
  sessionChipElements.clear();
  const container = elements.timelineSessionChips;
  if (container) container.innerHTML = '';
  try { localStorage.removeItem(SESSION_STORAGE_KEY); } catch { /* ignore */ }
}

/**
 * Refresh session chips when new sessions appear.
 * Called from sessions.ts.
 */
export function refreshSessionChips(): void {
  for (const sessionId of state.sessions.keys()) {
    addOrUpdateSessionChip(sessionId);
  }
}

/**
 * Find the sole active session (or undefined if none/ambiguous).
 */
function getSingleActiveSessionId(): string | undefined {
  const activeSessions = Array.from(state.sessions.values()).filter((session) => session.active);
  if (activeSessions.length === 1) {
    return activeSessions[0].id;
  }
  return undefined;
}

/**
 * Best-effort default session fallback for events without explicit session IDs.
 */
function getDefaultTimelineSessionId(): string | undefined {
  if (state.selectedSession !== ALL_SESSIONS && state.sessions.has(state.selectedSession)) {
    return state.selectedSession;
  }

  const soleActive = getSingleActiveSessionId();
  if (soleActive) {
    return soleActive;
  }

  if (state.currentSessionId && state.sessions.has(state.currentSessionId)) {
    return state.currentSessionId;
  }

  if (state.sessions.size === 1) {
    return state.sessions.keys().next().value;
  }

  return undefined;
}

/**
 * Resolve a session from a plan path using known session-plan associations.
 */
function resolveSessionFromPlanPath(planPath?: string): string | undefined {
  if (!planPath) return undefined;

  const normalizedPlanPath = planPath.replace(/\\/g, '/');
  const planFilename = normalizedPlanPath.split('/').pop();

  for (const [sessionId, assocPath] of state.sessionPlanMap) {
    const normalizedAssocPath = assocPath.replace(/\\/g, '/');
    const assocFilename = normalizedAssocPath.split('/').pop();

    const matches = normalizedAssocPath === normalizedPlanPath
      || normalizedAssocPath.endsWith(normalizedPlanPath)
      || normalizedPlanPath.endsWith(normalizedAssocPath)
      || (!!planFilename && planFilename === assocFilename);

    if (matches) {
      return resolveSessionId(sessionId);
    }
  }

  return undefined;
}

/**
 * Resolve a session from team/task identifiers.
 */
function resolveSessionFromTeamKey(teamKey?: string): string | undefined {
  const normalizedKey = teamKey?.trim();
  if (!normalizedKey) return undefined;

  const directMapped = teamState.teamSessionMap.get(normalizedKey);
  if (directMapped) {
    return resolveSessionId(directMapped);
  }

  // Match team/task key to session folder name (common project-level convention).
  const folderMatches = Array.from(state.sessions.values())
    .filter((session) => getSessionFolderName(session.workingDirectory) === normalizedKey)
    .map((session) => session.id);
  if (folderMatches.length === 1) {
    return folderMatches[0];
  }

  // If all known teams map to one session, use it as a conservative fallback.
  const mappedSessions = Array.from(new Set(
    Array.from(teamState.teamSessionMap.values())
      .map((sessionId) => resolveSessionId(sessionId))
      .filter((sessionId): sessionId is string => !!sessionId)
  ));
  if (mappedSessions.length === 1) {
    return mappedSessions[0];
  }

  return undefined;
}

/**
 * Resolve the best session ID for timeline rendering/filtering.
 */
function resolveEventSessionId(event: StrictMonitorEvent): string | undefined {
  // Trust explicit session IDs first, but normalize aliases to known IDs when possible.
  const explicitSessionId = resolveSessionId(event.sessionId);
  if (explicitSessionId) {
    return explicitSessionId;
  }

  switch (event.type) {
    case 'plan_update':
    case 'plan_delete':
      return resolveSessionFromPlanPath(event.path) || getDefaultTimelineSessionId();
    case 'team_update':
      return resolveSessionFromTeamKey(event.teamName) || getDefaultTimelineSessionId();
    case 'task_update':
      return resolveSessionFromTeamKey(event.teamId) || getDefaultTimelineSessionId();
    case 'task_completed':
      return resolveSessionFromTeamKey(event.teamId) || getDefaultTimelineSessionId();
    case 'teammate_idle':
      return resolveSessionFromTeamKey(event.teamName) || getDefaultTimelineSessionId();
    default:
      return getDefaultTimelineSessionId();
  }
}

/**
 * Label fallback for non-session-scoped events when we can't resolve a session.
 */
function getEventContextLabel(event: StrictMonitorEvent): string | undefined {
  switch (event.type) {
    case 'team_update':
      return event.teamName;
    case 'task_update':
      return event.teamId;
    case 'task_completed':
      return event.teamId || event.taskSubject;
    case 'teammate_idle':
      return event.teamName || event.teammateName;
    default:
      return undefined;
  }
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
  const contextTypeCounts: Map<string, number> = new Map();
  for (const cat of Object.keys(TIMELINE_CATEGORIES)) {
    contextTypeCounts.set(cat, 0);
  }

  const anySessionChipActive = Array.from(sessionFilterState.values()).some(v => v);
  const hasContextFilter = !!filter || anySessionChipActive || state.selectedSession !== ALL_SESSIONS;

  for (const child of Array.from(container.children)) {
    const el = child as HTMLElement;
    if (!el.dataset.filterText) continue;

    const matchesText = !filter || el.dataset.filterText.includes(filter);
    const elCategory = el.dataset.category || '';
    const matchesType = !elCategory || typeFilterState.get(elCategory) !== false;

    // Session filtering: global session selector + session chip filter
    let matchesSession: boolean;
    if (anySessionChipActive) {
      // When session chips are active, they override global session selector for timeline
      matchesSession = !el.dataset.session || sessionFilterState.get(el.dataset.session) === true;
    } else {
      // No chips active: fall back to global session selector
      matchesSession = state.selectedSession === ALL_SESSIONS
        || !el.dataset.session
        || el.dataset.session === state.selectedSession;
    }

    const matchesContext = matchesText && matchesSession;
    if (matchesContext && elCategory) {
      contextTypeCounts.set(elCategory, (contextTypeCounts.get(elCategory) || 0) + 1);
    }

    if (matchesContext && matchesType) {
      el.style.display = '';
      visible++;
    } else {
      el.style.display = 'none';
    }
  }

  if (elements.timelineCount) {
    const anyTypeDisabled = Array.from(typeFilterState.values()).some(v => !v);
    const anySessionChipEnabled = Array.from(sessionFilterState.values()).some(v => v);
    const hasActiveFilter = !!filter || anyTypeDisabled || anySessionChipEnabled || state.selectedSession !== ALL_SESSIONS;
    elements.timelineCount.textContent = hasActiveFilter
      ? `${visible}/${timelineCount}`
      : String(timelineCount);

    // Indicate when session chips are overriding global session selector
    if (anySessionChipEnabled) {
      elements.timelineCount.title = 'Filtered by session chips (overrides dropdown)';
    } else {
      elements.timelineCount.title = '';
    }
  }

  // Type chips show contextual counts when text/session filters are active.
  for (const [cat, chip] of chipElements) {
    const countEl = chip.querySelector('.chip-count');
    if (!countEl) continue;

    const total = typeCounts.get(cat) || 0;
    const contextual = contextTypeCounts.get(cat) || 0;
    countEl.textContent = String(hasContextFilter ? contextual : total);

    const categoryLabel = TIMELINE_CATEGORIES[cat]?.label || cat;
    chip.title = hasContextFilter
      ? `${categoryLabel}: ${contextual} shown (${total} total)`
      : `${categoryLabel}: ${total}`;
  }
}

/**
 * Get a one-line summary for a timeline entry based on event type.
 */
function getEventSummary(event: StrictMonitorEvent): string {
  switch (event.type) {
    case 'thinking':
      return event.content.slice(0, 60).replace(/\n/g, ' ') + (event.content.length > 60 ? '...' : '');
    case 'tool_start': {
      const inputPreview = summarizeInput(event.input, event.toolName);
      return `${shortenToolName(event.toolName)} started` + (inputPreview ? ': ' + inputPreview : '');
    }
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

  // Resolve session ID with aliases + no-session fallbacks.
  const resolvedSessionId = resolveEventSessionId(event);

  // Track per-session count and update/create session chip
  if (resolvedSessionId) {
    sessionCounts.set(resolvedSessionId, (sessionCounts.get(resolvedSessionId) || 0) + 1);
    addOrUpdateSessionChip(resolvedSessionId);
  }

  // Update badge count
  if (elements.timelineCount) {
    elements.timelineCount.textContent = String(timelineCount);
  }

  const time = formatTime(event.timestamp);
  const icon = TYPE_ICONS[event.type] || '&#9679;';
  const summary = getEventSummary(event);
  const agentId = event.agentId || 'main';

  // Resolve agent label: use session folder name for "main", agent name for subagents
  let agentLabel: string;
  let agentTooltip: string;
  if (agentId === 'main') {
    const session = resolvedSessionId ? state.sessions.get(resolvedSessionId) : undefined;
    const contextLabel = getEventContextLabel(event);
    if (session || resolvedSessionId) {
      agentLabel = getSessionDisplayName(session?.workingDirectory, resolvedSessionId);
      agentTooltip = session?.workingDirectory
        ? `${session.workingDirectory}\nSession: ${resolvedSessionId || ''}`
        : `Session: ${resolvedSessionId || ''}`;
    } else if (contextLabel) {
      agentLabel = contextLabel;
      agentTooltip = `Context: ${contextLabel}`;
    } else {
      agentLabel = 'unknown';
      agentTooltip = 'Session: unknown';
    }
  } else {
    const subagent = subagentState.subagents.get(agentId);
    agentLabel = subagent?.agentName || (agentId.length > 12 ? agentId.slice(0, 12) + '...' : agentId);
    agentTooltip = `Agent: ${subagent?.agentName || agentId}\nStatus: ${subagent?.status || 'unknown'}\nSession: ${resolvedSessionId || ''}`;
  }
  const agentBadgeColors = getAgentBadgeColors(agentId === 'main' ? agentLabel : agentId);

  // Type class for color coding
  const typeClass = event.type.replace(/_/g, '-');

  // Build filter text for search (lowercase for case-insensitive matching)
  const typeLabel = TYPE_LABELS[event.type] || event.type.replace(/_/g, ' ');
  const typeFull = event.type.replace(/_/g, ' ');
  const filterText = `${typeFull} ${summary} ${agentLabel}`.toLowerCase();

  const entry = document.createElement('div');
  entry.className = `timeline-entry timeline-${typeClass} new`;
  entry.dataset.timestamp = String(Date.now());
  entry.dataset.type = event.type;
  entry.dataset.session = resolvedSessionId || '';
  entry.dataset.filterText = filterText;
  entry.dataset.category = category;

  // Store source timestamp for thinking click navigation
  if (event.type === 'thinking') {
    entry.dataset.sourceTimestamp = event.timestamp;
    entry.style.cursor = 'pointer';
  }

  entry.innerHTML = `
    <span class="timeline-icon">${icon}</span>
    <span class="timeline-time">${escapeHtml(time)}</span>
    <span class="timeline-type" title="${escapeHtml(typeFull)}">${escapeHtml(typeLabel)}</span>
    <span class="timeline-summary">${escapeHtml(summary)}</span>
    <span class="timeline-agent" style="background: ${escapeCssValue(agentBadgeColors.bg)}; color: ${escapeCssValue(agentBadgeColors.text)}" title="${escapeHtml(agentTooltip)}">${escapeHtml(agentLabel)}</span>
  `;

  // Click handler for thinking entries: navigate to thinking view and scroll to entry
  if (event.type === 'thinking') {
    entry.addEventListener('click', () => {
      navigateToThinkingEntry(event.timestamp, resolvedSessionId);
    });
  }

  // Trim old entries if over limit - protect thinking entries
  const children = entriesContainer.children;
  while (children.length >= MAX_TIMELINE_ENTRIES) {
    // Find first non-thinking entry to remove
    let removed = false;
    for (let i = 0; i < children.length; i++) {
      const child = children[i] as HTMLElement;
      if (child.dataset.type !== 'thinking') {
        child.remove();
        removed = true;
        break;
      }
    }
    // If all entries are thinking (unlikely), remove the oldest
    if (!removed) {
      children[0].remove();
    }
  }

  entriesContainer.appendChild(entry);
  applyTimelineFilter();
  callbacks.smartScroll(entriesContainer);

  // Remove 'new' class after animation
  setTimeout(() => entry.classList.remove('new'), 1000);
}

/**
 * Navigate from a timeline thinking entry to the corresponding entry in the Thinking view.
 * Switches to Thinking view, finds the matching entry by timestamp, scrolls to it, and highlights.
 */
function navigateToThinkingEntry(eventTimestamp: string, sessionId?: string): void {
  // Match the timeline selection context in the thinking pane.
  if (sessionId && callbacks) {
    callbacks.selectSession(sessionId);
  }

  // Switch to thinking view
  selectView('thinking');

  // Find the matching thinking entry by event timestamp
  const thinkingContent = elements.thinkingContent;
  if (!thinkingContent) return;

  const scrollToEntry = (): boolean => {
    const entries = Array.from(thinkingContent.querySelectorAll('.thinking-entry'));
    for (const entry of entries) {
      const el = entry as HTMLElement;
      if (el.dataset.eventTimestamp === eventTimestamp) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.classList.add('highlight-flash');
        setTimeout(() => el.classList.remove('highlight-flash'), 2000);
        return true;
      }
    }
    return false;
  };

  // Give the view/session filters a frame to settle before searching.
  requestAnimationFrame(() => {
    if (scrollToEntry()) return;
    requestAnimationFrame(() => {
      scrollToEntry();
    });
  });
}
