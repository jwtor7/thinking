/**
 * View Navigation Management
 *
 * Handles switching between different dashboard views (all, thinking, tools, todo, plan)
 * and managing the UI state for view-specific filtering and display.
 */

import { state } from '../state.ts';
import { elements } from './elements.ts';
import type { PanelName } from './panels.ts';

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
  togglePanelSelector: () => void;
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
    { id: 'hooks', label: 'Hooks', shortcut: 'h' },
    { id: 'plan', label: 'Plan', shortcut: 'p' },
    { id: 'todo', label: 'Todo', shortcut: 'd' },
  ];

  views.forEach((view) => {
    const tab = document.createElement('button');
    tab.className = `view-tab${state.activeView === view.id ? ' active' : ''}`;
    tab.dataset.view = view.id;
    tab.innerHTML = `${view.label}<span class="view-tab-shortcut">${view.shortcut}</span>`;
    tab.addEventListener('click', () => selectView(view.id));
    viewTabsContainer.appendChild(tab);
  });

  // Add spacer to push gear icon to the right
  const spacer = document.createElement('div');
  spacer.className = 'view-tabs-spacer';
  viewTabsContainer.appendChild(spacer);

  // Add panel selector gear button
  const panelSelectorBtn = document.createElement('button');
  panelSelectorBtn.id = 'panel-selector-btn';
  panelSelectorBtn.className = 'btn btn-icon';
  panelSelectorBtn.title = 'Panel Settings (Shift+P)';
  panelSelectorBtn.setAttribute('aria-label', 'Panel visibility settings');
  panelSelectorBtn.innerHTML = '<span class="btn-icon-gear">&#9881;</span>';
  panelSelectorBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (callbacks) {
      callbacks.togglePanelSelector();
    }
  });
  viewTabsContainer.appendChild(panelSelectorBtn);

  // Update elements reference
  elements.panelSelectorBtn = panelSelectorBtn;

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
 * Update view tab visibility based on session selection.
 * Hides Todo and Plan tabs when "All sessions" is selected since they're session-specific.
 * If currently viewing Todo or Plan, auto-switches to "All" view.
 *
 * @param isAllSessions - True when "All" sessions is selected
 */
export function updateSessionViewTabs(isAllSessions: boolean): void {
  if (!elements.viewTabs) return;

  const todoTab = elements.viewTabs.querySelector('[data-view="todo"]') as HTMLElement | null;
  const planTab = elements.viewTabs.querySelector('[data-view="plan"]') as HTMLElement | null;

  if (isAllSessions) {
    // Hide Todo and Plan tabs
    if (todoTab) todoTab.style.display = 'none';
    if (planTab) planTab.style.display = 'none';

    // If currently on Todo or Plan view, switch to All view
    if (state.activeView === 'todo' || state.activeView === 'plan') {
      selectView('all');
    }
  } else {
    // Show Todo and Plan tabs
    if (todoTab) todoTab.style.display = '';
    if (planTab) planTab.style.display = '';
  }
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

  // Show/hide panels based on active view AND panel visibility settings
  // "All" view shows only Thinking and Tool Activity panels
  // Panels hidden via Panel Selector stay hidden regardless of view
  const showAll = state.activeView === 'all';
  const pv = state.panelVisibility;

  // Helper to apply visibility - manages both panel-hidden class and display style
  const applyVisibility = (panel: HTMLElement | null, isVisible: boolean) => {
    if (!panel) return;
    if (isVisible) {
      panel.classList.remove('panel-hidden');
      panel.style.display = '';
    } else {
      panel.classList.add('panel-hidden');
      panel.style.display = 'none';
    }
  };

  applyVisibility(elements.thinkingPanel, pv.thinking && (showAll || state.activeView === 'thinking'));
  applyVisibility(elements.toolsPanel, pv.tools && (showAll || state.activeView === 'tools'));
  // Todo and Plan are only shown when explicitly selected; Hooks shows in All view too
  applyVisibility(elements.todoPanel, pv.todo && state.activeView === 'todo');
  applyVisibility(elements.hooksPanel, pv.hooks && (showAll || state.activeView === 'hooks'));
  applyVisibility(elements.planPanel, pv.plan && state.activeView === 'plan');

  // Adjust layout for single-panel view
  if (!showAll) {
    panels.classList.add('single-view');

    // In single-panel view, ensure the active panel is expanded
    // (collapsing doesn't make sense when viewing only one panel)
    const panelName = state.activeView as PanelName;
    if (state.panelCollapseState[panelName]) {
      state.panelCollapseState[panelName] = false;

      // Get the panel element and remove collapsed class
      const panelElements: Record<PanelName, HTMLElement | null> = {
        thinking: elements.thinkingPanel,
        tools: elements.toolsPanel,
        todo: elements.todoPanel,
        hooks: elements.hooksPanel,
        plan: elements.planPanel,
      };
      const panel = panelElements[panelName];
      if (panel) {
        panel.classList.remove('collapsed');
      }
    }
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
