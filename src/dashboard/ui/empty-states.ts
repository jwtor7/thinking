/**
 * Enhanced Empty States
 *
 * Context-aware empty states with keyboard shortcut hints.
 * Returns HTML strings for each panel based on current application state.
 */

import { state } from '../state.ts';

export interface EmptyStateContext {
  connected: boolean;
  hasSession: boolean;
  sessionCount: number;
  selectedSession: string;
}

export function getEmptyStateContext(): EmptyStateContext {
  return {
    connected: state.connected,
    hasSession: state.currentSessionId !== null,
    sessionCount: state.sessions.size,
    selectedSession: state.selectedSession,
  };
}

export function getEmptyStateHTML(panel: string, ctx?: EmptyStateContext): string {
  const context = ctx || getEmptyStateContext();

  switch (panel) {
    case 'thinking':
      if (!context.connected) {
        return emptyState('&#129504;', 'Waiting for connection...', 'Connect to the Thinking Monitor server to see Claude\'s thoughts.');
      }
      if (!context.hasSession) {
        return emptyState('&#129504;', 'Waiting for Claude Code session...', 'Start a conversation in your terminal to see thinking blocks.');
      }
      return emptyState('&#129504;', 'Waiting for thinking...', 'Claude\'s extended thinking will appear here as it reasons through problems.');

    case 'tools':
      if (!context.connected) {
        return emptyState('&#128295;', 'Waiting for connection...', 'Connect to see tool activity.');
      }
      return emptyState('&#128295;', 'No tool calls yet', 'Tools appear when Claude reads files, runs commands, edits code, or searches.');

    case 'hooks':
      return emptyState('&#9881;', 'No hook activity', 'Hooks run before/after tool execution to enforce rules and track behavior.');

    case 'plan':
      if (context.hasSession) {
        return emptyState('&#128196;', 'No plan for this session',
          'Plans appear when Claude enters plan mode.' +
          '<div class="empty-state-shortcuts">' +
          '<kbd>Cmd+O</kbd> Open &nbsp; <kbd>Cmd+Shift+R</kbd> Reveal' +
          '</div>');
      }
      return emptyState('&#128196;', 'No plan loaded', 'Select a plan from the dropdown above.');

    case 'team':
      return emptyState('&#128101;', 'No team activity', 'Teams appear when Claude uses TeamCreate and SendMessage for multi-agent collaboration.');

    case 'tasks':
      return emptyState('&#128203;', 'No task activity', 'Task boards appear when Claude creates and manages tasks for team coordination.');

    case 'timeline':
      return emptyState('&#128337;', 'No events yet', 'A chronological feed of all events: thinking, tools, hooks, agents, and more.');

    case 'agents':
      return emptyState('&#129302;', 'No agents', 'Sub-agents will appear here when Claude spawns them.');

    default:
      return emptyState('&#9679;', 'No data', 'Waiting for events...');
  }
}

function emptyState(icon: string, title: string, subtitle: string): string {
  return `
    <div class="empty-state">
      <div class="empty-state-icon">${icon}</div>
      <p class="empty-state-title">${title}</p>
      <p class="empty-state-subtitle">${subtitle}</p>
    </div>
  `;
}
