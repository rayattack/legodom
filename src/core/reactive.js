import { globalBatcher } from './batcher.js';
import { proxyCache, privateData } from './registry.js';
import { config, isNode } from '../utils/helpers.js';
import { isDbDescriptor, initializeDbProp, handleDbUpdate } from '../features/persistence.js';
import { trackRead, getReaders } from './tracking.js';


/**
 * Creates a deeply reactive proxy for a state object.
 * 
 * - **Deep Reactivity:** Recursively wraps nested objects in proxies.
 * - **Subscriber Model:** Notifies the `el` (the html `block`) whenever a property changes.
 * - **Batching:** Uses the global batcher to deduplicate updates.
 * - **Persistence:** Automatically detects and hydrates `$db` descriptors.
 * 
 * @param {object} obj - The source of truth (state object)
 * @param {HTMLElement} el - The subscriber (html `block`) to re-render on change
 * @param {Batcher} [batcher=globalBatcher] - The update scheduler
 * @returns {Proxy} A reactive proxy of `obj`
 */
export const reactive = (obj, el, batcher = globalBatcher) => {
  if (obj === null || typeof obj !== 'object' || isNode(obj)) return obj;
  if (proxyCache.has(obj)) return proxyCache.get(obj);

  // Hydrate $db descriptors
  for (const k in obj) {
    const propDesc = Object.getOwnPropertyDescriptor(obj, k);
    if (propDesc && propDesc.get) continue; // Skip getters to avoid execution

    const desc = obj[k];
    if (isDbDescriptor(desc)) {
      initializeDbProp(obj, k, desc, el, batcher);
    }
  }

  const handler = {
    get: (t, k, receiver) => {
      // Record (target, key) read for the currently-evaluating binding so
      // future writes to this key only re-run dependent bindings.
      trackRead(el, t, k);
      // Pass receiver so getters see `this === proxy` — that way `this.x`
      // inside a getter routes through the proxy's `get` and records `x`
      // as a dep too. Without this, computed properties (getters reading
      // other state) appear to depend only on themselves and the renderer
      // would fall back to a full pass on every mutation.
      const val = Reflect.get(t, k, receiver);
      if (val !== null && typeof val === 'object' && !isNode(val)) {
        return reactive(val, el, batcher);
      }
      return val;
    },
    set: (t, k, v, receiver) => {
      if (k === '__proto__' || k === 'constructor' || k === 'prototype') {
        console.warn(`[Lego] Blocked setting dangerous property: "${k}"`);
        return true;
      }
      const old = t[k];
      if (config.debug && old !== v) console.log('[Lego Trace] Reactive SET:', k, 'Old:', old, 'New:', v, 'Target:', t);

      const isSelf = receiver === proxyCache.get(t);
      const isOwnProp = Object.prototype.hasOwnProperty.call(t, k);

      // When setting through a child scope (e.g., Object.create(state) in b-for)
      // for a property owned by the target, write to the target directly so the
      // actual state is modified (not just the ephemeral child scope).
      const r = (!isSelf && isOwnProp)
        ? Reflect.set(t, k, v)
        : Reflect.set(t, k, v, receiver);

      if (isSelf || isOwnProp) {
        if (old !== v) {
          // Fine-grained scheduling: tag dirty bindings so the next render
          // only re-runs them. If no readers were tracked for (t, k), the
          // batcher still runs render(el), which falls back to a full pass.
          const readers = getReaders(el, t, k);
          if (readers && readers.size > 0) {
            const data = privateData.get(el);
            if (data) {
              if (!data.dirtyBindings) data.dirtyBindings = new Set();
              readers.forEach(b => data.dirtyBindings.add(b));
            }
          }
          // Pass the changed key as a second arg so the globals batcher
          // can wake only key-specific subscribers (audit fix #20). The
          // default globalBatcher.add(el) ignores the extra argument.
          batcher.add(el, k);
          handleDbUpdate(t, k, v);
        }
      }
      return r;
    },
    deleteProperty: (t, k) => {
      // Mark all bindings reading this key dirty (deletion is structural —
      // many readers may need to re-run); simplest sound option is a full
      // re-render via the batcher fallback.
      const r = Reflect.deleteProperty(t, k);
      const data = privateData.get(el);
      if (data) data.dirtyBindings = null; // force full pass
      batcher.add(el);
      return r;
    }
  };

  const p = new Proxy(obj, handler);
  proxyCache.set(obj, p);
  return p;
};
