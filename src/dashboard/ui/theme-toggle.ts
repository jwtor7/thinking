/**
 * Theme Toggle UI Component
 *
 * Dropdown selector for changing the dashboard theme.
 * Supports dark, light, solarized, solarized-dark, and system themes.
 */

import { state } from '../state';
import { ThemeId } from '../types';
import { applyTheme, watchSystemTheme, themeDisplayNames, getSystemTheme } from '../themes';
import { saveThemePreference } from '../storage/persistence';

/**
 * Current system theme watcher cleanup function.
 * Used to stop watching when theme changes away from 'system'.
 */
let systemThemeCleanup: (() => void) | null = null;

/**
 * Theme options in display order.
 */
const THEME_OPTIONS: ThemeId[] = ['system', 'dark', 'light', 'solarized', 'solarized-dark'];

/**
 * Create the theme dropdown element.
 * Returns the container element with the dropdown inside.
 */
function createThemeDropdown(): HTMLElement {
  const container = document.createElement('div');
  container.className = 'theme-toggle';

  const select = document.createElement('select');
  select.id = 'theme-select';
  select.className = 'theme-select';
  select.setAttribute('aria-label', 'Select theme');
  select.title = 'Change color theme';

  // Add options
  for (const themeId of THEME_OPTIONS) {
    const option = document.createElement('option');
    option.value = themeId;
    option.textContent = themeDisplayNames[themeId];
    if (themeId === state.theme) {
      option.selected = true;
    }
    select.appendChild(option);
  }

  container.appendChild(select);
  return container;
}

/**
 * Handle theme selection change.
 * Updates state, applies theme, saves preference, and manages system watcher.
 */
function handleThemeChange(themeId: ThemeId): void {
  // Update state
  state.theme = themeId;

  // Apply theme
  applyTheme(themeId);

  // Save preference
  saveThemePreference(themeId);

  // Manage system theme watcher
  if (systemThemeCleanup) {
    systemThemeCleanup();
    systemThemeCleanup = null;
  }

  if (themeId === 'system') {
    // Start watching for system theme changes
    systemThemeCleanup = watchSystemTheme((systemTheme: 'dark' | 'light') => {
      console.log(`[Theme] System theme changed to: ${systemTheme}`);
      applyTheme('system'); // Re-apply to pick up new system preference
    });
  }
}

/**
 * Initialize the theme toggle dropdown.
 * Creates the dropdown, attaches it to the header, and sets up event listeners.
 *
 * @param initialTheme - The initial theme to select (from storage or default)
 */
export function initThemeToggle(initialTheme: ThemeId): void {
  const container = document.getElementById('theme-toggle-container');
  if (!container) {
    console.warn('[ThemeToggle] Container element not found');
    return;
  }

  // Set initial state
  state.theme = initialTheme;

  // Create and insert dropdown
  const dropdown = createThemeDropdown();
  container.appendChild(dropdown);

  // Get the select element
  const select = dropdown.querySelector('select') as HTMLSelectElement;

  // Handle selection changes
  select.addEventListener('change', () => {
    const selectedTheme = select.value as ThemeId;
    handleThemeChange(selectedTheme);
  });

  // Apply initial theme
  applyTheme(initialTheme);

  // Set up system watcher if using system theme
  if (initialTheme === 'system') {
    systemThemeCleanup = watchSystemTheme((systemTheme: 'dark' | 'light') => {
      console.log(`[Theme] System theme changed to: ${systemTheme}`);
      applyTheme('system');
    });
  }

  console.log(`[ThemeToggle] Initialized with theme: ${initialTheme}${initialTheme === 'system' ? ` (resolved to ${getSystemTheme()})` : ''}`);
}

/**
 * Update the theme dropdown selection programmatically.
 * Use this when the theme is changed from elsewhere (e.g., keyboard shortcut).
 */
export function updateThemeDropdown(themeId: ThemeId): void {
  const select = document.getElementById('theme-select') as HTMLSelectElement | null;
  if (select && select.value !== themeId) {
    select.value = themeId;
  }
}
