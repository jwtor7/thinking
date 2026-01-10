/**
 * Custom Tooltip System for Session Badges
 *
 * Provides a custom tooltip that shows session ID and full path
 * when hovering over session badges in the filter bar.
 */

import { elements } from './elements';
import { escapeHtml } from '../utils/html';

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
 * Show the tooltip below the target element.
 */
function showTooltip(target: HTMLElement, sessionId: string, sessionPath?: string): void {
  const tooltip = elements.sessionTooltip;
  if (!tooltip) return;

  // Build tooltip content
  let content = `<div class="session-tooltip-id">${escapeHtml(sessionId)}</div>`;
  if (sessionPath) {
    content += `<div class="session-tooltip-path">${escapeHtml(sessionPath)}</div>`;
  }
  tooltip.innerHTML = content;

  // Position tooltip below target
  const rect = target.getBoundingClientRect();
  const tooltipRect = tooltip.getBoundingClientRect();

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
}
