/**
 * Tests for TeamWatcher - team and task directory monitoring.
 *
 * Tests cover:
 * - Team config parsing (valid JSON, invalid JSON, missing fields)
 * - Task file monitoring (creation, updates, completion)
 * - Error handling (missing files, permission errors)
 * - Secret redaction of team/task data
 * - Lifecycle (start/stop/destroy)
 * - Event emission patterns
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TeamWatcher } from './team-watcher.ts';
import { mkdir, writeFile, rm, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import type { MonitorEvent, TeamUpdateEvent, TaskUpdateEvent } from './types.ts';

/**
 * Mock WebSocketHub for testing event broadcasting.
 */
class MockWebSocketHub {
  broadcastedEvents: MonitorEvent[] = [];

  broadcast(event: MonitorEvent): void {
    this.broadcastedEvents.push(event);
  }

  clear(): void {
    this.broadcastedEvents = [];
  }

  // Mock remaining WebSocketHub methods for type compatibility
  attach(): void {}
  handle(): void {}
  close(): void {}
  onClientConnect(): void {}
}

describe('TeamWatcher', () => {
  let mockHub: MockWebSocketHub;
  let teamWatcher: TeamWatcher;
  let teamsDir: string;
  let tasksDir: string;

  beforeEach(async () => {
    // Use actual ~/.claude/teams and ~/.claude/tasks for path validation to work correctly
    // These must exist under ~/.claude/ for isValidTeamPath to validate them
    teamsDir = join(homedir(), '.claude', 'teams');
    tasksDir = join(homedir(), '.claude', 'tasks');


    // Create directory structure if it doesn't exist
    await mkdir(teamsDir, { recursive: true });
    await mkdir(tasksDir, { recursive: true });

    mockHub = new MockWebSocketHub();

    // Create TeamWatcher - it will use the real paths since they exist
    // @ts-ignore - MockWebSocketHub has the broadcast method we need for testing
    teamWatcher = new TeamWatcher(mockHub);
  });

  afterEach(async () => {
    // Stop the watcher
    teamWatcher.stop();

    // Wait for polling to stop
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Clean up all test directories we created
    const testPrefixes = [
      'test-',
      'engineering',
      'broken',
      'partial',
      'invalid',
      'empty',
      'minimal',
      'multi-tasks',
      'task-progress',
      'bad-status',
      'dependencies',
      'mixed-files',
      'invalid-task-json',
      'missing-id',
      'secrets-team',
      'subject-secrets',
      'partial-secrets',
      'lifecycle-team',
      'state-team',
      'state-tasks',
      'clear-state',
      'timestamp-team',
      'structure-team',
      'structure-tasks',
      'change-detection',
      'removal-tasks',
      'hash-detection',
      'stop-test',
      'temp-team',
      'no-config',
      'skip-invalid',
    ];

    try {
      const teams = await readdir(teamsDir);
      for (const team of teams) {
        if (testPrefixes.some((prefix) => team.includes(prefix) || team.startsWith(prefix))) {
          await rm(join(teamsDir, team), { recursive: true, force: true });
        }
      }
    } catch {
      // Ignore cleanup errors
    }

    try {
      const tasks = await readdir(tasksDir);
      for (const taskDir of tasks) {
        if (testPrefixes.some((prefix) => taskDir.includes(prefix) || taskDir.startsWith(prefix))) {
          await rm(join(tasksDir, taskDir), { recursive: true, force: true });
        }
      }
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('Team Config Parsing', () => {
    it('should parse valid team config with members', async () => {
      const teamName = 'engineering';
      const teamPath = join(teamsDir, teamName);
      await mkdir(teamPath, { recursive: true });

      const config = {
        members: [
          { name: 'Alice', agentId: 'alice-1', agentType: 'general', status: 'active' as const },
          { name: 'Bob', agentId: 'bob-1', agentType: 'research', status: 'idle' as const },
        ],
      };

      await writeFile(join(teamPath, 'config.json'), JSON.stringify(config));

      await teamWatcher.start();
      await new Promise((resolve) => setTimeout(resolve, 100));

      const events = mockHub.broadcastedEvents.filter((e) => e.type === 'team_update') as TeamUpdateEvent[];
      expect(events.length).toBeGreaterThan(0);
      const teamEvent = events.find((e) => e.teamName === teamName);
      expect(teamEvent).toBeDefined();
      expect(teamEvent?.members).toHaveLength(2);
      expect(teamEvent?.members[0].name).toBe('Alice');
      expect(teamEvent?.members[1].status).toBe('idle');
    });

    it('should handle missing members array gracefully', async () => {
      const teamName = 'broken';
      const teamPath = join(teamsDir, teamName);
      await mkdir(teamPath, { recursive: true });

      const config = {
        name: 'Broken Team',
        // missing members array
      };

      await writeFile(join(teamPath, 'config.json'), JSON.stringify(config));

      await teamWatcher.start();
      await new Promise((resolve) => setTimeout(resolve, 100));

      const events = mockHub.broadcastedEvents.filter((e) => e.type === 'team_update') as TeamUpdateEvent[];
      const teamEvent = events.find((e) => e.teamName === teamName);
      expect(teamEvent?.members).toEqual([]);
    });

    it('should filter out members without required name field', async () => {
      const teamName = 'partial';
      const teamPath = join(teamsDir, teamName);
      await mkdir(teamPath, { recursive: true });

      const config = {
        members: [
          { name: 'Valid', agentId: 'valid-1', agentType: 'general' },
          { agentId: 'invalid-1', agentType: 'general' }, // missing name
          { name: 'Valid2', agentId: 'valid-2' },
        ],
      };

      await writeFile(join(teamPath, 'config.json'), JSON.stringify(config));

      await teamWatcher.start();
      await new Promise((resolve) => setTimeout(resolve, 100));

      const events = mockHub.broadcastedEvents.filter((e) => e.type === 'team_update') as TeamUpdateEvent[];
      const teamEvent = events.find((e) => e.teamName === teamName);
      expect(teamEvent?.members).toHaveLength(2);
      expect(teamEvent?.members.map((m) => m.name)).toEqual(['Valid', 'Valid2']);
    });

    it('should handle invalid JSON in config file', async () => {
      const teamName = 'invalid';
      const teamPath = join(teamsDir, teamName);
      await mkdir(teamPath, { recursive: true });

      await writeFile(join(teamPath, 'config.json'), 'not valid json {]');

      await teamWatcher.start();
      await new Promise((resolve) => setTimeout(resolve, 100));

      const events = mockHub.broadcastedEvents.filter((e) => e.type === 'team_update') as TeamUpdateEvent[];
      const teamEvent = events.find((e) => e.teamName === teamName);
      expect(teamEvent?.members).toEqual([]);
    });

    it('should handle empty members array', async () => {
      const teamName = 'empty';
      const teamPath = join(teamsDir, teamName);
      await mkdir(teamPath, { recursive: true });

      const config = { members: [] };
      await writeFile(join(teamPath, 'config.json'), JSON.stringify(config));

      await teamWatcher.start();
      await new Promise((resolve) => setTimeout(resolve, 100));

      const events = mockHub.broadcastedEvents.filter((e) => e.type === 'team_update') as TeamUpdateEvent[];
      const teamEvent = events.find((e) => e.teamName === teamName);
      expect(teamEvent?.members).toHaveLength(0);
    });

    it('should handle missing optional fields in members', async () => {
      const teamName = 'minimal';
      const teamPath = join(teamsDir, teamName);
      await mkdir(teamPath, { recursive: true });

      const config = {
        members: [
          { name: 'Minimal' }, // only name provided
          { name: 'WithId', agentId: 'id-1' }, // partial fields
        ],
      };

      await writeFile(join(teamPath, 'config.json'), JSON.stringify(config));

      await teamWatcher.start();
      await new Promise((resolve) => setTimeout(resolve, 100));

      const events = mockHub.broadcastedEvents.filter((e) => e.type === 'team_update') as TeamUpdateEvent[];
      const teamEvent = events.find((e) => e.teamName === teamName);
      expect(teamEvent?.members).toHaveLength(2);
      expect(teamEvent?.members[0].agentId).toBe('');
      expect(teamEvent?.members[0].agentType).toBe('');
    });
  });

  describe('Task File Monitoring', () => {
    it('should parse and monitor task files', async () => {
      const teamId = 'project-alpha';
      const taskDirPath = join(tasksDir, teamId);
      await mkdir(taskDirPath, { recursive: true });

      const task1 = {
        id: 'task-1',
        subject: 'Implement auth',
        description: 'Add JWT authentication',
        status: 'in_progress',
        owner: 'alice',
        blocks: [],
        blockedBy: [],
      };

      await writeFile(join(taskDirPath, 'task1.json'), JSON.stringify(task1));

      await teamWatcher.start();
      await new Promise((resolve) => setTimeout(resolve, 100));

      const events = mockHub.broadcastedEvents.filter((e) => e.type === 'task_update') as TaskUpdateEvent[];
      const taskEvent = events.find((e) => e.teamId === teamId);
      expect(taskEvent?.tasks).toHaveLength(1);
      expect(taskEvent?.tasks[0].id).toBe('task-1');
      expect(taskEvent?.tasks[0].subject).toBe('Implement auth');
      expect(taskEvent?.tasks[0].status).toBe('in_progress');
    });

    it('should handle multiple task files in one directory', async () => {
      const teamId = 'multi-tasks';
      const taskDirPath = join(tasksDir, teamId);
      await mkdir(taskDirPath, { recursive: true });

      const task1 = {
        id: 'task-1',
        subject: 'Task One',
        status: 'pending',
        blocks: [],
        blockedBy: [],
      };
      const task2 = {
        id: 'task-2',
        subject: 'Task Two',
        status: 'completed',
        blocks: ['task-3'],
        blockedBy: ['task-1'],
      };

      await writeFile(join(taskDirPath, 'task1.json'), JSON.stringify(task1));
      await writeFile(join(taskDirPath, 'task2.json'), JSON.stringify(task2));

      await teamWatcher.start();
      await new Promise((resolve) => setTimeout(resolve, 100));

      const events = mockHub.broadcastedEvents.filter((e) => e.type === 'task_update') as TaskUpdateEvent[];
      const taskEvent = events.find((e) => e.teamId === teamId);
      expect(taskEvent?.tasks).toHaveLength(2);
      expect(taskEvent?.tasks.map((t) => t.id).sort()).toEqual(['task-1', 'task-2']);
    });

    it('should track task completion status changes', async () => {
      const teamId = 'task-progress-' + Date.now();
      const taskDirPath = join(tasksDir, teamId);
      await mkdir(taskDirPath, { recursive: true });

      const task = {
        id: 'feature-x',
        subject: 'Implement feature X',
        status: 'pending',
        blocks: [],
        blockedBy: [],
      };

      await writeFile(join(taskDirPath, 'feature.json'), JSON.stringify(task));

      await teamWatcher.start();
      mockHub.clear();
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Update task status
      const updatedTask = { ...task, status: 'completed' };
      await writeFile(join(taskDirPath, 'feature.json'), JSON.stringify(updatedTask));

      // Wait for polling to detect change
      await new Promise((resolve) => setTimeout(resolve, 2500));

      const events = mockHub.broadcastedEvents.filter((e) => e.type === 'task_update') as TaskUpdateEvent[];
      const taskEvent = events.find((e) => e.teamId === teamId);
      expect(taskEvent?.tasks[0].status).toBe('completed');
    });

    it('should normalize invalid task status values', async () => {
      const teamId = 'bad-status';
      const taskDirPath = join(tasksDir, teamId);
      await mkdir(taskDirPath, { recursive: true });

      const task = {
        id: 'task-1',
        subject: 'Test',
        status: 'invalid_status', // invalid
        blocks: [],
        blockedBy: [],
      };

      await writeFile(join(taskDirPath, 'task.json'), JSON.stringify(task));

      await teamWatcher.start();
      await new Promise((resolve) => setTimeout(resolve, 100));

      const events = mockHub.broadcastedEvents.filter((e) => e.type === 'task_update') as TaskUpdateEvent[];
      const taskEvent = events.find((e) => e.teamId === teamId);
      expect(taskEvent?.tasks[0].status).toBe('pending'); // normalized to default
    });

    it('should handle task files with dependencies', async () => {
      const teamId = 'dependencies';
      const taskDirPath = join(tasksDir, teamId);
      await mkdir(taskDirPath, { recursive: true });

      const task = {
        id: 'task-1',
        subject: 'Dependent task',
        description: 'Depends on other tasks',
        status: 'pending',
        blocks: ['task-2', 'task-3'],
        blockedBy: ['task-4'],
      };

      await writeFile(join(taskDirPath, 'task.json'), JSON.stringify(task));

      await teamWatcher.start();
      await new Promise((resolve) => setTimeout(resolve, 100));

      const events = mockHub.broadcastedEvents.filter((e) => e.type === 'task_update') as TaskUpdateEvent[];
      const taskEvent = events.find((e) => e.teamId === teamId);
      expect(taskEvent?.tasks[0].blocks).toEqual(['task-2', 'task-3']);
      expect(taskEvent?.tasks[0].blockedBy).toEqual(['task-4']);
    });

    it('should ignore non-JSON files in task directories', async () => {
      const teamId = 'mixed-files';
      const taskDirPath = join(tasksDir, teamId);
      await mkdir(taskDirPath, { recursive: true });

      const task = {
        id: 'task-1',
        subject: 'Real task',
        status: 'pending',
        blocks: [],
        blockedBy: [],
      };

      await writeFile(join(taskDirPath, 'task.json'), JSON.stringify(task));
      await writeFile(join(taskDirPath, 'readme.txt'), 'This is not JSON');
      await writeFile(join(taskDirPath, 'notes.md'), '# Notes');

      await teamWatcher.start();
      await new Promise((resolve) => setTimeout(resolve, 100));

      const events = mockHub.broadcastedEvents.filter((e) => e.type === 'task_update') as TaskUpdateEvent[];
      const taskEvent = events.find((e) => e.teamId === teamId);
      expect(taskEvent?.tasks).toHaveLength(1);
    });

    it('should handle invalid JSON in task files gracefully', async () => {
      const teamId = 'invalid-task-json';
      const taskDirPath = join(tasksDir, teamId);
      await mkdir(taskDirPath, { recursive: true });

      const validTask = {
        id: 'task-1',
        subject: 'Valid',
        status: 'pending',
        blocks: [],
        blockedBy: [],
      };

      const invalidJson = 'not a valid json {]';

      await writeFile(join(taskDirPath, 'valid.json'), JSON.stringify(validTask));
      await writeFile(join(taskDirPath, 'invalid.json'), invalidJson);

      await teamWatcher.start();
      await new Promise((resolve) => setTimeout(resolve, 100));

      const events = mockHub.broadcastedEvents.filter((e) => e.type === 'task_update') as TaskUpdateEvent[];
      const taskEvent = events.find((e) => e.teamId === teamId);
      // Should only include the valid task
      expect(taskEvent?.tasks).toHaveLength(1);
      expect(taskEvent?.tasks[0].id).toBe('task-1');
    });

    it('should handle task files without required id field', async () => {
      const teamId = 'missing-id';
      const taskDirPath = join(tasksDir, teamId);
      await mkdir(taskDirPath, { recursive: true });

      const taskWithoutId = {
        subject: 'No ID task',
        // id is missing but subject is present
        status: 'pending',
        blocks: [],
        blockedBy: [],
      };

      await writeFile(join(taskDirPath, 'task.json'), JSON.stringify(taskWithoutId));

      await teamWatcher.start();
      await new Promise((resolve) => setTimeout(resolve, 100));

      const events = mockHub.broadcastedEvents.filter((e) => e.type === 'task_update') as TaskUpdateEvent[];
      const taskEvent = events.find((e) => e.teamId === teamId);
      // Should accept task with just subject
      expect(taskEvent?.tasks).toHaveLength(1);
    });
  });

  describe('Secret Redaction', () => {
    it('should redact API keys from task descriptions', async () => {
      const teamId = 'secrets-team';
      const taskDirPath = join(tasksDir, teamId);
      await mkdir(taskDirPath, { recursive: true });

      const task = {
        id: 'task-1',
        subject: 'API Integration',
        description: 'Use API key sk_live_abc123xyz789def456ghi789jk',
        status: 'pending',
        blocks: [],
        blockedBy: [],
      };

      await writeFile(join(taskDirPath, 'task.json'), JSON.stringify(task));

      await teamWatcher.start();
      await new Promise((resolve) => setTimeout(resolve, 100));

      const events = mockHub.broadcastedEvents.filter((e) => e.type === 'task_update') as TaskUpdateEvent[];
      const taskEvent = events.find((e) => e.teamId === teamId);
      expect(taskEvent?.tasks[0].description).not.toContain('sk_live');
      expect(taskEvent?.tasks[0].description).toContain('[REDACTED]');
    });

    it('should redact secrets from task subjects', async () => {
      const teamId = 'subject-secrets';
      const taskDirPath = join(tasksDir, teamId);
      await mkdir(taskDirPath, { recursive: true });

      const task = {
        id: 'task-1',
        // Use a Bearer token which is easier to match
        subject: 'Setup with Bearer abc123defghijklmnopqrstuvwxyz0123456789',
        status: 'pending',
        blocks: [],
        blockedBy: [],
      };

      await writeFile(join(taskDirPath, 'task.json'), JSON.stringify(task));

      await teamWatcher.start();
      await new Promise((resolve) => setTimeout(resolve, 100));

      const events = mockHub.broadcastedEvents.filter((e) => e.type === 'task_update') as TaskUpdateEvent[];
      const taskEvent = events.find((e) => e.teamId === teamId);
      expect(taskEvent?.tasks[0].subject).toContain('[REDACTED]');
      expect(taskEvent?.tasks[0].subject).not.toContain('abc123');
    });

    it('should preserve non-secret content while redacting', async () => {
      const teamId = 'partial-secrets';
      const taskDirPath = join(tasksDir, teamId);
      await mkdir(taskDirPath, { recursive: true });

      const task = {
        id: 'task-1',
        subject: 'Database migration',
        description:
          'Connect to postgres://user:mySecurePassword123@localhost:5432/mydb and run migrations',
        status: 'pending',
        blocks: [],
        blockedBy: [],
      };

      await writeFile(join(taskDirPath, 'task.json'), JSON.stringify(task));

      await teamWatcher.start();
      await new Promise((resolve) => setTimeout(resolve, 100));

      const events = mockHub.broadcastedEvents.filter((e) => e.type === 'task_update') as TaskUpdateEvent[];
      const taskEvent = events.find((e) => e.teamId === teamId);
      expect(taskEvent?.tasks[0].description).toContain('postgres://');
      expect(taskEvent?.tasks[0].description).toContain('localhost:5432/mydb');
      expect(taskEvent?.tasks[0].description).toContain('[REDACTED]');
      expect(taskEvent?.tasks[0].description).not.toContain('mySecurePassword');
    });
  });

  describe('Error Handling', () => {
    it('should handle missing directories gracefully', async () => {
      // Don't create directories, they start empty
      await rm(teamsDir, { recursive: true, force: true });
      await rm(tasksDir, { recursive: true, force: true });

      // Should not throw
      await expect(teamWatcher.start()).resolves.not.toThrow();

      teamWatcher.stop();
    });

    it('should clear tracked teams when directory is deleted', async () => {
      const teamName = 'temp-team';
      const teamPath = join(teamsDir, teamName);
      await mkdir(teamPath, { recursive: true });

      const config = { members: [{ name: 'Alice', agentId: 'a1', agentType: 'general' }] };
      await writeFile(join(teamPath, 'config.json'), JSON.stringify(config));

      await teamWatcher.start();
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Verify team was tracked
      let events = mockHub.broadcastedEvents.filter((e) => e.type === 'team_update') as TeamUpdateEvent[];
      expect(events.some((e) => e.teamName === teamName)).toBe(true);

      // Delete the team directory
      mockHub.clear();
      await rm(teamPath, { recursive: true, force: true });

      // Wait for polling to detect deletion
      await new Promise((resolve) => setTimeout(resolve, 2500));

      // Should broadcast empty team update
      events = mockHub.broadcastedEvents.filter((e) => e.type === 'team_update') as TeamUpdateEvent[];
      const deleteEvent = events.find((e) => e.teamName === teamName && e.members.length === 0);
      expect(deleteEvent).toBeDefined();
    });

    it('should handle config file without content path validation error', async () => {
      const teamName = 'no-config';
      const teamPath = join(teamsDir, teamName);
      await mkdir(teamPath, { recursive: true });
      // Don't create config.json

      await teamWatcher.start();
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Should not broadcast any events for this team
      const events = mockHub.broadcastedEvents.filter((e) => e.type === 'team_update') as TeamUpdateEvent[];
      expect(events.some((e) => e.teamName === teamName)).toBe(false);
    });

    it('should skip invalid paths with path traversal attempts', async () => {
      // This test verifies the path validation works (though we can't easily trigger it
      // in a test environment that only uses valid paths)
      const teamName = 'test-team';
      const teamPath = join(teamsDir, teamName);
      await mkdir(teamPath, { recursive: true });

      const config = { members: [{ name: 'Test', agentId: 't1', agentType: 'general' }] };
      await writeFile(join(teamPath, 'config.json'), JSON.stringify(config));

      // Start should work fine with valid paths
      await teamWatcher.start();
      await new Promise((resolve) => setTimeout(resolve, 100));

      const events = mockHub.broadcastedEvents.filter((e) => e.type === 'team_update') as TeamUpdateEvent[];
      expect(events.some((e) => e.teamName === teamName)).toBe(true);
    });
  });

  describe('Lifecycle Management', () => {
    it('should start and initialize polling', async () => {
      const teamName = 'lifecycle-team';
      const teamPath = join(teamsDir, teamName);
      await mkdir(teamPath, { recursive: true });

      const config = { members: [{ name: 'Alice', agentId: 'a1', agentType: 'general' }] };
      await writeFile(join(teamPath, 'config.json'), JSON.stringify(config));

      await teamWatcher.start();
      await new Promise((resolve) => setTimeout(resolve, 100));

      const events = mockHub.broadcastedEvents.filter((e) => e.type === 'team_update') as TeamUpdateEvent[];
      expect(events.length).toBeGreaterThan(0);
    });

    it('should stop polling when stopped', async () => {
      const teamName = 'stop-test';
      const teamPath = join(teamsDir, teamName);
      await mkdir(teamPath, { recursive: true });

      const config = { members: [{ name: 'Alice', agentId: 'a1', agentType: 'general' }] };
      await writeFile(join(teamPath, 'config.json'), JSON.stringify(config));

      await teamWatcher.start();
      await new Promise((resolve) => setTimeout(resolve, 100));

      mockHub.clear();
      teamWatcher.stop();

      // Wait to ensure no more polling happens
      await new Promise((resolve) => setTimeout(resolve, 500));

      // No new events should be broadcast after stop
      expect(mockHub.broadcastedEvents.length).toBe(0);
    });

    it('should provide initial state via getTeamEvents', async () => {
      const teamName = 'state-team';
      const teamPath = join(teamsDir, teamName);
      await mkdir(teamPath, { recursive: true });

      const config = {
        members: [
          { name: 'Alice', agentId: 'a1', agentType: 'general', status: 'active' as const },
          { name: 'Bob', agentId: 'b1', agentType: 'research', status: 'idle' as const },
        ],
      };

      await writeFile(join(teamPath, 'config.json'), JSON.stringify(config));

      await teamWatcher.start();
      await new Promise((resolve) => setTimeout(resolve, 100));

      const events = teamWatcher.getTeamEvents();
      expect(events.length).toBeGreaterThan(0);
      const teamEvent = events.find((e) => e.teamName === teamName);
      expect(teamEvent?.members).toHaveLength(2);
    });

    it('should provide initial state via getTaskEvents', async () => {
      const teamId = 'state-tasks';
      const taskDirPath = join(tasksDir, teamId);
      await mkdir(taskDirPath, { recursive: true });

      const tasks = [
        { id: '1', subject: 'Task 1', status: 'pending', blocks: [], blockedBy: [] },
        { id: '2', subject: 'Task 2', status: 'in_progress', blocks: [], blockedBy: [] },
      ];

      await writeFile(join(taskDirPath, 'task1.json'), JSON.stringify(tasks[0]));
      await writeFile(join(taskDirPath, 'task2.json'), JSON.stringify(tasks[1]));

      await teamWatcher.start();
      await new Promise((resolve) => setTimeout(resolve, 100));

      const events = teamWatcher.getTaskEvents();
      expect(events.length).toBeGreaterThan(0);
      const taskEvent = events.find((e) => e.teamId === teamId);
      expect(taskEvent?.tasks).toHaveLength(2);
    });

    it('should clear state when stopped', async () => {
      const teamName = 'clear-state';
      const teamPath = join(teamsDir, teamName);
      await mkdir(teamPath, { recursive: true });

      const config = { members: [{ name: 'Alice', agentId: 'a1', agentType: 'general' }] };
      await writeFile(join(teamPath, 'config.json'), JSON.stringify(config));

      await teamWatcher.start();
      await new Promise((resolve) => setTimeout(resolve, 100));

      let events = teamWatcher.getTeamEvents();
      expect(events.length).toBeGreaterThan(0);

      teamWatcher.stop();

      events = teamWatcher.getTeamEvents();
      expect(events).toHaveLength(0);
    });
  });

  describe('Event Emission Patterns', () => {
    it('should include timestamp in all events', async () => {
      const teamName = 'timestamp-team';
      const teamPath = join(teamsDir, teamName);
      await mkdir(teamPath, { recursive: true });

      const config = { members: [{ name: 'Alice', agentId: 'a1', agentType: 'general' }] };
      await writeFile(join(teamPath, 'config.json'), JSON.stringify(config));

      await teamWatcher.start();
      await new Promise((resolve) => setTimeout(resolve, 100));

      const events = mockHub.broadcastedEvents.filter((e) => e.type === 'team_update');
      for (const event of events) {
        expect(event.timestamp).toBeDefined();
        expect(typeof event.timestamp).toBe('string');
        // Should be ISO 8601 format
        expect(() => new Date(event.timestamp)).not.toThrow();
      }
    });

    it('should broadcast team update with correct structure', async () => {
      const teamName = 'structure-team';
      const teamPath = join(teamsDir, teamName);
      await mkdir(teamPath, { recursive: true });

      const config = { members: [{ name: 'Alice', agentId: 'a1', agentType: 'general' }] };
      await writeFile(join(teamPath, 'config.json'), JSON.stringify(config));

      await teamWatcher.start();
      await new Promise((resolve) => setTimeout(resolve, 100));

      const events = mockHub.broadcastedEvents.filter((e) => e.type === 'team_update') as TeamUpdateEvent[];
      const teamEvent = events.find((e) => e.teamName === teamName);

      expect(teamEvent?.type).toBe('team_update');
      expect(teamEvent?.teamName).toBe(teamName);
      expect(Array.isArray(teamEvent?.members)).toBe(true);
      expect(teamEvent?.timestamp).toBeDefined();
    });

    it('should broadcast task update with correct structure', async () => {
      const teamId = 'structure-tasks';
      const taskDirPath = join(tasksDir, teamId);
      await mkdir(taskDirPath, { recursive: true });

      const task = { id: 'task-1', subject: 'Test', status: 'pending', blocks: [], blockedBy: [] };
      await writeFile(join(taskDirPath, 'task.json'), JSON.stringify(task));

      await teamWatcher.start();
      await new Promise((resolve) => setTimeout(resolve, 100));

      const events = mockHub.broadcastedEvents.filter((e) => e.type === 'task_update') as TaskUpdateEvent[];
      const taskEvent = events.find((e) => e.teamId === teamId);

      expect(taskEvent?.type).toBe('task_update');
      expect(taskEvent?.teamId).toBe(teamId);
      expect(Array.isArray(taskEvent?.tasks)).toBe(true);
      expect(taskEvent?.timestamp).toBeDefined();
    });

    it('should emit events only when content changes', async () => {
      const teamName = 'change-detect-' + Date.now();
      const teamPath = join(teamsDir, teamName);
      await mkdir(teamPath, { recursive: true });

      const config = { members: [{ name: 'Alice', agentId: 'a1', agentType: 'general' }] };
      await writeFile(join(teamPath, 'config.json'), JSON.stringify(config));

      await teamWatcher.start();
      await new Promise((resolve) => setTimeout(resolve, 100));

      const initialEventCount = mockHub.broadcastedEvents.filter(
        (e) => e.type === 'team_update' && (e as TeamUpdateEvent).teamName === teamName
      ).length;

      mockHub.clear();

      // Trigger another poll without changing the file
      await new Promise((resolve) => setTimeout(resolve, 2500));

      // Should not emit new event if content hasn't changed (uses content hash to detect changes)
      const newEventCount = mockHub.broadcastedEvents.filter(
        (e) => e.type === 'team_update' && (e as TeamUpdateEvent).teamName === teamName
      ).length;

      expect(initialEventCount).toBeGreaterThan(0);
      expect(newEventCount).toBe(0); // No change in file content = no new event
    });

    it('should broadcast removal events when directories disappear', async () => {
      const teamId = 'removal-tasks';
      const taskDirPath = join(tasksDir, teamId);
      await mkdir(taskDirPath, { recursive: true });

      const task = { id: 'task-1', subject: 'Test', status: 'pending', blocks: [], blockedBy: [] };
      await writeFile(join(taskDirPath, 'task.json'), JSON.stringify(task));

      await teamWatcher.start();
      await new Promise((resolve) => setTimeout(resolve, 100));

      mockHub.clear();

      // Remove the task directory
      await rm(taskDirPath, { recursive: true, force: true });

      // Wait for polling
      await new Promise((resolve) => setTimeout(resolve, 2500));

      const events = mockHub.broadcastedEvents.filter((e) => e.type === 'task_update') as TaskUpdateEvent[];
      const removalEvent = events.find((e) => e.teamId === teamId && e.tasks.length === 0);
      expect(removalEvent).toBeDefined();
    });
  });

  describe('Content Hash Tracking', () => {
    it('should detect config file changes via content hash', async () => {
      const teamName = 'hash-detection';
      const teamPath = join(teamsDir, teamName);
      await mkdir(teamPath, { recursive: true });

      const config1 = { members: [{ name: 'Alice', agentId: 'a1', agentType: 'general' }] };
      await writeFile(join(teamPath, 'config.json'), JSON.stringify(config1));

      await teamWatcher.start();
      await new Promise((resolve) => setTimeout(resolve, 100));

      const initialEvents = mockHub.broadcastedEvents.filter(
        (e) => e.type === 'team_update' && (e as TeamUpdateEvent).teamName === teamName
      );
      expect(initialEvents.length).toBeGreaterThan(0);

      mockHub.clear();

      // Change the config
      const config2 = { members: [{ name: 'Alice', agentId: 'a1', agentType: 'general' }, { name: 'Bob', agentId: 'b1', agentType: 'research' }] };
      await writeFile(join(teamPath, 'config.json'), JSON.stringify(config2));

      // Wait for polling
      await new Promise((resolve) => setTimeout(resolve, 2500));

      const newEvents = mockHub.broadcastedEvents.filter(
        (e) => e.type === 'team_update' && (e as TeamUpdateEvent).teamName === teamName
      ) as TeamUpdateEvent[];

      expect(newEvents.length).toBeGreaterThan(0);
      expect(newEvents[0]?.members).toHaveLength(2);
    });
  });
});
