/**
 * Plan Utility Functions
 */

/**
 * Format a date as a relative time string (e.g., "2m ago", "1h ago").
 *
 * @param date - Date to format
 * @returns Relative time string
 */
export function formatTimeAgo(date: Date): string {
  const now = Date.now();
  const diff = now - date.getTime();

  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (minutes > 0) return `${minutes}m ago`;
  return 'just now';
}
