/**
 * Markdown Export Utility
 *
 * Formats session data as a clean markdown document for export.
 * Includes thinking blocks, tool calls, todos, and hook executions.
 */

import { state } from '../state';
import type { SessionInfo, TodoItem, AgentInfo } from '../types';

/**
 * Options for what content to include in the export.
 */
export interface ExportOptions {
  includeThinking: boolean;
  includeTools: boolean;
  includeTodos: boolean;
  includeHooks: boolean;
}

/**
 * Format an ISO timestamp as human-readable local time.
 */
function formatLocalTime(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  });
}

/**
 * Exported data structure for a session.
 */
export interface ExportData {
  session: SessionInfo | null;
  sessionId: string | null;
  thinkingBlocks: ThinkingBlock[];
  toolCalls: ToolCall[];
  todos: TodoItem[];
  hooks: HookEntry[];
  plan: PlanData | null;
}

interface ThinkingBlock {
  timestamp: string;
  content: string;
  agent: string;
}

interface ToolCall {
  timestamp: string;
  toolName: string;
  input: string;
  duration?: string;
  agent: string;
}

interface HookEntry {
  timestamp: string;
  hookType: string;
  toolName?: string;
  decision?: string;
  hookName: string;
  output?: string;
}

interface PlanData {
  filename: string;
  path: string;
  content: string;
}

/**
 * Extract data from DOM elements for the current session.
 * The dashboard renders events to the DOM, so we scrape from there.
 *
 * @param options - Optional settings to filter what content is included
 */
export function extractSessionData(options?: ExportOptions): ExportData {
  const sessionId = state.selectedSession !== 'all' ? state.selectedSession : state.currentSessionId;
  const session = sessionId ? state.sessions.get(sessionId) || null : null;

  return {
    session,
    sessionId,
    thinkingBlocks: options?.includeThinking !== false ? extractThinkingBlocks(sessionId) : [],
    toolCalls: options?.includeTools !== false ? extractToolCalls(sessionId) : [],
    todos: options?.includeTodos !== false ? extractTodos() : [],
    hooks: options?.includeHooks !== false ? extractHooks(sessionId) : [],
    plan: extractPlanData(),
  };
}

/**
 * Extract thinking blocks from the DOM.
 */
function extractThinkingBlocks(sessionId: string | null): ThinkingBlock[] {
  const blocks: ThinkingBlock[] = [];
  const thinkingContent = document.getElementById('thinking-content');
  if (!thinkingContent) return blocks;

  const entries = thinkingContent.querySelectorAll('.thinking-entry');
  entries.forEach((entry) => {
    const el = entry as HTMLElement;
    // Filter by session if specified
    if (sessionId && sessionId !== 'all' && el.dataset.session !== sessionId) {
      return;
    }

    const timeEl = el.querySelector('.thinking-time');
    const agentEl = el.querySelector('.thinking-agent');
    const textEl = el.querySelector('.thinking-text');

    blocks.push({
      timestamp: timeEl?.textContent || '',
      agent: agentEl?.textContent || 'main',
      content: textEl?.textContent || '',
    });
  });

  return blocks;
}

/**
 * Extract tool calls from the DOM.
 */
function extractToolCalls(sessionId: string | null): ToolCall[] {
  const calls: ToolCall[] = [];
  const toolsContent = document.getElementById('tools-content');
  if (!toolsContent) return calls;

  const entries = toolsContent.querySelectorAll('.tool-entry');
  entries.forEach((entry) => {
    const el = entry as HTMLElement;
    // Filter by session if specified
    if (sessionId && sessionId !== 'all' && el.dataset.session !== sessionId) {
      return;
    }

    const timeEl = el.querySelector('.tool-time');
    const agentEl = el.querySelector('.tool-agent');
    const nameEl = el.querySelector('.tool-name');
    const inputEl = el.querySelector('.tool-input-content');
    const durationEl = el.querySelector('.tool-duration');

    calls.push({
      timestamp: timeEl?.textContent || '',
      agent: agentEl?.textContent || 'main',
      toolName: nameEl?.textContent || '',
      input: inputEl?.textContent || '',
      duration: durationEl?.textContent || undefined,
    });
  });

  return calls;
}

/**
 * Extract todos from state (already filtered by session).
 */
function extractTodos(): TodoItem[] {
  return [...state.todos];
}

/**
 * Extract hook entries from the DOM.
 */
function extractHooks(sessionId: string | null): HookEntry[] {
  const hooks: HookEntry[] = [];
  const hooksContent = document.getElementById('hooks-content');
  if (!hooksContent) return hooks;

  const entries = hooksContent.querySelectorAll('.hook-entry');
  entries.forEach((entry) => {
    const el = entry as HTMLElement;
    // Filter by session if specified
    if (sessionId && sessionId !== 'all' && el.dataset.session !== sessionId) {
      return;
    }

    const timeEl = el.querySelector('.hook-time');
    const typeEl = el.querySelector('.hook-type');
    const toolEl = el.querySelector('.hook-tool');
    const decisionEl = el.querySelector('.hook-decision');
    const nameEl = el.querySelector('.hook-name');
    const outputEl = el.querySelector('.hook-output');

    hooks.push({
      timestamp: timeEl?.textContent || '',
      hookType: typeEl?.textContent || '',
      toolName: toolEl?.textContent || undefined,
      decision: decisionEl?.textContent || undefined,
      hookName: nameEl?.textContent || '',
      output: outputEl?.textContent || undefined,
    });
  });

  return hooks;
}

/**
 * Extract current plan data from state.
 */
function extractPlanData(): PlanData | null {
  if (!state.currentPlanPath) return null;

  const plan = state.plans.get(state.currentPlanPath);
  if (!plan) return null;

  return {
    filename: plan.filename,
    path: plan.path,
    content: plan.content,
  };
}

/**
 * Format session data as a markdown document.
 */
export function formatAsMarkdown(data: ExportData): string {
  const lines: string[] = [];
  const exportDate = formatLocalTime(new Date().toISOString());

  // Header
  lines.push('# Thinking Monitor Export');
  lines.push('');

  // Session metadata
  lines.push('## Session Information');
  lines.push('');
  if (data.session) {
    lines.push(`- **Session ID**: \`${data.sessionId || 'unknown'}\``);
    if (data.session.workingDirectory) {
      lines.push(`- **Working Directory**: \`${data.session.workingDirectory}\``);
    }
    lines.push(`- **Start Time**: ${formatLocalTime(data.session.startTime)}`);
    if (data.session.endTime) {
      lines.push(`- **End Time**: ${formatLocalTime(data.session.endTime)}`);
    }
    lines.push(`- **Status**: ${data.session.active ? 'Active' : 'Ended'}`);
  } else {
    lines.push('_No session selected or session data unavailable._');
  }
  lines.push(`- **Export Date**: ${exportDate}`);
  lines.push('');

  // Todos
  if (data.todos.length > 0) {
    lines.push('## Todos');
    lines.push('');
    const completed = data.todos.filter(t => t.status === 'completed').length;
    lines.push(`Progress: ${completed}/${data.todos.length} completed`);
    lines.push('');
    data.todos.forEach((todo) => {
      const checkbox = todo.status === 'completed' ? '[x]' : '[ ]';
      const statusLabel = todo.status === 'in_progress' ? ' _(in progress)_' : '';
      lines.push(`- ${checkbox} ${todo.content}${statusLabel}`);
    });
    lines.push('');
  }

  // Thinking blocks
  if (data.thinkingBlocks.length > 0) {
    lines.push('## Thinking Blocks');
    lines.push('');
    data.thinkingBlocks.forEach((block, index) => {
      lines.push(`### Thinking ${index + 1}`);
      lines.push(`- **Time**: ${block.timestamp}`);
      lines.push(`- **Agent**: ${block.agent}`);
      lines.push('');
      lines.push('```');
      lines.push(block.content);
      lines.push('```');
      lines.push('');
    });
  }

  // Tool calls
  if (data.toolCalls.length > 0) {
    lines.push('## Tool Calls');
    lines.push('');
    data.toolCalls.forEach((call, index) => {
      lines.push(`### ${index + 1}. ${call.toolName}`);
      lines.push(`- **Time**: ${call.timestamp}`);
      lines.push(`- **Agent**: ${call.agent}`);
      if (call.duration) {
        lines.push(`- **Duration**: ${call.duration}`);
      }
      lines.push('');
      lines.push('**Input:**');
      lines.push('');
      // Truncate very long inputs
      const inputPreview = call.input.length > 2000
        ? call.input.slice(0, 2000) + '\n... (truncated)'
        : call.input;
      lines.push('```');
      lines.push(inputPreview);
      lines.push('```');
      lines.push('');
    });
  }

  // Hooks
  if (data.hooks.length > 0) {
    lines.push('## Hook Executions');
    lines.push('');
    lines.push('| Time | Type | Tool | Decision | Hook Name |');
    lines.push('|------|------|------|----------|-----------|');
    data.hooks.forEach((hook) => {
      const tool = hook.toolName || '-';
      const decision = hook.decision || '-';
      lines.push(`| ${hook.timestamp} | ${hook.hookType} | ${tool} | ${decision} | ${hook.hookName} |`);
    });
    lines.push('');
  }

  // Plan
  if (data.plan) {
    lines.push('## Active Plan');
    lines.push('');
    lines.push(`- **Filename**: ${data.plan.filename}`);
    lines.push(`- **Path**: \`${data.plan.path}\``);
    lines.push('');
    lines.push('### Plan Content');
    lines.push('');
    // The plan content is already markdown, so include it directly
    lines.push(data.plan.content);
    lines.push('');
  }

  // Footer
  lines.push('---');
  lines.push('');
  lines.push('_Generated by Thinking Monitor_');
  lines.push('');

  return lines.join('\n');
}

/**
 * Generate a default filename for the export.
 */
export function generateDefaultFilename(): string {
  const now = new Date();
  const dateStr = now.toISOString().split('T')[0]; // YYYY-MM-DD
  const timeStr = now.toTimeString().split(' ')[0].replace(/:/g, '-'); // HH-MM-SS
  return `thinking-export-${dateStr}-${timeStr}.md`;
}

/**
 * Get the suggested export path.
 * Uses the session's working directory if available, otherwise home directory.
 */
export function getSuggestedExportPath(): string {
  const sessionId = state.selectedSession !== 'all' ? state.selectedSession : state.currentSessionId;
  const session = sessionId ? state.sessions.get(sessionId) : null;

  if (session?.workingDirectory) {
    return `${session.workingDirectory}/${generateDefaultFilename()}`;
  }

  // Fallback to a reasonable default
  return `~/${generateDefaultFilename()}`;
}
