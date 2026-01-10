/**
 * Tests for the Export Handler.
 *
 * Verifies:
 * - Path validation logic
 * - Allowed directories for export
 * - Session working directory validation
 */

import { describe, it, expect } from 'vitest';
import { isExportPathAllowed } from './export-handler.ts';
import { homedir } from 'node:os';
import { resolve } from 'node:path';

describe('Export Handler', () => {
  describe('isExportPathAllowed', () => {
    describe('Always-allowed paths', () => {
      it('should allow paths in ~/.claude/', () => {
        const path = resolve(homedir(), '.claude', 'exports', 'test.md');
        expect(isExportPathAllowed(path)).toBe(true);
      });

      it('should allow paths in ~/Desktop/', () => {
        const path = resolve(homedir(), 'Desktop', 'export.md');
        expect(isExportPathAllowed(path)).toBe(true);
      });

      it('should allow paths in ~/Documents/', () => {
        const path = resolve(homedir(), 'Documents', 'exports', 'test.md');
        expect(isExportPathAllowed(path)).toBe(true);
      });

      it('should allow paths in ~/Downloads/', () => {
        const path = resolve(homedir(), 'Downloads', 'thinking-export.md');
        expect(isExportPathAllowed(path)).toBe(true);
      });
    });

    describe('Disallowed paths', () => {
      it('should reject paths outside allowed directories', () => {
        const path = '/etc/passwd';
        expect(isExportPathAllowed(path)).toBe(false);
      });

      it('should reject relative paths', () => {
        const path = './export.md';
        expect(isExportPathAllowed(path)).toBe(false);
      });

      it('should reject paths with traversal attempts', () => {
        const path = resolve(homedir(), '.claude', '..', '.ssh', 'keys.md');
        // This path resolves to ~/.ssh/keys.md which is outside allowed dirs
        expect(isExportPathAllowed(path)).toBe(false);
      });

      it('should reject empty paths', () => {
        expect(isExportPathAllowed('')).toBe(false);
      });

      it('should reject paths in home directory root', () => {
        const path = resolve(homedir(), 'export.md');
        expect(isExportPathAllowed(path)).toBe(false);
      });
    });

    describe('Working directory paths', () => {
      it('should allow paths in provided working directories', () => {
        const workingDir = '/Users/test/projects/my-app';
        const path = `${workingDir}/docs/export.md`;
        const allowedWorkingDirs = new Set([workingDir]);

        expect(isExportPathAllowed(path, allowedWorkingDirs)).toBe(true);
      });

      it('should allow subdirectories of working directories', () => {
        const workingDir = '/Users/test/dev/project';
        const path = `${workingDir}/deep/nested/export.md`;
        const allowedWorkingDirs = new Set([workingDir]);

        expect(isExportPathAllowed(path, allowedWorkingDirs)).toBe(true);
      });

      it('should reject paths outside working directories', () => {
        const workingDir = '/Users/test/dev/project';
        const path = '/Users/test/dev/other-project/export.md';
        const allowedWorkingDirs = new Set([workingDir]);

        expect(isExportPathAllowed(path, allowedWorkingDirs)).toBe(false);
      });

      it('should allow with multiple working directories', () => {
        const workingDir1 = '/Users/test/project1';
        const workingDir2 = '/Users/test/project2';
        const path = `${workingDir2}/export.md`;
        const allowedWorkingDirs = new Set([workingDir1, workingDir2]);

        expect(isExportPathAllowed(path, allowedWorkingDirs)).toBe(true);
      });

      it('should not allow parent directory traversal from working dir', () => {
        const workingDir = '/Users/test/dev/project';
        const path = `${workingDir}/../other-project/export.md`;
        const allowedWorkingDirs = new Set([workingDir]);

        // After resolve, this would be outside the working dir
        expect(isExportPathAllowed(path, allowedWorkingDirs)).toBe(false);
      });
    });
  });
});
