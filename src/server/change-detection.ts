import { createHash } from 'node:crypto';

/**
 * Stable content hash used for change detection.
 * Not for security; this just avoids false positives from weak hashes.
 */
export function hashContent(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

/**
 * Hash a sequence of parts with explicit boundaries to avoid concatenation
 * collisions (for example ['ab', 'c'] vs ['a', 'bc']).
 */
export function hashContentParts(parts: Iterable<string>): string {
  const hash = createHash('sha256');

  for (const part of parts) {
    hash.update(String(Buffer.byteLength(part, 'utf8')));
    hash.update(':');
    hash.update(part);
    hash.update('\0');
  }

  return hash.digest('hex');
}
