/**
 * Transcript parsing utilities.
 *
 * Pure functions for extracting information from transcript JSONL lines,
 * file paths, and working directory resolution.
 */

import { dirname } from 'node:path';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { isPathWithin } from '../path-validation.ts';

/** Transcript JSONL line structure (simplified for thinking extraction) */
export interface TranscriptLine {
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
  data?: {
    agentId?: string;
    message?: {
      timestamp?: string;
      message?: {
        role?: string;
        content?: Array<{
          type: string;
          thinking?: string;
          text?: string;
        }>;
      };
    };
  };
}

/**
 * Extracts the working directory from a transcript file path.
 * Transcript files are stored in directories like:
 *   ~/.claude/projects/-Users-dev-myproject/session-xxx.jsonl
 * This converts the directory name back to a path:
 *   -Users-dev-myproject -> /Users/dev/myproject
 */
export function extractWorkingDirectory(filePath: string): string | undefined {
  const parentDir = dirname(filePath);
  let dirName = parentDir.split('/').pop();

  // Subagent transcripts live at:
  // ~/.claude/projects/<project>/<session>/subagents/agent-<id>.jsonl
  if (dirName === 'subagents') {
    const sessionDir = dirname(parentDir);
    const projectDir = dirname(sessionDir);
    dirName = projectDir.split('/').pop();
  }

  if (!dirName || !dirName.startsWith('-')) {
    return undefined;
  }

  const workingDir = dirName.replace(/-/g, '/');
  if (!workingDir.startsWith('/')) {
    return undefined;
  }

  return workingDir;
}

/**
 * Validates that a path is within the allowed ~/.claude/ directory.
 */
export function isValidClaudePath(filePath: string): boolean {
  const claudeDir = join(homedir(), '.claude');
  return isValidClaudePathWithinRoot(filePath, claudeDir);
}

/**
 * Validates that a path is within the provided Claude root.
 */
export function isValidClaudePathWithinRoot(filePath: string, claudeDir: string): boolean {
  return isPathWithin(filePath, claudeDir);
}

/**
 * Extract session ID from a transcript file path.
 * Transcript files are named with their session ID: {session-id}.jsonl
 * Subagent sidecar files are excluded (they live under /subagents/).
 */
export function extractSessionIdFromPath(filePath: string): string | undefined {
  if (filePath.includes('/subagents/')) {
    return undefined;
  }

  const filename = filePath.split('/').pop();
  if (!filename || !filename.endsWith('.jsonl')) {
    return undefined;
  }
  return filename.slice(0, -6);
}

/**
 * Extract thinking content from a transcript message.
 *
 * Claude Code ≥2.1.86 writes thinking blocks with empty content to transcripts.
 * We still extract these so the dashboard can show that thinking occurred,
 * even without the actual text.
 */
export function extractThinking(message: TranscriptLine['message']): string[] {
  const thinkingBlocks: string[] = [];

  if (message?.role !== 'assistant' || !message?.content) {
    return thinkingBlocks;
  }

  for (const block of message.content) {
    if (block.type === 'thinking') {
      thinkingBlocks.push(block.thinking || '');
    }
  }

  return thinkingBlocks;
}
