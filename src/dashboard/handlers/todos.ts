/**
 * Todo Handler Module
 *
 * Handles todo panel rendering and state management.
 * Includes parsing TodoWrite tool input and tracking session-plan associations.
 */

import { state } from '../state';
import { elements } from '../ui/elements';
import { escapeHtml } from '../utils/html';
import { saveTodosToStorage, saveSessionPlanAssociation } from '../storage/persistence';
import { TodoItem } from '../types';

// ============================================
// Callback Interface
// ============================================

/**
 * Callbacks for functions that would cause circular imports.
 * These are injected during initialization.
 */
export interface TodoCallbacks {
  showToast: (message: string, type: 'success' | 'error' | 'info', duration?: number) => void;
  updateSessionFilter: () => void;
}

let callbacks: TodoCallbacks | null = null;

/**
 * Initialize the todo handler with required callbacks.
 * Must be called before using functions that depend on callbacks.
 */
export function initTodos(cbs: TodoCallbacks): void {
  callbacks = cbs;
}

// ============================================
// Plan Access Detection
// ============================================

/**
 * Detect plan file access in tool input and create session-plan association.
 * Looks for file paths matching ~/.claude/plans/*.md pattern.
 *
 * @param input - The raw tool input string (may be JSON or plain text)
 * @param sessionId - The session ID to associate with the plan
 */
export function detectPlanAccess(input: string, sessionId: string): void {
  try {
    const parsed = JSON.parse(input);
    const filePath = parsed.file_path || parsed.path || '';

    const planPathMatch = filePath.match(/\.claude\/plans\/([^/]+\.md)$/);
    if (planPathMatch) {
      state.sessionPlanMap.set(sessionId, filePath);
      saveSessionPlanAssociation(sessionId, filePath);
      console.log(`[Dashboard] Session ${sessionId.slice(0, 8)} associated with plan: ${planPathMatch[1]}`);
    }
  } catch {
    // If not valid JSON, try regex on the raw string
    const planPathMatch = input.match(/\.claude\/plans\/[^"'\s]+\.md/);
    if (planPathMatch) {
      state.sessionPlanMap.set(sessionId, planPathMatch[0]);
      saveSessionPlanAssociation(sessionId, planPathMatch[0]);
      console.log(`[Dashboard] Session ${sessionId.slice(0, 8)} associated with plan (regex): ${planPathMatch[0]}`);
    }
  }
}

// ============================================
// TodoWrite Parsing
// ============================================

/**
 * Parse TodoWrite tool input and update todos state.
 * Expects JSON with a "todos" array property.
 *
 * @param input - The raw tool input string (JSON)
 * @param sessionId - The session ID these todos belong to
 */
export function parseTodoWriteInput(input: string | undefined, sessionId: string | undefined): void {
  if (!input) return;

  try {
    const parsed = JSON.parse(input);
    if (parsed.todos && Array.isArray(parsed.todos)) {
      handleTodoUpdate(parsed.todos, sessionId);
    }
  } catch (e) {
    console.warn('[Dashboard] Failed to parse TodoWrite input:', e);
  }
}

// ============================================
// Todo State Management
// ============================================

/**
 * Update todos for a session and re-render if it's the current session.
 * Persists todos to localStorage.
 *
 * @param todos - The new todo items array
 * @param sessionId - The session ID these todos belong to
 */
export function handleTodoUpdate(todos: TodoItem[], sessionId: string | undefined): void {
  const effectiveSessionId = sessionId || state.currentSessionId || 'unknown';
  state.sessionTodos.set(effectiveSessionId, todos);
  saveTodosToStorage();

  // Don't update display if "All" sessions is selected
  if (state.selectedSession === 'all') {
    return;
  }

  // Only update display if this is the currently selected session
  if (effectiveSessionId === state.selectedSession) {
    state.todos = todos;
    elements.todoCount.textContent = String(todos.length);
    renderTodoPanel();
  }
}

/**
 * Update the displayed todos based on the current session selection.
 * Called when session selection changes.
 */
export function updateTodosForCurrentSession(): void {
  if (state.selectedSession === 'all') {
    state.todos = [];
    elements.todoCount.textContent = '0';
    renderTodoPanel();
    return;
  }

  const sessionToShow = state.selectedSession;
  state.todos = state.sessionTodos.get(sessionToShow) || [];
  elements.todoCount.textContent = String(state.todos.length);
  renderTodoPanel();
}

/**
 * Clear todos for a specific session.
 * Removes the session from tracking if it's inactive.
 *
 * @param sessionId - The session ID to clear todos for
 */
export function clearSessionTodos(sessionId: string): void {
  console.log(`[Dashboard] Clearing todos for session: ${sessionId}`);
  state.sessionTodos.delete(sessionId);

  // Update display if this is the current/selected session
  if (state.currentSessionId === sessionId || state.selectedSession === sessionId) {
    state.todos = [];
    elements.todoCount.textContent = '0';
    renderTodoPanel();
  }

  // Remove session from tracking if it's no longer active
  const session = state.sessions.get(sessionId);
  if (session && !session.active) {
    state.sessions.delete(sessionId);
  }

  saveTodosToStorage();

  // Use callbacks for UI updates that would cause circular imports
  if (callbacks) {
    callbacks.updateSessionFilter();
    callbacks.showToast('Session todos cleared', 'success');
  }
}

// ============================================
// Todo Panel Rendering
// ============================================

/**
 * Render the TODO panel with current todo items.
 * Includes a progress bar showing completion percentage.
 */
export function renderTodoPanel(): void {
  if (state.todos.length === 0) {
    // Show different message based on whether "All" sessions is selected
    const message = state.selectedSession === 'all' && state.sessions.size > 0
      ? 'Select a session to view its todos'
      : 'No active tasks';

    elements.todoContent.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">📋</div>
        <p class="empty-state-title">${message}</p>
        <p class="empty-state-subtitle">Todo items will appear here</p>
      </div>
    `;
    return;
  }

  // Calculate progress
  const total = state.todos.length;
  const completed = state.todos.filter((t) => t.status === 'completed').length;
  const percentage = Math.round((completed / total) * 100);

  // Build progress bar HTML
  const progressHtml = `
    <div class="todo-progress">
      <div class="todo-progress-bar">
        <div class="todo-progress-fill" style="width: ${percentage}%"></div>
      </div>
      <span class="todo-progress-text">${completed}/${total}</span>
    </div>
  `;

  // Build todo items HTML
  const itemsHtml = state.todos.map((todo, index) => {
    const statusClass = `todo-status-${todo.status}`;
    // Add completed class for strikethrough styling
    let itemClass = 'todo-item';
    if (todo.status === 'in_progress') {
      itemClass += ' todo-item-active';
    } else if (todo.status === 'completed') {
      itemClass += ' todo-item-completed';
    }

    // Choose the display text based on status
    const displayText = todo.status === 'in_progress' ? todo.activeForm : todo.content;

    return `
      <div class="${itemClass}" data-index="${index}">
        <span class="todo-status ${statusClass}"></span>
        <span class="todo-content">${escapeHtml(displayText)}</span>
      </div>
    `;
  }).join('');

  elements.todoContent.innerHTML = progressHtml + itemsHtml;
}
