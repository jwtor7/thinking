/**
 * View Navigation Management
 *
 * Handles switching between different dashboard views (all, thinking, tools, todo, plan)
 * and managing the UI state for view-specific filtering and display.
 */

import { state } from '../state';
import { elements } from './elements';

/**
 * View type definition
 */
export type ViewType = 'all' | 'thinking' | 'tools' | 'todo' | 'hooks' | 'plan';

/**
 * Callbacks for view navigation events
 */
export interface ViewCallbacks {
  announceStatus: (message: string) => void;
  focusActivePanel: (view: ViewType) => void;
}

let callbacks: ViewCallbacks | null = null;

/**
 * Initialize view navigation callbacks.
 * Must be called once during app startup.
 */
export function initViews(cbs: ViewCallbacks): void {
  callbacks = cbs;
}

/**
 * Create the view navigation tabs if they don't exist.
 */
export function initViewTabs(): void {
  // Check if view tabs already exist
  if (elements.viewTabs) {
    return;
  }

  // Create view tabs container
  const viewTabsContainer = document.createElement('nav');
  viewTabsContainer.id = 'view-tabs';
  viewTabsContainer.className = 'view-tabs';

  const views: { id: ViewType; label: string; shortcut: string }[] = [
    { id: 'all', label: 'All', shortcut: 'a' },
    { id: 'thinking', label: 'Thinking', shortcut: 't' },
    { id: 'tools', label: 'Tools', shortcut: 'o' },
    { id: 'todo', label: 'Todo', shortcut: 'd' },
    { id: 'hooks', label: 'Hooks', shortcut: 'h' },
    { id: 'plan', label: 'Plan', shortcut: 'p' },
  ];

  views.forEach((view) => {
    const tab = document.createElement('button');
    tab.className = `view-tab${state.activeView === view.id ? ' active' : ''}`;
    tab.dataset.view = view.id;
    tab.innerHTML = `${view.label}<span class="view-tab-shortcut">${view.shortcut}</span>`;
    tab.addEventListener('click', () => selectView(view.id));
    viewTabsContainer.appendChild(tab);
  });

  // Insert after the header
  const header = document.querySelector('.header');
  if (header && header.parentNode) {
    header.parentNode.insertBefore(viewTabsContainer, header.nextSibling);
  }

  elements.viewTabs = viewTabsContainer;
}

/**
 * Select a view to display.
 */
export function selectView(viewId: ViewType): void {
  state.activeView = viewId;
  updateViewTabs();
  applyViewFilter();
}

/**
 * Update view tab active states.
 */
export function updateViewTabs(): void {
  if (!elements.viewTabs) return;

  const tabs = elements.viewTabs.querySelectorAll('.view-tab');
  tabs.forEach((tab) => {
    const tabEl = tab as HTMLElement;
    if (tabEl.dataset.view === state.activeView) {
      tabEl.classList.add('active');
    } else {
      tabEl.classList.remove('active');
    }
  });
}

/**
 * Apply the view filter to show/hide panels.
 */
export function applyViewFilter(): void {
  const panels = elements.panels;
  if (!panels) return;

  // Remove any existing view-specific classes
  panels.classList.remove('view-all', 'view-thinking', 'view-tools', 'view-todo', 'view-hooks', 'view-plan');

  // Add the current view class
  panels.classList.add(`view-${state.activeView}`);

  // Set data-view attribute for CSS targeting (especially mobile)
  panels.dataset.view = state.activeView;

  // Show/hide panels based on active view
  const showAll = state.activeView === 'all';

  if (elements.thinkingPanel) {
    elements.thinkingPanel.style.display =
      (showAll || state.activeView === 'thinking') ? '' : 'none';
  }
  if (elements.toolsPanel) {
    elements.toolsPanel.style.display =
      (showAll || state.activeView === 'tools') ? '' : 'none';
  }
  if (elements.todoPanel) {
    elements.todoPanel.style.display =
      (showAll || state.activeView === 'todo') ? '' : 'none';
  }
  if (elements.hooksPanel) {
    elements.hooksPanel.style.display =
      (showAll || state.activeView === 'hooks') ? '' : 'none';
  }
  if (elements.planPanel) {
    elements.planPanel.style.display =
      (showAll || state.activeView === 'plan') ? '' : 'none';
  }

  // Adjust layout for single-panel view
  if (!showAll) {
    panels.classList.add('single-view');
  } else {
    panels.classList.remove('single-view');
  }

  // Announce view change for screen readers
  if (callbacks) {
    callbacks.announceStatus(`Switched to ${state.activeView} view`);

    // Focus the active panel content for keyboard navigation
    callbacks.focusActivePanel(state.activeView);
  }
}
