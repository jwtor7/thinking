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
