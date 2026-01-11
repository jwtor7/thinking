/**
 * Panel Collapse Management
 *
 * Handles toggling panel collapse states, managing DOM updates,
 * and persisting collapse state to localStorage.
 */

import { state } from '../state.ts';
import { elements } from './elements.ts';
import { savePanelCollapseState } from '../storage/persistence.ts';
import { resetPanelFlex, rebuildResizers } from './resizer.ts';

/**
 * Panel names that can be collapsed
 */
export type PanelName = 'thinking' | 'todo' | 'tools' | 'hooks' | 'plan';

/**
 * Callbacks for panel operations
 */
export interface PanelCallbacks {
  announceStatus: (message: string) => void;
}

/**
 * Registered callbacks for panel operations
 * Set via initPanels()
 */
let callbacks: PanelCallbacks | null = null;

/**
 * Register callbacks for panel operations.
 * Must be called before any panel toggle operations.
 *
 * @param cbs - Callback functions
 */
export function initPanels(cbs: PanelCallbacks): void {
  callbacks = cbs;
}

/**
 * Get panel elements lazily to ensure DOM is ready.
 * Avoids timing issues with element queries.
 *
 * @returns Record mapping panel names to { panel, btn } elements
 */
function getPanelElements(): Record<PanelName, { panel: HTMLElement | null; btn: HTMLButtonElement | null }> {
  return {
    thinking: { panel: elements.thinkingPanel, btn: elements.thinkingCollapseBtn },
    todo: { panel: elements.todoPanel, btn: elements.todoCollapseBtn },
    tools: { panel: elements.toolsPanel, btn: elements.toolsCollapseBtn },
    hooks: { panel: elements.hooksPanel, btn: elements.hooksCollapseBtn },
    plan: { panel: elements.planPanel, btn: elements.planCollapseBtn },
  };
}

/**
 * Get the keyboard shortcut key for a panel.
 * Note: Plan panel no longer has a keyboard shortcut (Shift+P is used for panel selector).
 *
 * @param panelName - The panel name
 * @returns The shortcut key character, or null if no shortcut
 */
function getShortcutKey(panelName: PanelName): string | null {
  switch (panelName) {
    case 'thinking':
      return 'T';
    case 'tools':
      return 'O';
    case 'todo':
      return 'D';
    case 'hooks':
      return null; // No keyboard shortcut for hooks panel
    case 'plan':
      return null; // Shift+P is used for panel selector
  }
}

/**
 * Toggle collapse state for a panel.
 * Updates DOM, state, and persists to localStorage.
 *
 * @param panelName - The panel to toggle
 */
export function togglePanelCollapse(panelName: PanelName): void {
  const panelElements = getPanelElements();
  const { panel, btn } = panelElements[panelName];
  if (!panel || !btn) return;

  const isCollapsed = !state.panelCollapseState[panelName];
  state.panelCollapseState[panelName] = isCollapsed;

  // Update DOM
  panel.classList.toggle('collapsed', isCollapsed);
  btn.setAttribute('aria-expanded', String(!isCollapsed));
  btn.setAttribute('aria-label', `${isCollapsed ? 'Expand' : 'Collapse'} ${panelName} panel`);
  const shortcutKey = getShortcutKey(panelName);
  btn.title = shortcutKey
    ? `${isCollapsed ? 'Expand' : 'Collapse'} panel (Shift+${shortcutKey})`
    : `${isCollapsed ? 'Expand' : 'Collapse'} panel`;

  // Reset custom flex sizing when toggling collapse
  // This allows CSS to control panel sizes after resize
  resetPanelFlex(panel);

  // Rebuild resizers to only show between visible panels
  rebuildResizers();

  // Persist to localStorage
  savePanelCollapseState();

  // Announce for screen readers
  if (callbacks) {
    callbacks.announceStatus(`${panelName} panel ${isCollapsed ? 'collapsed' : 'expanded'}`);
  }

  console.log(`[Dashboard] Panel ${panelName} ${isCollapsed ? 'collapsed' : 'expanded'}`);
}

/**
 * Initialize panel collapse button event listeners.
 */
export function initPanelCollapseButtons(): void {
  const panelElements = getPanelElements();
  for (const [panelName, { btn }] of Object.entries(panelElements)) {
    if (btn) {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        togglePanelCollapse(panelName as PanelName);
      });
    }
  }
}
