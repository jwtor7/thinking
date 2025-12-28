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
const STORAGE_KEY_TODOS = 'thinking-monitor-session-todos';

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
  activeView: 'all' | 'thinking' | 'tools' | 'todo' | 'plan';
  // Todo tracking - maps session ID to todos for that session
  sessionTodos: SessionTodosMap;
  // Session-plan associations - maps session ID to the plan path that session uses
  sessionPlanMap: Map<string, string>;
  // Current session's todos (derived from sessionTodos based on currentSessionId)
  todos: TodoItem[];
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

/**
 * Stack of active agent IDs, ordered by start time (most recent last).
 * Used to determine which agent context applies to tool calls that
 * don't have an explicit agentId.
 *
 * When a subagent starts, its ID is pushed onto the stack.
 * When a subagent stops, its ID is removed from the stack.
 * The top of the stack represents the currently active agent.
 */
type AgentContextStack = string[];

interface ToolInfo {
  id: string;
  name: string;
  input?: string;
  startTime: string;
  element?: HTMLElement;
}

interface TodoItem {
  content: string;
  status: 'pending' | 'in_progress' | 'completed';
  activeForm: string;
}

// Map of session ID to todo items for that session
type SessionTodosMap = Map<string, TodoItem[]>;

const state: AppState = {
  connected: false,
  autoScroll: true,
  userScrolledUp: false,
  eventCount: 0,
  thinkingCount: 0,
  toolsCount: 0,
  agentsCount: 0,
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
  sessionTodos: new Map(),
  sessionPlanMap: new Map(),
  todos: [],
};

/**
 * Stack of currently active agent IDs.
 * The last element is the most deeply nested active agent.
 * 'main' represents the main conversation (no subagent).
 *
 * Memory leak prevention:
 * - Maximum stack size is enforced (MAX_AGENT_STACK_SIZE)
 * - Stale entries (older than AGENT_STACK_STALE_MS) are periodically cleaned up
 * - This handles cases where agent_stop events are missed due to connection drops
 */
const agentContextStack: AgentContextStack = ['main'];

/**
 * Timestamps for when each agent was added to the context stack.
 * Used to identify and clean up stale entries that may have missed agent_stop events.
 * Key: agentId, Value: timestamp (ms since epoch)
 */
const agentContextTimestamps: Map<string, number> = new Map();

// Agent context stack limits to prevent memory leaks
const MAX_AGENT_STACK_SIZE = 100; // Maximum number of agents in the stack
const AGENT_STACK_STALE_MS = 60 * 60 * 1000; // 1 hour - entries older than this are considered stale
const AGENT_STACK_CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // Run cleanup every 5 minutes

// ============================================
// CSS Variable Helpers
// ============================================

/**
 * Get a CSS variable value from the document root.
 * Returns the computed value of the CSS custom property.
 */
function getCssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

/**
 * Lazily initialized CSS variable values.
 * These are populated on first access after DOM is ready.
 */
let cssVarsInitialized = false;
let SESSION_COLORS: string[] = [];
let AGENT_COLORS: Record<string, string> = {};
let AGENT_FALLBACK_COLORS: string[] = [];

/**
 * Initialize color values from CSS variables.
 * Called once when colors are first needed.
 */
function initCssColors(): void {
  if (cssVarsInitialized) return;

  // Session colors for visual distinction
  SESSION_COLORS = [
    getCssVar('--color-session-1'),  // blue
    getCssVar('--color-session-2'),  // green
    getCssVar('--color-session-3'),  // purple
    getCssVar('--color-session-4'),  // cyan
    getCssVar('--color-session-5'),  // yellow
    getCssVar('--color-session-6'),  // orange
    getCssVar('--color-session-7'),  // red
    getCssVar('--color-session-8'),  // gray
  ];

  // Agent colors for visual distinction in tool activity panel
  // Each agent type gets a consistent color for quick identification
  AGENT_COLORS = {
    'main': getCssVar('--color-agent-main'),                        // gray - main conversation (default)
    'code-implementer': getCssVar('--color-agent-code-implementer'), // green - implementation work
    'code-test-evaluator': getCssVar('--color-agent-code-test-evaluator'), // cyan/teal - testing/evaluation
    'haiku-general-agent': getCssVar('--color-agent-haiku'),        // orange - haiku agent
    'opus-general-purpose': getCssVar('--color-agent-opus'),        // gold/yellow - opus general purpose
    'general-purpose': getCssVar('--color-agent-general'),          // blue - general purpose (sonnet)
  };

  // Fallback colors for agents not in the predefined list
  AGENT_FALLBACK_COLORS = [
    getCssVar('--color-agent-fallback-1'),  // red
    getCssVar('--color-agent-fallback-2'),  // purple
    getCssVar('--color-agent-fallback-3'),  // coral
    getCssVar('--color-agent-fallback-4'),  // light green
    getCssVar('--color-agent-fallback-5'),  // light blue
    getCssVar('--color-agent-fallback-6'),  // peach
  ];

  cssVarsInitialized = true;
}

/**
 * Get a consistent color for a session ID using a hash.
 * This ensures the same session ID always gets the same color,
 * and different session IDs are likely to get different colors.
 */
function getSessionColorByHash(sessionId: string): string {
  initCssColors();
  if (!sessionId || SESSION_COLORS.length === 0) {
    return 'var(--color-text-muted)';
  }

  // Simple hash function for session ID
  let hash = 0;
  for (let i = 0; i < sessionId.length; i++) {
    const char = sessionId.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }

  // Use absolute value and modulo to get color index
  const colorIndex = Math.abs(hash) % SESSION_COLORS.length;
  return SESSION_COLORS[colorIndex];
}

/**
 * Get the display color for an agent.
 * Returns a consistent color based on the agent name.
 * Known agents get predefined colors; unknown agents cycle through fallback colors.
 */
function getAgentColor(agentName: string): string {
  // Ensure CSS colors are initialized
  initCssColors();

  // Check for predefined color
  if (AGENT_COLORS[agentName]) {
    return AGENT_COLORS[agentName];
  }

  // For unknown agents, generate a consistent color based on name hash
  let hash = 0;
  for (let i = 0; i < agentName.length; i++) {
    hash = ((hash << 5) - hash) + agentName.charCodeAt(i);
    hash = hash & hash; // Convert to 32-bit integer
  }
  const index = Math.abs(hash) % AGENT_FALLBACK_COLORS.length;
  return AGENT_FALLBACK_COLORS[index];
}

// ============================================
// DOM Elements
// ============================================

const elements = {
  connectionStatus: document.getElementById('connection-status')!,
  sessionIndicator: document.getElementById('session-indicator'),
  sessionFilter: document.getElementById('session-filter'),
  clearBtn: document.getElementById('clear-btn')!,
  autoScrollCheckbox: document.getElementById('auto-scroll') as HTMLInputElement,
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
  updateThinkingCount();

  const content = String(event.content || '');
  const time = formatTime(event.timestamp);
  const sessionId = event.sessionId;
  const preview = content.slice(0, 80).replace(/\n/g, ' ');

  // Determine agent context (same logic as tool calls)
  const eventAgentId = event.agentId;
  const agentId = eventAgentId || getCurrentAgentContext();
  const agentDisplayName = getAgentDisplayName(agentId);

  // Clear empty state if present
  const emptyState = elements.thinkingContent.querySelector('.empty-state');
  if (emptyState) {
    emptyState.remove();
  }

  // Create thinking entry (non-collapsible, always expanded)
  const entry = document.createElement('div');
  entry.className = 'thinking-entry new';
  entry.dataset.agent = agentId;
  entry.dataset.session = sessionId || '';
  entry.dataset.content = content.toLowerCase(); // For filtering

  // Session badge HTML if we have a session ID
  const sessionBadge = sessionId
    ? `<span class="entry-session-badge" style="background: ${getSessionColor(sessionId)}" title="Session: ${escapeHtml(sessionId)}">${escapeHtml(getShortSessionId(sessionId))}</span>`
    : '';

  // Get agent color for visual distinction
  const agentColor = getAgentColor(agentDisplayName);

  entry.innerHTML = `
    <div class="thinking-entry-header">
      <span class="thinking-time">${escapeHtml(time)}</span>
      ${sessionBadge}
      <span class="thinking-agent" style="color: ${agentColor}">${escapeHtml(agentDisplayName)}</span>
      <span class="thinking-preview">${escapeHtml(preview)}...</span>
    </div>
    <div class="thinking-text">${escapeHtml(content)}</div>
  `;

  // Apply filter visibility
  applyThinkingFilter(entry);

  appendAndTrim(elements.thinkingContent, entry);
  smartScroll(elements.thinkingContent);

  // Remove 'new' class after animation
  setTimeout(() => entry.classList.remove('new'), 1000);
}

function handleToolStart(event: MonitorEvent): void {
  const toolName = String(event.toolName || 'Unknown');
  const toolCallId = String(event.toolCallId || `tool-${Date.now()}`);
  const input = event.input ? String(event.input) : undefined;
  const time = formatTime(event.timestamp);
  const sessionId = event.sessionId;

  // Determine agent context:
  // 1. Use explicit agentId from the event if provided
  // 2. Otherwise, use the current agent context from the stack
  // This handles the case where tool calls from subagents don't include agentId
  const eventAgentId = event.agentId;
  const agentId = eventAgentId || getCurrentAgentContext();

  // Parse TodoWrite at tool_start - this is when we have the input
  // (tool_end events don't include the input, only the output)
  if (toolName === 'TodoWrite') {
    parseTodoWriteInput(input, sessionId);
  }

  // Detect plan file access (Read, Write, or Edit to ~/.claude/plans/)
  // and associate the plan with the current session
  if ((toolName === 'Read' || toolName === 'Write' || toolName === 'Edit') && input && sessionId) {
    detectPlanAccess(input, sessionId);
  }

  state.toolsCount++;
  updateToolsCount();

  // Clear empty state if present
  const emptyState = elements.toolsContent.querySelector('.empty-state');
  if (emptyState) {
    emptyState.remove();
  }

  // Session badge HTML if we have a session ID
  const sessionBadge = sessionId
    ? `<span class="entry-session-badge" style="background: ${getSessionColor(sessionId)}" title="Session: ${escapeHtml(sessionId)}">${escapeHtml(getShortSessionId(sessionId))}</span>`
    : '';

  // Generate preview text for collapsed state
  const preview = summarizeInput(input);

  // Get the display name for this agent
  const agentDisplayName = getAgentDisplayName(agentId);

  // Get agent color for visual distinction
  const agentColor = getAgentColor(agentDisplayName);

  // Create tool entry with collapsible structure (collapsed by default)
  const entry = document.createElement('div');
  entry.className = 'tool-entry collapsed new';
  entry.id = `tool-${toolCallId}`;
  entry.dataset.toolName = toolName.toLowerCase();
  entry.dataset.session = sessionId || '';
  entry.dataset.input = (input || '').toLowerCase();
  entry.dataset.agent = agentId;

  entry.innerHTML = `
    <div class="tool-entry-header">
      <div class="tool-header-line1">
        <span class="tool-toggle"></span>
        <span class="tool-time">${escapeHtml(time)}</span>
        ${sessionBadge}
      </div>
      <div class="tool-header-line2">
        <span class="tool-agent" style="color: ${agentColor}">${escapeHtml(agentDisplayName)}</span>
        <span class="tool-name">${escapeHtml(toolName)}</span>
        <span class="tool-preview">${escapeHtml(preview)}</span>
      </div>
    </div>
    <div class="tool-entry-details">
      <div class="tool-input-section">
        <div class="tool-input-label">INPUT</div>
        <div class="tool-input-content">${escapeHtml(input || '(none)')}</div>
      </div>
    </div>
  `;

  // Add click handler for toggling collapse state
  entry.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    // Don't toggle if clicking inside details (for text selection)
    if (!entry.classList.contains('collapsed') &&
        target.closest('.tool-entry-details')) {
      return;
    }
    // Don't toggle if clicking links/buttons/file paths
    if (target.closest('a, button, .tool-file-path')) {
      return;
    }
    entry.classList.toggle('collapsed');
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
  const durationMs = event.durationMs as number | undefined;

  // Note: TodoWrite is handled in handleToolStart since tool_end doesn't include input

  // Update existing entry if found
  const entry = document.getElementById(`tool-${toolCallId}`);
  if (entry) {
    // Add duration if available (append to line 2)
    if (durationMs !== undefined) {
      const line2El = entry.querySelector('.tool-header-line2');
      if (line2El && !line2El.querySelector('.tool-duration')) {
        const durationEl = document.createElement('span');
        durationEl.className = 'tool-duration';
        durationEl.textContent = formatDuration(durationMs);
        line2El.appendChild(durationEl);
      }
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

  // Push this agent onto the context stack
  // Tool calls that follow will be associated with this agent
  pushAgentContext(agentId);

  state.agentsCount = state.agents.size;
  if (elements.agentsCount) {
    elements.agentsCount.textContent = String(state.agentsCount);
  }

  renderAgentTree();
}

function handleAgentStop(event: MonitorEvent): void {
  const agentId = String(event.agentId || '');
  const agent = state.agents.get(agentId);

  if (agent) {
    agent.active = false;
    agent.status = (event.status as AgentInfo['status']) || 'success';
    agent.endTime = event.timestamp;

    // Pop this agent from the context stack
    popAgentContext(agentId);

    renderAgentTree();
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

/**
 * Get the current agent context from the stack.
 * Returns the agent ID of the most recently started active agent.
 * If no subagents are active, returns 'main'.
 */
function getCurrentAgentContext(): string {
  return agentContextStack[agentContextStack.length - 1] || 'main';
}

/**
 * Push an agent onto the context stack when it starts.
 *
 * Memory leak safeguards:
 * 1. Enforces MAX_AGENT_STACK_SIZE - removes oldest entries if limit reached
 * 2. Records timestamp for stale entry cleanup
 */
function pushAgentContext(agentId: string): void {
  if (agentId && agentId !== 'main') {
    // Safeguard: If stack exceeds max size, remove oldest entries (after 'main')
    // This handles the case where agent_stop events were missed
    while (agentContextStack.length >= MAX_AGENT_STACK_SIZE) {
      const removedId = agentContextStack.splice(1, 1)[0]; // Remove oldest after 'main'
      if (removedId) {
        agentContextTimestamps.delete(removedId);
        console.warn(`[Dashboard] Agent stack overflow - removed stale agent: ${removedId}`);
      }
    }

    agentContextStack.push(agentId);
    agentContextTimestamps.set(agentId, Date.now());
    console.log(`[Dashboard] Agent context pushed: ${agentId}, stack depth: ${agentContextStack.length}`);
  }
}

/**
 * Pop an agent from the context stack when it stops.
 * Removes the agent from wherever it is in the stack (handles out-of-order stops).
 * Also cleans up the associated timestamp.
 */
function popAgentContext(agentId: string): void {
  if (agentId && agentId !== 'main') {
    const index = agentContextStack.indexOf(agentId);
    if (index > 0) { // Don't remove 'main' at index 0
      agentContextStack.splice(index, 1);
      agentContextTimestamps.delete(agentId);
      console.log(`[Dashboard] Agent context popped: ${agentId}, stack depth: ${agentContextStack.length}`);
    }
  }
}

/**
 * Clean up stale entries from the agent context stack.
 * Removes entries that have been in the stack longer than AGENT_STACK_STALE_MS.
 * This handles cases where agent_stop events were missed (e.g., during connection drops).
 *
 * Called periodically by the cleanup interval timer.
 */
function cleanupStaleAgentContexts(): void {
  const now = Date.now();
  const staleThreshold = now - AGENT_STACK_STALE_MS;
  let removedCount = 0;

  // Iterate backwards to safely remove elements
  for (let i = agentContextStack.length - 1; i > 0; i--) { // Skip index 0 ('main')
    const agentId = agentContextStack[i];
    const timestamp = agentContextTimestamps.get(agentId);

    // Remove if timestamp is missing (shouldn't happen) or entry is stale
    if (!timestamp || timestamp < staleThreshold) {
      agentContextStack.splice(i, 1);
      agentContextTimestamps.delete(agentId);
      removedCount++;
    }
  }

  if (removedCount > 0) {
    console.log(`[Dashboard] Cleaned up ${removedCount} stale agent context(s), stack depth: ${agentContextStack.length}`);
  }
}

// Start the periodic cleanup interval for stale agent contexts
// This runs even when the WebSocket is disconnected to clean up orphaned entries
const agentContextCleanupInterval = setInterval(cleanupStaleAgentContexts, AGENT_STACK_CLEANUP_INTERVAL_MS);

// Ensure cleanup interval is cleared on page unload to prevent memory leaks
window.addEventListener('beforeunload', () => {
  clearInterval(agentContextCleanupInterval);
});

/**
 * Get the display name for an agent ID.
 * First looks up in the agents map, then falls back to truncated ID or 'main'.
 */
function getAgentDisplayName(agentId: string): string {
  if (agentId === 'main') {
    return 'main';
  }

  const agent = state.agents.get(agentId);
  if (agent?.name) {
    return agent.name;
  }

  // Fallback: truncate the agent ID for display
  return agentId.length > 16 ? agentId.slice(0, 16) : agentId;
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
function displayEmptyPlan(): void {
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
 */
function displaySessionPlanEmpty(sessionId: string): void {
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
 */
function requestPlanContent(planPath: string): void {
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    console.warn('[Dashboard] Cannot request plan content: WebSocket not connected');
    return;
  }

  const request = {
    type: 'plan_request',
    path: planPath,
  };

  try {
    ws.send(JSON.stringify(request));
    console.log(`[Dashboard] Requested plan content: ${planPath}`);
  } catch (error) {
    console.error('[Dashboard] Failed to request plan content:', error);
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
 * Positions the dropdown using fixed positioning to escape overflow:hidden containers.
 */
function openPlanSelector(): void {
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
// Session Management
// ============================================

/**
 * Track a session from any event that includes a sessionId.
 * Creates the session if it doesn't exist.
 * Updates the todo panel when switching to a different session.
 */
function trackSession(sessionId: string, timestamp: string): void {
  if (!sessionId) return;

  const isNewSession = !state.sessions.has(sessionId);
  const isSessionSwitch = state.currentSessionId !== null && state.currentSessionId !== sessionId;

  if (isNewSession) {
    state.sessions.set(sessionId, {
      id: sessionId,
      startTime: timestamp,
      active: true,
      color: getSessionColorByHash(sessionId),
    });
    console.log(`[Dashboard] New session tracked: ${sessionId}`);
    updateSessionIndicator();
  }

  // Update current session
  state.currentSessionId = sessionId;

  // When switching to a different session, update the todo panel
  if (isSessionSwitch || isNewSession) {
    console.log(`[Dashboard] Session switch detected, updating todos for: ${sessionId}`);
    updateTodosForCurrentSession();
  }
}

/**
 * Handle session_start event.
 */
function handleSessionStart(event: MonitorEvent): void {
  const sessionId = String(event.sessionId || '');
  const workingDirectory = event.workingDirectory as string | undefined;

  console.log(`[Dashboard] Session started: ${sessionId}`, { workingDirectory });

  state.sessions.set(sessionId, {
    id: sessionId,
    workingDirectory,
    startTime: event.timestamp,
    active: true,
    color: getSessionColorByHash(sessionId),
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
 * Shows the currently selected session (from the filter bar) rather than just the active session.
 * This ensures the header badge stays in sync with the user's session selection.
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

  // Determine which session to display in the header:
  // - If a specific session is selected in the filter, show that session
  // - If "all" is selected, show a summary or the current active session
  const displaySessionId = state.selectedSession !== 'all'
    ? state.selectedSession
    : state.currentSessionId;

  if (state.selectedSession === 'all' && state.sessions.size > 0) {
    // "All" is selected - show the count of sessions
    indicator.innerHTML = `
      <span class="session-dot" style="background: var(--color-text-muted)"></span>
      <span class="session-id">All (${state.sessions.size})</span>
    `;
    indicator.style.display = 'flex';
  } else if (displaySessionId) {
    const session = state.sessions.get(displaySessionId);
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
    // Fallback: show count of sessions if no session to display
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

    // Insert after view tabs (or header if no view tabs)
    const viewTabs = elements.viewTabs || document.querySelector('.header');
    if (viewTabs && viewTabs.parentNode) {
      viewTabs.parentNode.insertBefore(filterEl, viewTabs.nextSibling);
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

    // Only show clear button for inactive sessions that have stored todos
    const hasTodos = state.sessionTodos.has(sessionId) && (state.sessionTodos.get(sessionId)?.length ?? 0) > 0;
    const showClearBtn = !session.active && hasTodos;

    html += `<div class="session-filter-badge-wrapper">
      <button class="session-filter-badge ${isActive} ${isOnline}" data-session="${escapeHtml(sessionId)}" title="${escapeHtml(title)}">
        <span class="session-filter-dot" style="background: ${session.color}"></span>
        ${escapeHtml(shortId)}
      </button>${showClearBtn ? `<button class="session-clear-btn" data-session="${escapeHtml(sessionId)}" title="Clear todos for this session">x</button>` : ''}
    </div>`;
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

  // Attach click handlers for session clear buttons
  filterEl.querySelectorAll('.session-clear-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation(); // Prevent session selection
      const sessionId = (btn as HTMLElement).dataset.session;
      if (sessionId) {
        clearSessionTodos(sessionId);
      }
    });
  });
}

/**
 * Select a session to filter by.
 * Updates event filtering, todo display, and shows the session's associated plan.
 */
function selectSession(sessionId: string): void {
  state.selectedSession = sessionId;
  updateSessionIndicator(); // Updates both header indicator and filter bar
  filterAllBySession();

  // Show the plan associated with this session (if any)
  if (sessionId === 'all') {
    // When "All" is selected, show empty state - plans are session-specific
    displayEmptyPlan();
  } else {
    // Check if this session has an associated plan
    const associatedPlanPath = state.sessionPlanMap.get(sessionId);
    if (associatedPlanPath) {
      // Show this session's plan
      displayPlan(associatedPlanPath);
    } else {
      // No plan associated with this session - show a helpful message
      displaySessionPlanEmpty(sessionId);
    }
  }

  // Update todo display based on session selection
  if (sessionId === 'all') {
    // With "All" selected, show empty todos (user can select a specific session)
    state.todos = [];
    elements.todoCount.textContent = '0';
    renderTodoPanel();
  } else {
    // Show todos for the selected session
    state.todos = state.sessionTodos.get(sessionId) || [];
    elements.todoCount.textContent = String(state.todos.length);
    renderTodoPanel();
  }
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

  // Update counts to reflect filtered entries
  updateThinkingCount();
  updateToolsCount();
}

/**
 * Apply session filter to a single entry element.
 * Also considers text filter.
 */
function applySessionFilter(entry: HTMLElement): void {
  const entrySession = entry.dataset.session || '';
  const matchesSession = state.selectedSession === 'all' || entrySession === state.selectedSession;

  // Check if this is a thinking entry or tool entry
  const isThinkingEntry = entry.classList.contains('thinking-entry');

  if (isThinkingEntry) {
    const matchesText = !state.thinkingFilter ||
      (entry.dataset.content || '').includes(state.thinkingFilter.toLowerCase());
    entry.style.display = (matchesSession && matchesText) ? '' : 'none';
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

type ViewType = 'all' | 'thinking' | 'tools' | 'todo' | 'plan';

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
    { id: 'todo', label: 'Todo', shortcut: 'd' },
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
  panels.classList.remove('view-all', 'view-thinking', 'view-tools', 'view-todo', 'view-plan');

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
  if (elements.todoPanel) {
    elements.todoPanel.style.display =
      (showAll || state.activeView === 'todo') ? '' : 'none';
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

/**
 * Stub for agent tree rendering.
 * The agent tree panel was replaced with the todo panel.
 * This function is kept as a no-op to prevent errors from agent_start/stop handlers.
 */
function renderAgentTree(): void {
  // No-op: Agent tree panel has been replaced with todo panel
}

// ============================================
// Todo Panel
// ============================================

/**
 * Detect if a Read, Write, or Edit tool is targeting a plan file.
 * If so, associate that plan with the given session ID.
 * This allows us to show the correct plan when the user filters by session.
 * Tracking Read operations catches sessions started with `claude --plan`.
 */
function detectPlanAccess(input: string, sessionId: string): void {
  try {
    // The input is typically JSON with a file_path field
    const parsed = JSON.parse(input);
    const filePath = parsed.file_path || parsed.path || '';

    // Check if the path is a plan file (in ~/.claude/plans/ or .claude/plans/)
    const planPathMatch = filePath.match(/\.claude\/plans\/([^/]+\.md)$/);
    if (planPathMatch) {
      // Store the association: this session uses this plan
      state.sessionPlanMap.set(sessionId, filePath);
      console.log(`[Dashboard] Session ${sessionId.slice(0, 8)} associated with plan: ${planPathMatch[1]}`);
    }
  } catch {
    // Input might not be JSON, or might not have a file_path
    // Try a simple regex match on the raw input
    const planPathMatch = input.match(/\.claude\/plans\/[^"'\s]+\.md/);
    if (planPathMatch) {
      state.sessionPlanMap.set(sessionId, planPathMatch[0]);
      console.log(`[Dashboard] Session ${sessionId.slice(0, 8)} associated with plan (regex): ${planPathMatch[0]}`);
    }
  }
}

/**
 * Parse TodoWrite tool input to extract todo items.
 * The input is a JSON string with a "todos" array.
 * Associates todos with the given session ID.
 */
function parseTodoWriteInput(input: string | undefined, sessionId: string | undefined): void {
  if (!input) {
    return;
  }

  try {
    const parsed = JSON.parse(input);

    if (parsed.todos && Array.isArray(parsed.todos)) {
      handleTodoUpdate(parsed.todos, sessionId);
    }
  } catch (e) {
    console.warn('[Dashboard] Failed to parse TodoWrite input:', e);
  }
}

/**
 * Update the todo state and re-render the panel.
 * Stores todos per session and updates the display based on the current session.
 * Persists to localStorage for survival across page refreshes.
 */
function handleTodoUpdate(todos: TodoItem[], sessionId: string | undefined): void {
  // Store todos for this session
  const effectiveSessionId = sessionId || state.currentSessionId || 'unknown';
  state.sessionTodos.set(effectiveSessionId, todos);

  // Persist to localStorage
  saveTodosToStorage();

  // Only update displayed todos if:
  // 1. "All" is NOT selected (we only show todos for a specific session), AND
  // 2. Either this is for the selected session, OR the selected session matches
  if (state.selectedSession === 'all') {
    // When "All" is selected, don't display any todos
    // (user must select a specific session to see todos)
    return;
  }

  // Update display if this update is for the selected session
  if (effectiveSessionId === state.selectedSession) {
    state.todos = todos;
    elements.todoCount.textContent = String(todos.length);
    renderTodoPanel();
  }
}

/**
 * Update the displayed todos based on the current session.
 * Called when switching sessions to show the appropriate todos.
 * Respects the user's session filter selection.
 */
function updateTodosForCurrentSession(): void {
  // If "All" is selected, don't display any todos
  // (user must select a specific session to see todos)
  if (state.selectedSession === 'all') {
    state.todos = [];
    elements.todoCount.textContent = '0';
    renderTodoPanel();
    return;
  }

  // Use the selected session filter, not the active session
  const sessionToShow = state.selectedSession;
  state.todos = state.sessionTodos.get(sessionToShow) || [];

  elements.todoCount.textContent = String(state.todos.length);
  renderTodoPanel();
}

/**
 * Clear todos for a specific session.
 * Removes from state, updates localStorage, and refreshes UI.
 * Also removes the session from the sessions map if it's inactive.
 */
function clearSessionTodos(sessionId: string): void {
  console.log(`[Dashboard] Clearing todos for session: ${sessionId}`);

  // Remove todos for this session
  state.sessionTodos.delete(sessionId);

  // If this was the currently displayed session, clear the display
  if (state.currentSessionId === sessionId || state.selectedSession === sessionId) {
    state.todos = [];
    elements.todoCount.textContent = '0';
    renderTodoPanel();
  }

  // Remove inactive session from sessions map (cleanup stale sessions)
  const session = state.sessions.get(sessionId);
  if (session && !session.active) {
    state.sessions.delete(sessionId);
  }

  // Persist the updated state
  saveTodosToStorage();

  // Refresh the session filter UI
  updateSessionFilter();
  updateSessionIndicator();

  // Show feedback
  showToast('Session todos cleared', 'success');
}

/**
 * Save session todos to localStorage for persistence across refreshes.
 * Converts the Map to a serializable format.
 */
function saveTodosToStorage(): void {
  try {
    // Convert Map to array of [sessionId, todos] entries for JSON serialization
    const entries: Array<[string, TodoItem[]]> = Array.from(state.sessionTodos.entries());
    localStorage.setItem(STORAGE_KEY_TODOS, JSON.stringify(entries));
    console.log(`[Dashboard] Saved ${entries.length} session(s) of todos to localStorage`);
  } catch (error) {
    console.warn('[Dashboard] Failed to save todos to localStorage:', error);
  }
}

/**
 * Restore session todos from localStorage on page load.
 * Reconstructs the Map from the stored array format.
 */
function restoreTodosFromStorage(): void {
  try {
    const stored = localStorage.getItem(STORAGE_KEY_TODOS);
    if (!stored) {
      console.log('[Dashboard] No stored todos found in localStorage');
      return;
    }

    const entries: Array<[string, TodoItem[]]> = JSON.parse(stored);
    if (!Array.isArray(entries)) {
      console.warn('[Dashboard] Invalid stored todos format, clearing');
      localStorage.removeItem(STORAGE_KEY_TODOS);
      return;
    }

    // Reconstruct the sessionTodos map
    state.sessionTodos = new Map(entries);
    console.log(`[Dashboard] Restored ${state.sessionTodos.size} session(s) of todos from localStorage`);

    // If there's exactly one session, auto-select it to display its todos
    if (state.sessionTodos.size === 1) {
      const [sessionId, todos] = entries[0];
      state.currentSessionId = sessionId;
      state.selectedSession = sessionId;
      state.todos = todos;
      elements.todoCount.textContent = String(todos.length);

      // Also restore the session in the sessions map for UI consistency
      if (!state.sessions.has(sessionId)) {
        state.sessions.set(sessionId, {
          id: sessionId,
          startTime: new Date().toISOString(),
          active: false, // Will be updated when we reconnect
          color: getSessionColorByHash(sessionId),
        });
      }
    } else if (state.sessionTodos.size > 1) {
      // Multiple sessions - restore session entries for filter UI
      for (const [sessionId] of entries) {
        if (!state.sessions.has(sessionId)) {
          state.sessions.set(sessionId, {
            id: sessionId,
            startTime: new Date().toISOString(),
            active: false,
            color: getSessionColorByHash(sessionId),
          });
        }
      }
    }
  } catch (error) {
    console.warn('[Dashboard] Failed to restore todos from localStorage:', error);
  }
}

/**
 * Render the TODO panel with current todo items.
 */
function renderTodoPanel(): void {
  if (state.todos.length === 0) {
    // Show different message based on whether "All" sessions is selected
    const message = state.selectedSession === 'all' && state.sessions.size > 0
      ? 'Select a session to view its todos'
      : 'No todos';

    elements.todoContent.innerHTML = `
      <div class="empty-state">
        <span class="empty-icon">checklist</span>
        <p>${message}</p>
      </div>
    `;
    return;
  }

  const html = state.todos.map((todo, index) => {
    const statusClass = `todo-status-${todo.status}`;
    // Add completed class for strikethrough styling
    let itemClass = 'todo-item';
    if (todo.status === 'in_progress') {
      itemClass += ' todo-item-active';
    } else if (todo.status === 'completed') {
      itemClass += ' todo-item-completed';
    }

    // Choose the display text based on status
    const displayText = todo.status === 'in_progress' ? todo.activeForm : todo.content;

    return `
      <div class="${itemClass}" data-index="${index}">
        <span class="todo-status ${statusClass}"></span>
        <span class="todo-content">${escapeHtml(displayText)}</span>
      </div>
    `;
  }).join('');

  elements.todoContent.innerHTML = html;
}

// ============================================
// Filtering
// ============================================

function applyThinkingFilter(entry: HTMLElement): void {
  const content = entry.dataset.content || '';
  const matchesText = !state.thinkingFilter || content.includes(state.thinkingFilter.toLowerCase());
  const sessionMatches = state.selectedSession === 'all' || entry.dataset.session === state.selectedSession;
  entry.style.display = (matchesText && sessionMatches) ? '' : 'none';
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

  // Update count to reflect filtered entries
  updateThinkingCount();
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

  // Update count to reflect filtered entries
  updateToolsCount();
}

/**
 * Update the thinking count display.
 * Shows "filtered/total" format when a filter is active, otherwise just the total.
 */
function updateThinkingCount(): void {
  const hasFilter = state.thinkingFilter || state.selectedSession !== 'all';

  if (hasFilter) {
    // Count visible entries
    const entries = elements.thinkingContent.querySelectorAll('.thinking-entry');
    let visibleCount = 0;
    entries.forEach((entry: Element) => {
      const el = entry as HTMLElement;
      if (el.style.display !== 'none') {
        visibleCount++;
      }
    });
    elements.thinkingCount.textContent = `${visibleCount}/${state.thinkingCount}`;
  } else {
    elements.thinkingCount.textContent = String(state.thinkingCount);
  }
}

/**
 * Update the tools count display.
 * Shows "filtered/total" format when a filter is active, otherwise just the total.
 */
function updateToolsCount(): void {
  const hasFilter = state.toolsFilter || state.selectedSession !== 'all';

  if (hasFilter) {
    // Count visible entries
    const entries = elements.toolsContent.querySelectorAll('.tool-entry');
    let visibleCount = 0;
    entries.forEach((entry: Element) => {
      const el = entry as HTMLElement;
      if (el.style.display !== 'none') {
        visibleCount++;
      }
    });
    elements.toolsCount.textContent = `${visibleCount}/${state.toolsCount}`;
  } else {
    elements.toolsCount.textContent = String(state.toolsCount);
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

/**
 * Render simple markdown to HTML with XSS protection.
 *
 * Security approach:
 * 1. First escape ALL HTML in the content to prevent XSS
 * 2. Then apply markdown patterns to the escaped content
 * 3. For links, validate URLs to prevent javascript: protocol XSS
 *
 * Supported markdown:
 * - Headers: # ## ###
 * - Code blocks: ```code```
 * - Inline code: `code`
 * - Bold: **text**
 * - Italic: *text* or _text_
 * - Links: [text](url)
 */
function renderSimpleMarkdown(content: string): string {
  // SECURITY: Escape ALL HTML first to prevent XSS
  // This converts <, >, &, ", ' to their HTML entities
  let html = escapeHtml(content);

  // Code blocks - preserve content as-is (already escaped)
  // Match: ```optional-language\ncontent```
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, '<pre><code>$2</code></pre>');

  // Inline code - preserve content as-is (already escaped)
  // Match: `content` (non-greedy, no backticks inside)
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

  // Headers - content is already escaped
  html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
  html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');

  // Bold: **text** (must have content between asterisks)
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

  // Italic: *text* or _text_ (single asterisk/underscore)
  // Must not be inside a word for underscores, and must have content
  html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  html = html.replace(/\b_([^_]+)_\b/g, '<em>$1</em>');

  // Links: [text](url)
  // SECURITY: Validate URL to prevent javascript: protocol XSS
  // The text is already escaped, but we need to validate the URL
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_match, text, url) => {
    // URL has been through escapeHtml, so &quot; might be present
    // Decode common HTML entities for URL validation
    const decodedUrl = url
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'");

    // SECURITY: Only allow safe URL protocols
    // Block javascript:, data:, vbscript:, and other dangerous protocols
    const trimmedUrl = decodedUrl.trim().toLowerCase();
    const isSafeUrl = (
      trimmedUrl.startsWith('http://') ||
      trimmedUrl.startsWith('https://') ||
      trimmedUrl.startsWith('/') ||
      trimmedUrl.startsWith('#') ||
      trimmedUrl.startsWith('mailto:') ||
      // Relative URLs (no protocol)
      (!trimmedUrl.includes(':') && !trimmedUrl.startsWith('//'))
    );

    if (!isSafeUrl) {
      // Unsafe URL - render as plain text (already escaped)
      return `[${text}](${url})`;
    }

    // Safe URL - render as link with security attributes
    // Re-escape the URL for the href attribute
    const safeUrl = escapeHtml(decodedUrl);
    return `<a href="${safeUrl}" target="_blank" rel="noopener noreferrer">${text}</a>`;
  });

  // Line breaks - convert newlines to <br> for display
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

  // Reset agent context stack to just 'main' and clear timestamps
  agentContextStack.length = 0;
  agentContextStack.push('main');
  agentContextTimestamps.clear();

  // Clear session-plan associations to prevent memory leak
  state.sessionPlanMap.clear();

  // Hide session indicator and filter
  updateSessionIndicator();

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

  elements.todoContent.innerHTML = `
    <div class="empty-state">
      <span class="empty-icon">checklist</span>
      <p>No todos</p>
    </div>
  `;

  // NOTE: Plan state is intentionally NOT cleared.
  // Plans are workspace-level resources and should persist across clear operations.
  // Only events, sessions, and todos are cleared.
}

// ============================================
// Keyboard Shortcuts
// ============================================

function handleKeydown(event: KeyboardEvent): void {
  // Check if user is typing in an input field
  const activeElement = document.activeElement;
  const isInputFocused = activeElement instanceof HTMLInputElement ||
                         activeElement instanceof HTMLTextAreaElement ||
                         activeElement?.getAttribute('contenteditable') === 'true';

  if (isInputFocused) {
    // Only allow Escape to blur, ignore other shortcuts
    if (event.key === 'Escape') {
      (activeElement as HTMLElement).blur();
      event.preventDefault();
    }
    return; // Don't process other shortcuts when typing
  }

  // Enable keyboard mode indicator
  if (!state.keyboardMode) {
    state.keyboardMode = true;
    document.body.classList.add('keyboard-mode');
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
      case 'd':
        selectView('todo');
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

// Restore persisted todos from localStorage before connecting
restoreTodosFromStorage();

// Update UI with restored state
if (state.todos.length > 0) {
  renderTodoPanel();
}
if (state.sessions.size > 0) {
  updateSessionIndicator();
}

connect();
console.log('[Dashboard] Thinking Monitor initialized');
console.log('[Dashboard] Keyboard shortcuts: a/t/o/g/p=views, c=clear, s=scroll, /=search, Esc=clear filters');
console.log('[Dashboard] Plan shortcuts: Cmd+O=open, Cmd+Shift+R=reveal, right-click=context menu');
