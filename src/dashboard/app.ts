/**
 * Thinking Monitor Dashboard - Client Application
 *
 * WebSocket client that connects to the monitor server and renders
 * real-time events in the dashboard panels.
 *
 * Phase 4 Polish Features:
 * - Collapsible thinking blocks with toggle controls
 * - Enhanced tool call visualization with timing and expandable details
 * - Improved agent tree visualization with status indicators
 * - Smart auto-scroll (pauses when user scrolls up)
 * - Event type filtering (thinking filter, tool filter)
 * - Connection status with reconnect countdown
 * - Keyboard shortcuts for agent switching (1-9, 0 for All)
 * - Improved responsiveness
 */

// ============================================
// Types (mirrored from server for client use)
// ============================================

type MonitorEventType =
  | 'tool_start'
  | 'tool_end'
  | 'agent_start'
  | 'agent_stop'
  | 'session_start'
  | 'session_stop'
  | 'thinking'
  | 'plan_update'
  | 'plan_delete'
  | 'plan_list'
  | 'connection_status';

interface MonitorEvent {
  type: MonitorEventType;
  timestamp: string;
  sessionId?: string;
  agentId?: string;
  [key: string]: unknown;
}

interface WebSocketMessage {
  event: MonitorEvent;
  seq?: number;
}

// ============================================
// Configuration
// ============================================

const WS_URL = 'ws://localhost:3355';
const RECONNECT_BASE_DELAY_MS = 1000;
const RECONNECT_MAX_DELAY_MS = 30000;
const MAX_ENTRIES = 500; // Max entries per panel to prevent memory issues
const SCROLL_THRESHOLD = 50; // Pixels from bottom to consider "at bottom"

// ============================================
// State
// ============================================

interface AppState {
  connected: boolean;
  autoScroll: boolean;
  userScrolledUp: boolean;
  eventCount: number;
  thinkingCount: number;
  toolsCount: number;
  agentsCount: number;
  selectedAgent: string;
  agents: Map<string, AgentInfo>;
  pendingTools: Map<string, ToolInfo>;
  thinkingFilter: string;
  toolsFilter: string;
  reconnectAttempt: number;
  reconnectCountdown: number;
  keyboardMode: boolean;
  // Session tracking for multi-session support
  sessions: Map<string, SessionInfo>;
  currentSessionId: string | null;
  // Session filtering - 'all' or a specific session ID
  selectedSession: string;
  // Plan tracking for multi-plan support
  plans: Map<string, PlanInfo>;
  currentPlanPath: string | null;
  // Plan list from server (metadata only, no content)
  planList: PlanListItem[];
  // Plan selector dropdown open state
  planSelectorOpen: boolean;
  // Context menu state
  contextMenuFilePath: string | null;
  // Active view tab for navigation
  activeView: 'all' | 'thinking' | 'tools' | 'agents' | 'plan';
}

interface PlanInfo {
  path: string;
  filename: string;
  content: string;
  lastModified: number; // Timestamp from when we received the update
  sessionId?: string;
  agentId?: string; // The agent that was active when this plan was modified
}

/** Plan metadata from the server's plan list */
interface PlanListItem {
  path: string;
  filename: string;
  lastModified: number;
}

interface SessionInfo {
  id: string;
  workingDirectory?: string;
  startTime: string;
  endTime?: string;
  active: boolean;
  color: string; // For visual distinction
}

interface AgentInfo {
  id: string;
  name?: string;
  parentId?: string;
  sessionId?: string;
  active: boolean;
  status?: 'running' | 'success' | 'failure' | 'cancelled';
  startTime: string;
  endTime?: string;
}

interface ToolInfo {
  id: string;
  name: string;
  input?: string;
  startTime: string;
  element?: HTMLElement;
}

const state: AppState = {
  connected: false,
  autoScroll: true,
  userScrolledUp: false,
  eventCount: 0,
  thinkingCount: 0,
  toolsCount: 0,
  agentsCount: 0,
  selectedAgent: 'all',
  agents: new Map(),
  pendingTools: new Map(),
  thinkingFilter: '',
  toolsFilter: '',
  reconnectAttempt: 0,
  reconnectCountdown: 0,
  keyboardMode: false,
  sessions: new Map(),
  currentSessionId: null,
  selectedSession: 'all',
  plans: new Map(),
  currentPlanPath: null,
  planList: [],
  planSelectorOpen: false,
  contextMenuFilePath: null,
  activeView: 'all',
};

// Session colors for visual distinction
const SESSION_COLORS = [
  '#58a6ff', // blue
  '#3fb950', // green
  '#a371f7', // purple
  '#39c5cf', // cyan
  '#d29922', // yellow
  '#db6d28', // orange
  '#f85149', // red
  '#8b949e', // gray
];

// ============================================
// DOM Elements
// ============================================

const elements = {
  connectionStatus: document.getElementById('connection-status')!,
  sessionIndicator: document.getElementById('session-indicator'),
  sessionFilter: document.getElementById('session-filter'),
  clearBtn: document.getElementById('clear-btn')!,
  autoScrollCheckbox: document.getElementById('auto-scroll') as HTMLInputElement,
  agentTabs: document.getElementById('agent-tabs')!,
  viewTabs: document.getElementById('view-tabs'),
  thinkingPanel: document.querySelector('.panel-thinking') as HTMLElement,
  toolsPanel: document.querySelector('.panel-tools') as HTMLElement,
  agentsPanel: document.querySelector('.panel-agents') as HTMLElement,
  planPanel: document.querySelector('.panel-plan') as HTMLElement,
  thinkingContent: document.getElementById('thinking-content')!,
  thinkingCount: document.getElementById('thinking-count')!,
  thinkingFilter: document.getElementById('thinking-filter') as HTMLInputElement,
  thinkingFilterClear: document.getElementById('thinking-filter-clear')!,
  toolsContent: document.getElementById('tools-content')!,
  toolsCount: document.getElementById('tools-count')!,
  toolsFilter: document.getElementById('tools-filter') as HTMLInputElement,
  toolsFilterClear: document.getElementById('tools-filter-clear')!,
  agentsContent: document.getElementById('agents-content')!,
  agentsCount: document.getElementById('agents-count')!,
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
  connectionOverlay: document.getElementById('connection-overlay')!,
  connectionOverlayMessage: document.getElementById('connection-overlay-message')!,
  connectionOverlayRetry: document.getElementById('connection-overlay-retry')!,
  panels: document.querySelector('.panels') as HTMLElement,
  toast: null as HTMLElement | null,
};

// ============================================
// WebSocket Connection
// ============================================

let ws: WebSocket | null = null;
let reconnectTimeout: number | null = null;
let countdownInterval: number | null = null;

function connect(): void {
  if (ws?.readyState === WebSocket.OPEN || ws?.readyState === WebSocket.CONNECTING) {
    return;
  }

  updateConnectionStatus('connecting');
  hideConnectionOverlay();

  ws = new WebSocket(WS_URL);

  ws.onopen = () => {
    console.log('[Dashboard] Connected to monitor server');
    state.connected = true;
    state.reconnectAttempt = 0;
    updateConnectionStatus('connected');
    hideConnectionOverlay();

    if (reconnectTimeout) {
      clearTimeout(reconnectTimeout);
      reconnectTimeout = null;
    }
    if (countdownInterval) {
      clearInterval(countdownInterval);
      countdownInterval = null;
    }
  };

  ws.onclose = () => {
    console.log('[Dashboard] Disconnected from monitor server');
    state.connected = false;
    updateConnectionStatus('disconnected');
    scheduleReconnect();
  };

  ws.onerror = (error) => {
    console.error('[Dashboard] WebSocket error:', error);
  };

  ws.onmessage = (event) => {
    try {
      const message: WebSocketMessage = JSON.parse(event.data);
      handleEvent(message.event);
    } catch (error) {
      console.error('[Dashboard] Failed to parse message:', error);
    }
  };
}

function scheduleReconnect(): void {
  if (reconnectTimeout) {
    return;
  }

  state.reconnectAttempt++;

  // Exponential backoff with jitter
  const baseDelay = Math.min(
    RECONNECT_BASE_DELAY_MS * Math.pow(2, state.reconnectAttempt - 1),
    RECONNECT_MAX_DELAY_MS
  );
  const jitter = Math.random() * 1000;
  const delay = baseDelay + jitter;

  state.reconnectCountdown = Math.ceil(delay / 1000);
  showConnectionOverlay();
  updateReconnectCountdown();

  countdownInterval = window.setInterval(() => {
    state.reconnectCountdown--;
    updateReconnectCountdown();
    if (state.reconnectCountdown <= 0 && countdownInterval) {
      clearInterval(countdownInterval);
      countdownInterval = null;
    }
  }, 1000);

  reconnectTimeout = window.setTimeout(() => {
    reconnectTimeout = null;
    console.log('[Dashboard] Attempting to reconnect...');
    connect();
  }, delay);
}

function updateReconnectCountdown(): void {
  elements.connectionOverlayMessage.textContent =
    `Reconnecting in ${state.reconnectCountdown}s... (attempt ${state.reconnectAttempt})`;

  // Update status indicator with countdown
  const statusText = elements.connectionStatus.querySelector('.status-text');
  if (statusText && !state.connected) {
    statusText.innerHTML = `Reconnecting <span class="reconnect-countdown">${state.reconnectCountdown}s</span>`;
  }
}

function showConnectionOverlay(): void {
  elements.connectionOverlay.classList.add('visible');
}

function hideConnectionOverlay(): void {
  elements.connectionOverlay.classList.remove('visible');
}

function retryNow(): void {
  if (reconnectTimeout) {
    clearTimeout(reconnectTimeout);
    reconnectTimeout = null;
  }
  if (countdownInterval) {
    clearInterval(countdownInterval);
    countdownInterval = null;
  }
  connect();
}

function updateConnectionStatus(status: 'connected' | 'disconnected' | 'connecting'): void {
  const statusEl = elements.connectionStatus;
  statusEl.className = `status status-${status}`;

  const textEl = statusEl.querySelector('.status-text');
  if (textEl) {
    if (status === 'connected') {
      textEl.textContent = 'Connected';
    } else if (status === 'connecting') {
      textEl.textContent = 'Connecting...';
    } else {
      textEl.textContent = 'Disconnected';
    }
  }
}

// ============================================
// Event Handling
// ============================================

function handleEvent(event: MonitorEvent): void {
  state.eventCount++;
  elements.eventCount.textContent = `Events: ${state.eventCount}`;

  // Debug logging for event tracing
  console.log(`[Dashboard] Event received:`, {
    type: event.type,
    sessionId: event.sessionId,
    agentId: event.agentId,
    timestamp: event.timestamp,
  });

  // Track session from any event that has a sessionId
  if (event.sessionId) {
    trackSession(event.sessionId, event.timestamp);
  }

  switch (event.type) {
    case 'connection_status':
      handleConnectionStatus(event);
      break;
    case 'thinking':
      handleThinking(event);
      break;
    case 'tool_start':
      handleToolStart(event);
      break;
    case 'tool_end':
      handleToolEnd(event);
      break;
    case 'agent_start':
      handleAgentStart(event);
      break;
    case 'agent_stop':
      handleAgentStop(event);
      break;
    case 'session_start':
      handleSessionStart(event);
      break;
    case 'session_stop':
      handleSessionStop(event);
      break;
    case 'plan_update':
      handlePlanUpdate(event);
      break;
    case 'plan_delete':
      handlePlanDelete(event);
      break;
    case 'plan_list':
      handlePlanList(event);
      break;
    default:
      console.log('[Dashboard] Unhandled event type:', event.type);
  }
}

function handleConnectionStatus(event: MonitorEvent): void {
  const version = event.serverVersion as string || 'unknown';
  elements.serverInfo.textContent = `Server: v${version}`;
}

function handleThinking(event: MonitorEvent): void {
  state.thinkingCount++;
  elements.thinkingCount.textContent = String(state.thinkingCount);

  const content = String(event.content || '');
  const time = formatTime(event.timestamp);
  const agentId = event.agentId || 'main';
  const sessionId = event.sessionId;
  const preview = content.slice(0, 80).replace(/\n/g, ' ');

  // Debug: Log the agentId values to diagnose filtering issues
  console.log(`[Dashboard] Thinking entry agentId: "${agentId}", known agents: [${Array.from(state.agents.keys()).join(', ')}]`);

  // Clear empty state if present
  const emptyState = elements.thinkingContent.querySelector('.empty-state');
  if (emptyState) {
    emptyState.remove();
  }

  // Create thinking entry with collapsible toggle
  const entry = document.createElement('div');
  entry.className = 'thinking-entry new';
  entry.dataset.agent = agentId;
  entry.dataset.session = sessionId || '';
  entry.dataset.content = content.toLowerCase(); // For filtering

  // Session badge HTML if we have a session ID
  const sessionBadge = sessionId
    ? `<span class="entry-session-badge" style="background: ${getSessionColor(sessionId)}" title="Session: ${escapeHtml(sessionId)}">${escapeHtml(getShortSessionId(sessionId))}</span>`
    : '';

  entry.innerHTML = `
    <div class="thinking-entry-header" role="button" tabindex="0" aria-expanded="true">
      <span class="thinking-toggle" aria-hidden="true"></span>
      <span class="thinking-time">${escapeHtml(time)}</span>
      ${sessionBadge}
      <span class="thinking-agent">${escapeHtml(agentId)}</span>
      <span class="thinking-preview">${escapeHtml(preview)}...</span>
    </div>
    <div class="thinking-text">${escapeHtml(content)}</div>
  `;

  // Add click handler for collapsing
  const header = entry.querySelector('.thinking-entry-header');
  if (header) {
    header.addEventListener('click', () => toggleThinkingEntry(entry));
    header.addEventListener('keydown', (e) => {
      if ((e as KeyboardEvent).key === 'Enter' || (e as KeyboardEvent).key === ' ') {
        e.preventDefault();
        toggleThinkingEntry(entry);
      }
    });
  }

  // Apply filter visibility
  applyThinkingFilter(entry);

  // Apply agent filter
  applyAgentFilter(entry, agentId);

  appendAndTrim(elements.thinkingContent, entry);
  smartScroll(elements.thinkingContent);

  // Remove 'new' class after animation
  setTimeout(() => entry.classList.remove('new'), 1000);
}

function toggleThinkingEntry(entry: HTMLElement): void {
  entry.classList.toggle('collapsed');
  const header = entry.querySelector('.thinking-entry-header');
  if (header) {
    header.setAttribute('aria-expanded', entry.classList.contains('collapsed') ? 'false' : 'true');
  }
}

function handleToolStart(event: MonitorEvent): void {
  const toolName = String(event.toolName || 'Unknown');
  const toolCallId = String(event.toolCallId || `tool-${Date.now()}`);
  const input = event.input ? String(event.input) : undefined;
  const time = formatTime(event.timestamp);
  const sessionId = event.sessionId;

  state.toolsCount++;
  elements.toolsCount.textContent = String(state.toolsCount);

  // Clear empty state if present
  const emptyState = elements.toolsContent.querySelector('.empty-state');
  if (emptyState) {
    emptyState.remove();
  }

  // Session badge HTML if we have a session ID
  const sessionBadge = sessionId
    ? `<span class="entry-session-badge" style="background: ${getSessionColor(sessionId)}" title="Session: ${escapeHtml(sessionId)}">${escapeHtml(getShortSessionId(sessionId))}</span>`
    : '';

  // Create tool entry with expandable details
  const entry = document.createElement('div');
  entry.className = 'tool-entry tool-entry-expandable new';
  entry.id = `tool-${toolCallId}`;
  entry.dataset.toolName = toolName.toLowerCase();
  entry.dataset.session = sessionId || '';
  entry.dataset.input = (input || '').toLowerCase();

  entry.innerHTML = `
    <div class="tool-entry-header">
      <span class="tool-time">${escapeHtml(time)}</span>
      ${sessionBadge}
      <span class="tool-name">${escapeHtml(toolName)}</span>
      <span class="tool-detail">${renderToolDetail(input)}</span>
      <span class="tool-status tool-status-pending">running</span>
    </div>
    <div class="tool-entry-details">
      <div class="tool-input-section">
        <div class="tool-input-label">INPUT</div>
        <div class="tool-input-content">${escapeHtml(input || '(none)')}</div>
      </div>
      <div class="tool-output-section">
        <div class="tool-output-label">OUTPUT</div>
        <div class="tool-output-content">Waiting for result...</div>
      </div>
    </div>
  `;

  // Add click handler for expanding
  entry.addEventListener('click', (e) => {
    // Don't toggle if clicking on a link or button inside
    if ((e.target as HTMLElement).closest('a, button')) return;
    entry.classList.toggle('expanded');
  });

  // Track pending tool
  state.pendingTools.set(toolCallId, {
    id: toolCallId,
    name: toolName,
    input,
    startTime: event.timestamp,
    element: entry,
  });

  // Apply filter
  applyToolsFilter(entry);

  appendAndTrim(elements.toolsContent, entry);
  smartScroll(elements.toolsContent);

  // Remove 'new' class after animation
  setTimeout(() => entry.classList.remove('new'), 1000);
}

function handleToolEnd(event: MonitorEvent): void {
  const toolCallId = String(event.toolCallId || '');
  const output = event.output ? String(event.output) : undefined;
  const durationMs = event.durationMs as number | undefined;

  // Update existing entry if found
  const entry = document.getElementById(`tool-${toolCallId}`);
  if (entry) {
    const statusEl = entry.querySelector('.tool-status');
    if (statusEl) {
      const isError = event.status === 'error' || (output && output.toLowerCase().includes('error'));
      statusEl.className = `tool-status ${isError ? 'tool-status-error' : 'tool-status-done'}`;
      statusEl.textContent = isError ? 'error' : 'done';
    }

    // Add duration if available
    if (durationMs !== undefined) {
      const headerEl = entry.querySelector('.tool-entry-header');
      if (headerEl && !headerEl.querySelector('.tool-duration')) {
        const durationEl = document.createElement('span');
        durationEl.className = 'tool-duration';
        durationEl.textContent = formatDuration(durationMs);
        headerEl.appendChild(durationEl);
      }
    }

    // Update output in details section
    const outputEl = entry.querySelector('.tool-output-content');
    if (outputEl) {
      outputEl.textContent = output || '(no output)';
    }
  }

  // Remove from pending
  state.pendingTools.delete(toolCallId);
}

function handleAgentStart(event: MonitorEvent): void {
  const agentId = String(event.agentId || `agent-${Date.now()}`);
  const agentName = event.agentName ? String(event.agentName) : agentId.slice(0, 8);
  const parentId = event.parentAgentId ? String(event.parentAgentId) : undefined;

  state.agents.set(agentId, {
    id: agentId,
    name: agentName,
    parentId,
    sessionId: event.sessionId || state.currentSessionId || undefined,
    active: true,
    status: 'running',
    startTime: event.timestamp,
  });

  state.agentsCount = state.agents.size;
  elements.agentsCount.textContent = String(state.agentsCount);

  renderAgentTree();
  renderAgentTabs();
}

function handleAgentStop(event: MonitorEvent): void {
  const agentId = String(event.agentId || '');
  const agent = state.agents.get(agentId);

  if (agent) {
    agent.active = false;
    agent.status = (event.status as AgentInfo['status']) || 'success';
    agent.endTime = event.timestamp;
    renderAgentTree();
    renderAgentTabs();
  }
}

/**
 * Handle plan_list event - updates the list of available plans.
 */
function handlePlanList(event: MonitorEvent): void {
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
 * Find the currently active (running) agent.
 * Returns the most recently started running agent, or undefined if none.
 */
function findActiveAgent(): AgentInfo | undefined {
  let activeAgent: AgentInfo | undefined;
  for (const agent of state.agents.values()) {
    if (agent.active && agent.status === 'running') {
      // If multiple agents are running, prefer the most recently started
      if (!activeAgent || agent.startTime > activeAgent.startTime) {
        activeAgent = agent;
      }
    }
  }
  return activeAgent;
}

function handlePlanUpdate(event: MonitorEvent): void {
  const filename = event.filename ? String(event.filename) : 'Unknown plan';
  const path = event.path ? String(event.path) : filename;
  const content = event.content ? String(event.content) : '';
  // Use the actual file modification time if provided, otherwise fall back to current time
  const lastModified = typeof event.lastModified === 'number'
    ? event.lastModified
    : Date.now();

  // Find the currently active (running) agent to associate with this plan
  const activeAgent = findActiveAgent();

  // Store this plan in our map
  state.plans.set(path, {
    path,
    filename,
    content,
    lastModified,
    sessionId: event.sessionId || state.currentSessionId || undefined,
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

  // If this is the current plan or we have no current plan, display it
  if (!state.currentPlanPath || state.currentPlanPath === path) {
    displayPlan(path);
  }
}

/**
 * Display the most recently modified plan in the Plan panel.
 * If no plans are available, shows an empty state.
 */
function displayMostRecentPlan(): void {
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
 */
function displayPlan(planPath: string): void {
  const plan = state.plans.get(planPath);
  if (!plan) {
    // Plan content not loaded yet, show loading state
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
 * Display the most recent plan for a given agent.
 * Falls back to session-based lookup if no agent-specific plan found.
 * If no plans found, keeps the current plan displayed.
 */
function displayPlanForAgent(agentId: string): void {
  const agent = state.agents.get(agentId);

  // First, try to find a plan directly associated with this agent
  const agentPlans = Array.from(state.plans.values())
    .filter((p) => p.agentId === agentId)
    .sort((a, b) => b.lastModified - a.lastModified);

  if (agentPlans.length > 0) {
    displayPlan(agentPlans[0].path);
    return;
  }

  // Fall back to session-based lookup
  if (agent?.sessionId) {
    const sessionPlans = Array.from(state.plans.values())
      .filter((p) => p.sessionId === agent.sessionId)
      .sort((a, b) => b.lastModified - a.lastModified);

    if (sessionPlans.length > 0) {
      displayPlan(sessionPlans[0].path);
      return;
    }
  }

  // If no plans found, keep current plan displayed
}

/**
 * Display empty plan state.
 */
function displayEmptyPlan(): void {
  state.currentPlanPath = null;
  elements.planSelectorText.textContent = 'No active plan';
  elements.planContent.innerHTML = `
    <div class="empty-state">
      <span class="empty-icon">file</span>
      <p>No plan file loaded</p>
    </div>
  `;
  updatePlanMeta(null);
  updatePlanActionButtons();
  renderPlanSelector();
}

/**
 * Update the plan metadata display.
 * Shows the path and last modified time of the current plan.
 */
function updatePlanMeta(plan: PlanInfo | null): void {
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

/**
 * Render the plan selector dropdown options.
 */
function renderPlanSelector(): void {
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
 */
function selectPlan(planPath: string): void {
  closePlanSelector();

  // Check if we have the content
  const plan = state.plans.get(planPath);
  if (plan) {
    displayPlan(planPath);
  } else {
    // We need to request the content from the server
    // For now, just show loading state - the server will send plan_update
    state.currentPlanPath = planPath;
    const listItem = state.planList.find((p) => p.path === planPath);
    elements.planSelectorText.textContent = listItem?.filename || planPath;
    elements.planContent.innerHTML = `
      <div class="empty-state">
        <span class="empty-icon">...</span>
        <p>Plan content will load when modified</p>
      </div>
    `;
    renderPlanSelector();
  }
}

/**
 * Toggle the plan selector dropdown.
 */
function togglePlanSelector(): void {
  if (state.planSelectorOpen) {
    closePlanSelector();
  } else {
    openPlanSelector();
  }
}

/**
 * Open the plan selector dropdown.
 */
function openPlanSelector(): void {
  state.planSelectorOpen = true;
  elements.planSelectorBtn.setAttribute('aria-expanded', 'true');
  elements.planSelectorDropdown.classList.add('visible');
}

/**
 * Close the plan selector dropdown.
 */
function closePlanSelector(): void {
  state.planSelectorOpen = false;
  elements.planSelectorBtn.setAttribute('aria-expanded', 'false');
  elements.planSelectorDropdown.classList.remove('visible');
}

/**
 * Format a date as a relative time string (e.g., "2m ago", "1h ago").
 */
function formatTimeAgo(date: Date): string {
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
// Plan Context Menu
// ============================================

/**
 * Show the plan context menu at the given position.
 */
function showFileContextMenu(x: number, y: number, filePath: string): void {
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
function hidePlanContextMenu(): void {
  elements.planContextMenu.classList.remove('visible');
  state.contextMenuFilePath = null;
}

/**
 * Show a toast notification.
 */
function showToast(message: string, type: 'success' | 'error' = 'success'): void {
  // Create toast element if it doesn't exist
  if (!elements.toast) {
    elements.toast = document.createElement('div');
    elements.toast.className = 'toast';
    document.body.appendChild(elements.toast);
  }

  // Set content and type
  elements.toast.textContent = message;
  elements.toast.className = `toast toast-${type}`;

  // Show toast
  requestAnimationFrame(() => {
    elements.toast!.classList.add('visible');
  });

  // Hide after delay
  setTimeout(() => {
    elements.toast!.classList.remove('visible');
  }, 2500);
}

/**
 * Execute a file action (open or reveal) via the server API.
 */
async function executeFileAction(action: 'open' | 'reveal', path: string): Promise<void> {
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
      showToast(result.error || 'Action failed', 'error');
    } else {
      // Show success feedback
      const actionText = action === 'open' ? 'Opened in default app' : 'Revealed in Finder';
      showToast(actionText, 'success');
    }
  } catch (error) {
    console.error('[Dashboard] Failed to execute file action:', error);
    showToast('Failed to connect to server', 'error');
  }
}

/**
 * Update the enabled state of plan action buttons.
 */
function updatePlanActionButtons(): void {
  const hasActivePlan = state.currentPlanPath !== null;
  elements.planOpenBtn.disabled = !hasActivePlan;
  elements.planRevealBtn.disabled = !hasActivePlan;
}

/**
 * Handle toolbar "Open" button click.
 */
function handlePlanOpenClick(): void {
  if (state.currentPlanPath) {
    executeFileAction('open', state.currentPlanPath);
  }
}

/**
 * Handle toolbar "Reveal" button click.
 */
function handlePlanRevealClick(): void {
  if (state.currentPlanPath) {
    executeFileAction('reveal', state.currentPlanPath);
  }
}

/**
 * Handle context menu "Open in Default App" action.
 */
function handleContextMenuOpen(): void {
  if (state.contextMenuFilePath) {
    executeFileAction('open', state.contextMenuFilePath);
  }
  hidePlanContextMenu();
}

/**
 * Handle context menu "Reveal in Finder" action.
 */
function handleContextMenuReveal(): void {
  if (state.contextMenuFilePath) {
    executeFileAction('reveal', state.contextMenuFilePath);
  }
  hidePlanContextMenu();
}

/**
 * Handle right-click on plan content or selector.
 */
function handlePlanContextMenu(event: MouseEvent): void {
  // Only show context menu if we have a current plan
  if (!state.currentPlanPath) {
    return;
  }

  event.preventDefault();
  showFileContextMenu(event.clientX, event.clientY, state.currentPlanPath);
}

/**
 * Handle right-click on a plan option in the selector dropdown.
 */
function handlePlanOptionContextMenu(event: MouseEvent, planPath: string): void {
  event.preventDefault();
  event.stopPropagation();
  showFileContextMenu(event.clientX, event.clientY, planPath);
}

function handlePlanDelete(event: MonitorEvent): void {
  const path = event.path ? String(event.path) : '';

  // Remove this plan from our map
  if (path) {
    state.plans.delete(path);

    // Remove from plan list
    state.planList = state.planList.filter((p) => p.path !== path);
  }

  // Update the selector
  renderPlanSelector();

  // If this was the current plan, display the next most recent
  if (state.currentPlanPath === path) {
    displayMostRecentPlan();
  }
}

// ============================================
// Session Management
// ============================================

/**
 * Track a session from any event that includes a sessionId.
 * Creates the session if it doesn't exist.
 */
function trackSession(sessionId: string, timestamp: string): void {
  if (!sessionId) return;

  if (!state.sessions.has(sessionId)) {
    const colorIndex = state.sessions.size % SESSION_COLORS.length;
    state.sessions.set(sessionId, {
      id: sessionId,
      startTime: timestamp,
      active: true,
      color: SESSION_COLORS[colorIndex],
    });
    console.log(`[Dashboard] New session tracked: ${sessionId}`);
    updateSessionIndicator();
  }

  // Update current session
  state.currentSessionId = sessionId;
}

/**
 * Handle session_start event.
 */
function handleSessionStart(event: MonitorEvent): void {
  const sessionId = String(event.sessionId || '');
  const workingDirectory = event.workingDirectory as string | undefined;

  console.log(`[Dashboard] Session started: ${sessionId}`, { workingDirectory });

  const colorIndex = state.sessions.size % SESSION_COLORS.length;
  state.sessions.set(sessionId, {
    id: sessionId,
    workingDirectory,
    startTime: event.timestamp,
    active: true,
    color: SESSION_COLORS[colorIndex],
  });

  state.currentSessionId = sessionId;
  updateSessionIndicator();
}

/**
 * Handle session_stop event.
 */
function handleSessionStop(event: MonitorEvent): void {
  const sessionId = String(event.sessionId || '');
  const session = state.sessions.get(sessionId);

  console.log(`[Dashboard] Session stopped: ${sessionId}`);

  if (session) {
    session.active = false;
    session.endTime = event.timestamp;
  }

  // If this was the current session, clear it
  if (state.currentSessionId === sessionId) {
    state.currentSessionId = null;
  }

  updateSessionIndicator();
}

/**
 * Update the session indicator in the header.
 */
function updateSessionIndicator(): void {
  // Create the session indicator element if it doesn't exist in the DOM
  let indicator = elements.sessionIndicator;

  if (!indicator) {
    // Create and insert the session indicator into the header
    indicator = document.createElement('div');
    indicator.id = 'session-indicator';
    indicator.className = 'session-indicator';

    // Insert after connection status
    const connectionStatus = elements.connectionStatus;
    if (connectionStatus && connectionStatus.parentNode) {
      connectionStatus.parentNode.insertBefore(
        indicator,
        connectionStatus.nextSibling
      );
    }
    elements.sessionIndicator = indicator;
  }

  if (state.currentSessionId) {
    const session = state.sessions.get(state.currentSessionId);
    if (session) {
      const shortId = session.id.slice(0, 8);
      const title = session.workingDirectory
        ? `Session: ${session.id}\nDirectory: ${session.workingDirectory}`
        : `Session: ${session.id}`;

      indicator.innerHTML = `
        <span class="session-dot" style="background: ${session.color}"></span>
        <span class="session-id" title="${escapeHtml(title)}">${escapeHtml(shortId)}</span>
        ${state.sessions.size > 1 ? `<span class="session-count">(${state.sessions.size})</span>` : ''}
      `;
      indicator.style.display = 'flex';
    }
  } else if (state.sessions.size > 0) {
    // Show count of sessions if no active session
    indicator.innerHTML = `
      <span class="session-dot" style="background: var(--color-text-muted)"></span>
      <span class="session-id">${state.sessions.size} session(s)</span>
    `;
    indicator.style.display = 'flex';
  } else {
    indicator.style.display = 'none';
  }

  // Also update the session filter UI
  updateSessionFilter();
}

/**
 * Render the session filter bar with clickable session badges.
 * Shows when there are multiple sessions to filter between.
 */
function updateSessionFilter(): void {
  // Create session filter element if it doesn't exist
  let filterEl = elements.sessionFilter;

  if (!filterEl) {
    filterEl = document.createElement('div');
    filterEl.id = 'session-filter';
    filterEl.className = 'session-filter';

    // Insert after agent bar
    const agentBar = document.getElementById('agent-bar');
    if (agentBar && agentBar.parentNode) {
      agentBar.parentNode.insertBefore(filterEl, agentBar.nextSibling);
    }
    elements.sessionFilter = filterEl;
  }

  // Show filter when there are any sessions (even just one)
  if (state.sessions.size === 0) {
    filterEl.style.display = 'none';
    return;
  }

  filterEl.style.display = 'flex';

  // Build session filter badges
  let html = '<span class="session-filter-label">SESSIONS:</span>';
  html += '<div class="session-filter-badges">';

  // "All" option
  const allActive = state.selectedSession === 'all' ? 'active' : '';
  html += `<button class="session-filter-badge ${allActive}" data-session="all">
    <span class="session-filter-dot" style="background: var(--color-text-muted)"></span>
    All
  </button>`;

  // Individual session badges
  for (const [sessionId, session] of state.sessions) {
    const shortId = sessionId.slice(0, 8);
    const isActive = state.selectedSession === sessionId ? 'active' : '';
    const isOnline = session.active ? 'online' : '';
    const title = session.workingDirectory
      ? `${sessionId}\n${session.workingDirectory}`
      : sessionId;

    html += `<button class="session-filter-badge ${isActive} ${isOnline}" data-session="${escapeHtml(sessionId)}" title="${escapeHtml(title)}">
      <span class="session-filter-dot" style="background: ${session.color}"></span>
      ${escapeHtml(shortId)}
    </button>`;
  }

  html += '</div>';
  filterEl.innerHTML = html;

  // Attach click handlers using event delegation
  filterEl.querySelectorAll('.session-filter-badge').forEach((badge) => {
    badge.addEventListener('click', () => {
      const sessionId = (badge as HTMLElement).dataset.session || 'all';
      selectSession(sessionId);
    });
  });
}

/**
 * Select a session to filter by.
 */
function selectSession(sessionId: string): void {
  state.selectedSession = sessionId;
  updateSessionFilter();
  filterAllBySession();
}

/**
 * Apply session filter to all thinking and tool entries.
 */
function filterAllBySession(): void {
  // Filter thinking entries
  const thinkingEntries = elements.thinkingContent.querySelectorAll('.thinking-entry');
  thinkingEntries.forEach((entry: Element) => {
    const el = entry as HTMLElement;
    applySessionFilter(el);
  });

  // Filter tool entries
  const toolEntries = elements.toolsContent.querySelectorAll('.tool-entry');
  toolEntries.forEach((entry: Element) => {
    const el = entry as HTMLElement;
    applySessionFilter(el);
  });
}

/**
 * Apply session filter to a single entry element.
 * Also considers agent filter and text filter.
 */
function applySessionFilter(entry: HTMLElement): void {
  const entrySession = entry.dataset.session || '';
  const matchesSession = state.selectedSession === 'all' || entrySession === state.selectedSession;

  // Check if this is a thinking entry (has agent filter) or tool entry
  const isThinkingEntry = entry.classList.contains('thinking-entry');

  if (isThinkingEntry) {
    const entryAgentId = entry.dataset.agent || 'main';
    // isAgentInTree now handles 'main' placeholder entries properly
    const matchesAgent = state.selectedAgent === 'all' ||
      isAgentInTree(entryAgentId, state.selectedAgent);
    const matchesText = !state.thinkingFilter ||
      (entry.dataset.content || '').includes(state.thinkingFilter.toLowerCase());
    entry.style.display = (matchesSession && matchesAgent && matchesText) ? '' : 'none';
  } else {
    // Tool entry
    const toolName = entry.dataset.toolName || '';
    const input = entry.dataset.input || '';
    const filter = state.toolsFilter.toLowerCase();
    const matchesText = !filter || toolName.includes(filter) || input.includes(filter);
    entry.style.display = (matchesSession && matchesText) ? '' : 'none';
  }
}

/**
 * Get the color for a session ID.
 */
function getSessionColor(sessionId: string | undefined): string {
  if (!sessionId) return 'var(--color-text-muted)';
  const session = state.sessions.get(sessionId);
  return session?.color || 'var(--color-text-muted)';
}

/**
 * Get a short display version of a session ID.
 */
function getShortSessionId(sessionId: string | undefined): string {
  if (!sessionId) return '';
  return sessionId.slice(0, 8);
}

// ============================================
// View Navigation
// ============================================

type ViewType = 'all' | 'thinking' | 'tools' | 'agents' | 'plan';

/**
 * Create the view navigation tabs if they don't exist.
 */
function initViewTabs(): void {
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
    { id: 'agents', label: 'Agents', shortcut: 'g' },
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
function selectView(viewId: ViewType): void {
  state.activeView = viewId;
  updateViewTabs();
  applyViewFilter();
}

/**
 * Update view tab active states.
 */
function updateViewTabs(): void {
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
function applyViewFilter(): void {
  const panels = elements.panels;
  if (!panels) return;

  // Remove any existing view-specific classes
  panels.classList.remove('view-all', 'view-thinking', 'view-tools', 'view-agents', 'view-plan');

  // Add the current view class
  panels.classList.add(`view-${state.activeView}`);

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
  if (elements.agentsPanel) {
    elements.agentsPanel.style.display =
      (showAll || state.activeView === 'agents') ? '' : 'none';
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
}

// ============================================
// Rendering
// ============================================

function renderAgentTree(): void {
  if (state.agents.size === 0) {
    elements.agentsContent.innerHTML = `
      <div class="empty-state">
        <span class="empty-icon">users</span>
        <p>No active agents</p>
      </div>
    `;
    return;
  }

  // Find root agents (no parent)
  const rootAgents = Array.from(state.agents.values()).filter(a => !a.parentId);

  elements.agentsContent.innerHTML = rootAgents
    .map(agent => renderAgentNode(agent))
    .join('');

  // Add click handlers to agent nodes using event delegation
  attachAgentTreeClickHandlers();
}

function renderAgentNode(agent: AgentInfo): string {
  const children = Array.from(state.agents.values()).filter(a => a.parentId === agent.id);
  const colorClass = getAgentColorClass(agent.name || agent.id);
  const statusClass = getAgentStatusClass(agent);
  const dotActiveClass = agent.active ? 'active' : '';
  const isSelected = state.selectedAgent === agent.id;

  let html = `
    <div class="agent-node${isSelected ? ' agent-node-selected' : ''}" data-agent-id="${escapeHtml(agent.id)}">
      <div class="agent-node-header" role="button" tabindex="0" title="Click to filter thinking by this agent">
        <span class="agent-node-dot ${dotActiveClass}" style="color: var(${colorClass}); background: var(${colorClass})"></span>
        <span class="agent-node-name">${escapeHtml(agent.name || agent.id.slice(0, 8))}</span>
        <span class="agent-node-id">(${escapeHtml(agent.id.slice(0, 8))})</span>
        <span class="agent-node-status ${statusClass}">${getAgentStatusText(agent)}</span>
      </div>
  `;

  if (children.length > 0) {
    html += `<div class="agent-node-children">${children.map(c => renderAgentNode(c)).join('')}</div>`;
  }

  html += '</div>';
  return html;
}

/**
 * Attach click handlers to agent tree nodes for filtering.
 * Uses event delegation on the agents content container.
 */
function attachAgentTreeClickHandlers(): void {
  const agentNodes = elements.agentsContent.querySelectorAll('.agent-node-header');

  agentNodes.forEach((header) => {
    const headerEl = header as HTMLElement;
    const nodeEl = headerEl.closest('.agent-node') as HTMLElement;
    const agentId = nodeEl?.dataset.agentId;

    if (!agentId) return;

    // Click handler
    headerEl.addEventListener('click', (e) => {
      e.stopPropagation(); // Prevent bubbling to parent agent nodes
      handleAgentNodeClick(agentId);
    });

    // Keyboard handler for accessibility
    headerEl.addEventListener('keydown', (e) => {
      const keyEvent = e as KeyboardEvent;
      if (keyEvent.key === 'Enter' || keyEvent.key === ' ') {
        e.preventDefault();
        e.stopPropagation();
        handleAgentNodeClick(agentId);
      }
    });
  });
}

/**
 * Handle a click on an agent node in the Agent Tree panel.
 * Selects/filters by that agent or toggles back to "all" if already selected.
 */
function handleAgentNodeClick(agentId: string): void {
  // If clicking the already-selected agent, toggle back to "all"
  if (state.selectedAgent === agentId) {
    selectAgent('all');
  } else {
    selectAgent(agentId);
  }

  // Re-render the tree to update the selected state visual
  renderAgentTree();
}

function getAgentStatusClass(agent: AgentInfo): string {
  if (agent.active) return 'agent-node-status-active';
  switch (agent.status) {
    case 'success': return 'agent-node-status-completed';
    case 'failure': return 'agent-node-status-failed';
    case 'cancelled': return 'agent-node-status-completed';
    default: return 'agent-node-status-completed';
  }
}

function getAgentStatusText(agent: AgentInfo): string {
  if (agent.active) return 'running';
  return agent.status || 'done';
}

function renderAgentTabs(): void {
  // Keep the "All" tab
  const allTab = elements.agentTabs.querySelector('[data-agent="all"]');
  elements.agentTabs.innerHTML = '';
  if (allTab) {
    // Re-add with keyboard shortcut hint
    const newAllTab = document.createElement('button');
    newAllTab.className = `agent-tab${state.selectedAgent === 'all' ? ' active' : ''}`;
    newAllTab.dataset.agent = 'all';
    newAllTab.innerHTML = `
      <span class="agent-dot agent-dot-all"></span>
      All
      <span class="agent-tab-shortcut">0</span>
    `;
    newAllTab.addEventListener('click', () => selectAgent('all'));
    elements.agentTabs.appendChild(newAllTab);
  }

  // Add agent tabs with keyboard shortcuts
  let shortcutIndex = 1;
  for (const agent of state.agents.values()) {
    const tab = document.createElement('button');
    tab.className = `agent-tab${state.selectedAgent === agent.id ? ' active' : ''}`;
    tab.dataset.agent = agent.id;

    const dotClass = agent.active ? 'agent-dot-active' : '';
    const colorVar = getAgentColorClass(agent.name || agent.id);
    const shortcut = shortcutIndex <= 9 ? shortcutIndex : '';

    tab.innerHTML = `
      <span class="agent-dot ${dotClass}" style="background: var(${colorVar})"></span>
      ${escapeHtml(agent.name || agent.id.slice(0, 8))}
      ${shortcut ? `<span class="agent-tab-shortcut">${shortcut}</span>` : ''}
    `;

    tab.addEventListener('click', () => selectAgent(agent.id));
    elements.agentTabs.appendChild(tab);
    shortcutIndex++;
  }
}

function selectAgent(agentId: string): void {
  state.selectedAgent = agentId;
  console.log(`[Dashboard] ===== selectAgent called =====`);
  console.log(`[Dashboard] Selected agent: "${agentId}"`);
  console.log(`[Dashboard] Agents in state.agents: [${Array.from(state.agents.keys()).map(k => `"${k}"`).join(', ')}]`);
  console.log(`[Dashboard] Selected session: "${state.selectedSession}"`);

  // Show plan for agent's session
  if (agentId !== 'all') {
    displayPlanForAgent(agentId);
  }

  // Update tab styles
  const tabs = elements.agentTabs.querySelectorAll('.agent-tab');
  tabs.forEach((tab: Element) => {
    if ((tab as HTMLElement).dataset.agent === agentId) {
      tab.classList.add('active');
    } else {
      tab.classList.remove('active');
    }
  });

  // Filter thinking entries by agent
  const entries = elements.thinkingContent.querySelectorAll('.thinking-entry');
  console.log(`[Dashboard] Total thinking entries to filter: ${entries.length}`);
  let visibleCount = 0;
  entries.forEach((entry: Element, index: number) => {
    const el = entry as HTMLElement;
    const entryAgentId = el.dataset.agent || 'main';
    const entrySession = el.dataset.session || '';

    // Log first few entries for debugging
    if (index < 5) {
      console.log(`[Dashboard] Entry ${index}: agentId="${entryAgentId}", session="${entrySession}"`);
    }

    applyAgentFilter(el, entryAgentId);

    if (index < 5) {
      console.log(`[Dashboard] Entry ${index} after filter: display="${el.style.display}"`);
    }

    if (el.style.display !== 'none') visibleCount++;
  });
  console.log(`[Dashboard] After filtering: ${visibleCount}/${entries.length} entries visible`);
  console.log(`[Dashboard] ===== selectAgent complete =====`);
}

/**
 * Check if an agent is a descendant of (or equal to) another agent.
 * Used for filtering thinking entries by agent tree.
 *
 * Returns true if:
 * - entryAgentId exactly matches selectedAgentId
 * - entryAgentId is a descendant (child, grandchild, etc.) of selectedAgentId
 * - entryAgentId is 'main' (placeholder for unknown agent) - show for ALL agents
 * - entryAgentId is not in the agents map - show for root agents (orphaned entries)
 */
function isAgentInTree(entryAgentId: string, selectedAgentId: string): boolean {
  console.log(`[Dashboard] isAgentInTree called: entryAgentId="${entryAgentId}" (type=${typeof entryAgentId}, length=${entryAgentId.length}), selectedAgentId="${selectedAgentId}"`);

  // Exact match
  if (entryAgentId === selectedAgentId) {
    console.log(`[Dashboard] isAgentInTree: EXACT MATCH -> true`);
    return true;
  }

  // IMPORTANT: 'main' is a placeholder used when no agentId is provided
  // in thinking events (transcript lines often lack agentId).
  // Show 'main' entries for ALL agents since we can't determine which agent
  // they actually belong to.
  // Use case-insensitive comparison and trim for robustness.
  const normalizedEntryAgentId = entryAgentId.trim().toLowerCase();
  if (normalizedEntryAgentId === 'main' || normalizedEntryAgentId === '') {
    console.log(`[Dashboard] isAgentInTree: entryAgentId is 'main' or empty (normalized: "${normalizedEntryAgentId}") -> true`);
    return true;
  }

  // Check if the entry's agent exists in our map
  const entryAgent = state.agents.get(entryAgentId);

  // If the entry's agentId is not in the map (orphaned entry),
  // show it for root agents since it likely came from a previous session
  if (!entryAgent) {
    const selectedAgent = state.agents.get(selectedAgentId);
    const result = selectedAgent !== undefined && selectedAgent.parentId === undefined;
    console.log(`[Dashboard] isAgentInTree: orphaned entry, selectedAgent exists=${selectedAgent !== undefined}, isRoot=${selectedAgent?.parentId === undefined} -> ${result}`);
    return result;
  }

  // Check if entryAgentId is a child/descendant of selectedAgentId
  let currentId: string | undefined = entryAgentId;
  while (currentId) {
    const agent = state.agents.get(currentId);
    if (!agent) break;
    if (agent.parentId === selectedAgentId) {
      console.log(`[Dashboard] isAgentInTree: found parent match -> true`);
      return true;
    }
    currentId = agent.parentId;
  }

  console.log(`[Dashboard] isAgentInTree: no match found -> false`);
  return false;
}

function applyAgentFilter(entry: HTMLElement, entryAgentId: string): void {
  console.log(`[Dashboard] applyAgentFilter: entryAgentId="${entryAgentId}", selectedAgent="${state.selectedAgent}", selectedSession="${state.selectedSession}"`);

  // isAgentInTree now handles 'main' placeholder entries properly
  const matchesAgent = state.selectedAgent === 'all' ||
    isAgentInTree(entryAgentId, state.selectedAgent);

  // Also check text filter
  const matchesText = !state.thinkingFilter ||
    (entry.dataset.content || '').includes(state.thinkingFilter.toLowerCase());

  // Also check session filter
  const entrySession = entry.dataset.session || '';
  const sessionMatches = state.selectedSession === 'all' || entrySession === state.selectedSession;

  console.log(`[Dashboard] applyAgentFilter results: matchesAgent=${matchesAgent}, matchesText=${matchesText}, sessionMatches=${sessionMatches} (entrySession="${entrySession}")`);

  const shouldShow = matchesAgent && matchesText && sessionMatches;
  console.log(`[Dashboard] applyAgentFilter: shouldShow=${shouldShow}, setting display="${shouldShow ? '' : 'none'}"`);

  entry.style.display = shouldShow ? '' : 'none';
}

function getAgentColorClass(name: string): string {
  const lowerName = name.toLowerCase();
  if (lowerName.includes('main')) return '--color-agent-main';
  if (lowerName.includes('explore')) return '--color-agent-explore';
  if (lowerName.includes('plan')) return '--color-agent-plan';
  if (lowerName.includes('debug')) return '--color-agent-debug';
  return '--color-accent-blue';
}

// ============================================
// Filtering
// ============================================

function applyThinkingFilter(entry: HTMLElement): void {
  const content = entry.dataset.content || '';
  const entryAgentId = entry.dataset.agent || 'main';
  const matchesText = !state.thinkingFilter || content.includes(state.thinkingFilter.toLowerCase());
  // isAgentInTree now handles 'main' placeholder entries properly
  const agentMatches = state.selectedAgent === 'all' ||
    isAgentInTree(entryAgentId, state.selectedAgent);
  const sessionMatches = state.selectedSession === 'all' || entry.dataset.session === state.selectedSession;
  entry.style.display = (matchesText && agentMatches && sessionMatches) ? '' : 'none';
}

function applyToolsFilter(entry: HTMLElement): void {
  const toolName = entry.dataset.toolName || '';
  const input = entry.dataset.input || '';
  const filter = state.toolsFilter.toLowerCase();
  const matchesText = !filter || toolName.includes(filter) || input.includes(filter);
  const sessionMatches = state.selectedSession === 'all' || entry.dataset.session === state.selectedSession;
  entry.style.display = (matchesText && sessionMatches) ? '' : 'none';
}

function filterAllThinking(): void {
  const entries = elements.thinkingContent.querySelectorAll('.thinking-entry');
  entries.forEach((entry: Element) => {
    applyThinkingFilter(entry as HTMLElement);
  });

  // Show/hide clear button
  if (state.thinkingFilter) {
    elements.thinkingFilterClear.classList.remove('panel-filter-hidden');
  } else {
    elements.thinkingFilterClear.classList.add('panel-filter-hidden');
  }
}

function filterAllTools(): void {
  const entries = elements.toolsContent.querySelectorAll('.tool-entry');
  entries.forEach((entry: Element) => {
    applyToolsFilter(entry as HTMLElement);
  });

  // Show/hide clear button
  if (state.toolsFilter) {
    elements.toolsFilterClear.classList.remove('panel-filter-hidden');
  } else {
    elements.toolsFilterClear.classList.add('panel-filter-hidden');
  }
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

function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function formatTime(isoString: string): string {
  try {
    const date = new Date(isoString);
    return date.toLocaleTimeString('en-US', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return '--:--:--';
  }
}

function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${ms}ms`;
  }
  const seconds = (ms / 1000).toFixed(1);
  return `${seconds}s`;
}

function summarizeInput(input: string | undefined): string {
  if (!input) return '';

  // Extract file paths or first meaningful content
  const pathMatch = input.match(/\/[^\s"']+/);
  if (pathMatch) {
    return pathMatch[0];
  }

  // Truncate long content
  if (input.length > 60) {
    return input.slice(0, 60) + '...';
  }

  return input;
}

/**
 * Extract file path from tool input (if present).
 * Returns null if no file path found.
 */
function extractFilePath(input: string | undefined): string | null {
  if (!input) return null;

  // Match absolute paths - be careful to handle JSON-escaped paths
  const pathMatch = input.match(/\/[^\s"'\\]+/);
  return pathMatch ? pathMatch[0] : null;
}

/**
 * Render the tool detail, making file paths interactive for context menu.
 * Returns HTML string with file paths wrapped in a clickable span.
 *
 * Security: Always escapes user content using escapeHtml(summarizeInput(input))
 * pattern to prevent XSS attacks.
 */
function renderToolDetail(input: string | undefined): string {
  const filePath = extractFilePath(input);

  if (filePath) {
    const summary = summarizeInput(input);
    if (summary.includes(filePath)) {
      // Wrap the file path in an interactive span
      const escapedPath = escapeHtml(filePath);
      const escapedSummary = escapeHtml(summary);
      return escapedSummary.replace(
        escapedPath,
        `<span class="tool-file-path" data-path="${escapedPath}" title="Right-click for file actions">${escapedPath}</span>`
      );
    }
  }

  // Default case: escape the summarized input for XSS safety
  return escapeHtml(summarizeInput(input));
}

function appendAndTrim(container: HTMLElement, element: HTMLElement): void {
  container.appendChild(element);

  // Remove old entries if we exceed max
  const children = container.children;
  while (children.length > MAX_ENTRIES) {
    children[0].remove();
  }
}

function renderSimpleMarkdown(content: string): string {
  // Very simple markdown rendering (headers and code blocks only)
  let html = escapeHtml(content);

  // Headers
  html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
  html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');

  // Code blocks
  html = html.replace(/```(\w+)?\n([\s\S]*?)```/g, '<pre><code>$2</code></pre>');

  // Inline code
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

  // Line breaks
  html = html.replace(/\n/g, '<br>');

  return html;
}

function clearAllPanels(): void {
  // Reset state
  state.eventCount = 0;
  state.thinkingCount = 0;
  state.toolsCount = 0;
  state.agentsCount = 0;
  state.agents.clear();
  state.pendingTools.clear();
  state.sessions.clear();
  state.currentSessionId = null;
  state.selectedSession = 'all';
  state.userScrolledUp = false;

  // Hide session indicator and filter
  updateSessionIndicator();

  // Update counters
  elements.eventCount.textContent = 'Events: 0';
  elements.thinkingCount.textContent = '0';
  elements.toolsCount.textContent = '0';
  elements.agentsCount.textContent = '0';

  // Clear filters
  state.thinkingFilter = '';
  state.toolsFilter = '';
  elements.thinkingFilter.value = '';
  elements.toolsFilter.value = '';
  elements.thinkingFilterClear.classList.add('panel-filter-hidden');
  elements.toolsFilterClear.classList.add('panel-filter-hidden');

  // Clear panel contents
  elements.thinkingContent.innerHTML = `
    <div class="empty-state">
      <span class="empty-icon">brain</span>
      <p>Waiting for thinking content...</p>
    </div>
  `;

  elements.toolsContent.innerHTML = `
    <div class="empty-state">
      <span class="empty-icon">wrench</span>
      <p>No tool activity yet</p>
    </div>
  `;

  elements.agentsContent.innerHTML = `
    <div class="empty-state">
      <span class="empty-icon">users</span>
      <p>No active agents</p>
    </div>
  `;

  elements.planContent.innerHTML = `
    <div class="empty-state">
      <span class="empty-icon">file</span>
      <p>No plan file loaded</p>
    </div>
  `;

  // Reset plan state
  state.plans.clear();
  state.planList = [];
  state.currentPlanPath = null;
  state.planSelectorOpen = false;
  state.contextMenuFilePath = null;
  elements.planSelectorText.textContent = 'No active plan';
  updatePlanMeta(null);
  closePlanSelector();
  hidePlanContextMenu();
  renderPlanSelector();

  // Reset agent tabs
  const agentTabs = elements.agentTabs.querySelectorAll('.agent-tab:not([data-agent="all"])');
  agentTabs.forEach((tab: Element) => tab.remove());

  state.selectedAgent = 'all';
  const allTab = elements.agentTabs.querySelector('[data-agent="all"]');
  if (allTab) {
    allTab.classList.add('active');
  }
}

// ============================================
// Keyboard Shortcuts
// ============================================

function handleKeydown(event: KeyboardEvent): void {
  // Ignore if typing in an input
  if ((event.target as HTMLElement).tagName === 'INPUT' ||
      (event.target as HTMLElement).tagName === 'TEXTAREA') {
    return;
  }

  // Enable keyboard mode indicator
  if (!state.keyboardMode) {
    state.keyboardMode = true;
    document.body.classList.add('keyboard-mode');
  }

  // Number keys 0-9 for agent switching
  if (event.key >= '0' && event.key <= '9') {
    const index = parseInt(event.key, 10);

    if (index === 0) {
      selectAgent('all');
    } else {
      const agents = Array.from(state.agents.values());
      if (agents[index - 1]) {
        selectAgent(agents[index - 1].id);
      }
    }
    return;
  }

  // 'c' to clear
  if (event.key === 'c' && !event.ctrlKey && !event.metaKey) {
    clearAllPanels();
    return;
  }

  // 's' to toggle auto-scroll
  if (event.key === 's' && !event.ctrlKey && !event.metaKey) {
    state.autoScroll = !state.autoScroll;
    elements.autoScrollCheckbox.checked = state.autoScroll;
    state.userScrolledUp = false;
    return;
  }

  // '/' to focus thinking filter
  if (event.key === '/') {
    event.preventDefault();
    elements.thinkingFilter.focus();
    return;
  }

  // Escape to clear filters and blur
  if (event.key === 'Escape') {
    state.thinkingFilter = '';
    state.toolsFilter = '';
    elements.thinkingFilter.value = '';
    elements.toolsFilter.value = '';
    filterAllThinking();
    filterAllTools();
    (document.activeElement as HTMLElement)?.blur();
    return;
  }

  // View navigation shortcuts
  if (!event.ctrlKey && !event.metaKey) {
    switch (event.key.toLowerCase()) {
      case 'a':
        selectView('all');
        return;
      case 't':
        selectView('thinking');
        return;
      case 'o':
        selectView('tools');
        return;
      case 'g':
        selectView('agents');
        return;
      case 'p':
        selectView('plan');
        return;
    }
  }

  // Plan file actions with Cmd/Ctrl modifiers
  if (event.metaKey || event.ctrlKey) {
    // Cmd+O / Ctrl+O - Open in default app
    if (event.key.toLowerCase() === 'o' && !event.shiftKey) {
      if (state.currentPlanPath) {
        event.preventDefault();
        handlePlanOpenClick();
      }
      return;
    }

    // Cmd+Shift+R / Ctrl+Shift+R - Reveal in Finder
    if (event.key.toLowerCase() === 'r' && event.shiftKey) {
      if (state.currentPlanPath) {
        event.preventDefault();
        handlePlanRevealClick();
      }
      return;
    }
  }
}

// ============================================
// Event Listeners
// ============================================

// Connection overlay retry button
elements.connectionOverlayRetry.addEventListener('click', retryNow);

// Clear button
elements.clearBtn.addEventListener('click', clearAllPanels);

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

// Keyboard shortcuts
document.addEventListener('keydown', handleKeydown);

// Reset keyboard mode on mouse use
document.addEventListener('mousedown', () => {
  state.keyboardMode = false;
  document.body.classList.remove('keyboard-mode');
});

// Handle "All" tab click (initial setup)
const allTab = elements.agentTabs.querySelector('[data-agent="all"]');
if (allTab) {
  allTab.addEventListener('click', () => selectAgent('all'));
}

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
});

// Close context menu on Escape key
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    hidePlanContextMenu();
  }
});

// ============================================
// Initialize
// ============================================

// Initialize view tabs navigation
initViewTabs();

connect();
console.log('[Dashboard] Thinking Monitor initialized');
console.log('[Dashboard] Keyboard shortcuts: 0-9=agents, a/t/o/g/p=views, c=clear, s=scroll, /=search, Esc=clear filters');
console.log('[Dashboard] Plan shortcuts: Cmd+O=open, Cmd+Shift+R=reveal, right-click=context menu');
