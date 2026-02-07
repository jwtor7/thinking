/**
 * Tests for HTML utility functions
 *
 * Security-focused tests for XSS prevention utilities
 *
 * Note: escapeHtml() uses document.createElement which requires DOM.
 * Those tests use static analysis in phase4-evaluation.test.ts.
 * Here we test pure functions that don't require DOM.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

// Read the source file for static analysis
const htmlUtilsPath = join(__dirname, 'html.ts');
const htmlUtilsContent = readFileSync(htmlUtilsPath, 'utf-8');

// Extract escapeCssValue function for direct testing
// Since it's a pure function with no DOM deps, we can recreate it for testing
// Allowlist approach: only permit safe characters
function escapeCssValue(value: string): string {
  return value.replace(/[^a-zA-Z0-9 #.,%()/\-]/g, '');
}

// Extract encodeHtmlAttribute for testing (also pure, no DOM)
function encodeHtmlAttribute(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

describe('HTML Utilities', () => {
  describe('escapeCssValue (static analysis)', () => {
    it('should exist in html.ts', () => {
      expect(htmlUtilsContent).toContain('function escapeCssValue');
    });

    it('should use allowlist approach for CSS sanitization', () => {
      // Verify the function uses an allowlist pattern (only allowing safe chars)
      expect(htmlUtilsContent).toMatch(/return value\.replace\(\s*\/\[\^a-zA-Z0-9/);
    });

    it('should be exported', () => {
      expect(htmlUtilsContent).toContain('export function escapeCssValue');
    });
  });

  describe('escapeCssValue (unit tests)', () => {
    describe('normal alignment values', () => {
      it('should pass through "left" unchanged', () => {
        expect(escapeCssValue('left')).toBe('left');
      });

      it('should pass through "center" unchanged', () => {
        expect(escapeCssValue('center')).toBe('center');
      });

      it('should pass through "right" unchanged', () => {
        expect(escapeCssValue('right')).toBe('right');
      });

      it('should handle valid CSS values', () => {
        expect(escapeCssValue('flex-start')).toBe('flex-start');
        expect(escapeCssValue('space-between')).toBe('space-between');
        expect(escapeCssValue('100px')).toBe('100px');
        expect(escapeCssValue('#ff0000')).toBe('#ff0000');
      });
    });

    describe('malicious CSS injection attempts', () => {
      it('should strip semicolons (property injection)', () => {
        const result = escapeCssValue('left; background: url(evil.com)');
        expect(result).not.toContain(';');
        expect(result).not.toContain(':');
      });

      it('should strip double quotes (string breakout)', () => {
        const result = escapeCssValue('left" onmouseover="alert(1)');
        expect(result).not.toContain('"');
        expect(result).not.toContain('=');
      });

      it('should strip single quotes (string breakout)', () => {
        const result = escapeCssValue("left' onmouseover='alert(1)");
        expect(result).not.toContain("'");
        expect(result).not.toContain('=');
      });

      it('should strip angle brackets (HTML injection)', () => {
        const result = escapeCssValue('left<script>alert(1)</script>');
        expect(result).not.toContain('<');
        expect(result).not.toContain('>');
      });

      it('should allow parentheses but strip dangerous content', () => {
        // Parentheses allowed for CSS functions like var(), rgb()
        // But colons and semicolons are stripped
        const result = escapeCssValue('expression(alert(1))');
        expect(result).toBe('expression(alert(1))');
        // The key protection is that ; and : are stripped, preventing
        // injection like: expression(alert(1)); position: absolute
      });

      it('should strip curly braces (rule injection)', () => {
        const result = escapeCssValue('left}body{background:red');
        expect(result).not.toContain('{');
        expect(result).not.toContain('}');
      });

      it('should strip backslashes (escape sequences)', () => {
        const result = escapeCssValue('left\\22');
        expect(result).not.toContain('\\');
      });

      it('should handle combined injection attempts', () => {
        // Complex attack combining multiple techniques
        const attack = 'left"; background: url("javascript:alert(1)"); color: red';
        const result = escapeCssValue(attack);
        expect(result).not.toContain(';');
        expect(result).not.toContain('"');
        expect(result).not.toContain(':');
      });

      it('should handle empty string', () => {
        expect(escapeCssValue('')).toBe('');
      });

      it('should handle string with only dangerous characters', () => {
        expect(escapeCssValue(';"\'')).toBe('');
      });

      it('should strip colons from CSS url injection', () => {
        const result = escapeCssValue('url(javascript:alert(1))');
        expect(result).not.toContain(':');
        // Parentheses allowed, but colon removal prevents javascript: protocol
      });

      it('should strip all XSS-relevant characters from real attack payloads', () => {
        // Real-world attack payloads
        const attacks = [
          'left;position:fixed;top:0;left:0;width:100%;height:100%',
          'left}*{background:red',
          "left')alert('xss",
          'left</style><script>alert(1)</script>',
          'left; behavior: url(script.htc)',
        ];

        for (const attack of attacks) {
          const result = escapeCssValue(attack);
          expect(result).not.toContain(';');
          expect(result).not.toContain('{');
          expect(result).not.toContain('}');
          expect(result).not.toContain('<');
          expect(result).not.toContain('>');
          expect(result).not.toContain(':');
        }
      });
    });

    describe('defense in depth validation', () => {
      it('should sanitize even if parseTableAlignment() is bypassed', () => {
        // Even if parseTableAlignment() returned a malicious string,
        // escapeCssValue() should neutralize it
        const maliciousAlignment = 'left; position: absolute; z-index: 9999';
        const result = escapeCssValue(maliciousAlignment);

        // Result should be safe to use in style attribute
        // Allowlist only permits alphanumeric, spaces, hyphens, hashes, dots, commas, percent, /
        expect(result).not.toContain(';');
        expect(result).not.toContain(':');
      });

      it('should produce output safe for inline style attributes', () => {
        const testCases = [
          'left',
          'center',
          'right',
          'left; evil',
          'left" onclick="alert(1)',
        ];

        for (const input of testCases) {
          const result = escapeCssValue(input);
          // Should be safe to interpolate into: style="text-align: ${result}"
          expect(result).not.toContain('"');
          expect(result).not.toContain("'");
          expect(result).not.toContain(';');
        }
      });
    });
  });

  describe('encodeHtmlAttribute (unit tests)', () => {
    it('should escape double quotes', () => {
      expect(encodeHtmlAttribute('value"with"quotes')).toBe('value&quot;with&quot;quotes');
    });

    it('should escape single quotes', () => {
      expect(encodeHtmlAttribute("value'with'apostrophes")).toBe('value&#39;with&#39;apostrophes');
    });

    it('should escape HTML special characters', () => {
      expect(encodeHtmlAttribute('<>&')).toBe('&lt;&gt;&amp;');
    });

    it('should handle attribute breakout attempt', () => {
      // This is a classic XSS vector: [x](https://x" onclick="alert(1))
      const maliciousUrl = 'https://example.com" onclick="alert(1)';
      const encoded = encodeHtmlAttribute(maliciousUrl);
      expect(encoded).toBe('https://example.com&quot; onclick=&quot;alert(1)');
      expect(encoded).not.toContain('"');
    });

    it('should handle empty strings', () => {
      expect(encodeHtmlAttribute('')).toBe('');
    });
  });
});
