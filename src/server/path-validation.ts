import { realpathSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, normalize, resolve } from 'node:path';

/**
 * Normalize a path into an absolute canonical form.
 * Returns null for non-string, empty, or non-absolute input.
 */
export function normalizeAbsolutePath(filePath: string): string | null {
  if (typeof filePath !== 'string' || filePath.length === 0 || !isAbsolute(filePath)) {
    return null;
  }

  return resolve(normalize(filePath));
}

/**
 * Resolve symlinks/casing where possible to support robust path boundary checks.
 *
 * - If the full path exists, return realpath(fullPath)
 * - Otherwise, if parent exists, return join(realpath(parent), basename(path))
 * - Fallback to normalized absolute path when realpath isn't possible
 */
function canonicalizePath(filePath: string): string {
  const normalizedPath = resolve(normalize(filePath));
  const missingSegments: string[] = [];
  let probe = normalizedPath;

  while (true) {
    try {
      const realProbe = realpathSync(probe);
      if (missingSegments.length === 0) {
        return realProbe;
      }
      return join(realProbe, ...missingSegments.reverse());
    } catch {
      const parent = dirname(probe);
      if (parent === probe) {
        return normalizedPath;
      }
      missingSegments.push(basename(probe));
      probe = parent;
    }
  }
}

/**
 * Returns true when a path resolves to `baseDir` or one of its descendants.
 */
export function isPathWithin(filePath: string, baseDir: string): boolean {
  const resolvedPath = canonicalizePath(filePath);
  const resolvedBaseDir = canonicalizePath(baseDir);

  return (
    resolvedPath === resolvedBaseDir ||
    resolvedPath.startsWith(resolvedBaseDir + '/')
  );
}

/**
 * Returns true when a path is within at least one allowed base directory.
 */
export function isPathWithinAny(filePath: string, baseDirs: readonly string[]): boolean {
  return baseDirs.some((baseDir) => isPathWithin(filePath, baseDir));
}
