import { test, expect, Page } from '@playwright/test';

/**
 * Session filtering regression tests.
 *
 * Reproduces the bug: when a specific session is selected, thinking events
 * for that session don't appear in the thinking panel.
 */

async function postEvent(event: Record<string, unknown>) {
  return fetch('http://127.0.0.1:3355/event', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(event),
  });
}

async function freshLoad(page: Page) {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.locator('.status-text')).toHaveText('Connected', { timeout: 5000 });
}

async function switchView(page: Page, view: string) {
  await page.locator(`.view-tab[data-view="${view}"]`).click();
}

const SESSION_A = `test-session-a-${Date.now()}`;
const SESSION_B = `test-session-b-${Date.now()}`;
const TS = () => new Date().toISOString();

test.describe('Session-filtered thinking', () => {
  test('thinking events show when their session is selected', async ({ page }) => {
    await freshLoad(page);

    // Register two sessions
    await postEvent({
      type: 'session_start',
      sessionId: SESSION_A,
      workingDirectory: '/Users/true/dev/project-alpha',
      timestamp: TS(),
    });
    await postEvent({
      type: 'session_start',
      sessionId: SESSION_B,
      workingDirectory: '/Users/true/dev/project-beta',
      timestamp: TS(),
    });

    // Wait for session dropdown to appear
    await expect(page.locator('#session-dropdown')).toBeVisible({ timeout: 5000 });

    // Send thinking events for each session
    await postEvent({
      type: 'thinking',
      content: 'Alpha thinking about architecture',
      sessionId: SESSION_A,
      timestamp: TS(),
    });
    await postEvent({
      type: 'thinking',
      content: 'Beta thinking about testing',
      sessionId: SESSION_B,
      timestamp: TS(),
    });

    // Switch to thinking view
    await switchView(page, 'thinking');

    // With "All Sessions" selected, both should be visible
    await expect(page.locator('#thinking-content')).toContainText('Alpha thinking', { timeout: 5000 });
    await expect(page.locator('#thinking-content')).toContainText('Beta thinking');

    // Select Session A
    await page.locator('#session-dropdown').selectOption(SESSION_A);

    // Only session A thinking should be visible
    const alphaEntry = page.locator(`.thinking-entry[data-session="${SESSION_A}"]`);
    const betaEntry = page.locator(`.thinking-entry[data-session="${SESSION_B}"]`);

    await expect(alphaEntry).toBeVisible({ timeout: 5000 });
    await expect(betaEntry).toBeHidden();

    // Verify content
    await expect(alphaEntry).toContainText('Alpha thinking about architecture');
  });

  test('thinking events arrive after session selection and still show', async ({ page }) => {
    await freshLoad(page);

    const sessionId = `test-session-late-${Date.now()}`;

    // Register session
    await postEvent({
      type: 'session_start',
      sessionId,
      workingDirectory: '/Users/true/dev/late-project',
      timestamp: TS(),
    });

    await expect(page.locator('#session-dropdown')).toBeVisible({ timeout: 5000 });

    // Select this session FIRST
    await page.locator('#session-dropdown').selectOption(sessionId);

    // Switch to thinking view
    await switchView(page, 'thinking');

    // THEN send thinking event (arrives after selection)
    await postEvent({
      type: 'thinking',
      content: 'Late arriving thought',
      sessionId,
      timestamp: TS(),
    });

    // Should be visible because it matches the selected session
    await expect(page.locator('#thinking-content')).toContainText('Late arriving thought', { timeout: 5000 });
  });

  test('session-filtered thinking count shows filtered/total format', async ({ page }) => {
    await freshLoad(page);

    const s1 = `test-count-a-${Date.now()}`;
    const s2 = `test-count-b-${Date.now()}`;

    await postEvent({ type: 'session_start', sessionId: s1, workingDirectory: '/tmp/a', timestamp: TS() });
    await postEvent({ type: 'session_start', sessionId: s2, workingDirectory: '/tmp/b', timestamp: TS() });

    await expect(page.locator('#session-dropdown')).toBeVisible({ timeout: 5000 });

    // Send 2 thinking events for s1, 1 for s2
    await postEvent({ type: 'thinking', content: 'S1 thought 1', sessionId: s1, timestamp: TS() });
    await postEvent({ type: 'thinking', content: 'S1 thought 2', sessionId: s1, timestamp: TS() });
    await postEvent({ type: 'thinking', content: 'S2 thought 1', sessionId: s2, timestamp: TS() });

    await switchView(page, 'thinking');

    // All sessions: should show total count (3)
    await expect(page.locator('#thinking-count')).toHaveText('3', { timeout: 5000 });

    // Select s1 - should show filtered/total (2/3)
    await page.locator('#session-dropdown').selectOption(s1);
    await expect(page.locator('#thinking-count')).toHaveText('2/3', { timeout: 5000 });
  });

  test('tool events filter by session too', async ({ page }) => {
    await freshLoad(page);

    const s1 = `test-tools-a-${Date.now()}`;
    const s2 = `test-tools-b-${Date.now()}`;

    await postEvent({ type: 'session_start', sessionId: s1, workingDirectory: '/tmp/ta', timestamp: TS() });
    await postEvent({ type: 'session_start', sessionId: s2, workingDirectory: '/tmp/tb', timestamp: TS() });

    await expect(page.locator('#session-dropdown')).toBeVisible({ timeout: 5000 });

    await postEvent({ type: 'tool_start', toolName: 'Read', sessionId: s1, timestamp: TS() });
    await postEvent({ type: 'tool_start', toolName: 'Write', sessionId: s2, timestamp: TS() });

    await switchView(page, 'tools');

    // All sessions: both tools visible
    await expect(page.locator('#tools-count')).toHaveText('2', { timeout: 5000 });

    // Select s1 - only Read should show
    await page.locator('#session-dropdown').selectOption(s1);
    await expect(page.locator('#tools-count')).toHaveText('1/2', { timeout: 5000 });

    const readEntry = page.locator(`.tool-entry[data-session="${s1}"]`);
    const writeEntry = page.locator(`.tool-entry[data-session="${s2}"]`);
    await expect(readEntry).toBeVisible();
    await expect(writeEntry).toBeHidden();
  });
});
