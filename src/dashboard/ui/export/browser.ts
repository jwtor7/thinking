/**
 * Export Modal - File Browser
 *
 * Directory navigation and file selection for the export modal.
 */

/**
 * Directory entry from browse API.
 */
interface BrowseEntry {
  name: string;
  type: 'file' | 'directory';
}

/**
 * Response from browse API.
 */
interface BrowseResponse {
  success: boolean;
  error?: string;
  path?: string;
  parent?: string | null;
  entries?: BrowseEntry[];
}

/**
 * Current directory being browsed.
 */
let currentDirectory = '';

/**
 * Parent directory path (for going up).
 */
let parentDirectory: string | null = null;

/**
 * Get the current directory path.
 */
export function getCurrentDirectory(): string {
  return currentDirectory;
}

/**
 * Reset browser state (called when modal opens with a new initial directory).
 */
export function resetBrowserState(): void {
  currentDirectory = '';
  parentDirectory = null;
}

/**
 * Escape HTML special characters.
 */
export function escapeHtml(str: string): string {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

/**
 * Escape attribute value.
 */
function escapeAttr(str: string): string {
  return str.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/**
 * Browse a directory and update the file browser UI.
 */
export async function browseDirectory(path: string): Promise<void> {
  const listEl = document.getElementById('export-browser-list');
  const pathEl = document.getElementById('export-browser-path');

  if (!listEl || !pathEl) return;

  // Show loading state
  listEl.innerHTML = '<div class="export-browser-loading">Loading...</div>';

  try {
    const response = await fetch(
      `http://localhost:3355/api/browse?path=${encodeURIComponent(path)}`
    );
    const data: BrowseResponse = await response.json();

    if (!data.success) {
      listEl.innerHTML = `<div class="export-browser-error">${escapeHtml(data.error || 'Failed to browse directory')}</div>`;
      return;
    }

    // Update current state
    currentDirectory = data.path || path;
    parentDirectory = data.parent || null;

    // Update path display
    pathEl.textContent = currentDirectory;
    pathEl.title = currentDirectory;

    // Build list HTML
    let html = '';

    // Parent directory button
    if (parentDirectory) {
      html += `<button class="export-browser-item export-browser-parent" data-path="${escapeAttr(parentDirectory)}" data-type="directory">
        <span class="export-browser-icon">&#8593;</span>
        <span class="export-browser-name">..</span>
      </button>`;
    }

    // Directory and file entries
    const entries = data.entries || [];
    for (const entry of entries) {
      const fullPath = `${currentDirectory}/${entry.name}`;
      const icon = entry.type === 'directory' ? '&#128193;' : '&#128196;';
      const itemClass = entry.type === 'directory' ? 'export-browser-folder' : 'export-browser-file';

      html += `<button class="export-browser-item ${itemClass}" data-path="${escapeAttr(fullPath)}" data-type="${entry.type}" data-name="${escapeAttr(entry.name)}">
        <span class="export-browser-icon">${icon}</span>
        <span class="export-browser-name">${escapeHtml(entry.name)}</span>
      </button>`;
    }

    if (entries.length === 0 && !parentDirectory) {
      html += '<div class="export-browser-empty">No folders or .md files</div>';
    } else if (entries.length === 0) {
      html += '<div class="export-browser-empty">Empty directory</div>';
    }

    listEl.innerHTML = html;

    // Add click handlers
    const items = listEl.querySelectorAll('.export-browser-item');
    items.forEach((item) => {
      item.addEventListener('click', handleBrowserItemClick);
    });
  } catch (error) {
    console.error('[Export] Browse error:', error);
    listEl.innerHTML = '<div class="export-browser-error">Failed to connect to server</div>';
  }
}

/**
 * Handle click on a browser item (folder or file).
 */
function handleBrowserItemClick(event: Event): void {
  const target = event.currentTarget as HTMLElement;
  const path = target.dataset.path;
  const type = target.dataset.type;
  const name = target.dataset.name;

  if (!path) return;

  if (type === 'directory') {
    // Navigate into directory
    browseDirectory(path);
  } else if (type === 'file' && name) {
    // Select file - set filename (without .md extension)
    const input = document.getElementById('export-filename-input') as HTMLInputElement;
    if (input && name.endsWith('.md')) {
      input.value = name.slice(0, -3);
      input.focus();
    }
  }
}
