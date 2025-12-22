/**
 * Thinking Monitor Dashboard - Client Application
 *
 * WebSocket client that connects to the monitor server and renders
 * real-time events in the dashboard panels.
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
const RECONNECT_DELAY_MS = 3000;
const MAX_ENTRIES = 500; // Max entries per panel to prevent memory issues

// ============================================
// State
// ============================================

interface AppState {
  connected: boolean;
  autoScroll: boolean;
  eventCount: number;
  thinkingCount: number;
  toolsCount: number;
  agentsCount: number;
  selectedAgent: string;
  agents: Map<string, AgentInfo>;
  pendingTools: Map<string, ToolInfo>;
}

interface AgentInfo {
  id: string;
  name?: string;
  parentId?: string;
  active: boolean;
  startTime: string;
}

interface ToolInfo {
  id: string;
  name: string;
  input?: string;
  startTime: string;
}

const state: AppState = {
  connected: false,
  autoScroll: true,
  eventCount: 0,
  thinkingCount: 0,
  toolsCount: 0,
  agentsCount: 0,
  selectedAgent: 'all',
  agents: new Map(),
  pendingTools: new Map(),
};

// ============================================
// DOM Elements
// ============================================

const elements = {
  connectionStatus: document.getElementById('connection-status')!,
  clearBtn: document.getElementById('clear-btn')!,
  autoScrollCheckbox: document.getElementById('auto-scroll') as HTMLInputElement,
  agentTabs: document.getElementById('agent-tabs')!,
  thinkingContent: document.getElementById('thinking-content')!,
  thinkingCount: document.getElementById('thinking-count')!,
  toolsContent: document.getElementById('tools-content')!,
  toolsCount: document.getElementById('tools-count')!,
  agentsContent: document.getElementById('agents-content')!,
  agentsCount: document.getElementById('agents-count')!,
  planContent: document.getElementById('plan-content')!,
  planPath: document.getElementById('plan-path')!,
  serverInfo: document.getElementById('server-info')!,
  eventCount: document.getElementById('event-count')!,
};

// ============================================
// WebSocket Connection
// ============================================

let ws: WebSocket | null = null;
let reconnectTimeout: number | null = null;

function connect(): void {
  if (ws?.readyState === WebSocket.OPEN || ws?.readyState === WebSocket.CONNECTING) {
    return;
  }

  updateConnectionStatus('connecting');

  ws = new WebSocket(WS_URL);

  ws.onopen = () => {
    console.log('[Dashboard] Connected to monitor server');
    state.connected = true;
    updateConnectionStatus('connected');

    if (reconnectTimeout) {
      clearTimeout(reconnectTimeout);
      reconnectTimeout = null;
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

  reconnectTimeout = window.setTimeout(() => {
    reconnectTimeout = null;
    console.log('[Dashboard] Attempting to reconnect...');
    connect();
  }, RECONNECT_DELAY_MS);
}

function updateConnectionStatus(status: 'connected' | 'disconnected' | 'connecting'): void {
  const statusEl = elements.connectionStatus;
  statusEl.className = `status status-${status}`;

  const textEl = statusEl.querySelector('.status-text');
  if (textEl) {
    textEl.textContent = status.charAt(0).toUpperCase() + status.slice(1);
  }
}

// ============================================
// Event Handling
// ============================================

function handleEvent(event: MonitorEvent): void {
  state.eventCount++;
  elements.eventCount.textContent = `Events: ${state.eventCount}`;

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

  const content = escapeHtml(String(event.content || ''));
  const time = formatTime(event.timestamp);
  const agentId = event.agentId || 'main';

  // Clear empty state if present
  const emptyState = elements.thinkingContent.querySelector('.empty-state');
  if (emptyState) {
    emptyState.remove();
  }

  // Create thinking entry
  const entry = document.createElement('div');
  entry.className = 'thinking-entry';
  entry.dataset.agent = agentId;
  entry.innerHTML = `
    <div class="thinking-entry-header">
      <span class="thinking-time">${time}</span>
      <span class="thinking-agent">${escapeHtml(agentId)}</span>
    </div>
    <div class="thinking-text">${content}</div>
  `;

  appendAndTrim(elements.thinkingContent, entry);
  maybeScroll(elements.thinkingContent);
}

function handleToolStart(event: MonitorEvent): void {
  const toolName = String(event.toolName || 'Unknown');
  const toolCallId = String(event.toolCallId || `tool-${Date.now()}`);
  const input = event.input ? String(event.input) : undefined;
  const time = formatTime(event.timestamp);

  // Track pending tool
  state.pendingTools.set(toolCallId, {
    id: toolCallId,
    name: toolName,
    input,
    startTime: event.timestamp,
  });

  state.toolsCount++;
  elements.toolsCount.textContent = String(state.toolsCount);

  // Clear empty state if present
  const emptyState = elements.toolsContent.querySelector('.empty-state');
  if (emptyState) {
    emptyState.remove();
  }

  // Create tool entry
  const entry = document.createElement('div');
  entry.className = 'tool-entry';
  entry.id = `tool-${toolCallId}`;
  entry.innerHTML = `
    <span class="tool-time">${time}</span>
    <span class="tool-name">${escapeHtml(toolName)}</span>
    <span class="tool-detail">${escapeHtml(summarizeInput(input))}</span>
    <span class="tool-status tool-status-pending">running</span>
  `;

  appendAndTrim(elements.toolsContent, entry);
  maybeScroll(elements.toolsContent);
}

function handleToolEnd(event: MonitorEvent): void {
  const toolCallId = String(event.toolCallId || '');

  // Update existing entry if found
  const entry = document.getElementById(`tool-${toolCallId}`);
  if (entry) {
    const statusEl = entry.querySelector('.tool-status');
    if (statusEl) {
      statusEl.className = 'tool-status tool-status-done';
      statusEl.textContent = 'done';
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
    renderAgentTree();
    renderAgentTabs();
  }
}

function handlePlanUpdate(event: MonitorEvent): void {
  const filename = event.filename ? String(event.filename) : 'Unknown plan';
  const content = event.content ? String(event.content) : '';

  elements.planPath.textContent = filename;
  elements.planContent.innerHTML = `
    <div class="plan-markdown">${renderSimpleMarkdown(content)}</div>
  `;
}

function handlePlanDelete(_event: MonitorEvent): void {
  elements.planPath.textContent = 'No active plan';
  elements.planContent.innerHTML = `
    <div class="empty-state">
      <span class="empty-icon">file</span>
      <p>No plan file loaded</p>
    </div>
  `;
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
  const dotClass = agent.active ? 'agent-dot-active' : '';
  const colorClass = getAgentColorClass(agent.name || agent.id);

  let html = `
    <div class="agent-node">
      <div class="agent-node-header">
        <span class="agent-node-dot ${colorClass} ${dotClass}" style="background: var(${colorClass})"></span>
        <span class="agent-node-name">${escapeHtml(agent.name || agent.id.slice(0, 8))}</span>
        <span class="agent-node-id">(${escapeHtml(agent.id.slice(0, 8))})</span>
      </div>
  `;

  if (children.length > 0) {
    html += `<div class="agent-node-children">${children.map(c => renderAgentNode(c)).join('')}</div>`;
  }

  html += '</div>';
  return html;
}

function renderAgentTabs(): void {
  // Keep the "All" tab
  const allTab = elements.agentTabs.querySelector('[data-agent="all"]');
  elements.agentTabs.innerHTML = '';
  if (allTab) {
    elements.agentTabs.appendChild(allTab);
  }

  // Add agent tabs
  for (const agent of state.agents.values()) {
    const tab = document.createElement('button');
    tab.className = `agent-tab${state.selectedAgent === agent.id ? ' active' : ''}`;
    tab.dataset.agent = agent.id;

    const dotClass = agent.active ? 'agent-dot-active' : '';
    const colorVar = getAgentColorClass(agent.name || agent.id);

    tab.innerHTML = `
      <span class="agent-dot ${dotClass}" style="background: var(${colorVar})"></span>
      ${escapeHtml(agent.name || agent.id.slice(0, 8))}
    `;

    tab.addEventListener('click', () => selectAgent(agent.id));
    elements.agentTabs.appendChild(tab);
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
    if (agentId === 'all' || el.dataset.agent === agentId) {
      el.style.display = '';
    } else {
      el.style.display = 'none';
    }
  });
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

function maybeScroll(container: HTMLElement): void {
  if (state.autoScroll) {
    container.scrollTop = container.scrollHeight;
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

  // Update counters
  elements.eventCount.textContent = 'Events: 0';
  elements.thinkingCount.textContent = '0';
  elements.toolsCount.textContent = '0';
  elements.agentsCount.textContent = '0';

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
// Event Listeners
// ============================================

elements.clearBtn.addEventListener('click', clearAllPanels);

elements.autoScrollCheckbox.addEventListener('change', () => {
  state.autoScroll = elements.autoScrollCheckbox.checked;
});

// Handle "All" tab click
const allTab = elements.agentTabs.querySelector('[data-agent="all"]');
if (allTab) {
  allTab.addEventListener('click', () => selectAgent('all'));
}

// ============================================
// Initialize
// ============================================

connect();
console.log('[Dashboard] Thinking Monitor initialized');
