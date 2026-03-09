/**
 * Timeline entry creation and rendering.
 *
 * Handles entry HTML generation, event summaries, and
 * cross-view navigation (thinking entry click-through).
 */

import { state, subagentState, teamState, ALL_SESSIONS } from '../../state.ts';
import { elements } from '../../ui/elements.ts';
import { formatTime, shortenToolName, summarizeInput } from '../../utils/formatting.ts';
import { escapeHtml, escapeCssValue } from '../../utils/html.ts';
import { getAgentBadgeColors } from '../../ui/colors.ts';
import { getSessionDisplayName, getSessionFolderName, resolveSessionId } from '../sessions.ts';
import { selectView } from '../../ui/views.ts';
import type { StrictMonitorEvent } from '../../../shared/types.ts';
import {
  TYPE_TO_CATEGORY,
  typeCounts,
  chipElements,
  sessionCounts,
  addOrUpdateSessionChip,
} from './chips.ts';

// ============================================
// Constants
// ============================================

const MAX_TIMELINE_ENTRIES = 500;

/** Concise display labels for timeline type badges */
const TYPE_LABELS: Record<string, string> = {
  thinking: 'thinking',
  tool_start: 'tool start',
  tool_end: 'tool end',
  hook_execution: 'hook',
  agent_start: 'agent start',
  agent_stop: 'agent stop',
  session_start: 'session',
  session_stop: 'session',
  team_update: 'team',
  task_update: 'task',
  task_completed: 'task done',
  message_sent: 'message',
  teammate_idle: 'idle',
  plan_update: 'plan',
  plan_delete: 'plan',
  plan_list: 'plan',
  connection_status: 'connection',
  subagent_mapping: 'subagent',
};

/** Type icons mapping */
const TYPE_ICONS: Record<string, string> = {
  thinking: '&#129504;',
  tool_start: '&#128295;',
  tool_end: '&#128295;',
  hook_execution: '&#9881;',
  agent_start: '&#129302;',
  agent_stop: '&#129302;',
  session_start: '&#128225;',
  session_stop: '&#128225;',
  team_update: '&#128101;',
  task_update: '&#128203;',
  task_completed: '&#9989;',
  message_sent: '&#128172;',
  teammate_idle: '&#128164;',
  plan_update: '&#128196;',
  plan_delete: '&#128196;',
  plan_list: '&#128196;',
  connection_status: '&#128268;',
  subagent_mapping: '&#128279;',
};

// ============================================
// Session Resolution
// ============================================

function getSingleActiveSessionId(): string | undefined {
  const activeSessions = Array.from(state.sessions.values()).filter((session) => session.active);
  if (activeSessions.length === 1) {
    return activeSessions[0].id;
  }
  return undefined;
}

function getDefaultTimelineSessionId(): string | undefined {
  if (state.selectedSession !== ALL_SESSIONS && state.sessions.has(state.selectedSession)) {
    return state.selectedSession;
  }

  const soleActive = getSingleActiveSessionId();
  if (soleActive) return soleActive;

  if (state.currentSessionId && state.sessions.has(state.currentSessionId)) {
    return state.currentSessionId;
  }

  if (state.sessions.size === 1) {
    return state.sessions.keys().next().value;
  }

  return undefined;
}

function resolveSessionFromPlanPath(planPath?: string): string | undefined {
  if (!planPath) return undefined;

  const normalizedPlanPath = planPath.replace(/\\/g, '/');
  const planFilename = normalizedPlanPath.split('/').pop();

  for (const [sessionId, assocPath] of state.sessionPlanMap) {
    const normalizedAssocPath = assocPath.replace(/\\/g, '/');
    const assocFilename = normalizedAssocPath.split('/').pop();

    const matches = normalizedAssocPath === normalizedPlanPath
      || normalizedAssocPath.endsWith(normalizedPlanPath)
      || normalizedPlanPath.endsWith(normalizedAssocPath)
      || (!!planFilename && planFilename === assocFilename);

    if (matches) return resolveSessionId(sessionId);
  }

  return undefined;
}

function resolveSessionFromTeamKey(teamKey?: string): string | undefined {
  const normalizedKey = teamKey?.trim();
  if (!normalizedKey) return undefined;

  const directMapped = teamState.teamSessionMap.get(normalizedKey);
  if (directMapped) return resolveSessionId(directMapped);

  const folderMatches = Array.from(state.sessions.values())
    .filter((session) => getSessionFolderName(session.workingDirectory) === normalizedKey)
    .map((session) => session.id);
  if (folderMatches.length === 1) return folderMatches[0];

  const mappedSessions = Array.from(new Set(
    Array.from(teamState.teamSessionMap.values())
      .map((sessionId) => resolveSessionId(sessionId))
      .filter((sessionId): sessionId is string => !!sessionId)
  ));
  if (mappedSessions.length === 1) return mappedSessions[0];

  return undefined;
}

export function resolveEventSessionId(event: StrictMonitorEvent): string | undefined {
  const explicitSessionId = resolveSessionId(event.sessionId);
  if (explicitSessionId) return explicitSessionId;

  switch (event.type) {
    case 'plan_update':
    case 'plan_delete':
      return resolveSessionFromPlanPath(event.path) || getDefaultTimelineSessionId();
    case 'team_update':
      return resolveSessionFromTeamKey(event.teamName) || getDefaultTimelineSessionId();
    case 'task_update':
      return resolveSessionFromTeamKey(event.teamId) || getDefaultTimelineSessionId();
    case 'task_completed':
      return resolveSessionFromTeamKey(event.teamId) || getDefaultTimelineSessionId();
    case 'teammate_idle':
      return resolveSessionFromTeamKey(event.teamName) || getDefaultTimelineSessionId();
    default:
      return getDefaultTimelineSessionId();
  }
}

function getEventContextLabel(event: StrictMonitorEvent): string | undefined {
  switch (event.type) {
    case 'team_update': return event.teamName;
    case 'task_update': return event.teamId;
    case 'task_completed': return event.teamId || event.taskSubject;
    case 'teammate_idle': return event.teamName || event.teammateName;
    default: return undefined;
  }
}

// ============================================
// Event Summary
// ============================================

export function getEventSummary(event: StrictMonitorEvent): string {
  switch (event.type) {
    case 'thinking':
      return event.content.slice(0, 60).replace(/\n/g, ' ') + (event.content.length > 60 ? '...' : '');
    case 'tool_start': {
      const inputPreview = summarizeInput(event.input, event.toolName);
      return `${shortenToolName(event.toolName)} started` + (inputPreview ? ': ' + inputPreview : '');
    }
    case 'tool_end':
      return `${shortenToolName(event.toolName)} completed` + (event.durationMs ? ` (${event.durationMs}ms)` : '');
    case 'hook_execution':
      return `${event.hookType}` + (event.toolName ? ` \u2192 ${shortenToolName(event.toolName)}` : '') + (event.decision ? ` [${event.decision}]` : '');
    case 'agent_start':
      return `Agent started: ${event.agentName || event.agentId}`;
    case 'agent_stop':
      return `Agent stopped: ${event.agentId} (${event.status || 'unknown'})`;
    case 'session_start':
      return `Session started` + (event.workingDirectory ? `: ${event.workingDirectory}` : '');
    case 'session_stop':
      return `Session stopped`;
    case 'team_update':
      return `Team ${event.teamName}: ${event.members.length} members`;
    case 'task_update':
      return `Tasks updated: ${event.tasks.length} tasks`;
    case 'task_completed':
      return `Task completed: ${event.taskSubject}`;
    case 'message_sent':
      return `${event.sender} \u2192 ${event.recipient}: ${event.summary || ''}`;
    case 'teammate_idle':
      return `${event.teammateName} went idle`;
    case 'plan_update':
      return `Plan updated: ${event.filename}`;
    case 'plan_delete':
      return `Plan deleted: ${event.filename}`;
    case 'plan_list':
      return `${event.plans.length} plan(s) available`;
    case 'connection_status':
      return `Server ${event.status} (v${event.serverVersion})`;
    case 'subagent_mapping':
      return `${event.mappings.length} subagent mapping(s)`;
    default:
      return 'Unknown event';
  }
}

// ============================================
// Entry Creation
// ============================================

export interface EntryCallbacks {
  appendAndTrim: (container: HTMLElement, element: HTMLElement) => void;
  smartScroll: (container: HTMLElement) => void;
  selectSession: (sessionId: string) => void;
}

let entryCallbacks: EntryCallbacks | null = null;
let timelineCount = 0;

export function initEntries(cbs: EntryCallbacks): void {
  entryCallbacks = cbs;
}

export function getTimelineCount(): number {
  return timelineCount;
}

export function resetTimelineCount(): void {
  timelineCount = 0;
}

export function addTimelineEntry(event: StrictMonitorEvent, applyFilter: () => void): void {
  if (!entryCallbacks) return;

  const entriesContainer = elements.timelineEntries;
  if (!entriesContainer) return;

  // Skip internal/noisy events
  if (event.type === 'connection_status' || event.type === 'subagent_mapping' || event.type === 'plan_list') {
    return;
  }

  const emptyState = entriesContainer.querySelector('.empty-state');
  if (emptyState) emptyState.remove();

  timelineCount++;

  const category = TYPE_TO_CATEGORY[event.type] || '';
  if (category) {
    typeCounts.set(category, (typeCounts.get(category) || 0) + 1);
    const chip = chipElements.get(category);
    if (chip) {
      const countEl = chip.querySelector('.chip-count');
      if (countEl) countEl.textContent = String(typeCounts.get(category));
    }
  }

  const resolvedSessionId = resolveEventSessionId(event);

  if (resolvedSessionId) {
    sessionCounts.set(resolvedSessionId, (sessionCounts.get(resolvedSessionId) || 0) + 1);
    addOrUpdateSessionChip(resolvedSessionId, applyFilter);
  }

  if (elements.timelineCount) {
    elements.timelineCount.textContent = String(timelineCount);
  }

  const time = formatTime(event.timestamp);
  const icon = TYPE_ICONS[event.type] || '&#9679;';
  const summary = getEventSummary(event);
  const agentId = event.agentId || 'main';

  let agentLabel: string;
  let agentTooltip: string;
  if (agentId === 'main') {
    const session = resolvedSessionId ? state.sessions.get(resolvedSessionId) : undefined;
    const contextLabel = getEventContextLabel(event);
    if (session || resolvedSessionId) {
      agentLabel = getSessionDisplayName(session?.workingDirectory, resolvedSessionId);
      agentTooltip = session?.workingDirectory
        ? `${session.workingDirectory}\nSession: ${resolvedSessionId || ''}`
        : `Session: ${resolvedSessionId || ''}`;
    } else if (contextLabel) {
      agentLabel = contextLabel;
      agentTooltip = `Context: ${contextLabel}`;
    } else {
      agentLabel = 'unknown';
      agentTooltip = 'Session: unknown';
    }
  } else {
    const subagent = subagentState.subagents.get(agentId);
    agentLabel = subagent?.agentName || (agentId.length > 12 ? agentId.slice(0, 12) + '...' : agentId);
    agentTooltip = `Agent: ${subagent?.agentName || agentId}\nStatus: ${subagent?.status || 'unknown'}\nSession: ${resolvedSessionId || ''}`;
  }
  const agentBadgeColors = getAgentBadgeColors(agentId === 'main' ? agentLabel : agentId);

  const typeClass = event.type.replace(/_/g, '-');
  const typeLabel = TYPE_LABELS[event.type] || event.type.replace(/_/g, ' ');
  const typeFull = event.type.replace(/_/g, ' ');
  const filterText = `${typeFull} ${summary} ${agentLabel}`.toLowerCase();

  const entry = document.createElement('div');
  entry.className = `timeline-entry timeline-${typeClass} new`;
  entry.dataset.timestamp = String(Date.now());
  entry.dataset.type = event.type;
  entry.dataset.session = resolvedSessionId || '';
  entry.dataset.filterText = filterText;
  entry.dataset.category = category;

  if (event.type === 'thinking') {
    entry.dataset.sourceTimestamp = event.timestamp;
    entry.style.cursor = 'pointer';
  }

  entry.innerHTML = `
    <span class="timeline-icon">${icon}</span>
    <span class="timeline-time">${escapeHtml(time)}</span>
    <span class="timeline-type" title="${escapeHtml(typeFull)}">${escapeHtml(typeLabel)}</span>
    <span class="timeline-summary">${escapeHtml(summary)}</span>
    <span class="timeline-agent" style="background: ${escapeCssValue(agentBadgeColors.bg)}; color: ${escapeCssValue(agentBadgeColors.text)}" title="${escapeHtml(agentTooltip)}">${escapeHtml(agentLabel)}</span>
  `;

  if (event.type === 'thinking') {
    entry.addEventListener('click', () => {
      navigateToThinkingEntry(event.timestamp, resolvedSessionId);
    });
  }

  const children = entriesContainer.children;
  while (children.length >= MAX_TIMELINE_ENTRIES) {
    let removed = false;
    for (let i = 0; i < children.length; i++) {
      const child = children[i] as HTMLElement;
      if (child.dataset.type !== 'thinking') {
        child.remove();
        removed = true;
        break;
      }
    }
    if (!removed) {
      children[0].remove();
    }
  }

  entriesContainer.appendChild(entry);
  applyFilter();
  entryCallbacks.smartScroll(entriesContainer);

  setTimeout(() => entry.classList.remove('new'), 1000);
}

function navigateToThinkingEntry(eventTimestamp: string, sessionId?: string): void {
  if (sessionId && entryCallbacks) {
    entryCallbacks.selectSession(sessionId);
  }

  selectView('thinking');

  const thinkingContent = elements.thinkingContent;
  if (!thinkingContent) return;

  const scrollToEntry = (): boolean => {
    const entries = Array.from(thinkingContent.querySelectorAll('.thinking-entry'));
    for (const entry of entries) {
      const el = entry as HTMLElement;
      if (el.dataset.eventTimestamp === eventTimestamp) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.classList.add('highlight-flash');
        setTimeout(() => el.classList.remove('highlight-flash'), 2000);
        return true;
      }
    }
    return false;
  };

  requestAnimationFrame(() => {
    if (scrollToEntry()) return;
    requestAnimationFrame(() => {
      scrollToEntry();
    });
  });
}
