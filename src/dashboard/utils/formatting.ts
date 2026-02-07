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
 * Format elapsed time as a human-readable duration string.
 * e.g., "2m", "1h 15m", "3h 0m"
 */
export function formatElapsed(ms: number): string {
  if (ms < 60_000) {
    return '<1m';
  }
  const totalMinutes = Math.floor(ms / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) {
    return `${minutes}m`;
  }
  return `${hours}h ${minutes}m`;
}

/**
 * Get CSS class for duration-based color coding.
 * - 'fast' (green): < 1s
 * - 'medium' (yellow): 1s - 5s
 * - 'slow' (orange): 5s - 15s
 * - 'very-slow' (red): > 15s
 */
export function getDurationClass(ms: number): string {
  if (ms < 1000) {
    return 'duration-fast';
  } else if (ms < 5000) {
    return 'duration-medium';
  } else if (ms < 15000) {
    return 'duration-slow';
  } else {
    return 'duration-very-slow';
  }
}

/**
 * Shorten MCP tool names for display.
 * Strips the `mcp__{server}__` prefix, keeping only the tool action.
 * Built-in tools (Bash, Read, Edit, etc.) are returned as-is.
 *
 * Examples:
 *   mcp__claude-in-chrome__computer → computer
 *   mcp__claude-in-chrome__read_page → read_page
 *   Bash → Bash
 */
export function shortenToolName(name: string): string {
  const mcpMatch = name.match(/^mcp__[^_]+(?:__)?(.+)$/);
  if (mcpMatch) {
    return mcpMatch[1];
  }
  return name;
}

export function summarizeInput(input: string | undefined, toolName?: string): string {
  if (!input) return '';

  // Tool-specific smart preview
  if (toolName) {
    // Normalize MCP tool names: mcp__server__action → action
    const shortName = shortenToolName(toolName);

    try {
      const parsed = JSON.parse(input);
      const KNOWN_TOOLS = new Set([
        'Read', 'Write', 'Edit', 'Bash', 'Grep', 'Glob', 'Task',
        'WebFetch', 'WebSearch', 'computer', 'navigate', 'find', 'form_input',
      ]);
      const isKnownTool = KNOWN_TOOLS.has(shortName);

      switch (shortName) {
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
        // MCP browser tools
        case 'computer': {
          const parts: string[] = [];
          if (parsed.action) parts.push(parsed.action);
          if (parsed.coordinate) parts.push(`(${parsed.coordinate})`);
          if (parsed.text) parts.push(`"${parsed.text.length > 30 ? parsed.text.slice(0, 30) + '...' : parsed.text}"`);
          if (parsed.ref) parts.push(parsed.ref);
          if (parts.length > 0) return parts.join(' ');
          break;
        }
        case 'navigate':
          if (parsed.url) return parsed.url.length > 80 ? parsed.url.slice(0, 80) + '...' : parsed.url;
          break;
        case 'find':
          if (parsed.query) return parsed.query;
          break;
        case 'form_input':
          if (parsed.ref && parsed.value != null) return `${parsed.ref} = ${String(parsed.value).slice(0, 40)}`;
          break;
      }

      // Generic JSON fallback: compact key:value summary (only for unknown tools)
      if (!isKnownTool && typeof parsed === 'object' && parsed !== null) {
        const pairs = Object.entries(parsed)
          .filter(([, v]) => typeof v !== 'object' && String(v).length < 40)
          .slice(0, 4)
          .map(([k, v]) => `${k}:${v}`);
        if (pairs.length > 0) {
          const result = pairs.join(', ');
          return result.length > 80 ? result.slice(0, 80) + '...' : result;
        }
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
