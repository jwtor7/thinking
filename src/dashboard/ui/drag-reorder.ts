/**
 * Drag-to-Reorder for Collapsed Panels
 *
 * Allows users to reorder collapsed panels by dragging them to new positions.
 * Only collapsed panels can be dragged, preserving focus on content for expanded panels.
 */

import { elements } from './elements.ts';
import { rebuildResizers } from './resizer.ts';

interface DragState {
  isDragging: boolean;
  draggedPanel: HTMLElement | null;
  placeholder: HTMLElement | null;
  startY: number;
  offsetY: number;
}

const dragState: DragState = {
  isDragging: false,
  draggedPanel: null,
  placeholder: null,
  startY: 0,
  offsetY: 0,
};

/**
 * Initialize drag-to-reorder functionality.
 * Sets up event listeners on panel headers for collapsed panels.
 */
export function initDragReorder(): void {
  const panelsContainer = elements.panels;

  // Use event delegation on the panels container
  panelsContainer.addEventListener('mousedown', handleMouseDown);
  document.addEventListener('mousemove', handleMouseMove);
  document.addEventListener('mouseup', handleMouseUp);
}

function handleMouseDown(e: MouseEvent): void {
  const target = e.target as HTMLElement;

  // Only start drag from panel header (not collapse button or other controls)
  const header = target.closest('.panel-header') as HTMLElement | null;
  if (!header) return;

  // Don't start drag if clicking on controls
  if (target.closest('.panel-collapse-btn, .panel-filter, .panel-badge, .plan-selector-wrapper, .plan-actions')) {
    return;
  }

  const panel = header.closest('.panel') as HTMLElement | null;
  if (!panel) return;

  // Only allow dragging collapsed panels
  if (!panel.classList.contains('collapsed')) return;

  e.preventDefault();
  startDrag(panel, e.clientY);
}

function startDrag(panel: HTMLElement, clientY: number): void {
  dragState.isDragging = true;
  dragState.draggedPanel = panel;

  // Store offset within the panel header
  const rect = panel.getBoundingClientRect();
  dragState.startY = clientY;
  dragState.offsetY = clientY - rect.top;

  // Create placeholder to maintain layout
  const placeholder = document.createElement('div');
  placeholder.className = 'drag-placeholder';
  placeholder.style.height = `${rect.height}px`;
  dragState.placeholder = placeholder;

  // Insert placeholder before panel
  panel.parentNode?.insertBefore(placeholder, panel);

  // Style dragged panel
  panel.classList.add('dragging');
  panel.style.position = 'fixed';
  panel.style.width = `${rect.width}px`;
  panel.style.top = `${rect.top}px`;
  panel.style.left = `${rect.left}px`;
  panel.style.zIndex = '1000';
  panel.style.pointerEvents = 'none';

  // Add body class for cursor
  document.body.classList.add('dragging-panel');
}

function handleMouseMove(e: MouseEvent): void {
  if (!dragState.isDragging || !dragState.draggedPanel || !dragState.placeholder) return;

  const panel = dragState.draggedPanel;

  // Move the dragged panel with the mouse
  panel.style.top = `${e.clientY - dragState.offsetY}px`;

  // Find drop target
  const panelsContainer = elements.panels;
  const allPanels = Array.from(panelsContainer.querySelectorAll(':scope > .panel:not(.dragging)'));
  const placeholder = dragState.placeholder;

  // Find where to insert placeholder based on mouse position
  let insertBefore: Element | null = null;

  for (const otherPanel of allPanels) {
    const rect = otherPanel.getBoundingClientRect();
    const midY = rect.top + rect.height / 2;

    if (e.clientY < midY) {
      insertBefore = otherPanel;
      break;
    }
  }

  // Move placeholder to new position
  if (insertBefore && insertBefore !== placeholder.nextElementSibling) {
    // Skip any resizer before the insert target
    let target: Element = insertBefore;
    const prev = insertBefore.previousElementSibling;
    if (prev?.classList.contains('resizer-vertical')) {
      target = prev;
    }
    panelsContainer.insertBefore(placeholder, target);
  } else if (!insertBefore) {
    // Append to end (after last panel or resizer)
    panelsContainer.appendChild(placeholder);
  }
}

function handleMouseUp(): void {
  if (!dragState.isDragging || !dragState.draggedPanel || !dragState.placeholder) return;

  const panel = dragState.draggedPanel;
  const placeholder = dragState.placeholder;

  // Reset panel styles
  panel.classList.remove('dragging');
  panel.style.position = '';
  panel.style.width = '';
  panel.style.top = '';
  panel.style.left = '';
  panel.style.zIndex = '';
  panel.style.pointerEvents = '';

  // Move panel to placeholder position
  placeholder.parentNode?.insertBefore(panel, placeholder);

  // Remove placeholder
  placeholder.remove();

  // Remove body class
  document.body.classList.remove('dragging-panel');

  // Reset state
  dragState.isDragging = false;
  dragState.draggedPanel = null;
  dragState.placeholder = null;

  // Re-initialize resizers since DOM order changed
  rebuildResizers();
}
