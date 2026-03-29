/**
 * Task board handlers for the Thinking Monitor Dashboard.
 *
 * Handles task_update and task_completed events, rendering a
 * three-column kanban board (Pending | In Progress | Completed).
 */

import { teamState, state, subagentState, taskStatusTimestamps } from '../state.ts';
import { elements } from '../ui/elements.ts';
import { escapeHtml, escapeCssValue } from '../utils/html.ts';
import { getAgentBadgeColors } from '../ui/colors.ts';
import { selectAgentFilter } from './sessions.ts';
import type { TaskUpdateEvent, TaskCompletedEvent, TaskInfo } from '../types.ts';
import { updateTabBadge } from '../ui/views.ts';
import type { Disposable } from '../services/lifecycle.ts';
import { formatElapsed } from '../utils/formatting.ts';

let showTasksPanel: (() => void) | null = null;

/**
 * The teamId currently being rendered.
 * Set before each renderTaskCard call so the card can look up the
 * correct taskStatusTimestamps entry without receiving teamId as a parameter.
 */
let currentRenderTeamId = '';

/** Card IDs from the previous render, used to detect new cards for entry animation. */
let previousCardIds = new Set<string>();

/**
 * Initialize the tasks handler.
 */
export function initTasks(extras: { showTasksPanel: () => void }): Disposable {
  showTasksPanel = extras.showTasksPanel;
  return { dispose: () => { showTasksPanel = null; } };
}

// ============================================
// Progress Bar
// ============================================

/**
 * Update the segmented progress bar in the tasks panel header.
 */
function updateTasksProgress(pending: number, inProgress: number, completed: number): void {
  const total = pending + inProgress + completed;
  const bar = elements.tasksProgressBar;
  const text = elements.tasksProgressText;

  if (!bar || !text) return;

  if (total === 0) {
    bar.innerHTML = '';
    text.textContent = '0 tasks';
    return;
  }

  const pctPending = (pending / total) * 100;
  const pctProgress = (inProgress / total) * 100;
  const pctDone = (completed / total) * 100;

  const segments: string[] = [];
  if (pctDone > 0) {
    segments.push(`<span class="tasks-seg tasks-seg-done" style="width: ${pctDone}%" title="${completed} completed"></span>`);
  }
  if (pctProgress > 0) {
    segments.push(`<span class="tasks-seg tasks-seg-active" style="width: ${pctProgress}%" title="${inProgress} in progress"></span>`);
  }
  if (pctPending > 0) {
    segments.push(`<span class="tasks-seg tasks-seg-pending" style="width: ${pctPending}%" title="${pending} pending"></span>`);
  }

  bar.innerHTML = segments.join('');
  text.textContent = `${completed}/${total} complete`;
}

// ============================================
// Rendering
// ============================================

/**
 * Render a single task card.
 * Reads `currentRenderTeamId` (module-level) to look up time-in-state.
 */
function renderTaskCard(task: TaskInfo): string {
  const ownerBadge = task.owner
    ? (() => {
        const colors = getAgentBadgeColors(task.owner);
        return `<span class="task-owner-badge" style="background: ${escapeCssValue(colors.bg)}; color: ${escapeCssValue(colors.text)}">${escapeHtml(task.owner)}</span>`;
      })()
    : '<span class="task-unassigned">unassigned</span>';

  const blockedIndicators = task.blockedBy.length > 0
    ? `<div class="task-blocked-by">blocked by: ${task.blockedBy.map(id => `<span class="task-blocked-id">#${escapeHtml(id)}</span>`).join(', ')}</div>`
    : '';

  const isBlocked = task.blockedBy.length > 0;
  const statusIcon = isBlocked ? '&#128274;'
    : task.status === 'completed' ? '&#10003;'
    : task.status === 'in_progress' ? '&#9654;'
    : '&#9679;';
  const statusIconClass = isBlocked ? 'task-blocked-lock' : 'task-card-status-icon';

  const hasDescription = task.description && task.description.trim().length > 0;
  const expandIcon = hasDescription ? '<span class="task-card-expand-icon">&#9656;</span>' : '';
  const descriptionHtml = hasDescription
    ? `<div class="task-card-description">${escapeHtml(task.description!)}</div>`
    : '';

  // Elapsed time updates on re-render (event-driven), not real-time
  const tsKey = `${currentRenderTeamId}::${task.id}::${task.status}`;
  const ts = taskStatusTimestamps.get(tsKey);
  const elapsed = ts !== undefined ? formatElapsed(Date.now() - ts) : '';
  const statusLabel = task.status.replace('_', ' ');
  const timeInStateHtml = elapsed
    ? `<span class="task-time-in-state" title="Time in ${statusLabel}: ${elapsed}">${elapsed}</span>`
    : '';

  return `
    <div class="task-card task-card-${task.status}${isBlocked ? ' task-card-blocked' : ''}${hasDescription ? ' task-card-expandable' : ''}" data-task-id="${escapeHtml(task.id)}" data-timestamp="${Date.now()}">
      <div class="task-card-header">
        <span class="task-card-id">${expandIcon}#${escapeHtml(task.id)}</span>
        <span class="${statusIconClass}">${statusIcon}</span>
      </div>
      <div class="task-card-subject">${escapeHtml(task.subject)}</div>
      ${descriptionHtml}
      <div class="task-card-footer">
        ${ownerBadge}
        ${blockedIndicators}
        ${timeInStateHtml}
      </div>
    </div>
  `;
}

/**
 * Re-render the full task board from state.
 */
function renderTaskBoard(): void {
  const pendingCol = elements.tasksPending;
  const progressCol = elements.tasksInProgress;
  const completedCol = elements.tasksCompleted;

  if (!pendingCol || !progressCol || !completedCol) return;

  // Gather tasks, filtered by session if one is selected.
  // taskTeamMap associates each TaskInfo reference with its originating teamId
  // so renderTaskCard can look up taskStatusTimestamps correctly.
  const allTasks: TaskInfo[] = [];
  const taskTeamMap = new Map<TaskInfo, string>();
  let hasSessionMapping = false;

  const gatherTasks = (teamId: string, tasks: TaskInfo[]): void => {
    for (const t of tasks) {
      allTasks.push(t);
      taskTeamMap.set(t, teamId);
    }
  };

  if (state.selectedSession === 'all') {
    for (const [teamId, tasks] of teamState.teamTasks) {
      gatherTasks(teamId, tasks);
    }
  } else {
    // Primary mapping path: task updates that provide sessionId.
    for (const [teamId, sessionId] of teamState.taskSessionMap) {
      if (sessionId === state.selectedSession) {
        hasSessionMapping = true;
        const tasks = teamState.teamTasks.get(teamId);
        if (tasks) {
          gatherTasks(teamId, tasks);
        }
      }
    }

    // Compatibility path: older mappings that only include teamName -> session.
    if (!hasSessionMapping) {
      for (const [teamName, sessionId] of teamState.teamSessionMap) {
        if (sessionId === state.selectedSession) {
          hasSessionMapping = true;
          const tasks = teamState.teamTasks.get(teamName);
          if (tasks) {
            gatherTasks(teamName, tasks);
          }
        }
      }
    }

    if (!hasSessionMapping) {
      if (elements.tasksPendingCount) {
        elements.tasksPendingCount.textContent = '0';
      }
      if (elements.tasksInProgressCount) {
        elements.tasksInProgressCount.textContent = '0';
      }
      if (elements.tasksCompletedCount) {
        elements.tasksCompletedCount.textContent = '0';
      }

      const unmappedMessage = 'No tasks mapped to this session yet';
      pendingCol.innerHTML = `<div class="task-column-empty">${unmappedMessage}</div>`;
      progressCol.innerHTML = `<div class="task-column-empty">${unmappedMessage}</div>`;
      completedCol.innerHTML = `<div class="task-column-empty">${unmappedMessage}</div>`;

      updateTabBadge('tasks', 0);
      updateTasksProgress(0, 0, 0);
      return;
    }
  }

  /**
   * Render a task card with its teamId context loaded into the module-level
   * `currentRenderTeamId` variable so renderTaskCard can look up timestamps.
   */
  const renderCard = (task: TaskInfo): string => {
    currentRenderTeamId = taskTeamMap.get(task) ?? '';
    return renderTaskCard(task);
  };

  const pending = allTasks.filter(t => t.status === 'pending');
  const inProgress = allTasks.filter(t => t.status === 'in_progress');
  const completed = allTasks.filter(t => t.status === 'completed');

  // Update counts
  if (elements.tasksPendingCount) {
    elements.tasksPendingCount.textContent = String(pending.length);
  }
  if (elements.tasksInProgressCount) {
    elements.tasksInProgressCount.textContent = String(inProgress.length);
  }
  if (elements.tasksCompletedCount) {
    elements.tasksCompletedCount.textContent = String(completed.length);
  }

  pendingCol.innerHTML = pending.length > 0
    ? pending.map(renderCard).join('')
    : '<div class="task-column-empty">No pending tasks</div>';

  progressCol.innerHTML = inProgress.length > 0
    ? inProgress.map(renderCard).join('')
    : '<div class="task-column-empty">No active tasks</div>';

  completedCol.innerHTML = completed.length > 0
    ? completed.map(renderCard).join('')
    : '<div class="task-column-empty">No completed tasks</div>';

  // Update tab badge with total task count
  const totalCount = allTasks.length;
  updateTabBadge('tasks', totalCount);

  // Collect current card IDs and animate newly appeared cards (single DOM pass)
  const currentCardIds = new Set<string>();
  const allCards = document.querySelectorAll('.task-card[data-task-id]');
  allCards.forEach(card => {
    const id = card.getAttribute('data-task-id');
    if (id) {
      currentCardIds.add(id);
      if (previousCardIds.size > 0 && !previousCardIds.has(id)) {
        card.classList.add('task-card-enter');
      }
    }
  });
  previousCardIds = currentCardIds;

  // Update segmented progress bar in panel header
  updateTasksProgress(pending.length, inProgress.length, completed.length);

  // Add click handlers for expand/collapse on task cards with descriptions
  document.querySelectorAll('.task-card-expandable').forEach((card) => {
    card.addEventListener('click', (e) => {
      // Don't toggle if clicking on an owner badge (cross-panel navigation)
      if ((e.target as HTMLElement).closest('.task-owner-badge')) return;
      card.classList.toggle('task-card-expanded');
    });
  });

  // Add click handlers for owner badges -> cross-panel agent filtering
  const taskBoard = document.querySelector('.task-board');
  if (taskBoard) {
    taskBoard.querySelectorAll('.task-owner-badge').forEach((badge) => {
      const ownerName = (badge as HTMLElement).textContent?.trim();
      if (!ownerName) return;

      (badge as HTMLElement).style.cursor = 'pointer';
      (badge as HTMLElement).title = `Click to filter by ${ownerName}`;

      badge.addEventListener('click', (e) => {
        e.stopPropagation(); // Don't trigger card click

        // Find agentId for this owner
        let agentId: string | null = null;
        for (const [id, mapping] of subagentState.subagents) {
          if (mapping.agentName === ownerName) {
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
}

/**
 * Re-render task board when session filter changes.
 */
export function filterTasksBySession(): void {
  renderTaskBoard();
}

// ============================================
// Event Handlers
// ============================================

/**
 * Handle a task_update event.
 *
 * Claude Code removes task JSON files from disk once all tasks are completed,
 * so the server may broadcast an empty list. We retain previously-completed
 * tasks in memory so they stay visible on the dashboard.
 */
export function handleTaskUpdate(event: TaskUpdateEvent): void {
  if (!showTasksPanel) return;

  if (event.sessionId) {
    teamState.taskSessionMap.set(event.teamId, event.sessionId);
  }

  const prev = teamState.teamTasks.get(event.teamId);
  if (prev) {
    const incomingIds = new Set(event.tasks.map(t => t.id));
    const retainedCompleted = prev.filter(
      t => t.status === 'completed' && !incomingIds.has(t.id)
    );
    teamState.teamTasks.set(event.teamId, [...event.tasks, ...retainedCompleted]);
  } else {
    teamState.teamTasks.set(event.teamId, event.tasks);
  }

  // Record the timestamp when each task first enters a given status.
  // Only set if the key is absent — we never overwrite an existing entry so
  // the elapsed time reflects how long the task has been in its current state.
  const now = Date.now();
  for (const task of event.tasks) {
    const key = `${event.teamId}::${task.id}::${task.status}`;
    if (!taskStatusTimestamps.has(key)) {
      taskStatusTimestamps.set(key, now);
    }
  }

  showTasksPanel?.();
  renderTaskBoard();
}

/**
 * Handle a task_completed event.
 */
export function handleTaskCompleted(event: TaskCompletedEvent): void {
  if (!showTasksPanel) return;

  const teamId = event.teamId || '';
  const tasks = teamState.teamTasks.get(teamId);
  if (tasks) {
    const task = tasks.find(t => t.id === event.taskId);
    if (task) {
      task.status = 'completed';
      // Stamp the transition to 'completed' if not already recorded.
      const key = `${teamId}::${task.id}::completed`;
      if (!taskStatusTimestamps.has(key)) {
        taskStatusTimestamps.set(key, Date.now());
      }
    }
  }

  showTasksPanel?.();
  renderTaskBoard();
}
