/**
 * Custom Tooltip System for Session Badges
 *
 * Provides a custom tooltip that shows session ID and full path
 * when hovering over session badges in the filter bar.
 */

import { elements } from './elements.ts';
import { escapeHtml } from '../utils/html.ts';

// ============================================
// Tooltip Configuration
// ============================================

/** Delay before showing tooltip (ms) */
const TOOLTIP_DELAY_MS = 300;

/** Timer for delayed tooltip display */
let tooltipTimer: ReturnType<typeof setTimeout> | null = null;

// ============================================
// Tooltip Initialization
// ============================================

/**
 * Initialize the custom tooltip system.
 * Creates the tooltip element and attaches event listeners.
 */
export function initTooltip(): void {
  // Create tooltip element if it doesn't exist
  if (!elements.sessionTooltip) {
    const tooltip = document.createElement('div');
    tooltip.id = 'session-tooltip';
    tooltip.className = 'session-tooltip';
    tooltip.setAttribute('role', 'tooltip');
    tooltip.setAttribute('aria-hidden', 'true');
    document.body.appendChild(tooltip);
    elements.sessionTooltip = tooltip;
  }

  // Use event delegation on document for hover events
  document.addEventListener('mouseenter', handleTooltipMouseEnter, true);
  document.addEventListener('mouseleave', handleTooltipMouseLeave, true);
  document.addEventListener('mouseenter', handleStatTooltipMouseEnter, true);
  document.addEventListener('mouseleave', handleStatTooltipMouseLeave, true);
}

// ============================================
// Event Handlers
// ============================================

/**
 * Handle mouseenter on elements with data-session-tooltip attribute.
 */
function handleTooltipMouseEnter(e: Event): void {
  const target = e.target;

  // Ensure target is an Element (not a text node)
  if (!(target instanceof Element)) return;

  // Check if target or ancestor has tooltip attribute
  const tooltipTarget = target.closest('[data-session-tooltip]') as HTMLElement | null;
  if (!tooltipTarget) return;

  // Get session info from data attributes
  const sessionId = tooltipTarget.dataset.sessionId;
  const sessionPath = tooltipTarget.dataset.sessionPath;

  if (!sessionId) return;

  // Clear any pending tooltip
  if (tooltipTimer) {
    clearTimeout(tooltipTimer);
  }

  // Show tooltip after delay
  tooltipTimer = setTimeout(() => {
    showTooltip(tooltipTarget, sessionId, sessionPath);
  }, TOOLTIP_DELAY_MS);
}

/**
 * Handle mouseleave on elements with data-session-tooltip attribute.
 */
function handleTooltipMouseLeave(e: Event): void {
  const target = e.target;

  // Ensure target is an Element (not a text node)
  if (!(target instanceof Element)) return;

  // Check if target or ancestor has tooltip attribute
  const tooltipTarget = target.closest('[data-session-tooltip]');
  if (!tooltipTarget) return;

  // Clear pending tooltip
  if (tooltipTimer) {
    clearTimeout(tooltipTimer);
    tooltipTimer = null;
  }

  // Hide tooltip
  hideTooltip();
}

// ============================================
// Tooltip Display
// ============================================

/**
 * Extract folder name from a path.
 */
function extractFolderName(path: string): string {
  const parts = path.replace(/\/$/, '').split('/');
  return parts[parts.length - 1] || path;
}

/**
 * Show the tooltip below the target element.
 * Shows folder name as primary identifier with path and session ID as secondary info.
 */
function showTooltip(target: HTMLElement, sessionId: string, sessionPath?: string): void {
  const tooltip = elements.sessionTooltip;
  if (!tooltip) return;

  // Build tooltip content - folder name first, then path and session ID
  let content = '';
  if (sessionPath) {
    const folderName = extractFolderName(sessionPath);
    content += `<div class="session-tooltip-folder">${escapeHtml(folderName)}</div>`;
    content += `<div class="session-tooltip-path">${escapeHtml(sessionPath)}</div>`;
  }
  content += `<div class="session-tooltip-id">Session: ${escapeHtml(sessionId)}</div>`;
  tooltip.innerHTML = content;

  // Position tooltip below target
  const rect = target.getBoundingClientRect();

  // Calculate position
  let left = rect.left + (rect.width / 2);
  let top = rect.bottom + 8;

  // Adjust if tooltip would go off-screen
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;

  // Show tooltip to get dimensions
  tooltip.classList.add('visible');
  const actualRect = tooltip.getBoundingClientRect();

  // Adjust horizontal position
  if (left + actualRect.width / 2 > viewportWidth - 10) {
    left = viewportWidth - actualRect.width / 2 - 10;
  }
  if (left - actualRect.width / 2 < 10) {
    left = actualRect.width / 2 + 10;
  }

  // Adjust vertical position if too close to bottom
  if (top + actualRect.height > viewportHeight - 10) {
    top = rect.top - actualRect.height - 8;
  }

  tooltip.style.left = `${left}px`;
  tooltip.style.top = `${top}px`;
  tooltip.setAttribute('aria-hidden', 'false');
}

// ============================================
// Stat Tooltip Handlers
// ============================================

/**
 * Handle mouseenter on elements with data-stat-tooltip attribute.
 */
function handleStatTooltipMouseEnter(e: Event): void {
  const target = e.target;
  if (!(target instanceof Element)) return;

  const tooltipTarget = target.closest('[data-stat-tooltip]') as HTMLElement | null;
  if (!tooltipTarget) return;

  const tooltipText = tooltipTarget.dataset.statTooltip;
  if (!tooltipText) return;

  if (tooltipTimer) clearTimeout(tooltipTimer);

  tooltipTimer = setTimeout(() => {
    showStatTooltip(tooltipTarget, tooltipText);
  }, TOOLTIP_DELAY_MS);
}

/**
 * Handle mouseleave on elements with data-stat-tooltip attribute.
 */
function handleStatTooltipMouseLeave(e: Event): void {
  const target = e.target;
  if (!(target instanceof Element)) return;

  const tooltipTarget = target.closest('[data-stat-tooltip]');
  if (!tooltipTarget) return;

  if (tooltipTimer) {
    clearTimeout(tooltipTimer);
    tooltipTimer = null;
  }
  hideTooltip();
}

/**
 * Show a tooltip above the target stat cell.
 */
function showStatTooltip(target: HTMLElement, text: string): void {
  const tooltip = elements.sessionTooltip;
  if (!tooltip) return;

  tooltip.innerHTML = `<div class="session-tooltip-path">${escapeHtml(text)}</div>`;

  const rect = target.getBoundingClientRect();

  // Show tooltip to get dimensions, position above stats bar
  tooltip.classList.add('visible');
  const actualRect = tooltip.getBoundingClientRect();

  let left = rect.left + (rect.width / 2);
  let top = rect.top - actualRect.height - 8;

  // Adjust if off-screen horizontally
  const viewportWidth = window.innerWidth;
  if (left + actualRect.width / 2 > viewportWidth - 10) {
    left = viewportWidth - actualRect.width / 2 - 10;
  }
  if (left - actualRect.width / 2 < 10) {
    left = actualRect.width / 2 + 10;
  }

  // Fall below if no room above
  if (top < 10) {
    top = rect.bottom + 8;
  }

  tooltip.style.left = `${left}px`;
  tooltip.style.top = `${top}px`;
  tooltip.setAttribute('aria-hidden', 'false');
}

/**
 * Hide the tooltip.
 */
function hideTooltip(): void {
  const tooltip = elements.sessionTooltip;
  if (!tooltip) return;

  tooltip.classList.remove('visible');
  tooltip.setAttribute('aria-hidden', 'true');
}

/**
 * Clean up tooltip resources.
 */
export function destroyTooltip(): void {
  if (tooltipTimer) {
    clearTimeout(tooltipTimer);
    tooltipTimer = null;
  }

  if (elements.sessionTooltip) {
    elements.sessionTooltip.remove();
    elements.sessionTooltip = null;
  }

  document.removeEventListener('mouseenter', handleTooltipMouseEnter, true);
  document.removeEventListener('mouseleave', handleTooltipMouseLeave, true);
  document.removeEventListener('mouseenter', handleStatTooltipMouseEnter, true);
  document.removeEventListener('mouseleave', handleStatTooltipMouseLeave, true);
}
