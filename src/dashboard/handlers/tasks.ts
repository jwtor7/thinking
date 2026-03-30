/**
 * Task board handlers for the Thinking Monitor Dashboard.
 *
 * Renders a two-zone layout:
 * - Active Work: compact rows for pending + in_progress tasks
 * - Completion Log: reverse-chronological list of completed tasks
 * - Summary Strip: progress bar + metrics in the panel header
 */

import { teamState, state, taskStatusTimestamps, taskCompletionLog } from '../state.ts';
import type { TaskCompletionRecord } from '../state.ts';
import { elements } from '../ui/elements.ts';
import { escapeHtml, escapeCssValue } from '../utils/html.ts';
import { getAgentBadgeColors } from '../ui/colors.ts';
import type { TaskUpdateEvent, TaskCompletedEvent, TaskInfo } from '../types.ts';
import { updateTabBadge } from '../ui/views.ts';
import type { Disposable } from '../services/lifecycle.ts';
import { formatElapsed, formatDuration, getDurationClass, formatTime } from '../utils/formatting.ts';

let showTasksPanel: (() => void) | null = null;
let navigateToTeamAgent: ((agentName: string) => void) | null = null;

/** Track peak concurrent in_progress tasks. */
let peakParallelism = 0;

/** Card IDs from the previous render, used to detect new cards for entry animation. */
let previousRowIds = new Set<string>();

/**
 * Initialize the tasks handler.
 */
export function initTasks(extras: { showTasksPanel: () => void; navigateToTeamAgent?: (agentName: string) => void }): Disposable {
  showTasksPanel = extras.showTasksPanel;
  navigateToTeamAgent = extras.navigateToTeamAgent ?? null;
  return { dispose: () => { showTasksPanel = null; navigateToTeamAgent = null; } };
}

// ============================================
// Summary Strip
// ============================================

function renderSummaryStrip(pending: number, inProgress: number, completed: number, sessionPeak: number): void {
  const strip = elements.tasksSummaryStrip;
  if (!strip) return;

  const total = pending + inProgress + completed;
  if (total === 0) {
    strip.innerHTML = '';
    return;
  }

  // Progress bar segments
  const pctDone = (completed / total) * 100;
  const pctActive = (inProgress / total) * 100;
  const pctPending = (pending / total) * 100;

  const segments: string[] = [];
  if (pctDone > 0) segments.push(`<span class="tasks-seg tasks-seg-done" style="width:${pctDone}%" title="${completed} completed"></span>`);
  if (pctActive > 0) segments.push(`<span class="tasks-seg tasks-seg-active" style="width:${pctActive}%" title="${inProgress} in progress"></span>`);
  if (pctPending > 0) segments.push(`<span class="tasks-seg tasks-seg-pending" style="width:${pctPending}%" title="${pending} pending"></span>`);

  // Compute metrics from completion log
  let avgDuration = 0;
  let durCount = 0;
  for (const record of taskCompletionLog) {
    if (record.durationMs !== null) {
      avgDuration += record.durationMs;
      durCount++;
    }
  }
  if (durCount > 0) avgDuration = avgDuration / durCount;

  // Bottleneck detection: any active task exceeding 2x average
  let hasBottleneck = false;
  if (avgDuration > 0) {
    const now = Date.now();
    for (const [teamId, tasks] of teamState.teamTasks) {
      for (const task of tasks) {
        if (task.status === 'in_progress') {
          const tsKey = `${teamId}::${task.id}::in_progress`;
          const ts = taskStatusTimestamps.get(tsKey);
          if (ts && (now - ts) > avgDuration * 2) {
            hasBottleneck = true;
            break;
          }
        }
      }
      if (hasBottleneck) break;
    }
  }

  const metricsHtml: string[] = [];
  metricsHtml.push(`<span class="tasks-metric">${completed}/${total}</span>`);
  if (durCount > 0) {
    metricsHtml.push(`<span class="tasks-metric" title="Average task duration">avg ${formatDuration(avgDuration)}</span>`);
  }
  if (sessionPeak > 1) {
    metricsHtml.push(`<span class="tasks-metric" title="Peak concurrent tasks">peak ${sessionPeak}x</span>`);
  }
  if (hasBottleneck) {
    metricsHtml.push(`<span class="tasks-metric tasks-metric-warn" title="A task is taking 2x+ longer than average">bottleneck</span>`);
  }

  strip.innerHTML = `
    <div class="tasks-progress" aria-label="Task completion progress">
      <span class="tasks-progress-bar">${segments.join('')}</span>
    </div>
    <div class="tasks-metrics">${metricsHtml.join('')}</div>
  `;
}

// ============================================
// Active Work Zone
// ============================================

function renderActiveTaskRow(task: TaskInfo, teamId: string): string {
  const isBlocked = task.blockedBy.length > 0;

  const statusDot = isBlocked
    ? '<span class="task-row-dot task-row-dot-blocked" title="Blocked">&#128274;</span>'
    : task.status === 'in_progress'
    ? '<span class="task-row-dot task-row-dot-active"></span>'
    : '<span class="task-row-dot task-row-dot-pending"></span>';

  const ownerBadge = task.owner
    ? (() => {
        const colors = getAgentBadgeColors(task.owner);
        return `<span class="task-owner-badge" style="background:${escapeCssValue(colors.bg)};color:${escapeCssValue(colors.text)}">${escapeHtml(task.owner)}</span>`;
      })()
    : '';

  const tsKey = `${teamId}::${task.id}::${task.status}`;
  const ts = taskStatusTimestamps.get(tsKey);
  const elapsed = ts !== undefined ? formatElapsed(Date.now() - ts) : '';
  const timeHtml = elapsed ? `<span class="task-row-time">${elapsed}</span>` : '';

  const blockedHtml = isBlocked
    ? `<span class="task-row-blocked">blocked by ${task.blockedBy.map(id => `#${escapeHtml(id)}`).join(', ')}</span>`
    : '';

  const hasDescription = task.description && task.description.trim().length > 0;
  const expandIcon = hasDescription ? '<span class="task-row-expand">&#9656;</span>' : '';
  const descriptionHtml = hasDescription
    ? `<div class="task-row-description">${escapeHtml(task.description!)}</div>`
    : '';

  return `
    <div class="task-row${isBlocked ? ' task-row-is-blocked' : ''}${hasDescription ? ' task-row-expandable' : ''}" data-task-id="${escapeHtml(task.id)}" data-timestamp="${Date.now()}">
      <div class="task-row-main">
        ${statusDot}
        <span class="task-row-id">${expandIcon}#${escapeHtml(task.id)}</span>
        <span class="task-row-subject">${escapeHtml(task.subject)}</span>
        <span class="task-row-spacer"></span>
        ${ownerBadge}
        ${blockedHtml}
        ${timeHtml}
      </div>
      ${descriptionHtml}
    </div>
  `;
}

// ============================================
// Completion Log Zone
// ============================================

function renderCompletionEntry(record: TaskCompletionRecord): string {
  const time = formatTime(new Date(record.completedAt).toISOString());
  const ownerBadge = record.owner
    ? (() => {
        const colors = getAgentBadgeColors(record.owner);
        return `<span class="task-owner-badge" style="background:${escapeCssValue(colors.bg)};color:${escapeCssValue(colors.text)}">${escapeHtml(record.owner)}</span>`;
      })()
    : '';

  const durationHtml = record.durationMs !== null
    ? `<span class="task-duration-pill ${getDurationClass(record.durationMs)}">${formatDuration(record.durationMs)}</span>`
    : '';

  return `
    <div class="task-log-entry">
      <span class="task-log-check">&#10003;</span>
      <span class="task-log-time">${escapeHtml(time)}</span>
      <span class="task-row-id">#${escapeHtml(record.taskId)}</span>
      <span class="task-log-subject">${escapeHtml(record.subject)}</span>
      <span class="task-row-spacer"></span>
      ${ownerBadge}
      ${durationHtml}
    </div>
  `;
}

// ============================================
// Main Render
// ============================================

function renderTasksView(): void {
  const activeZone = elements.tasksActiveWork;
  const logZone = elements.tasksCompletionLog;
  if (!activeZone || !logZone) return;

  // Gather tasks, filtered by session
  const activeTasks: { task: TaskInfo; teamId: string }[] = [];
  const matchedTeamIds = new Set<string>();
  let hasSessionMapping = false;

  const gatherActive = (teamId: string, tasks: TaskInfo[]): void => {
    matchedTeamIds.add(teamId);
    for (const t of tasks) {
      if (t.status !== 'completed') {
        activeTasks.push({ task: t, teamId });
      }
    }
  };

  if (state.selectedSession === 'all') {
    for (const [teamId, tasks] of teamState.teamTasks) {
      gatherActive(teamId, tasks);
    }
    hasSessionMapping = true;
  } else {
    for (const [teamId, sessionId] of teamState.taskSessionMap) {
      if (sessionId === state.selectedSession) {
        hasSessionMapping = true;
        const tasks = teamState.teamTasks.get(teamId);
        if (tasks) gatherActive(teamId, tasks);
      }
    }
    if (!hasSessionMapping) {
      for (const [teamName, sessionId] of teamState.teamSessionMap) {
        if (sessionId === state.selectedSession) {
          hasSessionMapping = true;
          const tasks = teamState.teamTasks.get(teamName);
          if (tasks) gatherActive(teamName, tasks);
        }
      }
    }
  }

  if (!hasSessionMapping) {
    activeZone.innerHTML = `
      <div class="tasks-zone-header">ACTIVE</div>
      <div class="task-zone-empty">No tasks mapped to this session yet</div>
    `;
    logZone.innerHTML = '<div class="tasks-zone-header">COMPLETED</div>';
    updateTabBadge('tasks', 0);
    renderSummaryStrip(0, 0, 0, 0);
    return;
  }

  // Sort: blocked tasks last, then by time-in-state (longest first), then by ID
  activeTasks.sort((a, b) => {
    const aBlocked = a.task.blockedBy.length > 0 ? 1 : 0;
    const bBlocked = b.task.blockedBy.length > 0 ? 1 : 0;
    if (aBlocked !== bBlocked) return aBlocked - bBlocked;

    const aKey = `${a.teamId}::${a.task.id}::${a.task.status}`;
    const bKey = `${b.teamId}::${b.task.id}::${b.task.status}`;
    const aTs = taskStatusTimestamps.get(aKey) ?? Date.now();
    const bTs = taskStatusTimestamps.get(bKey) ?? Date.now();
    if (aTs !== bTs) return aTs - bTs; // longest wait first
    // Tiebreaker: numeric ID ascending
    const aNum = parseInt(a.task.id, 10) || 0;
    const bNum = parseInt(b.task.id, 10) || 0;
    return aNum - bNum;
  });

  // Count statuses for summary
  const pending = activeTasks.filter(t => t.task.status === 'pending').length;
  const inProgress = activeTasks.filter(t => t.task.status === 'in_progress').length;

  // Filter completion log by session-scoped team IDs
  const sessionLogEntries = taskCompletionLog.filter(
    r => matchedTeamIds.has(r.teamId)
  );
  const completedCount = sessionLogEntries.length;

  // Render active zone
  if (activeTasks.length > 0) {
    const rowsHtml = activeTasks.map(({ task, teamId }) => renderActiveTaskRow(task, teamId)).join('');
    activeZone.innerHTML = `<div class="tasks-zone-header">ACTIVE <span class="tasks-zone-count">${activeTasks.length}</span></div>${rowsHtml}`;
  } else {
    activeZone.innerHTML = `
      <div class="tasks-zone-header">ACTIVE</div>
      <div class="task-zone-empty">${completedCount > 0 ? 'All tasks completed' : 'Waiting for tasks...'}</div>
    `;
  }

  // Render completion log (reverse chronological, session-scoped)
  const logEntries = [...sessionLogEntries].reverse();
  if (logEntries.length > 0) {
    const entriesHtml = logEntries.map(renderCompletionEntry).join('');
    logZone.innerHTML = `<div class="tasks-zone-header">COMPLETED <span class="tasks-zone-count">${logEntries.length}</span></div>${entriesHtml}`;
  } else {
    logZone.innerHTML = '<div class="tasks-zone-header">COMPLETED</div>';
  }

  // Calculate session-scoped peak parallelism from matched tasks
  let sessionPeak = inProgress; // current in_progress count is a lower bound
  for (const teamId of matchedTeamIds) {
    const tasks = teamState.teamTasks.get(teamId);
    if (tasks) {
      let ip = 0;
      for (const t of tasks) {
        if (t.status === 'in_progress') ip++;
      }
      if (ip > sessionPeak) sessionPeak = ip;
    }
  }

  // Summary strip
  renderSummaryStrip(pending, inProgress, completedCount, sessionPeak);

  // Update header task count
  const totalTasks = activeTasks.length + completedCount;
  if (elements.tasksProgressText) {
    elements.tasksProgressText.textContent = totalTasks === 1 ? '1 task' : `${totalTasks} tasks`;
  }

  // Tab badge
  const blocked = activeTasks.filter(t => t.task.blockedBy.length > 0).length;
  const active = inProgress;
  const badgeText = blocked > 0
    ? `${active} active / ${blocked} blocked`
    : active > 0
    ? `${active} active`
    : totalTasks > 0
    ? `${completedCount}/${totalTasks} done`
    : '0';
  updateTabBadge('tasks', totalTasks > 0 ? badgeText : 0);

  // Entry animations
  const currentRowIds = new Set<string>();
  activeZone.querySelectorAll('.task-row[data-task-id]').forEach(row => {
    const id = row.getAttribute('data-task-id');
    if (id) {
      currentRowIds.add(id);
      if (previousRowIds.size > 0 && !previousRowIds.has(id)) {
        row.classList.add('task-row-enter');
      }
    }
  });
  previousRowIds = currentRowIds;

  // Click handlers: expand/collapse descriptions
  activeZone.querySelectorAll('.task-row-expandable').forEach(row => {
    row.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('.task-owner-badge')) return;
      row.classList.toggle('task-row-expanded');
    });
  });

  // Click handlers: owner badges -> navigate to agent in Teams tab
  activeZone.querySelectorAll('.task-owner-badge').forEach(badge => {
    const ownerName = (badge as HTMLElement).textContent?.trim();
    if (!ownerName) return;
    (badge as HTMLElement).style.cursor = 'pointer';
    (badge as HTMLElement).title = `Jump to ${ownerName} in Teams`;
    badge.addEventListener('click', (e) => {
      e.stopPropagation();
      navigateToTeamAgent?.(ownerName);
    });
  });
}

/**
 * Reset task-specific module state (called from clearAllPanels).
 */
export function resetTaskState(): void {
  peakParallelism = 0;
  previousRowIds.clear();
}

/**
 * Re-render task view when session filter changes.
 */
export function filterTasksBySession(): void {
  renderTasksView();
}

// ============================================
// Event Handlers
// ============================================

/**
 * Handle a task_update event.
 * Retains previously-completed tasks in memory.
 */
export function handleTaskUpdate(event: TaskUpdateEvent): void {
  if (!showTasksPanel) return;

  if (event.sessionId) {
    teamState.taskSessionMap.set(event.teamId, event.sessionId);
  }

  const prev = teamState.teamTasks.get(event.teamId);
  const prevMap = new Map<string, string>();
  if (prev) {
    for (const t of prev) prevMap.set(t.id, t.status);
    const incomingIds = new Set(event.tasks.map(t => t.id));
    const retainedCompleted = prev.filter(
      t => t.status === 'completed' && !incomingIds.has(t.id)
    );
    teamState.teamTasks.set(event.teamId, [...event.tasks, ...retainedCompleted]);
  } else {
    teamState.teamTasks.set(event.teamId, event.tasks);
  }

  // Record timestamps for status tracking and detect new completions
  const now = Date.now();
  for (const task of event.tasks) {
    const key = `${event.teamId}::${task.id}::${task.status}`;
    if (!taskStatusTimestamps.has(key)) {
      taskStatusTimestamps.set(key, now);
    }

    // Detect tasks that are completed but not yet in the completion log.
    // Dedup by taskId within the session (same task may arrive under different teamIds).
    if (task.status === 'completed') {
      const prevStatus = prevMap.get(task.id);
      const alreadyLogged = taskCompletionLog.find(
        r => r.taskId === task.id && (r.teamId === event.teamId || r.subject === task.subject)
      ) !== undefined;
      // Only log on genuine transitions or first-time completed tasks
      const isTransition = prev && prevStatus && prevStatus !== 'completed';
      const isFirstSeen = !prev;
      if (!alreadyLogged && (isTransition || isFirstSeen)) {
        const pendingKey = `${event.teamId}::${task.id}::pending`;
        const pendingTs = taskStatusTimestamps.get(pendingKey);
        const durationMs = pendingTs !== undefined ? now - pendingTs : null;
        taskCompletionLog.push({
          taskId: task.id,
          subject: task.subject,
          owner: task.owner,
          teamId: event.teamId,
          completedAt: now,
          durationMs,
        });
      }
    }
  }

  // Track peak parallelism (scoped to this event's team only)
  let currentInProgress = 0;
  const eventTasks = teamState.teamTasks.get(event.teamId);
  if (eventTasks) {
    for (const t of eventTasks) {
      if (t.status === 'in_progress') currentInProgress++;
    }
  }
  if (currentInProgress > peakParallelism) {
    peakParallelism = currentInProgress;
  }

  showTasksPanel?.();
  renderTasksView();
}

/**
 * Handle a task_completed event.
 */
export function handleTaskCompleted(event: TaskCompletedEvent): void {
  if (!showTasksPanel) return;

  const teamId = event.teamId || '';
  const tasks = teamState.teamTasks.get(teamId);
  const now = Date.now();

  if (tasks) {
    const task = tasks.find(t => t.id === event.taskId);
    if (task) {
      // Compute duration before marking complete
      const pendingKey = `${teamId}::${task.id}::pending`;
      const pendingTs = taskStatusTimestamps.get(pendingKey);
      const durationMs = pendingTs !== undefined ? now - pendingTs : null;

      // Add to completion log (dedup: same task may arrive via task_update first)
      const alreadyLogged = taskCompletionLog.find(
        r => r.taskId === task.id && (r.teamId === teamId || r.subject === task.subject)
      ) !== undefined;
      if (!alreadyLogged) {
        taskCompletionLog.push({
          taskId: task.id,
          subject: task.subject,
          owner: task.owner,
          teamId,
          completedAt: now,
          durationMs,
        });
      }

      task.status = 'completed';
      const key = `${teamId}::${task.id}::completed`;
      if (!taskStatusTimestamps.has(key)) {
        taskStatusTimestamps.set(key, now);
      }
    }
  }

  showTasksPanel?.();
  renderTasksView();
}
