import { config } from '../utils/helpers.js';
import { globalBatcher } from '../core/batcher.js';

const dbBindings = new Map(); // storageKey -> Set<{target, prop, el, batcher}>
const dbTimers = new Map();   // storageKey -> timerId
const dbMetadata = new WeakMap(); // target -> { prop: { key, debounce } }
const storageKeys = new Map(); // key -> { timestamp, size }

// Storage quota management (FIFO eviction)
const evictOldestKeys = (bytesNeeded) => {
  const entries = Array.from(storageKeys.entries())
    .filter(([key]) => key.startsWith('lego:')) // Only evict Lego keys
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

      // Track for eviction (prefix with 'lego:' for identification)
      const storageKey = key.startsWith('lego:') ? key : `lego:${key}`;
      storageKeys.set(storageKey, {
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

            const storageKey = key.startsWith('lego:') ? key : `lego:${key}`;
            storageKeys.set(storageKey, {
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
    save(value, debounce = 0) {
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
        storageKeys.delete(key.startsWith('lego:') ? key : `lego:${key}`);

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
  const meta = dbMetadata.get(target);
  if (meta && meta[prop]) {
    const key = meta[prop].key;
    scheduleSave(key, value, meta[prop].debounce);

    // Sync other local bindings immediately (Same Tab)
    if (dbBindings.has(key)) {
      dbBindings.get(key).forEach(({ target: t, prop: p, el, batcher }) => {
        if (t !== target) { // Don't notify self
          t[p] = value;
          if (el && batcher) batcher.add(el);
        }
      });
    }
  }
};

export const initCrossTabSync = () => {
  if (typeof window !== 'undefined') {
    window.addEventListener('storage', (e) => {
      if (!e.key || !dbBindings.has(e.key)) return;
      try {
        const newValue = JSON.parse(e.newValue);
        dbBindings.get(e.key).forEach(({ target, prop, el, batcher }) => {
          target[prop] = newValue; // Update raw data
          if (el && batcher) batcher.add(el); // Trigger re-render
        });
      } catch (e) {
        console.warn(`[Lego] Cross-tab sync error:`, e);
      }
    });
  }
};
