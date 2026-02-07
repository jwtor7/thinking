/**
 * HTML utilities for the Thinking Monitor Dashboard
 */

/**
 * Escape HTML special characters to prevent XSS.
 * Uses DOM textContent for reliable escaping.
 *
 * NOTE: This does NOT escape quotes (" and ') because they are safe
 * in text content. For HTML attribute values, use encodeHtmlAttribute().
 */
export function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * Encode a string for safe use in HTML attribute values.
 *
 * Unlike escapeHtml(), this also escapes quotes which are necessary
 * to prevent attribute breakout attacks in href, src, and other attributes.
 *
 * @example
 * // Safe for attribute values:
 * `<a href="${encodeHtmlAttribute(url)}">`
 */
export function encodeHtmlAttribute(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Sanitize a string for safe use in CSS property values.
 *
 * Uses an allowlist approach: only permits characters known to be safe
 * in CSS values. This is more secure than a blacklist which may miss
 * dangerous characters.
 *
 * Allowed: alphanumeric, spaces, hyphens, hashes, dots, commas, percent,
 * forward slashes, parentheses (for CSS functions like var(), rgb())
 *
 * Blocked: semicolons, quotes, angle brackets, curly braces, backslashes,
 * colons (prevents property injection like `; position: absolute`)
 *
 * @example
 * // Safe for style attributes:
 * `<span style="color: ${escapeCssValue(color)}">`
 */
export function escapeCssValue(value: string): string {
  return value.replace(/[^a-zA-Z0-9 #.,%()/\-]/g, '');
}
