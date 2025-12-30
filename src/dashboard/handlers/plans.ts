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

import { state } from '../state';
import { elements } from '../ui/elements';
import { escapeHtml } from '../utils/html';
import { renderSimpleMarkdown } from '../utils/markdown';
import { sendMessage, getWebSocket } from '../connection/websocket';
import type { MonitorEvent, PlanInfo } from '../types';

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
// Module State
// ============================================

/** Stored callbacks for delegating to main app */
let callbacks: PlanCallbacks | null = null;

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
  callbacks = cbs;
}

// ============================================
// Event Handlers
// ============================================

/**
 * Handle plan_list event from the server.
 * Updates the plan list in state and refreshes the selector.
 *
 * @param event - Monitor event containing plan list data
 */
export function handlePlanList(event: MonitorEvent): void {
  const plans = event.plans as Array<{ path: string; filename: string; lastModified: number }> || [];

  // Update the plan list in state
  state.planList = plans.map((p) => ({
    path: p.path,
    filename: p.filename,
    lastModified: p.lastModified,
  }));

  console.log(`[Dashboard] Received plan list with ${state.planList.length} plans`);

  // Update the plan selector dropdown
  renderPlanSelector();
}

/**
 * Handle plan_update event from the server.
 * Stores the plan content and updates display if appropriate.
 *
 * @param event - Monitor event containing plan data
 */
export function handlePlanUpdate(event: MonitorEvent): void {
  const filename = event.filename ? String(event.filename) : 'Unknown plan';
  const path = event.path ? String(event.path) : filename;
  const content = event.content ? String(event.content) : '';
  // Use the actual file modification time if provided, otherwise fall back to current time
  const lastModified = typeof event.lastModified === 'number'
    ? event.lastModified
    : Date.now();

  // Find the currently active (running) agent to associate with this plan
  const activeAgent = callbacks?.findActiveAgent();

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
 * @param event - Monitor event containing deleted plan path
 */
export function handlePlanDelete(event: MonitorEvent): void {
  const path = event.path ? String(event.path) : '';

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
// Display Functions
// ============================================

/**
 * Display the most recently modified plan in the Plan panel.
 * If no plans are available, shows an empty state.
 */
export function displayMostRecentPlan(): void {
  if (state.plans.size === 0) {
    displayEmptyPlan();
    return;
  }

  // Find the most recently modified plan
  let mostRecent: PlanInfo | null = null;
  for (const plan of state.plans.values()) {
    if (!mostRecent || plan.lastModified > mostRecent.lastModified) {
      mostRecent = plan;
    }
  }

  if (!mostRecent) {
    displayEmptyPlan();
    return;
  }

  displayPlan(mostRecent.path);
}

/**
 * Display a specific plan by path.
 *
 * @param planPath - Path to the plan file to display
 */
export function displayPlan(planPath: string): void {
  const plan = state.plans.get(planPath);
  if (!plan) {
    // Plan content not loaded yet, show loading state and request content
    state.currentPlanPath = planPath;
    const listItem = state.planList.find((p) => p.path === planPath);
    elements.planSelectorText.textContent = listItem?.filename || 'Loading...';
    elements.planContent.innerHTML = `
      <div class="empty-state">
        <span class="empty-icon">...</span>
        <p>Loading plan content...</p>
      </div>
    `;
    updatePlanMeta(null);
    updatePlanActionButtons();

    // Request the plan content from the server
    requestPlanContent(planPath);
    return;
  }

  state.currentPlanPath = planPath;
  elements.planSelectorText.textContent = plan.filename;
  elements.planContent.innerHTML = `
    <div class="plan-markdown">${renderSimpleMarkdown(plan.content)}</div>
  `;

  // Update plan metadata display
  updatePlanMeta(plan);

  // Update action buttons enabled state
  updatePlanActionButtons();

  // Update selector to show active state
  renderPlanSelector();
}

/**
 * Display empty plan state.
 * Shows a helpful message depending on the current context.
 */
export function displayEmptyPlan(): void {
  state.currentPlanPath = null;
  elements.planSelectorText.textContent = 'No active plan';

  // Show different message based on whether "All" sessions is selected
  const message = state.selectedSession === 'all' && state.sessions.size > 0
    ? 'Select a session to view its plan'
    : 'No plan file loaded';

  elements.planContent.innerHTML = `
    <div class="empty-state">
      <span class="empty-icon">file</span>
      <p>${message}</p>
    </div>
  `;
  updatePlanMeta(null);
  updatePlanActionButtons();
  renderPlanSelector();
}

/**
 * Display empty plan state for a specific session.
 * Shows a message indicating no plan is associated with this session,
 * and a hint that users can still browse plans via the dropdown.
 *
 * @param sessionId - The session ID to display empty state for
 */
export function displaySessionPlanEmpty(sessionId: string): void {
  state.currentPlanPath = null;
  const shortId = sessionId.slice(0, 8);
  elements.planSelectorText.textContent = 'No plan for session';

  elements.planContent.innerHTML = `
    <div class="empty-state">
      <span class="empty-icon">file</span>
      <p>No plan associated with session ${shortId}</p>
      <p class="empty-hint">Use the dropdown to browse all plans</p>
    </div>
  `;
  updatePlanMeta(null);
  updatePlanActionButtons();
  renderPlanSelector();
}

/**
 * Update the plan metadata display.
 * Shows the path and last modified time of the current plan.
 *
 * @param plan - Plan info to display, or null to hide metadata
 */
export function updatePlanMeta(plan: PlanInfo | null): void {
  if (!plan) {
    elements.planMeta.classList.remove('visible');
    elements.planMeta.innerHTML = '';
    return;
  }

  const modifiedDate = new Date(plan.lastModified);
  const timeAgo = formatTimeAgo(modifiedDate);
  const fullTime = modifiedDate.toLocaleString();

  // Shorten the path for display (show just ~/.claude/plans/filename.md)
  const shortPath = plan.path.replace(/^.*\/\.claude\//, '~/.claude/');

  elements.planMeta.innerHTML = `
    <span class="plan-meta-item">
      <span class="plan-meta-label">Modified:</span>
      <span class="plan-meta-value plan-meta-time" title="${escapeHtml(fullTime)}">${escapeHtml(timeAgo)}</span>
    </span>
    <span class="plan-meta-item plan-meta-path" title="${escapeHtml(plan.path)}">
      <span class="plan-meta-label">Path:</span>
      <span class="plan-meta-value">${escapeHtml(shortPath)}</span>
    </span>
  `;
  elements.planMeta.classList.add('visible');
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
  console.log(`[Dashboard] Requested plan content: ${planPath}`);
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

// ============================================
// Utility Functions
// ============================================

/**
 * Format a date as a relative time string (e.g., "2m ago", "1h ago").
 *
 * @param date - Date to format
 * @returns Relative time string
 */
export function formatTimeAgo(date: Date): string {
  const now = Date.now();
  const diff = now - date.getTime();

  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (minutes > 0) return `${minutes}m ago`;
  return 'just now';
}

// ============================================
// Context Menu Functions
// ============================================

/**
 * Show the plan context menu at the given position.
 *
 * @param x - X coordinate (clientX)
 * @param y - Y coordinate (clientY)
 * @param filePath - Path to the file for context menu actions
 */
export function showFileContextMenu(x: number, y: number, filePath: string): void {
  state.contextMenuFilePath = filePath;

  const menu = elements.planContextMenu;

  // Position the menu
  menu.style.left = `${x}px`;
  menu.style.top = `${y}px`;

  // Ensure menu stays within viewport
  requestAnimationFrame(() => {
    const rect = menu.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    // Adjust if menu goes off right edge
    if (rect.right > viewportWidth) {
      menu.style.left = `${x - rect.width}px`;
    }

    // Adjust if menu goes off bottom edge
    if (rect.bottom > viewportHeight) {
      menu.style.top = `${y - rect.height}px`;
    }
  });

  menu.classList.add('visible');
}

/**
 * Hide the plan context menu.
 */
export function hidePlanContextMenu(): void {
  elements.planContextMenu.classList.remove('visible');
  state.contextMenuFilePath = null;
}

/**
 * Execute a file action (open or reveal) via the server API.
 *
 * @param action - Action to perform ('open' or 'reveal')
 * @param path - Path to the file
 */
export async function executeFileAction(action: 'open' | 'reveal', path: string): Promise<void> {
  try {
    const response = await fetch('http://localhost:3355/file-action', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ action, path }),
    });

    const result = await response.json();

    if (!result.success) {
      console.error(`[Dashboard] File action failed: ${result.error}`);
      callbacks?.showToast(result.error || 'Action failed', 'error');
    } else {
      // Show success feedback
      const actionText = action === 'open' ? 'Opened in default app' : 'Revealed in Finder';
      callbacks?.showToast(actionText, 'success');
    }
  } catch (error) {
    console.error('[Dashboard] Failed to execute file action:', error);
    callbacks?.showToast('Failed to connect to server', 'error');
  }
}

// ============================================
// Action Button Functions
// ============================================

/**
 * Update the enabled state of plan action buttons.
 */
export function updatePlanActionButtons(): void {
  const hasActivePlan = state.currentPlanPath !== null;
  elements.planOpenBtn.disabled = !hasActivePlan;
  elements.planRevealBtn.disabled = !hasActivePlan;
}

/**
 * Handle toolbar "Open" button click.
 */
export function handlePlanOpenClick(): void {
  if (state.currentPlanPath) {
    executeFileAction('open', state.currentPlanPath);
  }
}

/**
 * Handle toolbar "Reveal" button click.
 */
export function handlePlanRevealClick(): void {
  if (state.currentPlanPath) {
    executeFileAction('reveal', state.currentPlanPath);
  }
}

/**
 * Handle context menu "Open in Default App" action.
 */
export function handleContextMenuOpen(): void {
  if (state.contextMenuFilePath) {
    executeFileAction('open', state.contextMenuFilePath);
  }
  hidePlanContextMenu();
}

/**
 * Handle context menu "Reveal in Finder" action.
 */
export function handleContextMenuReveal(): void {
  if (state.contextMenuFilePath) {
    executeFileAction('reveal', state.contextMenuFilePath);
  }
  hidePlanContextMenu();
}

/**
 * Handle right-click on plan content or selector.
 *
 * @param event - Mouse event from context menu trigger
 */
export function handlePlanContextMenu(event: MouseEvent): void {
  // Only show context menu if we have a current plan
  if (!state.currentPlanPath) {
    return;
  }

  event.preventDefault();
  showFileContextMenu(event.clientX, event.clientY, state.currentPlanPath);
}

/**
 * Handle right-click on a plan option in the selector dropdown.
 *
 * @param event - Mouse event from context menu trigger
 * @param planPath - Path to the plan for context menu actions
 */
export function handlePlanOptionContextMenu(event: MouseEvent, planPath: string): void {
  event.preventDefault();
  event.stopPropagation();
  showFileContextMenu(event.clientX, event.clientY, planPath);
}
