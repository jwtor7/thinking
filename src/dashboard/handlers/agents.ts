import { state, agentContextStack, agentContextTimestamps, subagentState } from '../state.ts';
import { elements } from '../ui/elements.ts';
import { MAX_AGENT_STACK_SIZE, AGENT_STACK_STALE_MS, AGENT_STACK_CLEANUP_INTERVAL_MS } from '../config.ts';
import { escapeHtml, escapeCssValue } from '../utils/html.ts';
import { getAgentBadgeColors } from '../ui/colors.ts';
import { selectAgentFilter } from './sessions.ts';
import type { AgentStartEvent, AgentStopEvent, AgentInfo, SubagentMappingEvent, SubagentMappingInfo } from '../types.ts';

/**
 * Handles agent start events
 */
function handleAgentStart(event: AgentStartEvent): void {
  const agentId = event.agentId;
  const agentName = event.agentName || agentId.slice(0, 8);
  const parentId = event.parentAgentId;

  state.agents.set(agentId, {
    id: agentId,
    name: agentName,
    parentId,
    sessionId: event.sessionId || state.currentSessionId || undefined,
    active: true,
    status: 'running',
    startTime: event.timestamp,
  });

  pushAgentContext(agentId);

  state.agentsCount = state.agents.size;
  if (elements.agentsCount) {
    elements.agentsCount.textContent = String(state.agentsCount);
  }

  renderAgentTree();
}

/**
 * Handles agent stop events
 */
function handleAgentStop(event: AgentStopEvent): void {
  const agentId = event.agentId;
  const agent = state.agents.get(agentId);

  if (agent) {
    agent.active = false;
    agent.status = event.status || 'success';
    agent.endTime = event.timestamp;

    popAgentContext(agentId);
    renderAgentTree();
  }
}

/**
 * Handles subagent_mapping events from the server.
 * Updates the subagent state with parent-child relationships and nested hierarchies.
 */
function handleSubagentMapping(event: SubagentMappingEvent): void {
  // Clear existing mappings
  subagentState.subagents.clear();
  subagentState.sessionSubagents.clear();
  subagentState.agentChildren.clear();

  // Populate with new mappings
  for (const mapping of event.mappings) {
    // Store subagent info
    subagentState.subagents.set(mapping.agentId, mapping);

    // Update session -> subagents index
    let subagents = subagentState.sessionSubagents.get(mapping.parentSessionId);
    if (!subagents) {
      subagents = new Set();
      subagentState.sessionSubagents.set(mapping.parentSessionId, subagents);
    }
    subagents.add(mapping.agentId);

    // Build nested agent hierarchy (parentAgentId -> children)
    if (mapping.parentAgentId) {
      let children = subagentState.agentChildren.get(mapping.parentAgentId);
      if (!children) {
        children = new Set();
        subagentState.agentChildren.set(mapping.parentAgentId, children);
      }
      children.add(mapping.agentId);
    }
  }

  console.log(
    `[Dashboard] Subagent mappings updated: ${event.mappings.length} subagent(s), ${subagentState.agentChildren.size} parent(s) with children`
  );

  renderAgentTree();
}

/**
 * Check if an agentId is a subagent (has a parent session).
 */
function isSubagent(agentId: string | undefined): boolean {
  if (!agentId) return false;
  return subagentState.subagents.has(agentId);
}

/**
 * Get the parent session ID for a subagent.
 */
function getParentSession(agentId: string): string | undefined {
  return subagentState.subagents.get(agentId)?.parentSessionId;
}

/**
 * Get all subagent IDs for a session.
 */
function getSessionSubagentIds(sessionId: string): Set<string> {
  return subagentState.sessionSubagents.get(sessionId) || new Set();
}

/**
 * Get all subagent mappings for a session.
 */
function getSessionSubagents(sessionId: string): SubagentMappingInfo[] {
  const agentIds = subagentState.sessionSubagents.get(sessionId);
  if (!agentIds) return [];

  const result: SubagentMappingInfo[] = [];
  for (const agentId of agentIds) {
    const mapping = subagentState.subagents.get(agentId);
    if (mapping) {
      result.push(mapping);
    }
  }
  return result;
}

/**
 * Finds the currently active agent (most recently started)
 */
function findActiveAgent(): AgentInfo | undefined {
  let activeAgent: AgentInfo | undefined;
  for (const agent of state.agents.values()) {
    if (agent.active && agent.status === 'running') {
      if (!activeAgent || agent.startTime > activeAgent.startTime) {
        activeAgent = agent;
      }
    }
  }
  return activeAgent;
}

/**
 * Gets the current agent context (top of the stack)
 */
function getCurrentAgentContext(): string {
  return agentContextStack[agentContextStack.length - 1] || 'main';
}

/**
 * Pushes an agent ID onto the context stack
 */
function pushAgentContext(agentId: string): void {
  if (agentId && agentId !== 'main') {
    while (agentContextStack.length >= MAX_AGENT_STACK_SIZE) {
      const removedId = agentContextStack.splice(1, 1)[0];
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
 * Pops an agent ID from the context stack
 */
function popAgentContext(agentId: string): void {
  if (agentId && agentId !== 'main') {
    const index = agentContextStack.indexOf(agentId);
    if (index > 0) {
      agentContextStack.splice(index, 1);
      agentContextTimestamps.delete(agentId);
      console.log(`[Dashboard] Agent context popped: ${agentId}, stack depth: ${agentContextStack.length}`);
    }
  }
}

/**
 * Cleans up stale agent contexts from the stack
 */
function cleanupStaleAgentContexts(): void {
  const now = Date.now();
  const staleThreshold = now - AGENT_STACK_STALE_MS;
  let removedCount = 0;

  for (let i = agentContextStack.length - 1; i > 0; i--) {
    const agentId = agentContextStack[i];
    const timestamp = agentContextTimestamps.get(agentId);

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

/**
 * Gets the display name for an agent
 */
function getAgentDisplayName(agentId: string): string {
  if (agentId === 'main') {
    return 'main';
  }

  const agent = state.agents.get(agentId);
  if (agent?.name) {
    return agent.name;
  }

  return agentId.length > 16 ? agentId.slice(0, 16) : agentId;
}

/**
 * Renders the agent tree showing nested hierarchies.
 * Builds a recursive tree from subagent mappings and agent state.
 */
function renderAgentTree(): void {
  const treeContainer = elements.agentTreeContent;
  if (!treeContainer) return;

  // Find root agents (those without a parentAgentId, or whose parent is a session)
  const rootAgents: SubagentMappingInfo[] = [];
  for (const mapping of subagentState.subagents.values()) {
    if (!mapping.parentAgentId || !subagentState.subagents.has(mapping.parentAgentId)) {
      rootAgents.push(mapping);
    }
  }

  if (rootAgents.length === 0) {
    treeContainer.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">&#128279;</div>
        <p class="empty-state-title">No agents active</p>
        <p class="empty-state-subtitle">Agent hierarchy will appear here</p>
      </div>
    `;
    return;
  }

  // Sort roots by start time
  rootAgents.sort((a, b) => a.startTime.localeCompare(b.startTime));

  treeContainer.innerHTML = '';
  for (const root of rootAgents) {
    const node = renderAgentNode(root, 0);
    treeContainer.appendChild(node);
  }
}

/**
 * Render a single agent node and its children recursively.
 */
function renderAgentNode(mapping: SubagentMappingInfo, depth: number): HTMLElement {
  const node = document.createElement('div');
  node.className = 'agent-tree-node';
  node.style.paddingLeft = `${depth * 16}px`;

  const statusClass = mapping.status === 'running' ? 'agent-status-running'
    : mapping.status === 'success' ? 'agent-status-success'
    : mapping.status === 'failure' ? 'agent-status-failure'
    : 'agent-status-cancelled';

  const badgeColors = getAgentBadgeColors(mapping.agentName);
  const isSelected = state.selectedAgentId === mapping.agentId;

  // Calculate duration for completed agents
  let durationText = '';
  if (mapping.endTime && mapping.startTime) {
    const ms = new Date(mapping.endTime).getTime() - new Date(mapping.startTime).getTime();
    if (ms < 1000) durationText = `${ms}ms`;
    else if (ms < 60000) durationText = `${(ms / 1000).toFixed(1)}s`;
    else durationText = `${(ms / 60000).toFixed(1)}m`;
  }

  node.innerHTML = `
    <div class="agent-tree-item ${statusClass} ${isSelected ? 'agent-tree-selected' : ''}" data-agent-id="${escapeHtml(mapping.agentId)}">
      ${depth > 0 ? '<span class="agent-tree-line">&#9492;</span>' : ''}
      <span class="agent-tree-dot ${statusClass}"></span>
      <span class="agent-tree-name" style="background: ${escapeCssValue(badgeColors.bg)}; color: ${escapeCssValue(badgeColors.text)}">${escapeHtml(mapping.agentName)}</span>
      ${durationText ? `<span class="agent-tree-duration">${escapeHtml(durationText)}</span>` : ''}
    </div>
  `;

  // Click handler for per-agent filtering
  const item = node.querySelector('.agent-tree-item') as HTMLElement;
  item?.addEventListener('click', () => {
    const agentId = mapping.agentId;
    // Toggle: if already selected, deselect
    if (state.selectedAgentId === agentId) {
      selectAgentFilter(null);
    } else {
      selectAgentFilter(agentId);
    }
    renderAgentTree();
  });

  // Render children
  const children = subagentState.agentChildren.get(mapping.agentId);
  if (children) {
    for (const childId of children) {
      const childMapping = subagentState.subagents.get(childId);
      if (childMapping) {
        const childNode = renderAgentNode(childMapping, depth + 1);
        node.appendChild(childNode);
      }
    }
  }

  return node;
}

// Start the periodic cleanup interval for stale agent contexts
const agentContextCleanupInterval = setInterval(cleanupStaleAgentContexts, AGENT_STACK_CLEANUP_INTERVAL_MS);

// Ensure cleanup interval is cleared on page unload
window.addEventListener('beforeunload', () => {
  clearInterval(agentContextCleanupInterval);
});

export {
  handleAgentStart,
  handleAgentStop,
  handleSubagentMapping,
  findActiveAgent,
  getCurrentAgentContext,
  pushAgentContext,
  popAgentContext,
  cleanupStaleAgentContexts,
  getAgentDisplayName,
  isSubagent,
  getParentSession,
  getSessionSubagentIds,
  getSessionSubagents,
};
