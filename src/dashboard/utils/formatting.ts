/**
 * Formatting utilities for dashboard display
 * Pure functions for time, duration, and input formatting
 */

export function formatTime(isoString: string): string {
  try {
    const date = new Date(isoString);
    return date.toLocaleTimeString('en-US', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return '--:--:--';
  }
}

export function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${ms}ms`;
  }
  const seconds = (ms / 1000).toFixed(1);
  return `${seconds}s`;
}

/**
 * Get CSS class for duration-based color coding.
 * - 'fast' (green): < 500ms
 * - 'medium' (yellow): 500ms - 2000ms
 * - 'slow' (red): > 2000ms
 */
export function getDurationClass(ms: number): string {
  if (ms < 500) {
    return 'duration-fast';
  } else if (ms <= 2000) {
    return 'duration-medium';
  } else {
    return 'duration-slow';
  }
}

export function summarizeInput(input: string | undefined): string {
  if (!input) return '';

  // Extract file paths or first meaningful content
  const pathMatch = input.match(/\/[^\s"']+/);
  if (pathMatch) {
    return pathMatch[0];
  }

  // Truncate long content
  if (input.length > 60) {
    return input.slice(0, 60) + '...';
  }

  return input;
}
