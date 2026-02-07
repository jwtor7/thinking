/**
 * View Navigation Management
 *
 * Handles switching between different dashboard views (thinking, tools, todo, plan, etc.)
 * and managing the UI state for view-specific filtering and display.
 */

import { state } from '../state.ts';
import { elements } from './elements.ts';
import type { PanelName } from './panels.ts';

/**
 * View type definition
 */
export type ViewType = 'thinking' | 'tools' | 'todo' | 'hooks' | 'plan' | 'team' | 'tasks' | 'timeline';

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
    { id: 'thinking', label: 'Thinking', shortcut: 't' },
    { id: 'tools', label: 'Tools', shortcut: 'o' },
    { id: 'hooks', label: 'Hooks', shortcut: 'h' },
    { id: 'team', label: 'Team', shortcut: 'm' },
    { id: 'tasks', label: 'Tasks', shortcut: 'k' },
    { id: 'timeline', label: 'Timeline', shortcut: 'l' },
    { id: 'plan', label: 'Plan', shortcut: 'p' },
    { id: 'todo', label: 'Todo', shortcut: 'd' },
  ];

  views.forEach((view) => {
    const tab = document.createElement('button');
    tab.className = `view-tab${state.activeView === view.id ? ' active' : ''}`;
    tab.dataset.view = view.id;
    tab.innerHTML = `${view.label}<span class="tab-badge" data-badge-view="${view.id}"></span><span class="view-tab-shortcut">${view.shortcut}</span>`;
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
    // Hide Todo and Plan tabs (session-specific)
    if (todoTab) todoTab.style.display = 'none';
    if (planTab) planTab.style.display = 'none';

    // If currently on Todo or Plan view, switch to All view
    if (state.activeView === 'todo' || state.activeView === 'plan') {
      selectView('thinking');
    }
  } else {
    // Show Todo and Plan tabs
    if (todoTab) todoTab.style.display = '';
    if (planTab) planTab.style.display = '';
  }

  // Team and Tasks tabs are always visible once events arrive (not session-specific)
  // They auto-show/hide based on whether data exists via showTeamPanel/showTasksPanel callbacks
}

/**
 * Apply the view filter to show/hide panels.
 */
export function applyViewFilter(): void {
  const panels = elements.panels;
  if (!panels) return;

  // Remove any existing view-specific classes
  panels.classList.remove('view-thinking', 'view-tools', 'view-todo', 'view-hooks', 'view-plan', 'view-team', 'view-tasks', 'view-timeline');

  // Add the current view class
  panels.classList.add(`view-${state.activeView}`);

  // Set data-view attribute for CSS targeting (especially mobile)
  panels.dataset.view = state.activeView;

  // Show/hide panels based on active view AND panel visibility settings
  // Each view shows only its corresponding panel
  // Panels hidden via Panel Selector stay hidden regardless of view
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

  applyVisibility(elements.thinkingPanel, pv.thinking && state.activeView === 'thinking');
  applyVisibility(elements.toolsPanel, pv.tools && state.activeView === 'tools');
  applyVisibility(elements.todoPanel, pv.todo && state.activeView === 'todo');
  applyVisibility(elements.hooksPanel, pv.hooks && state.activeView === 'hooks');
  applyVisibility(elements.planPanel, pv.plan && state.activeView === 'plan');
  applyVisibility(elements.teamPanel, pv.team && state.activeView === 'team');
  applyVisibility(elements.tasksPanel, pv.tasks && state.activeView === 'tasks');
  applyVisibility(elements.timelinePanel, pv.timeline && state.activeView === 'timeline');

  // Always single-view — ensure the active panel is expanded
  panels.classList.add('single-view');
  const panelName = state.activeView as PanelName;
  if (state.panelCollapseState[panelName]) {
    state.panelCollapseState[panelName] = false;

    const panelElements: Record<PanelName, HTMLElement | null> = {
      thinking: elements.thinkingPanel,
      tools: elements.toolsPanel,
      todo: elements.todoPanel,
      hooks: elements.hooksPanel,
      plan: elements.planPanel,
      team: elements.teamPanel,
      tasks: elements.tasksPanel,
      timeline: elements.timelinePanel,
    };
    const panel = panelElements[panelName];
    if (panel) {
      panel.classList.remove('collapsed');
    }
  }

  // Announce view change for screen readers
  if (callbacks) {
    callbacks.announceStatus(`Switched to ${state.activeView} view`);

    // Focus the active panel content for keyboard navigation
    callbacks.focusActivePanel(state.activeView);
  }
}

/**
 * Update the count badge on a view tab.
 * Hides the badge when count is 0.
 */
export function updateTabBadge(view: ViewType, count: number): void {
  const badge = document.querySelector(`.tab-badge[data-badge-view="${view}"]`) as HTMLElement | null;
  if (!badge) return;

  if (count > 0) {
    badge.textContent = count > 999 ? '999+' : String(count);
    badge.style.display = '';
  } else {
    badge.textContent = '';
    badge.style.display = 'none';
  }
}
