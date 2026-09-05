import { config } from '../utils/helpers.js';
import { proxyCache } from '../core/registry.js';

const dbBindings = new Map(); // storageKey -> Set<{target, prop}>
const dbTimers = new Map();   // storageKey -> timerId
const dbMetadata = new WeakMap(); // target -> { prop: { key, debounce } }
// Audit fix #31: reverse index so cleanupDbBindings(el) is O(entries-for-el)
// instead of O(total-entries × keys). Each value carries the storage key
// alongside the entry so we can locate the entry's set in O(1).
const dbBindingsByEl = new WeakMap(); // el -> Set<{ key, entry }>

// Re-entrancy guard for cross-tab and inter-binding sync.
// When we propagate a $db value to other bindings (or apply a value
// received from another tab), the proxy `set` handler would otherwise
// call handleDbUpdate -> scheduleSave again, causing a write-back loop
// across tabs. While this flag is set, handleDbUpdate is a no-op.
let _suppressDbWrite = false;

// Storage quota handling.
//
// This used to free space by deleting the oldest keys Lego had written.
// That was unsafe on two counts: the tracker only survived for the lifetime
// of the page (so after a reload nothing was evictable and the write failed
// anyway), and everything it did delete was real, user-visible persisted
// state that some other part of the app was relying on. Silently destroying
// one feature's data to make room for another's is never the right default.
// The quota is now reported and the write is abandoned; the application
// decides what to shed.
const scheduleSave = (key, value, debounce) => {
  if (config.debug) console.log('[Lego Trace] scheduleSave', key, value, debounce);
  if (dbTimers.has(key)) clearTimeout(dbTimers.get(key));
  const save = () => {
    dbTimers.delete(key);
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
      if (e.name === 'QuotaExceededError') {
        console.warn(`[Lego] Storage quota exceeded for key: ${key}`);
        config.onError(e, 'quota', key);
        return;
      }
      console.error(`[Lego] Storage Error (${key}):`, e);
    }
  };
  if (debounce > 0) {
    dbTimers.set(key, setTimeout(save, debounce));
  } else {
    save();
  }
};

/**
 * Push a value into a bound state object through its reactive proxy.
 *
 * Writing to the raw target would be invisible: nothing would re-render, and
 * the old code papered over that by hand-scheduling the element it happened
 * to remember. Going through the proxy means every effect that reads the
 * property wakes up, no matter which block, computed or watcher owns it.
 * Before the object is ever read there is no proxy yet, and the raw write is
 * the correct one.
 */
const writeThrough = (target, prop, value) => {
  const holder = proxyCache.get(target) || target;
  holder[prop] = value;
};

/**
 * Fan a value out to every binding on a storage key. `handleDbUpdate` is
 * suppressed for the duration: these writes are the propagation, and letting
 * them re-enter would save the same value once per binding and, across tabs,
 * ping-pong forever.
 */
const syncBindings = (key, value, exclude = null) => {
  const entries = dbBindings.get(key);
  if (!entries) return;
  const wasSuppressed = _suppressDbWrite;
  _suppressDbWrite = true;
  try {
    entries.forEach(({ target, prop }) => {
      if (target !== exclude) writeThrough(target, prop, value);
    });
  } finally {
    _suppressDbWrite = wasSuppressed;
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
      syncBindings(key, value);
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
        syncBindings(key, null);
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

export const initializeDbProp = (obj, k, desc, el) => {
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
  // `el` is kept only so cleanupDbBindings can find this entry again; the
  // write path reaches the element through the proxy, not through here.
  const entry = { target: obj, prop: k };
  dbBindings.get(desc.key).add(entry);
  if (el) {
    if (!dbBindingsByEl.has(el)) dbBindingsByEl.set(el, new Set());
    dbBindingsByEl.get(el).add({ key: desc.key, entry });
  }
};

export const handleDbUpdate = (target, prop, value) => {
  if (_suppressDbWrite) return;
  const meta = dbMetadata.get(target);
  if (!meta || !meta[prop]) return;
  const key = meta[prop].key;
  scheduleSave(key, value, meta[prop].debounce);
  // Sync the other bindings on this key in the same tab. The originating
  // target is skipped: it already holds the value.
  syncBindings(key, value, target);
};

export const cleanupDbBindings = (el) => {
  // Audit fix #31: O(entries-for-this-el) via the reverse index, not
  // O(total-bindings) walking every key.
  const refs = dbBindingsByEl.get(el);
  if (!refs) return;
  refs.forEach(({ key, entry }) => {
    const set = dbBindings.get(key);
    if (set) set.delete(entry);
  });
  dbBindingsByEl.delete(el);
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
      syncBindings(e.key, newValue);
    } catch (err) {
      console.warn(`[Lego] Cross-tab sync error:`, err);
    }
  });
};
