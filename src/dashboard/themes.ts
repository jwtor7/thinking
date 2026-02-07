/**
 * Theme System for Thinking Monitor Dashboard
 *
 * Supports multiple color themes with OS preference tracking.
 * Themes are applied by updating CSS custom properties on document.documentElement.
 */

import { resetColorCache } from './ui/colors.ts';
import { debug } from './utils/debug.ts';

// ============================================
// Types
// ============================================

export type ThemeId = 'dark' | 'light' | 'solarized' | 'solarized-dark' | 'system';

/**
 * Theme color palette definition.
 * Maps CSS variable names to color values.
 */
interface ThemeColors {
  // Background colors
  bgPrimary: string;
  bgSecondary: string;
  bgTertiary: string;
  bgHover: string;

  // Border colors
  border: string;
  borderLight: string;

  // Text colors
  textPrimary: string;
  textSecondary: string;
  textMuted: string;

  // Accent colors
  accentBlue: string;
  accentGreen: string;
  accentYellow: string;
  accentRed: string;
  accentPurple: string;
  accentOrange: string;
  accentCyan: string;

  // Surface elevation
  surface0: string;
  surface1: string;
  surface2: string;
  surface3: string;
  surface4: string;
  surfaceOverlay: string;
  surfaceGlass: string;

  // Shadows (adjusted for light/dark)
  shadowSm: string;
  shadowMd: string;
  shadowLg: string;
  shadowXl: string;
  shadowGlowGreen: string;
  shadowGlowBlue: string;
  shadowGlowRed: string;

  // Interaction states
  focusRing: string;
  hoverOverlay: string;
  activeOverlay: string;

  // Badge colors (background + text pairs for WCAG AA compliance)
  badgeGreenBg: string;
  badgeGreenText: string;
  badgeYellowBg: string;
  badgeYellowText: string;
  badgeOrangeBg: string;
  badgeOrangeText: string;
  badgeBlueBg: string;
  badgeBlueText: string;
  badgePurpleBg: string;
  badgePurpleText: string;
  badgeCyanBg: string;
  badgeCyanText: string;
  badgeRedBg: string;
  badgeRedText: string;
  badgeGrayBg: string;
  badgeGrayText: string;
}

// ============================================
// Theme Definitions
// ============================================

/**
 * Dark theme - the original/default theme from styles.css
 */
const darkTheme: ThemeColors = {
  bgPrimary: '#0d1117',
  bgSecondary: '#161b22',
  bgTertiary: '#21262d',
  bgHover: '#30363d',

  border: '#30363d',
  borderLight: '#21262d',

  textPrimary: '#e6edf3',
  textSecondary: '#8b949e',
  textMuted: '#848d97',

  accentBlue: '#58a6ff',
  accentGreen: '#3fb950',
  accentYellow: '#d29922',
  accentRed: '#f85149',
  accentPurple: '#a371f7',
  accentOrange: '#db6d28',
  accentCyan: '#39c5cf',

  surface0: '#0d1117',
  surface1: '#161b22',
  surface2: '#1c2128',
  surface3: '#21262d',
  surface4: '#282e36',
  surfaceOverlay: 'rgba(22, 27, 34, 0.8)',
  surfaceGlass: 'rgba(22, 27, 34, 0.6)',

  shadowSm: '0 1px 2px rgba(0, 0, 0, 0.3)',
  shadowMd: '0 4px 6px rgba(0, 0, 0, 0.4)',
  shadowLg: '0 10px 15px rgba(0, 0, 0, 0.5)',
  shadowXl: '0 20px 25px rgba(0, 0, 0, 0.6)',
  shadowGlowGreen: '0 0 12px rgba(63, 185, 80, 0.4)',
  shadowGlowBlue: '0 0 12px rgba(88, 166, 255, 0.4)',
  shadowGlowRed: '0 0 12px rgba(248, 81, 73, 0.4)',

  focusRing: 'rgba(88, 166, 255, 0.4)',
  hoverOverlay: 'rgba(255, 255, 255, 0.05)',
  activeOverlay: 'rgba(255, 255, 255, 0.1)',

  // Badge colors - darker backgrounds with white text for dark theme
  badgeGreenBg: '#238636',
  badgeGreenText: '#ffffff',
  badgeYellowBg: '#9e6a03',
  badgeYellowText: '#ffffff',
  badgeOrangeBg: '#9e6a03',
  badgeOrangeText: '#ffffff',
  badgeBlueBg: '#1f6feb',
  badgeBlueText: '#ffffff',
  badgePurpleBg: '#8957e5',
  badgePurpleText: '#ffffff',
  badgeCyanBg: '#0d7d87',
  badgeCyanText: '#ffffff',
  badgeRedBg: '#cf222e',
  badgeRedText: '#ffffff',
  badgeGrayBg: '#6e7681',
  badgeGrayText: '#ffffff',
};

/**
 * Light theme - bright and clean
 */
const lightTheme: ThemeColors = {
  bgPrimary: '#ffffff',
  bgSecondary: '#f6f8fa',
  bgTertiary: '#eaeef2',
  bgHover: '#d8dee4',

  border: '#d0d7de',
  borderLight: '#eaeef2',

  textPrimary: '#24292f',
  textSecondary: '#57606a',
  textMuted: '#6e7781',

  accentBlue: '#0969da',
  accentGreen: '#1a7f37',
  accentYellow: '#9a6700',
  accentRed: '#cf222e',
  accentPurple: '#8250df',
  accentOrange: '#bc4c00',
  accentCyan: '#0598bc',

  surface0: '#ffffff',
  surface1: '#f6f8fa',
  surface2: '#eaeef2',
  surface3: '#d8dee4',
  surface4: '#ced5dc',
  surfaceOverlay: 'rgba(246, 248, 250, 0.9)',
  surfaceGlass: 'rgba(246, 248, 250, 0.7)',

  shadowSm: '0 1px 2px rgba(0, 0, 0, 0.1)',
  shadowMd: '0 4px 6px rgba(0, 0, 0, 0.12)',
  shadowLg: '0 10px 15px rgba(0, 0, 0, 0.15)',
  shadowXl: '0 20px 25px rgba(0, 0, 0, 0.18)',
  shadowGlowGreen: '0 0 12px rgba(26, 127, 55, 0.3)',
  shadowGlowBlue: '0 0 12px rgba(9, 105, 218, 0.3)',
  shadowGlowRed: '0 0 12px rgba(207, 34, 46, 0.3)',

  focusRing: 'rgba(9, 105, 218, 0.4)',
  hoverOverlay: 'rgba(0, 0, 0, 0.04)',
  activeOverlay: 'rgba(0, 0, 0, 0.08)',

  // Badge colors - pastel backgrounds with dark text for light theme
  badgeGreenBg: 'rgba(26, 127, 55, 0.12)',
  badgeGreenText: '#116329',
  badgeYellowBg: 'rgba(154, 103, 0, 0.12)',
  badgeYellowText: '#7a5200',
  badgeOrangeBg: 'rgba(188, 76, 0, 0.12)',
  badgeOrangeText: '#953800',
  badgeBlueBg: 'rgba(9, 105, 218, 0.12)',
  badgeBlueText: '#0550ae',
  badgePurpleBg: 'rgba(130, 80, 223, 0.12)',
  badgePurpleText: '#6639ba',
  badgeCyanBg: 'rgba(5, 152, 188, 0.12)',
  badgeCyanText: '#046d8b',
  badgeRedBg: 'rgba(207, 34, 46, 0.12)',
  badgeRedText: '#a40e26',
  badgeGrayBg: 'rgba(110, 119, 129, 0.12)',
  badgeGrayText: '#57606a',
};

/**
 * Solarized Light theme - warm and easy on the eyes
 * Uses darker text colors (base02/base01/base00) for better contrast on light backgrounds
 */
const solarizedTheme: ThemeColors = {
  bgPrimary: '#fdf6e3',
  bgSecondary: '#eee8d5',
  bgTertiary: '#e5dfc7',
  bgHover: '#d9d2b9',

  border: '#d9d2b9',
  borderLight: '#eee8d5',

  // Higher contrast: using base02, base01, base00 for darker text
  textPrimary: '#073642',    // base02 - darkest text for maximum contrast
  textSecondary: '#586e75',  // base01 - secondary emphasis
  textMuted: '#657b83',      // base00 - muted but still readable

  accentBlue: '#268bd2',
  accentGreen: '#859900',
  accentYellow: '#b58900',
  accentRed: '#dc322f',
  accentPurple: '#6c71c4',
  accentOrange: '#cb4b16',
  accentCyan: '#2aa198',

  surface0: '#fdf6e3',
  surface1: '#eee8d5',
  surface2: '#e5dfc7',
  surface3: '#d9d2b9',
  surface4: '#ccc5ab',
  surfaceOverlay: 'rgba(238, 232, 213, 0.9)',
  surfaceGlass: 'rgba(238, 232, 213, 0.7)',

  shadowSm: '0 1px 2px rgba(0, 0, 0, 0.08)',
  shadowMd: '0 4px 6px rgba(0, 0, 0, 0.1)',
  shadowLg: '0 10px 15px rgba(0, 0, 0, 0.12)',
  shadowXl: '0 20px 25px rgba(0, 0, 0, 0.15)',
  shadowGlowGreen: '0 0 12px rgba(133, 153, 0, 0.3)',
  shadowGlowBlue: '0 0 12px rgba(38, 139, 210, 0.3)',
  shadowGlowRed: '0 0 12px rgba(220, 50, 47, 0.3)',

  focusRing: 'rgba(38, 139, 210, 0.4)',
  hoverOverlay: 'rgba(0, 0, 0, 0.04)',
  activeOverlay: 'rgba(0, 0, 0, 0.08)',

  // Badge colors - warm pastel backgrounds with dark text for solarized light
  badgeGreenBg: 'rgba(133, 153, 0, 0.15)',
  badgeGreenText: '#5b6a00',
  badgeYellowBg: 'rgba(181, 137, 0, 0.15)',
  badgeYellowText: '#8a6800',
  badgeOrangeBg: 'rgba(203, 75, 22, 0.15)',
  badgeOrangeText: '#a33d0f',
  badgeBlueBg: 'rgba(38, 139, 210, 0.15)',
  badgeBlueText: '#1a6091',
  badgePurpleBg: 'rgba(108, 113, 196, 0.15)',
  badgePurpleText: '#494d8a',
  badgeCyanBg: 'rgba(42, 161, 152, 0.15)',
  badgeCyanText: '#1a6b65',
  badgeRedBg: 'rgba(220, 50, 47, 0.15)',
  badgeRedText: '#a81f1c',
  badgeGrayBg: 'rgba(101, 123, 131, 0.15)',
  badgeGrayText: '#586e75',
};

/**
 * Solarized Dark theme - muted and atmospheric
 * Uses lighter text colors (base2/base1/base0) for better contrast on dark backgrounds
 */
const solarizedDarkTheme: ThemeColors = {
  bgPrimary: '#002b36',
  bgSecondary: '#073642',
  bgTertiary: '#0a4555',
  bgHover: '#0d5568',

  border: '#0d5568',
  borderLight: '#073642',

  // Higher contrast: using base2, base1, base0 for lighter text
  textPrimary: '#eee8d5',    // base2 - lightest text for maximum contrast
  textSecondary: '#93a1a1',  // base1 - secondary emphasis
  textMuted: '#839496',      // base0 - muted but still readable

  accentBlue: '#268bd2',
  accentGreen: '#859900',
  accentYellow: '#b58900',
  accentRed: '#dc322f',
  accentPurple: '#6c71c4',
  accentOrange: '#cb4b16',
  accentCyan: '#2aa198',

  surface0: '#002b36',
  surface1: '#073642',
  surface2: '#0a4555',
  surface3: '#0d5568',
  surface4: '#10667b',
  surfaceOverlay: 'rgba(7, 54, 66, 0.9)',
  surfaceGlass: 'rgba(7, 54, 66, 0.7)',

  shadowSm: '0 1px 2px rgba(0, 0, 0, 0.3)',
  shadowMd: '0 4px 6px rgba(0, 0, 0, 0.4)',
  shadowLg: '0 10px 15px rgba(0, 0, 0, 0.5)',
  shadowXl: '0 20px 25px rgba(0, 0, 0, 0.6)',
  shadowGlowGreen: '0 0 12px rgba(133, 153, 0, 0.4)',
  shadowGlowBlue: '0 0 12px rgba(38, 139, 210, 0.4)',
  shadowGlowRed: '0 0 12px rgba(220, 50, 47, 0.4)',

  focusRing: 'rgba(38, 139, 210, 0.4)',
  hoverOverlay: 'rgba(255, 255, 255, 0.05)',
  activeOverlay: 'rgba(255, 255, 255, 0.1)',

  // Badge colors - muted solarized backgrounds with light text for dark theme
  badgeGreenBg: '#5b6a00',
  badgeGreenText: '#eee8d5',
  badgeYellowBg: '#8a6800',
  badgeYellowText: '#eee8d5',
  badgeOrangeBg: '#a33d0f',
  badgeOrangeText: '#eee8d5',
  badgeBlueBg: '#1a6091',
  badgeBlueText: '#eee8d5',
  badgePurpleBg: '#5458a0',
  badgePurpleText: '#eee8d5',
  badgeCyanBg: '#1a7a73',
  badgeCyanText: '#eee8d5',
  badgeRedBg: '#a81f1c',
  badgeRedText: '#eee8d5',
  badgeGrayBg: '#586e75',
  badgeGrayText: '#eee8d5',
};

/**
 * Theme registry mapping theme IDs to color palettes.
 * 'system' is not included as it resolves to 'dark' or 'light'.
 */
export const themes: Record<Exclude<ThemeId, 'system'>, ThemeColors> = {
  dark: darkTheme,
  light: lightTheme,
  solarized: solarizedTheme,
  'solarized-dark': solarizedDarkTheme,
};

/**
 * Theme display names for the UI dropdown.
 */
export const themeDisplayNames: Record<ThemeId, string> = {
  system: 'System',
  dark: 'Dark',
  light: 'Light',
  solarized: 'Solarized',
  'solarized-dark': 'Solarized Dark',
};

// ============================================
// System Theme Detection
// ============================================

/**
 * Get the system's preferred color scheme.
 * Returns 'dark' or 'light' based on the OS/browser preference.
 */
export function getSystemTheme(): 'dark' | 'light' {
  if (typeof window !== 'undefined' && window.matchMedia) {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return 'dark'; // Default to dark if matchMedia is not available
}

/**
 * Watch for system theme changes and call the callback when they occur.
 * Returns a cleanup function to stop watching.
 *
 * @param callback - Function to call when system theme changes
 * @returns Cleanup function to remove the listener
 */
export function watchSystemTheme(callback: (theme: 'dark' | 'light') => void): () => void {
  if (typeof window === 'undefined' || !window.matchMedia) {
    return () => {}; // No-op cleanup for SSR or unsupported browsers
  }

  const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

  const handleChange = (e: MediaQueryListEvent) => {
    callback(e.matches ? 'dark' : 'light');
  };

  // Modern browsers use addEventListener
  mediaQuery.addEventListener('change', handleChange);

  // Return cleanup function
  return () => {
    mediaQuery.removeEventListener('change', handleChange);
  };
}

// ============================================
// Theme Application
// ============================================

/**
 * Apply a theme by updating CSS custom properties on the document root.
 * If themeId is 'system', resolves to the current OS preference.
 *
 * @param themeId - The theme to apply
 */
export function applyTheme(themeId: ThemeId): void {
  // Resolve 'system' to actual theme
  const resolvedThemeId: Exclude<ThemeId, 'system'> =
    themeId === 'system' ? getSystemTheme() : themeId;

  const colors = themes[resolvedThemeId];
  if (!colors) {
    console.warn(`[Themes] Unknown theme: ${themeId}, falling back to dark`);
    return applyTheme('dark');
  }

  const root = document.documentElement;

  // Apply background colors
  root.style.setProperty('--color-bg-primary', colors.bgPrimary);
  root.style.setProperty('--color-bg-secondary', colors.bgSecondary);
  root.style.setProperty('--color-bg-tertiary', colors.bgTertiary);
  root.style.setProperty('--color-bg-hover', colors.bgHover);

  // Apply border colors
  root.style.setProperty('--color-border', colors.border);
  root.style.setProperty('--color-border-light', colors.borderLight);

  // Apply text colors
  root.style.setProperty('--color-text-primary', colors.textPrimary);
  root.style.setProperty('--color-text-secondary', colors.textSecondary);
  root.style.setProperty('--color-text-muted', colors.textMuted);

  // Apply accent colors
  root.style.setProperty('--color-accent-blue', colors.accentBlue);
  root.style.setProperty('--color-accent-green', colors.accentGreen);
  root.style.setProperty('--color-accent-yellow', colors.accentYellow);
  root.style.setProperty('--color-accent-red', colors.accentRed);
  root.style.setProperty('--color-accent-purple', colors.accentPurple);
  root.style.setProperty('--color-accent-orange', colors.accentOrange);
  root.style.setProperty('--color-accent-cyan', colors.accentCyan);

  // Apply surface elevation colors
  root.style.setProperty('--color-surface-0', colors.surface0);
  root.style.setProperty('--color-surface-1', colors.surface1);
  root.style.setProperty('--color-surface-2', colors.surface2);
  root.style.setProperty('--color-surface-3', colors.surface3);
  root.style.setProperty('--color-surface-4', colors.surface4);
  root.style.setProperty('--color-surface-overlay', colors.surfaceOverlay);
  root.style.setProperty('--color-surface-glass', colors.surfaceGlass);

  // Apply shadow colors
  root.style.setProperty('--shadow-sm', colors.shadowSm);
  root.style.setProperty('--shadow-md', colors.shadowMd);
  root.style.setProperty('--shadow-lg', colors.shadowLg);
  root.style.setProperty('--shadow-xl', colors.shadowXl);
  root.style.setProperty('--shadow-glow-green', colors.shadowGlowGreen);
  root.style.setProperty('--shadow-glow-blue', colors.shadowGlowBlue);
  root.style.setProperty('--shadow-glow-red', colors.shadowGlowRed);

  // Apply interaction state colors
  root.style.setProperty('--color-focus-ring', colors.focusRing);
  root.style.setProperty('--color-hover-overlay', colors.hoverOverlay);
  root.style.setProperty('--color-active-overlay', colors.activeOverlay);

  // Apply badge colors (WCAG AA compliant)
  root.style.setProperty('--color-badge-green-bg', colors.badgeGreenBg);
  root.style.setProperty('--color-badge-green-text', colors.badgeGreenText);
  root.style.setProperty('--color-badge-yellow-bg', colors.badgeYellowBg);
  root.style.setProperty('--color-badge-yellow-text', colors.badgeYellowText);
  root.style.setProperty('--color-badge-orange-bg', colors.badgeOrangeBg);
  root.style.setProperty('--color-badge-orange-text', colors.badgeOrangeText);
  root.style.setProperty('--color-badge-blue-bg', colors.badgeBlueBg);
  root.style.setProperty('--color-badge-blue-text', colors.badgeBlueText);
  root.style.setProperty('--color-badge-purple-bg', colors.badgePurpleBg);
  root.style.setProperty('--color-badge-purple-text', colors.badgePurpleText);
  root.style.setProperty('--color-badge-cyan-bg', colors.badgeCyanBg);
  root.style.setProperty('--color-badge-cyan-text', colors.badgeCyanText);
  root.style.setProperty('--color-badge-red-bg', colors.badgeRedBg);
  root.style.setProperty('--color-badge-red-text', colors.badgeRedText);
  root.style.setProperty('--color-badge-gray-bg', colors.badgeGrayBg);
  root.style.setProperty('--color-badge-gray-text', colors.badgeGrayText);

  // Set a data attribute for CSS selectors that might need it
  root.dataset.theme = resolvedThemeId;

  // Reset color cache so session/agent colors are re-read from updated CSS variables
  resetColorCache();

  debug(`[Themes] Applied theme: ${themeId}${themeId === 'system' ? ` (resolved to ${resolvedThemeId})` : ''}`);
}
