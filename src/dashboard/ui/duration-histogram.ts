/**
 * Tool Duration Histogram
 *
 * Compact bar chart showing tool call duration distribution.
 * Rendered as pure CSS bars inside the tools panel header.
 */

import { elements } from './elements.ts';

const BUCKETS = [
  { label: '<100ms', max: 100, color: 'var(--color-accent-green)' },
  { label: '100-500ms', max: 500, color: 'var(--color-accent-green)' },
  { label: '500ms-1s', max: 1000, color: 'var(--color-accent-yellow)' },
  { label: '1-5s', max: 5000, color: 'var(--color-accent-orange)' },
  { label: '5-15s', max: 15000, color: 'var(--color-accent-orange)' },
  { label: '15s+', max: Infinity, color: 'var(--color-accent-red)' },
];

const counts: number[] = new Array(BUCKETS.length).fill(0);
let totalCalls = 0;
let barElements: HTMLElement[] = [];

/**
 * Initialize the duration histogram DOM inside #tool-duration-histogram.
 */
export function initDurationHistogram(): void {
  const container = elements.durationHistogram;
  if (!container) return;

  container.innerHTML = '';
  barElements = [];

  for (let i = 0; i < BUCKETS.length; i++) {
    const bar = document.createElement('div');
    bar.className = 'histogram-bar';
    bar.style.background = BUCKETS[i].color;
    bar.style.height = '2px';
    bar.title = `${BUCKETS[i].label}: 0 calls`;
    container.appendChild(bar);
    barElements.push(bar);
  }
}

/**
 * Record a tool duration and update the histogram.
 */
export function addDuration(ms: number): void {
  totalCalls++;

  for (let i = 0; i < BUCKETS.length; i++) {
    if (ms < BUCKETS[i].max || i === BUCKETS.length - 1) {
      counts[i]++;
      break;
    }
  }

  renderBars();
}

/**
 * Reset all histogram data (called from clearAllPanels).
 */
export function resetHistogram(): void {
  counts.fill(0);
  totalCalls = 0;
  renderBars();
}

function renderBars(): void {
  const max = Math.max(...counts, 1);

  for (let i = 0; i < barElements.length; i++) {
    const pct = (counts[i] / max) * 100;
    const height = Math.max(2, (pct / 100) * 28); // 28px max + 2px min
    barElements[i].style.height = `${height}px`;

    const callPct = totalCalls > 0 ? Math.round((counts[i] / totalCalls) * 100) : 0;
    barElements[i].title = `${BUCKETS[i].label}: ${counts[i]} calls (${callPct}%)`;
  }
}
