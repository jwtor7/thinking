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
// Change Highlighting
// ============================================

/** Previous plan content (raw markdown) keyed by plan path, for change detection. */
const previousPlanContent = new Map<string, string>();

/**
 * Compare rendered plan blocks and highlight changes.
 * Applies a temporary green highlight to new/changed blocks that fades after 3s.
 */
function highlightChangedBlocks(container: HTMLElement, planPath: string, content: string): void {
  const prevContent = previousPlanContent.get(planPath);
  previousPlanContent.set(planPath, content);

  // No previous content or identical — skip highlighting
  if (prevContent === undefined || prevContent === content) return;

  // Render previous content into a temporary container for block-level comparison
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = renderSimpleMarkdown(prevContent);

  const oldChildren = Array.from(tempDiv.children);
  const newChildren = Array.from(container.children);

  for (let i = 0; i < newChildren.length; i++) {
    const newChild = newChildren[i] as HTMLElement;
    const oldChild = oldChildren[i] as HTMLElement | undefined;

    // Highlight if block is new (beyond old length) or content changed
    if (!oldChild || newChild.outerHTML !== oldChild.outerHTML) {
      newChild.classList.add('plan-changed');
    }
  }
}

/**
 * Remove stored previous content for a deleted plan.
 */
export function clearPreviousPlanContent(planPath: string): void {
  previousPlanContent.delete(planPath);
}

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

  // Highlight blocks that changed since last render
  const markdownEl = elements.planContent.querySelector('.plan-markdown');
  if (markdownEl) {
    highlightChangedBlocks(markdownEl as HTMLElement, planPath, plan.content);
  }

  // Update progress indicator from checkbox items
  const progress = parsePlanCheckboxes(plan.content);
  updatePlanProgress(progress);

  // Update plan metadata display (pass progress for completion ratio)
  updatePlanMeta(plan, progress);

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
 * Count markdown heading sections in plan content.
 */
function countSections(content: string): number {
  const headings = content.match(/^#{1,3}\s+/gm);
  return headings ? headings.length : 0;
}

/**
 * Update the plan metadata display.
 * Shows item count, completion ratio, session context, modified time, and path.
 *
 * @param plan - Plan info to display, or null to hide metadata
 * @param progress - Checkbox progress data (optional)
 */
export function updatePlanMeta(plan: PlanInfo | null, progress?: CheckboxProgress): void {
  if (!plan) {
    elements.planMeta.classList.remove('visible');
    elements.planMeta.innerHTML = '';
    return;
  }

  const modifiedDate = new Date(plan.lastModified);
  const timeAgo = formatTimeAgo(modifiedDate);
  const fullTime = modifiedDate.toLocaleString();
  const sections = countSections(plan.content);

  // Build metadata pills
  const pills: string[] = [];

  // Completion ratio (if checkboxes exist)
  if (progress && progress.total > 0) {
    const pct = Math.round((progress.checked / progress.total) * 100);
    const allDone = progress.checked === progress.total;
    const completionClass = allDone ? ' plan-meta-pill-complete' : '';
    pills.push(`<span class="plan-meta-pill${completionClass}" title="${pct}% complete">${progress.checked}/${progress.total} done</span>`);
  }

  // Section count
  if (sections > 0) {
    pills.push(`<span class="plan-meta-pill" title="${sections} heading sections">${sections} section${sections !== 1 ? 's' : ''}</span>`);
  }

  // Session context
  if (plan.sessionId) {
    const shortSession = plan.sessionId.slice(0, 8);
    pills.push(`<span class="plan-meta-pill plan-meta-pill-session" title="Session ${escapeHtml(plan.sessionId)}">&#128279; ${escapeHtml(shortSession)}</span>`);
  }

  // Modified time
  pills.push(`<span class="plan-meta-pill plan-meta-pill-time" title="${escapeHtml(fullTime)}">${escapeHtml(timeAgo)}</span>`);

  // Path (always last, can truncate)
  const shortPath = plan.path.replace(/^.*\/\.claude\//, '~/.claude/');
  pills.push(`<span class="plan-meta-pill plan-meta-pill-path" title="${escapeHtml(plan.path)}">${escapeHtml(shortPath)}</span>`);

  elements.planMeta.innerHTML = pills.join('');
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
