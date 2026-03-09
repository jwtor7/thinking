import { test, expect, Page } from '@playwright/test';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function postEvent(event: Record<string, unknown>) {
  return fetch('http://127.0.0.1:3355/event', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(event),
  });
}

/**
 * Navigate to dashboard with clean localStorage so default view (timeline) applies.
 */
async function freshLoad(page: Page) {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.locator('.status-text')).toHaveText('Connected', { timeout: 5000 });
}

/**
 * Switch to a specific view tab (the dashboard shows one panel at a time).
 */
async function switchView(page: Page, view: string) {
  await page.locator(`.view-tab[data-view="${view}"]`).click();
}

// ---------------------------------------------------------------------------
// Dashboard Load & Structure
// ---------------------------------------------------------------------------

test.describe('Dashboard loads correctly', () => {
  test('renders page title and header', async ({ page }) => {
    await freshLoad(page);
    await expect(page).toHaveTitle(/Thinking Monitor/);
    await expect(page.locator('.header-title')).toHaveText('THINKING MONITOR');
  });

  test('default view is timeline', async ({ page }) => {
    await freshLoad(page);
    await expect(page.locator('.panel-timeline')).toBeVisible();
    await expect(page.locator('.panel-thinking')).toBeHidden();
    await expect(page.locator('.panel-tools')).toBeHidden();
  });

  test('view tabs are rendered', async ({ page }) => {
    await freshLoad(page);
    await expect(page.locator('.view-tabs')).toBeVisible();
    await expect(page.locator('.view-tab[data-view="thinking"]')).toBeVisible();
    await expect(page.locator('.view-tab[data-view="tools"]')).toBeVisible();
    await expect(page.locator('.view-tab[data-view="timeline"]')).toBeVisible();
  });

  test('connection overlay disappears after WS connects', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#connection-overlay')).toBeHidden({ timeout: 5000 });
  });

  test('connection status shows Connected', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.status-text')).toHaveText('Connected', { timeout: 5000 });
  });

  test('footer shows server info', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#server-info')).not.toHaveText('Server: --', { timeout: 5000 });
  });
});

// ---------------------------------------------------------------------------
// View Switching
// ---------------------------------------------------------------------------

test.describe('View switching', () => {
  test('clicking thinking tab shows thinking panel', async ({ page }) => {
    await freshLoad(page);
    await switchView(page, 'thinking');
    await expect(page.locator('.panel-thinking')).toBeVisible();
    await expect(page.locator('.panel-timeline')).toBeHidden();
  });

  test('clicking tools tab shows tools panel', async ({ page }) => {
    await freshLoad(page);
    await switchView(page, 'tools');
    await expect(page.locator('.panel-tools')).toBeVisible();
    await expect(page.locator('.panel-timeline')).toBeHidden();
  });

  test('clicking hooks tab shows hooks panel', async ({ page }) => {
    await freshLoad(page);
    await switchView(page, 'hooks');
    await expect(page.locator('.panel-hooks')).toBeVisible();
  });

  test('active tab has active class', async ({ page }) => {
    await freshLoad(page);
    await switchView(page, 'thinking');
    await expect(page.locator('.view-tab[data-view="thinking"]')).toHaveClass(/active/);
    await expect(page.locator('.view-tab[data-view="timeline"]')).not.toHaveClass(/active/);
  });
});

// ---------------------------------------------------------------------------
// Event Ingestion
// ---------------------------------------------------------------------------

test.describe('Event ingestion via HTTP POST', () => {
  test('thinking event appears in thinking panel', async ({ page }) => {
    await freshLoad(page);
    await switchView(page, 'thinking');

    await postEvent({
      type: 'thinking',
      content: 'Analyzing the user request for prime numbers',
      timestamp: new Date().toISOString(),
      session_id: 'test-session-1',
    });

    await expect(page.locator('#thinking-content')).toContainText('Analyzing the user request', { timeout: 5000 });
    await expect(page.locator('#thinking-count')).not.toHaveText('0');
  });

  test('tool_start event appears in tools panel', async ({ page }) => {
    await freshLoad(page);
    await switchView(page, 'tools');

    await postEvent({
      type: 'tool_start',
      toolName: 'Read',
      input: JSON.stringify({ file_path: '/tmp/test.txt' }),
      timestamp: new Date().toISOString(),
      session_id: 'test-session-2',
    });

    await expect(page.locator('#tools-content')).toContainText('Read', { timeout: 5000 });
    await expect(page.locator('#tools-count')).not.toHaveText('0');
  });

  test('multiple thinking events increment badge count', async ({ page }) => {
    await freshLoad(page);
    await switchView(page, 'thinking');

    for (let i = 0; i < 3; i++) {
      await postEvent({
        type: 'thinking',
        content: `Thinking step ${i + 1}`,
        timestamp: new Date().toISOString(),
        session_id: 'test-session-3',
      });
    }

    await expect(page.locator('#thinking-count')).toHaveText('3', { timeout: 5000 });
  });

  test('events appear in timeline view', async ({ page }) => {
    await freshLoad(page);

    await postEvent({
      type: 'thinking',
      content: 'Timeline test event',
      timestamp: new Date().toISOString(),
      session_id: 'test-session-timeline',
    });

    await expect(page.locator('#timeline-entries')).toContainText('Timeline test event', { timeout: 5000 });
    await expect(page.locator('#timeline-count')).not.toHaveText('0');
  });

  test('event count in footer increments', async ({ page }) => {
    await freshLoad(page);
    const initialCount = await page.locator('#event-count').textContent();

    await postEvent({
      type: 'thinking',
      content: 'Footer count test',
      timestamp: new Date().toISOString(),
      session_id: 'test-footer',
    });

    await expect(page.locator('#event-count')).not.toHaveText(initialCount!, { timeout: 5000 });
  });
});

// ---------------------------------------------------------------------------
// UI Interactions
// ---------------------------------------------------------------------------

test.describe('UI interactions', () => {
  test('auto-scroll toggle works', async ({ page }) => {
    await freshLoad(page);
    const checkbox = page.locator('#auto-scroll');

    await expect(checkbox).toBeChecked();
    await checkbox.uncheck();
    await expect(checkbox).not.toBeChecked();
    await checkbox.check();
    await expect(checkbox).toBeChecked();
  });

  test('thinking filter narrows displayed entries', async ({ page }) => {
    await freshLoad(page);
    await switchView(page, 'thinking');

    await postEvent({
      type: 'thinking',
      content: 'Alpha analysis complete',
      timestamp: new Date().toISOString(),
      session_id: 'test-filter-1',
    });
    await postEvent({
      type: 'thinking',
      content: 'Beta evaluation started',
      timestamp: new Date().toISOString(),
      session_id: 'test-filter-1',
    });

    await expect(page.locator('#thinking-count')).toHaveText('2', { timeout: 5000 });

    const filterInput = page.locator('#thinking-filter');
    await filterInput.fill('Alpha');

    await expect(page.locator('#thinking-content')).toContainText('Alpha');
    await expect(page.locator('#thinking-filter-clear')).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Theme Toggle
// ---------------------------------------------------------------------------

test.describe('Theme toggle', () => {
  test('theme toggle container is present', async ({ page }) => {
    await freshLoad(page);
    await expect(page.locator('#theme-toggle-container')).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Keyboard Shortcuts (view switching - lowercase keys)
// ---------------------------------------------------------------------------

test.describe('Keyboard shortcuts', () => {
  test('t key switches to thinking view', async ({ page }) => {
    await freshLoad(page);
    await expect(page.locator('.panel-timeline')).toBeVisible();

    await page.keyboard.press('t');
    await expect(page.locator('.panel-thinking')).toBeVisible();
    await expect(page.locator('.panel-timeline')).toBeHidden();
  });

  test('o key switches to tools view', async ({ page }) => {
    await freshLoad(page);
    await page.keyboard.press('o');
    await expect(page.locator('.panel-tools')).toBeVisible();
  });

  test('l key switches to timeline view', async ({ page }) => {
    await freshLoad(page);
    await switchView(page, 'thinking');
    await expect(page.locator('.panel-thinking')).toBeVisible();

    await page.keyboard.press('l');
    await expect(page.locator('.panel-timeline')).toBeVisible();
  });

  test('h key switches to hooks view', async ({ page }) => {
    await freshLoad(page);
    await page.keyboard.press('h');
    await expect(page.locator('.panel-hooks')).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Security
// ---------------------------------------------------------------------------

test.describe('Security headers', () => {
  test('dashboard serves CSP header', async ({ page }) => {
    const response = await page.goto('/');
    const csp = response?.headers()['content-security-policy'];
    expect(csp).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Event Endpoint (no browser needed)
// ---------------------------------------------------------------------------

test.describe('Event endpoint', () => {
  test('POST /event returns 200 for valid event', async () => {
    const res = await postEvent({
      type: 'thinking',
      content: 'test',
      timestamp: new Date().toISOString(),
      session_id: 'endpoint-test',
    });
    expect(res.status).toBe(200);
  });

  test('GET /health returns 200', async () => {
    const res = await fetch('http://127.0.0.1:3355/health');
    expect(res.status).toBe(200);
  });
});
