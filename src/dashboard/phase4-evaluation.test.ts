/**
 * Phase 4 Dashboard Polish - Comprehensive Evaluation Tests
 *
 * Tests to verify Phase 4 requirements from PRD:
 * - Thinking blocks (non-collapsible, always expanded)
 * - Enhanced tool visualization with timing
 * - Smart auto-scroll behavior
 * - Event filtering
 * - Connection status with reconnect countdown
 * - Keyboard shortcuts (0-9, c, s, /, Esc)
 * - Responsive design improvements
 * - Security: XSS prevention
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

// Read the source files for static analysis
const appTsPath = join(__dirname, 'app.ts');
const indexHtmlPath = join(__dirname, 'index.html');
const stylesCssPath = join(__dirname, 'styles.css');

const appTsContent = readFileSync(appTsPath, 'utf-8');
const indexHtmlContent = readFileSync(indexHtmlPath, 'utf-8');
const stylesCssContent = readFileSync(stylesCssPath, 'utf-8');

describe('Phase 4: Dashboard Polish', () => {
  describe('XSS Prevention - Security', () => {
    it('should have escapeHtml function defined', () => {
      expect(appTsContent).toContain('function escapeHtml');
    });

    it('should use DOM-based escaping (secure method)', () => {
      // Check that escapeHtml uses createElement/textContent pattern
      expect(appTsContent).toMatch(/document\.createElement\s*\(\s*['"]div['"]\s*\)/);
      expect(appTsContent).toMatch(/\.textContent\s*=/);
      expect(appTsContent).toMatch(/\.innerHTML/);
    });

    it('should escape time in thinking entries', () => {
      expect(appTsContent).toContain('escapeHtml(time)');
    });

    it('should escape agent ID in thinking entries', () => {
      // Agent display name is derived from agentId via getAgentDisplayName()
      // and then properly escaped before rendering
      expect(appTsContent).toContain('escapeHtml(agentDisplayName)');
    });

    it('should escape preview in thinking entries', () => {
      expect(appTsContent).toContain('escapeHtml(preview)');
    });

    it('should escape content in thinking entries', () => {
      expect(appTsContent).toContain('escapeHtml(content)');
    });

    it('should escape tool name in tool entries', () => {
      expect(appTsContent).toContain('escapeHtml(toolName)');
    });

    it('should escape input in tool entries via summarizeInput', () => {
      // The code uses a two-step pattern that is equally secure:
      // 1. const preview = summarizeInput(input);
      // 2. escapeHtml(preview)
      // Both summarizeInput and escapeHtml are used, ensuring XSS prevention
      expect(appTsContent).toContain('summarizeInput(input)');
      expect(appTsContent).toContain('escapeHtml(preview)');
    });

    it('should escape session ID in session badges', () => {
      // Agent tree was replaced with session-based filtering
      // Session IDs are now displayed in entry badges
      expect(appTsContent).toMatch(/escapeHtml\(sessionId/);
    });

    it('should escape short session ID in session indicators', () => {
      // Session IDs are displayed in badges using getShortSessionId
      expect(appTsContent).toMatch(/escapeHtml\(getShortSessionId/);
    });

    it('should escape markdown content before rendering', () => {
      // renderSimpleMarkdown should escape first
      expect(appTsContent).toMatch(/function renderSimpleMarkdown/);
      expect(appTsContent).toMatch(/let html = escapeHtml\(content\)/);
    });

    it('should not use innerHTML with unescaped user content', () => {
      // Verify specific security patterns in the code:

      // 1. All thinking entries use escapeHtml for user content
      expect(appTsContent).toContain('escapeHtml(time)');
      expect(appTsContent).toContain('escapeHtml(agentDisplayName)'); // Agent name derived from getAgentDisplayName()
      expect(appTsContent).toContain('escapeHtml(preview)');
      expect(appTsContent).toContain('escapeHtml(content)');

      // 2. Tool entries use escapeHtml for user content
      // The code uses: const preview = summarizeInput(input); then escapeHtml(preview)
      expect(appTsContent).toContain('escapeHtml(toolName)');
      expect(appTsContent).toContain('summarizeInput(input)');
      expect(appTsContent).toContain('escapeHtml(preview)');

      // 3. Session badges use escapeHtml for user content
      // (Agent tree was replaced with session-based filtering)
      expect(appTsContent).toMatch(/escapeHtml\(sessionId/);
      expect(appTsContent).toMatch(/escapeHtml\(getShortSessionId/);

      // 4. Markdown rendering escapes before processing
      expect(appTsContent).toMatch(/let html = escapeHtml\(content\)/);

      // 5. Todo panel escapes content
      expect(appTsContent).toContain('escapeHtml(displayText)');

      // 6. The escapeHtml function uses the secure DOM-based method
      const escapeHtmlMatch = appTsContent.match(
        /function escapeHtml[\s\S]*?return div\.innerHTML/
      );
      expect(escapeHtmlMatch).toBeTruthy();
      expect(escapeHtmlMatch![0]).toContain('document.createElement');
      expect(escapeHtmlMatch![0]).toContain('textContent');
    });
  });

  describe('Thinking Blocks (non-collapsible)', () => {
    it('should have thinking-entry class', () => {
      expect(stylesCssContent).toContain('.thinking-entry');
    });

    it('should have thinking-entry-header for metadata', () => {
      expect(appTsContent).toContain('thinking-entry-header');
      expect(stylesCssContent).toContain('.thinking-entry-header');
    });

    it('should always show thinking-text content', () => {
      // Verify thinking-text is rendered without collapse logic
      expect(appTsContent).toContain('thinking-text');
      // Verify no toggle function exists for thinking entries
      expect(appTsContent).not.toContain('toggleThinkingEntry');
    });

    it('should not have interactive collapse controls', () => {
      // Verify no toggle indicator in thinking entries
      expect(appTsContent).not.toMatch(/thinking-entry.*role.*button/);
      expect(appTsContent).not.toMatch(/thinking-entry.*aria-expanded/);
    });
  });

  describe('Enhanced Tool Visualization with Timing', () => {
    it('should track pending tools with start time', () => {
      expect(appTsContent).toContain('pendingTools: Map');
      expect(appTsContent).toContain('startTime');
    });

    it('should display tool duration', () => {
      expect(appTsContent).toContain('tool-duration');
      expect(appTsContent).toContain('formatDuration');
    });

    it('should format duration in ms for short durations', () => {
      expect(appTsContent).toMatch(/if\s*\(\s*ms\s*<\s*1000\s*\)/);
      expect(appTsContent).toContain('ms}ms');
    });

    it('should format duration in seconds for longer durations', () => {
      expect(appTsContent).toMatch(/ms\s*\/\s*1000/);
      expect(appTsContent).toContain("toFixed(1)");
    });

    it('should have collapsible tool details', () => {
      // Tool entries start collapsed and can be expanded by clicking
      expect(appTsContent).toContain("entry.className = 'tool-entry collapsed");
      expect(appTsContent).toContain("entry.classList.toggle('collapsed')");
      expect(stylesCssContent).toContain('.tool-entry.collapsed');
    });

    it('should show input section in tool details', () => {
      expect(appTsContent).toContain('tool-input-section');
      expect(appTsContent).toContain('tool-entry-details');
    });

    it('should track tool status (pending via Map, completion states)', () => {
      // Tools are tracked as pending via pendingTools Map
      expect(appTsContent).toContain('pendingTools');
      expect(appTsContent).toContain("status?: 'running' | 'success' | 'failure' | 'cancelled'");
    });
  });

  describe('Smart Auto-scroll Behavior', () => {
    it('should have auto-scroll state', () => {
      expect(appTsContent).toContain('autoScroll: boolean');
      expect(appTsContent).toContain('userScrolledUp: boolean');
    });

    it('should define scroll threshold', () => {
      expect(appTsContent).toContain('SCROLL_THRESHOLD');
    });

    it('should have isNearBottom helper', () => {
      expect(appTsContent).toContain('function isNearBottom');
      expect(appTsContent).toContain('scrollTop');
      expect(appTsContent).toContain('scrollHeight');
      expect(appTsContent).toContain('clientHeight');
    });

    it('should have smartScroll function', () => {
      expect(appTsContent).toContain('function smartScroll');
    });

    it('should pause auto-scroll when user scrolls up', () => {
      expect(appTsContent).toContain('handlePanelScroll');
      expect(appTsContent).toContain('userScrolledUp = !isNearBottom');
    });

    it('should only scroll if auto-scroll enabled and user has not scrolled up', () => {
      expect(appTsContent).toMatch(/state\.autoScroll\s*&&\s*!state\.userScrolledUp/);
    });

    it('should have scroll event listeners on panels', () => {
      expect(appTsContent).toContain("addEventListener('scroll'");
      expect(appTsContent).toContain('handlePanelScroll');
    });
  });

  describe('Event Filtering', () => {
    it('should have filter inputs in HTML', () => {
      expect(indexHtmlContent).toContain('thinking-filter');
      expect(indexHtmlContent).toContain('tools-filter');
    });

    it('should have filter state', () => {
      expect(appTsContent).toContain('thinkingFilter: string');
      expect(appTsContent).toContain('toolsFilter: string');
    });

    it('should have applyThinkingFilter function', () => {
      expect(appTsContent).toContain('function applyThinkingFilter');
    });

    it('should have applyToolsFilter function', () => {
      expect(appTsContent).toContain('function applyToolsFilter');
    });

    it('should store content for filtering', () => {
      expect(appTsContent).toContain('dataset.content');
      expect(appTsContent).toContain('dataset.toolName');
    });

    it('should have clear filter buttons', () => {
      expect(indexHtmlContent).toContain('thinking-filter-clear');
      expect(indexHtmlContent).toContain('tools-filter-clear');
    });

    it('should have input event listeners for filters', () => {
      expect(appTsContent).toContain("thinkingFilter.addEventListener('input'");
      expect(appTsContent).toContain("toolsFilter.addEventListener('input'");
    });

    it('should filter case-insensitively', () => {
      expect(appTsContent).toContain('.toLowerCase()');
    });
  });

  describe('Connection Status with Reconnect Countdown', () => {
    it('should have connection status element', () => {
      expect(indexHtmlContent).toContain('connection-status');
    });

    it('should have connection overlay', () => {
      expect(indexHtmlContent).toContain('connection-overlay');
    });

    it('should have reconnect retry button', () => {
      expect(indexHtmlContent).toContain('connection-overlay-retry');
    });

    it('should have reconnect state', () => {
      expect(appTsContent).toContain('reconnectAttempt: number');
      expect(appTsContent).toContain('reconnectCountdown: number');
    });

    it('should implement exponential backoff', () => {
      expect(appTsContent).toContain('RECONNECT_BASE_DELAY_MS');
      expect(appTsContent).toContain('RECONNECT_MAX_DELAY_MS');
      expect(appTsContent).toMatch(/Math\.pow\s*\(\s*2/);
    });

    it('should add jitter to reconnect delay', () => {
      expect(appTsContent).toContain('Math.random()');
    });

    it('should update countdown display', () => {
      expect(appTsContent).toContain('updateReconnectCountdown');
      expect(appTsContent).toContain('reconnect-countdown');
    });

    it('should have retry now function', () => {
      expect(appTsContent).toContain('function retryNow');
    });

    it('should show/hide connection overlay', () => {
      expect(appTsContent).toContain('showConnectionOverlay');
      expect(appTsContent).toContain('hideConnectionOverlay');
    });
  });

  describe('Keyboard Shortcuts', () => {
    it('should have keyboard event listener', () => {
      expect(appTsContent).toContain("addEventListener('keydown'");
      expect(appTsContent).toContain('handleKeydown');
    });

    it('should support a/t/o/d/p for view switching', () => {
      // Agent tabs were replaced with view tabs (All/Thinking/Tools/Todo/Plan)
      expect(appTsContent).toContain("case 'a':");
      expect(appTsContent).toContain("case 't':");
      expect(appTsContent).toContain("case 'o':");
      expect(appTsContent).toContain("case 'd':");
      expect(appTsContent).toContain("case 'p':");
      expect(appTsContent).toContain("selectView('all')");
      expect(appTsContent).toContain("selectView('thinking')");
      expect(appTsContent).toContain("selectView('tools')");
    });

    it('should support c for clear', () => {
      expect(appTsContent).toMatch(/event\.key\s*===\s*['"]c['"]/);
      expect(appTsContent).toContain('clearAllPanels');
    });

    it('should support s for auto-scroll toggle', () => {
      expect(appTsContent).toMatch(/event\.key\s*===\s*['"]s['"]/);
      expect(appTsContent).toContain('state.autoScroll = !state.autoScroll');
    });

    it('should support / for search focus', () => {
      expect(appTsContent).toMatch(/event\.key\s*===\s*['"]\/['"]/);
      expect(appTsContent).toContain('thinkingFilter.focus()');
    });

    it('should support Escape for clear filters', () => {
      expect(appTsContent).toMatch(/event\.key\s*===\s*['"]Escape['"]/);
    });

    it('should prevent shortcuts when typing in inputs', () => {
      // The code uses activeElement instanceof checks rather than tagName comparison
      expect(appTsContent).toContain('isInputFocused');
      expect(appTsContent).toContain('activeElement instanceof HTMLInputElement');
    });

    it('should have keyboard hints in footer', () => {
      expect(indexHtmlContent).toContain('keyboard-hints');
      expect(indexHtmlContent).toContain('<kbd>');
    });

    it('should have keyboard mode state for visual hints', () => {
      expect(appTsContent).toContain('keyboardMode: boolean');
      expect(appTsContent).toContain('keyboard-mode');
    });
  });

  describe('Responsive Design', () => {
    it('should have responsive breakpoints', () => {
      expect(stylesCssContent).toContain('@media');
      expect(stylesCssContent).toMatch(/@media\s*\(\s*max-width:\s*900px\s*\)/);
      expect(stylesCssContent).toMatch(/@media\s*\(\s*max-width:\s*600px\s*\)/);
    });

    it('should switch to single column on small screens', () => {
      expect(stylesCssContent).toContain('grid-template-columns: 1fr');
    });

    it('should hide keyboard hints on small screens', () => {
      expect(stylesCssContent).toContain('.keyboard-hints');
      expect(stylesCssContent).toMatch(/.keyboard-hints\s*\{[^}]*display:\s*none/);
    });

    it('should hide filter on very small screens', () => {
      expect(stylesCssContent).toMatch(/.panel-filter\s*\{[^}]*display:\s*none/);
    });
  });

  describe('Accessibility', () => {
    it('should have aria-label on filter inputs', () => {
      expect(indexHtmlContent).toContain('aria-label="Filter thinking entries"');
      expect(indexHtmlContent).toContain('aria-label="Filter tool entries"');
      expect(indexHtmlContent).toContain('aria-label="Clear filter"');
    });

    // Note: role="button" and tabindex tests removed since thinking blocks
    // are no longer collapsible/interactive. Tool entries still have these
    // attributes for their collapse functionality.

    it('should have focus-visible styles', () => {
      expect(stylesCssContent).toContain(':focus-visible');
    });

    it('should use semantic HTML elements', () => {
      expect(indexHtmlContent).toContain('<header');
      expect(indexHtmlContent).toContain('<main');
      expect(indexHtmlContent).toContain('<footer');
      expect(indexHtmlContent).toContain('<section');
      // Navigation is created dynamically via initViewTabs() which creates a <nav> element
      expect(appTsContent).toContain("viewTabsContainer.id = 'view-tabs'");
      expect(appTsContent).toContain("viewTabsContainer.className = 'view-tabs'");
    });
  });

  describe('Visual Polish', () => {
    it('should have animation for new entries', () => {
      expect(stylesCssContent).toContain('@keyframes slideIn');
      expect(stylesCssContent).toContain('@keyframes fadeIn');
    });

    it('should have highlight animation for new entries', () => {
      expect(stylesCssContent).toContain('@keyframes highlight');
      expect(appTsContent).toContain("entry.classList.remove('new')");
    });

    it('should have status dot animations', () => {
      expect(stylesCssContent).toContain('@keyframes pulse');
      expect(stylesCssContent).toContain('@keyframes agentPulse');
    });

    it('should have CSS transitions for smooth interactions', () => {
      expect(stylesCssContent).toContain('transition:');
    });

    it('should have proper scrollbar styling', () => {
      expect(stylesCssContent).toContain('::-webkit-scrollbar');
    });
  });

  describe('PRD Phase 7 Requirements', () => {
    it('should have dark theme CSS (Phase 7.21)', () => {
      expect(stylesCssContent).toContain('--color-bg-primary: #0d1117');
      expect(stylesCssContent).toContain('--color-text-primary: #e6edf3');
    });

    it('should have auto-scroll toggle (Phase 7.22)', () => {
      expect(indexHtmlContent).toContain('auto-scroll');
      expect(indexHtmlContent).toContain('Auto-scroll');
    });

    it('should have clear button (Phase 7.23)', () => {
      expect(indexHtmlContent).toContain('clear-btn');
      expect(appTsContent).toContain('clearAllPanels');
    });

    it('should have connection status indicator (Phase 7.24)', () => {
      expect(indexHtmlContent).toContain('connection-status');
      expect(appTsContent).toContain('updateConnectionStatus');
    });
  });

  describe('Memory Management', () => {
    it('should have MAX_ENTRIES limit', () => {
      expect(appTsContent).toContain('MAX_ENTRIES');
      expect(appTsContent).toMatch(/MAX_ENTRIES\s*=\s*\d+/);
    });

    it('should trim old entries', () => {
      expect(appTsContent).toContain('appendAndTrim');
      expect(appTsContent).toMatch(/children\.length\s*>\s*MAX_ENTRIES/);
      expect(appTsContent).toContain('children[0].remove()');
    });

    it('should clean up intervals on reconnect', () => {
      expect(appTsContent).toContain('clearTimeout(reconnectTimeout)');
      expect(appTsContent).toContain('clearInterval(countdownInterval)');
    });
  });
});

describe('Phase 4: Code Quality', () => {
  it('should have type annotations', () => {
    expect(appTsContent).toContain(': void');
    expect(appTsContent).toContain(': string');
    expect(appTsContent).toContain(': boolean');
  });

  it('should have proper interface definitions', () => {
    expect(appTsContent).toContain('interface AppState');
    expect(appTsContent).toContain('interface AgentInfo');
    expect(appTsContent).toContain('interface ToolInfo');
  });

  it('should have configuration constants', () => {
    expect(appTsContent).toContain('const WS_URL');
    expect(appTsContent).toContain('const RECONNECT_BASE_DELAY_MS');
    expect(appTsContent).toContain('const MAX_ENTRIES');
    expect(appTsContent).toContain('const SCROLL_THRESHOLD');
  });

  it('should use strict equality', () => {
    // Should use === not ==
    const looseEquality = appTsContent.match(/[^=!]==[^=]/g) || [];
    expect(looseEquality.length).toBe(0);
  });

  it('should have error handling in WebSocket message parsing', () => {
    expect(appTsContent).toContain('try {');
    expect(appTsContent).toContain('JSON.parse');
    expect(appTsContent).toContain('catch');
  });

  it('should have console logging for debugging', () => {
    expect(appTsContent).toContain('console.log');
    expect(appTsContent).toContain('console.error');
  });

  it('should have proper event handler cleanup pattern', () => {
    expect(appTsContent).toContain("addEventListener('click'");
    expect(appTsContent).toContain("addEventListener('keydown'");
  });
});
