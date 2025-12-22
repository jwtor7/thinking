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
  clearBtn: document.getElementById('clear-btn')!,
  autoScrollCheckbox: document.getElementById('auto-scroll') as HTMLInputElement,
  agentTabs: document.getElementById('agent-tabs')!,
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
  planPath: document.getElementById('plan-path')!,
  serverInfo: document.getElementById('server-info')!,
  eventCount: document.getElementById('event-count')!,
  connectionOverlay: document.getElementById('connection-overlay')!,
  connectionOverlayMessage: document.getElementById('connection-overlay-message')!,
  connectionOverlayRetry: document.getElementById('connection-overlay-retry')!,
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
      <span class="tool-detail">${escapeHtml(summarizeInput(input))}</span>
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

function handlePlanUpdate(event: MonitorEvent): void {
  const filename = event.filename ? String(event.filename) : 'Unknown plan';
  const content = event.content ? String(event.content) : '';

  elements.planPath.textContent = filename;
  elements.planPath.title = event.path ? String(event.path) : filename;
  elements.planContent.innerHTML = `
    <div class="plan-markdown">${renderSimpleMarkdown(content)}</div>
  `;
}

function handlePlanDelete(_event: MonitorEvent): void {
  elements.planPath.textContent = 'No active plan';
  elements.planPath.title = '';
  elements.planContent.innerHTML = `
    <div class="empty-state">
      <span class="empty-icon">file</span>
      <p>No plan file loaded</p>
    </div>
  `;
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
}

function renderAgentNode(agent: AgentInfo): string {
  const children = Array.from(state.agents.values()).filter(a => a.parentId === agent.id);
  const colorClass = getAgentColorClass(agent.name || agent.id);
  const statusClass = getAgentStatusClass(agent);
  const dotActiveClass = agent.active ? 'active' : '';

  let html = `
    <div class="agent-node">
      <div class="agent-node-header">
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
  entries.forEach((entry: Element) => {
    const el = entry as HTMLElement;
    applyAgentFilter(el, el.dataset.agent || 'main');
  });
}

function applyAgentFilter(entry: HTMLElement, entryAgentId: string): void {
  const matchesAgent = state.selectedAgent === 'all' || entryAgentId === state.selectedAgent;

  // Also check text filter
  const matchesText = !state.thinkingFilter ||
    (entry.dataset.content || '').includes(state.thinkingFilter.toLowerCase());

  entry.style.display = (matchesAgent && matchesText) ? '' : 'none';
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
  const matches = !state.thinkingFilter || content.includes(state.thinkingFilter.toLowerCase());
  const agentMatches = state.selectedAgent === 'all' || entry.dataset.agent === state.selectedAgent;
  entry.style.display = (matches && agentMatches) ? '' : 'none';
}

function applyToolsFilter(entry: HTMLElement): void {
  const toolName = entry.dataset.toolName || '';
  const input = entry.dataset.input || '';
  const filter = state.toolsFilter.toLowerCase();
  const matches = !filter || toolName.includes(filter) || input.includes(filter);
  entry.style.display = matches ? '' : 'none';
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
  state.userScrolledUp = false;

  // Hide session indicator
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

  elements.planPath.textContent = 'No active plan';

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

// ============================================
// Initialize
// ============================================

connect();
console.log('[Dashboard] Thinking Monitor initialized');
console.log('[Dashboard] Keyboard shortcuts: 0-9=agents, c=clear, s=scroll, /=search, Esc=clear filters');
