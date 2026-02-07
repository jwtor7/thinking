/**
 * Timeline handler for the Thinking Monitor Dashboard.
 *
 * Provides a unified chronological view of all events across panels.
 */

import { state } from '../state.ts';
import { elements } from '../ui/elements.ts';
import { formatTime } from '../utils/formatting.ts';
import { escapeHtml, escapeCssValue } from '../utils/html.ts';
import { getAgentBadgeColors } from '../ui/colors.ts';
import type { StrictMonitorEvent } from '../../shared/types.ts';

// ============================================
// Constants
// ============================================

const MAX_TIMELINE_ENTRIES = 500;

/** Type icons mapping */
const TYPE_ICONS: Record<string, string> = {
  thinking: '&#129504;',      // brain
  tool_start: '&#128295;',    // wrench
  tool_end: '&#128295;',      // wrench
  hook_execution: '&#9881;',  // gear
  agent_start: '&#129302;',   // robot
  agent_stop: '&#129302;',    // robot
  session_start: '&#128225;', // satellite
  session_stop: '&#128225;',  // satellite
  team_update: '&#128101;',   // people
  task_update: '&#128203;',   // clipboard
  task_completed: '&#9989;',  // check
  message_sent: '&#128172;',  // speech
  teammate_idle: '&#128164;', // zzz
  plan_update: '&#128196;',   // document
  plan_delete: '&#128196;',   // document
  plan_list: '&#128196;',     // document
  connection_status: '&#128268;',  // plug
  subagent_mapping: '&#128279;',   // link
};

// ============================================
// Callback Interface
// ============================================

export interface TimelineCallbacks {
  appendAndTrim: (container: HTMLElement, element: HTMLElement) => void;
  smartScroll: (container: HTMLElement) => void;
}

let callbacks: TimelineCallbacks | null = null;
let timelineCount = 0;

/**
 * Initialize the timeline handler with required callbacks.
 */
export function initTimeline(cbs: TimelineCallbacks): void {
  callbacks = cbs;
}

/**
 * Get a one-line summary for a timeline entry based on event type.
 */
function getEventSummary(event: StrictMonitorEvent): string {
  switch (event.type) {
    case 'thinking':
      return event.content.slice(0, 60).replace(/\n/g, ' ') + (event.content.length > 60 ? '...' : '');
    case 'tool_start':
      return `${event.toolName} started` + (event.input ? ': ' + event.input.slice(0, 40) : '');
    case 'tool_end':
      return `${event.toolName} completed` + (event.durationMs ? ` (${event.durationMs}ms)` : '');
    case 'hook_execution':
      return `${event.hookType}` + (event.toolName ? ` \u2192 ${event.toolName}` : '') + (event.decision ? ` [${event.decision}]` : '');
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

/**
 * Get the current timeline entry count.
 */
export function getTimelineCount(): number {
  return timelineCount;
}

/**
 * Add a timeline entry for an event.
 */
export function addTimelineEntry(event: StrictMonitorEvent): void {
  if (!callbacks) return;

  const entriesContainer = elements.timelineEntries;
  if (!entriesContainer) return;

  // Skip internal/noisy events
  if (event.type === 'connection_status' || event.type === 'subagent_mapping' || event.type === 'plan_list') {
    return;
  }

  // Clear empty state if present
  const emptyState = entriesContainer.querySelector('.empty-state');
  if (emptyState) {
    emptyState.remove();
  }

  timelineCount++;

  // Update badge count
  if (elements.timelineCount) {
    elements.timelineCount.textContent = String(timelineCount);
  }

  const time = formatTime(event.timestamp);
  const icon = TYPE_ICONS[event.type] || '&#9679;';
  const summary = getEventSummary(event);
  const agentId = event.agentId || 'main';
  const agentBadgeColors = getAgentBadgeColors(agentId === 'main' ? 'main' : agentId);
  const agentLabel = agentId === 'main' ? 'main' : (agentId.length > 12 ? agentId.slice(0, 12) : agentId);

  // Type class for color coding
  const typeClass = event.type.replace(/_/g, '-');

  const entry = document.createElement('div');
  entry.className = `timeline-entry timeline-${typeClass} new`;
  entry.dataset.timestamp = String(Date.now());
  entry.dataset.type = event.type;
  entry.dataset.session = event.sessionId || '';

  entry.innerHTML = `
    <span class="timeline-icon">${icon}</span>
    <span class="timeline-time">${escapeHtml(time)}</span>
    <span class="timeline-type">${escapeHtml(event.type.replace(/_/g, ' '))}</span>
    <span class="timeline-summary">${escapeHtml(summary)}</span>
    <span class="timeline-agent" style="background: ${escapeCssValue(agentBadgeColors.bg)}; color: ${escapeCssValue(agentBadgeColors.text)}">${escapeHtml(agentLabel)}</span>
  `;

  // Apply session filter
  if (state.selectedSession !== 'all' && event.sessionId && event.sessionId !== state.selectedSession) {
    entry.style.display = 'none';
  }

  // Trim old entries if over limit
  const children = entriesContainer.children;
  while (children.length >= MAX_TIMELINE_ENTRIES) {
    children[0].remove();
  }

  entriesContainer.appendChild(entry);
  callbacks.smartScroll(entriesContainer);

  // Remove 'new' class after animation
  setTimeout(() => entry.classList.remove('new'), 1000);
}
