/**
 * Markdown rendering utilities for the Thinking Monitor Dashboard
 */

import { escapeHtml, encodeHtmlAttribute } from './html';

/**
 * Render simple markdown to HTML with XSS protection.
 *
 * Security approach:
 * 1. First escape ALL HTML in the content to prevent XSS
 * 2. Then apply markdown patterns to the escaped content
 * 3. For links, validate URLs to prevent javascript: protocol XSS
 *
 * Supported markdown:
 * - Headers: # ## ###
 * - Code blocks: ```code```
 * - Inline code: `code`
 * - Bold: **text**
 * - Italic: *text* or _text_
 * - Links: [text](url)
 * - Unordered lists: - item or * item
 * - Ordered lists: 1. item
 * - Task lists: - [ ] unchecked or - [x] checked
 * - Blockquotes: > quote
 * - Horizontal rules: --- or ***
 */
export function renderSimpleMarkdown(content: string): string {
  // SECURITY: Escape ALL HTML first to prevent XSS
  // This converts <, >, &, ", ' to their HTML entities
  let html = escapeHtml(content);

  // Code blocks - preserve content as-is (already escaped)
  // Match: ```optional-language\ncontent```
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, '<pre><code>$2</code></pre>');

  // Inline code - preserve content as-is (already escaped)
  // Match: `content` (non-greedy, no backticks inside)
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

  // Horizontal rules: --- or *** or ___ (at least 3)
  html = html.replace(/^(-{3,}|\*{3,}|_{3,})$/gm, '<hr>');

  // Headers - content is already escaped
  html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
  html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');

  // Task lists: - [ ] unchecked or - [x] checked
  // Must be processed before regular lists
  html = html.replace(/^- \[ \] (.+)$/gm, '<li class="task-list-item"><span class="task-checkbox"></span>$1</li>');
  html = html.replace(/^- \[x\] (.+)$/gim, '<li class="task-list-item"><span class="task-checkbox checked"></span>$1</li>');

  // Unordered lists: - item or * item (at start of line)
  html = html.replace(/^[-*] (.+)$/gm, '<li>$1</li>');

  // Ordered lists: 1. item (at start of line)
  html = html.replace(/^\d+\. (.+)$/gm, '<li>$1</li>');

  // Wrap consecutive <li> elements in <ul>
  // This is a simplified approach - wraps all li blocks in ul
  html = html.replace(/(<li[^>]*>.*?<\/li>\n?)+/g, (match) => {
    return '<ul>' + match + '</ul>';
  });

  // Blockquotes: > quote
  // Handle multi-line blockquotes by converting consecutive lines
  html = html.replace(/^&gt; (.+)$/gm, '<blockquote>$1</blockquote>');
  // Merge consecutive blockquotes
  html = html.replace(/<\/blockquote>\n<blockquote>/g, '<br>');

  // Bold: **text** (must have content between asterisks)
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

  // Italic: *text* or _text_ (single asterisk/underscore)
  // Must not be inside a word for underscores, and must have content
  html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  html = html.replace(/\b_([^_]+)_\b/g, '<em>$1</em>');

  // Links: [text](url)
  // SECURITY: Validate URL to prevent javascript: protocol XSS
  // The text is already escaped, but we need to validate the URL
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_match, text, url) => {
    // URL has been through escapeHtml, so &quot; might be present
    // Decode common HTML entities for URL validation
    const decodedUrl = url
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'");

    // SECURITY: Only allow safe URL protocols
    // Block javascript:, data:, vbscript:, and other dangerous protocols
    const trimmedUrl = decodedUrl.trim().toLowerCase();
    const isSafeUrl = (
      trimmedUrl.startsWith('http://') ||
      trimmedUrl.startsWith('https://') ||
      trimmedUrl.startsWith('/') ||
      trimmedUrl.startsWith('#') ||
      trimmedUrl.startsWith('mailto:') ||
      // Relative URLs (no protocol)
      (!trimmedUrl.includes(':') && !trimmedUrl.startsWith('//'))
    );

    if (!isSafeUrl) {
      // Unsafe URL - render as plain text (already escaped)
      return `[${text}](${url})`;
    }

    // Safe URL - render as link with security attributes
    // SECURITY: Use encodeHtmlAttribute (not escapeHtml) to escape quotes
    // This prevents attribute breakout attacks like: [x](https://x" onclick="alert(1))
    const safeUrl = encodeHtmlAttribute(decodedUrl);
    return `<a href="${safeUrl}" target="_blank" rel="noopener noreferrer">${text}</a>`;
  });

  // Line breaks - convert newlines to <br> for display
  // But not inside <ul>, <pre>, or <blockquote> tags
  html = html.replace(/\n/g, '<br>');

  // Clean up extra <br> tags inside block elements
  html = html.replace(/<ul><br>/g, '<ul>');
  html = html.replace(/<br><\/ul>/g, '</ul>');
  html = html.replace(/<\/li><br>/g, '</li>');
  html = html.replace(/<br><li/g, '<li');

  return html;
}
