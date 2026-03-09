/**
 * Plan Context Menu
 *
 * Context menu for file actions (open/reveal in Finder),
 * toolbar button handlers.
 */

import { state } from '../../state.ts';
import { elements } from '../../ui/elements.ts';
// ============================================
// Module State
// ============================================

interface ContextMenuCallbacks {
  showToast: (message: string, type: 'success' | 'error' | 'info', duration?: number) => void;
  announceStatus: (message: string) => void;
}

let callbacks: ContextMenuCallbacks | null = null;

export function setContextMenuCallbacks(cbs: ContextMenuCallbacks): void {
  callbacks = cbs;
}

// ============================================
// Context Menu Functions
// ============================================

/**
 * Show the plan context menu at the given position.
 *
 * @param x - X coordinate (clientX)
 * @param y - Y coordinate (clientY)
 * @param filePath - Path to the file for context menu actions
 */
export function showFileContextMenu(x: number, y: number, filePath: string): void {
  state.contextMenuFilePath = filePath;

  const menu = elements.planContextMenu;

  // Position the menu
  menu.style.left = `${x}px`;
  menu.style.top = `${y}px`;

  // Ensure menu stays within viewport
  requestAnimationFrame(() => {
    const rect = menu.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    // Adjust if menu goes off right edge
    if (rect.right > viewportWidth) {
      menu.style.left = `${x - rect.width}px`;
    }

    // Adjust if menu goes off bottom edge
    if (rect.bottom > viewportHeight) {
      menu.style.top = `${y - rect.height}px`;
    }
  });

  menu.classList.add('visible');
}

/**
 * Hide the plan context menu.
 */
export function hidePlanContextMenu(): void {
  elements.planContextMenu.classList.remove('visible');
  state.contextMenuFilePath = null;
}

/**
 * Execute a file action (open or reveal) via the server API.
 *
 * @param action - Action to perform ('open' or 'reveal')
 * @param path - Path to the file
 */
export async function executeFileAction(action: 'open' | 'reveal', path: string): Promise<void> {
  try {
    const response = await fetch('http://localhost:3355/file-action', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ action, path }),
    });

    const result = await response.json();

    if (!result.success) {
      console.error(`[Dashboard] File action failed: ${result.error}`);
      callbacks?.showToast(result.error || 'Action failed', 'error');
    } else {
      // Show success feedback
      const actionText = action === 'open' ? 'Opened in default app' : 'Revealed in Finder';
      callbacks?.showToast(actionText, 'success');
    }
  } catch (error) {
    console.error('[Dashboard] Failed to execute file action:', error);
    callbacks?.showToast('Failed to connect to server', 'error');
  }
}

// ============================================
// Button Handlers
// ============================================

/**
 * Handle toolbar "Open" button click.
 */
export function handlePlanOpenClick(): void {
  if (state.currentPlanPath) {
    executeFileAction('open', state.currentPlanPath);
  }
}

/**
 * Handle toolbar "Reveal" button click.
 */
export function handlePlanRevealClick(): void {
  if (state.currentPlanPath) {
    executeFileAction('reveal', state.currentPlanPath);
  }
}

/**
 * Handle context menu "Open in Default App" action.
 */
export function handleContextMenuOpen(): void {
  if (state.contextMenuFilePath) {
    executeFileAction('open', state.contextMenuFilePath);
  }
  hidePlanContextMenu();
}

/**
 * Handle context menu "Reveal in Finder" action.
 */
export function handleContextMenuReveal(): void {
  if (state.contextMenuFilePath) {
    executeFileAction('reveal', state.contextMenuFilePath);
  }
  hidePlanContextMenu();
}

/**
 * Handle right-click on plan content or selector.
 *
 * @param event - Mouse event from context menu trigger
 */
export function handlePlanContextMenu(event: MouseEvent): void {
  // Only show context menu if we have a current plan
  if (!state.currentPlanPath) {
    return;
  }

  event.preventDefault();
  showFileContextMenu(event.clientX, event.clientY, state.currentPlanPath);
}

/**
 * Handle right-click on a plan option in the selector dropdown.
 *
 * @param event - Mouse event from context menu trigger
 * @param planPath - Path to the plan for context menu actions
 */
export function handlePlanOptionContextMenu(event: MouseEvent, planPath: string): void {
  event.preventDefault();
  event.stopPropagation();
  showFileContextMenu(event.clientX, event.clientY, planPath);
}
