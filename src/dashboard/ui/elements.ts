/**
 * DOM Element References
 *
 * Centralized references to DOM elements used throughout the dashboard.
 * Elements are queried once at module load time.
 */

export const elements = {
  connectionStatus: document.getElementById('connection-status')!,
  sessionFilter: document.getElementById('session-filter'),
  exportBtn: document.getElementById('export-btn')!,
  autoScrollCheckbox: document.getElementById('auto-scroll') as HTMLInputElement,
  panelSelectorBtn: null as HTMLButtonElement | null, // Created dynamically in views.ts
  viewTabs: document.getElementById('view-tabs'),
  thinkingPanel: document.querySelector('.panel-thinking') as HTMLElement,
  toolsPanel: document.querySelector('.panel-tools') as HTMLElement,
  todoPanel: document.querySelector('.panel-todo') as HTMLElement,
  planPanel: document.querySelector('.panel-plan') as HTMLElement,
  thinkingContent: document.getElementById('thinking-content')!,
  thinkingCount: document.getElementById('thinking-count')!,
  thinkingFilter: document.getElementById('thinking-filter') as HTMLInputElement,
  thinkingFilterClear: document.getElementById('thinking-filter-clear')!,
  toolsContent: document.getElementById('tools-content')!,
  toolsCount: document.getElementById('tools-count')!,
  toolsFilter: document.getElementById('tools-filter') as HTMLInputElement,
  toolsFilterClear: document.getElementById('tools-filter-clear')!,
  hooksPanel: document.querySelector('.panel-hooks') as HTMLElement,
  hooksContent: document.getElementById('hooks-content'),
  hooksCount: document.getElementById('hooks-count'),
  hooksFilter: document.getElementById('hooks-filter') as HTMLSelectElement | null,
  hooksCollapseBtn: document.querySelector('.panel-hooks .panel-collapse-btn') as HTMLButtonElement,
  todoContent: document.getElementById('todo-content')!,
  todoCount: document.getElementById('todo-count')!,
  planContent: document.getElementById('plan-content')!,
  planMeta: document.getElementById('plan-meta')!,
  planOpenBtn: document.getElementById('plan-open-btn') as HTMLButtonElement,
  planRevealBtn: document.getElementById('plan-reveal-btn') as HTMLButtonElement,
  planSelectorBtn: document.getElementById('plan-selector-btn')!,
  planSelectorText: document.getElementById('plan-selector-text')!,
  planSelectorDropdown: document.getElementById('plan-selector-dropdown')!,
  planContextMenu: document.getElementById('plan-context-menu')!,
  contextMenuOpen: document.getElementById('context-menu-open')!,
  contextMenuReveal: document.getElementById('context-menu-reveal')!,
  serverInfo: document.getElementById('server-info')!,
  eventCount: document.getElementById('event-count')!,
  agentsCount: document.getElementById('agents-count'),
  connectionOverlay: document.getElementById('connection-overlay')!,
  connectionOverlayMessage: document.getElementById('connection-overlay-message')!,
  connectionOverlayRetry: document.getElementById('connection-overlay-retry')!,
  panels: document.querySelector('.panels') as HTMLElement,
  thinkingCollapseBtn: document.querySelector('.panel-thinking .panel-collapse-btn') as HTMLButtonElement,
  todoCollapseBtn: document.querySelector('.panel-todo .panel-collapse-btn') as HTMLButtonElement,
  toolsCollapseBtn: document.querySelector('.panel-tools .panel-collapse-btn') as HTMLButtonElement,
  planCollapseBtn: document.querySelector('.panel-plan .panel-collapse-btn') as HTMLButtonElement,
  // Session context menu
  sessionContextMenu: document.getElementById('session-context-menu'),
  sessionContextMenuReveal: document.getElementById('session-context-menu-reveal'),
  // Status bar active session indicator
  activeSessionIndicator: document.getElementById('active-session-indicator'),
  // Session tooltip element (created dynamically)
  sessionTooltip: null as HTMLElement | null,
  // Team panel elements
  teamPanel: document.querySelector('.panel-team') as HTMLElement,
  teamName: document.getElementById('team-name'),
  teamMemberGrid: document.getElementById('team-member-grid'),
  teamMessages: document.getElementById('team-messages'),
  teamCollapseBtn: document.querySelector('.panel-team .panel-collapse-btn') as HTMLButtonElement,
  // Tasks panel elements
  tasksPanel: document.querySelector('.panel-tasks') as HTMLElement,
  tasksPending: document.getElementById('tasks-pending'),
  tasksInProgress: document.getElementById('tasks-in-progress'),
  tasksCompleted: document.getElementById('tasks-completed'),
  tasksPendingCount: document.getElementById('tasks-pending-count'),
  tasksInProgressCount: document.getElementById('tasks-in-progress-count'),
  tasksCompletedCount: document.getElementById('tasks-completed-count'),
  tasksCollapseBtn: document.querySelector('.panel-tasks .panel-collapse-btn') as HTMLButtonElement,
  // Agent tree content (in the session filter area or dedicated section)
  agentTreeContent: document.getElementById('agent-tree-content'),
  // Timeline panel elements
  timelinePanel: document.querySelector('.panel-timeline') as HTMLElement,
  timelineEntries: document.getElementById('timeline-entries'),
  timelineCount: document.getElementById('timeline-count'),
  timelineFilter: document.getElementById('timeline-filter') as HTMLInputElement | null,
  timelineFilterClear: document.getElementById('timeline-filter-clear'),
  timelineCollapseBtn: document.querySelector('.panel-timeline .panel-collapse-btn') as HTMLButtonElement,
  // Activity pulse indicator
  activityPulse: document.getElementById('activity-pulse'),
  activityPulseDot: document.querySelector('.activity-pulse-dot'),
  activityPulseRate: document.querySelector('.activity-pulse-rate'),
};
