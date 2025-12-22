/**
 * Transcript Watcher for the Thinking Monitor.
 *
 * Watches Claude Code transcript files (JSONL format) in ~/.claude/projects/
 * and extracts thinking blocks to broadcast to connected dashboard clients.
 *
 * Security:
 * - Only watches validated paths under ~/.claude/
 * - Redacts secrets from thinking content before broadcasting
 * - Uses native fs.watch for efficiency
 */

import { watch, type FSWatcher } from 'node:fs';
import { readFile, stat, readdir } from 'node:fs/promises';
import { join, dirname, resolve } from 'node:path';
import { homedir } from 'node:os';
import type { ThinkingEvent } from './types.ts';
import { truncatePayload } from './types.ts';
import { redactSecrets } from './secrets.ts';
import type { WebSocketHub } from './websocket-hub.ts';

/** Transcript JSONL line structure (simplified for thinking extraction) */
interface TranscriptLine {
  type?: string;
  sessionId?: string;
  agentId?: string;
  timestamp?: string;
  message?: {
    role?: string;
    content?: Array<{
      type: string;
      thinking?: string;
      text?: string;
    }>;
  };
}

/** Tracked file state for incremental reading */
interface TrackedFile {
  path: string;
  lastSize: number;
  lastProcessedLine: number;
  watcher?: FSWatcher;
}

/**
 * Validates that a path is within the allowed ~/.claude/ directory.
 * This is a security measure to prevent watching arbitrary paths.
 */
export function isValidClaudePath(filePath: string): boolean {
  const claudeDir = join(homedir(), '.claude');
  const resolvedPath = resolve(filePath);
  const resolvedClaudeDir = resolve(claudeDir);

  // Ensure the path is within ~/.claude/
  if (!resolvedPath.startsWith(resolvedClaudeDir + '/') && resolvedPath !== resolvedClaudeDir) {
    return false;
  }

  // Prevent directory traversal attacks
  if (resolvedPath.includes('..')) {
    return false;
  }

  return true;
}

/**
 * TranscriptWatcher monitors Claude Code transcript files and extracts thinking blocks.
 */
export class TranscriptWatcher {
  private hub: WebSocketHub;
  private projectsDir: string;
  private trackedFiles: Map<string, TrackedFile> = new Map();
  private projectsWatcher: FSWatcher | null = null;
  private subDirWatchers: Map<string, FSWatcher> = new Map();
  private pollInterval: ReturnType<typeof setInterval> | null = null;
  private isShuttingDown = false;

  /** Polling interval for checking file updates (ms) */
  private static readonly POLL_INTERVAL_MS = 1000;

  constructor(hub: WebSocketHub) {
    this.hub = hub;
    this.projectsDir = join(homedir(), '.claude', 'projects');
  }

  /**
   * Start watching transcript files.
   */
  async start(): Promise<void> {
    if (!isValidClaudePath(this.projectsDir)) {
      console.error('[TranscriptWatcher] Invalid projects directory path');
      return;
    }

    try {
      // Verify the projects directory exists
      await stat(this.projectsDir);
    } catch {
      console.warn(`[TranscriptWatcher] Projects directory not found: ${this.projectsDir}`);
      console.log('[TranscriptWatcher] Will retry when directory becomes available');
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
        await stat(this.projectsDir);
        // Directory exists now, start watching
        this.stopPolling();
        await this.initializeWatching();
      } catch {
        // Directory still doesn't exist, continue polling
      }
    }, TranscriptWatcher.POLL_INTERVAL_MS * 5);
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
    console.log(`[TranscriptWatcher] Watching: ${this.projectsDir}`);

    // Watch the projects directory for new project folders
    try {
      this.projectsWatcher = watch(this.projectsDir, { persistent: false }, (eventType, filename) => {
        if (this.isShuttingDown) return;
        if (eventType === 'rename' && filename) {
          this.handleProjectChange(filename);
        }
      });

      this.projectsWatcher.on('error', (error) => {
        console.error('[TranscriptWatcher] Projects watcher error:', error.message);
      });
    } catch (error) {
      console.error('[TranscriptWatcher] Failed to watch projects directory:', error);
      return;
    }

    // Scan existing project directories
    await this.scanProjectDirectories();

    // Start polling for file updates (fs.watch doesn't reliably report file modifications)
    this.pollInterval = setInterval(() => {
      if (!this.isShuttingDown) {
        this.pollTrackedFiles();
      }
    }, TranscriptWatcher.POLL_INTERVAL_MS);

    console.log(`[TranscriptWatcher] Tracking ${this.trackedFiles.size} transcript files`);
  }

  /**
   * Handle changes in the projects directory.
   */
  private async handleProjectChange(projectName: string): Promise<void> {
    const projectPath = join(this.projectsDir, projectName);

    if (!isValidClaudePath(projectPath)) {
      return;
    }

    try {
      const stats = await stat(projectPath);
      if (stats.isDirectory()) {
        await this.watchProjectDirectory(projectPath);
      }
    } catch {
      // Directory was removed, clean up watchers
      this.cleanupProjectDirectory(projectPath);
    }
  }

  /**
   * Scan all project directories for transcript files.
   */
  private async scanProjectDirectories(): Promise<void> {
    try {
      const entries = await readdir(this.projectsDir, { withFileTypes: true });

      for (const entry of entries) {
        if (entry.isDirectory() && !entry.name.startsWith('.')) {
          const projectPath = join(this.projectsDir, entry.name);
          if (isValidClaudePath(projectPath)) {
            await this.watchProjectDirectory(projectPath);
          }
        }
      }
    } catch (error) {
      console.error('[TranscriptWatcher] Error scanning project directories:', error);
    }
  }

  /**
   * Watch a specific project directory for JSONL files.
   */
  private async watchProjectDirectory(projectPath: string): Promise<void> {
    if (this.subDirWatchers.has(projectPath)) {
      return; // Already watching
    }

    try {
      // Watch for new JSONL files in this directory
      const watcher = watch(projectPath, { persistent: false }, (_eventType, filename) => {
        if (this.isShuttingDown) return;
        if (filename?.endsWith('.jsonl')) {
          this.handleFileChange(join(projectPath, filename));
        }
      });

      watcher.on('error', (error) => {
        console.error(`[TranscriptWatcher] Directory watcher error for ${projectPath}:`, error.message);
      });

      this.subDirWatchers.set(projectPath, watcher);

      // Scan for existing JSONL files
      const entries = await readdir(projectPath, { withFileTypes: true });

      for (const entry of entries) {
        if (entry.isFile() && entry.name.endsWith('.jsonl')) {
          const filePath = join(projectPath, entry.name);
          await this.trackFile(filePath);
        }
      }
    } catch (error) {
      console.error(`[TranscriptWatcher] Error watching project directory ${projectPath}:`, error);
    }
  }

  /**
   * Clean up watchers for a removed project directory.
   */
  private cleanupProjectDirectory(projectPath: string): void {
    const watcher = this.subDirWatchers.get(projectPath);
    if (watcher) {
      try {
        watcher.close();
      } catch {
        // Ignore close errors
      }
      this.subDirWatchers.delete(projectPath);
    }

    // Remove tracked files in this directory
    for (const [filePath, tracked] of this.trackedFiles) {
      if (dirname(filePath) === projectPath) {
        if (tracked.watcher) {
          try {
            tracked.watcher.close();
          } catch {
            // Ignore close errors
          }
        }
        this.trackedFiles.delete(filePath);
      }
    }
  }

  /**
   * Handle changes to a specific JSONL file.
   */
  private async handleFileChange(filePath: string): Promise<void> {
    if (!isValidClaudePath(filePath)) {
      return;
    }

    await this.trackFile(filePath);
  }

  /**
   * Start tracking a transcript file.
   */
  private async trackFile(filePath: string): Promise<void> {
    if (!isValidClaudePath(filePath) || this.trackedFiles.has(filePath)) {
      return;
    }

    try {
      const stats = await stat(filePath);
      if (!stats.isFile()) {
        return;
      }

      this.trackedFiles.set(filePath, {
        path: filePath,
        lastSize: stats.size,
        lastProcessedLine: 0,
      });

      // Process the initial content
      await this.processFileUpdates(filePath);
    } catch (error) {
      // File might not exist yet or be inaccessible
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        console.error(`[TranscriptWatcher] Error tracking file ${filePath}:`, error);
      }
    }
  }

  /**
   * Poll tracked files for updates.
   */
  private async pollTrackedFiles(): Promise<void> {
    const promises: Promise<void>[] = [];

    for (const [filePath, tracked] of this.trackedFiles) {
      promises.push(this.checkFileForUpdates(filePath, tracked));
    }

    await Promise.allSettled(promises);
  }

  /**
   * Check a specific file for updates.
   */
  private async checkFileForUpdates(filePath: string, tracked: TrackedFile): Promise<void> {
    try {
      const stats = await stat(filePath);

      if (stats.size > tracked.lastSize) {
        // File has grown, process new content
        await this.processFileUpdates(filePath);
        tracked.lastSize = stats.size;
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        // File was deleted
        this.trackedFiles.delete(filePath);
      }
    }
  }

  /**
   * Process new content from a transcript file.
   */
  private async processFileUpdates(filePath: string): Promise<void> {
    const tracked = this.trackedFiles.get(filePath);
    if (!tracked) {
      return;
    }

    try {
      const content = await readFile(filePath, 'utf-8');
      const lines = content.split('\n').filter((line) => line.trim());

      // Process only new lines
      const newLines = lines.slice(tracked.lastProcessedLine);

      for (const line of newLines) {
        await this.processLine(line, filePath);
      }

      tracked.lastProcessedLine = lines.length;
    } catch (error) {
      console.error(`[TranscriptWatcher] Error processing file ${filePath}:`, error);
    }
  }

  /**
   * Process a single JSONL line.
   */
  private async processLine(line: string, _filePath: string): Promise<void> {
    if (!line.trim()) {
      return;
    }

    let parsed: TranscriptLine;
    try {
      parsed = JSON.parse(line);
    } catch {
      // Invalid JSON line, skip
      return;
    }

    // Extract thinking blocks from assistant messages
    const thinkingBlocks = this.extractThinking(parsed);

    for (const thinking of thinkingBlocks) {
      this.broadcastThinking(thinking, parsed.sessionId, parsed.agentId, parsed.timestamp);
    }
  }

  /**
   * Extract thinking content from a transcript line.
   */
  private extractThinking(line: TranscriptLine): string[] {
    const thinkingBlocks: string[] = [];

    if (line.message?.role !== 'assistant' || !line.message?.content) {
      return thinkingBlocks;
    }

    for (const block of line.message.content) {
      if (block.type === 'thinking' && block.thinking) {
        thinkingBlocks.push(block.thinking);
      }
    }

    return thinkingBlocks;
  }

  /**
   * Broadcast a thinking event to connected clients.
   */
  private broadcastThinking(
    content: string,
    sessionId?: string,
    agentId?: string,
    timestamp?: string
  ): void {
    // Apply security measures: truncate and redact secrets
    const safeContent = redactSecrets(truncatePayload(content) ?? '');

    const event: ThinkingEvent = {
      type: 'thinking',
      timestamp: timestamp || new Date().toISOString(),
      content: safeContent,
      sessionId,
      agentId,
    };

    this.hub.broadcast(event);
    console.log(`[TranscriptWatcher] Broadcast thinking (${safeContent.slice(0, 50)}...)`);
  }

  /**
   * Stop watching transcript files.
   */
  stop(): void {
    this.isShuttingDown = true;
    this.stopPolling();

    // Close all file watchers
    for (const [, tracked] of this.trackedFiles) {
      if (tracked.watcher) {
        try {
          tracked.watcher.close();
        } catch {
          // Ignore close errors
        }
      }
    }
    this.trackedFiles.clear();

    // Close subdirectory watchers
    for (const [, watcher] of this.subDirWatchers) {
      try {
        watcher.close();
      } catch {
        // Ignore close errors
      }
    }
    this.subDirWatchers.clear();

    // Close projects watcher
    if (this.projectsWatcher) {
      try {
        this.projectsWatcher.close();
      } catch {
        // Ignore close errors
      }
      this.projectsWatcher = null;
    }

    console.log('[TranscriptWatcher] Stopped');
  }

  /**
   * Get the number of tracked files.
   */
  getTrackedFileCount(): number {
    return this.trackedFiles.size;
  }

  /**
   * Check if the watcher is running.
   */
  isRunning(): boolean {
    return !this.isShuttingDown && (this.projectsWatcher !== null || this.pollInterval !== null);
  }
}
