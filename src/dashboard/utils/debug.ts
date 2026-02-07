/**
 * Debug Logger
 *
 * Silent by default. Enable via DevTools console:
 *   localStorage.setItem('debug', 'true')
 *
 * Disable:
 *   localStorage.removeItem('debug')
 */

const isEnabled = (): boolean => {
  try {
    return localStorage.getItem('debug') === 'true';
  } catch {
    return false;
  }
};

export function debug(...args: unknown[]): void {
  if (isEnabled()) {
    console.log(...args);
  }
}
