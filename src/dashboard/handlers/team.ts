/**
 * Team event handlers for the Thinking Monitor Dashboard.
 *
 * Unified collaboration surface:
 * - Team members and hierarchy
 * - Inter-agent messages
 * - Session-scoped agent list + thinking detail
 */

import { teamState, state, subagentState } from '../state.ts';
import { elements } from '../ui/elements.ts';
import { formatTime } from '../utils/formatting.ts';
import { escapeHtml, escapeCssValue } from '../utils/html.ts';
import { getAgentBadgeColors } from '../ui/colors.ts';
import { selectAgentFilter, resolveSessionId } from './sessions.ts';
import type { TeamUpdateEvent, TeammateIdleEvent, MessageSentEvent, ThinkingEvent } from '../types.ts';
import { updateTabBadge } from '../ui/views.ts';

// ============================================
// Constants
// ============================================

const MAX_MESSAGES = 200;
const MAX_ENTRIES_PER_AGENT = 200;
const TEAM_SECTION_STORAGE_KEY = 'thinking-monitor-team-section-collapse';

type TeamSectionName = 'members' | 'hierarchy' | 'agents';

const TEAM_SECTION_LABELS: Record<TeamSectionName, string> = {
  members: 'team members section',
  hierarchy: 'agent hierarchy section',
  agents: 'team agents section',
};

const teamSectionCollapseState: Record<TeamSectionName, boolean> = {
  members: false,
  hierarchy: false,
  agents: false,
};

interface AgentThinkingEntry {
  timestamp: string;
  content: string;
  sessionId: string;
}

const agentThinkingEntries: Map<string, AgentThinkingEntry[]> = new Map();
let selectedViewAgent: string | null = null;

// ============================================
// Callback Interface
// ============================================

export interface TeamCallbacks {
  appendAndTrim: (container: HTMLElement, element: HTMLElement) => void;
  smartScroll: (container: HTMLElement) => void;
  showTeamPanel: () => void;
}

let callbacks: TeamCallbacks | null = null;

/**
 * Initialize the team handler with required callbacks.
 */
export function initTeam(cbs: TeamCallbacks): void {
  callbacks = cbs;
  loadTeamSectionCollapseState();
  initTeamSectionToggles();
  for (const sectionName of ['members', 'hierarchy', 'agents'] as const) {
    applyTeamSectionCollapse(sectionName, false);
  }
}

function getTeamSectionElements(sectionName: TeamSectionName): {
  section: HTMLElement | null;
  toggle: HTMLButtonElement | null;
} {
  if (sectionName === 'members') {
    return {
      section: elements.teamMemberSection as HTMLElement | null,
      toggle: elements.teamMemberToggle,
    };
  }
  if (sectionName === 'hierarchy') {
    return {
      section: elements.teamAgentTreeSection as HTMLElement | null,
      toggle: elements.teamAgentTreeToggle,
    };
  }
  return {
    section: elements.teamAgentsSection as HTMLElement | null,
    toggle: elements.teamAgentsToggle,
  };
}

function saveTeamSectionCollapseState(): void {
  try {
    localStorage.setItem(TEAM_SECTION_STORAGE_KEY, JSON.stringify(teamSectionCollapseState));
  } catch {
    // Ignore persistence failures (private mode/storage quota)
  }
}

function loadTeamSectionCollapseState(): void {
  try {
    const stored = localStorage.getItem(TEAM_SECTION_STORAGE_KEY);
    if (!stored) return;

    const parsed = JSON.parse(stored) as Partial<Record<TeamSectionName, boolean>>;
    if (typeof parsed !== 'object' || parsed === null) return;

    if (typeof parsed.members === 'boolean') {
      teamSectionCollapseState.members = parsed.members;
    }
    if (typeof parsed.hierarchy === 'boolean') {
      teamSectionCollapseState.hierarchy = parsed.hierarchy;
    }
    if (typeof parsed.agents === 'boolean') {
      teamSectionCollapseState.agents = parsed.agents;
    }
  } catch {
    // Ignore malformed values and fall back to defaults
  }
}

function applyTeamSectionCollapse(sectionName: TeamSectionName, persist: boolean): void {
  const { section, toggle } = getTeamSectionElements(sectionName);
  const isCollapsed = teamSectionCollapseState[sectionName];
  if (section) {
    section.classList.toggle('team-section-collapsed', isCollapsed);
  }
  if (toggle) {
    toggle.setAttribute('aria-expanded', String(!isCollapsed));
    toggle.setAttribute(
      'aria-label',
      `${isCollapsed ? 'Expand' : 'Collapse'} ${TEAM_SECTION_LABELS[sectionName]}`
    );
    toggle.title = `${isCollapsed ? 'Expand' : 'Collapse'} section`;
  }
  if (persist) {
    saveTeamSectionCollapseState();
  }
}

function toggleTeamSection(sectionName: TeamSectionName): void {
  teamSectionCollapseState[sectionName] = !teamSectionCollapseState[sectionName];
  applyTeamSectionCollapse(sectionName, true);
}

function initTeamSectionToggles(): void {
  const sections: TeamSectionName[] = ['members', 'hierarchy', 'agents'];
  for (const sectionName of sections) {
    const { toggle } = getTeamSectionElements(sectionName);
    if (!toggle || toggle.dataset.initialized === 'true') {
      continue;
    }

    toggle.dataset.initialized = 'true';
    toggle.addEventListener('click', () => {
      toggleTeamSection(sectionName);
    });
  }
}

// ============================================
// Rendering
// ============================================

/**
 * Render the team member grid.
 */
function renderMemberGrid(teamName: string): void {
  const memberGrid = elements.teamMemberGrid;
  if (!memberGrid) return;

  const members = teamState.teams.get(teamName);
  if (!members || members.length === 0) {
    memberGrid.innerHTML = `<div class="team-empty">No team members</div>`;
    return;
  }

  memberGrid.innerHTML = members.map(member => {
    const badgeColors = getAgentBadgeColors(member.agentType || member.name);
    const statusClass = `team-member-status-${member.status || 'active'}`;
    const statusDot = member.status === 'idle' ? 'idle'
      : member.status === 'shutdown' ? 'shutdown'
      : 'active';

    return `
      <div class="team-member-card ${statusClass}">
        <div class="team-member-header">
          <span class="team-member-dot team-member-dot-${statusDot}"></span>
          <span class="team-member-name">${escapeHtml(member.name)}</span>
        </div>
        <span class="team-member-type" style="background: ${escapeCssValue(badgeColors.bg)}; color: ${escapeCssValue(badgeColors.text)}">${escapeHtml(member.agentType)}</span>
      </div>
    `;
  }).join('');

  // Add click handlers for cross-panel agent filtering
  memberGrid.querySelectorAll('.team-member-card').forEach((card, index) => {
    const member = members[index];
    if (!member) return;

    (card as HTMLElement).style.cursor = 'pointer';
    (card as HTMLElement).title = `Click to filter events by ${member.name}`;

    card.addEventListener('click', () => {
      // Find the agentId for this member from subagentState
      let agentId: string | null = null;
      for (const [id, mapping] of subagentState.subagents) {
        if (mapping.agentName === member.name) {
          agentId = id;
          break;
        }
      }

      if (agentId) {
        if (state.selectedAgentId === agentId) {
          selectAgentFilter(null);
        } else {
          selectAgentFilter(agentId);
        }
      }
    });
  });
}

/**
 * Render the team panel header with team name.
 */
function updateTeamHeader(teamName: string): void {
  const teamNameEl = elements.teamName;
  if (teamNameEl) {
    teamNameEl.textContent = teamName;
  }
}

function getSelectedSessionId(): string | null {
  return state.selectedSession === 'all' ? null : state.selectedSession;
}

function thinkingKey(sessionId: string, agentId: string): string {
  return `${sessionId}::${agentId}`;
}

function renderTeamAgentEmptyState(): void {
  const sidebar = elements.teamAgentsSidebar;
  if (sidebar) {
    sidebar.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">&#129302;</div>
        <p class="empty-state-title">No agents</p>
        <p class="empty-state-subtitle">Sub-agents appear here for the selected session.</p>
      </div>
    `;
  }

  const detail = elements.teamAgentsDetail;
  if (detail) {
    detail.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">&#129504;</div>
        <p class="empty-state-title">Select an agent</p>
        <p class="empty-state-subtitle">Select an agent to inspect thinking entries.</p>
      </div>
    `;
  }
}

function renderTeamAgentDetail(): void {
  const detail = elements.teamAgentsDetail;
  if (!detail) return;

  const sessionId = getSelectedSessionId();
  if (!sessionId) {
    detail.innerHTML = `<div class="empty-state"><p>Select a session to inspect agent thinking</p></div>`;
    return;
  }

  if (!selectedViewAgent) {
    detail.innerHTML = `<div class="empty-state"><p>Select an agent to view its thinking</p></div>`;
    return;
  }

  const entries = agentThinkingEntries.get(thinkingKey(sessionId, selectedViewAgent)) || [];
  if (entries.length === 0) {
    const label = selectedViewAgent === 'main'
      ? 'main'
      : (subagentState.subagents.get(selectedViewAgent)?.agentName || selectedViewAgent.slice(0, 8));
    detail.innerHTML = `<div class="empty-state"><p>No thinking entries for ${escapeHtml(label)}</p></div>`;
    return;
  }

  detail.innerHTML = entries.map((entry) => {
    const time = formatTime(entry.timestamp);
    const preview = entry.content.slice(0, 80).replace(/\n/g, ' ');
    return `
      <div class="thinking-entry">
        <div class="thinking-entry-header">
          <span class="thinking-time">${escapeHtml(time)}</span>
          <span class="thinking-preview">${escapeHtml(preview)}...</span>
        </div>
        <div class="thinking-text">${escapeHtml(entry.content)}</div>
      </div>
    `;
  }).join('');

  detail.scrollTop = detail.scrollHeight;
}

function selectTeamAgentInView(agentId: string): void {
  selectedViewAgent = agentId;
  renderTeamAgentList();
  renderTeamAgentDetail();
}

function countSessionThinkingEntries(sessionId: string): number {
  let total = 0;
  for (const [key, entries] of agentThinkingEntries) {
    if (key.startsWith(`${sessionId}::`)) {
      total += entries.length;
    }
  }
  return total;
}

function updateTeamTabCount(): void {
  const sessionId = getSelectedSessionId();
  if (!sessionId) {
    updateTabBadge('team', 0);
    const panelBadge = document.getElementById('team-count');
    if (panelBadge) panelBadge.textContent = '0';
    return;
  }

  let memberCount = 0;
  for (const [teamName, mappedSession] of teamState.teamSessionMap) {
    if (mappedSession === sessionId) {
      memberCount = (teamState.teams.get(teamName) || []).length;
      break;
    }
  }

  const messageCount = teamState.teamMessages.filter((message) => message.sessionId === sessionId).length;
  const thinkingCount = countSessionThinkingEntries(sessionId);
  const total = memberCount + messageCount + thinkingCount;
  updateTabBadge('team', total);
  const panelBadge = document.getElementById('team-count');
  if (panelBadge) panelBadge.textContent = String(total);
}

function renderTeamAgentList(): void {
  const section = elements.teamAgentsSection as HTMLElement | null;
  const sidebar = elements.teamAgentsSidebar;
  if (!section || !sidebar) return;

  const sessionId = getSelectedSessionId();
  if (!sessionId) {
    section.classList.add('team-section-no-data');
    selectedViewAgent = null;
    renderTeamAgentEmptyState();
    updateTeamTabCount();
    return;
  }

  const availableAgentIds = new Set<string>();
  availableAgentIds.add('main');

  const knownSubagents = subagentState.sessionSubagents.get(sessionId);
  if (knownSubagents) {
    for (const agentId of knownSubagents) {
      availableAgentIds.add(agentId);
    }
  }

  for (const key of agentThinkingEntries.keys()) {
    if (!key.startsWith(`${sessionId}::`)) continue;
    const [, agentId] = key.split('::');
    if (agentId) {
      availableAgentIds.add(agentId);
    }
  }

  const hasAgentData = availableAgentIds.size > 1 || countSessionThinkingEntries(sessionId) > 0;
  if (!hasAgentData) {
    section.classList.add('team-section-no-data');
    selectedViewAgent = null;
    renderTeamAgentEmptyState();
    updateTeamTabCount();
    return;
  }

  section.classList.remove('team-section-no-data');

  const subagentItems = Array.from(availableAgentIds)
    .filter((agentId) => agentId !== 'main')
    .sort((a, b) => {
      const aName = subagentState.subagents.get(a)?.agentName || a;
      const bName = subagentState.subagents.get(b)?.agentName || b;
      return aName.localeCompare(bName);
    });

  const orderedAgentIds = ['main', ...subagentItems];
  if (!selectedViewAgent || !availableAgentIds.has(selectedViewAgent)) {
    selectedViewAgent = 'main';
  }

  sidebar.innerHTML = orderedAgentIds.map((agentId) => {
    const mapping = subagentState.subagents.get(agentId);
    const name = agentId === 'main' ? 'main' : (mapping?.agentName || agentId.slice(0, 8));
    const entries = agentThinkingEntries.get(thinkingKey(sessionId, agentId)) || [];
    const count = entries.length;
    const selected = selectedViewAgent === agentId ? ' selected' : '';
    const dotClass = agentId === 'main'
      ? 'running'
      : mapping?.status === 'running'
        ? 'running'
        : (mapping?.status === 'success' || mapping?.status === 'failure' || mapping?.status === 'cancelled')
          ? 'stopped'
          : 'idle';

    return `
      <div class="agent-list-item${selected}" data-agent-id="${escapeHtml(agentId)}">
        <span class="agent-list-dot ${dotClass}"></span>
        <span class="agent-list-name">${escapeHtml(name)}</span>
        <span class="agent-list-count">${count}</span>
      </div>
    `;
  }).join('');

  sidebar.querySelectorAll('.agent-list-item').forEach((item) => {
    item.addEventListener('click', () => {
      const agentId = (item as HTMLElement).dataset.agentId;
      if (agentId) {
        selectTeamAgentInView(agentId);
      }
    });
  });

  renderTeamAgentDetail();
  updateTeamTabCount();
}

// ============================================
// Event Handlers
// ============================================

/**
 * Handle a team_update event.
 */
export function handleTeamUpdate(event: TeamUpdateEvent): void {
  if (!callbacks) return;

  const teamName = event.teamName;
  teamState.teams.set(teamName, event.members);

  // Map team to session: prefer event.sessionId, fall back to subagent name matching
  resolveTeamSession(teamName, event.sessionId, event.members);

  // Only render if this team belongs to the currently selected session
  const teamSession = teamState.teamSessionMap.get(teamName);
  if (state.selectedSession === 'all') {
    return;
  }
  if (!teamSession || teamSession !== state.selectedSession) {
    return;
  }

  callbacks.showTeamPanel();
  updateTeamHeader(teamName);
  renderMemberGrid(teamName);
  renderTeamAgentList();
}

/**
 * Resolve which session a team belongs to.
 * Uses event sessionId directly when available, falls back to matching
 * member names against known subagent mappings.
 */
function resolveTeamSession(teamName: string, sessionId?: string, members?: TeamUpdateEvent['members']): void {
  if (sessionId) {
    const resolved = resolveSessionId(sessionId) || sessionId;
    teamState.teamSessionMap.set(teamName, resolved);
    return;
  }

  if (members) {
    for (const member of members) {
      for (const [, mapping] of subagentState.subagents) {
        if (mapping.agentName === member.name) {
          teamState.teamSessionMap.set(teamName, mapping.parentSessionId);
          return;
        }
      }
    }
  }
}

/**
 * Filter team panel by session.
 * When a specific session is selected, only show matching teams.
 * When "all", clear session-specific content.
 */
export function filterTeamBySession(): void {
  const teamContent = elements.teamMemberGrid?.parentElement;
  if (!teamContent) return;

  if (state.selectedSession === 'all') {
    const teamNameEl = elements.teamName;
    if (teamNameEl) teamNameEl.textContent = '';
    const memberGrid = elements.teamMemberGrid;
    if (memberGrid) memberGrid.innerHTML = '';
    selectedViewAgent = null;
    renderTeamAgentList();
    return;
  }

  let matchedTeam: string | null = null;
  for (const [teamName, sessionId] of teamState.teamSessionMap) {
    if (sessionId === state.selectedSession) {
      matchedTeam = teamName;
      break;
    }
  }

  if (matchedTeam) {
    updateTeamHeader(matchedTeam);
    renderMemberGrid(matchedTeam);
  } else {
    const teamNameEl = elements.teamName;
    if (teamNameEl) {
      teamNameEl.textContent = 'No team';
    }
    const memberGrid = elements.teamMemberGrid;
    if (memberGrid) {
      memberGrid.innerHTML = `<div class="team-empty">No team for this session</div>`;
    }
  }

  renderTeamAgentList();
}

/**
 * Handle a teammate_idle event.
 */
export function handleTeammateIdle(event: TeammateIdleEvent): void {
  if (!callbacks) return;

  const teamName = event.teamName;
  if (!teamName) return;

  const members = teamState.teams.get(teamName);
  if (members) {
    const member = members.find(m => m.name === event.teammateName);
    if (member) {
      member.status = 'idle';
    }
  }

  const teamSession = teamState.teamSessionMap.get(teamName);
  if (state.selectedSession === 'all') return;
  if (!teamSession || teamSession !== state.selectedSession) return;

  if (members) {
    renderMemberGrid(teamName);
  }
  callbacks.showTeamPanel();
  updateTeamTabCount();
}

/**
 * Handle a message_sent event.
 */
export function handleMessageSent(event: MessageSentEvent): void {
  if (!callbacks) return;

  teamState.teamMessages.push(event);
  if (teamState.teamMessages.length > MAX_MESSAGES) {
    teamState.teamMessages.shift();
  }

  // Strict session filtering for render: event must include selected session.
  if (state.selectedSession === 'all') return;
  if (!event.sessionId || event.sessionId !== state.selectedSession) return;

  callbacks.showTeamPanel();

  const messagesContainer = elements.teamMessages;
  if (!messagesContainer) return;

  const emptyState = messagesContainer.querySelector('.empty-state');
  if (emptyState) {
    emptyState.remove();
  }

  const entry = document.createElement('div');
  entry.className = `team-message team-message-${event.messageType}`;
  entry.dataset.timestamp = String(Date.now());

  const time = formatTime(event.timestamp);
  const senderColors = getAgentBadgeColors(event.sender);
  const recipientColors = getAgentBadgeColors(event.recipient);

  const isBroadcast = event.messageType === 'broadcast';
  const isShutdown = event.messageType === 'shutdown_request' || event.messageType === 'shutdown_response';

  let typeIcon = '';
  if (isBroadcast) typeIcon = '<span class="team-message-type-icon" title="Broadcast">&#128226;</span>';
  else if (isShutdown) typeIcon = '<span class="team-message-type-icon team-message-shutdown" title="Shutdown">&#9724;</span>';

  const recipientLabel = isBroadcast
    ? '<span class="team-message-broadcast-label">all</span>'
    : `<span class="team-message-badge" style="background: ${escapeCssValue(recipientColors.bg)}; color: ${escapeCssValue(recipientColors.text)}">${escapeHtml(event.recipient)}</span>`;

  entry.innerHTML = `
    <div class="team-message-header">
      <span class="team-message-time">${escapeHtml(time)}</span>
      ${typeIcon}
      <span class="team-message-badge" style="background: ${escapeCssValue(senderColors.bg)}; color: ${escapeCssValue(senderColors.text)}">${escapeHtml(event.sender)}</span>
      <span class="team-message-arrow">&#8594;</span>
      ${recipientLabel}
    </div>
    ${event.summary ? `<div class="team-message-summary">${escapeHtml(event.summary)}</div>` : ''}
  `;

  callbacks.appendAndTrim(messagesContainer, entry);
  callbacks.smartScroll(messagesContainer);

  entry.classList.add('new');
  setTimeout(() => entry.classList.remove('new'), 1000);
  updateTeamTabCount();
}

/**
 * Track a thinking event in the team's session-scoped agent detail view.
 */
export function addTeamAgentThinking(event: ThinkingEvent): void {
  if (!event.sessionId) return;

  const agentId = event.agentId || 'main';
  const key = thinkingKey(event.sessionId, agentId);
  let entries = agentThinkingEntries.get(key);
  if (!entries) {
    entries = [];
    agentThinkingEntries.set(key, entries);
  }

  entries.push({
    timestamp: event.timestamp,
    content: event.content,
    sessionId: event.sessionId,
  });

  while (entries.length > MAX_ENTRIES_PER_AGENT) {
    entries.shift();
  }

  if (state.selectedSession === event.sessionId) {
    renderTeamAgentList();
  } else {
    updateTeamTabCount();
  }
}

/**
 * Refresh the team agent list after subagent mapping updates.
 */
export function refreshTeamAgentList(): void {
  renderTeamAgentList();
}

/**
 * Reset team agent thinking state (called from clearAllPanels).
 */
export function resetTeamAgentThinking(): void {
  selectedViewAgent = null;
  agentThinkingEntries.clear();
  renderTeamAgentList();
}
