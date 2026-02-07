/**
 * Global Search Overlay (Cmd+K)
 *
 * Cross-panel search with grouped results and click-to-navigate.
 */

import { selectView } from './views.ts';
import { escapeHtml } from '../utils/html.ts';
import type { ViewType } from './views.ts';

let isOpen = false;
let overlayEl: HTMLElement | null = null;
let searchInput: HTMLInputElement | null = null;
let resultsContainer: HTMLElement | null = null;
let debounceTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Initialize the search overlay.
 */
export function initSearchOverlay(): void {
  // DOM created lazily on first open
}

/**
 * Open the search overlay.
 */
export function openSearchOverlay(): void {
  if (isOpen) return;
  isOpen = true;
  ensureDOM();
  overlayEl!.classList.add('search-overlay-open');
  searchInput!.value = '';
  resultsContainer!.innerHTML = '<div class="search-empty">Type to search across all panels</div>';
  searchInput!.focus();
}

/**
 * Close the search overlay.
 */
export function closeSearchOverlay(): void {
  if (!isOpen) return;
  isOpen = false;
  overlayEl?.classList.remove('search-overlay-open');
}

function ensureDOM(): void {
  if (overlayEl) return;

  overlayEl = document.createElement('div');
  overlayEl.className = 'search-overlay';
  overlayEl.innerHTML = `
    <div class="search-overlay-backdrop"></div>
    <div class="search-overlay-modal">
      <div class="search-input-wrapper">
        <span class="search-input-icon">&#128269;</span>
        <input type="text" class="search-input" placeholder="Search across all panels..." />
      </div>
      <div class="search-results"></div>
    </div>
  `;
  document.body.appendChild(overlayEl);

  searchInput = overlayEl.querySelector('.search-input') as HTMLInputElement;
  resultsContainer = overlayEl.querySelector('.search-results') as HTMLElement;

  overlayEl.querySelector('.search-overlay-backdrop')!.addEventListener('click', closeSearchOverlay);

  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      closeSearchOverlay();
    }
  });

  searchInput.addEventListener('input', () => {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => performSearch(searchInput!.value), 150);
  });
}

function performSearch(query: string): void {
  if (!resultsContainer) return;

  if (!query.trim()) {
    resultsContainer.innerHTML = '<div class="search-empty">Type to search across all panels</div>';
    return;
  }

  const lowerQuery = query.toLowerCase();
  const groups: Record<string, HTMLElement[]> = {
    thinking: [],
    tools: [],
    hooks: [],
    timeline: [],
  };

  document.querySelectorAll('.thinking-entry').forEach(el => {
    if (el.textContent?.toLowerCase().includes(lowerQuery)) {
      groups.thinking.push(el as HTMLElement);
    }
  });

  document.querySelectorAll('.tool-entry').forEach(el => {
    if (el.textContent?.toLowerCase().includes(lowerQuery)) {
      groups.tools.push(el as HTMLElement);
    }
  });

  document.querySelectorAll('.hook-entry').forEach(el => {
    if (el.textContent?.toLowerCase().includes(lowerQuery)) {
      groups.hooks.push(el as HTMLElement);
    }
  });

  document.querySelectorAll('.timeline-entry').forEach(el => {
    const filterText = (el as HTMLElement).dataset.filterText || el.textContent || '';
    if (filterText.toLowerCase().includes(lowerQuery)) {
      groups.timeline.push(el as HTMLElement);
    }
  });

  renderResults(groups, query);
}

function renderResults(groups: Record<string, HTMLElement[]>, query: string): void {
  if (!resultsContainer) return;

  const panelLabels: Record<string, string> = {
    thinking: 'Thinking',
    tools: 'Tools',
    hooks: 'Hooks',
    timeline: 'Timeline',
  };

  let totalResults = 0;
  let html = '';

  for (const [panel, entries] of Object.entries(groups)) {
    if (entries.length === 0) continue;
    const shown = entries.slice(0, 10);
    totalResults += entries.length;

    html += `<div class="search-group">`;
    html += `<div class="search-group-header">${panelLabels[panel]} <span class="search-group-count">(${entries.length})</span></div>`;

    for (const entry of shown) {
      const preview = (entry.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 100);
      const entryId = entry.id || '';
      html += `<button class="search-result" data-panel="${panel}" data-entry-id="${escapeHtml(entryId)}">`;
      html += `<span class="search-result-text">${escapeHtml(preview)}</span>`;
      html += `</button>`;
    }

    if (entries.length > 10) {
      html += `<div class="search-more">+${entries.length - 10} more</div>`;
    }
    html += `</div>`;
  }

  if (totalResults === 0) {
    html = `<div class="search-empty">No results for "${escapeHtml(query)}"</div>`;
  }

  resultsContainer.innerHTML = html;

  resultsContainer.querySelectorAll('.search-result').forEach(btn => {
    btn.addEventListener('click', () => {
      const panel = (btn as HTMLElement).dataset.panel || '';
      const entryId = (btn as HTMLElement).dataset.entryId || '';
      navigateToResult(panel, entryId);
    });
  });
}

function navigateToResult(panel: string, entryId: string): void {
  selectView(panel as ViewType);

  if (entryId) {
    const el = document.getElementById(entryId);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.add('search-highlight');
      setTimeout(() => el.classList.remove('search-highlight'), 2000);
    }
  }

  closeSearchOverlay();
}
