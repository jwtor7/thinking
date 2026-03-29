/**
 * Team event handlers for the Thinking Monitor Dashboard.
 *
 * Three-component layout:
 * - Agent Lifecycle Strip: Gantt-style bars showing agent lifespan
 * - Communication Matrix: NxN grid showing message patterns
 * - Enhanced Message Feed: chronological log with agent/pair filtering
 */

import { teamState, state, subagentState } from '../state.ts';
import { elements } from '../ui/elements.ts';
import { formatTime, formatElapsed } from '../utils/formatting.ts';
import { escapeHtml, escapeCssValue } from '../utils/html.ts';
import { getAgentBadgeColors } from '../ui/colors.ts';
import { selectAgentFilter, resolveSessionId } from './sessions.ts';
import type { TeamUpdateEvent, TeammateIdleEvent, MessageSentEvent } from '../types.ts';
import { updateTabBadge, selectView } from '../ui/views.ts';
import type { AppContext } from '../services/app-context.ts';
import type { Disposable } from '../services/lifecycle.ts';

// ============================================
// State
// ============================================

let ctx: AppContext | null = null;
let showTeamPanel: (() => void) | null = null;

/** Currently selected agent in the lifecycle strip (filters messages). */
let selectedTeamAgent: string | null = null;

/** Agent/pair filter for the message feed. */
let messageAgentFilter: { sender?: string; recipient?: string } | null = null;

const MSG_FILTER_KEY = 'thinking-monitor-msg-filter';
let messageTypeFilter: string = localStorage.getItem(MSG_FILTER_KEY) || 'all';

/**
 * Initialize the team handler with app context.
 */
export function initTeam(appCtx: AppContext, extras: { showTeamPanel: () => void }): Disposable {
  ctx = appCtx;
  showTeamPanel = extras.showTeamPanel;

  const msgFilter = elements.teamMessageFilter;
  if (msgFilter) {
    msgFilter.value = messageTypeFilter;
    msgFilter.addEventListener('change', () => {
      messageTypeFilter = msgFilter.value;
      try { localStorage.setItem(MSG_FILTER_KEY, messageTypeFilter); } catch {}
      applyMessageFilter();
    });
  }

  return { dispose: () => { ctx = null; showTeamPanel = null; } };
}

function getSelectedSessionId(): string | null {
  return state.selectedSession === 'all' ? null : state.selectedSession;
}

// ============================================
// Agent Lifecycle Strip
// ============================================

function renderLifecycleStrip(): void {
  const container = elements.teamLifecycleStrip;
  if (!container) return;

  const sessionId = getSelectedSessionId();
  if (!sessionId) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">&#128101;</div>
        <p class="empty-state-title">No team activity</p>
        <p class="empty-state-subtitle">Teams appear during multi-agent tasks like /council or parallel research.</p>
      </div>
    `;
    return;
  }

  // Collect agents for this session
  const agentIds = new Set<string>();
  const sessionSubagents = subagentState.sessionSubagents.get(sessionId);
  if (sessionSubagents) {
    for (const id of sessionSubagents) agentIds.add(id);
  }

  // Also include any agents from team members
  for (const [teamName, mappedSession] of teamState.teamSessionMap) {
    if (mappedSession === sessionId) {
      const members = teamState.teams.get(teamName) || [];
      for (const member of members) {
        for (const [id, mapping] of subagentState.subagents) {
          if (mapping.agentName === member.name) {
            agentIds.add(id);
          }
        }
      }
    }
  }

  if (agentIds.size === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">&#128101;</div>
        <p class="empty-state-title">No agents yet</p>
        <p class="empty-state-subtitle">Agents appear when Claude spawns parallel workers.</p>
      </div>
    `;
    return;
  }

  // Compute time axis
  const now = Date.now();
  let axisStart = now;
  let axisEnd = now;

  const agentData: { id: string; name: string; start: number; end: number; status: string; depth: number }[] = [];

  for (const agentId of agentIds) {
    const mapping = subagentState.subagents.get(agentId);
    if (!mapping) continue;

    const start = new Date(mapping.startTime).getTime();
    const end = mapping.endTime ? new Date(mapping.endTime).getTime() : now;

    if (start < axisStart) axisStart = start;
    if (end > axisEnd) axisEnd = end;

    // Compute depth from parent chain
    let depth = 0;
    let parentId = mapping.parentAgentId;
    while (parentId && depth < 5) {
      depth++;
      const parent = subagentState.subagents.get(parentId);
      parentId = parent?.parentAgentId;
    }

    agentData.push({
      id: agentId,
      name: mapping.agentName,
      start,
      end,
      status: mapping.status,
      depth,
    });
  }

  // Sort by start time, then by depth
  agentData.sort((a, b) => a.start - b.start || a.depth - b.depth);

  const totalDuration = Math.max(axisEnd - axisStart, 1);

  const rows = agentData.map(agent => {
    const leftPct = ((agent.start - axisStart) / totalDuration) * 100;
    const widthPct = ((agent.end - agent.start) / totalDuration) * 100;
    const indent = agent.depth * 12;
    const isRunning = agent.status === 'running';
    const elapsed = formatElapsed(agent.end - agent.start);
    const selected = selectedTeamAgent === agent.id ? ' lifecycle-row-selected' : '';

    const statusClass = agent.status === 'running' ? 'lifecycle-bar-running'
      : agent.status === 'success' ? 'lifecycle-bar-success'
      : agent.status === 'failure' ? 'lifecycle-bar-failure'
      : 'lifecycle-bar-cancelled';

    // Check if agent is idle (from team member status)
    let isIdle = false;
    for (const members of teamState.teams.values()) {
      const member = members.find(m => {
        for (const [id, mapping] of subagentState.subagents) {
          if (id === agent.id && mapping.agentName === m.name) return true;
        }
        return false;
      });
      if (member?.status === 'idle') {
        isIdle = true;
        break;
      }
    }

    return `
      <div class="lifecycle-row${selected}" data-agent-id="${escapeHtml(agent.id)}" title="${escapeHtml(agent.name)} (${agent.status})">
        <span class="lifecycle-label" style="padding-left:${indent}px">${escapeHtml(agent.name)}</span>
        <div class="lifecycle-bar-container">
          <div class="lifecycle-bar ${statusClass}${isIdle ? ' lifecycle-bar-idle' : ''}${isRunning ? ' lifecycle-bar-pulse' : ''}" style="left:${leftPct}%;width:${Math.max(widthPct, 1)}%"></div>
        </div>
        <span class="lifecycle-duration">${elapsed}</span>
      </div>
    `;
  });

  container.innerHTML = rows.join('');

  // Click handlers
  container.querySelectorAll('.lifecycle-row').forEach(row => {
    row.addEventListener('click', () => {
      const agentId = (row as HTMLElement).dataset.agentId;
      if (!agentId) return;

      if (selectedTeamAgent === agentId) {
        // Deselect
        selectedTeamAgent = null;
        messageAgentFilter = null;
      } else {
        selectedTeamAgent = agentId;
        const mapping = subagentState.subagents.get(agentId);
        const name = mapping?.agentName || agentId;
        messageAgentFilter = { sender: name };
      }
      renderLifecycleStrip();
      applyMessageFilter();
      updateFilterChip();
      renderCommMatrix();
    });
  });
}

// ============================================
// Communication Matrix
// ============================================

function renderCommMatrix(): void {
  const container = elements.teamCommMatrix;
  if (!container) return;

  const sessionId = getSelectedSessionId();
  if (!sessionId) {
    container.innerHTML = '';
    return;
  }

  // Build adjacency counts from messages in this session
  const messages = teamState.teamMessages.filter(m => m.sessionId === sessionId);
  const agents = new Set<string>();
  const counts = new Map<string, number>(); // "sender::recipient" -> count

  for (const msg of messages) {
    agents.add(msg.sender);
    if (msg.messageType !== 'broadcast') {
      agents.add(msg.recipient);
    }
    const key = msg.messageType === 'broadcast'
      ? `${msg.sender}::*`
      : `${msg.sender}::${msg.recipient}`;
    counts.set(key, (counts.get(key) || 0) + 1);
  }

  if (agents.size === 0) {
    container.innerHTML = '';
    return;
  }

  const agentList = Array.from(agents).sort();

  // For < 3 agents, show simple summary instead of matrix
  if (agentList.length < 3) {
    const summaryLines = Array.from(counts.entries()).map(([key, count]) => {
      const [sender, recipient] = key.split('::');
      const senderColors = getAgentBadgeColors(sender);
      const recipientLabel = recipient === '*' ? 'all' : recipient;
      const recipientColors = recipient === '*' ? null : getAgentBadgeColors(recipient);
      return `
        <div class="comm-summary-row">
          <span class="comm-summary-badge" style="background:${escapeCssValue(senderColors.bg)};color:${escapeCssValue(senderColors.text)}">${escapeHtml(sender)}</span>
          <span class="comm-summary-arrow">&#8594;</span>
          ${recipientColors
            ? `<span class="comm-summary-badge" style="background:${escapeCssValue(recipientColors.bg)};color:${escapeCssValue(recipientColors.text)}">${escapeHtml(recipientLabel)}</span>`
            : `<span class="comm-summary-broadcast">all</span>`
          }
          <span class="comm-summary-count">${count}x</span>
        </div>
      `;
    });
    container.innerHTML = summaryLines.join('');
    return;
  }

  // NxN matrix
  const maxCount = Math.max(1, ...counts.values());

  // Header row
  let html = '<div class="comm-grid" style="grid-template-columns: auto ' + agentList.map(() => '1fr').join(' ') + '">';

  // Corner cell
  html += '<div class="comm-cell comm-cell-label"></div>';
  // Column headers
  for (const agent of agentList) {
    const colors = getAgentBadgeColors(agent);
    const shortName = agent.length > 6 ? agent.slice(0, 6) : agent;
    html += `<div class="comm-cell comm-cell-col-header" style="color:${escapeCssValue(colors.text)}" title="${escapeHtml(agent)}">${escapeHtml(shortName)}</div>`;
  }

  // Data rows
  for (const sender of agentList) {
    const senderColors = getAgentBadgeColors(sender);
    const shortName = sender.length > 6 ? sender.slice(0, 6) : sender;
    html += `<div class="comm-cell comm-cell-row-header" style="color:${escapeCssValue(senderColors.text)}" title="${escapeHtml(sender)}">${escapeHtml(shortName)}</div>`;

    for (const recipient of agentList) {
      if (sender === recipient) {
        html += '<div class="comm-cell comm-cell-self">.</div>';
        continue;
      }
      const count = counts.get(`${sender}::${recipient}`) || 0;
      const broadcastCount = counts.get(`${sender}::*`) || 0;
      const total = count + broadcastCount;
      const heat = total > 0 ? Math.min(4, Math.ceil((total / maxCount) * 4)) : 0;
      const isSelected = messageAgentFilter?.sender === sender && messageAgentFilter?.recipient === recipient;
      html += `<div class="comm-cell comm-cell-data comm-cell-heat-${heat}${isSelected ? ' comm-cell-selected' : ''}" data-sender="${escapeHtml(sender)}" data-recipient="${escapeHtml(recipient)}" title="${sender} -> ${recipient}: ${total}">${total || ''}</div>`;
    }
  }

  html += '</div>';
  container.innerHTML = html;

  // Click handlers for cells
  container.querySelectorAll('.comm-cell-data').forEach(cell => {
    cell.addEventListener('click', () => {
      const sender = (cell as HTMLElement).dataset.sender;
      const recipient = (cell as HTMLElement).dataset.recipient;
      if (!sender || !recipient) return;

      if (messageAgentFilter?.sender === sender && messageAgentFilter?.recipient === recipient) {
        messageAgentFilter = null;
        selectedTeamAgent = null;
      } else {
        messageAgentFilter = { sender, recipient };
        selectedTeamAgent = null;
      }
      applyMessageFilter();
      updateFilterChip();
      renderCommMatrix();
      renderLifecycleStrip();
    });
  });
}

// ============================================
// Message Feed Filtering
// ============================================

function applyMessageFilter(): void {
  const container = elements.teamMessages;
  if (!container) return;

  container.querySelectorAll('.team-message').forEach(el => {
    const msgEl = el as HTMLElement;
    let visible = true;

    // Type filter
    if (messageTypeFilter !== 'all') {
      const isTypeMatch = messageTypeFilter === 'shutdown'
        ? msgEl.classList.contains('team-message-shutdown_request') || msgEl.classList.contains('team-message-shutdown_response')
        : msgEl.classList.contains(`team-message-${messageTypeFilter}`);
      if (!isTypeMatch) visible = false;
    }

    // Agent filter
    if (visible && messageAgentFilter) {
      const sender = msgEl.dataset.sender || '';
      const recipient = msgEl.dataset.recipient || '';
      if (messageAgentFilter.sender && messageAgentFilter.recipient) {
        // Pair filter: show messages between this specific pair
        visible = (sender === messageAgentFilter.sender && recipient === messageAgentFilter.recipient)
          || (sender === messageAgentFilter.recipient && recipient === messageAgentFilter.sender);
      } else if (messageAgentFilter.sender) {
        // Single agent filter: show messages involving this agent
        visible = sender === messageAgentFilter.sender || recipient === messageAgentFilter.sender;
      }
    }

    msgEl.style.display = visible ? '' : 'none';
  });
}

function updateFilterChip(): void {
  const chip = elements.teamMessageFilterChip;
  if (!chip) return;

  if (!messageAgentFilter) {
    chip.style.display = 'none';
    chip.innerHTML = '';
    return;
  }

  const label = messageAgentFilter.recipient
    ? `${messageAgentFilter.sender} &#8596; ${messageAgentFilter.recipient}`
    : messageAgentFilter.sender || '';

  chip.style.display = 'inline-flex';
  chip.innerHTML = `<span class="filter-chip-text">${label}</span><button class="filter-chip-dismiss" title="Clear filter">&#10005;</button>`;

  chip.querySelector('.filter-chip-dismiss')?.addEventListener('click', () => {
    messageAgentFilter = null;
    selectedTeamAgent = null;
    applyMessageFilter();
    updateFilterChip();
    renderCommMatrix();
    renderLifecycleStrip();
  });
}

// ============================================
// Team Tab Badge
// ============================================

function updateTeamTabCount(): void {
  const sessionId = getSelectedSessionId();
  if (!sessionId) {
    updateTabBadge('team', 0);
    return;
  }

  let agentCount = 0;
  let idleCount = 0;
  for (const [teamName, mappedSession] of teamState.teamSessionMap) {
    if (mappedSession === sessionId) {
      const members = teamState.teams.get(teamName) || [];
      agentCount += members.length;
      idleCount += members.filter(m => m.status === 'idle').length;
    }
  }

  // Fall back to subagent count if no team members
  if (agentCount === 0) {
    const sessionSubs = subagentState.sessionSubagents.get(sessionId);
    agentCount = sessionSubs ? sessionSubs.size : 0;
  }

  const messageCount = teamState.teamMessages.filter(m => m.sessionId === sessionId).length;

  const badgeText = idleCount > 0
    ? `${agentCount} agents / ${idleCount} idle`
    : agentCount > 0
    ? `${agentCount} agents`
    : messageCount > 0
    ? `${messageCount} msgs`
    : '0';
  updateTabBadge('team', agentCount > 0 || messageCount > 0 ? badgeText : 0);
}

// ============================================
// Rendering Orchestration
// ============================================

function renderTeamView(): void {
  renderLifecycleStrip();
  renderCommMatrix();
  updateTeamTabCount();
}

/**
 * Update the team panel header with team name.
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
  if (!ctx) return;

  const teamName = event.teamName;
  teamState.teams.set(teamName, event.members);

  resolveTeamSession(teamName, event.sessionId, event.members);

  const teamSession = teamState.teamSessionMap.get(teamName);
  if (state.selectedSession === 'all') return;
  if (!teamSession || teamSession !== state.selectedSession) return;

  showTeamPanel?.();
  updateTeamHeader(teamName);
  renderTeamView();
}

/**
 * Resolve which session a team belongs to.
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
 */
export function filterTeamBySession(): void {
  if (state.selectedSession === 'all') {
    const teamNameEl = elements.teamName;
    if (teamNameEl) teamNameEl.textContent = '';
    selectedTeamAgent = null;
    messageAgentFilter = null;
    updateFilterChip();
    renderTeamView();
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
  } else {
    const teamNameEl = elements.teamName;
    if (teamNameEl) teamNameEl.textContent = 'No team';
  }

  renderTeamView();
}

/**
 * Handle a teammate_idle event.
 */
export function handleTeammateIdle(event: TeammateIdleEvent): void {
  if (!ctx) return;

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

  showTeamPanel?.();
  renderTeamView();
}

/**
 * Handle a message_sent event.
 */
export function handleMessageSent(event: MessageSentEvent): void {
  if (!ctx) return;

  teamState.teamMessages.push(event);

  if (state.selectedSession === 'all') return;
  if (!event.sessionId || event.sessionId !== state.selectedSession) return;

  showTeamPanel?.();

  const messagesContainer = elements.teamMessages;
  if (!messagesContainer) return;

  const emptyState = messagesContainer.querySelector('.empty-state');
  if (emptyState) emptyState.remove();

  const entry = document.createElement('div');
  entry.className = `team-message team-message-${event.messageType}`;
  entry.dataset.timestamp = String(Date.now());
  entry.dataset.sender = event.sender;
  entry.dataset.recipient = event.recipient;

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
    : `<span class="team-message-badge" style="background:${escapeCssValue(recipientColors.bg)};color:${escapeCssValue(recipientColors.text)}">${escapeHtml(event.recipient)}</span>`;

  entry.innerHTML = `
    <div class="team-message-header">
      <span class="team-message-time">${escapeHtml(time)}</span>
      ${typeIcon}
      <span class="team-message-badge" style="background:${escapeCssValue(senderColors.bg)};color:${escapeCssValue(senderColors.text)}">${escapeHtml(event.sender)}</span>
      <span class="team-message-arrow">&#8594;</span>
      ${recipientLabel}
    </div>
    ${event.summary ? `<div class="team-message-summary">${escapeHtml(event.summary)}</div>` : ''}
  `;

  ctx?.ui.appendAndTrim(messagesContainer, entry);
  ctx?.ui.smartScroll(messagesContainer);

  entry.classList.add('new');
  setTimeout(() => entry.classList.remove('new'), 1000);

  // Apply filters to the newly added message
  applyMessageFilter();

  // Update comm matrix with new message
  renderCommMatrix();
  updateTeamTabCount();
}

/**
 * Navigate to and select an agent in the Teams view by name.
 */
export function navigateToAgent(agentName: string): void {
  for (const [id, mapping] of subagentState.subagents) {
    if (mapping.agentName === agentName) {
      selectedTeamAgent = id;
      messageAgentFilter = { sender: agentName };
      renderLifecycleStrip();
      applyMessageFilter();
      updateFilterChip();
      renderCommMatrix();
      return;
    }
  }
}
