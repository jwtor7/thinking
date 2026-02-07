/**
 * LocalStorage Persistence Module
 *
 * Functions for persisting and restoring dashboard state to localStorage.
 * Handles session todos, panel collapse states, and session-plan associations.
 *
 * Note: Some functions (restoreTodosFromStorage, restorePanelCollapseState)
 * modify DOM elements directly through the elements reference. These should
 * be called after DOM is ready.
 */

import { TodoItem, StoredPlanAssociation, ThemeId, PanelVisibility } from '../types.ts';
import {
  STORAGE_KEY_TODOS,
  STORAGE_KEY_PANEL_COLLAPSE,
  STORAGE_KEY_PANEL_VISIBILITY,
  STORAGE_KEY_THEME,
  DEFAULT_THEME,
  PLAN_ASSOCIATION_MAX_AGE_MS,
  PLAN_ASSOCIATION_MAX_ENTRIES,
  PLAN_ASSOCIATION_STORAGE_KEY,
} from '../config.ts';
import { state } from '../state.ts';
import { getSessionColorByHash } from '../ui/colors.ts';
import { elements } from '../ui/elements.ts';

// ============================================
// Panel Types (local to this module)
// ============================================

type PanelName = 'thinking' | 'todo' | 'tools' | 'hooks' | 'plan' | 'team' | 'tasks' | 'timeline';

/**
 * Panel elements mapping for collapse state restoration.
 * Computed lazily to ensure elements are available.
 */
function getPanelElements(): Record<PanelName, { panel: HTMLElement | null; btn: HTMLButtonElement | null }> {
  return {
    thinking: { panel: elements.thinkingPanel, btn: elements.thinkingCollapseBtn },
    todo: { panel: elements.todoPanel, btn: elements.todoCollapseBtn },
    tools: { panel: elements.toolsPanel, btn: elements.toolsCollapseBtn },
    hooks: { panel: elements.hooksPanel, btn: elements.hooksCollapseBtn },
    plan: { panel: elements.planPanel, btn: elements.planCollapseBtn },
    team: { panel: elements.teamPanel, btn: elements.teamCollapseBtn },
    tasks: { panel: elements.tasksPanel, btn: elements.tasksCollapseBtn },
    timeline: { panel: elements.timelinePanel, btn: elements.timelineCollapseBtn },
  };
}

// ============================================
// Session Todos Persistence
// ============================================

/**
 * Save session todos to localStorage for persistence across refreshes.
 * Converts the Map to a serializable format.
 */
export function saveTodosToStorage(): void {
  try {
    // Convert Map to array of [sessionId, todos] entries for JSON serialization
    const entries: Array<[string, TodoItem[]]> = Array.from(state.sessionTodos.entries());
    localStorage.setItem(STORAGE_KEY_TODOS, JSON.stringify(entries));
    console.log(`[Dashboard] Saved ${entries.length} session(s) of todos to localStorage`);
  } catch (error) {
    console.warn('[Dashboard] Failed to save todos to localStorage:', error);
  }
}

/**
 * Restore session todos from localStorage on page load.
 * Reconstructs the Map from the stored array format.
 *
 * Note: This function modifies both state and DOM elements (elements.todoCount).
 * Should be called after DOM is ready.
 */
export function restoreTodosFromStorage(): void {
  try {
    const stored = localStorage.getItem(STORAGE_KEY_TODOS);
    if (!stored) {
      console.log('[Dashboard] No stored todos found in localStorage');
      return;
    }

    const entries: Array<[string, TodoItem[]]> = JSON.parse(stored);
    if (!Array.isArray(entries)) {
      console.warn('[Dashboard] Invalid stored todos format, clearing');
      localStorage.removeItem(STORAGE_KEY_TODOS);
      return;
    }

    // Reconstruct the sessionTodos map
    state.sessionTodos = new Map(entries);
    console.log(`[Dashboard] Restored ${state.sessionTodos.size} session(s) of todos from localStorage`);

    // If there's exactly one session, auto-select it to display its todos
    if (state.sessionTodos.size === 1) {
      const [sessionId, todos] = entries[0];
      state.currentSessionId = sessionId;
      state.selectedSession = sessionId;
      state.todos = todos;
      elements.todoCount.textContent = String(todos.length);

      // Also restore the session in the sessions map for UI consistency
      if (!state.sessions.has(sessionId)) {
        state.sessions.set(sessionId, {
          id: sessionId,
          startTime: new Date().toISOString(),
          active: false, // Will be updated when we reconnect
          color: getSessionColorByHash(sessionId),
        });
      }
    } else if (state.sessionTodos.size > 1) {
      // Multiple sessions - restore session entries for filter UI
      for (const [sessionId] of entries) {
        if (!state.sessions.has(sessionId)) {
          state.sessions.set(sessionId, {
            id: sessionId,
            startTime: new Date().toISOString(),
            active: false,
            color: getSessionColorByHash(sessionId),
          });
        }
      }
    }
  } catch (error) {
    console.warn('[Dashboard] Failed to restore todos from localStorage:', error);
  }
}

// ============================================
// Panel Collapse State Persistence
// ============================================

/**
 * Save panel collapse state to localStorage.
 */
export function savePanelCollapseState(): void {
  try {
    localStorage.setItem(STORAGE_KEY_PANEL_COLLAPSE, JSON.stringify(state.panelCollapseState));
  } catch (error) {
    console.warn('[Dashboard] Failed to save panel collapse state:', error);
  }
}

/**
 * Restore panel collapse state from localStorage.
 *
 * Note: This function modifies both state and DOM elements.
 * Should be called after DOM is ready.
 */
export function restorePanelCollapseState(): void {
  try {
    const stored = localStorage.getItem(STORAGE_KEY_PANEL_COLLAPSE);
    if (!stored) return;

    const parsed = JSON.parse(stored);
    if (typeof parsed !== 'object' || parsed === null) {
      console.warn('[Dashboard] Invalid stored panel collapse state, clearing');
      localStorage.removeItem(STORAGE_KEY_PANEL_COLLAPSE);
      return;
    }

    const panelElements = getPanelElements();

    // Apply stored state
    for (const [panelName, isCollapsed] of Object.entries(parsed)) {
      if (panelName in state.panelCollapseState && typeof isCollapsed === 'boolean') {
        state.panelCollapseState[panelName as PanelName] = isCollapsed;
        const { panel, btn } = panelElements[panelName as PanelName];
        if (panel && btn && isCollapsed) {
          panel.classList.add('collapsed');
          btn.setAttribute('aria-expanded', 'false');
          btn.setAttribute('aria-label', `Expand ${panelName} panel`);
          const shortcutKey = panelName === 'thinking' ? 'T' : panelName === 'tools' ? 'O' : panelName === 'todo' ? 'D' : 'P';
          btn.title = `Expand panel (Shift+${shortcutKey})`;
        }
      }
    }

    console.log('[Dashboard] Restored panel collapse state from localStorage');
  } catch (error) {
    console.warn('[Dashboard] Failed to restore panel collapse state:', error);
  }
}

// ============================================
// Session-Plan Association Persistence
// ============================================

/**
 * Prune stale and excess session-plan associations.
 * Removes entries older than PLAN_ASSOCIATION_MAX_AGE_MS (7 days)
 * and keeps at most PLAN_ASSOCIATION_MAX_ENTRIES (100 entries),
 * removing oldest by timestamp if exceeded.
 */
export function pruneSessionPlanAssociations(
  associations: Record<string, StoredPlanAssociation>
): Record<string, StoredPlanAssociation> {
  const now = Date.now();
  const maxAge = PLAN_ASSOCIATION_MAX_AGE_MS;
  const maxEntries = PLAN_ASSOCIATION_MAX_ENTRIES;

  // First pass: remove entries older than max age
  const entries = Object.entries(associations).filter(
    ([, assoc]) => now - assoc.timestamp < maxAge
  );

  // If still over max entries, sort by timestamp and keep only the newest
  if (entries.length > maxEntries) {
    entries.sort((a, b) => b[1].timestamp - a[1].timestamp); // Newest first
    entries.length = maxEntries; // Truncate to max entries
  }

  // Convert back to object
  return Object.fromEntries(entries);
}

/**
 * Load session-plan associations from localStorage.
 * Runs cleanup to remove stale entries, then populates state.sessionPlanMap.
 * Should be called during initialization.
 */
export function loadSessionPlanAssociations(): void {
  try {
    const stored = localStorage.getItem(PLAN_ASSOCIATION_STORAGE_KEY);
    if (!stored) {
      console.log('[Dashboard] No stored plan associations found in localStorage');
      return;
    }

    const parsed: Record<string, StoredPlanAssociation> = JSON.parse(stored);
    if (typeof parsed !== 'object' || parsed === null) {
      console.warn('[Dashboard] Invalid stored plan associations format, clearing');
      localStorage.removeItem(PLAN_ASSOCIATION_STORAGE_KEY);
      return;
    }

    // Prune stale/excess entries
    const pruned = pruneSessionPlanAssociations(parsed);

    // Check if pruning removed any entries
    const originalCount = Object.keys(parsed).length;
    const prunedCount = Object.keys(pruned).length;
    if (prunedCount < originalCount) {
      console.log(`[Dashboard] Pruned ${originalCount - prunedCount} stale plan associations`);
      // Save the pruned state back to localStorage
      localStorage.setItem(PLAN_ASSOCIATION_STORAGE_KEY, JSON.stringify(pruned));
    }

    // Populate state.sessionPlanMap
    state.sessionPlanMap.clear();
    for (const [sessionId, assoc] of Object.entries(pruned)) {
      state.sessionPlanMap.set(sessionId, assoc.planPath);
    }

    console.log(`[Dashboard] Restored ${state.sessionPlanMap.size} plan associations from localStorage`);
  } catch (error) {
    console.warn('[Dashboard] Failed to restore plan associations from localStorage:', error);
  }
}

/**
 * Save a single session-plan association to localStorage.
 * Runs cleanup to prevent unbounded growth.
 */
export function saveSessionPlanAssociation(sessionId: string, planPath: string): void {
  try {
    // Load existing associations
    const stored = localStorage.getItem(PLAN_ASSOCIATION_STORAGE_KEY);
    let associations: Record<string, StoredPlanAssociation> = {};

    if (stored) {
      try {
        associations = JSON.parse(stored);
        if (typeof associations !== 'object' || associations === null) {
          associations = {};
        }
      } catch {
        associations = {};
      }
    }

    // Add the new association with current timestamp
    associations[sessionId] = {
      planPath,
      timestamp: Date.now(),
    };

    // Prune stale/excess entries
    associations = pruneSessionPlanAssociations(associations);

    // Save back to localStorage
    localStorage.setItem(PLAN_ASSOCIATION_STORAGE_KEY, JSON.stringify(associations));
    console.log(`[Dashboard] Saved plan association: ${sessionId.slice(0, 8)} -> ${planPath.split('/').pop()}`);
  } catch (error) {
    console.warn('[Dashboard] Failed to save plan association to localStorage:', error);
  }
}

// ============================================
// Theme Persistence
// ============================================

/**
 * Valid theme IDs for validation.
 */
const VALID_THEME_IDS: ThemeId[] = ['dark', 'light', 'solarized', 'solarized-dark', 'system'];

/**
 * Check if a value is a valid ThemeId.
 */
function isValidThemeId(value: unknown): value is ThemeId {
  return typeof value === 'string' && VALID_THEME_IDS.includes(value as ThemeId);
}

/**
 * Save the user's theme preference to localStorage.
 *
 * @param theme - The theme ID to save
 */
export function saveThemePreference(theme: ThemeId): void {
  try {
    localStorage.setItem(STORAGE_KEY_THEME, theme);
    console.log(`[Dashboard] Saved theme preference: ${theme}`);
  } catch (error) {
    console.warn('[Dashboard] Failed to save theme preference to localStorage:', error);
  }
}

/**
 * Load the user's theme preference from localStorage.
 * Returns the stored theme or the default ('system') if not set or invalid.
 *
 * @returns The stored theme ID or default
 */
export function loadThemePreference(): ThemeId {
  try {
    const stored = localStorage.getItem(STORAGE_KEY_THEME);
    if (stored && isValidThemeId(stored)) {
      console.log(`[Dashboard] Loaded theme preference: ${stored}`);
      return stored;
    }
    console.log(`[Dashboard] No valid theme preference found, using default: ${DEFAULT_THEME}`);
    return DEFAULT_THEME as ThemeId;
  } catch (error) {
    console.warn('[Dashboard] Failed to load theme preference from localStorage:', error);
    return DEFAULT_THEME as ThemeId;
  }
}

// ============================================
// Panel Visibility Persistence
// ============================================

/**
 * Default panel visibility (all panels visible).
 */
const DEFAULT_PANEL_VISIBILITY: PanelVisibility = {
  thinking: true,
  todo: true,
  tools: true,
  hooks: true,
  plan: true,
  team: true,
  tasks: true,
  timeline: true,
};

/**
 * Valid panel names for validation.
 */
const VALID_PANEL_NAMES: (keyof PanelVisibility)[] = ['thinking', 'todo', 'tools', 'hooks', 'plan', 'team', 'tasks', 'timeline'];

/**
 * Check if a value is a valid panel name.
 */
function isValidPanelName(value: unknown): value is keyof PanelVisibility {
  return typeof value === 'string' && VALID_PANEL_NAMES.includes(value as keyof PanelVisibility);
}

/**
 * Save panel visibility settings to localStorage.
 */
export function savePanelVisibility(): void {
  try {
    localStorage.setItem(STORAGE_KEY_PANEL_VISIBILITY, JSON.stringify(state.panelVisibility));
    console.log('[Dashboard] Saved panel visibility settings');
  } catch (error) {
    console.warn('[Dashboard] Failed to save panel visibility to localStorage:', error);
  }
}

/**
 * Load panel visibility settings from localStorage.
 * Returns stored settings or defaults if not found/invalid.
 *
 * @returns Panel visibility settings
 */
export function loadPanelVisibility(): PanelVisibility {
  try {
    const stored = localStorage.getItem(STORAGE_KEY_PANEL_VISIBILITY);
    if (!stored) {
      console.log('[Dashboard] No panel visibility settings found, using defaults');
      return { ...DEFAULT_PANEL_VISIBILITY };
    }

    const parsed = JSON.parse(stored);
    if (typeof parsed !== 'object' || parsed === null) {
      console.warn('[Dashboard] Invalid panel visibility format, using defaults');
      localStorage.removeItem(STORAGE_KEY_PANEL_VISIBILITY);
      return { ...DEFAULT_PANEL_VISIBILITY };
    }

    // Validate and merge with defaults
    const result: PanelVisibility = { ...DEFAULT_PANEL_VISIBILITY };
    for (const [key, value] of Object.entries(parsed)) {
      if (isValidPanelName(key) && typeof value === 'boolean') {
        result[key] = value;
      }
    }

    console.log('[Dashboard] Loaded panel visibility settings from localStorage');
    return result;
  } catch (error) {
    console.warn('[Dashboard] Failed to load panel visibility from localStorage:', error);
    return { ...DEFAULT_PANEL_VISIBILITY };
  }
}

/**
 * Restore panel visibility from localStorage and update state.
 * Should be called during initialization before DOM manipulation.
 */
export function restorePanelVisibility(): void {
  const visibility = loadPanelVisibility();
  state.panelVisibility = visibility;
  console.log('[Dashboard] Restored panel visibility state');
}
