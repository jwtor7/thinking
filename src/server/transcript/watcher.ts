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
import { stat, readdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';
import type { ThinkingEvent } from '../types.ts';
import { truncatePayload, CONFIG } from '../types.ts';
import { redactSecrets } from '../secrets.ts';
import type { WebSocketHub } from '../websocket-hub.ts';
import { logger } from '../logger.ts';
import { isPathWithin } from '../path-validation.ts';
import {
  type TranscriptLine,
  extractWorkingDirectory,
  isValidClaudePathWithinRoot,
  extractSessionIdFromPath,
  extractThinking,
} from './parser.ts';
import { type TrackedFile, readNewLines } from './reader.ts';

export interface TranscriptWatcherOptions {
  projectsDir?: string;
  claudeDir?: string;
}

/**
 * TranscriptWatcher monitors Claude Code transcript files and extracts thinking blocks.
 */
export class TranscriptWatcher {
  private hub: WebSocketHub;
  private claudeDir: string;
  private projectsDir: string;
  private trackedFiles: Map<string, TrackedFile> = new Map();
  private projectsWatcher: FSWatcher | null = null;
  private subDirWatchers: Map<string, FSWatcher> = new Map();
  private pollInterval: ReturnType<typeof setInterval> | null = null;
  private watcherReconcileInterval: ReturnType<typeof setInterval> | null = null;
  private isShuttingDown = false;
  private isInitialScan = true;
  private announcedSessions: Map<string, { workingDirectory?: string; lastSeen: number }> = new Map();
  private static readonly WATCHER_RECONCILE_INTERVAL_MS = 5 * 60 * 1000;

  constructor(hub: WebSocketHub, options?: TranscriptWatcherOptions) {
    this.hub = hub;
    this.claudeDir = options?.claudeDir
      ?? (options?.projectsDir ? dirname(options.projectsDir) : join(homedir(), '.claude'));
    this.projectsDir = options?.projectsDir ?? join(this.claudeDir, 'projects');
  }

  async start(): Promise<void> {
    if (!this.isValidPath(this.projectsDir)) {
      logger.error('[TranscriptWatcher] Invalid projects directory path');
      return;
    }

    try {
      await stat(this.projectsDir);
    } catch {
      logger.warn(`[TranscriptWatcher] Projects directory not found: ${this.projectsDir}`);
      logger.info('[TranscriptWatcher] Will retry when directory becomes available');
      this.startDirectoryPolling();
      return;
    }

    await this.initializeWatching();
  }

  private startDirectoryPolling(): void {
    if (this.pollInterval) return;

    this.pollInterval = setInterval(() => {
      (async () => {
        if (this.isShuttingDown) return;

        try {
          await stat(this.projectsDir);
          this.stopPolling();
          await this.initializeWatching();
        } catch {
          // Directory still doesn't exist, continue polling
        }
      })().catch((error) => {
        logger.error(`[TranscriptWatcher] Error in directory polling:`, error instanceof Error ? error.message : 'Unknown error');
      });
    }, CONFIG.TRANSCRIPT_POLL_INTERVAL_MS * 5);
  }

  private stopPolling(): void {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
  }

  private async initializeWatching(): Promise<void> {
    logger.info(`[TranscriptWatcher] Watching: ${this.projectsDir}`);
    this.isInitialScan = true;

    try {
      this.projectsWatcher = watch(this.projectsDir, { persistent: false }, (eventType, filename) => {
        if (this.isShuttingDown) return;
        if (eventType === 'rename' && filename) {
          this.handleProjectChange(filename);
        }
      });

      this.projectsWatcher.on('error', (error) => {
        logger.error('[TranscriptWatcher] Projects watcher error:', error.message);
      });
    } catch (error) {
      logger.error('[TranscriptWatcher] Failed to watch projects directory:', error);
      return;
    }

    await this.scanProjectDirectories();

    this.isInitialScan = false;
    logger.debug(`[TranscriptWatcher] Initial scan complete, skipped to end of ${this.trackedFiles.size} existing files`);

    this.pollInterval = setInterval(() => {
      if (!this.isShuttingDown) {
        this.pollTrackedFiles();
      }
    }, CONFIG.TRANSCRIPT_POLL_INTERVAL_MS);

    this.startWatcherReconcileInterval();
    logger.info(`[TranscriptWatcher] Tracking ${this.trackedFiles.size} transcript files`);
  }

  private async handleProjectChange(projectName: string): Promise<void> {
    const projectPath = join(this.projectsDir, projectName);
    if (!this.isValidPath(projectPath)) return;

    try {
      const stats = await stat(projectPath);
      if (stats.isDirectory()) {
        await this.watchProjectDirectory(projectPath);
      }
    } catch {
      this.cleanupProjectDirectory(projectPath);
    }
  }

  private async scanProjectDirectories(): Promise<void> {
    try {
      const entries = await readdir(this.projectsDir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory() && !entry.name.startsWith('.')) {
          const projectPath = join(this.projectsDir, entry.name);
          if (this.isValidPath(projectPath)) {
            await this.watchProjectDirectory(projectPath);
          }
        }
      }
    } catch (error) {
      logger.error('[TranscriptWatcher] Error scanning project directories:', error);
    }
  }

  private async watchProjectDirectory(projectPath: string): Promise<void> {
    if (this.subDirWatchers.has(projectPath)) return;

    try {
      const watcher = watch(projectPath, { persistent: false }, (_eventType, filename) => {
        if (this.isShuttingDown) return;
        if (filename?.endsWith('.jsonl')) {
          void this.handleFileChange(join(projectPath, filename));
          return;
        }
        if (filename) {
          void this.scanSessionSubagentFiles(join(projectPath, filename));
        }
      });

      watcher.on('error', (error) => {
        logger.error(`[TranscriptWatcher] Directory watcher error for ${projectPath}:`, error.message);
      });

      this.subDirWatchers.set(projectPath, watcher);

      const entries = await readdir(projectPath, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isFile() && entry.name.endsWith('.jsonl')) {
          await this.trackFile(join(projectPath, entry.name));
        }
        if (entry.isDirectory() && !entry.name.startsWith('.')) {
          await this.scanSessionSubagentFiles(join(projectPath, entry.name));
        }
      }
    } catch (error) {
      logger.error(`[TranscriptWatcher] Error watching project directory ${projectPath}:`, error);
    }
  }

  private async scanSessionSubagentFiles(sessionPath: string): Promise<void> {
    if (!this.isValidPath(sessionPath)) return;

    try {
      const sessionStats = await stat(sessionPath);
      if (!sessionStats.isDirectory()) return;
    } catch {
      return;
    }

    const subagentsDir = join(sessionPath, 'subagents');
    if (!this.isValidPath(subagentsDir)) return;

    try {
      const subagentStats = await stat(subagentsDir);
      if (!subagentStats.isDirectory()) return;
    } catch {
      return;
    }

    try {
      const entries = await readdir(subagentsDir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isFile() && entry.name.endsWith('.jsonl')) {
          await this.trackFile(join(subagentsDir, entry.name));
        }
      }
    } catch (error) {
      logger.error(`[TranscriptWatcher] Error scanning subagent transcripts in ${subagentsDir}:`, error);
    }
  }

  private cleanupProjectDirectory(projectPath: string): void {
    const watcher = this.subDirWatchers.get(projectPath);
    if (watcher) {
      try { watcher.close(); } catch { /* ignore */ }
      this.subDirWatchers.delete(projectPath);
    }

    for (const [filePath] of this.trackedFiles) {
      if (isPathWithin(filePath, projectPath)) {
        this.trackedFiles.delete(filePath);
      }
    }
  }

  private startWatcherReconcileInterval(): void {
    if (this.watcherReconcileInterval) return;

    this.watcherReconcileInterval = setInterval(() => {
      if (this.isShuttingDown) return;

      (async () => {
        for (const projectPath of Array.from(this.subDirWatchers.keys())) {
          try {
            const stats = await stat(projectPath);
            if (!stats.isDirectory()) this.cleanupProjectDirectory(projectPath);
          } catch {
            this.cleanupProjectDirectory(projectPath);
          }
        }
      })().catch((error) => {
        logger.error(
          '[TranscriptWatcher] Error reconciling subdirectory watchers:',
          error instanceof Error ? error.message : 'Unknown error'
        );
      });
    }, TranscriptWatcher.WATCHER_RECONCILE_INTERVAL_MS);
  }

  private async handleFileChange(filePath: string): Promise<void> {
    if (!this.isValidPath(filePath)) return;
    await this.trackFile(filePath);
  }

  private async trackFile(filePath: string): Promise<void> {
    if (!this.isValidPath(filePath) || this.trackedFiles.has(filePath)) return;

    try {
      const stats = await stat(filePath);
      if (!stats.isFile()) return;

      const sessionId = extractSessionIdFromPath(filePath);
      const workingDirectory = extractWorkingDirectory(filePath);

      if (this.isInitialScan) {
        // Pre-populate recent sessions using file mtime (no broadcast during scan)
        if (sessionId) {
          const mtime = stats.mtimeMs;
          const existing = this.announcedSessions.get(sessionId);
          if (!existing || mtime > existing.lastSeen) {
            this.announcedSessions.set(sessionId, { workingDirectory, lastSeen: mtime });
          }
        }
      } else if (sessionId && !this.announcedSessions.has(sessionId)) {
        this.announcedSessions.set(sessionId, { workingDirectory, lastSeen: Date.now() });
        this.broadcastSessionStart(sessionId, workingDirectory);
      }

      if (this.isInitialScan) {
        this.trackedFiles.set(filePath, {
          path: filePath,
          lastSize: stats.size,
          lastOffset: stats.size,
          lastProcessedLine: 0,
          isInitialFile: true,
        });
      } else {
        this.trackedFiles.set(filePath, {
          path: filePath,
          lastSize: 0,
          lastOffset: 0,
          lastProcessedLine: 0,
          isInitialFile: false,
        });
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        logger.error(`[TranscriptWatcher] Error tracking file ${filePath}:`, error);
      }
    }
  }

  private async pollTrackedFiles(): Promise<void> {
    const promises: Promise<void>[] = [];
    for (const [filePath, tracked] of this.trackedFiles) {
      promises.push(this.checkFileForUpdates(filePath, tracked));
    }
    await Promise.allSettled(promises);
  }

  private async checkFileForUpdates(filePath: string, tracked: TrackedFile): Promise<void> {
    try {
      const stats = await stat(filePath);
      if (stats.size > tracked.lastOffset) {
        await this.processFileUpdates(filePath);
        tracked.lastSize = stats.size;
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        this.trackedFiles.delete(filePath);
      }
    }
  }

  private async processFileUpdates(filePath: string): Promise<void> {
    const tracked = this.trackedFiles.get(filePath);
    if (!tracked) return;

    try {
      const { lines, newOffset } = await readNewLines(filePath, tracked.lastOffset);

      for (const line of lines) {
        await this.processLine(line, filePath);
      }

      tracked.lastOffset = newOffset;
      tracked.lastProcessedLine += lines.length;
    } catch (error) {
      logger.error(`[TranscriptWatcher] Error processing file ${filePath}:`, error);
    }
  }

  private async processLine(line: string, filePath: string): Promise<void> {
    if (!line.trim()) return;

    let parsed: TranscriptLine;
    try {
      parsed = JSON.parse(line);
    } catch {
      return;
    }

    const workingDirectory = extractWorkingDirectory(filePath);

    const now = Date.now();
    if (parsed.sessionId && !this.announcedSessions.has(parsed.sessionId)) {
      this.announcedSessions.set(parsed.sessionId, { workingDirectory, lastSeen: now });
      this.broadcastSessionStart(parsed.sessionId, workingDirectory, parsed.timestamp);
    } else if (parsed.sessionId) {
      // Update lastSeen for existing sessions
      const existing = this.announcedSessions.get(parsed.sessionId);
      if (existing) existing.lastSeen = now;
    }

    if (!filePath.includes('/subagents/') && parsed.sessionId) {
      const discoveredAgentIds = new Set<string>();
      if (parsed.agentId) discoveredAgentIds.add(parsed.agentId);
      if (parsed.data?.agentId) discoveredAgentIds.add(parsed.data.agentId);
      for (const agentId of discoveredAgentIds) {
        await this.trackSubagentFile(filePath, parsed.sessionId, agentId);
      }
    }

    const thinkingBlocks = extractThinking(parsed.message);
    for (const thinking of thinkingBlocks) {
      this.broadcastThinking(thinking, parsed.sessionId, parsed.agentId, parsed.timestamp);
    }

    const nestedMessage = parsed.data?.message?.message;
    const nestedThinkingBlocks = extractThinking(nestedMessage);
    const nestedTimestamp = parsed.data?.message?.timestamp || parsed.timestamp;
    const nestedAgentId = parsed.data?.agentId || parsed.agentId;

    for (const thinking of nestedThinkingBlocks) {
      this.broadcastThinking(thinking, parsed.sessionId, nestedAgentId, nestedTimestamp);
    }
  }

  private async trackSubagentFile(
    filePath: string,
    sessionId: string,
    agentId: string
  ): Promise<void> {
    const projectDir = dirname(filePath);
    const subagentFilePath = join(projectDir, sessionId, 'subagents', `agent-${agentId}.jsonl`);
    await this.trackFile(subagentFilePath);
  }

  private broadcastSessionStart(
    sessionId: string,
    workingDirectory?: string,
    timestamp?: string
  ): void {
    this.hub.broadcast({
      type: 'session_start' as const,
      timestamp: timestamp || new Date().toISOString(),
      sessionId,
      workingDirectory,
    });
    logger.debug(`[TranscriptWatcher] Broadcast session_start for ${sessionId} (${workingDirectory || 'no path'})`);
  }

  private broadcastThinking(
    content: string,
    sessionId?: string,
    agentId?: string,
    timestamp?: string
  ): void {
    // Claude Code ≥2.1.86 writes empty thinking blocks to transcripts.
    // Broadcast with placeholder so the dashboard shows thinking occurred.
    const displayContent = content || '[Extended thinking]';
    const safeContent = redactSecrets(truncatePayload(displayContent) ?? '');

    const event: ThinkingEvent = {
      type: 'thinking',
      timestamp: timestamp || new Date().toISOString(),
      content: safeContent,
      sessionId,
      agentId,
    };

    this.hub.broadcast(event);
    logger.debug(`[TranscriptWatcher] Broadcast thinking (${safeContent.slice(0, 50)}...)`);
  }

  /**
   * Get sessions to send on client connect.
   * Returns sessions seen in the last 4 hours, sorted by most recent first,
   * capped at 10 to avoid overwhelming the dashboard with stale session chips.
   */
  getKnownSessions(): Array<{ sessionId: string; workingDirectory?: string }> {
    const cutoff = Date.now() - 4 * 60 * 60 * 1000;
    const results: Array<{ sessionId: string; workingDirectory?: string; lastSeen: number }> = [];
    for (const [sessionId, info] of this.announcedSessions) {
      if (info.lastSeen >= cutoff) {
        results.push({ sessionId, workingDirectory: info.workingDirectory, lastSeen: info.lastSeen });
      }
    }
    return results
      .sort((a, b) => b.lastSeen - a.lastSeen)
      .slice(0, 10)
      .map(({ sessionId, workingDirectory }) => ({ sessionId, workingDirectory }));
  }

  stop(): void {
    this.isShuttingDown = true;
    this.stopPolling();

    if (this.watcherReconcileInterval) {
      clearInterval(this.watcherReconcileInterval);
      this.watcherReconcileInterval = null;
    }

    for (const [, tracked] of this.trackedFiles) {
      if ((tracked as TrackedFile & { watcher?: { close(): void } }).watcher) {
        try { (tracked as TrackedFile & { watcher: { close(): void } }).watcher.close(); } catch { /* ignore */ }
      }
    }
    this.trackedFiles.clear();

    for (const [, watcher] of this.subDirWatchers) {
      try { watcher.close(); } catch { /* ignore */ }
    }
    this.subDirWatchers.clear();

    if (this.projectsWatcher) {
      try { this.projectsWatcher.close(); } catch { /* ignore */ }
      this.projectsWatcher = null;
    }

    logger.info('[TranscriptWatcher] Stopped');
  }

  getTrackedFileCount(): number {
    return this.trackedFiles.size;
  }

  isRunning(): boolean {
    return !this.isShuttingDown && (this.projectsWatcher !== null || this.pollInterval !== null);
  }

  private isValidPath(filePath: string): boolean {
    return isValidClaudePathWithinRoot(filePath, this.claudeDir);
  }
}
