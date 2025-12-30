/**
 * Keyboard Shortcut Management
 *
 * Handles all keyboard shortcuts for the Thinking Monitor dashboard.
 * Shortcuts include panel navigation, view selection, filters, and actions.
 */

import { state } from '../state';
import { elements } from './elements';
import { selectView, ViewType } from './views';
import { togglePanelCollapse, PanelName } from './panels';
import { filterAllThinking, filterAllTools } from './filters';

/**
 * Callbacks for keyboard actions that need to be provided by app.ts.
 * These functions are defined in app.ts and passed during initialization.
 */
export interface KeyboardCallbacks {
  /** Clear all panels content */
  clearAllPanels: () => void;
  /** Open the current plan in default application */
  handlePlanOpenClick: () => void;
  /** Reveal the current plan in Finder */
  handlePlanRevealClick: () => void;
}

/**
 * Registered callbacks for keyboard actions.
 * Set via initKeyboard().
 */
let callbacks: KeyboardCallbacks | null = null;

/**
 * Initialize keyboard handling with the provided callbacks.
 * Must be called once during app startup.
 *
 * @param cbs - Callback functions for keyboard actions
 */
export function initKeyboard(cbs: KeyboardCallbacks): void {
  callbacks = cbs;
  document.addEventListener('keydown', handleKeydown);
}

/**
 * Handle keydown events for keyboard shortcuts.
 *
 * Shortcuts:
 * - 'c' - Clear all panels
 * - 's' - Toggle auto-scroll
 * - '/' - Focus thinking filter
 * - 'Escape' - Clear filters and blur
 * - Shift+T/O/D/P - Toggle panel collapse (Thinking/Tools/Todo/Plan)
 * - A/T/O/D/P (without shift) - Select view (All/Thinking/Tools/Todo/Plan)
 * - Cmd/Ctrl+O - Open plan in default app
 * - Cmd/Ctrl+Shift+R - Reveal plan in Finder
 *
 * @param event - The keyboard event
 */
export function handleKeydown(event: KeyboardEvent): void {
  // Check if user is typing in an input field
  const activeElement = document.activeElement;
  const isInputFocused = activeElement instanceof HTMLInputElement ||
                         activeElement instanceof HTMLTextAreaElement ||
                         activeElement?.getAttribute('contenteditable') === 'true';

  if (isInputFocused) {
    // Only allow Escape to blur, ignore other shortcuts
    if (event.key === 'Escape') {
      (activeElement as HTMLElement).blur();
      event.preventDefault();
    }
    return; // Don't process other shortcuts when typing
  }

  // Enable keyboard mode indicator
  if (!state.keyboardMode) {
    state.keyboardMode = true;
    document.body.classList.add('keyboard-mode');
  }

  // 'c' to clear
  if (event.key === 'c' && !event.ctrlKey && !event.metaKey) {
    if (callbacks) {
      callbacks.clearAllPanels();
    }
    return;
  }

  // 's' to toggle auto-scroll
  if (event.key === 's' && !event.ctrlKey && !event.metaKey) {
    state.autoScroll = !state.autoScroll;
    elements.autoScrollCheckbox.checked = state.autoScroll;
    state.userScrolledUp = false;
    return;
  }

  // '/' to focus thinking filter
  if (event.key === '/') {
    event.preventDefault();
    elements.thinkingFilter.focus();
    return;
  }

  // Escape to clear filters and blur
  if (event.key === 'Escape') {
    state.thinkingFilter = '';
    state.toolsFilter = '';
    elements.thinkingFilter.value = '';
    elements.toolsFilter.value = '';
    filterAllThinking();
    filterAllTools();
    (document.activeElement as HTMLElement)?.blur();
    return;
  }

  // Panel collapse shortcuts (Shift + t/o/d/p)
  if (event.shiftKey && !event.ctrlKey && !event.metaKey) {
    switch (event.key.toLowerCase()) {
      case 't':
        event.preventDefault();
        togglePanelCollapse('thinking');
        return;
      case 'o':
        event.preventDefault();
        togglePanelCollapse('tools');
        return;
      case 'd':
        event.preventDefault();
        togglePanelCollapse('todo');
        return;
      case 'p':
        event.preventDefault();
        togglePanelCollapse('plan');
        return;
    }
  }

  // View navigation shortcuts (without Shift)
  if (!event.ctrlKey && !event.metaKey && !event.shiftKey) {
    switch (event.key.toLowerCase()) {
      case 'a':
        selectView('all');
        return;
      case 't':
        selectView('thinking');
        return;
      case 'o':
        selectView('tools');
        return;
      case 'd':
        selectView('todo');
        return;
      case 'p':
        selectView('plan');
        return;
    }
  }

  // Plan file actions with Cmd/Ctrl modifiers
  if (event.metaKey || event.ctrlKey) {
    // Cmd+O / Ctrl+O - Open in default app
    if (event.key.toLowerCase() === 'o' && !event.shiftKey) {
      if (state.currentPlanPath && callbacks) {
        event.preventDefault();
        callbacks.handlePlanOpenClick();
      }
      return;
    }

    // Cmd+Shift+R / Ctrl+Shift+R - Reveal in Finder
    if (event.key.toLowerCase() === 'r' && event.shiftKey) {
      if (state.currentPlanPath && callbacks) {
        event.preventDefault();
        callbacks.handlePlanRevealClick();
      }
      return;
    }
  }
}
