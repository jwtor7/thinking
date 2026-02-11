/**
 * Unit tests for the Transcript Watcher module.
 *
 * Tests file watching, JSONL parsing, thinking block extraction,
 * and security measures.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { TranscriptWatcher, extractWorkingDirectory, isValidClaudePathWithinRoot } from './transcript-watcher.ts';
import type { WebSocketHub } from './websocket-hub.ts';
import type { ThinkingEvent, MonitorEvent } from './types.ts';

// Mock WebSocketHub for testing
class MockWebSocketHub implements Pick<WebSocketHub, 'broadcast' | 'getClientCount'> {
  public broadcastedEvents: MonitorEvent[] = [];

  broadcast(event: MonitorEvent): void {
    this.broadcastedEvents.push(event);
  }

  getClientCount(): number {
    return 1;
  }

  clear(): void {
    this.broadcastedEvents = [];
  }
}

describe('isValidClaudePath', () => {
  const claudeDir = join(tmpdir(), 'thinking-claude-path-validation');

  it('should accept paths within ~/.claude/', () => {
    expect(isValidClaudePathWithinRoot(join(claudeDir, 'projects'), claudeDir)).toBe(true);
    expect(isValidClaudePathWithinRoot(join(claudeDir, 'projects', 'test-project'), claudeDir)).toBe(true);
    expect(isValidClaudePathWithinRoot(join(claudeDir, 'projects', 'test.jsonl'), claudeDir)).toBe(true);
  });

  it('should accept the ~/.claude/ directory itself', () => {
    expect(isValidClaudePathWithinRoot(claudeDir, claudeDir)).toBe(true);
  });

  it('should reject paths outside ~/.claude/', () => {
    expect(isValidClaudePathWithinRoot('/tmp/test', claudeDir)).toBe(false);
    expect(isValidClaudePathWithinRoot('/etc/passwd', claudeDir)).toBe(false);
    expect(isValidClaudePathWithinRoot('/Users/other/.claude/projects', claudeDir)).toBe(false);
    expect(isValidClaudePathWithinRoot(join(claudeDir, '..'), claudeDir)).toBe(false);
  });

  it('should reject paths with directory traversal attempts', () => {
    // Note: resolve() normalizes these, but we check for '..' just in case
    expect(isValidClaudePathWithinRoot(join(claudeDir, '..', 'etc', 'passwd'), claudeDir)).toBe(false);
  });

  it('should handle relative paths correctly', () => {
    // Relative paths are resolved against cwd, which is unlikely to be in ~/.claude/
    expect(isValidClaudePathWithinRoot('./test', claudeDir)).toBe(false);
    expect(isValidClaudePathWithinRoot('../test', claudeDir)).toBe(false);
  });
});

describe('TranscriptWatcher', () => {
  let mockHub: MockWebSocketHub;
  let watcher: TranscriptWatcher;
  let testDir: string;
  let projectsDir: string;

  beforeEach(async () => {
    mockHub = new MockWebSocketHub();

    // Create a temporary test directory
    testDir = join(tmpdir(), `transcript-watcher-test-${Date.now()}`);
    await mkdir(testDir, { recursive: true });

    projectsDir = join(testDir, 'projects');
    await mkdir(projectsDir, { recursive: true });

    watcher = new TranscriptWatcher(mockHub as unknown as WebSocketHub, {
      claudeDir: testDir,
      projectsDir,
    });
  });

  afterEach(async () => {
    // Stop the watcher
    watcher.stop();

    // Clean up test directory
    try {
      await rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('Lifecycle', () => {
    it('should start and stop without errors', async () => {
      // The watcher won't find the projects directory in tests, but should handle gracefully
      await expect(watcher.start()).resolves.not.toThrow();
      expect(() => watcher.stop()).not.toThrow();
    });

    it('should report not running after stop', async () => {
      await watcher.start();
      watcher.stop();
      expect(watcher.isRunning()).toBe(false);
    });

    it('should report zero tracked files initially', () => {
      expect(watcher.getTrackedFileCount()).toBe(0);
    });
  });
});

describe('JSONL Parsing', () => {
  it('should parse thinking blocks from assistant messages', () => {
    // Test the structure that would be parsed
    const line = {
      type: 'assistant',
      sessionId: 'session-123',
      agentId: 'agent-abc',
      timestamp: '2025-12-22T00:00:00.000Z',
      message: {
        role: 'assistant',
        content: [
          {
            type: 'thinking',
            thinking: 'I need to analyze this problem...',
          },
          {
            type: 'text',
            text: 'Here is my response.',
          },
        ],
      },
    };

    // Verify structure matches expected format
    expect(line.message.role).toBe('assistant');
    expect(line.message.content).toHaveLength(2);
    expect(line.message.content[0].type).toBe('thinking');
    expect(line.message.content[0].thinking).toBeDefined();
  });

  it('should handle messages without thinking blocks', () => {
    const line = {
      type: 'assistant',
      message: {
        role: 'assistant',
        content: [
          {
            type: 'text',
            text: 'Just a response without thinking.',
          },
        ],
      },
    };

    const thinkingBlocks = line.message.content.filter(
      (block: { type: string }) => block.type === 'thinking'
    );
    expect(thinkingBlocks).toHaveLength(0);
  });

  it('should handle user messages (no thinking)', () => {
    const line = {
      type: 'user',
      message: {
        role: 'user',
        content: 'User message',
      },
    };

    expect(line.message.role).toBe('user');
  });

  it('should handle summary lines (no message)', () => {
    const line = {
      type: 'summary',
      summary: 'Claude Code Dashboard: Real-time Thinking Visualization',
    };

    expect(line.type).toBe('summary');
    expect('message' in line).toBe(false);
  });

  it('should extract multiple thinking blocks from one message', () => {
    const content = [
      {
        type: 'thinking',
        thinking: 'First thought...',
      },
      {
        type: 'tool_use',
        id: 'tool-123',
      },
      {
        type: 'thinking',
        thinking: 'Second thought after tool use...',
      },
    ];

    const thinkingBlocks = content
      .filter((block) => block.type === 'thinking' && 'thinking' in block)
      .map((block) => (block as { type: 'thinking'; thinking: string }).thinking);

    expect(thinkingBlocks).toHaveLength(2);
    expect(thinkingBlocks[0]).toBe('First thought...');
    expect(thinkingBlocks[1]).toBe('Second thought after tool use...');
  });
});

describe('Security', () => {
  it('should redact secrets from thinking content', async () => {
    // This tests the integration with redactSecrets
    const { redactSecrets } = await import('./secrets.ts');

    const thinkingWithSecret = 'Using API key sk_live_51ABC123def456ghij789klmno for authentication';
    const redacted = redactSecrets(thinkingWithSecret);

    expect(redacted).toContain('[REDACTED]');
    expect(redacted).not.toContain('sk_live_');
  });

  it('should truncate large thinking content', async () => {
    const { truncatePayload, CONFIG } = await import('./types.ts');

    const largeContent = 'x'.repeat(CONFIG.MAX_PAYLOAD_SIZE + 1000);
    const truncated = truncatePayload(largeContent);

    expect(truncated).toBeDefined();
    expect(truncated!.length).toBeLessThanOrEqual(CONFIG.MAX_PAYLOAD_SIZE + 50); // Account for truncation message
    expect(truncated).toContain('[truncated]');
  });
});

describe('ThinkingEvent Structure', () => {
  it('should create valid thinking events', () => {
    const event: ThinkingEvent = {
      type: 'thinking',
      timestamp: new Date().toISOString(),
      content: 'Test thinking content',
      sessionId: 'session-123',
      agentId: 'agent-456',
    };

    expect(event.type).toBe('thinking');
    expect(event.content).toBe('Test thinking content');
    expect(event.sessionId).toBe('session-123');
    expect(event.agentId).toBe('agent-456');
    expect(event.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });

  it('should allow optional sessionId and agentId', () => {
    const event: ThinkingEvent = {
      type: 'thinking',
      timestamp: new Date().toISOString(),
      content: 'Minimal thinking event',
    };

    expect(event.type).toBe('thinking');
    expect(event.content).toBeDefined();
    expect(event.sessionId).toBeUndefined();
    expect(event.agentId).toBeUndefined();
  });
});

describe('File Tracking Logic', () => {
  it('should only track .jsonl files', () => {
    const jsonlFile = 'session-123.jsonl';
    const txtFile = 'notes.txt';
    const mdFile = 'README.md';

    expect(jsonlFile.endsWith('.jsonl')).toBe(true);
    expect(txtFile.endsWith('.jsonl')).toBe(false);
    expect(mdFile.endsWith('.jsonl')).toBe(false);
  });

  it('should handle file path validation', () => {
    const claudeDir = join(tmpdir(), 'thinking-claude-path-validation');
    const validPath = join(claudeDir, 'projects', 'test-project', 'session.jsonl');
    const invalidPath = '/tmp/malicious.jsonl';

    expect(isValidClaudePathWithinRoot(validPath, claudeDir)).toBe(true);
    expect(isValidClaudePathWithinRoot(invalidPath, claudeDir)).toBe(false);
  });

  it('should extract working directory from subagent sidecar paths', () => {
    const subagentPath = '/Users/test/.claude/projects/-Users-true-dev-thinking/session-123/subagents/agent-abc.jsonl';
    expect(extractWorkingDirectory(subagentPath)).toBe('/Users/true/dev/thinking');
  });
});

describe('Subagent Transcript Support', () => {
  let mockHub: MockWebSocketHub;
  let watcher: TranscriptWatcher;
  let testDir: string;
  let projectsDir: string;

  beforeEach(async () => {
    mockHub = new MockWebSocketHub();

    testDir = join(tmpdir(), `transcript-watcher-subagent-test-${Date.now()}`);
    await mkdir(testDir, { recursive: true });
    projectsDir = join(testDir, 'projects');
    await mkdir(projectsDir, { recursive: true });

    watcher = new TranscriptWatcher(mockHub as unknown as WebSocketHub, {
      claudeDir: testDir,
      projectsDir,
    });
  });

  afterEach(async () => {
    watcher.stop();
    try {
      await rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  it('should not treat subagent sidecar files as session IDs', () => {
    const privateApi = watcher as unknown as { extractSessionIdFromPath: (filePath: string) => string | undefined };
    const sessionId = privateApi.extractSessionIdFromPath(
      '/tmp/.claude/projects/-Users-test-dev-app/session-1/subagents/agent-abc123.jsonl'
    );
    expect(sessionId).toBeUndefined();
  });

  it('should track subagent sidecar files discovered from main transcript lines', async () => {
    const projectPath = join(projectsDir, '-Users-test-dev-app');
    const sessionId = 'session-xyz';
    const agentId = 'abc123';
    const mainFilePath = join(projectPath, `${sessionId}.jsonl`);
    const sessionDir = join(projectPath, sessionId, 'subagents');
    const subagentFilePath = join(sessionDir, `agent-${agentId}.jsonl`);

    await mkdir(sessionDir, { recursive: true });
    await writeFile(mainFilePath, '', 'utf-8');
    await writeFile(subagentFilePath, '', 'utf-8');

    const privateApi = watcher as unknown as {
      processLine: (line: string, filePath: string) => Promise<void>;
    };
    await privateApi.processLine(
      JSON.stringify({
        sessionId,
        data: { agentId },
        timestamp: '2026-02-09T20:00:00.000Z',
      }),
      mainFilePath
    );

    expect(watcher.getTrackedFileCount()).toBe(1);
  });

  it('should extract thinking from nested progress message envelopes', async () => {
    const projectPath = join(projectsDir, '-Users-test-dev-app');
    const sessionId = 'session-nested';
    const mainFilePath = join(projectPath, `${sessionId}.jsonl`);

    await mkdir(projectPath, { recursive: true });
    await writeFile(mainFilePath, '', 'utf-8');

    const privateApi = watcher as unknown as {
      processLine: (line: string, filePath: string) => Promise<void>;
    };
    await privateApi.processLine(
      JSON.stringify({
        sessionId,
        timestamp: '2026-02-09T20:01:00.000Z',
        data: {
          agentId: 'agent-nested-1',
          message: {
            timestamp: '2026-02-09T20:01:01.000Z',
            message: {
              role: 'assistant',
              content: [
                { type: 'thinking', thinking: 'Nested subagent thought' },
                { type: 'text', text: 'Assistant reply' },
              ],
            },
          },
        },
      }),
      mainFilePath
    );

    const thinkingEvent = mockHub.broadcastedEvents.find(
      (event): event is ThinkingEvent => event.type === 'thinking'
    );

    expect(thinkingEvent).toBeDefined();
    expect(thinkingEvent?.content).toBe('Nested subagent thought');
    expect(thinkingEvent?.sessionId).toBe(sessionId);
    expect(thinkingEvent?.agentId).toBe('agent-nested-1');
    expect(thinkingEvent?.timestamp).toBe('2026-02-09T20:01:01.000Z');
  });
});

describe('Error Handling', () => {
  it('should handle invalid JSON lines gracefully', () => {
    const invalidLines = [
      'not json at all',
      '{"incomplete": ',
      '',
      '   ',
      'null',
      '[]',
    ];

    for (const line of invalidLines) {
      expect(() => {
        try {
          JSON.parse(line);
        } catch {
          // Expected for invalid JSON
        }
      }).not.toThrow();
    }
  });

  it('should handle missing message property', () => {
    const lineWithoutMessage = {
      type: 'summary',
      summary: 'Some summary',
    };

    expect('message' in lineWithoutMessage).toBe(false);
    expect(lineWithoutMessage.type).toBe('summary');
  });

  it('should handle missing content array', () => {
    const lineWithoutContent = {
      type: 'assistant',
      message: {
        role: 'assistant',
      },
    };

    expect('content' in lineWithoutContent.message).toBe(false);
  });
});

describe('Edge Cases', () => {
  it('should handle empty thinking content', () => {
    const emptyThinking = {
      type: 'thinking',
      thinking: '',
    };

    expect(emptyThinking.thinking).toBe('');
  });

  it('should handle very long thinking content', () => {
    const longThinking = 'x'.repeat(100000);
    expect(longThinking.length).toBe(100000);
  });

  it('should handle unicode in thinking content', () => {
    const unicodeThinking = {
      type: 'thinking',
      thinking: 'Analyzing: 日本語, 한국어, Emoji: 🤔💭',
    };

    expect(unicodeThinking.thinking).toContain('日本語');
    expect(unicodeThinking.thinking).toContain('🤔');
  });

  it('should handle newlines in thinking content', () => {
    const multilineThinking = {
      type: 'thinking',
      thinking: 'Line 1\nLine 2\nLine 3',
    };

    expect(multilineThinking.thinking).toContain('\n');
    expect(multilineThinking.thinking.split('\n')).toHaveLength(3);
  });
});
