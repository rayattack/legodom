import { proxyCache } from './registry.js';
import { config, isReactiveTarget } from '../utils/helpers.js';
import { isDbDescriptor, initializeDbProp, handleDbUpdate } from '../features/persistence.js';
import { track, trigger, ITERATE_KEY } from './effect.js';

/**
 * Creates a deeply reactive proxy for a state object.
 *
 * - **Deep reactivity:** nested objects and arrays are wrapped on first read.
 * - **Effect-owned tracking:** every read is recorded against the effect that
 *   is running (a binding, a computed, a watcher). The proxy knows nothing
 *   about elements or the batcher, so one object can feed any number of
 *   blocks and each of them wakes on its own.
 * - **Persistence:** `$db` descriptors are hydrated once, up front.
 *
 * @param {object} obj - The source of truth (state object)
 * @param {HTMLElement} [el] - Owner used only to scope `$db` binding cleanup
 * @returns {Proxy} A reactive proxy of `obj`
 */
export const reactive = (obj, el) => {
  // Arrays, plain objects and ordinary class instances are safe to wrap.
  // Built-ins with internal slots (Set/Map/Date/Promise/RegExp/typed arrays
  // and friends) are returned raw so their methods keep a compatible
  // receiver. See isReactiveTarget.
  if (!isReactiveTarget(obj)) return obj;
  if (proxyCache.has(obj)) return proxyCache.get(obj);

  // Hydrate $db descriptors
  for (const k in obj) {
    const propDesc = Object.getOwnPropertyDescriptor(obj, k);
    if (propDesc && propDesc.get) continue; // Skip getters to avoid execution

    const desc = obj[k];
    if (isDbDescriptor(desc)) {
      initializeDbProp(obj, k, desc, el);
    }
  }

  const handler = {
    get: (t, k, receiver) => {
      track(t, k);
      // Pass receiver so getters see `this === proxy`: `this.x` inside a
      // getter then routes through this same trap and is recorded as a dep
      // of whatever is running.
      const val = Reflect.get(t, k, receiver);
      // Same gate as above: nested built-ins are handed back untouched so
      // `state.tags.size` / `state.when.getTime()` keep working.
      if (isReactiveTarget(val)) return reactive(val, el);
      return val;
    },
    // The expression compiler resolves every identifier with `name in scope`
    // before reading it, so `has` is half of what makes templates reactive.
    // It also covers author code writing `'key' in obj`.
    has: (t, k) => {
      track(t, k);
      return Reflect.has(t, k);
    },
    ownKeys: (t) => {
      track(t, ITERATE_KEY);
      return Reflect.ownKeys(t);
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

      // A write that landed on a child scope rather than on this target is
      // not a state change: the loop scope owns it now.
      if (!isSelf && !isOwnProp) return r;

      const added = !isOwnProp;
      if (!added && Object.is(old, v)) return r;
      trigger(t, k, added ? 'add' : 'set');
      handleDbUpdate(t, k, v);
      return r;
    },
    deleteProperty: (t, k) => {
      const had = Object.prototype.hasOwnProperty.call(t, k);
      const r = Reflect.deleteProperty(t, k);
      if (had && r) trigger(t, k, 'delete');
      return r;
    }
  };

  const p = new Proxy(obj, handler);
  proxyCache.set(obj, p);
  return p;
};
