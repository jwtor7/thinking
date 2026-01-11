/**
 * Tool event handlers for the Thinking Monitor Dashboard.
 *
 * Handles tool_start and tool_end events, creating and updating
 * tool entries in the Tools panel with proper session, agent,
 * and timing information.
 */

import { state } from '../state';
import { elements } from '../ui/elements';
import { formatTime, formatDuration, getDurationClass, summarizeInput } from '../utils/formatting';
import { escapeHtml, escapeCssValue } from '../utils/html';
import { renderSimpleMarkdown } from '../utils/markdown';
import { getShortSessionId } from '../ui/filters';
import { getAgentColor, getSessionColorByFolder, getSessionColorByHash } from '../ui/colors';
import { getSessionDisplayName } from './sessions';
import { applyToolsFilter, updateToolsCount } from '../ui/filters';
import type { ToolStartEvent, ToolEndEvent } from '../types';

// ============================================
// Utilities
// ============================================

/**
 * Process JSON escape sequences to their actual characters.
 * Converts \n, \t, \", \\ from literal backslash sequences to real characters.
 */
function processEscapes(str: string): string {
  return str
    .replace(/\\n/g, '\n')    // \n → newline
    .replace(/\\t/g, '\t')    // \t → tab
    .replace(/\\"/g, '"')     // \" → "
    .replace(/\\\\/g, '\\');  // \\ → \
}

// ============================================
// Callback Interface
// ============================================

/**
 * Callbacks for functions that cannot be directly imported
 * due to circular dependency concerns.
 */
export interface ToolsCallbacks {
  getCurrentAgentContext: () => string;
  getAgentDisplayName: (agentId: string) => string;
  parseTodoWriteInput: (input: string | undefined, sessionId: string | undefined) => void;
  detectPlanAccess: (input: string, sessionId: string) => void;
  appendAndTrim: (container: HTMLElement, element: HTMLElement) => void;
  smartScroll: (container: HTMLElement) => void;
}

let callbacks: ToolsCallbacks | null = null;

/**
 * Initialize the tools handler with required callbacks.
 * Must be called before handling any tool events.
 */
export function initTools(cbs: ToolsCallbacks): void {
  callbacks = cbs;
}

// ============================================
// Event Handlers
// ============================================

/**
 * Handle a tool_start event.
 *
 * Creates a new tool entry in the Tools panel with:
 * - Time, session badge, and agent attribution
 * - Tool name and input preview (collapsed by default)
 * - Expandable details section with full input
 *
 * Also handles special tool processing:
 * - TodoWrite: Parses todo items from input
 * - Read/Write/Edit: Detects plan file access for session association
 */
export function handleToolStart(event: ToolStartEvent): void {
  if (!callbacks) {
    console.error('[Tools] Handler not initialized - call initTools first');
    return;
  }

  const toolName = event.toolName;
  const toolCallId = event.toolCallId || `tool-${Date.now()}`;
  const input = event.input;
  const time = formatTime(event.timestamp);
  const sessionId = event.sessionId;

  // Determine agent context:
  // 1. Use explicit agentId from the event if provided
  // 2. Otherwise, use the current agent context from the stack
  const eventAgentId = event.agentId;
  const agentId = eventAgentId || callbacks.getCurrentAgentContext();

  // Parse TodoWrite at tool_start - this is when we have the input
  // (tool_end events don't include the input, only the output)
  if (toolName === 'TodoWrite') {
    callbacks.parseTodoWriteInput(input, sessionId);
  }

  // Detect plan file access (Read, Write, or Edit to ~/.claude/plans/)
  // and associate the plan with the current session
  if ((toolName === 'Read' || toolName === 'Write' || toolName === 'Edit') && input && sessionId) {
    callbacks.detectPlanAccess(input, sessionId);
  }

  state.toolsCount++;
  updateToolsCount();

  // Clear empty state if present
  const emptyState = elements.toolsContent.querySelector('.empty-state');
  if (emptyState) {
    emptyState.remove();
  }

  // Get folder name for folder badge
  const session = state.sessions.get(sessionId || '');
  const folderName = session?.workingDirectory
    ? getSessionDisplayName(session.workingDirectory)
    : null;

  // Folder badge - same color for all sessions in same folder
  // SECURITY: escapeCssValue prevents CSS injection in style attributes
  const folderBadge = (sessionId && folderName)
    ? `<span class="entry-folder-badge" style="background: ${escapeCssValue(getSessionColorByFolder(folderName))}">${escapeHtml(folderName)}</span>`
    : '';

  // Session ID badge - unique color per session (hash of session ID, not folder)
  const sessionBadge = sessionId
    ? `<span class="entry-session-badge" style="background: ${escapeCssValue(getSessionColorByHash(sessionId))}" title="Session: ${escapeHtml(sessionId)}">${escapeHtml(getShortSessionId(sessionId))}</span>`
    : '';

  // Generate preview text for collapsed state
  const preview = summarizeInput(input);

  // Get the display name for this agent
  const agentDisplayName = callbacks.getAgentDisplayName(agentId);

  // Get agent color for visual distinction
  const agentColor = getAgentColor(agentDisplayName);

  // Create tool entry with collapsible structure (collapsed by default)
  const entry = document.createElement('div');
  entry.className = 'tool-entry collapsed new';
  entry.id = `tool-${toolCallId}`;
  entry.dataset.toolName = toolName.toLowerCase();
  entry.dataset.session = sessionId || '';
  entry.dataset.input = (input || '').toLowerCase();
  entry.dataset.agent = agentId;

  entry.innerHTML = `
    <div class="tool-entry-header">
      <div class="tool-header-line1">
        <span class="tool-toggle"></span>
        <span class="tool-time">${escapeHtml(time)}</span>
        ${folderBadge}
        ${sessionBadge}
      </div>
      <div class="tool-header-line2">
        <span class="tool-agent" style="color: ${escapeCssValue(agentColor)}">${escapeHtml(agentDisplayName)}</span>
        <span class="tool-name">${escapeHtml(toolName)}</span>
        <span class="tool-preview">${escapeHtml(preview)}</span>
      </div>
    </div>
    <div class="tool-entry-details">
      <div class="tool-input-section">
        <div class="tool-input-label">INPUT</div>
        <div class="tool-input-content">${renderSimpleMarkdown(processEscapes(input || '(none)'))}</div>
      </div>
    </div>
  `;

  // Add click handler for toggling collapse state
  entry.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    // Don't toggle if clicking inside details (for text selection)
    if (!entry.classList.contains('collapsed') && target.closest('.tool-entry-details')) {
      return;
    }
    // Don't toggle if clicking links/buttons/file paths
    if (target.closest('a, button, .tool-file-path')) {
      return;
    }
    entry.classList.toggle('collapsed');
  });

  // Track pending tool
  state.pendingTools.set(toolCallId, {
    id: toolCallId,
    name: toolName,
    input,
    startTime: event.timestamp,
    element: entry,
  });

  // Apply filter
  applyToolsFilter(entry);

  callbacks.appendAndTrim(elements.toolsContent, entry);
  callbacks.smartScroll(elements.toolsContent);

  // Remove 'new' class after animation
  setTimeout(() => entry.classList.remove('new'), 1000);
}

/**
 * Handle a tool_end event.
 *
 * Updates the existing tool entry with duration information.
 * Note: TodoWrite is handled in handleToolStart since tool_end
 * doesn't include the input.
 */
export function handleToolEnd(event: ToolEndEvent): void {
  const toolCallId = event.toolCallId || '';
  const durationMs = event.durationMs;

  // Update existing entry if found
  const entry = document.getElementById(`tool-${toolCallId}`);
  if (entry) {
    // Add duration if available (append to line 2)
    if (durationMs !== undefined) {
      const line2El = entry.querySelector('.tool-header-line2');
      if (line2El && !line2El.querySelector('.tool-duration')) {
        const durationEl = document.createElement('span');
        const durationClass = getDurationClass(durationMs);
        durationEl.className = `tool-duration ${durationClass}`;
        durationEl.textContent = formatDuration(durationMs);
        durationEl.title = `Duration: ${durationMs}ms`;
        line2El.appendChild(durationEl);
      }
    }
  }

  // Remove from pending
  state.pendingTools.delete(toolCallId);
}
