import { describe, it, expect } from 'vitest';
import { hashContent, hashContentParts } from './change-detection.ts';

describe('hashContent', () => {
  it('returns the same hash for identical content', () => {
    const value = '# plan\n\ncontent';
    expect(hashContent(value)).toBe(hashContent(value));
  });

  it('returns different hashes for different content', () => {
    expect(hashContent('alpha')).not.toBe(hashContent('beta'));
  });
});

describe('hashContentParts', () => {
  it('is deterministic for the same ordered parts', () => {
    const parts = ['file-a.json', '{"id":"1"}', 'file-b.json', '{"id":"2"}'];
    expect(hashContentParts(parts)).toBe(hashContentParts(parts));
  });

  it('changes when part order changes', () => {
    const aThenB = ['a.json', '{"id":"a"}', 'b.json', '{"id":"b"}'];
    const bThenA = ['b.json', '{"id":"b"}', 'a.json', '{"id":"a"}'];
    expect(hashContentParts(aThenB)).not.toBe(hashContentParts(bThenA));
  });

  it('avoids concatenation collisions between part boundaries', () => {
    const splitOne = ['ab', 'c'];
    const splitTwo = ['a', 'bc'];
    expect(hashContentParts(splitOne)).not.toBe(hashContentParts(splitTwo));
  });

  it('supports empty inputs', () => {
    expect(typeof hashContentParts([])).toBe('string');
    expect(hashContentParts([])).toHaveLength(64);
  });
});
