/**
 * HTML utilities for the Thinking Monitor Dashboard
 */

/**
 * Escape HTML special characters to prevent XSS.
 * Uses DOM textContent for reliable escaping.
 */
export function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
