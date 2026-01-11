/**
 * Thinking Monitor Dashboard - Client Application
 *
 * WebSocket client that connects to the monitor server and renders
 * real-time events in the dashboard panels.
 *
 * Phase 4 Polish Features:
 * - Thinking blocks (non-collapsible, always expanded for readability)
 * - Enhanced tool call visualization with timing and expandable details
 * - Improved agent tree visualization with status indicators
 * - Smart auto-scroll (pauses when user scrolls up)
 * - Event type filtering (thinking filter, tool filter)
 * - Connection status with reconnect countdown
 * - Keyboard shortcuts for view switching
 * - Improved responsiveness
 */

import { state, agentContextStack, agentContextTimestamps } from './state.ts';

import {
  MAX_ENTRIES,
  SCROLL_THRESHOLD,
  STORAGE_KEY_TODOS,
} from './config.ts';

import { elements } from './ui/elements.ts';

import {
  restoreTodosFromStorage,
  restorePanelCollapseState,
  restorePanelVisibility,
  loadSessionPlanAssociations,
  loadThemePreference,
} from './storage/persistence.ts';

import { initThemeToggle } from './ui/theme-toggle.ts';

import {
  initWebSocket,
  connect,
  retryNow,
} from './connection/websocket.ts';

import {
  ViewType,
  initViews,
  initViewTabs,
  updateSessionViewTabs,
} from './ui/views.ts';
import {
  initPanels,
  initPanelCollapseButtons,
} from './ui/panels.ts';
import { initResizers } from './ui/resizer.ts';
import { initDragReorder } from './ui/drag-reorder.ts';
import {
  filterAllThinking,
  filterAllTools,
} from './ui/filters.ts';
import { initKeyboard } from './ui/keyboard.ts';
import {
  initPanelSelector,
  togglePanelSelector,
  applyAllPanelVisibility,
} from './ui/panel-selector.ts';

// Import handler modules
import { handleEvent } from './handlers/dispatcher.ts';
import { initThinking } from './handlers/thinking.ts';
import { initTools } from './handlers/tools.ts';
import {
  getCurrentAgentContext,
  getAgentDisplayName,
  findActiveAgent,
} from './handlers/agents.ts';
import {
  initSessions,
  updateSessionFilter,
  initStatusBarSession,
  updateStatusBarSession,
  hideSessionContextMenu,
  handleRevealSessionInFinder,
} from './handlers/sessions.ts';
import { initTooltip } from './ui/tooltip.ts';
import {
  initPlans,
  displayPlan,
  displayEmptyPlan,
  displaySessionPlanEmpty,
  togglePlanSelector,
  closePlanSelector,
  showFileContextMenu,
  hidePlanContextMenu,
  handlePlanOpenClick,
  handlePlanRevealClick,
  handlePlanContextMenu,
  handleContextMenuOpen,
  handleContextMenuReveal,
} from './handlers/plans.ts';
import {
  initTodos,
  detectPlanAccess,
  parseTodoWriteInput,
  updateTodosForCurrentSession,
  clearSessionTodos,
  renderTodoPanel,
} from './handlers/todos.ts';
import { initHooks } from './handlers/hooks.ts';
import {
  initExportModal,
  updateExportButtonState,
  tryOpenExportModal,
} from './ui/export-modal.ts';

// ============================================
// Accessibility Helpers
// ============================================

/**
 * Announce a status message for screen readers.
 * Uses the live region to announce changes without focus shift.
 */
function announceStatus(message: string): void {
  const announcer = document.getElementById('status-announcer');
  if (announcer) {
    // Clear first to ensure re-announcement of same message
    announcer.textContent = '';
    // Use requestAnimationFrame to ensure the clear is processed
    requestAnimationFrame(() => {
      announcer.textContent = message;
    });
  }
}

/**
 * Focus the active panel content for keyboard navigation.
 * Sets tabindex to make the panel focusable, then focuses it.
 */
function focusActivePanel(view: ViewType): void {
  // Only focus on single-panel views (not 'all')
  if (view === 'all') return;

  const panelMap: Record<string, string> = {
    thinking: 'thinking-content',
    tools: 'tools-content',
    todo: 'todo-content',
    plan: 'plan-content',
  };

  const panelId = panelMap[view];
  if (panelId) {
    const panel = document.getElementById(panelId);
    if (panel) {
      panel.setAttribute('tabindex', '-1');
      panel.focus();
    }
  }
}

/**
 * Show a toast notification.
 * Supports multiple simultaneous toasts with stacking.
 */
function showToast(message: string, type: 'success' | 'error' | 'info' = 'info', duration = 3000): void {
  // Create container if it doesn't exist
  let container = document.querySelector('.toast-container');
  if (!container) {
    container = document.createElement('div');
    container.className = 'toast-container';
    document.body.appendChild(container);
  }

  // Create toast element
  const toast = document.createElement('div');
  toast.className = `toast-stacked toast-${type}`;
  toast.textContent = message;
  container.appendChild(toast);

  // Hide after delay with fade-out animation
  setTimeout(() => {
    toast.classList.add('toast-out');
    setTimeout(() => toast.remove(), 100);
  }, duration);
}

// ============================================
// Smart Scroll
// ============================================

function isNearBottom(container: HTMLElement): boolean {
  const { scrollTop, scrollHeight, clientHeight } = container;
  return scrollHeight - scrollTop - clientHeight < SCROLL_THRESHOLD;
}

function smartScroll(container: HTMLElement): void {
  // Only auto-scroll if enabled and user hasn't scrolled up
  if (state.autoScroll && !state.userScrolledUp) {
    container.scrollTop = container.scrollHeight;
  }
}

function handlePanelScroll(container: HTMLElement): void {
  // Detect if user has scrolled away from bottom
  state.userScrolledUp = !isNearBottom(container);
}

// ============================================
// Utilities
// ============================================

function appendAndTrim(container: HTMLElement, element: HTMLElement): void {
  container.appendChild(element);

  // Remove old entries if we exceed max
  const children = container.children;
  while (children.length > MAX_ENTRIES) {
    children[0].remove();
  }
}

function clearAllPanels(): void {
  // Reset state
  state.eventCount = 0;
  state.thinkingCount = 0;
  state.toolsCount = 0;
  state.hooksCount = 0;
  state.agentsCount = 0;
  state.agents.clear();
  state.pendingTools.clear();
  state.sessions.clear();
  state.currentSessionId = null;
  state.selectedSession = 'all';
  state.userScrolledUp = false;

  // Reset agent context stack to just 'main' and clear timestamps
  agentContextStack.length = 0;
  agentContextStack.push('main');
  agentContextTimestamps.clear();

  // Clear session-plan associations to prevent memory leak
  state.sessionPlanMap.clear();

  // Hide session filter
  updateSessionFilter();

  // Clear status bar session indicator
  updateStatusBarSession();

  // Reset todos (both session-specific map and current display)
  state.sessionTodos.clear();
  state.todos = [];

  // Clear persisted todos from localStorage
  try {
    localStorage.removeItem(STORAGE_KEY_TODOS);
    console.log('[Dashboard] Cleared todos from localStorage');
  } catch (error) {
    console.warn('[Dashboard] Failed to clear todos from localStorage:', error);
  }

  // Update counters
  elements.eventCount.textContent = 'Events: 0';
  elements.thinkingCount.textContent = '0';
  elements.toolsCount.textContent = '0';
  elements.todoCount.textContent = '0';
  if (elements.hooksCount) {
    elements.hooksCount.textContent = '0';
  }

  // Clear filters
  state.thinkingFilter = '';
  state.toolsFilter = '';
  elements.thinkingFilter.value = '';
  elements.toolsFilter.value = '';
  elements.thinkingFilterClear.classList.add('panel-filter-hidden');
  elements.toolsFilterClear.classList.add('panel-filter-hidden');

  // Clear panel contents with enhanced empty states
  elements.thinkingContent.innerHTML = `
    <div class="empty-state">
      <div class="empty-state-icon">🧠</div>
      <p class="empty-state-title">Waiting for thinking...</p>
      <p class="empty-state-subtitle">Claude's thoughts will appear here</p>
    </div>
  `;

  elements.toolsContent.innerHTML = `
    <div class="empty-state">
      <div class="empty-state-icon">🔧</div>
      <p class="empty-state-title">No tool activity</p>
      <p class="empty-state-subtitle">Tool calls will be logged here</p>
    </div>
  `;

  elements.todoContent.innerHTML = `
    <div class="empty-state">
      <div class="empty-state-icon">📋</div>
      <p class="empty-state-title">No active tasks</p>
      <p class="empty-state-subtitle">Todo items will appear here</p>
    </div>
  `;

  if (elements.hooksContent) {
    elements.hooksContent.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">&#9881;</div>
        <p class="empty-state-title">No hook activity</p>
        <p class="empty-state-subtitle">Hook executions will appear here</p>
      </div>
    `;
  }

  // Show feedback toast
  showToast('Panels cleared', 'info');

  // Announce for screen readers
  announceStatus('All panels cleared');

  // Update export button state (disabled when "All" is selected)
  updateExportButtonState();

  // NOTE: Plan state is intentionally NOT cleared.
  // Plans are workspace-level resources and should persist across clear operations.
  // Only events, sessions, and todos are cleared.
}

// ============================================
// Event Listeners
// ============================================

// Connection overlay retry button
elements.connectionOverlayRetry.addEventListener('click', retryNow);

// Export button
elements.exportBtn.addEventListener('click', tryOpenExportModal);

// Auto-scroll checkbox
elements.autoScrollCheckbox.addEventListener('change', () => {
  state.autoScroll = elements.autoScrollCheckbox.checked;
  state.userScrolledUp = false;
});

// Panel scroll detection for smart scroll
elements.thinkingContent.addEventListener('scroll', () => {
  handlePanelScroll(elements.thinkingContent);
});
elements.toolsContent.addEventListener('scroll', () => {
  handlePanelScroll(elements.toolsContent);
});

// Thinking filter
elements.thinkingFilter.addEventListener('input', () => {
  state.thinkingFilter = elements.thinkingFilter.value;
  filterAllThinking();
});
elements.thinkingFilterClear.addEventListener('click', () => {
  state.thinkingFilter = '';
  elements.thinkingFilter.value = '';
  filterAllThinking();
  elements.thinkingFilter.focus();
});

// Tools filter
elements.toolsFilter.addEventListener('input', () => {
  state.toolsFilter = elements.toolsFilter.value;
  filterAllTools();
});
elements.toolsFilterClear.addEventListener('click', () => {
  state.toolsFilter = '';
  elements.toolsFilter.value = '';
  filterAllTools();
  elements.toolsFilter.focus();
});

// Reset keyboard mode on mouse use
document.addEventListener('mousedown', () => {
  state.keyboardMode = false;
  document.body.classList.remove('keyboard-mode');
});

// Plan selector toggle
elements.planSelectorBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  togglePlanSelector();
});

// Close plan selector when clicking outside
document.addEventListener('click', (e) => {
  if (state.planSelectorOpen) {
    const target = e.target as HTMLElement;
    if (!elements.planSelectorBtn.contains(target) && !elements.planSelectorDropdown.contains(target)) {
      closePlanSelector();
    }
  }
});

// Close plan selector on Escape key
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && state.planSelectorOpen) {
    closePlanSelector();
  }
});

// Close plan selector on window resize (position would be stale)
window.addEventListener('resize', () => {
  if (state.planSelectorOpen) {
    closePlanSelector();
  }
});

// Plan toolbar action buttons
elements.planOpenBtn.addEventListener('click', handlePlanOpenClick);
elements.planRevealBtn.addEventListener('click', handlePlanRevealClick);

// Right-click context menu on plan content
elements.planContent.addEventListener('contextmenu', handlePlanContextMenu);

// Right-click context menu on plan selector button
elements.planSelectorBtn.addEventListener('contextmenu', handlePlanContextMenu);

// Right-click context menu on file paths in tool entries
elements.toolsContent.addEventListener('contextmenu', (e) => {
  const target = e.target as HTMLElement;
  const filePathEl = target.closest('.tool-file-path') as HTMLElement | null;
  if (filePathEl) {
    e.preventDefault();
    const path = filePathEl.dataset.path;
    if (path) {
      showFileContextMenu(e.clientX, e.clientY, path);
    }
  }
});

// Context menu actions
elements.contextMenuOpen.addEventListener('click', handleContextMenuOpen);
elements.contextMenuReveal.addEventListener('click', handleContextMenuReveal);

// Close context menu when clicking outside
document.addEventListener('click', (e) => {
  const target = e.target as HTMLElement;
  if (!elements.planContextMenu.contains(target)) {
    hidePlanContextMenu();
  }
  // Also close session context menu
  if (elements.sessionContextMenu && !elements.sessionContextMenu.contains(target)) {
    hideSessionContextMenu();
  }
});

// Close context menu on Escape key
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    hidePlanContextMenu();
    hideSessionContextMenu();
  }
});

// Session context menu action
if (elements.sessionContextMenuReveal) {
  elements.sessionContextMenuReveal.addEventListener('click', handleRevealSessionInFinder);
}

// ============================================
// Initialize
// ============================================

// Restore persisted state from localStorage before connecting
restorePanelCollapseState();
restorePanelVisibility();
restoreTodosFromStorage();
loadSessionPlanAssociations();

// Initialize theme system - load preference and apply theme
const savedTheme = loadThemePreference();
initThemeToggle(savedTheme);

// Update UI with restored state
if (state.todos.length > 0) {
  renderTodoPanel();
}
if (state.sessions.size > 0) {
  updateSessionFilter();
}

// Hide session-specific panels on initial load when "All" is selected
if (state.selectedSession === 'all') {
  elements.todoPanel?.classList.add('session-hidden');
  elements.planPanel?.classList.add('session-hidden');
}

// Initialize handler modules with callbacks
initThinking({
  getCurrentAgentContext,
  getAgentDisplayName,
  appendAndTrim,
  smartScroll,
});

initTools({
  getCurrentAgentContext,
  getAgentDisplayName,
  parseTodoWriteInput,
  detectPlanAccess,
  appendAndTrim,
  smartScroll,
});

initSessions({
  displayPlan,
  displayEmptyPlan,
  displaySessionPlanEmpty,
  clearSessionTodos,
  renderTodoPanel,
  updateTodosForCurrentSession,
  showToast,
  updateExportButtonState,
  clearAllPanels,
});

initPlans({
  findActiveAgent,
  showToast,
  announceStatus,
});

initTodos({
  showToast,
  updateSessionFilter,
});

initHooks({
  appendAndTrim,
  smartScroll,
});

// Initialize UI modules
initViews({
  announceStatus: announceStatus,
  focusActivePanel: focusActivePanel,
  togglePanelSelector: togglePanelSelector,
});
initPanels({
  announceStatus: announceStatus,
});
initKeyboard({
  clearAllPanels: clearAllPanels,
  handlePlanOpenClick: handlePlanOpenClick,
  handlePlanRevealClick: handlePlanRevealClick,
  togglePanelSelector: togglePanelSelector,
  tryOpenExportModal: tryOpenExportModal,
});
initPanelSelector({
  announceStatus: announceStatus,
});
initExportModal({
  showToast: showToast,
  announceStatus: announceStatus,
});

// Initialize view tabs navigation
initViewTabs();

// Hide Todo and Plan tabs on initial load when "All" sessions is selected
if (state.selectedSession === 'all') {
  updateSessionViewTabs(true);
}

// Set initial export button state (disabled when "All" is selected)
updateExportButtonState();

// Initialize panel collapse buttons
initPanelCollapseButtons();

// Apply restored panel visibility to DOM
applyAllPanelVisibility();

// Initialize resizable panes
initResizers();

// Initialize drag-to-reorder for collapsed panels
initDragReorder();

// Initialize custom tooltip system for session badges
initTooltip();

// Initialize status bar session click handler
initStatusBarSession();

// Initialize WebSocket with callbacks
initWebSocket({
  onEvent: handleEvent,
  showToast: showToast,
  announceStatus: announceStatus,
});

connect();
console.log('[Dashboard] Thinking Monitor initialized');
console.log('[Dashboard] Keyboard shortcuts: a/t/o/d/p=views, Shift+t/o/d=collapse, Shift+p=panel settings, c=clear, s=scroll, /=search, Esc=clear filters');
console.log('[Dashboard] Plan shortcuts: Cmd+O=open, Cmd+Shift+R=reveal, Cmd+E=export, right-click=context menu');
