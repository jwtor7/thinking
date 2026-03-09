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

// ============================================
// Types
// ============================================

/**
 * Callbacks for plan operations that require functions
 * from other modules. This pattern avoids circular imports.
 */
export interface PlanCallbacks {
  /** Find the currently active (running) agent */
  findActiveAgent: () => { id: string } | undefined;
  /** Show a toast notification */
  showToast: (message: string, type: 'success' | 'error' | 'info', duration?: number) => void;
  /** Announce status for screen readers */
  announceStatus: (message: string) => void;
}

// ============================================
// Initialization
// ============================================

/**
 * Initialize the plans module with callbacks.
 * Must be called before using functions that depend on other modules.
 *
 * @param cbs - Callback functions for cross-module operations
 */
export function initPlans(cbs: PlanCallbacks): void {
  setInternalCallbacks({ findActiveAgent: cbs.findActiveAgent });
  setContextMenuCallbacks(cbs);
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
