/**
 * Task board handlers for the Thinking Monitor Dashboard.
 *
 * Handles task_update and task_completed events, rendering a
 * three-column kanban board (Pending | In Progress | Completed).
 */

import { teamState, state, subagentState } from '../state.ts';
import { elements } from '../ui/elements.ts';
import { escapeHtml, escapeCssValue } from '../utils/html.ts';
import { getAgentBadgeColors } from '../ui/colors.ts';
import { selectAgentFilter } from './sessions.ts';
import type { TaskUpdateEvent, TaskCompletedEvent, TaskInfo } from '../types.ts';
import { updateTabBadge } from '../ui/views.ts';

// ============================================
// Callback Interface
// ============================================

export interface TasksCallbacks {
  showTasksPanel: () => void;
}

let callbacks: TasksCallbacks | null = null;

/**
 * Initialize the tasks handler with required callbacks.
 */
export function initTasks(cbs: TasksCallbacks): void {
  callbacks = cbs;
}

// ============================================
// Rendering
// ============================================

/**
 * Render a single task card.
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

  const statusIcon = task.status === 'completed' ? '&#10003;'
    : task.status === 'in_progress' ? '&#9654;'
    : '&#9679;';

  return `
    <div class="task-card task-card-${task.status}" data-task-id="${escapeHtml(task.id)}" data-timestamp="${Date.now()}">
      <div class="task-card-header">
        <span class="task-card-id">#${escapeHtml(task.id)}</span>
        <span class="task-card-status-icon">${statusIcon}</span>
      </div>
      <div class="task-card-subject">${escapeHtml(task.subject)}</div>
      <div class="task-card-footer">
        ${ownerBadge}
        ${blockedIndicators}
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

  // Gather tasks, filtered by session if one is selected
  const allTasks: TaskInfo[] = [];
  if (state.selectedSession === 'all') {
    for (const tasks of teamState.teamTasks.values()) {
      allTasks.push(...tasks);
    }
  } else {
    // Find team(s) belonging to this session
    for (const [teamName, sessionId] of teamState.teamSessionMap) {
      if (sessionId === state.selectedSession) {
        const tasks = teamState.teamTasks.get(teamName);
        if (tasks) allTasks.push(...tasks);
      }
    }
    // If no team mapped to session, show all as fallback
    if (allTasks.length === 0) {
      for (const tasks of teamState.teamTasks.values()) {
        allTasks.push(...tasks);
      }
    }
  }

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
    ? pending.map(renderTaskCard).join('')
    : '<div class="task-column-empty">No pending tasks</div>';

  progressCol.innerHTML = inProgress.length > 0
    ? inProgress.map(renderTaskCard).join('')
    : '<div class="task-column-empty">No active tasks</div>';

  completedCol.innerHTML = completed.length > 0
    ? completed.map(renderTaskCard).join('')
    : '<div class="task-column-empty">No completed tasks</div>';

  // Update tab badge with total task count
  const totalCount = allTasks.length;
  updateTabBadge('tasks', totalCount);

  // Update total count badge in panel header
  const totalCountEl = document.getElementById('tasks-total-count');
  if (totalCountEl) {
    totalCountEl.textContent = String(totalCount);
  }

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
  if (!callbacks) return;

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

  callbacks.showTasksPanel();
  renderTaskBoard();
}

/**
 * Handle a task_completed event.
 */
export function handleTaskCompleted(event: TaskCompletedEvent): void {
  if (!callbacks) return;

  const teamId = event.teamId || '';
  const tasks = teamState.teamTasks.get(teamId);
  if (tasks) {
    const task = tasks.find(t => t.id === event.taskId);
    if (task) {
      task.status = 'completed';
    }
  }

  callbacks.showTasksPanel();
  renderTaskBoard();
}
