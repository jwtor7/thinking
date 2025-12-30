import { state, agentContextStack, agentContextTimestamps } from '../state';
import { elements } from '../ui/elements';
import { MAX_AGENT_STACK_SIZE, AGENT_STACK_STALE_MS, AGENT_STACK_CLEANUP_INTERVAL_MS } from '../config';
import type { AgentStartEvent, AgentStopEvent, AgentInfo } from '../types';

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
 * Renders the agent tree
 * No-op: Agent tree panel has been replaced with todo panel
 */
function renderAgentTree(): void {
  // No-op: Agent tree panel has been replaced with todo panel
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
  findActiveAgent,
  getCurrentAgentContext,
  pushAgentContext,
  popAgentContext,
  cleanupStaleAgentContexts,
  getAgentDisplayName,
};
