/**
 * AppContext - Unified dependency injection interface.
 *
 * Replaces 7+ separate callback interfaces with a single typed context
 * object passed to all handler init() functions.
 */

/**
 * Shared UI operations available to all handlers.
 */
export interface AppContextUI {
  appendAndTrim: (container: HTMLElement, element: HTMLElement) => void;
  smartScroll: (container: HTMLElement) => void;
  showToast: (message: string, type?: 'success' | 'error' | 'info', duration?: number) => void;
  announceStatus: (message: string) => void;
}

/**
 * Navigation operations.
 */
export interface AppContextNavigation {
  selectSession: (sessionId: string) => void;
  selectView: (view: string) => void;
}

/**
 * Agent context operations.
 */
export interface AppContextAgents {
  getCurrentContext: () => string;
  getDisplayName: (agentId: string) => string;
  findActive: () => { id: string } | undefined;
}

/**
 * Unified application context.
 * Passed to handler init() functions as a single argument.
 */
export interface AppContext {
  ui: AppContextUI;
  navigation: AppContextNavigation;
  agents: AppContextAgents;
}
