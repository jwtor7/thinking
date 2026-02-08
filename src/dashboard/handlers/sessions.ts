/**
 * Session Management Handlers
 *
 * Handles session tracking, filtering, and indicator updates.
 * Sessions represent individual Claude Code CLI instances connected to the monitor.
 */

import { state, subagentState } from '../state.ts';
import { elements } from '../ui/elements.ts';
import { debug } from '../utils/debug.ts';
import { escapeHtml, escapeCssValue } from '../utils/html.ts';
import { formatElapsed } from '../utils/formatting.ts';
import { getSessionColorByFolder, getAgentColor } from '../ui/colors.ts';
import { filterAllBySession } from '../ui/filters.ts';
import { rebuildResizers } from '../ui/resizer.ts';
import { updateSessionViewTabs } from '../ui/views.ts';
import { filterTeamBySession } from './team.ts';
import { filterTasksBySession } from './tasks.ts';
import { refreshSessionChips } from './timeline.ts';
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

/** Session duration update interval ID */
let durationInterval: ReturnType<typeof setInterval> | null = null;

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
  showToast: (message: string, type: 'success' | 'error' | 'info', duration?: number) => void;
  updateExportButtonState: () => void;
  clearAllPanels: () => void;
  setStatsSource: (sessionId: string) => void;
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
  // Start the session duration timer (updates footer every 60s)
  startDurationTimer();
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

/**
 * Start the session duration timer.
 * Updates the status bar every 60 seconds to show elapsed session time.
 */
function startDurationTimer(): void {
  if (durationInterval) return;
  durationInterval = setInterval(() => {
    updateStatusBarSession();
  }, 60_000);
}

/**
 * Stop the session duration timer.
 */
export function stopDurationTimer(): void {
  if (durationInterval) {
    clearInterval(durationInterval);
    durationInterval = null;
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

  if (isNewSession) {
    // No working directory yet - use session ID for color (will update on session_start)
    state.sessions.set(sessionId, {
      id: sessionId,
      startTime: timestamp,
      active: true,
      color: getSessionColorByFolder('', sessionId),
      lastActivityTime: Date.now(),
    });
    debug(`[Dashboard] New session tracked: ${sessionId}`);
    updateSessionFilter();
    refreshSessionChips();
  }

  // Update current session
  state.currentSessionId = sessionId;
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

  debug(`[Dashboard] Session started: ${sessionId}`, { workingDirectory, folderName });

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

  // Keep "All Sessions" context stable when new sessions appear.
  // Avoid forcing selection changes that would unexpectedly unhide session-only panels.
  if (state.selectedSession === 'all') {
    updateSessionPanelVisibility('all');
  }
}

/**
 * Handle session_stop event.
 * Marks the session as inactive and clears current session if it matches.
 */
export function handleSessionStop(event: SessionStopEvent): void {
  const sessionId = event.sessionId;
  const session = state.sessions.get(sessionId);

  debug(`[Dashboard] Session stopped: ${sessionId}`);

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
 * Render the session filter bar with a dropdown selector and subagent chips.
 * Uses a <select> dropdown instead of badge buttons to prevent horizontal overflow.
 * Subagent filter chips appear when the selected session has subagents.
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

  // Build dropdown HTML
  let html = '<span class="session-filter-label">SESSION:</span>';

  // Clear all panels button
  html += `<button class="session-filter-clear-btn" title="Clear all panels" aria-label="Clear all panels">&#10005;</button>`;

  // Dropdown select
  html += '<select class="session-dropdown" id="session-dropdown" aria-label="Select session">';
  html += `<option value="all"${state.selectedSession === 'all' ? ' selected' : ''}>All Sessions (${state.sessions.size})</option>`;

  // Sort sessions by folder name for grouping
  const sortedSessions = Array.from(state.sessions.entries()).sort((a, b) => {
    const folderA = getSessionDisplayName(a[1].workingDirectory, a[0]);
    const folderB = getSessionDisplayName(b[1].workingDirectory, b[0]);
    return folderA.localeCompare(folderB);
  });

  // Build a map of displayName -> count to detect duplicates
  const displayNameCounts = new Map<string, number>();
  for (const [sessionId, session] of sortedSessions) {
    const displayName = getSessionDisplayName(session.workingDirectory, sessionId);
    displayNameCounts.set(displayName, (displayNameCounts.get(displayName) || 0) + 1);
  }

  for (const [sessionId, session] of sortedSessions) {
    const displayName = getSessionDisplayName(session.workingDirectory, sessionId);
    const statusIndicator = session.active ? (hasRecentActivity(sessionId) ? '\u25CF' : '\u25CB') : '\u25CC';
    const selected = state.selectedSession === sessionId ? ' selected' : '';
    const subagentIds = subagentState.sessionSubagents.get(sessionId);
    const subagentCount = subagentIds?.size || 0;
    const subagentLabel = subagentCount > 0 ? ` [${subagentCount} agents]` : '';

    // Disambiguate entries with duplicate display names by appending start time or session ID
    let disambiguated = displayName;
    if ((displayNameCounts.get(displayName) || 0) > 1) {
      let timeStr = '';
      if (session.startTime) {
        const d = new Date(session.startTime);
        timeStr = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
      }
      disambiguated = `${displayName} (${timeStr || sessionId.slice(0, 8)})`;
    }

    html += `<option value="${escapeHtml(sessionId)}"${selected}>${statusIndicator} ${escapeHtml(disambiguated)}${subagentLabel}</option>`;
  }

  html += '</select>';

  // Subagent chips (shown when a specific session is selected and has subagents)
  if (state.selectedSession !== 'all') {
    const subagentIds = subagentState.sessionSubagents.get(state.selectedSession);
    if (subagentIds && subagentIds.size > 0) {
      html += '<div class="session-agent-chips">';
      for (const agentId of subagentIds) {
        const subagent = subagentState.subagents.get(agentId);
        if (!subagent) continue;
        const subagentName = subagent.agentName || agentId.slice(0, 8);
        const agentColor = getAgentColor(subagentName);
        const isRunning = subagent.status === 'running';
        const isSelected = state.selectedAgentId === agentId;
        html += `<button class="session-agent-chip${isRunning ? ' running' : ''}${isSelected ? ' active' : ''}" data-agent="${escapeHtml(agentId)}" title="${escapeHtml(subagentName)} (${escapeHtml(subagent.status)})">
          <span class="session-agent-chip-dot" style="background: ${agentColor}"></span>
          ${escapeHtml(subagentName)}
        </button>`;
      }
      html += '</div>';
    }
  }

  filterEl.innerHTML = html;

  // Event handlers

  // Clear button
  const clearBtn = filterEl.querySelector('.session-filter-clear-btn');
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      if (callbacks) callbacks.clearAllPanels();
    });
  }

  // Dropdown change
  const dropdown = filterEl.querySelector('.session-dropdown') as HTMLSelectElement;
  if (dropdown) {
    dropdown.addEventListener('change', () => {
      selectSession(dropdown.value);
    });
  }

  // Agent chip clicks
  filterEl.querySelectorAll('.session-agent-chip').forEach((chip: Element) => {
    chip.addEventListener('click', () => {
      const agentId = (chip as HTMLElement).dataset.agent;
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

// ============================================
// Session Selection
// ============================================

/**
 * Toggle visibility of session-specific panels (Plan, Team, and Tasks).
 * These panels are hidden when "All" sessions is selected since they're session-specific.
 */
function updateSessionPanelVisibility(sessionId: string): void {
  const isAllSessions = sessionId === 'all';

  // Hide session-specific panels when viewing all sessions
  if (elements.planPanel) {
    elements.planPanel.classList.toggle('session-hidden', isAllSessions);
  }
  if (elements.teamPanel) {
    elements.teamPanel.classList.toggle('session-hidden', isAllSessions);
  }
  if (elements.tasksPanel) {
    elements.tasksPanel.classList.toggle('session-hidden', isAllSessions);
  }

  // Rebuild resizers to only show between visible panels
  rebuildResizers();
}

/**
 * Select a session to filter by.
 * Updates event filtering, session-scoped panels, and the session's associated plan.
 */
export function selectSession(sessionId: string): void {
  state.selectedSession = sessionId;
  const isAllSessions = sessionId === 'all';

  updateSessionFilter();
  filterAllBySession();

  // Update visibility of session-specific panels
  updateSessionPanelVisibility(sessionId);

  // Update view tab visibility (hide session-scoped tabs when "All" is selected)
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

  // Update stats bar to show session-specific stats
  if (callbacks) {
    callbacks.setStatsSource(sessionId);
  }

  // Filter team and tasks panels by session
  filterTeamBySession();
  filterTasksBySession();

  // Update export button state (disabled when "All" is selected)
  if (callbacks) {
    callbacks.updateExportButtonState();
  }
}

/**
 * Auto-select the most recently active session on page load.
 * If no session is selected or the selected session is inactive,
 * finds and selects the most recently active session.
 */
export function autoSelectActiveSession(): void {
  // Check if selectedSession is set to a specific session
  if (state.selectedSession && state.selectedSession !== 'all') {
    const selectedSession = state.sessions.get(state.selectedSession);
    // If the selected session is still active, keep it selected
    if (selectedSession && selectedSession.active) {
      return;
    }
  }

  // Selected session is inactive or 'all' - find and select the most recently active session
  const mostRecent = findMostRecentActiveSession();
  if (mostRecent) {
    selectSession(mostRecent.id);
  }
}

// ============================================
// Per-Agent Filtering
// ============================================

/**
 * Select an agent to filter events by, or null to show all.
 * Applies filtering to thinking, tools, and hooks panels.
 */
export function selectAgentFilter(agentId: string | null): void {
  state.selectedAgentId = agentId;
  filterAllBySession(); // Re-applies all filters including agent
  debug(`[Dashboard] Agent filter: ${agentId || 'all'}`);
}

// ============================================
// Session Context Menu
// ============================================

/** Currently shown context menu session ID */
let contextMenuSessionId: string | null = null;

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
  debug(`[Dashboard] Reveal in Finder: ${path}`);

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
        debug('[Dashboard] Reveal in Finder succeeded');
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

  // Calculate elapsed time since session started
  const elapsed = session.startTime
    ? formatElapsed(Date.now() - new Date(session.startTime).getTime())
    : '';

  indicator.style.display = 'flex';
  indicator.innerHTML = `
    <span class="active-session-dot${isActive ? ' pulsing' : ''}" style="background: ${escapeCssValue(session.color)}"></span>
    <span class="active-session-name" title="${escapeHtml(tooltipText)}">${escapeHtml(folderName)}</span>
    ${elapsed ? `<span class="active-session-duration">${escapeHtml(elapsed)}</span>` : ''}
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
