/**
 * Re-export from new transcript module for backward compatibility.
 */
export {
  TranscriptWatcher,
  extractWorkingDirectory,
  isValidClaudePath,
  isValidClaudePathWithinRoot,
} from './transcript/index.ts';
export type { TranscriptWatcherOptions, TrackedFile } from './transcript/index.ts';
