/**
 * Markdown rendering utilities for the Thinking Monitor Dashboard
 */

import { escapeHtml, encodeHtmlAttribute } from './html';

/**
 * Alignment type for table columns
 */
type TableAlignment = 'left' | 'center' | 'right';

/**
 * Parse GFM table alignment markers
 * :--- = left, :---: = center, ---: = right, --- = left (default)
 */
function parseTableAlignment(separator: string): TableAlignment {
  const trimmed = separator.trim();
  const hasLeft = trimmed.startsWith(':');
  const hasRight = trimmed.endsWith(':');

  if (hasLeft && hasRight) return 'center';
  if (hasRight) return 'right';
  return 'left';
}

/**
 * Render a GFM table to HTML
 *
 * Input is already HTML-escaped content, so cells are safe.
 * Table structure is generated programmatically.
 */
function renderTable(lines: string[]): string {
  if (lines.length < 2) return lines.join('\n');

  // Parse header row - split by | and trim
  const headerCells = lines[0]
    .split('|')
    .map((cell) => cell.trim())
    .filter((cell) => cell !== '');

  // Parse separator row to get alignments
  const separatorCells = lines[1]
    .split('|')
    .map((cell) => cell.trim())
    .filter((cell) => cell !== '');

  // Validate separator row (must have --- patterns)
  const isValidSeparator = separatorCells.every((cell) => /^:?-{3,}:?$/.test(cell));

  if (!isValidSeparator || headerCells.length !== separatorCells.length) {
    // Not a valid table, return as-is
    return lines.join('\n');
  }

  // Parse alignments
  const alignments: TableAlignment[] = separatorCells.map(parseTableAlignment);

  // Build table HTML
  let tableHtml = '<table class="md-table">';

  // Header
  tableHtml += '<thead><tr>';
  headerCells.forEach((cell, i) => {
    const align = alignments[i] || 'left';
    tableHtml += `<th style="text-align: ${align}">${cell}</th>`;
  });
  tableHtml += '</tr></thead>';

  // Body rows (skip header and separator)
  if (lines.length > 2) {
    tableHtml += '<tbody>';
    for (let i = 2; i < lines.length; i++) {
      const rowCells = lines[i]
        .split('|')
        .map((cell) => cell.trim())
        .filter((cell) => cell !== '');

      tableHtml += '<tr>';
      // Pad with empty cells if row is short
      for (let j = 0; j < headerCells.length; j++) {
        const cell = rowCells[j] || '';
        const align = alignments[j] || 'left';
        tableHtml += `<td style="text-align: ${align}">${cell}</td>`;
      }
      tableHtml += '</tr>';
    }
    tableHtml += '</tbody>';
  }

  tableHtml += '</table>';
  return tableHtml;
}

/**
 * Detect and render GFM tables in content
 *
 * Tables are identified by:
 * 1. Line starting and ending with |
 * 2. Next line is separator with |---|
 * 3. Zero or more data rows starting/ending with |
 */
function processTablesInContent(html: string): string {
  const lines = html.split('\n');
  const result: string[] = [];
  let tableLines: string[] = [];
  let inTable = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmedLine = line.trim();
    const isTableRow = trimmedLine.startsWith('|') && trimmedLine.endsWith('|');

    if (isTableRow) {
      if (!inTable) {
        // Check if next line is separator
        const nextLine = lines[i + 1]?.trim() || '';
        if (nextLine.startsWith('|') && nextLine.includes('---')) {
          inTable = true;
          tableLines = [line];
        } else {
          result.push(line);
        }
      } else {
        tableLines.push(line);
      }
    } else {
      if (inTable) {
        // End of table
        result.push(renderTable(tableLines));
        tableLines = [];
        inTable = false;
      }
      result.push(line);
    }
  }

  // Handle table at end of content
  if (inTable && tableLines.length > 0) {
    result.push(renderTable(tableLines));
  }

  return result.join('\n');
}

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
 * - Tables: GFM tables with alignment (|:---|, |:---:|, |---:|)
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

  // Tables - process before line break conversion
  // Tables rely on newline-separated rows for detection
  html = processTablesInContent(html);

  // Line breaks - convert newlines to <br> for display
  // First collapse multiple blank lines into double line break (paragraph separator)
  html = html.replace(/\n{3,}/g, '\n\n');
  html = html.replace(/\n/g, '<br>');

  // Clean up extra <br> tags inside and around block elements
  html = html.replace(/<ul><br>/g, '<ul>');
  html = html.replace(/<br><\/ul>/g, '</ul>');
  html = html.replace(/<\/li><br>/g, '</li>');
  html = html.replace(/<br><li/g, '<li');

  // Clean up <br> around headers
  html = html.replace(/<br>(<h[123]>)/g, '$1');
  html = html.replace(/(<\/h[123]>)<br>/g, '$1');

  // Clean up <br> around tables
  html = html.replace(/<br>(<table)/g, '$1');
  html = html.replace(/(<\/table>)<br>/g, '$1');

  // Clean up <br> around horizontal rules
  html = html.replace(/<br>(<hr>)/g, '$1');
  html = html.replace(/(<hr>)<br>/g, '$1');

  // Clean up <br> around blockquotes
  html = html.replace(/<br>(<blockquote>)/g, '$1');
  html = html.replace(/(<\/blockquote>)<br>/g, '$1');

  // Clean up <br> around code blocks
  html = html.replace(/<br>(<pre>)/g, '$1');
  html = html.replace(/(<\/pre>)<br>/g, '$1');

  // Collapse multiple consecutive <br> to max 2 (one blank line)
  html = html.replace(/(<br>){3,}/g, '<br><br>');

  return html;
}
