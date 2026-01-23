import { globalBatcher } from './batcher.js';
import { proxyCache } from './registry.js';
import { config, isNode } from '../utils/helpers.js';
import { isDbDescriptor, initializeDbProp, handleDbUpdate } from '../features/persistence.js';

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
      // FIX: Pass receiver to Reflect.set to ensure we set property on the correct object 
      // (e.g. localScope inheriting from state) instead of forcing it onto state.
      const old = t[k];
      if (config.debug && old !== v) console.log('[Lego Trace] Reactive SET:', k, 'Old:', old, 'New:', v, 'Target:', t);
      const r = Reflect.set(t, k, v, receiver);

      // Only trigger reactivity if the update was effectively on THIS proxy
      // If receiver is a child object (like localScope in b-for), we don't want to trigger parent updates
      const isSelf = receiver === proxyCache.get(t);
      if (config.debug) {
        // Check debug info?
      }
      if (isSelf) {
        // Use previously captured 'old' value because 't[k]' is already updated by Reflect.set
        if (old !== v) {
          batcher.add(el);
          // Check for DB binding
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
