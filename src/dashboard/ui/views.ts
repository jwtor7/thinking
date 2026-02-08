/**
 * View Navigation Management
 *
 * Handles switching between different dashboard views (thinking, tools, tasks, plan, etc.)
 * and managing the UI state for view-specific filtering and display.
 */

import { state } from '../state.ts';
import { elements } from './elements.ts';
import type { PanelName } from './panels.ts';

/**
 * View type definition
 */
export type ViewType = 'thinking' | 'tools' | 'hooks' | 'plan' | 'team' | 'tasks' | 'timeline' | 'agents';

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
    { id: 'agents', label: 'Agents', shortcut: 'a' },
    { id: 'plan', label: 'Plan', shortcut: 'p' },
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
 * Hides Plan, Team, and Tasks tabs when "All sessions" is selected.
 * If currently viewing a session-specific tab, auto-switches to Thinking.
 *
 * @param isAllSessions - True when "All" sessions is selected
 */
export function updateSessionViewTabs(isAllSessions: boolean): void {
  if (!elements.viewTabs) return;

  const planTab = elements.viewTabs.querySelector('[data-view="plan"]') as HTMLElement | null;

  const teamTab = elements.viewTabs.querySelector('[data-view="team"]') as HTMLElement | null;
  const tasksTab = elements.viewTabs.querySelector('[data-view="tasks"]') as HTMLElement | null;

  if (isAllSessions) {
    // Hide session-specific tabs
    if (planTab) planTab.style.display = 'none';
    if (teamTab) teamTab.style.display = 'none';
    if (tasksTab) tasksTab.style.display = 'none';

    // If currently on a session-specific view, switch to thinking view
    if (state.activeView === 'plan' || state.activeView === 'team' || state.activeView === 'tasks') {
      selectView('thinking');
    }
  } else {
    // Show session-specific tabs
    if (planTab) planTab.style.display = '';
    if (teamTab) teamTab.style.display = '';
    if (tasksTab) tasksTab.style.display = '';
  }
}

/**
 * Apply the view filter to show/hide panels.
 */
export function applyViewFilter(): void {
  const panels = elements.panels;
  if (!panels) return;

  // Remove any existing view-specific classes
  panels.classList.remove('view-thinking', 'view-tools', 'view-hooks', 'view-plan', 'view-team', 'view-tasks', 'view-timeline', 'view-agents');

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
  applyVisibility(elements.hooksPanel, pv.hooks && state.activeView === 'hooks');
  applyVisibility(elements.planPanel, pv.plan && state.activeView === 'plan');
  applyVisibility(elements.teamPanel, pv.team && state.activeView === 'team');
  applyVisibility(elements.tasksPanel, pv.tasks && state.activeView === 'tasks');
  applyVisibility(elements.timelinePanel, pv.timeline && state.activeView === 'timeline');
  applyVisibility(elements.agentsPanel, pv.agents && state.activeView === 'agents');

  // Always single-view — ensure the active panel is expanded
  panels.classList.add('single-view');
  const panelName = state.activeView as PanelName;
  if (state.panelCollapseState[panelName]) {
    state.panelCollapseState[panelName] = false;

    const panelElements: Record<PanelName, HTMLElement | null> = {
      thinking: elements.thinkingPanel,
      tools: elements.toolsPanel,
      hooks: elements.hooksPanel,
      plan: elements.planPanel,
      team: elements.teamPanel,
      tasks: elements.tasksPanel,
      timeline: elements.timelinePanel,
      agents: elements.agentsPanel,
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
