/**
 * Plan Watcher for the Thinking Monitor.
 *
 * Watches the ~/.claude/plans/ directory for markdown plan files
 * and broadcasts updates to connected dashboard clients.
 *
 * Security:
 * - Only watches validated paths under ~/.claude/plans/
 * - Redacts secrets from plan content before broadcasting
 * - Read-only operations only
 */

import { watch, type FSWatcher } from 'node:fs';
import { readFile, stat, readdir } from 'node:fs/promises';
import { join, basename } from 'node:path';
import { homedir } from 'node:os';
import type { PlanUpdateEvent, PlanDeleteEvent, PlanListEvent } from './types.ts';
import { truncatePayload } from './types.ts';
import { redactSecrets } from './secrets.ts';
import type { WebSocketHub } from './websocket-hub.ts';
import { logger } from './logger.ts';
import { hashContent } from './change-detection.ts';
import { isPathWithin } from './path-validation.ts';

export interface PlanWatcherOptions {
  plansDir?: string;
}

/** Tracked plan file state */
interface TrackedPlan {
  path: string;
  filename: string;
  lastModified: number;
  contentHash: string;
}

/**
 * Validates that a path is within the allowed ~/.claude/plans/ directory.
 * This is a security measure to prevent watching arbitrary paths.
 */
export function isValidPlanPath(filePath: string): boolean {
  const plansDir = join(homedir(), '.claude', 'plans');
  return isValidPlanPathWithinRoot(filePath, plansDir);
}

/**
 * Validates that a path is within the provided plans root.
 */
export function isValidPlanPathWithinRoot(filePath: string, plansDir: string): boolean {
  return isPathWithin(filePath, plansDir);
}

/**
 * PlanWatcher monitors the ~/.claude/plans/ directory for markdown files.
 */
export class PlanWatcher {
  private hub: WebSocketHub;
  private plansDir: string;
  private trackedPlans: Map<string, TrackedPlan> = new Map();
  private directoryWatcher: FSWatcher | null = null;
  private pollInterval: ReturnType<typeof setInterval> | null = null;
  private isShuttingDown = false;

  /** Polling interval for checking file updates (ms) */
  private static readonly POLL_INTERVAL_MS = 2000;

  constructor(hub: WebSocketHub, options?: PlanWatcherOptions) {
    this.hub = hub;
    this.plansDir = options?.plansDir ?? join(homedir(), '.claude', 'plans');
  }

  /**
   * Start watching the plans directory.
   */
  async start(): Promise<void> {
    if (!this.isValidPath(this.plansDir)) {
      logger.error('[PlanWatcher] Invalid plans directory path');
      return;
    }

    try {
      // Verify the plans directory exists
      await stat(this.plansDir);
    } catch {
      logger.warn(`[PlanWatcher] Plans directory not found: ${this.plansDir}`);
      logger.info('[PlanWatcher] Will retry when directory becomes available');
      // Start polling to wait for directory creation
      this.startDirectoryPolling();
      return;
    }

    await this.initializeWatching();
  }

  /**
   * Poll for directory availability.
   */
  private startDirectoryPolling(): void {
    if (this.pollInterval) {
      return;
    }

    this.pollInterval = setInterval(async () => {
      if (this.isShuttingDown) {
        return;
      }

      try {
        await stat(this.plansDir);
        // Directory exists now, start watching
        this.stopPolling();
        await this.initializeWatching();
      } catch {
        // Directory still doesn't exist, continue polling
      }
    }, PlanWatcher.POLL_INTERVAL_MS * 2);
  }

  /**
   * Stop polling interval.
   */
  private stopPolling(): void {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
  }

  /**
   * Initialize file system watching.
   */
  private async initializeWatching(): Promise<void> {
    logger.info(`[PlanWatcher] Watching: ${this.plansDir}`);

    try {
      // Watch the plans directory for changes
      this.directoryWatcher = watch(this.plansDir, { persistent: false }, (eventType, filename) => {
        if (this.isShuttingDown) return;
        if (filename?.endsWith('.md')) {
          this.handleFileEvent(eventType, filename);
        }
      });

      this.directoryWatcher.on('error', (error) => {
        logger.error('[PlanWatcher] Directory watcher error:', error.message);
      });
    } catch (error) {
      logger.error('[PlanWatcher] Failed to watch plans directory:', error);
      return;
    }

    // Scan existing plan files
    await this.scanPlanFiles();

    // Start polling for file updates (fs.watch doesn't reliably report file modifications)
    this.pollInterval = setInterval(() => {
      if (!this.isShuttingDown) {
        this.pollTrackedFiles();
      }
    }, PlanWatcher.POLL_INTERVAL_MS);

    logger.info(`[PlanWatcher] Tracking ${this.trackedPlans.size} plan files`);
  }

  /**
   * Scan the plans directory for existing .md files.
   */
  private async scanPlanFiles(): Promise<void> {
    try {
      const entries = await readdir(this.plansDir, { withFileTypes: true });

      for (const entry of entries) {
        if (entry.isFile() && entry.name.endsWith('.md')) {
          const filePath = join(this.plansDir, entry.name);
          if (this.isValidPath(filePath)) {
            await this.trackPlanFile(filePath);
          }
        }
      }
    } catch (error) {
      logger.error('[PlanWatcher] Error scanning plans directory:', error);
    }
  }

  /**
   * Handle file system events.
   */
  private handleFileEvent(_eventType: string, filename: string): void {
    const filePath = join(this.plansDir, filename);

    if (!this.isValidPath(filePath)) {
      return;
    }

    // Use debounced check to handle rapid events
    setTimeout(() => {
      (async () => {
        if (this.isShuttingDown) return;

        try {
          await stat(filePath);
          // File exists, process update
          await this.processPlanUpdate(filePath);
        } catch {
          // File was deleted
          this.handlePlanDelete(filePath, filename);
        }
      })().catch((error) => {
        logger.error(`[PlanWatcher] Error in file event handler:`, error instanceof Error ? error.message : 'Unknown error');
      });
    }, 100);
  }

  /**
   * Start tracking a plan file.
   */
  private async trackPlanFile(filePath: string): Promise<void> {
    if (!this.isValidPath(filePath)) {
      return;
    }

    try {
      const stats = await stat(filePath);
      if (!stats.isFile()) {
        return;
      }

      const content = await readFile(filePath, 'utf-8');
      const filename = basename(filePath);
      const contentHash = hashContent(content);

      this.trackedPlans.set(filePath, {
        path: filePath,
        filename,
        lastModified: stats.mtimeMs,
        contentHash,
      });

      // Broadcast initial content with file modification time
      this.broadcastPlanUpdate(filePath, filename, content, stats.mtimeMs);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        logger.error(`[PlanWatcher] Error tracking plan file ${filePath}:`, error);
      }
    }
  }

  /**
   * Process an update to a plan file.
   */
  private async processPlanUpdate(filePath: string): Promise<void> {
    if (!this.isValidPath(filePath)) {
      return;
    }

    try {
      const stats = await stat(filePath);
      const content = await readFile(filePath, 'utf-8');
      const filename = basename(filePath);
      const contentHash = hashContent(content);

      const tracked = this.trackedPlans.get(filePath);

      // Only broadcast if content actually changed
      if (!tracked || tracked.contentHash !== contentHash) {
        this.trackedPlans.set(filePath, {
          path: filePath,
          filename,
          lastModified: stats.mtimeMs,
          contentHash,
        });

        this.broadcastPlanUpdate(filePath, filename, content, stats.mtimeMs);
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        logger.error(`[PlanWatcher] Error processing plan update ${filePath}:`, error);
      }
    }
  }

  /**
   * Handle plan file deletion.
   */
  private handlePlanDelete(filePath: string, filename: string): void {
    const tracked = this.trackedPlans.get(filePath);
    if (tracked) {
      this.trackedPlans.delete(filePath);
      this.broadcastPlanDelete(filePath, filename);
    }
  }

  /**
   * Poll tracked files for updates.
   */
  private async pollTrackedFiles(): Promise<void> {
    // First, check for new files
    try {
      const entries = await readdir(this.plansDir, { withFileTypes: true });
      const currentFiles = new Set<string>();

      for (const entry of entries) {
        if (entry.isFile() && entry.name.endsWith('.md')) {
          const filePath = join(this.plansDir, entry.name);
          currentFiles.add(filePath);

          if (this.isValidPath(filePath)) {
            // Check if this is a new file or has been modified
            if (!this.trackedPlans.has(filePath)) {
              await this.trackPlanFile(filePath);
            } else {
              await this.checkFileForUpdates(filePath);
            }
          }
        }
      }

      // Check for deleted files
      for (const [filePath, tracked] of this.trackedPlans) {
        if (!currentFiles.has(filePath)) {
          this.handlePlanDelete(filePath, tracked.filename);
        }
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        logger.error('[PlanWatcher] Error polling plans directory:', error);
      }
    }
  }

  /**
   * Check a specific file for updates.
   */
  private async checkFileForUpdates(filePath: string): Promise<void> {
    const tracked = this.trackedPlans.get(filePath);
    if (!tracked) {
      return;
    }

    try {
      const stats = await stat(filePath);

      // Check if file was modified since last check
      if (stats.mtimeMs > tracked.lastModified) {
        await this.processPlanUpdate(filePath);
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        // File was deleted
        this.handlePlanDelete(filePath, tracked.filename);
      }
    }
  }

  /**
   * Broadcast a plan update event to connected clients.
   */
  private broadcastPlanUpdate(path: string, filename: string, content: string, lastModified?: number): void {
    // Apply security measures: truncate and redact secrets
    const safeContent = redactSecrets(truncatePayload(content) ?? '');

    const event: PlanUpdateEvent = {
      type: 'plan_update',
      timestamp: lastModified ? new Date(lastModified).toISOString() : new Date().toISOString(),
      path,
      filename,
      content: safeContent,
      lastModified,
    };

    this.hub.broadcast(event);
    logger.debug(`[PlanWatcher] Broadcast plan update: ${filename}`);
  }

  /**
   * Broadcast a plan delete event to connected clients.
   */
  private broadcastPlanDelete(path: string, filename: string): void {
    const event: PlanDeleteEvent = {
      type: 'plan_delete',
      timestamp: new Date().toISOString(),
      path,
      filename,
    };

    this.hub.broadcast(event);
    logger.debug(`[PlanWatcher] Broadcast plan delete: ${filename}`);
  }

  /**
   * Stop watching plan files.
   */
  stop(): void {
    this.isShuttingDown = true;
    this.stopPolling();

    // Close directory watcher
    if (this.directoryWatcher) {
      try {
        this.directoryWatcher.close();
      } catch {
        // Ignore close errors
      }
      this.directoryWatcher = null;
    }

    this.trackedPlans.clear();
    logger.info('[PlanWatcher] Stopped');
  }

  /**
   * Get the number of tracked plan files.
   */
  getTrackedPlanCount(): number {
    return this.trackedPlans.size;
  }

  /**
   * Check if the watcher is running.
   */
  isRunning(): boolean {
    return !this.isShuttingDown && (this.directoryWatcher !== null || this.pollInterval !== null);
  }

  /**
   * Get list of tracked plan filenames.
   */
  getTrackedPlans(): string[] {
    return Array.from(this.trackedPlans.values()).map((p) => p.filename);
  }

  /**
   * Get detailed info for all tracked plans.
   * Returns array sorted by lastModified (most recent first).
   */
  getAllPlansInfo(): Array<{ path: string; filename: string; lastModified: number }> {
    return Array.from(this.trackedPlans.values())
      .map((p) => ({
        path: p.path,
        filename: p.filename,
        lastModified: p.lastModified,
      }))
      .sort((a, b) => b.lastModified - a.lastModified);
  }

  /**
   * Get the PlanListEvent containing all tracked plans.
   */
  getPlanListEvent(): PlanListEvent {
    return {
      type: 'plan_list',
      timestamp: new Date().toISOString(),
      plans: this.getAllPlansInfo(),
    };
  }

  /**
   * Get a specific plan's content by path.
   * Returns null if the plan is not tracked or cannot be read.
   */
  async getPlanContent(planPath: string): Promise<PlanUpdateEvent | null> {
    if (!this.isValidPath(planPath)) {
      return null;
    }

    const tracked = this.trackedPlans.get(planPath);
    if (!tracked) {
      return null;
    }

    try {
      const content = await readFile(planPath, 'utf-8');
      const safeContent = redactSecrets(truncatePayload(content) ?? '');

      return {
        type: 'plan_update',
        timestamp: new Date(tracked.lastModified).toISOString(),
        path: tracked.path,
        filename: tracked.filename,
        content: safeContent,
        lastModified: tracked.lastModified,
      };
    } catch {
      return null;
    }
  }

  /**
   * Get the most recently modified plan as a PlanUpdateEvent.
   * Returns null if no plans are tracked.
   */
  async getMostRecentPlanEvent(): Promise<PlanUpdateEvent | null> {
    if (this.trackedPlans.size === 0) {
      return null;
    }

    // Find the most recently modified plan
    let mostRecent: { path: string; filename: string; lastModified: number } | null = null;
    for (const plan of this.trackedPlans.values()) {
      if (!mostRecent || plan.lastModified > mostRecent.lastModified) {
        mostRecent = plan;
      }
    }

    if (!mostRecent) {
      return null;
    }

    try {
      const content = await readFile(mostRecent.path, 'utf-8');
      const safeContent = redactSecrets(truncatePayload(content) ?? '');

      return {
        type: 'plan_update',
        timestamp: new Date(mostRecent.lastModified).toISOString(),
        path: mostRecent.path,
        filename: mostRecent.filename,
        content: safeContent,
        lastModified: mostRecent.lastModified,
      };
    } catch {
      return null;
    }
  }

  /**
   * Validate that a path is inside the configured plans root.
   */
  private isValidPath(filePath: string): boolean {
    return isValidPlanPathWithinRoot(filePath, this.plansDir);
  }
}
