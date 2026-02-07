/**
 * Team event handlers for the Thinking Monitor Dashboard.
 *
 * Handles team_update, teammate_idle, and message_sent events,
 * rendering team members and inter-agent messages in the Team panel.
 */

import { teamState, state, subagentState } from '../state.ts';
import { elements } from '../ui/elements.ts';
import { formatTime } from '../utils/formatting.ts';
import { escapeHtml, escapeCssValue } from '../utils/html.ts';
import { getAgentBadgeColors } from '../ui/colors.ts';
import { selectAgentFilter } from './sessions.ts';
import type { TeamUpdateEvent, TeammateIdleEvent, MessageSentEvent } from '../types.ts';
import { updateTabBadge } from '../ui/views.ts';

// ============================================
// Constants
// ============================================

const MAX_MESSAGES = 200;

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
        // Toggle: if already selected, deselect
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

  // Resolve team's session by matching member agentIds against subagent mappings
  resolveTeamSession(teamName, event.members);

  // Show team panel on first team event
  callbacks.showTeamPanel();

  updateTeamHeader(teamName);
  renderMemberGrid(teamName);

  // Update tab badge with member count
  const memberCount = event.members.length;
  updateTabBadge('team', memberCount);
}

/**
 * Resolve which session a team belongs to by checking member agentIds
 * against known subagent mappings.
 */
function resolveTeamSession(teamName: string, members: TeamUpdateEvent['members']): void {
  for (const member of members) {
    // Check if any member name matches a known subagent
    for (const [, mapping] of subagentState.subagents) {
      if (mapping.agentName === member.name) {
        teamState.teamSessionMap.set(teamName, mapping.parentSessionId);
        return;
      }
    }
  }
}

/**
 * Filter team panel by session.
 * When a specific session is selected, only show matching teams.
 * When "all", show all teams.
 */
export function filterTeamBySession(): void {
  const teamContent = elements.teamMemberGrid?.parentElement;
  if (!teamContent) return;

  if (state.selectedSession === 'all') {
    // Team panel is hidden for "All Sessions" — clear it to avoid stale data
    const teamNameEl = elements.teamName;
    if (teamNameEl) teamNameEl.textContent = '';
    const memberGrid = elements.teamMemberGrid;
    if (memberGrid) memberGrid.innerHTML = '';
    return;
  }

  // Find team(s) belonging to this session
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
}

/**
 * Handle a teammate_idle event.
 */
export function handleTeammateIdle(event: TeammateIdleEvent): void {
  if (!callbacks) return;

  const teamName = event.teamName;
  if (!teamName) return;

  // Update member status
  const members = teamState.teams.get(teamName);
  if (members) {
    const member = members.find(m => m.name === event.teammateName);
    if (member) {
      member.status = 'idle';
      renderMemberGrid(teamName);
    }
  }

  // Show team panel
  callbacks.showTeamPanel();
}

/**
 * Handle a message_sent event.
 */
export function handleMessageSent(event: MessageSentEvent): void {
  if (!callbacks) return;

  // Store in state
  teamState.teamMessages.push(event);
  if (teamState.teamMessages.length > MAX_MESSAGES) {
    teamState.teamMessages.shift();
  }

  // Show team panel
  callbacks.showTeamPanel();

  // Render message in the message flow
  const messagesContainer = elements.teamMessages;
  if (!messagesContainer) return;

  // Clear empty state if present
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

  const recipientLabel = isBroadcast ? '<span class="team-message-broadcast-label">all</span>' : `<span class="team-message-badge" style="background: ${escapeCssValue(recipientColors.bg)}; color: ${escapeCssValue(recipientColors.text)}">${escapeHtml(event.recipient)}</span>`;

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

  // Animate
  entry.classList.add('new');
  setTimeout(() => entry.classList.remove('new'), 1000);
}
