import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { mkdtemp, mkdir, rm, symlink } from 'node:fs/promises';
import { isPathWithin, isPathWithinAny, normalizeAbsolutePath } from './path-validation.ts';

describe('normalizeAbsolutePath', () => {
  it('normalizes valid absolute paths', () => {
    expect(normalizeAbsolutePath('/tmp/claude/./plans/../plans/a.md')).toBe('/tmp/claude/plans/a.md');
  });

  it('rejects empty and non-absolute paths', () => {
    expect(normalizeAbsolutePath('')).toBeNull();
    expect(normalizeAbsolutePath('tmp/claude/a.md')).toBeNull();
  });
});

describe('isPathWithin', () => {
  it('accepts base directory and descendants', () => {
    const baseDir = '/tmp/claude';
    expect(isPathWithin(baseDir, baseDir)).toBe(true);
    expect(isPathWithin(join(baseDir, 'plans', 'plan.md'), baseDir)).toBe(true);
  });

  it('rejects sibling and parent paths', () => {
    const baseDir = '/tmp/claude';
    expect(isPathWithin('/tmp/claude-other/plan.md', baseDir)).toBe(false);
    expect(isPathWithin('/tmp/plan.md', baseDir)).toBe(false);
  });

  it('rejects symlink escapes outside the base directory', async () => {
    const root = await mkdtemp(join(tmpdir(), 'path-validation-'));
    const allowedDir = join(root, 'allowed');
    const outsideDir = join(root, 'outside');
    const linkPath = join(allowedDir, 'link-out');

    try {
      await mkdir(allowedDir, { recursive: true });
      await mkdir(outsideDir, { recursive: true });
      await symlink(outsideDir, linkPath);

      expect(isPathWithin(join(linkPath, 'secret.txt'), allowedDir)).toBe(false);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

describe('isPathWithinAny', () => {
  it('accepts paths inside one of multiple allowed base dirs', () => {
    const allowed = ['/tmp/claude/plans', '/tmp/claude/projects'];
    expect(isPathWithinAny('/tmp/claude/plans/a.md', allowed)).toBe(true);
    expect(isPathWithinAny('/tmp/claude/projects/a.jsonl', allowed)).toBe(true);
  });

  it('rejects paths outside all allowed base dirs', () => {
    const allowed = ['/tmp/claude/plans', '/tmp/claude/projects'];
    expect(isPathWithinAny('/tmp/claude/tasks/task.json', allowed)).toBe(false);
  });
});
