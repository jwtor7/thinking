/**
 * Keyboard Shortcut Management
 *
 * Handles all keyboard shortcuts for the Thinking Monitor dashboard.
 * Shortcuts include panel navigation, view selection, filters, and actions.
 */

import { state } from '../state.ts';
import { elements } from './elements.ts';
import { selectView } from './views.ts';
import { togglePanelCollapse } from './panels.ts';
import { filterAllThinking, filterAllTools } from './filters.ts';
import { openSearchOverlay } from './search-overlay.ts';
import { openKeyboardHelp, isKeyboardHelpOpen, closeKeyboardHelp } from './keyboard-help.ts';

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
  /** Toggle the panel selector modal */
  togglePanelSelector: () => void;
  /** Try to open the export modal (checks if allowed first) */
  tryOpenExportModal: () => boolean;
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
 * - Shift+T/O/D/H - Toggle panel collapse (Thinking/Tools/Todo/Hooks)
 * - Shift+P - Open panel selector modal
 * - A/T/O/D/H/P (without shift) - Select view (All/Thinking/Tools/Todo/Hooks/Plan)
 * - Cmd/Ctrl+E - Export as Markdown
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

  // Escape to clear filters and blur (or close keyboard help)
  if (event.key === 'Escape') {
    if (isKeyboardHelpOpen()) {
      closeKeyboardHelp();
      return;
    }
    state.thinkingFilter = '';
    state.toolsFilter = '';
    elements.thinkingFilter.value = '';
    elements.toolsFilter.value = '';
    filterAllThinking();
    filterAllTools();
    (document.activeElement as HTMLElement)?.blur();
    return;
  }

  // '?' to show keyboard shortcuts help
  if (event.key === '?' || (event.shiftKey && event.key === '/')) {
    event.preventDefault();
    openKeyboardHelp();
    return;
  }

  // Don't process other shortcuts when keyboard help is open
  if (isKeyboardHelpOpen()) return;

  // Panel collapse shortcuts (Shift + t/o/d) and panel selector (Shift + p)
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
      case 'h':
        event.preventDefault();
        togglePanelCollapse('hooks');
        return;
      case 'm':
        event.preventDefault();
        togglePanelCollapse('team');
        return;
      case 'k':
        event.preventDefault();
        togglePanelCollapse('tasks');
        return;
      case 'l':
        event.preventDefault();
        togglePanelCollapse('timeline');
        return;
      case 'p':
        // Shift+P opens the panel selector modal
        event.preventDefault();
        if (callbacks) {
          callbacks.togglePanelSelector();
        }
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
      case 'h':
        selectView('hooks');
        return;
      case 'm':
        selectView('team');
        return;
      case 'k':
        selectView('tasks');
        return;
      case 'l':
        selectView('timeline');
        return;
      case 'p':
        selectView('plan');
        return;
    }
  }

  // Plan file actions with Cmd/Ctrl modifiers
  if (event.metaKey || event.ctrlKey) {
    // Cmd+K / Ctrl+K - Global search
    if (event.key.toLowerCase() === 'k') {
      event.preventDefault();
      openSearchOverlay();
      return;
    }

    // Cmd+E / Ctrl+E - Export as Markdown
    if (event.key.toLowerCase() === 'e' && !event.shiftKey) {
      event.preventDefault();
      if (callbacks) {
        callbacks.tryOpenExportModal();
      }
      return;
    }

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
