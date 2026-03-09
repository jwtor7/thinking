import { describe, it, expect } from 'vitest';
import { BoundedArray } from './bounded-array.ts';

describe('BoundedArray', () => {
  it('stores and retrieves elements', () => {
    const arr = new BoundedArray<number>(5);
    arr.push(1);
    arr.push(2);
    arr.push(3);
    expect(arr.length).toBe(3);
    expect(arr.at(0)).toBe(1);
    expect(arr.at(1)).toBe(2);
    expect(arr.at(2)).toBe(3);
  });

  it('overwrites oldest when capacity exceeded', () => {
    const arr = new BoundedArray<number>(3);
    arr.push(1);
    arr.push(2);
    arr.push(3);
    arr.push(4); // overwrites 1
    expect(arr.length).toBe(3);
    expect(arr.at(0)).toBe(2);
    expect(arr.at(1)).toBe(3);
    expect(arr.at(2)).toBe(4);
  });

  it('wraps around correctly', () => {
    const arr = new BoundedArray<number>(3);
    for (let i = 1; i <= 6; i++) {
      arr.push(i);
    }
    // Should contain [4, 5, 6]
    expect(arr.toArray()).toEqual([4, 5, 6]);
    expect(arr.length).toBe(3);
  });

  it('iterates oldest to newest', () => {
    const arr = new BoundedArray<string>(3);
    arr.push('a');
    arr.push('b');
    arr.push('c');
    arr.push('d'); // wraps, now [b, c, d]
    const items = Array.from(arr);
    expect(items).toEqual(['b', 'c', 'd']);
  });

  it('supports for...of', () => {
    const arr = new BoundedArray<number>(5);
    arr.push(10);
    arr.push(20);
    const collected: number[] = [];
    for (const item of arr) {
      collected.push(item);
    }
    expect(collected).toEqual([10, 20]);
  });

  it('supports clear', () => {
    const arr = new BoundedArray<number>(5);
    arr.push(1);
    arr.push(2);
    arr.clear();
    expect(arr.length).toBe(0);
    expect(arr.toArray()).toEqual([]);
  });

  it('supports filter', () => {
    const arr = new BoundedArray<number>(5);
    arr.push(1);
    arr.push(2);
    arr.push(3);
    arr.push(4);
    const evens = arr.filter(n => n % 2 === 0);
    expect(evens).toEqual([2, 4]);
  });

  it('supports find', () => {
    const arr = new BoundedArray<number>(5);
    arr.push(1);
    arr.push(2);
    arr.push(3);
    expect(arr.find(n => n > 1)).toBe(2);
    expect(arr.find(n => n > 10)).toBeUndefined();
  });

  it('supports forEach', () => {
    const arr = new BoundedArray<number>(5);
    arr.push(10);
    arr.push(20);
    const collected: number[] = [];
    arr.forEach(item => collected.push(item));
    expect(collected).toEqual([10, 20]);
  });

  it('returns undefined for out-of-bounds at()', () => {
    const arr = new BoundedArray<number>(5);
    arr.push(1);
    expect(arr.at(-1)).toBeUndefined();
    expect(arr.at(1)).toBeUndefined();
    expect(arr.at(100)).toBeUndefined();
  });

  it('throws on invalid capacity', () => {
    expect(() => new BoundedArray(0)).toThrow(RangeError);
    expect(() => new BoundedArray(-1)).toThrow(RangeError);
  });

  it('handles capacity of 1', () => {
    const arr = new BoundedArray<string>(1);
    arr.push('a');
    arr.push('b');
    expect(arr.length).toBe(1);
    expect(arr.at(0)).toBe('b');
  });

  it('works correctly after partial fill then wrap', () => {
    const arr = new BoundedArray<number>(5);
    arr.push(1);
    arr.push(2);
    // Partial fill — no wrap yet
    expect(arr.toArray()).toEqual([1, 2]);
    // Now fill to capacity and beyond
    arr.push(3);
    arr.push(4);
    arr.push(5);
    arr.push(6); // wraps
    expect(arr.toArray()).toEqual([2, 3, 4, 5, 6]);
  });
});
