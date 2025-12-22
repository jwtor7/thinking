/**
 * Phase 4 Dashboard Polish - Comprehensive Evaluation Tests
 *
 * Tests to verify Phase 4 requirements from PRD:
 * - Collapsible thinking blocks
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
      expect(appTsContent).toContain('escapeHtml(agentId)');
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
      expect(appTsContent).toContain('escapeHtml(summarizeInput(input))');
    });

    it('should escape agent name in agent nodes', () => {
      expect(appTsContent).toMatch(/escapeHtml\(agent\.name/);
    });

    it('should escape agent ID in agent nodes', () => {
      expect(appTsContent).toMatch(/escapeHtml\(agent\.id/);
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
      expect(appTsContent).toContain('escapeHtml(agentId)');
      expect(appTsContent).toContain('escapeHtml(preview)');
      expect(appTsContent).toContain('escapeHtml(content)');

      // 2. Tool entries use escapeHtml for user content
      expect(appTsContent).toContain('escapeHtml(toolName)');
      expect(appTsContent).toContain('escapeHtml(summarizeInput(input))');

      // 3. Agent nodes use escapeHtml for user content
      expect(appTsContent).toMatch(/escapeHtml\(agent\.name/);
      expect(appTsContent).toMatch(/escapeHtml\(agent\.id/);

      // 4. Markdown rendering escapes before processing
      expect(appTsContent).toMatch(/let html = escapeHtml\(content\)/);

      // 5. renderAgentNode (used by innerHTML assignment) escapes its content
      const renderAgentNodeMatch = appTsContent.match(
        /function renderAgentNode[\s\S]*?return html;/
      );
      expect(renderAgentNodeMatch).toBeTruthy();
      expect(renderAgentNodeMatch![0]).toContain('escapeHtml(agent.name');
      expect(renderAgentNodeMatch![0]).toContain('escapeHtml(agent.id');

      // 6. The escapeHtml function uses the secure DOM-based method
      const escapeHtmlMatch = appTsContent.match(
        /function escapeHtml[\s\S]*?return div\.innerHTML/
      );
      expect(escapeHtmlMatch).toBeTruthy();
      expect(escapeHtmlMatch![0]).toContain('document.createElement');
      expect(escapeHtmlMatch![0]).toContain('textContent');
    });
  });

  describe('Collapsible Thinking Blocks', () => {
    it('should have thinking-entry class with collapsed state', () => {
      expect(stylesCssContent).toContain('.thinking-entry.collapsed');
    });

    it('should hide thinking-text when collapsed', () => {
      expect(stylesCssContent).toContain('.thinking-entry.collapsed .thinking-text');
      expect(stylesCssContent).toContain('display: none');
    });

    it('should have toggle control with arrow indicator', () => {
      expect(stylesCssContent).toContain('.thinking-toggle');
      expect(stylesCssContent).toContain('transform: rotate(90deg)');
    });

    it('should have click handler for collapsing', () => {
      expect(appTsContent).toContain('toggleThinkingEntry');
      expect(appTsContent).toContain("entry.classList.toggle('collapsed')");
    });

    it('should update aria-expanded on toggle for accessibility', () => {
      expect(appTsContent).toContain("setAttribute('aria-expanded'");
    });

    it('should have keyboard support for toggle (Enter/Space)', () => {
      expect(appTsContent).toContain("'Enter'");
      expect(appTsContent).toContain("' '"); // Space key
    });

    it('should show preview when collapsed', () => {
      expect(appTsContent).toContain('thinking-preview');
      expect(stylesCssContent).toContain('.thinking-preview');
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

    it('should have expandable tool details', () => {
      expect(appTsContent).toContain('tool-entry-expandable');
      expect(stylesCssContent).toContain('.tool-entry.expanded');
    });

    it('should show input and output sections when expanded', () => {
      expect(appTsContent).toContain('tool-input-section');
      expect(appTsContent).toContain('tool-output-section');
    });

    it('should have status indicators (pending, done, error)', () => {
      expect(appTsContent).toContain('tool-status-pending');
      expect(appTsContent).toContain('tool-status-done');
      expect(appTsContent).toContain('tool-status-error');
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

    it('should support 0-9 for agent switching', () => {
      expect(appTsContent).toMatch(/event\.key\s*>=\s*['"]0['"]/);
      expect(appTsContent).toMatch(/event\.key\s*<=\s*['"]9['"]/);
      expect(appTsContent).toContain("selectAgent('all')");
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
      expect(appTsContent).toMatch(/target.*tagName\s*===\s*['"]INPUT['"]/);
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

    it('should have role=button on toggle header', () => {
      expect(appTsContent).toContain('role="button"');
    });

    it('should have tabindex on toggle header', () => {
      expect(appTsContent).toContain('tabindex="0"');
    });

    it('should have focus-visible styles', () => {
      expect(stylesCssContent).toContain(':focus-visible');
    });

    it('should use semantic HTML elements', () => {
      expect(indexHtmlContent).toContain('<header');
      expect(indexHtmlContent).toContain('<main');
      expect(indexHtmlContent).toContain('<footer');
      expect(indexHtmlContent).toContain('<nav');
      expect(indexHtmlContent).toContain('<section');
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
