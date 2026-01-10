/**
 * Export Modal Component
 *
 * Modal dialog for exporting session data as markdown.
 * Allows user to specify the export file path.
 */

import { state } from '../state';
import {
  extractSessionData,
  formatAsMarkdown,
  getSuggestedExportPath,
} from '../utils/markdown-export';

/**
 * Callbacks for export modal operations.
 */
export interface ExportModalCallbacks {
  showToast: (message: string, type: 'success' | 'error' | 'info', duration?: number) => void;
  announceStatus: (message: string) => void;
}

/**
 * Registered callbacks.
 */
let callbacks: ExportModalCallbacks | null = null;

/**
 * Modal element reference, created lazily on first open.
 */
let modalElement: HTMLElement | null = null;

/**
 * Track if modal is currently open.
 */
let isOpen = false;

/**
 * Initialize the export modal with callbacks.
 *
 * @param cbs - Callback functions for toasts and announcements
 */
export function initExportModal(cbs: ExportModalCallbacks): void {
  callbacks = cbs;
}

/**
 * Create the modal element on first use.
 */
function createModal(): HTMLElement {
  // Create backdrop
  const backdrop = document.createElement('div');
  backdrop.className = 'export-modal-backdrop';
  backdrop.setAttribute('role', 'dialog');
  backdrop.setAttribute('aria-modal', 'true');
  backdrop.setAttribute('aria-labelledby', 'export-modal-title');

  // Create modal content container
  const modal = document.createElement('div');
  modal.className = 'export-modal';

  // Create header
  const header = document.createElement('div');
  header.className = 'export-modal-header';

  const title = document.createElement('h3');
  title.id = 'export-modal-title';
  title.className = 'export-modal-title';
  title.textContent = 'Export as Markdown';

  const closeBtn = document.createElement('button');
  closeBtn.className = 'export-modal-close';
  closeBtn.setAttribute('aria-label', 'Close export modal');
  closeBtn.innerHTML = '&times;';
  closeBtn.addEventListener('click', closeExportModal);

  header.appendChild(title);
  header.appendChild(closeBtn);

  // Create body
  const body = document.createElement('div');
  body.className = 'export-modal-body';

  // Description
  const description = document.createElement('p');
  description.className = 'export-modal-description';
  description.textContent = 'Export the current session data as a formatted markdown file.';

  // Path input group
  const inputGroup = document.createElement('div');
  inputGroup.className = 'export-modal-input-group';

  const label = document.createElement('label');
  label.className = 'export-modal-label';
  label.htmlFor = 'export-path-input';
  label.textContent = 'Save to:';

  const input = document.createElement('input');
  input.type = 'text';
  input.id = 'export-path-input';
  input.className = 'export-modal-input';
  input.placeholder = '/path/to/export.md';
  input.autocomplete = 'off';
  input.spellcheck = false;

  // Handle Enter key to submit
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      handleExport();
    }
  });

  const hint = document.createElement('p');
  hint.className = 'export-modal-hint';
  hint.textContent = 'Path must be absolute and end with .md';

  inputGroup.appendChild(label);
  inputGroup.appendChild(input);
  inputGroup.appendChild(hint);

  // Session info
  const sessionInfo = document.createElement('div');
  sessionInfo.className = 'export-modal-session-info';
  sessionInfo.id = 'export-session-info';
  // Will be populated when modal opens

  body.appendChild(description);
  body.appendChild(inputGroup);
  body.appendChild(sessionInfo);

  // Create footer with buttons
  const footer = document.createElement('div');
  footer.className = 'export-modal-footer';

  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'btn btn-secondary';
  cancelBtn.textContent = 'Cancel';
  cancelBtn.addEventListener('click', closeExportModal);

  const exportBtn = document.createElement('button');
  exportBtn.className = 'btn btn-primary';
  exportBtn.id = 'export-modal-submit';
  exportBtn.textContent = 'Export';
  exportBtn.addEventListener('click', handleExport);

  footer.appendChild(cancelBtn);
  footer.appendChild(exportBtn);

  // Assemble modal
  modal.appendChild(header);
  modal.appendChild(body);
  modal.appendChild(footer);
  backdrop.appendChild(modal);

  // Close on backdrop click (outside modal)
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) {
      closeExportModal();
    }
  });

  return backdrop;
}

/**
 * Update session info display in the modal.
 */
function updateSessionInfo(): void {
  const infoEl = document.getElementById('export-session-info');
  if (!infoEl) return;

  const sessionId = state.selectedSession !== 'all' ? state.selectedSession : state.currentSessionId;
  const session = sessionId ? state.sessions.get(sessionId) : null;

  // Count data to be exported
  const thinkingCount = document.querySelectorAll(
    sessionId && sessionId !== 'all'
      ? `.thinking-entry[data-session="${sessionId}"]`
      : '.thinking-entry'
  ).length;

  const toolCount = document.querySelectorAll(
    sessionId && sessionId !== 'all'
      ? `.tool-entry[data-session="${sessionId}"]`
      : '.tool-entry'
  ).length;

  const todoCount = state.todos.length;

  const hookCount = document.querySelectorAll(
    sessionId && sessionId !== 'all'
      ? `.hook-entry[data-session="${sessionId}"]`
      : '.hook-entry'
  ).length;

  let html = '<div class="export-stats">';
  html += '<span class="export-stat-label">Data to export:</span>';
  html += '<div class="export-stat-items">';
  html += `<span class="export-stat">${thinkingCount} thinking blocks</span>`;
  html += `<span class="export-stat">${toolCount} tool calls</span>`;
  html += `<span class="export-stat">${todoCount} todos</span>`;
  html += `<span class="export-stat">${hookCount} hooks</span>`;
  html += '</div>';
  html += '</div>';

  if (session) {
    html += `<div class="export-session-name">Session: ${session.workingDirectory || sessionId?.slice(0, 8) || 'unknown'}</div>`;
  } else if (state.selectedSession === 'all') {
    html += '<div class="export-session-name">Exporting all sessions</div>';
  }

  infoEl.innerHTML = html;
}

/**
 * Handle the export action.
 */
async function handleExport(): Promise<void> {
  const input = document.getElementById('export-path-input') as HTMLInputElement;
  const submitBtn = document.getElementById('export-modal-submit') as HTMLButtonElement;

  if (!input || !submitBtn) return;

  const path = input.value.trim();

  // Validate path
  if (!path) {
    if (callbacks) {
      callbacks.showToast('Please enter a file path', 'error');
    }
    input.focus();
    return;
  }

  if (!path.startsWith('/')) {
    if (callbacks) {
      callbacks.showToast('Path must be absolute (start with /)', 'error');
    }
    input.focus();
    return;
  }

  if (!path.endsWith('.md')) {
    if (callbacks) {
      callbacks.showToast('File must have .md extension', 'error');
    }
    input.focus();
    return;
  }

  // Disable button and show loading state
  submitBtn.disabled = true;
  submitBtn.textContent = 'Exporting...';

  try {
    // Extract and format data
    const data = extractSessionData();
    const markdown = formatAsMarkdown(data);

    // Send to server
    const response = await fetch('http://localhost:3355/export-markdown', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path, content: markdown }),
    });

    const result = await response.json();

    if (result.success) {
      if (callbacks) {
        callbacks.showToast(`Exported to ${result.path}`, 'success', 5000);
        callbacks.announceStatus('Export successful');
      }
      closeExportModal();
    } else {
      if (callbacks) {
        callbacks.showToast(result.error || 'Export failed', 'error');
      }
    }
  } catch (error) {
    console.error('[Export] Failed:', error);
    if (callbacks) {
      callbacks.showToast('Export failed. Check console for details.', 'error');
    }
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Export';
  }
}

/**
 * Open the export modal.
 */
export function openExportModal(): void {
  if (isOpen) return;

  // Create modal lazily on first open
  if (!modalElement) {
    modalElement = createModal();
    document.body.appendChild(modalElement);
  }

  // Set suggested path
  const input = document.getElementById('export-path-input') as HTMLInputElement;
  if (input) {
    // Expand ~ to home directory for display
    let suggestedPath = getSuggestedExportPath();
    if (suggestedPath.startsWith('~/')) {
      // We can't expand ~ on the client, but the server will handle it
      // For now, suggest a path based on session working directory if available
      const sessionId = state.selectedSession !== 'all' ? state.selectedSession : state.currentSessionId;
      const session = sessionId ? state.sessions.get(sessionId) : null;
      if (session?.workingDirectory) {
        suggestedPath = suggestedPath.replace('~/', session.workingDirectory + '/');
      }
    }
    input.value = suggestedPath;
  }

  // Update session info
  updateSessionInfo();

  // Show modal
  modalElement.classList.add('visible');
  isOpen = true;

  // Focus input for keyboard navigation
  if (input) {
    input.focus();
    input.select();
  }

  // Add escape key handler
  document.addEventListener('keydown', handleEscapeKey);

  console.log('[Export] Modal opened');
}

/**
 * Close the export modal.
 */
export function closeExportModal(): void {
  if (!isOpen || !modalElement) return;

  modalElement.classList.remove('visible');
  isOpen = false;

  // Remove escape key handler
  document.removeEventListener('keydown', handleEscapeKey);

  console.log('[Export] Modal closed');
}

/**
 * Toggle the export modal open/closed.
 */
export function toggleExportModal(): void {
  if (isOpen) {
    closeExportModal();
  } else {
    openExportModal();
  }
}

/**
 * Check if the export modal is open.
 */
export function isExportModalOpen(): boolean {
  return isOpen;
}

/**
 * Handle Escape key to close modal.
 */
function handleEscapeKey(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    closeExportModal();
  }
}
