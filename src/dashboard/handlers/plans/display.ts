/**
 * Plan Display
 *
 * Markdown rendering, plan content display, metadata,
 * and empty state rendering.
 */

import { state } from '../../state.ts';
import { elements } from '../../ui/elements.ts';
import { escapeHtml } from '../../utils/html.ts';
import { renderSimpleMarkdown } from '../../utils/markdown.ts';
import type { PlanInfo } from '../../types.ts';
import { renderPlanSelector, requestPlanContent } from './state.ts';
import { formatTimeAgo } from './utils.ts';

// ============================================
// Checkbox Progress
// ============================================

interface CheckboxProgress {
  checked: number;
  total: number;
}

/**
 * Parse plan content for checkbox items and return progress.
 * Matches GitHub-flavored markdown task list syntax: `- [ ]` and `- [x]`/`- [X]`.
 */
function parsePlanCheckboxes(content: string): CheckboxProgress {
  const unchecked = content.match(/^[\t ]*- \[ \]/gm);
  const checked = content.match(/^[\t ]*- \[[xX]\]/gm);
  const checkedCount = checked ? checked.length : 0;
  const total = checkedCount + (unchecked ? unchecked.length : 0);
  return { checked: checkedCount, total };
}

/**
 * Update the plan progress indicator in the panel header.
 * Shows a mini progress bar + fraction when checkboxes exist, hides otherwise.
 */
function updatePlanProgress(progress: CheckboxProgress): void {
  const el = elements.planProgress;
  if (!el) return;

  if (progress.total === 0) {
    el.classList.remove('visible');
    el.innerHTML = '';
    return;
  }

  const pct = Math.round((progress.checked / progress.total) * 100);
  const allDone = progress.checked === progress.total;

  el.innerHTML = `<span class="plan-progress-bar"><span class="plan-progress-fill${allDone ? ' plan-progress-complete' : ''}" style="width: ${pct}%"></span></span><span class="plan-progress-text">${progress.checked}/${progress.total}</span>`;
  el.classList.add('visible');
  el.setAttribute('aria-label', `Plan completion: ${progress.checked} of ${progress.total} items done`);
}

// ============================================
// Display Functions
// ============================================

/**
 * Display the most recently modified plan in the Plan panel.
 * If no plans are available, shows an empty state.
 */
export function displayMostRecentPlan(): void {
  if (state.plans.size === 0) {
    displayEmptyPlan();
    return;
  }

  // Find the most recently modified plan
  let mostRecent: PlanInfo | null = null;
  for (const plan of state.plans.values()) {
    if (!mostRecent || plan.lastModified > mostRecent.lastModified) {
      mostRecent = plan;
    }
  }

  if (!mostRecent) {
    displayEmptyPlan();
    return;
  }

  displayPlan(mostRecent.path);
}

/**
 * Display a specific plan by path.
 *
 * @param planPath - Path to the plan file to display
 */
export function displayPlan(planPath: string): void {
  const plan = state.plans.get(planPath);
  if (!plan) {
    // Plan content not loaded yet, show loading state and request content
    state.currentPlanPath = planPath;
    updatePlanProgress({ checked: 0, total: 0 });
    const listItem = state.planList.find((p) => p.path === planPath);
    elements.planSelectorText.textContent = listItem?.filename || 'Loading...';
    elements.planContent.innerHTML = `
      <div class="empty-state">
        <span class="empty-icon">...</span>
        <p>Loading plan content...</p>
      </div>
    `;
    updatePlanMeta(null);
    updatePlanActionButtons();

    // Request the plan content from the server
    requestPlanContent(planPath);
    return;
  }

  state.currentPlanPath = planPath;
  elements.planSelectorText.textContent = plan.filename;
  elements.planContent.innerHTML = `
    <div class="plan-markdown">${renderSimpleMarkdown(plan.content)}</div>
  `;

  // Update progress indicator from checkbox items
  updatePlanProgress(parsePlanCheckboxes(plan.content));

  // Update plan metadata display
  updatePlanMeta(plan);

  // Update action buttons enabled state
  updatePlanActionButtons();

  // Update selector to show active state
  renderPlanSelector();
}

/**
 * Display empty plan state.
 * Shows a helpful message depending on the current context.
 */
export function displayEmptyPlan(): void {
  state.currentPlanPath = null;
  elements.planSelectorText.textContent = 'No active plan';
  updatePlanProgress({ checked: 0, total: 0 });

  // Show different message based on whether "All" sessions is selected
  const message = state.selectedSession === 'all' && state.sessions.size > 0
    ? 'Select a session to view its plan'
    : 'No plan file loaded';

  elements.planContent.innerHTML = `
    <div class="empty-state">
      <div class="empty-state-icon">&#128196;</div>
      <p class="empty-state-title">${message}</p>
    </div>
  `;
  updatePlanMeta(null);
  updatePlanActionButtons();
  renderPlanSelector();
}

/**
 * Display empty plan state for a specific session.
 * Shows a message indicating no plan is associated with this session,
 * and a hint that users can still browse plans via the dropdown.
 *
 * @param sessionId - The session ID to display empty state for
 */
export function displaySessionPlanEmpty(sessionId: string): void {
  state.currentPlanPath = null;
  updatePlanProgress({ checked: 0, total: 0 });
  const shortId = sessionId.slice(0, 8);
  elements.planSelectorText.textContent = 'No plan for session';

  elements.planContent.innerHTML = `
    <div class="empty-state">
      <div class="empty-state-icon">&#128196;</div>
      <p class="empty-state-title">No plan associated with session ${shortId}</p>
      <p class="empty-state-subtitle">Use the dropdown to browse all plans</p>
    </div>
  `;
  updatePlanMeta(null);
  updatePlanActionButtons();
  renderPlanSelector();
}

/**
 * Update the plan metadata display.
 * Shows the path and last modified time of the current plan.
 *
 * @param plan - Plan info to display, or null to hide metadata
 */
export function updatePlanMeta(plan: PlanInfo | null): void {
  if (!plan) {
    elements.planMeta.classList.remove('visible');
    elements.planMeta.innerHTML = '';
    return;
  }

  const modifiedDate = new Date(plan.lastModified);
  const timeAgo = formatTimeAgo(modifiedDate);
  const fullTime = modifiedDate.toLocaleString();

  // Shorten the path for display (show just ~/.claude/plans/filename.md)
  const shortPath = plan.path.replace(/^.*\/\.claude\//, '~/.claude/');

  elements.planMeta.innerHTML = `
    <span class="plan-meta-item">
      <span class="plan-meta-label">Modified:</span>
      <span class="plan-meta-value plan-meta-time" title="${escapeHtml(fullTime)}">${escapeHtml(timeAgo)}</span>
    </span>
    <span class="plan-meta-item plan-meta-path" title="${escapeHtml(plan.path)}">
      <span class="plan-meta-label">Path:</span>
      <span class="plan-meta-value">${escapeHtml(shortPath)}</span>
    </span>
  `;
  elements.planMeta.classList.add('visible');
}

// ============================================
// Action Button Functions
// ============================================

/**
 * Update the enabled state of plan action buttons.
 */
export function updatePlanActionButtons(): void {
  const hasActivePlan = state.currentPlanPath !== null;
  elements.planOpenBtn.disabled = !hasActivePlan;
  elements.planRevealBtn.disabled = !hasActivePlan;
}
