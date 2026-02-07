/**
 * Tool event handlers for the Thinking Monitor Dashboard.
 *
 * Handles tool_start and tool_end events, creating and updating
 * tool entries in the Tools panel with proper session, agent,
 * and timing information.
 */

import { state, subagentState } from '../state.ts';
import { elements } from '../ui/elements.ts';
import { addDuration } from '../ui/duration-histogram.ts';
import { formatTime, formatDuration, getDurationClass, summarizeInput, shortenToolName } from '../utils/formatting.ts';
import { escapeHtml, escapeCssValue } from '../utils/html.ts';
import { renderSimpleMarkdown } from '../utils/markdown.ts';
import { getShortSessionId } from '../ui/filters.ts';
import { getAgentBadgeColors, getSessionColorByFolder, getSessionColorByHash } from '../ui/colors.ts';
import { getSessionDisplayName } from './sessions.ts';
import { applyToolsFilter, updateToolsCount } from '../ui/filters.ts';
import { updateTabBadge } from '../ui/views.ts';
import { saveSessionPlanAssociation } from '../storage/persistence.ts';
import { debug } from '../utils/debug.ts';
import type { ToolStartEvent, ToolEndEvent } from '../types.ts';

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
  detectSendMessage: (input: string | undefined, agentId: string | undefined, timestamp: string) => void;
  appendAndTrim: (container: HTMLElement, element: HTMLElement) => void;
  smartScroll: (container: HTMLElement) => void;
}

// ============================================
// Plan Access Detection (moved from todos.ts)
// ============================================

/**
 * Detect plan file access in tool input and create session-plan association.
 * Looks for file paths matching ~/.claude/plans/*.md pattern.
 */
function detectPlanAccess(input: string, sessionId: string): void {
  try {
    const parsed = JSON.parse(input);
    const filePath = parsed.file_path || parsed.path || '';

    const planPathMatch = filePath.match(/\.claude\/plans\/([^/]+\.md)$/);
    if (planPathMatch) {
      state.sessionPlanMap.set(sessionId, filePath);
      saveSessionPlanAssociation(sessionId, filePath);
      debug(`[Dashboard] Session ${sessionId.slice(0, 8)} associated with plan: ${planPathMatch[1]}`);
    }
  } catch {
    // If not valid JSON, try regex on the raw string
    const planPathMatch = input.match(/\.claude\/plans\/[^"'\s]+\.md/);
    if (planPathMatch) {
      state.sessionPlanMap.set(sessionId, planPathMatch[0]);
      saveSessionPlanAssociation(sessionId, planPathMatch[0]);
      debug(`[Dashboard] Session ${sessionId.slice(0, 8)} associated with plan (regex): ${planPathMatch[0]}`);
    }
  }
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
  // 2. Otherwise, use the current agent context from the stack (only if same session)
  const eventAgentId = event.agentId;
  let agentId = eventAgentId;
  if (!agentId) {
    const contextAgentId = callbacks.getCurrentAgentContext();
    // Check if context agent belongs to this session
    const contextAgent = subagentState.subagents.get(contextAgentId);
    if (contextAgent && contextAgent.parentSessionId === sessionId) {
      agentId = contextAgentId;
    } else {
      agentId = 'main';
    }
  }

  // Detect plan file access (Read, Write, or Edit to ~/.claude/plans/)
  // and associate the plan with the current session
  if ((toolName === 'Read' || toolName === 'Write' || toolName === 'Edit') && input && sessionId) {
    detectPlanAccess(input, sessionId);
  }

  // Detect SendMessage tool calls for inter-agent message tracking
  if (toolName === 'SendMessage') {
    callbacks.detectSendMessage(input, agentId, event.timestamp);
  }

  state.toolsCount++;
  updateToolsCount();
  updateTabBadge('tools', state.toolsCount);

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
  // This is the PRIMARY identifier when available - shows project/folder name
  const folderBadge = (sessionId && folderName)
    ? `<span class="entry-folder-badge" style="background: ${escapeCssValue(getSessionColorByFolder(folderName))}" title="Session: ${escapeHtml(sessionId)}">${escapeHtml(folderName)}</span>`
    : '';

  // Session ID badge - ONLY shown when no folder name is available
  // When folder badge exists, it becomes the primary identifier with session ID in tooltip
  const sessionBadge = (sessionId && !folderName)
    ? `<span class="entry-session-badge" style="background: ${escapeCssValue(getSessionColorByHash(sessionId))}" title="Session: ${escapeHtml(sessionId)}">${escapeHtml(getShortSessionId(sessionId))}</span>`
    : '';

  // Generate preview text for collapsed state
  const preview = summarizeInput(input, toolName);

  // Get the display name for this agent
  const agentDisplayName = callbacks.getAgentDisplayName(agentId);

  // Get agent badge colors for visual distinction (WCAG AA compliant)
  const agentBadgeColors = getAgentBadgeColors(agentDisplayName);

  // Create tool entry with collapsible structure (collapsed by default)
  const entry = document.createElement('div');
  entry.className = 'tool-entry collapsed new';
  entry.id = `tool-${toolCallId}`;
  entry.dataset.toolName = toolName.toLowerCase();
  entry.dataset.session = sessionId || '';
  entry.dataset.input = (input || '').toLowerCase();
  entry.dataset.agent = agentId;
  entry.dataset.timestamp = String(Date.now());

  entry.innerHTML = `
    <div class="tool-entry-header">
      <div class="tool-header-line1">
        <span class="tool-toggle"></span>
        <span class="tool-time">${escapeHtml(time)}</span>
        ${folderBadge}
        ${sessionBadge}
      </div>
      <div class="tool-header-line2">
        <span class="tool-agent" style="background: ${escapeCssValue(agentBadgeColors.bg)}; color: ${escapeCssValue(agentBadgeColors.text)}">${escapeHtml(agentDisplayName)}</span>
        <span class="tool-name" title="${escapeHtml(toolName)}">${escapeHtml(shortenToolName(toolName))}</span>
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

  // Track duration in histogram (outside entry check to capture all durations)
  if (durationMs !== undefined) {
    addDuration(durationMs);
  }

  // Remove from pending
  state.pendingTools.delete(toolCallId);
}
