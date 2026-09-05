/**
 * Effects: the dependency graph.
 *
 * An effect is a function plus the set of (target, key) pairs it read the
 * last time it ran. Reads are recorded by whichever effect is running when
 * the reactive proxy's `get` / `has` / `ownKeys` traps fire; writes look the
 * (target, key) pair up and re-run, or schedule, every effect that read it.
 *
 * Ownership is the whole point. Dependencies belong to the effect, not to
 * the DOM element that happens to host it, so the same state object can feed
 * two different blocks, a computed, and a watcher at once, and each of them
 * wakes independently. Deps are also cleared at the start of every run, so an
 * effect that stops reading a key stops hearing about it.
 *
 * This module is pure: no DOM, no framework imports.
 */

/**
 * Stand-in key for "the shape of this object", i.e. which keys exist. Used by
 * `ownKeys` (Object.keys, for...in, spread) so adding or deleting a property
 * re-runs anything that iterated the object.
 */
export const ITERATE_KEY = Symbol('lego:iterate');

/** target -> Map<key, Set<effect>> */
const depMap = new WeakMap();

// A stack, not a single slot: computeds run nested inside the effect that
// read them, and b-for row effects run nested inside the loop effect.
const effectStack = [];
let activeEffect = null;

const cleanup = (effect) => {
  const deps = effect.deps;
  for (let i = 0; i < deps.length; i++) deps[i].delete(effect);
  deps.length = 0;
};

/**
 * Create an effect. Nothing runs until `run()` is called.
 *
 * @param {Function} fn - body; every reactive read inside becomes a dep
 * @param {Function} [scheduler] - called instead of `fn` when a dep changes.
 *   Receives the effect, so a scheduler can defer `run()` to a batch.
 * @returns {{run: Function, stop: Function, active: boolean, deps: Array}}
 */
export const createEffect = (fn, scheduler) => {
  const effect = {
    deps: [],
    active: true,
    scheduler,
    run() {
      if (!effect.active) return fn();
      cleanup(effect);
      effectStack.push(effect);
      activeEffect = effect;
      try {
        return fn();
      } finally {
        effectStack.pop();
        activeEffect = effectStack[effectStack.length - 1] || null;
      }
    },
    stop() {
      if (!effect.active) return;
      cleanup(effect);
      effect.active = false;
    }
  };
  return effect;
};

/** Record that the running effect read `target[key]`. No-op outside an effect. */
export const track = (target, key) => {
  if (!activeEffect) return;
  let keys = depMap.get(target);
  if (!keys) {
    keys = new Map();
    depMap.set(target, keys);
  }
  let subs = keys.get(key);
  if (!subs) {
    subs = new Set();
    keys.set(key, subs);
  }
  if (subs.has(activeEffect)) return;
  subs.add(activeEffect);
  activeEffect.deps.push(subs);
};

/**
 * Wake everything that read `target[key]`.
 *
 * @param {object} target - raw object that changed
 * @param {string|symbol} key - the property written or deleted
 * @param {'set'|'add'|'delete'} [type='set'] - structural changes ('add' and
 *   'delete') also wake iteration readers, and array length readers.
 */
export const trigger = (target, key, type = 'set') => {
  const keys = depMap.get(target);
  if (!keys) return;

  const pending = new Set();
  const collect = (k) => {
    const subs = keys.get(k);
    if (subs) subs.forEach(effect => pending.add(effect));
  };
  const isArray = Array.isArray(target);

  collect(key);
  if (type !== 'set') {
    collect(ITERATE_KEY);
    if (isArray) collect('length');
  }
  // A shorter array drops elements: anything that read a now-missing index
  // has to hear about it. `length` is already committed by the time we run.
  if (isArray && key === 'length') collectTruncated(keys, target.length, pending);

  // Copy-then-iterate: a scheduler is free to re-run, stop, or create effects.
  pending.forEach(effect => {
    if (effect === activeEffect || !effect.active) return;
    if (effect.scheduler) effect.scheduler(effect);
    else effect.run();
  });
};

const collectTruncated = (keys, length, pending) => {
  keys.forEach((subs, k) => {
    const index = typeof k === 'string' ? Number(k) : NaN;
    if (index >= length) subs.forEach(effect => pending.add(effect));
  });
};

/**
 * A lazy, cached derived value. Recomputes only when one of the things its
 * getter read has changed, and is itself trackable, so a binding that reads
 * `computed.value` re-runs when the computed's value goes stale.
 *
 * @param {Function} getter
 * @returns {{value: any, stop: Function}}
 */
export const computed = (getter) => {
  let value;
  let dirty = true;
  const box = {
    get value() {
      if (dirty) {
        value = runner.run();
        dirty = false;
      }
      track(box, 'value');
      return value;
    },
    stop() { runner.stop(); }
  };
  const runner = createEffect(getter, () => {
    if (dirty) return;
    dirty = true;
    trigger(box, 'value');
  });
  return box;
};

const readPath = (scope, path) => {
  const parts = path.split('.');
  let current = scope;
  for (let i = 0; i < parts.length; i++) {
    if (current == null) return current;
    current = current[parts[i]];
  }
  return current;
};

/**
 * Run `cb` when a watched value changes.
 *
 * @param {Function|string} source - getter called with `scope`, or a dotted
 *   key path resolved against `scope`
 * @param {Function} cb - receives (newValue, oldValue)
 * @param {{immediate?: boolean}} [options]
 * @param {object} [scope] - the object a path source reads from, and the
 *   argument a function source receives
 * @returns {Function} stop
 */
export const watch = (source, cb, options = {}, scope = null) => {
  const getter = typeof source === 'function'
    ? () => source(scope)
    : () => readPath(scope, source);

  const runner = createEffect(getter, () => {
    const next = runner.run();
    if (Object.is(next, oldValue)) return;
    const previous = oldValue;
    oldValue = next;
    cb(next, previous);
  });

  let oldValue = runner.run();
  if (options.immediate) cb(oldValue, undefined);
  return () => runner.stop();
};
