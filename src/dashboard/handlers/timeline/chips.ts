/**
 * Timeline category and session filter chips.
 *
 * Manages type filter chips (Thinking, Tools, Hooks, etc.) and
 * session filter chips with persistence to localStorage.
 */

import { state } from '../../state.ts';
import { elements } from '../../ui/elements.ts';
import { escapeHtml } from '../../utils/html.ts';
import { getSessionDisplayName } from '../sessions.ts';

// ============================================
// Constants
// ============================================

/** Timeline category definitions for filter chips */
export const TIMELINE_CATEGORIES: Record<string, { label: string; types: string[]; color: string; icon: string }> = {
  thinking: { label: 'Thinking', types: ['thinking'], color: 'var(--color-accent-blue)', icon: '&#129504;' },
  tools: { label: 'Tools', types: ['tool_start', 'tool_end'], color: 'var(--color-accent-green)', icon: '&#128295;' },
  hooks: { label: 'Hooks', types: ['hook_execution'], color: 'var(--color-accent-yellow)', icon: '&#9881;' },
  agents: { label: 'Agents', types: ['agent_start', 'agent_stop', 'session_start', 'session_stop'], color: 'var(--color-accent-purple)', icon: '&#129302;' },
  team: { label: 'Team', types: ['team_update', 'task_update', 'task_completed', 'message_sent', 'teammate_idle'], color: 'var(--color-accent-orange)', icon: '&#128101;' },
  plans: { label: 'Plans', types: ['plan_update', 'plan_delete'], color: 'var(--color-text-muted)', icon: '&#128196;' },
};

/** Reverse lookup: event type -> category */
export const TYPE_TO_CATEGORY: Record<string, string> = {};
for (const [cat, def] of Object.entries(TIMELINE_CATEGORIES)) {
  for (const t of def.types) {
    TYPE_TO_CATEGORY[t] = cat;
  }
}

const STORAGE_KEY = 'tm-timeline-type-filter';
const SESSION_STORAGE_KEY = 'tm-timeline-session-filter';

// ============================================
// State
// ============================================

/** Category filter state (all active by default) */
export const typeFilterState: Map<string, boolean> = new Map();

/** Category event counts */
export const typeCounts: Map<string, number> = new Map();

/** Chip button elements for count updates */
export const chipElements: Map<string, HTMLElement> = new Map();

/** Session filter state: sessionId -> enabled. All disabled by default (user opts in). */
export const sessionFilterState: Map<string, boolean> = new Map();

/** Session event counts for chip badges */
export const sessionCounts: Map<string, number> = new Map();

/** Session chip elements for count updates */
export const sessionChipElements: Map<string, HTMLElement> = new Map();

// ============================================
// Type Chips
// ============================================

export function initTypeChips(onFilterChange: () => void): void {
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
      onFilterChange();
    });
    container.appendChild(chip);
    chipElements.set(cat, chip);
  }
}

export function saveTypeFilterState(): void {
  try {
    const obj: Record<string, boolean> = {};
    for (const [cat, enabled] of typeFilterState) {
      obj[cat] = enabled;
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(obj));
  } catch { /* ignore */ }
}

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
// Session Chips
// ============================================

export function loadSessionFilterState(): void {
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

export function saveSessionFilterState(): void {
  try {
    const obj: Record<string, boolean> = {};
    for (const [id, enabled] of sessionFilterState) {
      obj[id] = enabled;
    }
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(obj));
  } catch { /* ignore */ }
}

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
    if (aliasChip) aliasChip.remove();
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

    // Remove alias from state.sessions to prevent refreshSessionChips
    // from recreating the alias chip on the next refresh cycle
    state.sessions.delete(aliasId);

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

export function addOrUpdateSessionChip(sessionId: string, onFilterChange: () => void): void {
  const container = elements.timelineSessionChips;
  if (!container) return;

  const session = state.sessions.get(sessionId);
  const label = getSessionDisplayName(session?.workingDirectory, sessionId);
  mergeSessionAliases(sessionId, label);

  if (sessionChipElements.has(sessionId)) {
    const chip = sessionChipElements.get(sessionId)!;
    const color = session?.color || 'var(--color-text-muted)';

    const countEl = chip.querySelector('.chip-count');
    const currentCount = String(sessionCounts.get(sessionId) || 0);
    if (countEl) {
      countEl.textContent = currentCount;
      chip.childNodes[0].textContent = label + ' ';
    }

    const isActive = sessionFilterState.get(sessionId) ?? false;
    if (isActive) {
      chip.style.background = color;
    }
    chip.title = `Session: ${sessionId}`;
    return;
  }

  // Don't create chips for sessions with no timeline events
  // (e.g. pure session_start announcements on connect)
  const eventCount = sessionCounts.get(sessionId) || 0;
  if (eventCount === 0) return;

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
    onFilterChange();
  });

  container.appendChild(chip);
  sessionChipElements.set(sessionId, chip);
}

export function resetSessionChips(): void {
  sessionFilterState.clear();
  sessionCounts.clear();
  sessionChipElements.clear();
  const container = elements.timelineSessionChips;
  if (container) container.innerHTML = '';
  try { localStorage.removeItem(SESSION_STORAGE_KEY); } catch { /* ignore */ }
}

export function refreshSessionChips(onFilterChange: () => void): void {
  // Snapshot keys to avoid infinite iteration when BoundedMap.get()
  // re-inserts entries (LRU promotion) during the loop.
  const sessionIds = Array.from(state.sessions.keys());
  for (const sessionId of sessionIds) {
    addOrUpdateSessionChip(sessionId, onFilterChange);
  }
  enforceChipOverflow(onFilterChange);
}

// ============================================
// Chip Overflow
// ============================================

const MAX_VISIBLE_CHIPS = 8;
let overflowToggle: HTMLElement | null = null;
let overflowExpanded = false;

function enforceChipOverflow(onFilterChange: () => void): void {
  const container = elements.timelineSessionChips;
  if (!container) return;

  const chips = Array.from(container.querySelectorAll('.timeline-session-chip')) as HTMLElement[];

  // Remove existing overflow toggle
  if (overflowToggle) {
    overflowToggle.remove();
    overflowToggle = null;
  }

  if (chips.length <= MAX_VISIBLE_CHIPS) {
    // No overflow - show all chips
    for (const chip of chips) {
      chip.style.display = '';
    }
    overflowExpanded = false;
    return;
  }

  // Sort chips: active (selected) first, then by event count descending
  const sortedChips = chips.slice().sort((a, b) => {
    const aActive = a.classList.contains('active') ? 1 : 0;
    const bActive = b.classList.contains('active') ? 1 : 0;
    if (aActive !== bActive) return bActive - aActive;

    const aSession = state.sessions.get(a.dataset.sessionId || '');
    const bSession = state.sessions.get(b.dataset.sessionId || '');
    const aLive = aSession?.active ? 1 : 0;
    const bLive = bSession?.active ? 1 : 0;
    if (aLive !== bLive) return bLive - aLive;

    const aCount = sessionCounts.get(a.dataset.sessionId || '') || 0;
    const bCount = sessionCounts.get(b.dataset.sessionId || '') || 0;
    return bCount - aCount;
  });

  const overflowCount = sortedChips.length - MAX_VISIBLE_CHIPS;

  if (overflowExpanded) {
    for (const chip of sortedChips) {
      chip.style.display = '';
    }
  } else {
    for (let i = 0; i < sortedChips.length; i++) {
      sortedChips[i].style.display = i < MAX_VISIBLE_CHIPS ? '' : 'none';
    }
  }

  // Add toggle button
  overflowToggle = document.createElement('button');
  overflowToggle.className = 'timeline-chip timeline-overflow-toggle';
  overflowToggle.textContent = overflowExpanded
    ? 'show less'
    : `+${overflowCount} more`;
  overflowToggle.addEventListener('click', () => {
    overflowExpanded = !overflowExpanded;
    enforceChipOverflow(onFilterChange);
  });
  container.appendChild(overflowToggle);
}
