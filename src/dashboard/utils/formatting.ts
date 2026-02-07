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

export function summarizeInput(input: string | undefined, toolName?: string): string {
  if (!input) return '';

  // Tool-specific smart preview
  if (toolName) {
    try {
      const parsed = JSON.parse(input);
      switch (toolName) {
        case 'Read':
        case 'Write':
        case 'Edit':
          if (parsed.file_path) return parsed.file_path;
          break;
        case 'Bash':
          if (parsed.command) {
            const cmd = parsed.command;
            return cmd.length > 80 ? cmd.slice(0, 80) + '...' : cmd;
          }
          break;
        case 'Grep':
          if (parsed.pattern) {
            const parts = [parsed.pattern];
            if (parsed.path) parts.push(parsed.path);
            const result = parts.join(' in ');
            return result.length > 80 ? result.slice(0, 80) + '...' : result;
          }
          break;
        case 'Glob':
          if (parsed.pattern) return parsed.pattern;
          break;
        case 'Task':
          if (parsed.subagent_type || parsed.description) {
            const parts: string[] = [];
            if (parsed.subagent_type) parts.push(parsed.subagent_type);
            if (parsed.description) parts.push(parsed.description);
            const result = parts.join(': ');
            return result.length > 80 ? result.slice(0, 80) + '...' : result;
          }
          break;
        case 'WebFetch':
          if (parsed.url) {
            return parsed.url.length > 80 ? parsed.url.slice(0, 80) + '...' : parsed.url;
          }
          break;
        case 'WebSearch':
          if (parsed.query) return parsed.query;
          break;
      }
    } catch {
      // Input is not JSON, fall through to generic handling
    }
  }

  // Generic fallback: Extract file paths or first meaningful content
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
