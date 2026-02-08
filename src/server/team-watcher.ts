/**
 * Team/Task Watcher for the Thinking Monitor.
 *
 * Watches ~/.claude/teams/ and ~/.claude/tasks/ directories for changes
 * and broadcasts team_update/task_update events to connected dashboard clients.
 *
 * Follows the PlanWatcher pattern:
 * - Polls directories on interval for changes
 * - Uses content hashing for change detection
 * - Validates paths within ~/.claude/
 * - Redacts secrets from task descriptions
 * - Sends initial state on client connect
 *
 * Security:
 * - Only watches validated paths under ~/.claude/teams/ and ~/.claude/tasks/
 * - Redacts secrets from task content before broadcasting
 * - Read-only operations only
 */

import { readFile, stat, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import type {
  TeamUpdateEvent,
  TaskUpdateEvent,
  TeamMemberInfo,
  TaskInfo,
} from './types.ts';
import { redactSecrets } from './secrets.ts';
import type { WebSocketHub } from './websocket-hub.ts';
import { logger } from './logger.ts';
import { hashContent, hashContentParts } from './change-detection.ts';
import { isPathWithinAny } from './path-validation.ts';

/** Polling interval for checking file updates (ms) */
const POLL_INTERVAL_MS = 2000;

/** Tracked team state */
interface TrackedTeam {
  teamName: string;
  contentHash: string;
  members: TeamMemberInfo[];
  detectedAt: string;
}

/** Tracked task directory state */
interface TrackedTaskDir {
  teamId: string;
  contentHash: string;
  tasks: TaskInfo[];
  detectedAt: string;
}

/**
 * Validates that a path is within ~/.claude/teams/ or ~/.claude/tasks/.
 */
function isValidTeamPath(filePath: string): boolean {
  const teamsDir = join(homedir(), '.claude', 'teams');
  const tasksDir = join(homedir(), '.claude', 'tasks');
  return isPathWithinAny(filePath, [teamsDir, tasksDir]);
}

/**
 * TeamWatcher monitors ~/.claude/teams/ and ~/.claude/tasks/ directories.
 */
export class TeamWatcher {
  private hub: WebSocketHub;
  private teamsDir: string;
  private tasksDir: string;
  private trackedTeams: Map<string, TrackedTeam> = new Map();
  private trackedTaskDirs: Map<string, TrackedTaskDir> = new Map();
  private pollInterval: ReturnType<typeof setInterval> | null = null;
  private isShuttingDown = false;

  constructor(hub: WebSocketHub) {
    this.hub = hub;
    this.teamsDir = join(homedir(), '.claude', 'teams');
    this.tasksDir = join(homedir(), '.claude', 'tasks');
  }

  /**
   * Start watching team and task directories.
   */
  async start(): Promise<void> {
    logger.info(`[TeamWatcher] Watching: ${this.teamsDir} and ${this.tasksDir}`);

    // Do initial scan (directories may not exist yet)
    await this.poll();

    // Start polling
    this.pollInterval = setInterval(() => {
      if (!this.isShuttingDown) {
        this.poll().catch((error) => {
          logger.error('[TeamWatcher] Poll error:', error instanceof Error ? error.message : 'Unknown error');
        });
      }
    }, POLL_INTERVAL_MS);

    logger.info(`[TeamWatcher] Tracking ${this.trackedTeams.size} team(s), ${this.trackedTaskDirs.size} task dir(s)`);
  }

  /**
   * Stop watching.
   */
  stop(): void {
    this.isShuttingDown = true;
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
    this.trackedTeams.clear();
    this.trackedTaskDirs.clear();
    logger.info('[TeamWatcher] Stopped');
  }

  /**
   * Get current team events for sending to newly connected clients.
   */
  getTeamEvents(): TeamUpdateEvent[] {
    const events: TeamUpdateEvent[] = [];
    for (const team of this.trackedTeams.values()) {
      events.push({
        type: 'team_update',
        timestamp: team.detectedAt,
        teamName: team.teamName,
        members: team.members,
      });
    }
    return events;
  }

  /**
   * Get current task events for sending to newly connected clients.
   */
  getTaskEvents(): TaskUpdateEvent[] {
    const events: TaskUpdateEvent[] = [];
    for (const taskDir of this.trackedTaskDirs.values()) {
      events.push({
        type: 'task_update',
        timestamp: taskDir.detectedAt,
        teamId: taskDir.teamId,
        tasks: taskDir.tasks,
      });
    }
    return events;
  }

  /**
   * Poll both directories for changes.
   */
  private async poll(): Promise<void> {
    await Promise.all([
      this.pollTeams(),
      this.pollTasks(),
    ]);
  }

  /**
   * Poll ~/.claude/teams/ for team config changes.
   */
  private async pollTeams(): Promise<void> {
    try {
      await stat(this.teamsDir);
    } catch {
      // Directory doesn't exist yet, clear tracked teams if any
      if (this.trackedTeams.size > 0) {
        this.trackedTeams.clear();
      }
      return;
    }

    try {
      const entries = await readdir(this.teamsDir, { withFileTypes: true });
      const currentTeamNames = new Set<string>();

      for (const entry of entries) {
        if (!entry.isDirectory()) continue;

        const teamName = entry.name;
        currentTeamNames.add(teamName);
        const configPath = join(this.teamsDir, teamName, 'config.json');

        if (!isValidTeamPath(configPath)) continue;

        try {
          const content = await readFile(configPath, 'utf-8');
          const contentHash = hashContent(content);
          const existing = this.trackedTeams.get(teamName);

          if (!existing || existing.contentHash !== contentHash) {
            const members = this.parseTeamConfig(content);
            this.trackedTeams.set(teamName, {
              teamName,
              contentHash,
              members,
              detectedAt: existing?.detectedAt || new Date().toISOString(),
            });

            this.broadcastTeamUpdate(teamName, members);
          }
        } catch {
          // config.json doesn't exist or can't be read, skip
        }
      }

      // Remove teams that no longer exist
      for (const [teamName] of this.trackedTeams) {
        if (!currentTeamNames.has(teamName)) {
          this.trackedTeams.delete(teamName);
          // Broadcast empty team to signal removal
          this.broadcastTeamUpdate(teamName, []);
        }
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        logger.error('[TeamWatcher] Error polling teams directory:', error);
      }
    }
  }

  /**
   * Poll ~/.claude/tasks/ for task file changes.
   */
  private async pollTasks(): Promise<void> {
    try {
      await stat(this.tasksDir);
    } catch {
      // Directory doesn't exist yet, clear tracked tasks if any
      if (this.trackedTaskDirs.size > 0) {
        this.trackedTaskDirs.clear();
      }
      return;
    }

    try {
      const entries = await readdir(this.tasksDir, { withFileTypes: true });
      const currentTeamIds = new Set<string>();

      for (const entry of entries) {
        if (!entry.isDirectory()) continue;

        const teamId = entry.name;
        currentTeamIds.add(teamId);
        const taskDirPath = join(this.tasksDir, teamId);

        if (!isValidTeamPath(taskDirPath)) continue;

        try {
          const taskFiles = await readdir(taskDirPath, { withFileTypes: true });
          const jsonFiles = taskFiles
            .filter((f) => f.isFile() && f.name.endsWith('.json'))
            .sort((a, b) => a.name.localeCompare(b.name));

          // Hash includes file names and content in sorted order for deterministic
          // change detection across filesystems with different readdir ordering.
          const hashParts: string[] = [];
          const tasks: TaskInfo[] = [];

          const taskFileResults = await Promise.all(
            jsonFiles.map(async (taskFile) => {
              const taskPath = join(taskDirPath, taskFile.name);
              if (!isValidTeamPath(taskPath)) {
                return null;
              }

              try {
                const content = await readFile(taskPath, 'utf-8');
                return { name: taskFile.name, content };
              } catch {
                // Skip unreadable task files
                return null;
              }
            })
          );

          for (const result of taskFileResults) {
            if (!result) {
              continue;
            }

            hashParts.push(result.name, result.content);
            const task = this.parseTaskFile(result.content);
            if (task) {
              tasks.push(task);
            }
          }

          const contentHash = hashContentParts(hashParts);
          const existing = this.trackedTaskDirs.get(teamId);

          if (!existing || existing.contentHash !== contentHash) {
            this.trackedTaskDirs.set(teamId, {
              teamId,
              contentHash,
              tasks,
              detectedAt: existing?.detectedAt || new Date().toISOString(),
            });

            this.broadcastTaskUpdate(teamId, tasks);
          }
        } catch {
          // Can't read task directory contents, skip
        }
      }

      // Remove task dirs that no longer exist
      for (const [teamId] of this.trackedTaskDirs) {
        if (!currentTeamIds.has(teamId)) {
          this.trackedTaskDirs.delete(teamId);
          // Broadcast empty tasks to signal removal
          this.broadcastTaskUpdate(teamId, []);
        }
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        logger.error('[TeamWatcher] Error polling tasks directory:', error);
      }
    }
  }

  /**
   * Parse a team config.json into TeamMemberInfo[].
   */
  private parseTeamConfig(content: string): TeamMemberInfo[] {
    try {
      const config = JSON.parse(content);
      if (!config.members || !Array.isArray(config.members)) {
        return [];
      }

      return config.members
        .filter((m: Record<string, unknown>) => m && typeof m.name === 'string')
        .map((m: Record<string, unknown>) => ({
          name: String(m.name),
          agentId: String(m.agentId || ''),
          agentType: String(m.agentType || ''),
          status: m.status as TeamMemberInfo['status'],
        }));
    } catch {
      return [];
    }
  }

  /**
   * Parse a task JSON file into TaskInfo.
   */
  private parseTaskFile(content: string): TaskInfo | null {
    try {
      const task = JSON.parse(content);
      if (!task || typeof task.id !== 'string') {
        // Try to extract id from other fields
        if (!task.subject) return null;
      }

      return {
        id: String(task.id || ''),
        subject: redactSecrets(String(task.subject || '')),
        description: task.description ? redactSecrets(String(task.description)) : undefined,
        activeForm: task.activeForm ? String(task.activeForm) : undefined,
        status: this.normalizeTaskStatus(task.status),
        owner: task.owner ? String(task.owner) : undefined,
        blocks: Array.isArray(task.blocks) ? task.blocks.map(String) : [],
        blockedBy: Array.isArray(task.blockedBy) ? task.blockedBy.map(String) : [],
      };
    } catch {
      return null;
    }
  }

  /**
   * Normalize task status to valid enum value.
   */
  private normalizeTaskStatus(status: unknown): TaskInfo['status'] {
    if (status === 'pending' || status === 'in_progress' || status === 'completed') {
      return status;
    }
    return 'pending';
  }

  /**
   * Broadcast a team update event.
   */
  private broadcastTeamUpdate(teamName: string, members: TeamMemberInfo[]): void {
    const event: TeamUpdateEvent = {
      type: 'team_update',
      timestamp: new Date().toISOString(),
      teamName,
      members,
    };

    this.hub.broadcast(event);
    logger.debug(`[TeamWatcher] Broadcast team update: ${teamName} (${members.length} members)`);
  }

  /**
   * Broadcast a task update event.
   */
  private broadcastTaskUpdate(teamId: string, tasks: TaskInfo[]): void {
    const event: TaskUpdateEvent = {
      type: 'task_update',
      timestamp: new Date().toISOString(),
      teamId,
      tasks,
    };

    this.hub.broadcast(event);
    logger.debug(`[TeamWatcher] Broadcast task update: ${teamId} (${tasks.length} tasks)`);
  }
}
