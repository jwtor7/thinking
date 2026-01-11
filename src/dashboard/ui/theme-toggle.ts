/**
 * Theme Toggle UI Component
 *
 * Icon button that cycles through themes on click.
 * Supports dark, light, solarized, solarized-dark, and system themes.
 */

import { state } from '../state.ts';
import { ThemeId } from '../types.ts';
import { applyTheme, watchSystemTheme, themeDisplayNames, getSystemTheme } from '../themes.ts';
import { saveThemePreference } from '../storage/persistence.ts';

/**
 * Current system theme watcher cleanup function.
 * Used to stop watching when theme changes away from 'system'.
 */
let systemThemeCleanup: (() => void) | null = null;

/**
 * Theme options in cycling order.
 */
const THEME_OPTIONS: ThemeId[] = ['system', 'dark', 'light', 'solarized', 'solarized-dark'];

/**
 * Icons for each theme.
 */
const THEME_ICONS: Record<ThemeId, string> = {
  system: '◐',      // Half circle (auto)
  dark: '☾',        // Crescent moon
  light: '☀',       // Sun
  solarized: '◑',   // Right half black
  'solarized-dark': '◒', // Upper half black
};

/** Reference to the theme button for updates */
let themeButton: HTMLButtonElement | null = null;

/**
 * Get the next theme in the cycle.
 */
function getNextTheme(currentTheme: ThemeId): ThemeId {
  const currentIndex = THEME_OPTIONS.indexOf(currentTheme);
  const nextIndex = (currentIndex + 1) % THEME_OPTIONS.length;
  return THEME_OPTIONS[nextIndex];
}

/**
 * Create the theme toggle button element.
 * Returns the container element with the button inside.
 */
function createThemeButton(): HTMLElement {
  const container = document.createElement('div');
  container.className = 'theme-toggle';

  const button = document.createElement('button');
  button.id = 'theme-toggle-btn';
  button.className = 'btn btn-icon';
  button.setAttribute('aria-label', `Theme: ${themeDisplayNames[state.theme]}`);
  button.title = `Theme: ${themeDisplayNames[state.theme]} (click to change)`;

  const iconSpan = document.createElement('span');
  iconSpan.className = 'btn-icon-theme';
  iconSpan.textContent = THEME_ICONS[state.theme];

  button.appendChild(iconSpan);
  container.appendChild(button);

  themeButton = button;
  return container;
}

/**
 * Update the theme button display.
 */
function updateThemeButton(themeId: ThemeId): void {
  if (!themeButton) return;

  const iconSpan = themeButton.querySelector('.btn-icon-theme');
  if (iconSpan) {
    iconSpan.textContent = THEME_ICONS[themeId];
  }

  themeButton.setAttribute('aria-label', `Theme: ${themeDisplayNames[themeId]}`);
  themeButton.title = `Theme: ${themeDisplayNames[themeId]} (click to change)`;
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

  // Update button display
  updateThemeButton(themeId);

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
 * Cycle to the next theme.
 */
function cycleTheme(): void {
  const nextTheme = getNextTheme(state.theme);
  handleThemeChange(nextTheme);
  console.log(`[ThemeToggle] Cycled to theme: ${nextTheme}`);
}

/**
 * Initialize the theme toggle button.
 * Creates the button, attaches it to the header, and sets up event listeners.
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

  // Create and insert button
  const buttonContainer = createThemeButton();
  container.appendChild(buttonContainer);

  // Handle clicks to cycle themes
  themeButton?.addEventListener('click', cycleTheme);

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
 * Update the theme button display programmatically.
 * Use this when the theme is changed from elsewhere (e.g., keyboard shortcut).
 */
export function updateThemeDropdown(themeId: ThemeId): void {
  updateThemeButton(themeId);
}
