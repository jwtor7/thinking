/**
 * Panel Selector Modal Component
 *
 * Modal UI for toggling panel visibility in the dashboard.
 * Allows users to show/hide individual panels (Thinking, Tools, Todo, Plan).
 */

import { state } from '../state';
import { PanelVisibility } from '../types';
import { elements } from './elements';
import { savePanelVisibility } from '../storage/persistence';
import { rebuildResizers } from './resizer';

/**
 * Panel names mapped to their display labels.
 */
const PANEL_LABELS: Record<keyof PanelVisibility, string> = {
  thinking: 'Thinking',
  tools: 'Tools',
  todo: 'Todo',
  plan: 'Plan',
};

/**
 * Order of panels in the selector UI.
 */
const PANEL_ORDER: (keyof PanelVisibility)[] = ['thinking', 'todo', 'tools', 'plan'];

/**
 * Modal element reference, created lazily on first open.
 */
let modalElement: HTMLElement | null = null;

/**
 * Track if modal is currently open.
 */
let isOpen = false;

/**
 * Callbacks for panel selector operations.
 */
export interface PanelSelectorCallbacks {
  announceStatus: (message: string) => void;
}

/**
 * Registered callbacks.
 */
let callbacks: PanelSelectorCallbacks | null = null;

/**
 * Initialize panel selector with callbacks.
 *
 * @param cbs - Callback functions for announcements
 */
export function initPanelSelector(cbs: PanelSelectorCallbacks): void {
  callbacks = cbs;
}

/**
 * Create the modal element on first use.
 * Modal is created dynamically to avoid cluttering the initial HTML.
 */
function createModal(): HTMLElement {
  // Create backdrop
  const backdrop = document.createElement('div');
  backdrop.className = 'panel-selector-backdrop';
  backdrop.setAttribute('role', 'dialog');
  backdrop.setAttribute('aria-modal', 'true');
  backdrop.setAttribute('aria-labelledby', 'panel-selector-title');

  // Create modal content container
  const modal = document.createElement('div');
  modal.className = 'panel-selector-modal';

  // Create header
  const header = document.createElement('div');
  header.className = 'panel-selector-header';

  const title = document.createElement('h3');
  title.id = 'panel-selector-title';
  title.className = 'panel-selector-title';
  title.textContent = 'Panel Visibility';

  const closeBtn = document.createElement('button');
  closeBtn.className = 'panel-selector-close';
  closeBtn.setAttribute('aria-label', 'Close panel selector');
  closeBtn.innerHTML = '&times;';
  closeBtn.addEventListener('click', closePanelSelector);

  header.appendChild(title);
  header.appendChild(closeBtn);

  // Create checkbox list
  const list = document.createElement('div');
  list.className = 'panel-selector-list';

  for (const panelName of PANEL_ORDER) {
    const item = document.createElement('label');
    item.className = 'panel-selector-item';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'panel-selector-checkbox';
    checkbox.id = `panel-visibility-${panelName}`;
    checkbox.checked = state.panelVisibility[panelName];
    checkbox.addEventListener('change', () => {
      handlePanelToggle(panelName, checkbox.checked);
    });

    const label = document.createElement('span');
    label.className = 'panel-selector-label';
    label.textContent = PANEL_LABELS[panelName];

    item.appendChild(checkbox);
    item.appendChild(label);
    list.appendChild(item);
  }

  // Assemble modal
  modal.appendChild(header);
  modal.appendChild(list);
  backdrop.appendChild(modal);

  // Close on backdrop click (outside modal)
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) {
      closePanelSelector();
    }
  });

  return backdrop;
}

/**
 * Handle panel visibility toggle.
 *
 * @param panelName - The panel to toggle
 * @param visible - Whether the panel should be visible
 */
function handlePanelToggle(panelName: keyof PanelVisibility, visible: boolean): void {
  state.panelVisibility[panelName] = visible;

  // Update DOM - show/hide the panel
  applyPanelVisibility(panelName, visible);

  // Rebuild resizers for visible panels
  rebuildResizers();

  // Persist to localStorage
  savePanelVisibility();

  // Announce for screen readers
  if (callbacks) {
    callbacks.announceStatus(`${PANEL_LABELS[panelName]} panel ${visible ? 'shown' : 'hidden'}`);
  }

  console.log(`[PanelSelector] ${panelName} panel ${visible ? 'shown' : 'hidden'}`);
}

/**
 * Apply panel visibility to DOM.
 *
 * @param panelName - The panel to update
 * @param visible - Whether the panel should be visible
 */
export function applyPanelVisibility(panelName: keyof PanelVisibility, visible: boolean): void {
  const panelElements: Record<keyof PanelVisibility, HTMLElement | null> = {
    thinking: elements.thinkingPanel,
    todo: elements.todoPanel,
    tools: elements.toolsPanel,
    plan: elements.planPanel,
  };

  const panel = panelElements[panelName];
  if (panel) {
    if (visible) {
      panel.classList.remove('panel-hidden');
      panel.style.display = '';
    } else {
      panel.classList.add('panel-hidden');
      panel.style.display = 'none';
    }
  }
}

/**
 * Apply all panel visibility states to DOM.
 * Called during initialization to restore saved state.
 */
export function applyAllPanelVisibility(): void {
  for (const panelName of PANEL_ORDER) {
    applyPanelVisibility(panelName, state.panelVisibility[panelName]);
  }
  rebuildResizers();
}

/**
 * Sync modal checkboxes with current state.
 * Called when modal opens to ensure UI reflects current state.
 */
function syncCheckboxes(): void {
  for (const panelName of PANEL_ORDER) {
    const checkbox = document.getElementById(`panel-visibility-${panelName}`) as HTMLInputElement | null;
    if (checkbox) {
      checkbox.checked = state.panelVisibility[panelName];
    }
  }
}

/**
 * Open the panel selector modal.
 */
export function openPanelSelector(): void {
  if (isOpen) return;

  // Create modal lazily on first open
  if (!modalElement) {
    modalElement = createModal();
    document.body.appendChild(modalElement);
  }

  // Sync checkboxes with current state
  syncCheckboxes();

  // Show modal
  modalElement.classList.add('visible');
  isOpen = true;

  // Focus first checkbox for keyboard navigation
  const firstCheckbox = modalElement.querySelector('.panel-selector-checkbox') as HTMLInputElement | null;
  if (firstCheckbox) {
    firstCheckbox.focus();
  }

  // Add escape key handler
  document.addEventListener('keydown', handleEscapeKey);

  console.log('[PanelSelector] Modal opened');
}

/**
 * Close the panel selector modal.
 */
export function closePanelSelector(): void {
  if (!isOpen || !modalElement) return;

  modalElement.classList.remove('visible');
  isOpen = false;

  // Remove escape key handler
  document.removeEventListener('keydown', handleEscapeKey);

  console.log('[PanelSelector] Modal closed');
}

/**
 * Toggle the panel selector modal open/closed.
 */
export function togglePanelSelector(): void {
  if (isOpen) {
    closePanelSelector();
  } else {
    openPanelSelector();
  }
}

/**
 * Check if the panel selector modal is open.
 */
export function isPanelSelectorOpen(): boolean {
  return isOpen;
}

/**
 * Handle Escape key to close modal.
 */
function handleEscapeKey(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    closePanelSelector();
  }
}
