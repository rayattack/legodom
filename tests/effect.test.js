import { describe, it, expect, vi } from 'vitest';
import { createEffect, computed, watch, track, trigger, ITERATE_KEY } from '../src/core/effect.js';

/**
 * Unit tests for the effect core. No DOM, no bundle: these exercise
 * src/core/effect.js directly so a failure points at the graph itself rather
 * than at the renderer wired on top of it.
 *
 * The proxy is not involved either, so reads are simulated by calling
 * track(target, key) and writes by calling trigger(target, key, type). That
 * is exactly the contract src/core/reactive.js implements.
 */

describe('createEffect', () => {
  it('runs the body and records reads as dependencies', () => {
    const state = { a: 1 };
    let runs = 0;
    const effect = createEffect(() => {
      runs++;
      track(state, 'a');
    });

    effect.run();
    expect(runs).toBe(1);

    trigger(state, 'a');
    expect(runs).toBe(2);

    // A key the effect never read must not wake it.
    trigger(state, 'b');
    expect(runs).toBe(2);
  });

  it('clears stale dependencies on every run', () => {
    const state = { a: 1, b: 2 };
    let readB = false;
    let runs = 0;
    const effect = createEffect(() => {
      runs++;
      if (readB) track(state, 'b');
      else track(state, 'a');
    });

    effect.run();
    expect(runs).toBe(1);

    // Still reading `a`.
    trigger(state, 'a');
    expect(runs).toBe(2);

    // Switch the branch, then run so the new dep set is collected.
    readB = true;
    effect.run();
    expect(runs).toBe(3);

    // `a` is no longer a dependency; `b` is.
    trigger(state, 'a');
    expect(runs).toBe(3);
    trigger(state, 'b');
    expect(runs).toBe(4);
  });

  it('calls the scheduler instead of re-running when one is given', () => {
    const state = { a: 1 };
    let runs = 0;
    const scheduled = [];
    const effect = createEffect(
      () => { runs++; track(state, 'a'); },
      (self) => scheduled.push(self)
    );

    effect.run();
    expect(runs).toBe(1);

    trigger(state, 'a');
    expect(runs).toBe(1);
    expect(scheduled).toEqual([effect]);

    scheduled[0].run();
    expect(runs).toBe(2);
  });

  it('stop() drops the effect out of the graph', () => {
    const state = { a: 1 };
    let runs = 0;
    const effect = createEffect(() => { runs++; track(state, 'a'); });

    effect.run();
    effect.stop();
    expect(effect.active).toBe(false);

    trigger(state, 'a');
    expect(runs).toBe(1);
  });

  it('does not re-enter the effect that is currently running', () => {
    const state = { a: 0 };
    let runs = 0;
    const effect = createEffect(() => {
      runs++;
      track(state, 'a');
      // A binding that writes what it reads must not recurse forever.
      trigger(state, 'a');
    });

    effect.run();
    expect(runs).toBe(1);
  });

  it('nests: an inner effect takes its own deps, the outer keeps its own', () => {
    const state = { outer: 1, inner: 1 };
    let outerRuns = 0;
    let innerRuns = 0;

    const inner = createEffect(() => { innerRuns++; track(state, 'inner'); });
    const outer = createEffect(() => {
      outerRuns++;
      track(state, 'outer');
      inner.run();
    });

    outer.run();
    expect([outerRuns, innerRuns]).toEqual([1, 1]);

    trigger(state, 'inner');
    expect([outerRuns, innerRuns]).toEqual([1, 2]);

    trigger(state, 'outer');
    expect([outerRuns, innerRuns]).toEqual([2, 3]);
  });

  it('wakes iteration readers when a key is added or deleted', () => {
    const state = { a: 1 };
    let runs = 0;
    const effect = createEffect(() => { runs++; track(state, ITERATE_KEY); });

    effect.run();
    trigger(state, 'b', 'add');
    expect(runs).toBe(2);

    trigger(state, 'b', 'delete');
    expect(runs).toBe(3);

    // A plain overwrite is not a shape change.
    trigger(state, 'a', 'set');
    expect(runs).toBe(3);
  });

  it('wakes length readers when an array grows, and index readers when it shrinks', () => {
    const list = ['a', 'b', 'c'];
    let lengthRuns = 0;
    let indexRuns = 0;

    const lengthEffect = createEffect(() => { lengthRuns++; track(list, 'length'); });
    const indexEffect = createEffect(() => { indexRuns++; track(list, '2'); });
    lengthEffect.run();
    indexEffect.run();

    trigger(list, '3', 'add');
    expect(lengthRuns).toBe(2);
    expect(indexRuns).toBe(1);

    list.length = 1;
    trigger(list, 'length');
    expect(lengthRuns).toBe(3);
    expect(indexRuns).toBe(2);
  });
});

describe('computed', () => {
  it('is lazy: the getter does not run until .value is read', () => {
    const getter = vi.fn(() => 42);
    const cell = computed(getter);
    expect(getter).not.toHaveBeenCalled();
    expect(cell.value).toBe(42);
    expect(getter).toHaveBeenCalledTimes(1);
  });

  it('caches until a dependency changes', () => {
    const state = { a: 1 };
    const getter = vi.fn(() => { track(state, 'a'); return state.a; });
    const cell = computed(getter);

    expect(cell.value).toBe(1);
    expect(cell.value).toBe(1);
    expect(cell.value).toBe(1);
    expect(getter).toHaveBeenCalledTimes(1);

    state.a = 2;
    trigger(state, 'a');
    // Still lazy: invalidated, not recomputed.
    expect(getter).toHaveBeenCalledTimes(1);
    expect(cell.value).toBe(2);
    expect(getter).toHaveBeenCalledTimes(2);
  });

  it('does not recompute when an unrelated key changes', () => {
    const state = { a: 1, b: 1 };
    const getter = vi.fn(() => { track(state, 'a'); return state.a; });
    const cell = computed(getter);

    expect(cell.value).toBe(1);
    trigger(state, 'b');
    expect(cell.value).toBe(1);
    expect(getter).toHaveBeenCalledTimes(1);
  });

  it('is itself a dependency: an effect reading it re-runs when it goes stale', () => {
    const state = { a: 1 };
    const cell = computed(() => { track(state, 'a'); return state.a * 2; });

    const seen = [];
    const effect = createEffect(() => seen.push(cell.value));
    effect.run();
    expect(seen).toEqual([2]);

    state.a = 5;
    trigger(state, 'a');
    expect(seen).toEqual([2, 10]);
  });

  it('chains: a computed reading a computed', () => {
    const state = { a: 2 };
    const doubled = computed(() => { track(state, 'a'); return state.a * 2; });
    const quadrupled = computed(() => doubled.value * 2);

    expect(quadrupled.value).toBe(8);
    state.a = 3;
    trigger(state, 'a');
    expect(quadrupled.value).toBe(12);
  });
});

/**
 * watch() reads through whatever object it is handed, so it only sees
 * changes if those reads are tracked. The renderer hands it the real
 * reactive proxy; here a four-line stand-in does the same job, which keeps
 * this file free of core/reactive.js and its persistence imports.
 */
const observable = (obj) => new Proxy(obj, {
  get(t, k) {
    track(t, k);
    const value = Reflect.get(t, k);
    const isPlain = value !== null && typeof value === 'object';
    return isPlain ? observable(value) : value;
  },
  set(t, k, v) {
    const old = t[k];
    const result = Reflect.set(t, k, v);
    if (!Object.is(old, v)) trigger(t, k);
    return result;
  }
});

describe('watch', () => {
  it('fires with new and old values, only when the value changed', () => {
    const state = observable({ count: 0 });
    const calls = [];
    watch('count', (next, previous) => calls.push([next, previous]), {}, state);

    state.count = 1;
    expect(calls).toEqual([[1, 0]]);

    // Writing the same value again is not a change.
    state.count = 1;
    expect(calls).toEqual([[1, 0]]);

    state.count = 2;
    expect(calls).toEqual([[1, 0], [2, 1]]);
  });

  it('accepts a getter function receiving the scope', () => {
    const state = observable({ a: 1, b: 2 });
    const calls = [];
    watch(s => s.a + s.b, value => calls.push(value), {}, state);

    state.b = 10;
    expect(calls).toEqual([11]);

    state.a = 0;
    expect(calls).toEqual([11, 10]);
  });

  it('resolves dotted paths', () => {
    const state = observable({ user: { name: 'ada' } });
    const calls = [];
    watch('user.name', value => calls.push(value), {}, state);

    state.user.name = 'grace';
    expect(calls).toEqual(['grace']);
  });

  it('honours immediate and returns a working stop function', () => {
    const state = observable({ count: 0 });
    const calls = [];
    const stop = watch('count', (next, previous) => calls.push([next, previous]), { immediate: true }, state);
    expect(calls).toEqual([[0, undefined]]);

    stop();
    state.count = 9;
    expect(calls).toEqual([[0, undefined]]);
  });
});
