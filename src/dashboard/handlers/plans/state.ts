/**
 * Plan State Management
 *
 * Plan list management, selection, session-plan associations,
 * and plan selector dropdown UI.
 */

import { state } from '../../state.ts';
import { elements } from '../../ui/elements.ts';
import { debug } from '../../utils/debug.ts';
import { escapeHtml } from '../../utils/html.ts';
import { sendMessage, getWebSocket } from '../../connection/websocket.ts';
import type { PlanListEvent, PlanUpdateEvent, PlanDeleteEvent } from '../../types.ts';
import { displayPlan, displayEmptyPlan, displayMostRecentPlan, updatePlanMeta, updatePlanActionButtons } from './display.ts';
import { handlePlanOptionContextMenu } from './context-menu.ts';
import { formatTimeAgo } from './utils.ts';

// ============================================
// Module State
// ============================================

/** Stored callbacks for delegating to main app */
export interface PlanCallbacksInternal {
  findActiveAgent: () => { id: string } | undefined;
}

let internalCallbacks: PlanCallbacksInternal | null = null;

export function setInternalCallbacks(cbs: PlanCallbacksInternal): void {
  internalCallbacks = cbs;
}

export function getInternalCallbacks(): PlanCallbacksInternal | null {
  return internalCallbacks;
}

// ============================================
// Event Handlers
// ============================================

/**
 * Handle plan_list event from the server.
 * Updates the plan list in state and refreshes the selector.
 *
 * @param event - Plan list event containing plan metadata
 */
export function handlePlanList(event: PlanListEvent): void {
  const plans = event.plans;

  // Update the plan list in state
  state.planList = plans.map((p) => ({
    path: p.path,
    filename: p.filename,
    lastModified: p.lastModified,
  }));

  debug(`[Dashboard] Received plan list with ${state.planList.length} plans`);

  // Update the plan selector dropdown
  renderPlanSelector();
}

/**
 * Handle plan_update event from the server.
 * Stores the plan content and updates display if appropriate.
 *
 * @param event - Plan update event containing plan data
 */
export function handlePlanUpdate(event: PlanUpdateEvent): void {
  const filename = event.filename;
  const path = event.path;
  const content = event.content || '';
  // Use the actual file modification time if provided, otherwise fall back to current time
  const lastModified = event.lastModified ?? Date.now();

  // Find the currently active (running) agent to associate with this plan
  const activeAgent = internalCallbacks?.findActiveAgent();

  // Note: Session-plan associations are made via Read/Write/Edit tool events
  // in handleToolStart (detectPlanAccess), not here. plan_update events from
  // PlanWatcher don't have reliable session context.

  // Store this plan in our map
  state.plans.set(path, {
    path,
    filename,
    content,
    lastModified,
    sessionId: event.sessionId || undefined,
    agentId: activeAgent?.id,
  });

  // Update plan list if this plan isn't already in it
  const existingIndex = state.planList.findIndex((p) => p.path === path);
  if (existingIndex >= 0) {
    state.planList[existingIndex] = { path, filename, lastModified };
  } else {
    state.planList.push({ path, filename, lastModified });
  }

  // Re-sort by lastModified descending
  state.planList.sort((a, b) => b.lastModified - a.lastModified);

  // Update the selector
  renderPlanSelector();

  // Display logic:
  // 1. Always update if this plan is already being shown (e.g., user manually selected it)
  // 2. Auto-display if this plan is associated with the selected session (via sessionPlanMap)
  const isCurrentPlan = state.currentPlanPath === path;

  // Check if the selected session is associated with this plan
  const selectedSessionPlan = state.selectedSession !== 'all'
    ? state.sessionPlanMap.get(state.selectedSession)
    : null;
  const isSelectedSessionPlan = selectedSessionPlan === path;

  if (isCurrentPlan) {
    // Plan was manually selected or is being updated - always display
    displayPlan(path);
  } else if (isSelectedSessionPlan) {
    // Auto-display for the selected session's associated plan
    displayPlan(path);
  }
}

/**
 * Handle plan_delete event from the server.
 * Removes the plan from state and updates display.
 *
 * @param event - Plan delete event containing deleted plan path
 */
export function handlePlanDelete(event: PlanDeleteEvent): void {
  const path = event.path;

  // Remove this plan from our map
  if (path) {
    state.plans.delete(path);

    // Remove from plan list
    state.planList = state.planList.filter((p) => p.path !== path);
  }

  // Update the selector
  renderPlanSelector();

  // If this was the current plan, handle the fallback
  if (state.currentPlanPath === path) {
    if (state.selectedSession === 'all') {
      // When "All" is selected, show empty state (plans are session-specific)
      displayEmptyPlan();
    } else {
      // When a specific session is selected, show the next most recent
      displayMostRecentPlan();
    }
  }
}

// ============================================
// Plan Selector Functions
// ============================================

/**
 * Render the plan selector dropdown options.
 * Builds the dropdown HTML and attaches event handlers.
 */
export function renderPlanSelector(): void {
  const dropdown = elements.planSelectorDropdown;

  if (state.planList.length === 0) {
    dropdown.innerHTML = `
      <li class="plan-selector-empty">No plans available</li>
    `;
    return;
  }

  let html = '';
  for (const plan of state.planList) {
    const isActive = plan.path === state.currentPlanPath;
    const date = new Date(plan.lastModified);
    const timeAgo = formatTimeAgo(date);

    html += `
      <li>
        <button
          class="plan-selector-option${isActive ? ' active' : ''}"
          data-path="${escapeHtml(plan.path)}"
          role="option"
          aria-selected="${isActive}"
          title="${escapeHtml(plan.path)}"
        >
          <span class="plan-selector-option-name">${escapeHtml(plan.filename)}</span>
          <span class="plan-selector-option-badge">${escapeHtml(timeAgo)}</span>
        </button>
      </li>
    `;
  }

  dropdown.innerHTML = html;

  // Attach click handlers
  dropdown.querySelectorAll('.plan-selector-option').forEach((option) => {
    const optionEl = option as HTMLElement;
    const path = optionEl.dataset.path;

    // Left-click to select
    optionEl.addEventListener('click', (e) => {
      e.stopPropagation();
      if (path) {
        selectPlan(path);
      }
    });

    // Right-click for context menu
    optionEl.addEventListener('contextmenu', (e) => {
      if (path) {
        handlePlanOptionContextMenu(e as MouseEvent, path);
      }
    });
  });
}

/**
 * Select a plan to display.
 *
 * @param planPath - Path to the plan to select
 */
export function selectPlan(planPath: string): void {
  closePlanSelector();

  // Check if we have the content cached
  const plan = state.plans.get(planPath);
  if (plan) {
    displayPlan(planPath);
  } else {
    // Show loading state
    state.currentPlanPath = planPath;
    const listItem = state.planList.find((p) => p.path === planPath);
    elements.planSelectorText.textContent = listItem?.filename || planPath;
    elements.planContent.innerHTML = `
      <div class="empty-state">
        <span class="empty-icon">...</span>
        <p>Loading plan content...</p>
      </div>
    `;
    updatePlanMeta(null);
    updatePlanActionButtons();
    renderPlanSelector();

    // Request the plan content from the server via WebSocket
    requestPlanContent(planPath);
  }
}

/**
 * Request a specific plan's content from the server.
 * Sends a plan_request message via WebSocket.
 *
 * @param planPath - Path to the plan to request
 */
export function requestPlanContent(planPath: string): void {
  const ws = getWebSocket();
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    console.warn('[Dashboard] Cannot request plan content: WebSocket not connected');
    return;
  }

  const request = {
    type: 'plan_request',
    path: planPath,
  };

  if (!sendMessage(request)) {
    console.error('[Dashboard] Failed to request plan content: WebSocket not connected');
    return;
  }
  debug(`[Dashboard] Requested plan content: ${planPath}`);
}

/**
 * Toggle the plan selector dropdown.
 */
export function togglePlanSelector(): void {
  if (state.planSelectorOpen) {
    closePlanSelector();
  } else {
    openPlanSelector();
  }
}

/**
 * Open the plan selector dropdown.
 * Positions the dropdown using fixed positioning to escape overflow:hidden containers.
 */
export function openPlanSelector(): void {
  state.planSelectorOpen = true;
  elements.planSelectorBtn.setAttribute('aria-expanded', 'true');

  // Calculate position based on button's bounding rect
  const btnRect = elements.planSelectorBtn.getBoundingClientRect();
  const dropdown = elements.planSelectorDropdown;

  // Position dropdown below the button, aligned to the right edge
  dropdown.style.top = `${btnRect.bottom + 4}px`;
  dropdown.style.right = `${window.innerWidth - btnRect.right}px`;
  dropdown.style.left = 'auto';

  dropdown.classList.add('visible');

  // Adjust if dropdown would go off-screen at the bottom
  requestAnimationFrame(() => {
    const dropdownRect = dropdown.getBoundingClientRect();
    if (dropdownRect.bottom > window.innerHeight - 10) {
      // Position above the button instead
      dropdown.style.top = `${btnRect.top - dropdownRect.height - 4}px`;
    }
  });
}

/**
 * Close the plan selector dropdown.
 */
export function closePlanSelector(): void {
  state.planSelectorOpen = false;
  elements.planSelectorBtn.setAttribute('aria-expanded', 'false');
  elements.planSelectorDropdown.classList.remove('visible');
}
