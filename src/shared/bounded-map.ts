/**
 * A Map with a maximum size and LRU eviction.
 *
 * When the map exceeds `maxSize`, the least-recently-used entry is evicted.
 * "Used" means accessed via `get()` or inserted/updated via `set()`.
 *
 * Implements the full Map interface so it can be a drop-in replacement.
 */
export class BoundedMap<K, V> implements Map<K, V> {
  private readonly map = new Map<K, V>();
  readonly maxSize: number;
  private readonly onEvict?: (key: K, value: V) => void;

  constructor(maxSize: number, onEvict?: (key: K, value: V) => void) {
    if (maxSize < 1) throw new RangeError('BoundedMap maxSize must be >= 1');
    this.maxSize = maxSize;
    this.onEvict = onEvict;
  }

  get size(): number {
    return this.map.size;
  }

  get [Symbol.toStringTag](): string {
    return 'BoundedMap';
  }

  has(key: K): boolean {
    return this.map.has(key);
  }

  /**
   * Get a value and promote it to most-recently-used.
   */
  get(key: K): V | undefined {
    const value = this.map.get(key);
    if (value !== undefined) {
      // Re-insert to move to end (most recent)
      this.map.delete(key);
      this.map.set(key, value);
    }
    return value;
  }

  /**
   * Set a value. If the key exists, it's promoted to most-recently-used.
   * If the map is full, the least-recently-used entry is evicted.
   */
  set(key: K, value: V): this {
    // If key exists, delete first to reset insertion order
    if (this.map.has(key)) {
      this.map.delete(key);
    } else if (this.map.size >= this.maxSize) {
      // Evict the oldest (first) entry
      const oldest = this.map.keys().next().value;
      if (oldest !== undefined) {
        const evictedValue = this.map.get(oldest)!;
        this.map.delete(oldest);
        this.onEvict?.(oldest, evictedValue);
      }
    }
    this.map.set(key, value);
    return this;
  }

  delete(key: K): boolean {
    return this.map.delete(key);
  }

  clear(): void {
    this.map.clear();
  }

  forEach(callbackfn: (value: V, key: K, map: Map<K, V>) => void, thisArg?: unknown): void {
    this.map.forEach((value, key) => callbackfn.call(thisArg, value, key, this));
  }

  keys(): MapIterator<K> {
    return this.map.keys();
  }

  values(): MapIterator<V> {
    return this.map.values();
  }

  entries(): MapIterator<[K, V]> {
    return this.map.entries();
  }

  [Symbol.iterator](): MapIterator<[K, V]> {
    return this.map[Symbol.iterator]();
  }
}
