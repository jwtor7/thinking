/**
 * Tests for session lifecycle: getKnownSessions cutoff, sorting, and capping.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, rm, writeFile, utimes } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { TranscriptWatcher } from './transcript-watcher.ts';
import type { WebSocketHub } from './websocket-hub.ts';
import type { MonitorEvent } from './types.ts';

class MockWebSocketHub implements Pick<WebSocketHub, 'broadcast' | 'getClientCount'> {
  public broadcastedEvents: MonitorEvent[] = [];
  broadcast(event: MonitorEvent): void {
    this.broadcastedEvents.push(event);
  }
  getClientCount(): number { return 1; }
  clear(): void { this.broadcastedEvents = []; }
}

describe('getKnownSessions', () => {
  const testDir = join(tmpdir(), 'thinking-session-lifecycle-test');
  const projectsDir = join(testDir, 'projects');
  const projectDir = join(projectsDir, '-Users-test-dev-myproject');
  let hub: MockWebSocketHub;
  let watcher: TranscriptWatcher;

  beforeEach(async () => {
    await mkdir(projectDir, { recursive: true });
    hub = new MockWebSocketHub();
  });

  afterEach(async () => {
    if (watcher) {
      watcher.stop();
    }
    await rm(testDir, { recursive: true, force: true });
  });

  it('should only return sessions within the 4-hour cutoff', async () => {
    const recentId = 'aaaaaaaa-1111-2222-3333-444444444444';
    const staleId = 'bbbbbbbb-1111-2222-3333-444444444444';

    await writeFile(join(projectDir, `${recentId}.jsonl`), '{"type":"assistant"}\n');
    await writeFile(join(projectDir, `${staleId}.jsonl`), '{"type":"assistant"}\n');

    const fiveHoursAgo = new Date(Date.now() - 5 * 60 * 60 * 1000);
    await utimes(join(projectDir, `${staleId}.jsonl`), fiveHoursAgo, fiveHoursAgo);

    watcher = new TranscriptWatcher(hub as unknown as WebSocketHub, {
      claudeDir: testDir,
      projectsDir,
    });
    await watcher.start();

    const sessions = watcher.getKnownSessions();
    const sessionIds = sessions.map(s => s.sessionId);

    expect(sessionIds).toContain(recentId);
    expect(sessionIds).not.toContain(staleId);
  });

  it('should sort sessions by most recent first', async () => {
    const olderId = 'cccccccc-1111-2222-3333-444444444444';
    const newerId = 'dddddddd-1111-2222-3333-444444444444';

    await writeFile(join(projectDir, `${olderId}.jsonl`), '{"type":"assistant"}\n');
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
    await utimes(join(projectDir, `${olderId}.jsonl`), twoHoursAgo, twoHoursAgo);

    await writeFile(join(projectDir, `${newerId}.jsonl`), '{"type":"assistant"}\n');

    watcher = new TranscriptWatcher(hub as unknown as WebSocketHub, {
      claudeDir: testDir,
      projectsDir,
    });
    await watcher.start();

    const sessions = watcher.getKnownSessions();
    const ids = sessions.map(s => s.sessionId);

    expect(ids.indexOf(newerId)).toBeLessThan(ids.indexOf(olderId));
  });

  it('should cap results at 10 sessions', async () => {
    for (let i = 0; i < 12; i++) {
      const id = `${String(i).padStart(8, '0')}-1111-2222-3333-444444444444`;
      await writeFile(join(projectDir, `${id}.jsonl`), '{"type":"assistant"}\n');
    }

    watcher = new TranscriptWatcher(hub as unknown as WebSocketHub, {
      claudeDir: testDir,
      projectsDir,
    });
    await watcher.start();

    const sessions = watcher.getKnownSessions();
    expect(sessions.length).toBeLessThanOrEqual(10);
  });

  it('should include workingDirectory when path is valid', async () => {
    const id = 'eeeeeeee-1111-2222-3333-444444444444';
    await writeFile(join(projectDir, `${id}.jsonl`), '{"type":"assistant"}\n');

    watcher = new TranscriptWatcher(hub as unknown as WebSocketHub, {
      claudeDir: testDir,
      projectsDir,
    });
    await watcher.start();

    const sessions = watcher.getKnownSessions();
    const session = sessions.find(s => s.sessionId === id);
    expect(session).toBeDefined();
    expect(session!.workingDirectory).toBe('/Users/test/dev/myproject');
  });

  it('should not include subagent-only sessions', async () => {
    const sessionDir = join(projectDir, 'ffffffff-1111-2222-3333-444444444444');
    const subagentDir = join(sessionDir, 'subagents');
    await mkdir(subagentDir, { recursive: true });
    await writeFile(join(subagentDir, 'agent-abc.jsonl'), '{"type":"assistant"}\n');

    watcher = new TranscriptWatcher(hub as unknown as WebSocketHub, {
      claudeDir: testDir,
      projectsDir,
    });
    await watcher.start();

    const sessions = watcher.getKnownSessions();
    const ids = sessions.map(s => s.sessionId);
    expect(ids).not.toContain('ffffffff-1111-2222-3333-444444444444');
  });
});
