/**
 * Plan Handlers - Re-export shim
 *
 * All implementation has moved to ./plans/ sub-modules.
 * This file preserves the original import paths.
 */

export type { PlanCallbacks } from './plans/index.ts';

export {
  initPlans,
  handlePlanList,
  handlePlanUpdate,
  handlePlanDelete,
  renderPlanSelector,
  selectPlan,
  requestPlanContent,
  togglePlanSelector,
  openPlanSelector,
  closePlanSelector,
  displayMostRecentPlan,
  displayPlan,
  displayEmptyPlan,
  displaySessionPlanEmpty,
  updatePlanMeta,
  updatePlanActionButtons,
  showFileContextMenu,
  hidePlanContextMenu,
  executeFileAction,
  handlePlanOpenClick,
  handlePlanRevealClick,
  handleContextMenuOpen,
  handleContextMenuReveal,
  handlePlanContextMenu,
  handlePlanOptionContextMenu,
  formatTimeAgo,
} from './plans/index.ts';
