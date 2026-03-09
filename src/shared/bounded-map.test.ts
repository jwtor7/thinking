import { describe, it, expect, vi } from 'vitest';
import { BoundedMap } from './bounded-map.ts';

describe('BoundedMap', () => {
  it('stores and retrieves values', () => {
    const map = new BoundedMap<string, number>(5);
    map.set('a', 1);
    map.set('b', 2);
    expect(map.get('a')).toBe(1);
    expect(map.get('b')).toBe(2);
    expect(map.size).toBe(2);
  });

  it('evicts oldest entry when maxSize exceeded', () => {
    const map = new BoundedMap<string, number>(3);
    map.set('a', 1);
    map.set('b', 2);
    map.set('c', 3);
    map.set('d', 4); // should evict 'a'
    expect(map.has('a')).toBe(false);
    expect(map.get('b')).toBe(2);
    expect(map.size).toBe(3);
  });

  it('promotes accessed keys (LRU)', () => {
    const map = new BoundedMap<string, number>(3);
    map.set('a', 1);
    map.set('b', 2);
    map.set('c', 3);
    map.get('a'); // promote 'a' — now 'b' is oldest
    map.set('d', 4); // should evict 'b'
    expect(map.has('a')).toBe(true);
    expect(map.has('b')).toBe(false);
    expect(map.has('c')).toBe(true);
    expect(map.has('d')).toBe(true);
  });

  it('promotes updated keys', () => {
    const map = new BoundedMap<string, number>(3);
    map.set('a', 1);
    map.set('b', 2);
    map.set('c', 3);
    map.set('a', 10); // promote 'a' — now 'b' is oldest
    map.set('d', 4); // should evict 'b'
    expect(map.get('a')).toBe(10);
    expect(map.has('b')).toBe(false);
  });

  it('calls onEvict callback', () => {
    const onEvict = vi.fn();
    const map = new BoundedMap<string, number>(2, onEvict);
    map.set('a', 1);
    map.set('b', 2);
    map.set('c', 3); // evicts 'a'
    expect(onEvict).toHaveBeenCalledWith('a', 1);
  });

  it('iterates in insertion order', () => {
    const map = new BoundedMap<string, number>(5);
    map.set('a', 1);
    map.set('b', 2);
    map.set('c', 3);
    const keys = Array.from(map.keys());
    expect(keys).toEqual(['a', 'b', 'c']);
  });

  it('supports delete', () => {
    const map = new BoundedMap<string, number>(5);
    map.set('a', 1);
    map.set('b', 2);
    expect(map.delete('a')).toBe(true);
    expect(map.has('a')).toBe(false);
    expect(map.size).toBe(1);
  });

  it('supports clear', () => {
    const map = new BoundedMap<string, number>(5);
    map.set('a', 1);
    map.set('b', 2);
    map.clear();
    expect(map.size).toBe(0);
  });

  it('supports forEach', () => {
    const map = new BoundedMap<string, number>(5);
    map.set('a', 1);
    map.set('b', 2);
    const entries: [string, number][] = [];
    map.forEach((v, k) => entries.push([k, v]));
    expect(entries).toEqual([['a', 1], ['b', 2]]);
  });

  it('supports entries iteration', () => {
    const map = new BoundedMap<string, number>(5);
    map.set('x', 10);
    const entries = Array.from(map.entries());
    expect(entries).toEqual([['x', 10]]);
  });

  it('supports for...of', () => {
    const map = new BoundedMap<string, number>(5);
    map.set('a', 1);
    const entries: [string, number][] = [];
    for (const [k, v] of map) {
      entries.push([k, v]);
    }
    expect(entries).toEqual([['a', 1]]);
  });

  it('throws on invalid maxSize', () => {
    expect(() => new BoundedMap(0)).toThrow(RangeError);
    expect(() => new BoundedMap(-1)).toThrow(RangeError);
  });

  it('handles maxSize of 1', () => {
    const map = new BoundedMap<string, number>(1);
    map.set('a', 1);
    map.set('b', 2);
    expect(map.size).toBe(1);
    expect(map.has('a')).toBe(false);
    expect(map.get('b')).toBe(2);
  });

  it('returns undefined for missing keys without side effects', () => {
    const map = new BoundedMap<string, number>(3);
    map.set('a', 1);
    map.set('b', 2);
    expect(map.get('missing')).toBeUndefined();
    // No re-ordering should have happened
    map.set('c', 3);
    map.set('d', 4); // evicts 'a' (still oldest)
    expect(map.has('a')).toBe(false);
    expect(map.has('b')).toBe(true);
  });
});
