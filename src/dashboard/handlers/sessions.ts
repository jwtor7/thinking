/**
 * Session Management Handlers
 *
 * Handles session tracking, filtering, and indicator updates.
 * Sessions represent individual Claude Code CLI instances connected to the monitor.
 */

import { state } from '../state';
import { elements } from '../ui/elements';
import { escapeHtml } from '../utils/html';
import { getSessionColorByHash } from '../ui/colors';
import { filterAllBySession } from '../ui/filters';
import { rebuildResizers } from '../ui/resizer';
import type { SessionStartEvent, SessionStopEvent } from '../types';

// ============================================
// Callback Pattern for Circular Import Prevention
// ============================================

/**
 * Callbacks for functions that live in other modules.
 * This prevents circular imports while allowing session handlers
 * to trigger plan and todo updates.
 */
export interface SessionCallbacks {
  displayPlan: (planPath: string) => void;
  displayEmptyPlan: () => void;
  displaySessionPlanEmpty: (sessionId: string) => void;
  clearSessionTodos: (sessionId: string) => void;
  renderTodoPanel: () => void;
  updateTodosForCurrentSession: () => void;
  showToast: (message: string, type: 'success' | 'error' | 'info', duration?: number) => void;
}

let callbacks: SessionCallbacks | null = null;

/**
 * Initialize session handlers with callbacks to other modules.
 * Must be called before any session events are processed.
 */
export function initSessions(cbs: SessionCallbacks): void {
  callbacks = cbs;
}

// ============================================
// Session Tracking
// ============================================

/**
 * Track a session from any event.
 * Creates a new session record if this is the first event from this session.
 * Updates the current session and triggers todo updates on session switch.
 */
export function trackSession(sessionId: string, timestamp: string): void {
  if (!sessionId) return;

  const isNewSession = !state.sessions.has(sessionId);
  const isSessionSwitch = state.currentSessionId !== null && state.currentSessionId !== sessionId;

  if (isNewSession) {
    state.sessions.set(sessionId, {
      id: sessionId,
      startTime: timestamp,
      active: true,
      color: getSessionColorByHash(sessionId),
    });
    console.log(`[Dashboard] New session tracked: ${sessionId}`);
    updateSessionFilter();
  }

  // Update current session
  state.currentSessionId = sessionId;

  // When switching to a different session, update the todo panel
  if (isSessionSwitch || isNewSession) {
    console.log(`[Dashboard] Session switch detected, updating todos for: ${sessionId}`);
    if (callbacks) {
      callbacks.updateTodosForCurrentSession();
    }
  }
}

// ============================================
// Session Event Handlers
// ============================================

/**
 * Handle session_start event.
 * Creates or updates the session record with full metadata.
 */
export function handleSessionStart(event: SessionStartEvent): void {
  const sessionId = event.sessionId;
  const workingDirectory = event.workingDirectory;

  console.log(`[Dashboard] Session started: ${sessionId}`, { workingDirectory });

  state.sessions.set(sessionId, {
    id: sessionId,
    workingDirectory,
    startTime: event.timestamp,
    active: true,
    color: getSessionColorByHash(sessionId),
  });

  state.currentSessionId = sessionId;
  updateSessionFilter();
}

/**
 * Handle session_stop event.
 * Marks the session as inactive and clears current session if it matches.
 */
export function handleSessionStop(event: SessionStopEvent): void {
  const sessionId = event.sessionId;
  const session = state.sessions.get(sessionId);

  console.log(`[Dashboard] Session stopped: ${sessionId}`);

  if (session) {
    session.active = false;
    session.endTime = event.timestamp;
  }

  // If this was the current session, clear it
  if (state.currentSessionId === sessionId) {
    state.currentSessionId = null;
  }

  updateSessionFilter();
}

// ============================================
// Session UI Updates
// ============================================

/**
 * Render the session filter bar with clickable session badges.
 * Shows when there are multiple sessions to filter between.
 */
export function updateSessionFilter(): void {
  // Create session filter element if it doesn't exist
  let filterEl = elements.sessionFilter;

  if (!filterEl) {
    filterEl = document.createElement('div');
    filterEl.id = 'session-filter';
    filterEl.className = 'session-filter';

    // Insert after view tabs (or header if no view tabs)
    const viewTabs = elements.viewTabs || document.querySelector('.header');
    if (viewTabs && viewTabs.parentNode) {
      viewTabs.parentNode.insertBefore(filterEl, viewTabs.nextSibling);
    }
    elements.sessionFilter = filterEl;
  }

  // Show filter when there are any sessions (even just one)
  if (state.sessions.size === 0) {
    filterEl.style.display = 'none';
    return;
  }

  filterEl.style.display = 'flex';

  // Build session filter badges
  let html = '<span class="session-filter-label">SESSIONS:</span>';
  html += '<div class="session-filter-badges">';

  // "All" option
  const allActive = state.selectedSession === 'all' ? 'active' : '';
  html += `<button class="session-filter-badge ${allActive}" data-session="all">
    <span class="session-filter-dot" style="background: var(--color-text-muted)"></span>
    All
  </button>`;

  // Individual session badges
  for (const [sessionId, session] of state.sessions) {
    const shortId = sessionId.slice(0, 8);
    const isActive = state.selectedSession === sessionId ? 'active' : '';
    const isOnline = session.active ? 'online' : '';
    const title = session.workingDirectory
      ? `${sessionId}\n${session.workingDirectory}`
      : sessionId;

    // Only show clear button for inactive sessions that have stored todos
    const hasTodos = state.sessionTodos.has(sessionId) && (state.sessionTodos.get(sessionId)?.length ?? 0) > 0;
    const showClearBtn = !session.active && hasTodos;
    const clearBtnHtml = showClearBtn
      ? `<span class="session-close-btn" data-session="${escapeHtml(sessionId)}" title="Clear session">×</span>`
      : '';

    html += `<button class="session-filter-badge ${isActive} ${isOnline}${showClearBtn ? ' has-close' : ''}" data-session="${escapeHtml(sessionId)}" title="${escapeHtml(title)}">
      <span class="session-filter-dot" style="background: ${session.color}"></span>
      ${escapeHtml(shortId)}${clearBtnHtml}
    </button>`;
  }

  html += '</div>';
  filterEl.innerHTML = html;

  // Attach click handlers using event delegation
  filterEl.querySelectorAll('.session-filter-badge').forEach((badge: Element) => {
    badge.addEventListener('click', (e: Event) => {
      const target = e.target as HTMLElement;
      // Handle close button click
      if (target.classList.contains('session-close-btn')) {
        e.stopPropagation();
        const sessionId = target.dataset.session;
        if (sessionId && callbacks) {
          callbacks.clearSessionTodos(sessionId);
        }
        return;
      }
      // Normal session selection
      const sessionId = (badge as HTMLElement).dataset.session || 'all';
      selectSession(sessionId);
    });
  });
}

// ============================================
// Session Selection
// ============================================

/**
 * Toggle visibility of session-specific panels (TODO and PLAN).
 * These panels are hidden when "All" sessions is selected since they're session-specific.
 */
function updateSessionPanelVisibility(sessionId: string): void {
  const isAllSessions = sessionId === 'all';

  // Hide TODO and PLAN panels when viewing all sessions
  if (elements.todoPanel) {
    elements.todoPanel.classList.toggle('session-hidden', isAllSessions);
  }
  if (elements.planPanel) {
    elements.planPanel.classList.toggle('session-hidden', isAllSessions);
  }

  // Rebuild resizers to only show between visible panels
  rebuildResizers();
}

/**
 * Select a session to filter by.
 * Updates event filtering, todo display, and shows the session's associated plan.
 */
export function selectSession(sessionId: string): void {
  state.selectedSession = sessionId;
  updateSessionFilter();
  filterAllBySession();

  // Update visibility of session-specific panels
  updateSessionPanelVisibility(sessionId);

  // Show the plan associated with this session (if any)
  if (sessionId === 'all') {
    // When "All" is selected, panels are hidden - no need to update plan content
  } else {
    // Check if this session has an associated plan
    const associatedPlanPath = state.sessionPlanMap.get(sessionId);
    if (associatedPlanPath) {
      // Show this session's plan
      if (callbacks) {
        callbacks.displayPlan(associatedPlanPath);
      }
    } else {
      // No plan associated with this session - show a helpful message
      if (callbacks) {
        callbacks.displaySessionPlanEmpty(sessionId);
      }
    }
  }

  // Update todo display based on session selection
  if (sessionId === 'all') {
    // With "All" selected, show empty todos (user can select a specific session)
    state.todos = [];
    elements.todoCount.textContent = '0';
    if (callbacks) {
      callbacks.renderTodoPanel();
    }
  } else {
    // Show todos for the selected session
    state.todos = state.sessionTodos.get(sessionId) || [];
    elements.todoCount.textContent = String(state.todos.length);
    if (callbacks) {
      callbacks.renderTodoPanel();
    }
  }
}
