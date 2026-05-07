import { config } from '../utils/helpers.js';
import { globalBatcher } from '../core/batcher.js';

const dbBindings = new Map(); // storageKey -> Set<{target, prop, el, batcher}>
const dbTimers = new Map();   // storageKey -> timerId
const dbMetadata = new WeakMap(); // target -> { prop: { key, debounce } }
const storageKeys = new Map(); // key -> { timestamp, size }

// Re-entrancy guard for cross-tab and inter-binding sync.
// When we propagate a $db value to other bindings (or apply a value
// received from another tab), the proxy `set` handler would otherwise
// call handleDbUpdate -> scheduleSave again, causing a write-back loop
// across tabs. While this flag is set, handleDbUpdate is a no-op.
let _suppressDbWrite = false;

// Storage quota management (FIFO eviction).
// `storageKeys` is a private tracker — every entry was written by us via
// scheduleSave, so the keys here are by definition Lego-managed. They are
// stored under the same name used in localStorage (no prefix) so eviction
// can call removeItem(key) directly.
const evictOldestKeys = (bytesNeeded) => {
  const entries = Array.from(storageKeys.entries())
    .sort((a, b) => a[1].timestamp - b[1].timestamp); // Oldest first

  let freedBytes = 0;
  const evicted = [];

  for (const [key, meta] of entries) {
    if (freedBytes >= bytesNeeded) break;

    try {
      localStorage.removeItem(key);
      freedBytes += meta.size;
      evicted.push(key);
      storageKeys.delete(key);
    } catch (e) {
      console.error(`[Lego] Failed to evict ${key}:`, e);
    }
  }

  return evicted;
};

const scheduleSave = (key, value, debounce) => {
  if (config.debug) console.log('[Lego Trace] scheduleSave', key, value, debounce);
  if (dbTimers.has(key)) clearTimeout(dbTimers.get(key));
  const save = () => {
    try {
      const serialized = JSON.stringify(value);
      const sizeBytes = new Blob([serialized]).size;

      // Attempt write
      localStorage.setItem(key, serialized);

      // Track for eviction under the same name used in localStorage.
      storageKeys.set(key, {
        timestamp: Date.now(),
        size: sizeBytes
      });

      dbTimers.delete(key);
    } catch (e) {
      if (e.name === 'QuotaExceededError') {
        console.warn(`[Lego] Storage quota exceeded for key: ${key}`);

        // Attempt eviction and retry
        try {
          const serialized = JSON.stringify(value);
          const sizeBytes = new Blob([serialized]).size;
          const evicted = evictOldestKeys(sizeBytes * 2); // Free 2x needed space

          if (evicted.length > 0) {
            if (config.debug) console.log(`[Lego] Evicted ${evicted.length} old keys, retrying save`);
            localStorage.setItem(key, serialized);

            storageKeys.set(key, {
              timestamp: Date.now(),
              size: sizeBytes
            });
          } else {
            config.onError(new Error(`Storage quota exceeded and no keys available for eviction`), 'quota', key);
          }
        } catch (retryErr) {
          config.onError(new Error(`Critical: Could not save ${key} even after eviction`), 'quota-critical', key);
        }
      } else {
        console.error(`[Lego] Storage Error (${key}):`, e);
      }
    }
  };
  if (debounce > 0) {
    dbTimers.set(key, setTimeout(save, debounce));
  } else {
    save();
  }
};

export const dbFactory = (key) => {
  const descriptor = {
    __type: 'lego-db',
    key,
    _default: undefined,
    _debounce: 0,

    // Initialization-time methods (return this for chaining)
    default(v) { this._default = v; return this; },
    debounce(ms) { this._debounce = ms; return this; },

    // Runtime methods (return values/promises)
    set(value, debounce = 0) {
      scheduleSave(key, value, debounce);

      // Trigger reactivity for all bindings
      if (dbBindings.has(key)) {
        dbBindings.get(key).forEach(({ target, prop, el, batcher }) => {
          target[prop] = value;
          if (el && batcher) batcher.add(el);
        });
      }

      return value;
    },

    get() {
      try {
        const item = localStorage.getItem(key);
        return item !== null ? JSON.parse(item) : null;
      } catch (e) {
        console.warn(`[Lego] Failed to get localStorage value for key "${key}":`, e);
        return null;
      }
    },

    delete() {
      try {
        localStorage.removeItem(key);
        storageKeys.delete(key);

        // Notify all bindings
        if (dbBindings.has(key)) {
          dbBindings.get(key).forEach(({ target, prop, el, batcher }) => {
            target[prop] = null;
            if (el && batcher) batcher.add(el);
          });
        }
        return true;
      } catch (e) {
        console.error(`[Lego] Failed to delete localStorage key "${key}":`, e);
        return false;
      }
    }
  };

  return descriptor;
};

export const isDbDescriptor = (desc) => desc && desc.__type === 'lego-db';

export const initializeDbProp = (obj, k, desc, el, batcher) => {
  if (config.debug) console.log('[Lego Trace] Reactive DB Init:', k, desc);

  let val = desc._default;
  try {
    const item = localStorage.getItem(desc.key);
    if (item !== null) val = JSON.parse(item);
  } catch (e) {
    console.warn(`[Lego] Failed to parse localStorage value for key "${desc.key}":`, e);
  }

  obj[k] = val; // Replace descriptor with value

  // Register metadata
  if (!dbMetadata.has(obj)) dbMetadata.set(obj, {});
  dbMetadata.get(obj)[k] = { key: desc.key, debounce: desc._debounce };
  if (config.debug) console.log('[Lego Trace] DB Metadata Set:', k, dbMetadata.get(obj)[k]);

  // Register for cross-tab updates
  if (!dbBindings.has(desc.key)) dbBindings.set(desc.key, new Set());
  dbBindings.get(desc.key).add({ target: obj, prop: k, el, batcher });
};

export const handleDbUpdate = (target, prop, value) => {
  if (_suppressDbWrite) return;
  const meta = dbMetadata.get(target);
  if (meta && meta[prop]) {
    const key = meta[prop].key;
    scheduleSave(key, value, meta[prop].debounce);

    // Sync other local bindings immediately (Same Tab).
    // Suppress recursion: each `t[p] = value` runs through the proxy
    // and would re-enter handleDbUpdate.
    if (dbBindings.has(key)) {
      _suppressDbWrite = true;
      try {
        dbBindings.get(key).forEach(({ target: t, prop: p, el, batcher }) => {
          if (t !== target) {
            t[p] = value;
            if (el && batcher) batcher.add(el);
          }
        });
      } finally {
        _suppressDbWrite = false;
      }
    }
  }
};

export const cleanupDbBindings = (el) => {
  dbBindings.forEach((bindings) => {
    bindings.forEach(entry => {
      if (entry.el === el) bindings.delete(entry);
    });
  });
};

// Idempotent: HMR / tests / repeated Lego.init() calls would otherwise stack
// fresh `storage` listeners every time, fanning each event out N×. The
// handler closes over module-level state (dbBindings, _suppressDbWrite), so
// one binding is enough — re-running init does not need a fresh handler.
let _crossTabBound = false;

export const initCrossTabSync = () => {
  if (typeof window === 'undefined') return;
  if (_crossTabBound) return;
  _crossTabBound = true;

  window.addEventListener('storage', (e) => {
    if (!e.key || !dbBindings.has(e.key)) return;
    try {
      const newValue = e.newValue === null ? null : JSON.parse(e.newValue);
      // Suppress writes: the proxy `set` would otherwise re-save the value
      // we just received, which fires a storage event in the originating
      // tab, which fires this handler again -> ping-pong write loop.
      _suppressDbWrite = true;
      try {
        dbBindings.get(e.key).forEach(({ target, prop, el, batcher }) => {
          target[prop] = newValue;
          if (el && batcher) batcher.add(el);
        });
      } finally {
        _suppressDbWrite = false;
      }
    } catch (err) {
      console.warn(`[Lego] Cross-tab sync error:`, err);
    }
  });
};
