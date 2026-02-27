import { globalBatcher } from './batcher.js';
import { proxyCache } from './registry.js';
import { config, isNode } from '../utils/helpers.js';
import { isDbDescriptor, initializeDbProp, handleDbUpdate } from '../features/persistence.js';


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
    get: (t, k) => {
      const val = Reflect.get(t, k);
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
          batcher.add(el);
          handleDbUpdate(t, k, v);
        }
      }
      return r;
    },
    deleteProperty: (t, k) => {
      const r = Reflect.deleteProperty(t, k);
      batcher.add(el);
      return r;
    }
  };

  const p = new Proxy(obj, handler);
  proxyCache.set(obj, p);
  return p;
};
