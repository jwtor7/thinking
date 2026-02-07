/**
 * Session Stats Bar
 *
 * Always-visible metrics bar showing real-time aggregated session data.
 * Updates on a 2-second interval to avoid DOM thrash.
 */

import { elements } from './elements.ts';
import { getDurationClass, formatDuration, shortenToolName } from '../utils/formatting.ts';
import type { StrictMonitorEvent } from '../types.ts';

interface StatsState {
  toolCounts: Map<string, number>;
  durations: number[];
  thinkingCount: number;
  hookDecisions: { allow: number; deny: number; ask: number };
  eventTimestamps: number[];
}

const stats: StatsState = {
  toolCounts: new Map(),
  durations: [],
  thinkingCount: 0,
  hookDecisions: { allow: 0, deny: 0, ask: 0 },
  eventTimestamps: [],
};

let cellElements: {
  topTools: HTMLElement | null;
  avgP95: HTMLElement | null;
  thinking: HTMLElement | null;
  hooks: HTMLElement | null;
  rate: HTMLElement | null;
} = { topTools: null, avgP95: null, thinking: null, hooks: null, rate: null };

/**
 * Initialize the stats bar DOM inside #stats-bar.
 */
export function initStatsBar(): void {
  const container = elements.statsBar;
  if (!container) return;

  container.innerHTML = `
    <div class="stat-cell" data-stat-tooltip="Most frequently used tools this session, ranked by call count" title="Most frequently used tools this session, ranked by call count">
      <span class="stat-label">Top Tools</span>
      <span class="stat-value" id="stat-top-tools">--</span>
    </div>
    <div class="stat-cell" data-stat-tooltip="Average and 95th percentile tool execution time. P95 = 95% of calls complete within this duration" title="Average and 95th percentile tool execution time. P95 = 95% of calls complete within this duration">
      <span class="stat-label">Avg / P95</span>
      <span class="stat-value" id="stat-avg-p95">--</span>
    </div>
    <div class="stat-cell" data-stat-tooltip="Number of thinking/reasoning blocks Claude has produced this session" title="Number of thinking/reasoning blocks Claude has produced this session">
      <span class="stat-label">Thinking</span>
      <span class="stat-value" id="stat-thinking">0</span>
    </div>
    <div class="stat-cell" data-stat-tooltip="Hook execution results: allowed / denied / asked. Hooks run before and after tool calls" title="Hook execution results: allowed / denied / asked. Hooks run before and after tool calls">
      <span class="stat-label">Hooks</span>
      <span class="stat-value" id="stat-hooks">0 / 0 / 0</span>
    </div>
    <div class="stat-cell" data-stat-tooltip="Events per minute over the last 60 seconds (sliding window)" title="Events per minute over the last 60 seconds (sliding window)">
      <span class="stat-label">Rate</span>
      <span class="stat-value" id="stat-rate">--</span>
    </div>
  `;

  cellElements = {
    topTools: document.getElementById('stat-top-tools'),
    avgP95: document.getElementById('stat-avg-p95'),
    thinking: document.getElementById('stat-thinking'),
    hooks: document.getElementById('stat-hooks'),
    rate: document.getElementById('stat-rate'),
  };
}

/**
 * Accumulate stats from an incoming event.
 * Called for every event from the dispatcher.
 */
export function updateStats(event: StrictMonitorEvent): void {
  stats.eventTimestamps.push(Date.now());

  switch (event.type) {
    case 'tool_start':
      stats.toolCounts.set(event.toolName, (stats.toolCounts.get(event.toolName) || 0) + 1);
      break;
    case 'tool_end':
      if (event.durationMs !== undefined) {
        stats.durations.push(event.durationMs);
      }
      break;
    case 'thinking':
      stats.thinkingCount++;
      break;
    case 'hook_execution':
      if (event.decision === 'allow') stats.hookDecisions.allow++;
      else if (event.decision === 'deny') stats.hookDecisions.deny++;
      else stats.hookDecisions.ask++;
      break;
  }
}

/**
 * Render stats to the DOM.
 * Called on a 2-second interval to avoid excessive updates.
 */
export function renderStats(): void {
  // Top 5 tools
  if (cellElements.topTools) {
    const sorted = [...stats.toolCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
    if (sorted.length > 0) {
      cellElements.topTools.textContent = sorted.map(([name, count]) => `${shortenToolName(name)}: ${count}`).join(' | ');
      // Full names in tooltip
      const parent = cellElements.topTools.closest('.stat-cell');
      if (parent) {
        parent.setAttribute('title', sorted.map(([name, count]) => `${name}: ${count}`).join('\n'));
      }
    } else {
      cellElements.topTools.textContent = '--';
    }
  }

  // Avg / P95 duration
  if (cellElements.avgP95) {
    if (stats.durations.length > 0) {
      const avg = stats.durations.reduce((a, b) => a + b, 0) / stats.durations.length;
      const p95 = percentile(stats.durations, 95);
      const avgClass = getDurationClass(avg);
      cellElements.avgP95.textContent = `${formatDuration(avg)} / ${formatDuration(p95)}`;
      cellElements.avgP95.className = `stat-value ${avgClass}`;
    } else {
      cellElements.avgP95.textContent = '--';
      cellElements.avgP95.className = 'stat-value';
    }
  }

  // Thinking count
  if (cellElements.thinking) {
    cellElements.thinking.textContent = String(stats.thinkingCount);
  }

  // Hook decisions (allow/deny/ask)
  if (cellElements.hooks) {
    const { allow, deny, ask } = stats.hookDecisions;
    const total = allow + deny + ask;
    if (total > 0) {
      cellElements.hooks.innerHTML = `<span>${allow}</span> / <span class="${deny > 0 ? 'stat-deny' : ''}">${deny}</span> / <span>${ask}</span>`;
    } else {
      cellElements.hooks.textContent = '0 / 0 / 0';
    }
  }

  // Events per minute (60-second sliding window)
  if (cellElements.rate) {
    const now = Date.now();
    const windowMs = 60_000;
    // Clean old timestamps
    while (stats.eventTimestamps.length > 0 && stats.eventTimestamps[0] < now - windowMs) {
      stats.eventTimestamps.shift();
    }
    const eventsPerMin = stats.eventTimestamps.length;
    cellElements.rate.textContent = eventsPerMin > 0 ? `${eventsPerMin}/min` : '--';
  }
}

/**
 * Reset all stats (called from clearAllPanels).
 */
export function resetStats(): void {
  stats.toolCounts.clear();
  stats.durations = [];
  stats.thinkingCount = 0;
  stats.hookDecisions = { allow: 0, deny: 0, ask: 0 };
  stats.eventTimestamps = [];
  renderStats();
}

function percentile(arr: number[], p: number): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}
