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
import type { MonitorEvent } from '../types';

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
    updateSessionIndicator();
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
export function handleSessionStart(event: MonitorEvent): void {
  const sessionId = String(event.sessionId || '');
  const workingDirectory = event.workingDirectory as string | undefined;

  console.log(`[Dashboard] Session started: ${sessionId}`, { workingDirectory });

  state.sessions.set(sessionId, {
    id: sessionId,
    workingDirectory,
    startTime: event.timestamp,
    active: true,
    color: getSessionColorByHash(sessionId),
  });

  state.currentSessionId = sessionId;
  updateSessionIndicator();
}

/**
 * Handle session_stop event.
 * Marks the session as inactive and clears current session if it matches.
 */
export function handleSessionStop(event: MonitorEvent): void {
  const sessionId = String(event.sessionId || '');
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

  updateSessionIndicator();
}

// ============================================
// Session UI Updates
// ============================================

/**
 * Update the session indicator in the header.
 * Shows the currently selected session (from the filter bar) rather than just the active session.
 * This ensures the header badge stays in sync with the user's session selection.
 */
export function updateSessionIndicator(): void {
  // Create the session indicator element if it doesn't exist in the DOM
  let indicator = elements.sessionIndicator;

  if (!indicator) {
    // Create and insert the session indicator into the header
    indicator = document.createElement('div');
    indicator.id = 'session-indicator';
    indicator.className = 'session-indicator';

    // Insert after connection status
    const connectionStatus = elements.connectionStatus;
    if (connectionStatus && connectionStatus.parentNode) {
      connectionStatus.parentNode.insertBefore(
        indicator,
        connectionStatus.nextSibling
      );
    }
    elements.sessionIndicator = indicator;
  }

  // Determine which session to display in the header:
  // - If a specific session is selected in the filter, show that session
  // - If "all" is selected, show a summary or the current active session
  const displaySessionId = state.selectedSession !== 'all'
    ? state.selectedSession
    : state.currentSessionId;

  if (state.selectedSession === 'all' && state.sessions.size > 0) {
    // "All" is selected - show the count of sessions
    indicator.innerHTML = `
      <span class="session-dot" style="background: var(--color-text-muted)"></span>
      <span class="session-id">All (${state.sessions.size})</span>
    `;
    indicator.style.display = 'flex';
  } else if (displaySessionId) {
    const session = state.sessions.get(displaySessionId);
    if (session) {
      const shortId = session.id.slice(0, 8);
      const title = session.workingDirectory
        ? `Session: ${session.id}\nDirectory: ${session.workingDirectory}`
        : `Session: ${session.id}`;

      indicator.innerHTML = `
        <span class="session-dot" style="background: ${session.color}"></span>
        <span class="session-id" title="${escapeHtml(title)}">${escapeHtml(shortId)}</span>
        ${state.sessions.size > 1 ? `<span class="session-count">(${state.sessions.size})</span>` : ''}
      `;
      indicator.style.display = 'flex';
    }
  } else if (state.sessions.size > 0) {
    // Fallback: show count of sessions if no session to display
    indicator.innerHTML = `
      <span class="session-dot" style="background: var(--color-text-muted)"></span>
      <span class="session-id">${state.sessions.size} session(s)</span>
    `;
    indicator.style.display = 'flex';
  } else {
    indicator.style.display = 'none';
  }

  // Also update the session filter UI
  updateSessionFilter();
}

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

    html += `<div class="session-filter-badge-wrapper">
      <button class="session-filter-badge ${isActive} ${isOnline}" data-session="${escapeHtml(sessionId)}" title="${escapeHtml(title)}">
        <span class="session-filter-dot" style="background: ${session.color}"></span>
        ${escapeHtml(shortId)}
      </button>${showClearBtn ? `<button class="session-clear-btn" data-session="${escapeHtml(sessionId)}" title="Clear todos for this session">x</button>` : ''}
    </div>`;
  }

  html += '</div>';
  filterEl.innerHTML = html;

  // Attach click handlers using event delegation
  filterEl.querySelectorAll('.session-filter-badge').forEach((badge: Element) => {
    badge.addEventListener('click', () => {
      const sessionId = (badge as HTMLElement).dataset.session || 'all';
      selectSession(sessionId);
    });
  });

  // Attach click handlers for session clear buttons
  filterEl.querySelectorAll('.session-clear-btn').forEach((btn: Element) => {
    btn.addEventListener('click', (e: Event) => {
      e.stopPropagation(); // Prevent session selection
      const sessionId = (btn as HTMLElement).dataset.session;
      if (sessionId && callbacks) {
        callbacks.clearSessionTodos(sessionId);
      }
    });
  });
}

// ============================================
// Session Selection
// ============================================

/**
 * Select a session to filter by.
 * Updates event filtering, todo display, and shows the session's associated plan.
 */
export function selectSession(sessionId: string): void {
  state.selectedSession = sessionId;
  updateSessionIndicator(); // Updates both header indicator and filter bar
  filterAllBySession();

  // Show the plan associated with this session (if any)
  if (sessionId === 'all') {
    // When "All" is selected, show empty state - plans are session-specific
    if (callbacks) {
      callbacks.displayEmptyPlan();
    }
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
