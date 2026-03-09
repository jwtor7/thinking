/**
 * Export Modal - Modal Lifecycle
 *
 * Modal dialog creation, focus trap, open/close lifecycle,
 * export logic, and button state management.
 */

import { state } from '../../state.ts';
import { elements } from '../elements.ts';
import { extractSessionData, formatAsMarkdown, ExportOptions } from '../../utils/markdown-export.ts';
import { browseDirectory, escapeHtml, getCurrentDirectory } from './browser.ts';

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
 * Previously focused element, restored on close.
 */
let previouslyFocused: HTMLElement | null = null;

/**
 * Export content options (what to include).
 */
const exportOptions: ExportOptions = {
  includeThinking: true,
  includeTools: true,
  includeHooks: true,
};

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

  // Content options section
  const optionsSection = document.createElement('div');
  optionsSection.className = 'export-options-section';

  const optionsLabel = document.createElement('label');
  optionsLabel.className = 'export-modal-label';
  optionsLabel.textContent = 'Include:';

  const optionsGrid = document.createElement('div');
  optionsGrid.className = 'export-options-grid';

  const optionItems = [
    { id: 'thinking', label: 'Thinking blocks', key: 'includeThinking' as const },
    { id: 'tools', label: 'Tool calls', key: 'includeTools' as const },
    { id: 'hooks', label: 'Hooks', key: 'includeHooks' as const },
  ];

  optionItems.forEach((opt) => {
    const item = document.createElement('label');
    item.className = 'export-option-item';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.id = `export-option-${opt.id}`;
    checkbox.checked = exportOptions[opt.key];
    checkbox.addEventListener('change', () => {
      exportOptions[opt.key] = checkbox.checked;
    });

    const labelText = document.createElement('span');
    labelText.textContent = opt.label;

    item.appendChild(checkbox);
    item.appendChild(labelText);
    optionsGrid.appendChild(item);
  });

  optionsSection.appendChild(optionsLabel);
  optionsSection.appendChild(optionsGrid);

  // File browser section
  const browserSection = document.createElement('div');
  browserSection.className = 'export-browser-section';

  // Browser header with path display
  const browserHeader = document.createElement('div');
  browserHeader.className = 'export-browser-header';

  const pathLabel = document.createElement('label');
  pathLabel.className = 'export-modal-label';
  pathLabel.textContent = 'Location:';

  const pathDisplay = document.createElement('div');
  pathDisplay.className = 'export-browser-path';
  pathDisplay.id = 'export-browser-path';

  browserHeader.appendChild(pathLabel);
  browserHeader.appendChild(pathDisplay);

  // Browser listing
  const browserList = document.createElement('div');
  browserList.className = 'export-browser-list';
  browserList.id = 'export-browser-list';

  browserSection.appendChild(browserHeader);
  browserSection.appendChild(browserList);

  // Filename input group
  const inputGroup = document.createElement('div');
  inputGroup.className = 'export-modal-input-group';

  const label = document.createElement('label');
  label.className = 'export-modal-label';
  label.htmlFor = 'export-filename-input';
  label.textContent = 'Filename:';

  const inputWrapper = document.createElement('div');
  inputWrapper.className = 'export-filename-wrapper';

  const input = document.createElement('input');
  input.type = 'text';
  input.id = 'export-filename-input';
  input.className = 'export-modal-input';
  input.placeholder = 'session-export';
  input.autocomplete = 'off';
  input.spellcheck = false;

  const extension = document.createElement('span');
  extension.className = 'export-filename-extension';
  extension.textContent = '.md';

  inputWrapper.appendChild(input);
  inputWrapper.appendChild(extension);

  // Handle Enter key to submit
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      handleExport();
    }
  });

  const hint = document.createElement('p');
  hint.className = 'export-modal-hint';
  hint.textContent = 'Files are saved as markdown (.md)';

  inputGroup.appendChild(label);
  inputGroup.appendChild(inputWrapper);
  inputGroup.appendChild(hint);

  // Session info
  const sessionInfo = document.createElement('div');
  sessionInfo.className = 'export-modal-session-info';
  sessionInfo.id = 'export-session-info';
  // Will be populated when modal opens

  body.appendChild(description);
  body.appendChild(optionsSection);
  body.appendChild(browserSection);
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
  html += `<span class="export-stat">${hookCount} hooks</span>`;
  html += '</div>';
  html += '</div>';

  if (session) {
    html += `<div class="export-session-name">Session: ${escapeHtml(session.workingDirectory || sessionId?.slice(0, 8) || 'unknown')}</div>`;
  } else if (state.selectedSession === 'all') {
    html += '<div class="export-session-name">Exporting all sessions</div>';
  }

  infoEl.innerHTML = html;
}

/**
 * Get the full export path from current directory and filename.
 */
function getFullExportPath(): string {
  const input = document.getElementById('export-filename-input') as HTMLInputElement;
  if (!input) return '';

  const filename = input.value.trim();
  if (!filename) return '';

  // Ensure .md extension
  const fullFilename = filename.endsWith('.md') ? filename : `${filename}.md`;

  return `${getCurrentDirectory()}/${fullFilename}`;
}

/**
 * Handle the export action.
 */
async function handleExport(): Promise<void> {
  const input = document.getElementById('export-filename-input') as HTMLInputElement;
  const submitBtn = document.getElementById('export-modal-submit') as HTMLButtonElement;

  if (!input || !submitBtn) return;

  const filename = input.value.trim();

  // Validate filename
  if (!filename) {
    if (callbacks) {
      callbacks.showToast('Please enter a filename', 'error');
    }
    input.focus();
    return;
  }

  // Check for invalid characters in filename
  if (/[/\\:*?"<>|]/.test(filename)) {
    if (callbacks) {
      callbacks.showToast('Filename contains invalid characters', 'error');
    }
    input.focus();
    return;
  }

  const path = getFullExportPath();
  if (!path) {
    if (callbacks) {
      callbacks.showToast('Invalid export path', 'error');
    }
    return;
  }

  // Disable button and show loading state
  submitBtn.disabled = true;
  submitBtn.textContent = 'Exporting...';

  try {
    // Extract and format data
    const data = extractSessionData(exportOptions);
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

      // Reveal the exported file in Finder
      if (result.path) {
        try {
          const revealResponse = await fetch('http://localhost:3355/api/reveal-file', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path: result.path }),
          });
          const revealResult = await revealResponse.json();
          if (!revealResult.success) {
            console.warn('[Export] Failed to reveal file:', revealResult.error);
          }
        } catch (revealError) {
          console.warn('[Export] Failed to reveal file:', revealError);
        }
      }
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
 * Get the initial directory for the file browser.
 * Uses session working directory if available, otherwise home directory.
 */
function getInitialDirectory(): string {
  const sessionId = state.selectedSession !== 'all' ? state.selectedSession : state.currentSessionId;
  const session = sessionId ? state.sessions.get(sessionId) : null;

  if (session?.workingDirectory) {
    return session.workingDirectory;
  }

  // Fall back to home directory
  return '~';
}

/**
 * Get the suggested filename for export.
 */
function getSuggestedFilename(): string {
  const sessionId = state.selectedSession !== 'all' ? state.selectedSession : state.currentSessionId;

  // Generate timestamp
  const now = new Date();
  const timestamp = now.toISOString().split('T')[0];

  if (sessionId && sessionId !== 'all') {
    return `session-${sessionId.slice(0, 8)}-${timestamp}`;
  }

  return `thinking-export-${timestamp}`;
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

  // Set suggested filename
  const input = document.getElementById('export-filename-input') as HTMLInputElement;
  if (input) {
    input.value = getSuggestedFilename();
  }

  // Update session info
  updateSessionInfo();

  // Show modal first (so elements are visible)
  // Save currently focused element for restoration on close
  previouslyFocused = document.activeElement as HTMLElement | null;

  modalElement.classList.add('visible');
  isOpen = true;

  // Browse initial directory
  const initialDir = getInitialDirectory();
  browseDirectory(initialDir);

  // Focus input for keyboard navigation
  if (input) {
    // Delay focus to after browse completes
    setTimeout(() => {
      input.focus();
      input.select();
    }, 100);
  }

  // Add keyboard handler (escape + focus trap)
  document.addEventListener('keydown', handleModalKeydown);
}

/**
 * Close the export modal.
 */
export function closeExportModal(): void {
  if (!isOpen || !modalElement) return;

  modalElement.classList.remove('visible');
  isOpen = false;

  // Remove keyboard handler
  document.removeEventListener('keydown', handleModalKeydown);

  // Restore focus to the element that opened the modal
  if (previouslyFocused && previouslyFocused.focus) {
    previouslyFocused.focus();
    previouslyFocused = null;
  }
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
 * Handle keyboard events for the modal: Escape to close, Tab to trap focus.
 */
function handleModalKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    closeExportModal();
    return;
  }

  // Focus trap: keep Tab cycling within the modal
  if (event.key === 'Tab' && modalElement) {
    const focusable = modalElement.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [href], input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    if (focusable.length === 0) return;

    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    if (event.shiftKey) {
      if (document.activeElement === first) {
        event.preventDefault();
        last.focus();
      }
    } else {
      if (document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
  }
}

// ============================================
// Export Button State Management
// ============================================

/**
 * Check if export is allowed based on current session selection.
 * Export requires a specific session to be selected (not "All").
 *
 * @returns true if a specific session is selected, false otherwise
 */
export function isExportAllowed(): boolean {
  return state.selectedSession !== 'all';
}

/**
 * Update the export button's enabled/disabled state.
 * Should be called whenever session selection changes.
 */
export function updateExportButtonState(): void {
  const exportBtn = elements.exportBtn as HTMLButtonElement;
  if (!exportBtn) return;

  const allowed = isExportAllowed();

  if (allowed) {
    exportBtn.disabled = false;
    exportBtn.title = 'Export as Markdown (Cmd+E)';
    exportBtn.classList.remove('btn-disabled');
  } else {
    exportBtn.disabled = true;
    exportBtn.title = 'Select a session to export';
    exportBtn.classList.add('btn-disabled');
  }
}

/**
 * Attempt to open the export modal, checking if export is allowed.
 * Shows a toast message if export is not allowed (All sessions selected).
 *
 * @returns true if modal was opened, false if blocked
 */
export function tryOpenExportModal(): boolean {
  if (!isExportAllowed()) {
    if (callbacks) {
      callbacks.showToast('Select a session to export', 'info');
    }
    return false;
  }

  openExportModal();
  return true;
}
