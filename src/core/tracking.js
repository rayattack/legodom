/**
 * Per-binding dependency tracking. Lets the reactive proxy schedule only the
 * bindings that actually read a mutated key, instead of re-running every
 * binding on the block.
 *
 * Wiring:
 *   - Before executing a binding, the renderer calls `setTracking(b, el)`
 *     so any subsequent proxy `get` is recorded against that binding.
 *   - Proxy `get` calls `trackRead(el, target, key)`.
 *   - Proxy `set` calls `getReaders(el, target, key)` and adds returned
 *     bindings to `data.dirtyBindings` on the element.
 *   - Renderer, on next tick, runs only the dirty bindings if the set is
 *     non-empty; otherwise falls back to a full pass (initial render or
 *     untracked path).
 *
 * Design notes:
 *   - Deps are stored as Map<el, Map<target, Map<key, Set<binding>>>>.
 *     Outer container is a WeakMap so element-keyed entries collect with
 *     the element. Inner targets are held strongly — minor leak risk if
 *     state objects are swapped wholesale, but bounded by per-block
 *     binding count and acceptable for v1. (#16 follow-up: WeakMap inner.)
 *   - Deps grow monotonically per binding (we don't clear stale reads
 *     between renders). Worst case: a binding re-runs slightly more often
 *     than strictly needed if its read set shrinks over time. Never less.
 *   - When the renderer can't identify a single read source (e.g. a binding
 *     reads through a function call that bypasses the proxy), `dirtyBindings`
 *     is left empty for that key — the existing whole-block fallback in
 *     reactive.set keeps correctness.
 */

const elDeps = new WeakMap();

let _currentBinding = null;
let _currentEl = null;

export const setTracking = (binding, el) => {
  _currentBinding = binding;
  _currentEl = el;
};

export const clearTracking = () => {
  _currentBinding = null;
  _currentEl = null;
};

export const trackRead = (el, target, key) => {
  if (!_currentBinding || _currentEl !== el) return;
  let m1 = elDeps.get(el);
  if (!m1) { m1 = new Map(); elDeps.set(el, m1); }
  let m2 = m1.get(target);
  if (!m2) { m2 = new Map(); m1.set(target, m2); }
  let s = m2.get(key);
  if (!s) { s = new Set(); m2.set(key, s); }
  s.add(_currentBinding);
};

export const getReaders = (el, target, key) => {
  const m1 = elDeps.get(el);
  if (!m1) return null;
  const m2 = m1.get(target);
  if (!m2) return null;
  return m2.get(key) || null;
};

export const clearElDeps = (el) => elDeps.delete(el);
