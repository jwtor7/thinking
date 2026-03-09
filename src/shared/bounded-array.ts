/**
 * A fixed-capacity ring buffer array.
 *
 * Supports O(1) push. When capacity is exceeded, the oldest element
 * is silently overwritten. Iteration yields elements in insertion order
 * (oldest to newest).
 */
export class BoundedArray<T> {
  private readonly buffer: (T | undefined)[];
  private head = 0; // Next write position
  private count = 0;
  readonly capacity: number;

  constructor(capacity: number) {
    if (capacity < 1) throw new RangeError('BoundedArray capacity must be >= 1');
    this.capacity = capacity;
    this.buffer = new Array(capacity);
  }

  get length(): number {
    return this.count;
  }

  /**
   * Push an element. If at capacity, overwrites the oldest.
   */
  push(item: T): void {
    this.buffer[this.head] = item;
    this.head = (this.head + 1) % this.capacity;
    if (this.count < this.capacity) {
      this.count++;
    }
  }

  /**
   * Get element at logical index (0 = oldest).
   */
  at(index: number): T | undefined {
    if (index < 0 || index >= this.count) return undefined;
    const start = this.count < this.capacity ? 0 : this.head;
    const realIndex = (start + index) % this.capacity;
    return this.buffer[realIndex];
  }

  /**
   * Clear all elements.
   */
  clear(): void {
    this.buffer.fill(undefined);
    this.head = 0;
    this.count = 0;
  }

  /**
   * Iterate from oldest to newest.
   */
  *[Symbol.iterator](): Iterator<T> {
    const start = this.count < this.capacity ? 0 : this.head;
    for (let i = 0; i < this.count; i++) {
      yield this.buffer[(start + i) % this.capacity] as T;
    }
  }

  /**
   * Convert to a plain array (oldest to newest).
   */
  toArray(): T[] {
    return Array.from(this);
  }

  /**
   * Filter elements, returning a plain array.
   */
  filter(predicate: (item: T) => boolean): T[] {
    const result: T[] = [];
    for (const item of this) {
      if (predicate(item)) result.push(item);
    }
    return result;
  }

  /**
   * Find the first element matching a predicate.
   */
  find(predicate: (item: T) => boolean): T | undefined {
    for (const item of this) {
      if (predicate(item)) return item;
    }
    return undefined;
  }

  /**
   * Execute a callback for each element (oldest to newest).
   */
  forEach(callback: (item: T, index: number) => void): void {
    let i = 0;
    for (const item of this) {
      callback(item, i++);
    }
  }
}
