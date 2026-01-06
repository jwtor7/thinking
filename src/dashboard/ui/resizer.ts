/**
 * Resizable Panes
 *
 * Provides drag-to-resize functionality for vertically stacked panels.
 * Creates resize handles between adjacent VISIBLE panels only.
 * Dynamically rebuilds resizers when panel visibility changes.
 */

import { elements } from './elements';

interface ResizeState {
  isResizing: boolean;
  startY: number;
  startHeights: number[];
  resizer: HTMLElement | null;
  targets: HTMLElement[];
}

const resizeState: ResizeState = {
  isResizing: false,
  startY: 0,
  startHeights: [],
  resizer: null,
  targets: [],
};

// Minimum panel height in pixels
const MIN_PANEL_HEIGHT = 80;

/**
 * Initialize resize functionality.
 * Sets up global mouse handlers and builds initial resizers.
 */
export function initResizers(): void {
  // Global mouse event handlers
  document.addEventListener('mousemove', handleMouseMove);
  document.addEventListener('mouseup', handleMouseUp);

  // Handle custom event from drag-reorder when resizers are recreated
  document.addEventListener('resizer-start', ((e: CustomEvent) => {
    e.preventDefault();
    const { clientY, resizer, topPanel, bottomPanel } = e.detail;
    startResize(clientY, resizer, [topPanel, bottomPanel]);
  }) as EventListener);

  // Build initial resizers
  rebuildResizers();
}

/**
 * Check if a panel is currently visible (not collapsed and not session-hidden).
 */
function isPanelVisible(panel: HTMLElement): boolean {
  return !panel.classList.contains('collapsed') && !panel.classList.contains('session-hidden');
}

/**
 * Remove all existing resizers from the DOM.
 */
function removeAllResizers(): void {
  const panelsContainer = elements.panels;
  panelsContainer.querySelectorAll('.resizer-vertical').forEach((r) => r.remove());
}

/**
 * Rebuild resizers based on currently visible panels.
 * Creates resizers only between adjacent visible panels.
 * Call this when panel visibility changes (collapse/expand, session switch).
 */
export function rebuildResizers(): void {
  removeAllResizers();

  const panelsContainer = elements.panels;
  const allPanels = Array.from(panelsContainer.querySelectorAll(':scope > .panel')) as HTMLElement[];

  // Filter to only visible panels
  const visiblePanels = allPanels.filter(isPanelVisible);

  if (visiblePanels.length < 2) return;

  // Create resizers between each pair of adjacent visible panels
  for (let i = 0; i < visiblePanels.length - 1; i++) {
    const topPanel = visiblePanels[i];
    const bottomPanel = visiblePanels[i + 1];

    const resizer = document.createElement('div');
    resizer.className = 'resizer resizer-vertical';
    resizer.setAttribute('aria-hidden', 'true');
    resizer.dataset.topPanel = topPanel.className;
    resizer.dataset.bottomPanel = bottomPanel.className;

    // Insert resizer after the top panel in the DOM
    // But we need to insert it right before the bottom panel to account for any
    // collapsed/hidden panels in between
    bottomPanel.before(resizer);

    resizer.addEventListener('mousedown', createResizerMouseDownHandler(topPanel, bottomPanel, resizer));
  }
}

/**
 * Create a mousedown handler for a resizer.
 */
function createResizerMouseDownHandler(
  topPanel: HTMLElement,
  bottomPanel: HTMLElement,
  resizer: HTMLElement
): (e: MouseEvent) => void {
  return (e: MouseEvent) => {
    e.preventDefault();
    startResize(e.clientY, resizer, [topPanel, bottomPanel]);
  };
}

function startResize(
  startY: number,
  resizer: HTMLElement,
  targets: HTMLElement[]
): void {
  resizeState.isResizing = true;
  resizeState.startY = startY;
  resizeState.resizer = resizer;
  resizeState.targets = targets;

  // Store initial heights
  resizeState.startHeights = targets.map((el) => el.offsetHeight);

  // Add resizing class for cursor
  document.body.classList.add('resizing-vertical');
  resizer.classList.add('active');
}

function handleMouseMove(e: MouseEvent): void {
  if (!resizeState.isResizing) return;

  const { startY, startHeights, targets } = resizeState;
  const delta = e.clientY - startY;

  // Calculate new heights respecting minimum
  const newHeight0 = Math.max(MIN_PANEL_HEIGHT, startHeights[0] + delta);
  const newHeight1 = Math.max(MIN_PANEL_HEIGHT, startHeights[1] - delta);

  // Only apply if both panels are visible
  if (isPanelVisible(targets[0]) && isPanelVisible(targets[1])) {
    // Use flex-grow ratios for responsive behavior
    const total = newHeight0 + newHeight1;
    const ratio0 = newHeight0 / total;
    const ratio1 = newHeight1 / total;

    targets[0].style.flex = `${ratio0} 1 0`;
    targets[1].style.flex = `${ratio1} 1 0`;
  }
}

function handleMouseUp(): void {
  if (!resizeState.isResizing) return;

  document.body.classList.remove('resizing-vertical');
  resizeState.resizer?.classList.remove('active');

  resizeState.isResizing = false;
  resizeState.resizer = null;
  resizeState.targets = [];
}

/**
 * Reset panel flex when toggling collapse state.
 * Call this from panels.ts when collapsing/expanding.
 */
export function resetPanelFlex(panel: HTMLElement): void {
  panel.style.flex = '';
}
