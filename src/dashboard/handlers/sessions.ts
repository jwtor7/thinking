/**
 * Session Management Handlers
 *
 * Handles session tracking, filtering, and indicator updates.
 * Sessions represent individual Claude Code CLI instances connected to the monitor.
 */

import { state, subagentState } from '../state.ts';
import { elements } from '../ui/elements.ts';
import { escapeHtml } from '../utils/html.ts';
import { getSessionColorByFolder, getAgentColor } from '../ui/colors.ts';
import { filterAllBySession } from '../ui/filters.ts';
import { rebuildResizers } from '../ui/resizer.ts';
import { updateSessionViewTabs } from '../ui/views.ts';
import type { SessionStartEvent, SessionStopEvent } from '../types.ts';

// ============================================
// Activity Tracking Constants
// ============================================

/** Time threshold in ms - sessions with activity within this window are "active" */
const ACTIVITY_THRESHOLD_MS = 10_000;

/** Interval in ms for checking activity status */
const ACTIVITY_CHECK_INTERVAL_MS = 5_000;

/** Activity checker interval ID */
let activityCheckerInterval: ReturnType<typeof setInterval> | null = null;

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
  updateExportButtonState: () => void;
  clearAllPanels: () => void;
}

let callbacks: SessionCallbacks | null = null;

/**
 * Initialize session handlers with callbacks to other modules.
 * Must be called before any session events are processed.
 */
export function initSessions(cbs: SessionCallbacks): void {
  callbacks = cbs;
  // Start the activity checker when sessions are initialized
  startActivityChecker();
}

// ============================================
// Display Name Utilities
// ============================================

/**
 * Extract folder name from a working directory path.
 * Falls back to session ID (first 8 chars) if no path available.
 */
export function getSessionDisplayName(workingDirectory?: string, sessionId?: string): string {
  if (workingDirectory) {
    // Remove trailing slash and get last path component
    const parts = workingDirectory.replace(/\/$/, '').split('/');
    const folderName = parts[parts.length - 1];
    if (folderName) {
      return folderName;
    }
  }
  // Fall back to short session ID
  return sessionId?.slice(0, 8) || 'unknown';
}

/**
 * Get the folder name from a session for color grouping.
 * Returns the folder name if available, undefined otherwise.
 */
export function getSessionFolderName(workingDirectory?: string): string | undefined {
  if (workingDirectory) {
    const parts = workingDirectory.replace(/\/$/, '').split('/');
    return parts[parts.length - 1] || undefined;
  }
  return undefined;
}

// ============================================
// Activity Tracking
// ============================================

/**
 * Update the last activity time for a session.
 * Called when events are received from this session.
 */
export function updateSessionActivity(sessionId: string): void {
  const session = state.sessions.get(sessionId);
  if (session) {
    session.lastActivityTime = Date.now();
    // Update status bar when activity occurs
    updateStatusBarSession();
  }
}

/**
 * Check if a session has had activity within the threshold.
 */
export function hasRecentActivity(sessionId: string): boolean {
  const session = state.sessions.get(sessionId);
  if (!session || !session.lastActivityTime) {
    return false;
  }
  return Date.now() - session.lastActivityTime < ACTIVITY_THRESHOLD_MS;
}

/**
 * Start the activity checker interval.
 * Refreshes the session filter periodically to update pulse states.
 */
function startActivityChecker(): void {
  if (activityCheckerInterval) {
    return; // Already running
  }
  activityCheckerInterval = setInterval(() => {
    // Only update if we have sessions
    if (state.sessions.size > 0) {
      updateSessionFilter();
      updateStatusBarSession();
    }
  }, ACTIVITY_CHECK_INTERVAL_MS);
}

/**
 * Stop the activity checker interval.
 */
export function stopActivityChecker(): void {
  if (activityCheckerInterval) {
    clearInterval(activityCheckerInterval);
    activityCheckerInterval = null;
  }
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
    // No working directory yet - use session ID for color (will update on session_start)
    state.sessions.set(sessionId, {
      id: sessionId,
      startTime: timestamp,
      active: true,
      color: getSessionColorByFolder('', sessionId),
      lastActivityTime: Date.now(),
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
  const folderName = getSessionFolderName(workingDirectory);

  console.log(`[Dashboard] Session started: ${sessionId}`, { workingDirectory, folderName });

  state.sessions.set(sessionId, {
    id: sessionId,
    workingDirectory,
    startTime: event.timestamp,
    active: true,
    color: getSessionColorByFolder(folderName || '', sessionId),
    lastActivityTime: Date.now(),
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
 * Sorts sessions by folder name for visual grouping.
 */
export function updateSessionFilter(): void {
  // Create session filter element if it doesn't exist
  let filterEl = elements.sessionFilter;

  if (!filterEl) {
    // Double-check DOM to prevent duplicates
    const existingEl = document.getElementById('session-filter');
    if (existingEl) {
      elements.sessionFilter = existingEl;
      filterEl = existingEl;
    } else {
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

  // Clear all panels button
  html += `<button class="session-filter-clear-btn" title="Clear all panels" aria-label="Clear all panels">
    &#10005;
  </button>`;

  // "All" option
  const allActive = state.selectedSession === 'all' ? 'active' : '';
  html += `<button class="session-filter-badge ${allActive}" data-session="all">
    <span class="session-filter-dot" style="background: var(--color-text-muted)"></span>
    All
  </button>`;

  // Sort sessions by folder name for grouping
  const sortedSessions = Array.from(state.sessions.entries()).sort((a, b) => {
    const folderA = getSessionDisplayName(a[1].workingDirectory, a[0]);
    const folderB = getSessionDisplayName(b[1].workingDirectory, b[0]);
    return folderA.localeCompare(folderB);
  });

  // Individual session badges with nested subagents
  for (const [sessionId, session] of sortedSessions) {
    const displayName = getSessionDisplayName(session.workingDirectory, sessionId);
    const isActive = state.selectedSession === sessionId ? 'active' : '';
    const isOnline = session.active ? 'online' : '';
    const isPulsing = hasRecentActivity(sessionId) ? 'pulsing' : '';

    // Only show clear button for inactive sessions that have stored todos
    const hasTodos = state.sessionTodos.has(sessionId) && (state.sessionTodos.get(sessionId)?.length ?? 0) > 0;
    const showClearBtn = !session.active && hasTodos;
    const clearBtnHtml = showClearBtn
      ? `<span class="session-close-btn" data-session="${escapeHtml(sessionId)}" title="Clear session">&times;</span>`
      : '';

    // Check if this session has subagents
    const subagentIds = subagentState.sessionSubagents.get(sessionId);
    const hasSubagents = subagentIds && subagentIds.size > 0;
    const subagentIndicator = hasSubagents
      ? `<span class="session-subagent-indicator" title="${subagentIds.size} subagent(s)">${subagentIds.size}</span>`
      : '';

    // Build class list
    const classes = ['session-filter-badge', isActive, isOnline, isPulsing, hasSubagents ? 'has-subagents' : '']
      .filter(Boolean)
      .join(' ') + (showClearBtn ? ' has-close' : '');

    html += `<button class="${classes}"
      data-session="${escapeHtml(sessionId)}"
      data-session-tooltip="true"
      data-session-id="${escapeHtml(sessionId)}"
      data-session-path="${escapeHtml(session.workingDirectory || '')}">
      <span class="session-filter-dot" style="background: ${session.color}"></span>
      ${escapeHtml(displayName)}${subagentIndicator}${clearBtnHtml}
    </button>`;

    // Add nested subagent badges
    if (hasSubagents) {
      for (const agentId of subagentIds) {
        const subagent = subagentState.subagents.get(agentId);
        if (!subagent) continue;

        const subagentName = subagent.agentName || agentId.slice(0, 8);
        const agentColor = getAgentColor(subagentName);
        const subagentIsRunning = subagent.status === 'running';
        const subagentClasses = ['session-filter-badge', 'subagent-badge', subagentIsRunning ? 'pulsing' : '']
          .filter(Boolean)
          .join(' ');

        // Subagent badge shows tree line indicator
        html += `<button class="${subagentClasses}"
          data-session="${escapeHtml(sessionId)}"
          data-agent="${escapeHtml(agentId)}"
          title="Subagent: ${escapeHtml(subagentName)} (${escapeHtml(subagent.status)})">
          <span class="subagent-tree-line"></span>
          <span class="session-filter-dot" style="background: ${agentColor}"></span>
          ${escapeHtml(subagentName)}
        </button>`;
      }
    }
  }

  html += '</div>';
  filterEl.innerHTML = html;

  // Clear all panels button handler
  const clearBtn = filterEl.querySelector('.session-filter-clear-btn');
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      if (callbacks) {
        callbacks.clearAllPanels();
      }
    });
  }

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

    // Context menu for Reveal in Finder
    badge.addEventListener('contextmenu', (e: Event) => {
      const mouseEvent = e as MouseEvent;
      const sessionId = (badge as HTMLElement).dataset.session;
      if (sessionId && sessionId !== 'all') {
        handleSessionContextMenu(mouseEvent, sessionId);
      }
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
  const isAllSessions = sessionId === 'all';

  updateSessionFilter();
  filterAllBySession();

  // Update visibility of session-specific panels
  updateSessionPanelVisibility(sessionId);

  // Update view tab visibility (hide Todo/Plan tabs when "All" selected)
  updateSessionViewTabs(isAllSessions);

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

  // Update export button state (disabled when "All" is selected)
  if (callbacks) {
    callbacks.updateExportButtonState();
  }
}

// ============================================
// Session Context Menu
// ============================================

/** Currently shown context menu session ID */
let contextMenuSessionId: string | null = null;

/**
 * Handle right-click on a session badge.
 * Shows a context menu with "Reveal in Finder" option.
 */
function handleSessionContextMenu(e: MouseEvent, sessionId: string): void {
  e.preventDefault();
  e.stopPropagation();

  const session = state.sessions.get(sessionId);
  if (!session?.workingDirectory) {
    return; // No path to reveal
  }

  contextMenuSessionId = sessionId;
  showSessionContextMenu(e.clientX, e.clientY);
}

/**
 * Show the session context menu at the specified position.
 */
function showSessionContextMenu(x: number, y: number): void {
  const menu = elements.sessionContextMenu;
  if (!menu) return;

  menu.style.left = `${x}px`;
  menu.style.top = `${y}px`;
  menu.classList.add('visible');
}

/**
 * Hide the session context menu.
 */
export function hideSessionContextMenu(): void {
  const menu = elements.sessionContextMenu;
  if (menu) {
    menu.classList.remove('visible');
  }
  contextMenuSessionId = null;
}

/**
 * Handle "Reveal in Finder" click from context menu.
 */
export function handleRevealSessionInFinder(): void {
  if (!contextMenuSessionId) return;

  const session = state.sessions.get(contextMenuSessionId);
  if (!session?.workingDirectory) return;

  // Use the file:// URL scheme to open Finder at the path
  // This works on macOS to reveal the folder in Finder
  const path = session.workingDirectory;

  // Create a temporary link and trigger download to open in Finder
  // This is a workaround since window.open('file://') doesn't work in browsers
  // Instead, we'll use the server endpoint if available
  console.log(`[Dashboard] Reveal in Finder: ${path}`);

  // Try to use the server API to reveal in Finder
  // Note: API is on port 3355, dashboard is on port 3356
  fetch('http://localhost:3355/file-action', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'reveal', path }),
  })
    .then(async response => {
      if (!response.ok) {
        const text = await response.text();
        console.error('[Dashboard] Reveal in Finder failed:', response.status, text);
        // Fallback: show a toast with the path
        if (callbacks) {
          callbacks.showToast(`Path: ${path}`, 'info', 5000);
        }
      } else {
        console.log('[Dashboard] Reveal in Finder succeeded');
      }
    })
    .catch(err => {
      console.error('[Dashboard] Reveal in Finder fetch error:', err);
      if (callbacks) {
        callbacks.showToast(`Path: ${path}`, 'info', 5000);
      }
    });

  hideSessionContextMenu();
}

// ============================================
// Status Bar Active Session
// ============================================

/**
 * Find the most recently active session.
 * Returns the session with the most recent lastActivityTime.
 */
function findMostRecentActiveSession(): { id: string; session: typeof state.sessions extends Map<string, infer V> ? V : never } | null {
  let mostRecent: { id: string; session: typeof state.sessions extends Map<string, infer V> ? V : never } | null = null;
  let mostRecentTime = 0;

  for (const [id, session] of state.sessions) {
    if (session.lastActivityTime && session.lastActivityTime > mostRecentTime) {
      mostRecentTime = session.lastActivityTime;
      mostRecent = { id, session };
    }
  }

  return mostRecent;
}

/**
 * Update the status bar with the most recently active session.
 * Shows folder name as primary identifier with full session ID in tooltip.
 */
export function updateStatusBarSession(): void {
  const indicator = elements.activeSessionIndicator;
  if (!indicator) return;

  const mostRecent = findMostRecentActiveSession();

  if (!mostRecent) {
    indicator.innerHTML = '';
    indicator.style.display = 'none';
    return;
  }

  const { id, session } = mostRecent;
  const folderName = getSessionDisplayName(session.workingDirectory, id);
  const isActive = hasRecentActivity(id);

  // Show folder name as primary identifier
  // Full session ID is available in tooltip for technical reference
  const tooltipText = session.workingDirectory
    ? `${session.workingDirectory}\nSession: ${id}`
    : `Session: ${id}`;

  indicator.style.display = 'flex';
  indicator.innerHTML = `
    <span class="active-session-dot${isActive ? ' pulsing' : ''}" style="background: ${session.color}"></span>
    <span class="active-session-name" title="${escapeHtml(tooltipText)}">${escapeHtml(folderName)}</span>
  `;
  indicator.dataset.sessionId = id;
}

/**
 * Initialize the status bar click handler.
 * Clicking the active session indicator selects that session.
 */
export function initStatusBarSession(): void {
  const indicator = elements.activeSessionIndicator;
  if (!indicator) return;

  indicator.addEventListener('click', () => {
    const sessionId = indicator.dataset.sessionId;
    if (sessionId) {
      selectSession(sessionId);
    }
  });
}
