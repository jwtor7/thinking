/**
 * Timeline handler for the Thinking Monitor Dashboard.
 *
 * Re-exports from sub-modules and provides the main orchestration
 * functions (initTimeline, applyTimelineFilter).
 */

import { state, ALL_SESSIONS } from '../../state.ts';
import { elements } from '../../ui/elements.ts';
import type { StrictMonitorEvent } from '../../../shared/types.ts';

import {
  TIMELINE_CATEGORIES,
  typeFilterState,
  typeCounts,
  chipElements,
  sessionFilterState,
  initTypeChips,
  loadSessionFilterState,
  resetTypeChips as resetTypeChipsImpl,
  refreshSessionChips as refreshSessionChipsImpl,
} from './chips.ts';

import {
  initEntries,
  addTimelineEntry as addTimelineEntryImpl,
  getTimelineCount,
} from './entries.ts';

// ============================================
// Public API
// ============================================

export interface TimelineCallbacks {
  appendAndTrim: (container: HTMLElement, element: HTMLElement) => void;
  smartScroll: (container: HTMLElement) => void;
  selectSession: (sessionId: string) => void;
}

export function initTimeline(cbs: TimelineCallbacks): void {
  initEntries(cbs);
  initTimelineFilter();
  initTypeChips(applyTimelineFilter);
  loadSessionFilterState();
}

export function addTimelineEntry(event: StrictMonitorEvent): void {
  addTimelineEntryImpl(event, applyTimelineFilter);
}

export { getTimelineCount };

export function resetTypeChips(): void {
  resetTypeChipsImpl();
}

export function refreshSessionChips(): void {
  refreshSessionChipsImpl(applyTimelineFilter);
}

// ============================================
// Filter Input
// ============================================

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

// ============================================
// Main Filter Function
// ============================================

/**
 * Apply the current timeline filter to all entries.
 * Evaluates text, type, and session criteria for every entry.
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

    let matchesSession: boolean;
    if (anySessionChipActive) {
      matchesSession = !el.dataset.session || sessionFilterState.get(el.dataset.session) === true;
    } else {
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

  const timelineCount = getTimelineCount();

  if (elements.timelineCount) {
    const anyTypeDisabled = Array.from(typeFilterState.values()).some(v => !v);
    const anySessionChipEnabled = Array.from(sessionFilterState.values()).some(v => v);
    const hasActiveFilter = !!filter || anyTypeDisabled || anySessionChipEnabled || state.selectedSession !== ALL_SESSIONS;
    elements.timelineCount.textContent = hasActiveFilter
      ? `${visible}/${timelineCount}`
      : String(timelineCount);

    if (anySessionChipEnabled) {
      elements.timelineCount.title = 'Filtered by session chips (overrides dropdown)';
    } else {
      elements.timelineCount.title = '';
    }
  }

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
