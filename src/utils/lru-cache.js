// LRU Cache for compiled expressions (prevents unbounded memory growth)
export class LRUCache {
  constructor(limit = 1000) {
    this.limit = limit;
    this.cache = new Map();
  }

  get(key) {
    if (!this.cache.has(key)) return undefined;

    // Move to end (most recently used) by deleting and re-inserting
    const value = this.cache.get(key);
    this.cache.delete(key);
    this.cache.set(key, value);
    return value;
  }

  set(key, value) {
    // If key exists, delete it first so we can re-insert at end
    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= this.limit) {
      // Evict oldest (first item in Map)
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }

    this.cache.set(key, value);
  }

  get size() {
    return this.cache.size;
  }

  clear() {
    this.cache.clear();
  }
}
