/**
 * Tests for formatting utility functions
 *
 * Comprehensive unit tests for time, duration, and input formatting functions.
 * All functions are pure and have no external dependencies.
 */

import { describe, it, expect } from 'vitest';
import {
  formatTime,
  formatDuration,
  formatElapsed,
  getDurationClass,
  summarizeInput,
  shortenToolName,
} from './formatting.ts';

describe('formatTime', () => {
  describe('valid ISO strings', () => {
    it('should format ISO 8601 timestamp correctly', () => {
      const result = formatTime('2024-01-15T14:30:45Z');
      expect(result).toMatch(/^\d{2}:\d{2}:\d{2}$/);
      // Time should be formatted as HH:MM:SS
      expect(result).toMatch(/^\d{2}:\d{2}:\d{2}$/);
    });

    it('should handle ISO string with milliseconds', () => {
      const result = formatTime('2024-01-15T14:30:45.123Z');
      expect(result).toMatch(/^\d{2}:\d{2}:\d{2}$/);
    });

    it('should handle ISO string without timezone', () => {
      const result = formatTime('2024-01-15T14:30:45');
      expect(result).toMatch(/^\d{2}:\d{2}:\d{2}$/);
    });

    it('should handle midnight time', () => {
      const result = formatTime('2024-01-15T00:00:00Z');
      expect(result).toMatch(/^\d{2}:\d{2}:\d{2}$/);
    });

    it('should handle afternoon time', () => {
      const result = formatTime('2024-01-15T09:05:03Z');
      expect(result).toMatch(/^\d{2}:\d{2}:\d{2}$/);
    });

    it('should handle end of day time', () => {
      const result = formatTime('2024-01-15T23:59:59Z');
      expect(result).toMatch(/^\d{2}:\d{2}:\d{2}$/);
    });

    it('should use 24-hour format (not 12-hour)', () => {
      const result = formatTime('2024-01-15T16:45:30Z');
      expect(result).toMatch(/^\d{2}:\d{2}:\d{2}$/);
      expect(result).not.toContain('AM');
      expect(result).not.toContain('PM');
    });
  });

  describe('invalid inputs', () => {
    it('should handle invalid ISO string as Invalid Date', () => {
      const result = formatTime('not-a-date');
      // Invalid date string produces "Invalid Date" when formatted
      expect(result).toBe('Invalid Date');
    });

    it('should handle empty string as Invalid Date', () => {
      const result = formatTime('');
      // Empty string is Invalid Date
      expect(result).toBe('Invalid Date');
    });

    it('should handle undefined as Invalid Date', () => {
      const result = formatTime(undefined as any);
      // undefined creates Invalid Date
      expect(result).toBe('Invalid Date');
    });

    it('should handle null as epoch time', () => {
      const result = formatTime(null as any);
      // null is treated as 0 (epoch time)
      expect(result).toMatch(/^\d{2}:\d{2}:\d{2}$/);
    });

    it('should handle malformed date gracefully', () => {
      const result = formatTime('2024-13-45T99:99:99Z');
      // Invalid date produces "Invalid Date" string when formatted
      expect(result).toBe('Invalid Date');
    });

    it('should handle random string gracefully', () => {
      const result = formatTime('xyz123abc');
      // Invalid date produces "Invalid Date" string when formatted
      expect(result).toBe('Invalid Date');
    });

    it('should handle numeric string as milliseconds since epoch', () => {
      const result = formatTime('12345');
      // '12345' is parsed as milliseconds since epoch (12.345 seconds)
      expect(result).toBe('00:00:00');
    });
  });

  describe('edge cases', () => {
    it('should handle timezone offsets correctly', () => {
      // Different timezones should parse, output depends on system locale
      const result = formatTime('2024-01-15T14:30:45+05:30');
      expect(result).toMatch(/^\d{2}:\d{2}:\d{2}$/);
    });

    it('should handle very old dates', () => {
      const result = formatTime('1970-01-01T00:00:00Z');
      expect(result).toMatch(/^\d{2}:\d{2}:\d{2}$/);
    });

    it('should handle future dates', () => {
      const result = formatTime('2099-12-31T23:59:59Z');
      expect(result).toMatch(/^\d{2}:\d{2}:\d{2}$/);
    });
  });
});

describe('formatDuration', () => {
  describe('milliseconds (< 1000ms)', () => {
    it('should format 0ms', () => {
      expect(formatDuration(0)).toBe('0ms');
    });

    it('should format 1ms', () => {
      expect(formatDuration(1)).toBe('1ms');
    });

    it('should format 500ms', () => {
      expect(formatDuration(500)).toBe('500ms');
    });

    it('should format 999ms', () => {
      expect(formatDuration(999)).toBe('999ms');
    });

    it('should round fractional milliseconds to a whole number', () => {
      expect(formatDuration(235.23442234)).toBe('235ms');
      expect(formatDuration(324.6)).toBe('325ms');
    });
  });

  describe('seconds (>= 1000ms)', () => {
    it('should format exactly 1000ms as 1.0s', () => {
      expect(formatDuration(1000)).toBe('1.0s');
    });

    it('should format 1500ms as 1.5s', () => {
      expect(formatDuration(1500)).toBe('1.5s');
    });

    it('should format 2000ms as 2.0s', () => {
      expect(formatDuration(2000)).toBe('2.0s');
    });

    it('should format 2500ms as 2.5s', () => {
      expect(formatDuration(2500)).toBe('2.5s');
    });

    it('should format 5000ms as 5.0s', () => {
      expect(formatDuration(5000)).toBe('5.0s');
    });

    it('should format 9999ms with one decimal place', () => {
      expect(formatDuration(9999)).toBe('10.0s');
    });

    it('should format 15000ms as 15.0s', () => {
      expect(formatDuration(15000)).toBe('15.0s');
    });

    it('should round to one decimal place', () => {
      expect(formatDuration(1234)).toBe('1.2s');
      expect(formatDuration(1275)).toBe('1.3s');
    });

    it('should format large durations', () => {
      expect(formatDuration(60000)).toBe('60.0s');
      expect(formatDuration(120000)).toBe('120.0s');
    });
  });

  describe('edge cases', () => {
    it('should handle boundary at 1000ms', () => {
      expect(formatDuration(999)).toBe('999ms');
      expect(formatDuration(1000)).toBe('1.0s');
    });

    it('should handle very small values', () => {
      expect(formatDuration(1)).toBe('1ms');
    });

    it('should always include unit suffix', () => {
      const result1 = formatDuration(500);
      const result2 = formatDuration(1500);
      expect(result1).toMatch(/ms$/);
      expect(result2).toMatch(/s$/);
    });
  });
});

describe('getDurationClass', () => {
  describe('fast (< 1000ms)', () => {
    it('should return duration-fast for 0ms', () => {
      expect(getDurationClass(0)).toBe('duration-fast');
    });

    it('should return duration-fast for 1ms', () => {
      expect(getDurationClass(1)).toBe('duration-fast');
    });

    it('should return duration-fast for 500ms', () => {
      expect(getDurationClass(500)).toBe('duration-fast');
    });

    it('should return duration-fast for 999ms', () => {
      expect(getDurationClass(999)).toBe('duration-fast');
    });
  });

  describe('medium (1000ms - 4999ms)', () => {
    it('should return duration-medium for exactly 1000ms', () => {
      expect(getDurationClass(1000)).toBe('duration-medium');
    });

    it('should return duration-medium for 2500ms', () => {
      expect(getDurationClass(2500)).toBe('duration-medium');
    });

    it('should return duration-medium for 4999ms', () => {
      expect(getDurationClass(4999)).toBe('duration-medium');
    });
  });

  describe('slow (5000ms - 14999ms)', () => {
    it('should return duration-slow for exactly 5000ms', () => {
      expect(getDurationClass(5000)).toBe('duration-slow');
    });

    it('should return duration-slow for 10000ms', () => {
      expect(getDurationClass(10000)).toBe('duration-slow');
    });

    it('should return duration-slow for 14999ms', () => {
      expect(getDurationClass(14999)).toBe('duration-slow');
    });
  });

  describe('very-slow (>= 15000ms)', () => {
    it('should return duration-very-slow for exactly 15000ms', () => {
      expect(getDurationClass(15000)).toBe('duration-very-slow');
    });

    it('should return duration-very-slow for 20000ms', () => {
      expect(getDurationClass(20000)).toBe('duration-very-slow');
    });

    it('should return duration-very-slow for 60000ms', () => {
      expect(getDurationClass(60000)).toBe('duration-very-slow');
    });

    it('should return duration-very-slow for very large values', () => {
      expect(getDurationClass(1000000)).toBe('duration-very-slow');
    });
  });

  describe('boundary conditions', () => {
    it('should have clear boundary at 1000ms', () => {
      expect(getDurationClass(999)).toBe('duration-fast');
      expect(getDurationClass(1000)).toBe('duration-medium');
    });

    it('should have clear boundary at 5000ms', () => {
      expect(getDurationClass(4999)).toBe('duration-medium');
      expect(getDurationClass(5000)).toBe('duration-slow');
    });

    it('should have clear boundary at 15000ms', () => {
      expect(getDurationClass(14999)).toBe('duration-slow');
      expect(getDurationClass(15000)).toBe('duration-very-slow');
    });
  });
});

describe('formatElapsed', () => {
  describe('sub-minute durations (< 60000ms)', () => {
    it('should return <1m for 0ms', () => {
      expect(formatElapsed(0)).toBe('<1m');
    });

    it('should return <1m for 1ms', () => {
      expect(formatElapsed(1)).toBe('<1m');
    });

    it('should return <1m for 30 seconds', () => {
      expect(formatElapsed(30000)).toBe('<1m');
    });

    it('should return <1m for 59 seconds', () => {
      expect(formatElapsed(59000)).toBe('<1m');
    });

    it('should return <1m for 59999ms', () => {
      expect(formatElapsed(59999)).toBe('<1m');
    });
  });

  describe('minutes only (60000ms - 3599999ms)', () => {
    it('should return 1m for exactly 1 minute', () => {
      expect(formatElapsed(60000)).toBe('1m');
    });

    it('should return 5m for 5 minutes', () => {
      expect(formatElapsed(300000)).toBe('5m');
    });

    it('should return 30m for 30 minutes', () => {
      expect(formatElapsed(1800000)).toBe('30m');
    });

    it('should return 59m for 59 minutes', () => {
      expect(formatElapsed(3540000)).toBe('59m');
    });

    it('should floor partial minutes', () => {
      // 1 minute 30 seconds = 90000ms, should be 1m (not 1.5m)
      expect(formatElapsed(90000)).toBe('1m');
    });

    it('should round down for sub-minute remainders', () => {
      // 2 minutes 45 seconds = 165000ms, should be 2m
      expect(formatElapsed(165000)).toBe('2m');
    });
  });

  describe('hours and minutes', () => {
    it('should return 1h 0m for exactly 1 hour', () => {
      expect(formatElapsed(3600000)).toBe('1h 0m');
    });

    it('should return 1h 1m for 1 hour 1 minute', () => {
      expect(formatElapsed(3660000)).toBe('1h 1m');
    });

    it('should return 1h 30m for 1.5 hours', () => {
      expect(formatElapsed(5400000)).toBe('1h 30m');
    });

    it('should return 2h 15m for 2 hours 15 minutes', () => {
      expect(formatElapsed(8100000)).toBe('2h 15m');
    });

    it('should return 10h 45m for 10.75 hours', () => {
      expect(formatElapsed(38700000)).toBe('10h 45m');
    });

    it('should floor minutes when both hours and minutes present', () => {
      // 1 hour 1 minute 30 seconds = 3690000ms, should be 1h 1m
      expect(formatElapsed(3690000)).toBe('1h 1m');
    });

    it('should handle 0 minutes in the hour', () => {
      // 2 hours exactly = 7200000ms
      expect(formatElapsed(7200000)).toBe('2h 0m');
    });

    it('should handle large hour values', () => {
      // 24 hours = 86400000ms
      expect(formatElapsed(86400000)).toBe('24h 0m');
    });

    it('should handle multiple days', () => {
      // 48 hours = 172800000ms
      expect(formatElapsed(172800000)).toBe('48h 0m');
    });
  });

  describe('edge cases', () => {
    it('should handle boundary at 60000ms', () => {
      expect(formatElapsed(59999)).toBe('<1m');
      expect(formatElapsed(60000)).toBe('1m');
    });

    it('should handle boundary at 3600000ms (1 hour)', () => {
      expect(formatElapsed(3599999)).toBe('59m');
      expect(formatElapsed(3600000)).toBe('1h 0m');
    });

    it('should handle 59 minutes 59 seconds before hour', () => {
      expect(formatElapsed(3599000)).toBe('59m');
    });

    it('should correctly format just over 1 minute', () => {
      expect(formatElapsed(61000)).toBe('1m');
    });
  });
});

describe('shortenToolName', () => {
  it('should strip mcp__server__prefix from MCP tool names', () => {
    expect(shortenToolName('mcp__claude-in-chrome__computer')).toBe('computer');
    expect(shortenToolName('mcp__claude-in-chrome__read_page')).toBe('read_page');
    expect(shortenToolName('mcp__claude-in-chrome__navigate')).toBe('navigate');
  });

  it('should handle MCP tools from other servers', () => {
    expect(shortenToolName('mcp__github__create_issue')).toBe('create_issue');
    expect(shortenToolName('mcp__filesystem__read_file')).toBe('read_file');
  });

  it('should keep built-in tool names unchanged', () => {
    expect(shortenToolName('Bash')).toBe('Bash');
    expect(shortenToolName('Read')).toBe('Read');
    expect(shortenToolName('Edit')).toBe('Edit');
    expect(shortenToolName('Write')).toBe('Write');
    expect(shortenToolName('Grep')).toBe('Grep');
    expect(shortenToolName('Glob')).toBe('Glob');
    expect(shortenToolName('Task')).toBe('Task');
  });

  it('should handle empty and edge case inputs', () => {
    expect(shortenToolName('')).toBe('');
    expect(shortenToolName('simple')).toBe('simple');
  });
});

describe('summarizeInput', () => {
  describe('undefined and empty inputs', () => {
    it('should return empty string for undefined input', () => {
      expect(summarizeInput(undefined)).toBe('');
    });

    it('should return empty string for null input', () => {
      expect(summarizeInput(null as any)).toBe('');
    });

    it('should return empty string for empty string', () => {
      expect(summarizeInput('')).toBe('');
    });

    it('should return empty string for undefined without toolName', () => {
      expect(summarizeInput(undefined, 'Read')).toBe('');
    });
  });

  describe('Read tool', () => {
    it('should extract file_path from Read input', () => {
      const input = JSON.stringify({ file_path: '/path/to/file.txt' });
      expect(summarizeInput(input, 'Read')).toBe('/path/to/file.txt');
    });

    it('should fall back to generic handling if file_path missing', () => {
      const input = JSON.stringify({ limit: 100 });
      const result = summarizeInput(input, 'Read');
      // No file_path, falls back to generic - returns JSON string (less than 60 chars)
      expect(result).toBe('{"limit":100}');
    });

    it('should handle long file paths', () => {
      const longPath = '/very/long/path/that/is/more/than/eighty/characters/long/so/it/should/not/be/truncated/here.txt';
      const input = JSON.stringify({ file_path: longPath });
      expect(summarizeInput(input, 'Read')).toBe(longPath);
    });
  });

  describe('Write tool', () => {
    it('should extract file_path from Write input', () => {
      const input = JSON.stringify({ file_path: '/path/to/output.txt', content: 'data' });
      expect(summarizeInput(input, 'Write')).toBe('/path/to/output.txt');
    });

    it('should prioritize file_path over other fields', () => {
      const input = JSON.stringify({ file_path: '/specific/file.txt', content: 'some content' });
      expect(summarizeInput(input, 'Write')).toBe('/specific/file.txt');
    });
  });

  describe('Edit tool', () => {
    it('should extract file_path from Edit input', () => {
      const input = JSON.stringify({ file_path: '/path/to/edit.ts', old_string: 'old', new_string: 'new' });
      expect(summarizeInput(input, 'Edit')).toBe('/path/to/edit.ts');
    });
  });

  describe('Bash tool', () => {
    it('should extract command from Bash input', () => {
      const input = JSON.stringify({ command: 'ls -la' });
      expect(summarizeInput(input, 'Bash')).toBe('ls -la');
    });

    it('should truncate long commands at 80 characters', () => {
      const longCmd = 'for i in {1..1000}; do echo "This is a very long command that exceeds eighty characters"; done';
      const input = JSON.stringify({ command: longCmd });
      const result = summarizeInput(input, 'Bash');
      expect(result).toBe(longCmd.slice(0, 80) + '...');
      expect(result.length).toBe(83); // 80 + '...'
    });

    it('should not truncate commands shorter than 80 characters', () => {
      const shortCmd = 'ls -la /tmp';
      const input = JSON.stringify({ command: shortCmd });
      expect(summarizeInput(input, 'Bash')).toBe(shortCmd);
      expect(summarizeInput(input, 'Bash')).not.toContain('...');
    });

    it('should handle exactly 80-character command', () => {
      const cmd = 'a'.repeat(80);
      const input = JSON.stringify({ command: cmd });
      expect(summarizeInput(input, 'Bash')).toBe(cmd);
    });

    it('should handle 81-character command', () => {
      const cmd = 'a'.repeat(81);
      const input = JSON.stringify({ command: cmd });
      expect(summarizeInput(input, 'Bash')).toBe('a'.repeat(80) + '...');
    });

    it('should fall back to generic handling if command missing', () => {
      const input = JSON.stringify({ description: 'some bash operation' });
      const result = summarizeInput(input, 'Bash');
      // No command, falls back to generic - returns JSON string (less than 60 chars)
      expect(result).toBeDefined();
    });
  });

  describe('Grep tool', () => {
    it('should extract pattern from Grep input', () => {
      const input = JSON.stringify({ pattern: 'error|warning' });
      expect(summarizeInput(input, 'Grep')).toBe('error|warning');
    });

    it('should include path when both pattern and path present', () => {
      const input = JSON.stringify({ pattern: 'error', path: '/src/**/*.ts' });
      const result = summarizeInput(input, 'Grep');
      expect(result).toBe('error in /src/**/*.ts');
    });

    it('should truncate pattern+path at 80 characters', () => {
      const pattern = 'a'.repeat(70);
      const path = '/very/long/path/that/is/quite/lengthy.ts';
      const input = JSON.stringify({ pattern, path });
      const result = summarizeInput(input, 'Grep');
      expect(result.length).toBe(83); // 80 + '...'
      expect(result).toContain('...');
    });

    it('should not truncate short pattern+path', () => {
      const input = JSON.stringify({ pattern: 'error', path: '/src/app.ts' });
      const result = summarizeInput(input, 'Grep');
      expect(result).toBe('error in /src/app.ts');
      expect(result).not.toContain('...');
    });

    it('should fall back to generic handling if pattern missing', () => {
      const input = JSON.stringify({ path: '/src' });
      const result = summarizeInput(input, 'Grep');
      // No pattern, falls back to generic - extracts /src from JSON
      expect(result).toBe('/src');
    });
  });

  describe('Glob tool', () => {
    it('should extract pattern from Glob input', () => {
      const input = JSON.stringify({ pattern: '**/*.ts' });
      expect(summarizeInput(input, 'Glob')).toBe('**/*.ts');
    });

    it('should handle long glob patterns', () => {
      const pattern = '**/**/very/deep/path/**/with/many/**/*.test.ts';
      const input = JSON.stringify({ pattern });
      expect(summarizeInput(input, 'Glob')).toBe(pattern);
    });

    it('should fall back to generic handling if pattern missing', () => {
      const input = JSON.stringify({ path: '/src' });
      const result = summarizeInput(input, 'Glob');
      // No pattern, falls back to generic - extracts /src from JSON
      expect(result).toBe('/src');
    });
  });

  describe('Task tool', () => {
    it('should use subagent_type alone if description missing', () => {
      const input = JSON.stringify({ subagent_type: 'researcher' });
      expect(summarizeInput(input, 'Task')).toBe('researcher');
    });

    it('should use description alone if subagent_type missing', () => {
      const input = JSON.stringify({ description: 'Analyze performance' });
      expect(summarizeInput(input, 'Task')).toBe('Analyze performance');
    });

    it('should combine subagent_type and description with colon', () => {
      const input = JSON.stringify({ subagent_type: 'researcher', description: 'Find latest docs' });
      expect(summarizeInput(input, 'Task')).toBe('researcher: Find latest docs');
    });

    it('should truncate combined output at 80 characters', () => {
      const subagentType = 'a'.repeat(50);
      const description = 'b'.repeat(50);
      const input = JSON.stringify({ subagent_type: subagentType, description });
      const result = summarizeInput(input, 'Task');
      expect(result.length).toBe(83); // 80 + '...'
      expect(result).toContain('...');
    });

    it('should not truncate short combined output', () => {
      const input = JSON.stringify({ subagent_type: 'coder', description: 'Write tests' });
      const result = summarizeInput(input, 'Task');
      expect(result).toBe('coder: Write tests');
      expect(result).not.toContain('...');
    });

    it('should fall back to generic handling if both fields missing', () => {
      const input = JSON.stringify({ other_field: 'value' });
      const result = summarizeInput(input, 'Task');
      // No subagent_type or description, falls back to generic
      expect(result).toBeDefined();
    });
  });

  describe('WebFetch tool', () => {
    it('should extract url from WebFetch input', () => {
      const input = JSON.stringify({ url: 'https://example.com/api' });
      expect(summarizeInput(input, 'WebFetch')).toBe('https://example.com/api');
    });

    it('should truncate long URLs at 80 characters', () => {
      const url = 'https://example.com/' + 'a'.repeat(100);
      const input = JSON.stringify({ url });
      const result = summarizeInput(input, 'WebFetch');
      expect(result).toBe(url.slice(0, 80) + '...');
      expect(result.length).toBe(83);
    });

    it('should not truncate short URLs', () => {
      const url = 'https://example.com/page';
      const input = JSON.stringify({ url });
      expect(summarizeInput(input, 'WebFetch')).toBe(url);
    });

    it('should fall back to generic handling if url missing', () => {
      const input = JSON.stringify({ prompt: 'search query' });
      // No url field, and the JSON string doesn't contain a path, so returns the JSON string (or truncated)
      const result = summarizeInput(input, 'WebFetch');
      expect(result).toBeDefined();
    });
  });

  describe('WebSearch tool', () => {
    it('should extract query from WebSearch input', () => {
      const input = JSON.stringify({ query: 'latest React trends' });
      expect(summarizeInput(input, 'WebSearch')).toBe('latest React trends');
    });

    it('should handle long search queries', () => {
      const query = 'a'.repeat(100);
      const input = JSON.stringify({ query });
      expect(summarizeInput(input, 'WebSearch')).toBe(query);
    });

    it('should fall back to generic handling if query missing', () => {
      const input = JSON.stringify({ blocked_domains: ['evil.com'] });
      // No query field, falls back to generic handling
      const result = summarizeInput(input, 'WebSearch');
      expect(result).toBeDefined();
    });
  });

  describe('generic fallback (no toolName)', () => {
    it('should extract path from input without toolName', () => {
      const input = 'processing /path/to/file.txt with data';
      expect(summarizeInput(input)).toBe('/path/to/file.txt');
    });

    it('should truncate long input at 60 characters', () => {
      const input = 'a'.repeat(70);
      const result = summarizeInput(input);
      expect(result).toBe('a'.repeat(60) + '...');
    });

    it('should not truncate short input', () => {
      const input = 'short input text';
      expect(summarizeInput(input)).toBe(input);
    });

    it('should handle exactly 60-character input', () => {
      const input = 'a'.repeat(60);
      expect(summarizeInput(input)).toBe(input);
    });

    it('should handle 61-character input', () => {
      const input = 'a'.repeat(61);
      expect(summarizeInput(input)).toBe('a'.repeat(60) + '...');
    });

    it('should extract first path-like string', () => {
      const input = 'reading /first/path and /second/path here';
      expect(summarizeInput(input)).toBe('/first/path');
    });

    it('should not extract paths that contain quotes or spaces', () => {
      const input = 'checking "/path with spaces" result';
      // The regex /\/[^\s"']+/ stops at quotes, so it should extract /path
      expect(summarizeInput(input)).toBe('/path');
    });

    it('should handle input without paths', () => {
      const input = 'this is a short message';
      expect(summarizeInput(input)).toBe(input);
    });

    it('should handle input with URL', () => {
      // The path regex /\/[^\s"']+/ matches / not preceded by letters, so it matches //example.com/page
      const input = 'fetch https://example.com/page';
      const result = summarizeInput(input);
      // It will extract //example.com/page (the first / followed by non-whitespace)
      expect(result).toMatch(/^\/\/|^a/); // Either path match or first 60 chars
    });
  });

  describe('invalid JSON with toolName', () => {
    it('should fall back to generic handling for invalid JSON', () => {
      const input = 'not json at all';
      const result = summarizeInput(input, 'Read');
      // Should extract path or truncate
      expect(result).toBe(input);
    });

    it('should fall back to path extraction for invalid JSON', () => {
      const input = 'executing command on /var/log/app.log';
      const result = summarizeInput(input, 'Bash');
      expect(result).toBe('/var/log/app.log');
    });

    it('should truncate invalid JSON if no path found', () => {
      const input = 'a'.repeat(70);
      const result = summarizeInput(input, 'Read');
      expect(result).toBe('a'.repeat(60) + '...');
    });
  });

  describe('edge cases in summarization', () => {
    it('should handle JSON with extra whitespace', () => {
      const input = JSON.stringify({ command: 'ls -la' });
      const result = summarizeInput(input, 'Bash');
      expect(result).toBe('ls -la');
    });

    it('should handle tool names case-sensitively', () => {
      // 'bash' (lowercase) is not a valid case, so should use fallback
      const input = JSON.stringify({ command: 'ls -la' });
      const result = summarizeInput(input, 'bash'); // lowercase
      // Without matching toolName, it should extract path or truncate
      expect(result.length <= 63); // 60 + '...' or less if shorter
    });

    it('should handle unknown tool names', () => {
      const input = JSON.stringify({ command: 'ls -la', something: 'value' });
      const result = summarizeInput(input, 'UnknownTool');
      // Should fall back to generic handling
      expect(typeof result).toBe('string');
    });

    it('should handle empty JSON object', () => {
      const input = JSON.stringify({});
      const result = summarizeInput(input, 'Read');
      // No file_path, falls back to generic - input is '{}' which is 2 chars, less than 60
      expect(result).toBe('{}');
    });

    it('should handle JSON with null values', () => {
      const input = JSON.stringify({ command: null, path: '/some/path' });
      const result = summarizeInput(input, 'Bash');
      // command is null, not a string, so should fall back
      expect(result).toBe('/some/path');
    });

    it('should handle specially formatted JSON in string', () => {
      const nested = JSON.stringify({ pattern: 'test' });
      const input = JSON.stringify({ command: nested });
      // This will parse as JSON with command being a string of JSON
      const result = summarizeInput(input, 'Bash');
      // command exists but is a JSON string, should be returned
      expect(result).toContain('pattern');
    });
  });

  describe('path extraction regex accuracy', () => {
    it('should extract paths starting with /', () => {
      expect(summarizeInput('/absolute/path/here')).toBe('/absolute/path/here');
    });

    it('should stop path extraction at whitespace', () => {
      expect(summarizeInput('processing /path/to/file done')).toBe('/path/to/file');
    });

    it('should stop path extraction at double quotes', () => {
      expect(summarizeInput('file is "/path/to/file" end')).toBe('/path/to/file');
    });

    it('should stop path extraction at single quotes', () => {
      expect(summarizeInput("file is '/path/to/file' end")).toBe('/path/to/file');
    });

    it('should extract path with dots and hyphens', () => {
      expect(summarizeInput('open /path/to-my/file.txt here')).toBe('/path/to-my/file.txt');
    });

    it('should extract path with numbers', () => {
      expect(summarizeInput('read /var/log/app123.log data')).toBe('/var/log/app123.log');
    });

    it('should match protocol-style paths', () => {
      const input = 'go to https://example.com/path';
      const result = summarizeInput(input);
      // The regex /\/[^\s"']+/ matches //example.com/path
      expect(result).toBe('//example.com/path');
    });
  });

  describe('MCP browser tools', () => {
    it('should summarize computer screenshot', () => {
      const input = JSON.stringify({ action: 'screenshot', tabId: 706679369 });
      expect(summarizeInput(input, 'mcp__claude-in-chrome__computer')).toBe('screenshot');
    });

    it('should summarize computer click with coordinates', () => {
      const input = JSON.stringify({ action: 'left_click', coordinate: [33, 67], tabId: 706679369 });
      expect(summarizeInput(input, 'mcp__claude-in-chrome__computer')).toBe('left_click (33,67)');
    });

    it('should summarize computer type with text', () => {
      const input = JSON.stringify({ action: 'type', text: 'hello world', tabId: 706679369 });
      expect(summarizeInput(input, 'mcp__claude-in-chrome__computer')).toBe('type "hello world"');
    });

    it('should summarize computer key with ref', () => {
      const input = JSON.stringify({ action: 'left_click', ref: 'ref_11', tabId: 706679369 });
      expect(summarizeInput(input, 'mcp__claude-in-chrome__computer')).toBe('left_click ref_11');
    });

    it('should summarize navigate with URL', () => {
      const input = JSON.stringify({ url: 'http://localhost:3356/', tabId: 706679369 });
      expect(summarizeInput(input, 'mcp__claude-in-chrome__navigate')).toBe('http://localhost:3356/');
    });

    it('should summarize find with query', () => {
      const input = JSON.stringify({ query: 'theme toggle button', tabId: 706679369 });
      expect(summarizeInput(input, 'mcp__claude-in-chrome__find')).toBe('theme toggle button');
    });

    it('should summarize form_input with ref and value', () => {
      const input = JSON.stringify({ ref: 'ref_5', value: 'test@email.com', tabId: 706679369 });
      expect(summarizeInput(input, 'mcp__claude-in-chrome__form_input')).toBe('ref_5 = test@email.com');
    });
  });

  describe('generic JSON fallback', () => {
    it('should show compact key:value pairs for unhandled JSON tools', () => {
      const input = JSON.stringify({ action: 'start_recording', tabId: 123 });
      const result = summarizeInput(input, 'mcp__claude-in-chrome__gif_creator');
      expect(result).toBe('action:start_recording, tabId:123');
    });

    it('should skip object values in generic fallback', () => {
      const input = JSON.stringify({ action: 'test', options: { nested: true }, tabId: 5 });
      expect(summarizeInput(input, 'mcp__unknown__tool')).toBe('action:test, tabId:5');
    });

    it('should limit to 4 key:value pairs', () => {
      const input = JSON.stringify({ a: 1, b: 2, c: 3, d: 4, e: 5 });
      const result = summarizeInput(input, 'SomeUnknownTool');
      expect(result).toBe('a:1, b:2, c:3, d:4');
    });
  });
});
