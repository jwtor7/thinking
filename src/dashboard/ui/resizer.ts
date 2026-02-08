/**
 * Pane resize helpers.
 *
 * The dashboard is now single-view, so interactive resize handles are disabled.
 * We keep these functions so existing panel/session modules can continue to call
 * them without feature branches.
 */

import { elements } from './elements.ts';

function removeAllResizers(): void {
  elements.panels.querySelectorAll('.resizer-vertical').forEach((resizer) => resizer.remove());
}

/**
 * Initialize pane resizing support.
 * Resize handles are intentionally disabled; this only cleans up stale handles.
 */
export function initResizers(): void {
  removeAllResizers();
}

/**
 * Sync pane resize handles.
 * No-op for single-view mode, except cleanup of any stale handle nodes.
 */
export function rebuildResizers(): void {
  removeAllResizers();
}

/**
 * Reset panel flex when toggling collapse state.
 */
export function resetPanelFlex(panel: HTMLElement): void {
  panel.style.flex = '';
}
