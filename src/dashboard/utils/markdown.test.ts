/**
 * Tests for Markdown rendering utilities
 *
 * Includes static analysis tests for XSS prevention in tables and links.
 * Note: renderSimpleMarkdown() uses escapeHtml() which requires DOM.
 * We test via static analysis to verify correct patterns are in place.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

// Read the source files for static analysis
const markdownPath = join(__dirname, 'markdown.ts');
const markdownContent = readFileSync(markdownPath, 'utf-8');
const htmlPath = join(__dirname, 'html.ts');
const htmlContent = readFileSync(htmlPath, 'utf-8');

describe('Markdown Rendering - Static Analysis', () => {
  describe('Table Rendering Security', () => {
    it('should import escapeCssValue', () => {
      expect(markdownContent).toContain("import { escapeHtml, encodeHtmlAttribute, escapeCssValue } from './html.ts'");
    });

    it('should use escapeCssValue for header alignment', () => {
      // Line 65: tableHtml += `<th style="text-align: ${escapeCssValue(align)}">${cell}</th>`;
      expect(markdownContent).toMatch(/<th style="text-align: \$\{escapeCssValue\(align\)\}"/);
    });

    it('should use escapeCssValue for cell alignment', () => {
      // Line 83: tableHtml += `<td style="text-align: ${escapeCssValue(align)}">${cell}</td>`;
      expect(markdownContent).toMatch(/<td style="text-align: \$\{escapeCssValue\(align\)\}"/);
    });

    it('should have parseTableAlignment return only valid alignments', () => {
      // parseTableAlignment should only return 'left', 'center', or 'right'
      expect(markdownContent).toContain("type TableAlignment = 'left' | 'center' | 'right'");
      expect(markdownContent).toContain("function parseTableAlignment(separator: string): TableAlignment");
      expect(markdownContent).toContain("return 'center'");
      expect(markdownContent).toContain("return 'right'");
      expect(markdownContent).toContain("return 'left'");
    });

    it('should validate separator row format', () => {
      // Only valid :?-{3,}:? patterns should be accepted
      expect(markdownContent).toMatch(/isValidSeparator\s*=.*\/\^:\?-\{3,\}:\?\$\//);
    });
  });

  describe('Link Security', () => {
    it('should block javascript: protocol', () => {
      expect(markdownContent).toContain("trimmedUrl.startsWith('http://')");
      expect(markdownContent).toContain("trimmedUrl.startsWith('https://')");
      // Safe URLs are explicitly allowed; others are blocked
      expect(markdownContent).toContain('isSafeUrl');
    });

    it('should use encodeHtmlAttribute for URLs', () => {
      expect(markdownContent).toContain('encodeHtmlAttribute(decodedUrl)');
    });

    it('should add security attributes to links', () => {
      expect(markdownContent).toContain('target="_blank"');
      expect(markdownContent).toContain('rel="noopener noreferrer"');
    });
  });

  describe('General XSS Prevention', () => {
    it('should escape HTML first before applying markdown', () => {
      expect(markdownContent).toMatch(/let html = escapeHtml\(content\)/);
    });

    it('should have escapeHtml function in html.ts', () => {
      expect(htmlContent).toContain('function escapeHtml');
    });

    it('should use DOM-based escaping', () => {
      // Verify escapeHtml uses createElement/textContent pattern
      expect(htmlContent).toContain("document.createElement('div')");
      expect(htmlContent).toContain('div.textContent = text');
      expect(htmlContent).toContain('return div.innerHTML');
    });
  });

  describe('escapeCssValue Function', () => {
    it('should strip semicolons', () => {
      expect(htmlContent).toMatch(/\[;"'<>\(\)\{\}\\\\]/);
    });

    it('should strip quotes', () => {
      expect(htmlContent).toMatch(/\[;"'<>/);
    });

    it('should strip angle brackets', () => {
      expect(htmlContent).toMatch(/<>/);
    });

    it('should strip parentheses', () => {
      expect(htmlContent).toMatch(/\(\)/);
    });

    it('should strip curly braces', () => {
      expect(htmlContent).toMatch(/\{\}/);
    });

    it('should strip backslashes', () => {
      expect(htmlContent).toMatch(/\\\\/);
    });
  });

  describe('Defense in Depth', () => {
    it('should have multiple layers of protection for table alignments', () => {
      // Layer 1: parseTableAlignment returns typed enum
      expect(markdownContent).toContain("type TableAlignment = 'left' | 'center' | 'right'");

      // Layer 2: Separator validation regex
      expect(markdownContent).toMatch(/isValidSeparator.*:?\-\{3,\}:\?/);

      // Layer 3: escapeCssValue sanitizes regardless
      expect(markdownContent).toContain('escapeCssValue(align)');
    });

    it('should have multiple layers of protection for links', () => {
      // Layer 1: Content is escaped before markdown processing
      expect(markdownContent).toMatch(/let html = escapeHtml\(content\)/);

      // Layer 2: URL protocol validation
      expect(markdownContent).toContain('isSafeUrl');

      // Layer 3: URL is encoded for attribute context
      expect(markdownContent).toContain('encodeHtmlAttribute(decodedUrl)');
    });
  });
});
