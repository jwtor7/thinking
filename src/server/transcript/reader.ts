/**
 * Transcript file reader.
 *
 * Handles byte-offset-based incremental reading of JSONL transcript files.
 * Uses Node.js streams to avoid loading entire files into memory.
 */

import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import * as readline from 'node:readline';

/** Tracked file state for incremental reading */
export interface TrackedFile {
  path: string;
  lastSize: number;
  /** Byte offset of last read position - used for efficient incremental reads */
  lastOffset: number;
  lastProcessedLine: number;
  /**
   * Whether this file was discovered on startup (vs created after watcher started).
   * Files discovered on startup should skip to the end to avoid reading historical data.
   */
  isInitialFile: boolean;
}

/**
 * Read new lines from a file starting at a byte offset.
 * Uses streaming to avoid loading the entire file into memory.
 *
 * @param filePath - Path to the file to read
 * @param fromOffset - Byte offset to start reading from
 * @returns Object containing the new lines and the new byte offset
 */
export async function readNewLines(
  filePath: string,
  fromOffset: number
): Promise<{ lines: string[]; newOffset: number }> {
  const lines: string[] = [];

  return new Promise((resolve, reject) => {
    let settled = false;
    const stream = createReadStream(filePath, {
      start: fromOffset,
      encoding: 'utf-8',
    });

    const rl = readline.createInterface({
      input: stream,
      crlfDelay: Infinity,
    });

    rl.on('line', (line) => {
      if (line.trim()) {
        lines.push(line);
      }
    });

    rl.on('close', async () => {
      if (settled) {
        return;
      }

      try {
        const stats = await stat(filePath);
        settled = true;
        resolve({ lines, newOffset: stats.size });
      } catch (error) {
        settled = true;
        reject(error);
      }
    });

    rl.on('error', (error) => {
      if (settled) {
        return;
      }
      settled = true;
      try {
        rl.close();
      } catch {
        // Ignore close errors during error handling
      }
      stream.destroy();
      reject(error);
    });

    stream.on('error', (error) => {
      if (settled) {
        return;
      }
      settled = true;
      try {
        rl.close();
      } catch {
        // Ignore close errors during error handling
      }
      stream.destroy();
      reject(error);
    });
  });
}
