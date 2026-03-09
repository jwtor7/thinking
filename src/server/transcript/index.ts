/**
 * Transcript module re-exports.
 * Preserves backward compatibility for existing imports.
 */

export { TranscriptWatcher } from './watcher.ts';
export type { TranscriptWatcherOptions } from './watcher.ts';
export { extractWorkingDirectory, isValidClaudePath, isValidClaudePathWithinRoot } from './parser.ts';
export type { TrackedFile } from './reader.ts';
