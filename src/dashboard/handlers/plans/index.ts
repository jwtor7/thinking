/**
 * Plan Handlers
 *
 * Handles plan-related functionality including:
 * - Plan list management and display
 * - Plan selection and content loading
 * - Plan selector dropdown UI
 * - Context menu for file actions (open/reveal)
 * - Plan metadata display
 */

import { setInternalCallbacks } from './state.ts';
import { setContextMenuCallbacks } from './context-menu.ts';
import type { AppContext } from '../../services/app-context.ts';
import type { Disposable } from '../../services/lifecycle.ts';

// ============================================
// Initialization
// ============================================

/**
 * Initialize the plans module with app context.
 * Must be called before using functions that depend on other modules.
 */
export function initPlans(appCtx: AppContext): Disposable {
  setInternalCallbacks({ findActiveAgent: () => appCtx.agents.findActive() });
  setContextMenuCallbacks({
    showToast: appCtx.ui.showToast,
    announceStatus: appCtx.ui.announceStatus,
  });
  return { dispose: () => {} };
}

// ============================================
// Re-exports
// ============================================

// State & event handlers
export { handlePlanList, handlePlanUpdate, handlePlanDelete } from './state.ts';
export { renderPlanSelector, selectPlan, requestPlanContent } from './state.ts';
export { togglePlanSelector, openPlanSelector, closePlanSelector } from './state.ts';

// Display
export { displayMostRecentPlan, displayPlan, displayEmptyPlan, displaySessionPlanEmpty } from './display.ts';
export { updatePlanMeta, updatePlanActionButtons } from './display.ts';

// Context menu
export { showFileContextMenu, hidePlanContextMenu, executeFileAction } from './context-menu.ts';
export { handlePlanOpenClick, handlePlanRevealClick } from './context-menu.ts';
export { handleContextMenuOpen, handleContextMenuReveal } from './context-menu.ts';
export { handlePlanContextMenu, handlePlanOptionContextMenu } from './context-menu.ts';

// Utilities
export { formatTimeAgo } from './utils.ts';
