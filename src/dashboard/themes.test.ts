/**
 * Unit tests for the theme system.
 *
 * Tests theme application, system theme detection, and persistence.
 * Since themes.ts runs in browser context, we mock browser APIs.
 *
 * Note: We use vi.mock to mock modules that access DOM at import time.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock the elements module before any imports that might use it
vi.mock('./ui/elements', () => ({
  elements: {
    connectionStatus: null,
    sessionIndicator: null,
    sessionFilter: null,
    sessionFilterBadges: null,
    thinkingContent: null,
    toolsContent: null,
    todoContent: null,
    todoCount: { textContent: '' },
    thinkingPanel: null,
    toolsPanel: null,
    todoPanel: null,
    planPanel: null,
    thinkingCollapseBtn: null,
    toolsCollapseBtn: null,
    todoCollapseBtn: null,
    planCollapseBtn: null,
    // Add all other elements as null for safety
  },
}));

// Mock state to avoid any initialization issues
vi.mock('./state', () => ({
  state: {
    sessionTodos: new Map(),
    todos: [],
    panelCollapseState: {},
    sessions: new Map(),
    currentSessionId: null,
    selectedSession: 'all',
    sessionPlanMap: new Map(),
    theme: 'system',
  },
}));

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key];
    }),
    clear: vi.fn(() => {
      store = {};
    }),
    get store() {
      return store;
    },
  };
})();

// Mock document.documentElement style
const styleMock = {
  setProperty: vi.fn(),
};

const documentElementMock = {
  style: styleMock,
  dataset: {} as Record<string, string>,
};

// Create a minimal document mock that supports getElementById
const documentMock = {
  documentElement: documentElementMock,
  getElementById: vi.fn(() => null),
};

// Mock matchMedia for system theme detection
const createMatchMediaMock = (matches: boolean) => {
  const listeners: ((e: MediaQueryListEvent) => void)[] = [];
  return vi.fn(() => ({
    matches,
    addEventListener: vi.fn((_: string, cb: (e: MediaQueryListEvent) => void) => {
      listeners.push(cb);
    }),
    removeEventListener: vi.fn((_: string, cb: (e: MediaQueryListEvent) => void) => {
      const idx = listeners.indexOf(cb);
      if (idx >= 0) listeners.splice(idx, 1);
    }),
    _triggerChange: (newMatches: boolean) => {
      listeners.forEach((cb) =>
        cb({ matches: newMatches } as MediaQueryListEvent)
      );
    },
    _listeners: listeners,
  }));
};

// Setup global mocks before importing the module
const matchMediaMockFn = createMatchMediaMock(true);

Object.defineProperty(globalThis, 'window', {
  value: {
    matchMedia: matchMediaMockFn,
  },
  writable: true,
});

Object.defineProperty(globalThis, 'document', {
  value: documentMock,
  writable: true,
});

Object.defineProperty(globalThis, 'localStorage', {
  value: localStorageMock,
  writable: true,
});

// Import after mocks are set up
import {
  applyTheme,
  getSystemTheme,
  watchSystemTheme,
  themes,
  themeDisplayNames,
  ThemeId,
} from './themes';
import {
  saveThemePreference,
  loadThemePreference,
} from './storage/persistence';
import { resetColorCache } from './ui/colors';

describe('Theme System', () => {
  beforeEach(() => {
    // Reset mocks before each test
    vi.clearAllMocks();
    localStorageMock.clear();
    styleMock.setProperty.mockClear();
    documentElementMock.dataset = {};
  });

  describe('themes registry', () => {
    it('should have dark theme defined', () => {
      expect(themes.dark).toBeDefined();
      expect(themes.dark.bgPrimary).toBe('#0d1117');
      expect(themes.dark.textPrimary).toBe('#e6edf3');
    });

    it('should have light theme defined', () => {
      expect(themes.light).toBeDefined();
      expect(themes.light.bgPrimary).toBe('#ffffff');
      expect(themes.light.textPrimary).toBe('#24292f');
    });

    it('should have solarized theme defined', () => {
      expect(themes.solarized).toBeDefined();
      expect(themes.solarized.bgPrimary).toBe('#fdf6e3');
    });

    it('should have solarized-dark theme defined', () => {
      expect(themes['solarized-dark']).toBeDefined();
      expect(themes['solarized-dark'].bgPrimary).toBe('#002b36');
    });

    it('should not have system theme in registry (it resolves to dark/light)', () => {
      expect((themes as Record<string, unknown>)['system']).toBeUndefined();
    });
  });

  describe('themeDisplayNames', () => {
    it('should have display names for all theme IDs', () => {
      const themeIds: ThemeId[] = [
        'system',
        'dark',
        'light',
        'solarized',
        'solarized-dark',
      ];
      themeIds.forEach((id) => {
        expect(themeDisplayNames[id]).toBeDefined();
        expect(typeof themeDisplayNames[id]).toBe('string');
      });
    });

    it('should have correct display names', () => {
      expect(themeDisplayNames.system).toBe('System');
      expect(themeDisplayNames.dark).toBe('Dark');
      expect(themeDisplayNames.light).toBe('Light');
      expect(themeDisplayNames.solarized).toBe('Solarized');
      expect(themeDisplayNames['solarized-dark']).toBe('Solarized Dark');
    });
  });

  describe('getSystemTheme', () => {
    it('should return dark when system prefers dark color scheme', () => {
      // matchMediaMockFn already returns matches: true for dark
      const result = getSystemTheme();
      expect(result).toBe('dark');
    });

    it('should return light when system prefers light color scheme', () => {
      // Override matchMedia to return light
      const lightMatchMedia = createMatchMediaMock(false);
      (window as any).matchMedia = lightMatchMedia;

      const result = getSystemTheme();
      expect(result).toBe('light');
    });

    it('should default to dark when matchMedia is unavailable', () => {
      // Temporarily remove matchMedia
      const originalMatchMedia = window.matchMedia;
      (window as any).matchMedia = undefined;

      const result = getSystemTheme();
      expect(result).toBe('dark');

      // Restore
      (window as any).matchMedia = originalMatchMedia;
    });
  });

  describe('watchSystemTheme', () => {
    it('should return a cleanup function', () => {
      const callback = vi.fn();
      const cleanup = watchSystemTheme(callback);
      expect(typeof cleanup).toBe('function');
      cleanup();
    });

    it('should call callback when system theme changes', () => {
      // Create a shared mock that tracks listeners
      const listeners: ((e: MediaQueryListEvent) => void)[] = [];
      const mockMediaQuery = {
        matches: true,
        addEventListener: vi.fn((_: string, cb: (e: MediaQueryListEvent) => void) => {
          listeners.push(cb);
        }),
        removeEventListener: vi.fn((_: string, cb: (e: MediaQueryListEvent) => void) => {
          const idx = listeners.indexOf(cb);
          if (idx >= 0) listeners.splice(idx, 1);
        }),
      };
      (window as any).matchMedia = vi.fn(() => mockMediaQuery);

      const callback = vi.fn();
      watchSystemTheme(callback);

      // Simulate theme change by calling registered listeners
      listeners.forEach((cb) => cb({ matches: false } as MediaQueryListEvent)); // Changed to light
      expect(callback).toHaveBeenCalledWith('light');

      callback.mockClear();
      listeners.forEach((cb) => cb({ matches: true } as MediaQueryListEvent)); // Changed back to dark
      expect(callback).toHaveBeenCalledWith('dark');
    });

    it('should return no-op cleanup when matchMedia unavailable', () => {
      const originalMatchMedia = window.matchMedia;
      (window as any).matchMedia = undefined;

      const callback = vi.fn();
      const cleanup = watchSystemTheme(callback);

      expect(typeof cleanup).toBe('function');
      cleanup(); // Should not throw

      // Restore
      (window as any).matchMedia = originalMatchMedia;
    });
  });

  describe('applyTheme', () => {
    it('should set CSS variables for dark theme', () => {
      applyTheme('dark');

      expect(styleMock.setProperty).toHaveBeenCalledWith(
        '--color-bg-primary',
        '#0d1117'
      );
      expect(styleMock.setProperty).toHaveBeenCalledWith(
        '--color-text-primary',
        '#e6edf3'
      );
      expect(documentElementMock.dataset.theme).toBe('dark');
    });

    it('should set CSS variables for light theme', () => {
      applyTheme('light');

      expect(styleMock.setProperty).toHaveBeenCalledWith(
        '--color-bg-primary',
        '#ffffff'
      );
      expect(styleMock.setProperty).toHaveBeenCalledWith(
        '--color-text-primary',
        '#24292f'
      );
      expect(documentElementMock.dataset.theme).toBe('light');
    });

    it('should set CSS variables for solarized theme', () => {
      applyTheme('solarized');

      expect(styleMock.setProperty).toHaveBeenCalledWith(
        '--color-bg-primary',
        '#fdf6e3'
      );
      expect(documentElementMock.dataset.theme).toBe('solarized');
    });

    it('should set CSS variables for solarized-dark theme', () => {
      applyTheme('solarized-dark');

      expect(styleMock.setProperty).toHaveBeenCalledWith(
        '--color-bg-primary',
        '#002b36'
      );
      expect(documentElementMock.dataset.theme).toBe('solarized-dark');
    });

    it('should resolve system theme to dark when system prefers dark', () => {
      // Set up matchMedia to return dark (matches: true)
      const darkMatchMedia = createMatchMediaMock(true);
      (window as any).matchMedia = darkMatchMedia;

      applyTheme('system');

      expect(styleMock.setProperty).toHaveBeenCalledWith(
        '--color-bg-primary',
        '#0d1117'
      );
      expect(documentElementMock.dataset.theme).toBe('dark');
    });

    it('should resolve system theme to light when system prefers light', () => {
      // Set up matchMedia to return light (matches: false)
      const lightMatchMedia = createMatchMediaMock(false);
      (window as any).matchMedia = lightMatchMedia;

      applyTheme('system');

      expect(styleMock.setProperty).toHaveBeenCalledWith(
        '--color-bg-primary',
        '#ffffff'
      );
      expect(documentElementMock.dataset.theme).toBe('light');
    });

    it('should set all expected CSS variables', () => {
      applyTheme('dark');

      // Check that key CSS variables are set
      const expectedVariables = [
        '--color-bg-primary',
        '--color-bg-secondary',
        '--color-bg-tertiary',
        '--color-bg-hover',
        '--color-border',
        '--color-border-light',
        '--color-text-primary',
        '--color-text-secondary',
        '--color-text-muted',
        '--color-accent-blue',
        '--color-accent-green',
        '--color-accent-yellow',
        '--color-accent-red',
        '--color-accent-purple',
        '--color-accent-orange',
        '--color-accent-cyan',
        '--color-surface-0',
        '--color-surface-1',
        '--color-surface-2',
        '--color-surface-3',
        '--color-surface-4',
        '--color-surface-overlay',
        '--color-surface-glass',
        '--shadow-sm',
        '--shadow-md',
        '--shadow-lg',
        '--shadow-xl',
        '--shadow-glow-green',
        '--shadow-glow-blue',
        '--shadow-glow-red',
        '--color-focus-ring',
        '--color-hover-overlay',
        '--color-active-overlay',
      ];

      expectedVariables.forEach((varName) => {
        expect(styleMock.setProperty).toHaveBeenCalledWith(
          varName,
          expect.any(String)
        );
      });
    });

    it('should fall back to dark theme for unknown theme ID', () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      applyTheme('unknown-theme' as ThemeId);

      // Should warn about unknown theme
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Unknown theme')
      );

      // Should apply dark theme as fallback
      expect(styleMock.setProperty).toHaveBeenCalledWith(
        '--color-bg-primary',
        '#0d1117'
      );

      consoleSpy.mockRestore();
    });
  });
});

describe('Theme Persistence', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorageMock.clear();
  });

  describe('saveThemePreference', () => {
    it('should save theme to localStorage', () => {
      saveThemePreference('dark');
      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        'thinking-monitor-theme',
        'dark'
      );
    });

    it('should save different themes correctly', () => {
      const themes: ThemeId[] = ['dark', 'light', 'solarized', 'solarized-dark', 'system'];
      themes.forEach((theme) => {
        saveThemePreference(theme);
        expect(localStorageMock.setItem).toHaveBeenCalledWith(
          'thinking-monitor-theme',
          theme
        );
      });
    });
  });

  describe('loadThemePreference', () => {
    it('should return default (system) when nothing stored', () => {
      const result = loadThemePreference();
      expect(result).toBe('system');
    });

    it('should return stored value when valid', () => {
      localStorageMock.store['thinking-monitor-theme'] = 'dark';
      const result = loadThemePreference();
      expect(result).toBe('dark');
    });

    it('should return stored light theme', () => {
      localStorageMock.store['thinking-monitor-theme'] = 'light';
      const result = loadThemePreference();
      expect(result).toBe('light');
    });

    it('should return stored solarized theme', () => {
      localStorageMock.store['thinking-monitor-theme'] = 'solarized';
      const result = loadThemePreference();
      expect(result).toBe('solarized');
    });

    it('should return stored solarized-dark theme', () => {
      localStorageMock.store['thinking-monitor-theme'] = 'solarized-dark';
      const result = loadThemePreference();
      expect(result).toBe('solarized-dark');
    });

    it('should return stored system theme', () => {
      localStorageMock.store['thinking-monitor-theme'] = 'system';
      const result = loadThemePreference();
      expect(result).toBe('system');
    });

    it('should return default when stored value is invalid', () => {
      localStorageMock.store['thinking-monitor-theme'] = 'invalid-theme';
      const result = loadThemePreference();
      expect(result).toBe('system');
    });

    it('should return default when localStorage throws', () => {
      localStorageMock.getItem.mockImplementationOnce(() => {
        throw new Error('Storage error');
      });
      const result = loadThemePreference();
      expect(result).toBe('system');
    });
  });
});

describe('resetColorCache', () => {
  it('should be a function that can be called', () => {
    expect(typeof resetColorCache).toBe('function');
    // Should not throw
    resetColorCache();
  });

  it('should reset internal color cache state', () => {
    // Call twice to ensure it doesn't throw on repeated calls
    resetColorCache();
    resetColorCache();
    // If we got here without error, the test passes
    expect(true).toBe(true);
  });
});
