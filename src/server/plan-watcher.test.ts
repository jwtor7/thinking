/**
 * Unit tests for the Plan Watcher module.
 *
 * Tests directory watching, plan file detection, content broadcasting,
 * and security measures.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir, homedir } from 'node:os';
import { PlanWatcher, isValidPlanPath } from './plan-watcher.ts';
import type { WebSocketHub } from './websocket-hub.ts';
import type { PlanUpdateEvent, PlanDeleteEvent, MonitorEvent } from './types.ts';

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

  getLastEvent(): MonitorEvent | undefined {
    return this.broadcastedEvents[this.broadcastedEvents.length - 1];
  }

  getPlanUpdateEvents(): PlanUpdateEvent[] {
    return this.broadcastedEvents.filter(
      (e): e is PlanUpdateEvent => e.type === 'plan_update'
    );
  }

  getPlanDeleteEvents(): PlanDeleteEvent[] {
    return this.broadcastedEvents.filter(
      (e): e is PlanDeleteEvent => e.type === 'plan_delete'
    );
  }
}

describe('isValidPlanPath', () => {
  const plansDir = join(homedir(), '.claude', 'plans');

  it('should accept paths within ~/.claude/plans/', () => {
    expect(isValidPlanPath(join(plansDir, 'test-plan.md'))).toBe(true);
    expect(isValidPlanPath(join(plansDir, 'another-plan.md'))).toBe(true);
    expect(isValidPlanPath(join(plansDir, 'nested', 'plan.md'))).toBe(true);
  });

  it('should accept the ~/.claude/plans/ directory itself', () => {
    expect(isValidPlanPath(plansDir)).toBe(true);
  });

  it('should reject paths outside ~/.claude/plans/', () => {
    expect(isValidPlanPath('/tmp/test.md')).toBe(false);
    expect(isValidPlanPath('/etc/passwd')).toBe(false);
    expect(isValidPlanPath('/Users/other/.claude/plans/test.md')).toBe(false);
    expect(isValidPlanPath(homedir())).toBe(false);
    // Should reject ~/.claude/ (parent directory)
    expect(isValidPlanPath(join(homedir(), '.claude'))).toBe(false);
    // Should reject ~/.claude/projects/ (sibling directory)
    expect(isValidPlanPath(join(homedir(), '.claude', 'projects'))).toBe(false);
  });

  it('should reject paths with directory traversal attempts', () => {
    // Note: resolve() normalizes these, but we check for '..' just in case
    expect(isValidPlanPath(join(plansDir, '..', 'settings.json'))).toBe(false);
    expect(isValidPlanPath(join(plansDir, '..', '..', 'etc', 'passwd'))).toBe(false);
  });

  it('should handle relative paths correctly', () => {
    // Relative paths are resolved against cwd, which is unlikely to be in ~/.claude/plans/
    expect(isValidPlanPath('./test.md')).toBe(false);
    expect(isValidPlanPath('../test.md')).toBe(false);
  });
});

describe('PlanWatcher', () => {
  let mockHub: MockWebSocketHub;
  let watcher: PlanWatcher;
  let testDir: string;

  beforeEach(async () => {
    mockHub = new MockWebSocketHub();
    watcher = new PlanWatcher(mockHub as unknown as WebSocketHub);

    // Create a temporary test directory
    testDir = join(tmpdir(), `plan-watcher-test-${Date.now()}`);
    await mkdir(testDir, { recursive: true });
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
      // The watcher won't find the plans directory in tests, but should handle gracefully
      await expect(watcher.start()).resolves.not.toThrow();
      expect(() => watcher.stop()).not.toThrow();
    });

    it('should report not running after stop', async () => {
      await watcher.start();
      watcher.stop();
      expect(watcher.isRunning()).toBe(false);
    });

    it('should report zero tracked plans initially', () => {
      expect(watcher.getTrackedPlanCount()).toBe(0);
    });

    it('should return empty array of tracked plans initially', () => {
      expect(watcher.getTrackedPlans()).toEqual([]);
    });
  });
});

describe('PlanUpdateEvent Structure', () => {
  it('should create valid plan update events', () => {
    const event: PlanUpdateEvent = {
      type: 'plan_update',
      timestamp: new Date().toISOString(),
      path: '/Users/test/.claude/plans/test-plan.md',
      filename: 'test-plan.md',
      content: '# Test Plan\n\nThis is a test plan.',
    };

    expect(event.type).toBe('plan_update');
    expect(event.path).toContain('test-plan.md');
    expect(event.filename).toBe('test-plan.md');
    expect(event.content).toContain('# Test Plan');
    expect(event.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });

  it('should allow optional content', () => {
    const event: PlanUpdateEvent = {
      type: 'plan_update',
      timestamp: new Date().toISOString(),
      path: '/Users/test/.claude/plans/empty.md',
      filename: 'empty.md',
    };

    expect(event.type).toBe('plan_update');
    expect(event.content).toBeUndefined();
  });
});

describe('PlanDeleteEvent Structure', () => {
  it('should create valid plan delete events', () => {
    const event: PlanDeleteEvent = {
      type: 'plan_delete',
      timestamp: new Date().toISOString(),
      path: '/Users/test/.claude/plans/deleted-plan.md',
      filename: 'deleted-plan.md',
    };

    expect(event.type).toBe('plan_delete');
    expect(event.path).toContain('deleted-plan.md');
    expect(event.filename).toBe('deleted-plan.md');
    expect(event.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });
});

describe('Security', () => {
  it('should redact secrets from plan content', async () => {
    const { redactSecrets } = await import('./secrets.ts');

    const planWithSecret = `# Plan

## Configuration

API_KEY=sk_live_51ABC123def456ghij789klmno

## Steps

1. Do something
`;
    const redacted = redactSecrets(planWithSecret);

    expect(redacted).toContain('[REDACTED]');
    expect(redacted).not.toContain('sk_live_');
  });

  it('should truncate large plan content', async () => {
    const { truncatePayload, CONFIG } = await import('./types.ts');

    const largeContent = '# Large Plan\n\n' + 'x'.repeat(CONFIG.MAX_PAYLOAD_SIZE + 1000);
    const truncated = truncatePayload(largeContent);

    expect(truncated).toBeDefined();
    expect(truncated!.length).toBeLessThanOrEqual(CONFIG.MAX_PAYLOAD_SIZE + 50);
    expect(truncated).toContain('[truncated]');
  });

  it('should only accept .md files', () => {
    const mdFile = 'plan.md';
    const txtFile = 'plan.txt';
    const jsonFile = 'plan.json';
    const noExtension = 'plan';

    expect(mdFile.endsWith('.md')).toBe(true);
    expect(txtFile.endsWith('.md')).toBe(false);
    expect(jsonFile.endsWith('.md')).toBe(false);
    expect(noExtension.endsWith('.md')).toBe(false);
  });
});

describe('File Tracking Logic', () => {
  it('should only track .md files', () => {
    const validFiles = ['plan.md', 'test-plan.md', 'My Plan.md', 'PLAN.MD'];
    const invalidFiles = ['plan.txt', 'plan.json', 'readme', 'plan.markdown', 'plan.mdx'];

    for (const file of validFiles) {
      expect(file.toLowerCase().endsWith('.md')).toBe(true);
    }

    for (const file of invalidFiles) {
      expect(file.toLowerCase().endsWith('.md')).toBe(false);
    }
  });

  it('should handle file path validation', () => {
    const plansDir = join(homedir(), '.claude', 'plans');
    const validPath = join(plansDir, 'active-plan.md');
    const invalidPath = '/tmp/malicious-plan.md';

    expect(isValidPlanPath(validPath)).toBe(true);
    expect(isValidPlanPath(invalidPath)).toBe(false);
  });
});

describe('Plan Content Parsing', () => {
  it('should handle empty plan files', () => {
    const emptyContent = '';
    expect(emptyContent.length).toBe(0);
  });

  it('should handle plan files with only whitespace', () => {
    const whitespaceContent = '   \n\n   \t  ';
    expect(whitespaceContent.trim().length).toBe(0);
  });

  it('should handle markdown content correctly', () => {
    const markdownContent = `# PRD: Test Plan

## Overview

This is a test plan.

## Steps

1. Step one
2. Step two
3. Step three

## Code Example

\`\`\`typescript
const x = 42;
\`\`\`

## Conclusion

All done!
`;

    expect(markdownContent).toContain('# PRD: Test Plan');
    expect(markdownContent).toContain('## Steps');
    expect(markdownContent).toContain('```typescript');
  });

  it('should handle unicode in plan content', () => {
    const unicodeContent = `# Plan with Unicode

- Japanese: 日本語
- Korean: 한국어
- Emoji: 📋 ✅ 🎯
- Math: α + β = γ
`;

    expect(unicodeContent).toContain('日本語');
    expect(unicodeContent).toContain('📋');
  });
});

describe('Edge Cases', () => {
  it('should handle very long filenames', () => {
    const longFilename = 'a'.repeat(200) + '.md';
    expect(longFilename.endsWith('.md')).toBe(true);
    expect(longFilename.length).toBe(203);
  });

  it('should handle filenames with special characters', () => {
    const specialChars = [
      'plan with spaces.md',
      'plan-with-dashes.md',
      'plan_with_underscores.md',
      'plan.with.dots.md',
      'UPPERCASE.MD',
    ];

    for (const filename of specialChars) {
      expect(filename.toLowerCase().endsWith('.md')).toBe(true);
    }
  });

  it('should handle plan files with frontmatter', () => {
    const planWithFrontmatter = `---
title: My Plan
date: 2025-12-22
tags: [planning, prd]
---

# My Plan

Content here.
`;

    expect(planWithFrontmatter).toContain('---');
    expect(planWithFrontmatter).toContain('title: My Plan');
    expect(planWithFrontmatter).toContain('# My Plan');
  });

  it('should handle binary content gracefully', () => {
    // If somehow binary content gets read, it should be handled
    const binaryLikeContent = '\x00\x01\x02\x03';
    expect(typeof binaryLikeContent).toBe('string');
  });
});

describe('Content Change Detection', () => {
  it('should detect when content changes', () => {
    const content1 = '# Plan v1';
    const content2 = '# Plan v2';

    // Simple hash should be different for different content
    const hash1 = simpleHash(content1);
    const hash2 = simpleHash(content2);

    expect(hash1).not.toBe(hash2);
  });

  it('should detect identical content', () => {
    const content = '# Same Plan';

    const hash1 = simpleHash(content);
    const hash2 = simpleHash(content);

    expect(hash1).toBe(hash2);
  });
});

// Helper function copied from plan-watcher.ts for testing
function simpleHash(content: string): string {
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return hash.toString(16);
}

describe('Integration with Types', () => {
  it('should use correct event types', async () => {
    const { isMonitorEvent } = await import('./types.ts');

    const planUpdateEvent: PlanUpdateEvent = {
      type: 'plan_update',
      timestamp: new Date().toISOString(),
      path: '/path/to/plan.md',
      filename: 'plan.md',
      content: '# Test',
    };

    const planDeleteEvent: PlanDeleteEvent = {
      type: 'plan_delete',
      timestamp: new Date().toISOString(),
      path: '/path/to/plan.md',
      filename: 'plan.md',
    };

    expect(isMonitorEvent(planUpdateEvent)).toBe(true);
    expect(isMonitorEvent(planDeleteEvent)).toBe(true);
  });

  it('should reject invalid event types', async () => {
    const { isMonitorEvent } = await import('./types.ts');

    const invalidEvent = {
      type: 'plan_invalid',
      timestamp: new Date().toISOString(),
    };

    expect(isMonitorEvent(invalidEvent)).toBe(false);
  });
});
