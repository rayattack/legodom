import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { flush } from './test-utils.js';
import { JSDOM } from 'jsdom';
import fs from 'fs';
import path from 'path';

const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
  url: 'http://localhost/',
  runScripts: 'dangerously',
  resources: 'usable'
});

global.window = dom.window;
global.document = dom.window.document;
Object.defineProperty(global, 'navigator', {
  value: dom.window.navigator,
  writable: true,
  configurable: true
});
global.HTMLElement = dom.window.HTMLElement;
global.customElements = dom.window.customElements;
global.MutationObserver = dom.window.MutationObserver;
global.Node = dom.window.Node;
global.Element = dom.window.Element;
global.Event = dom.window.Event;
global.CustomEvent = dom.window.CustomEvent;
global.NodeFilter = dom.window.NodeFilter;
global.FormData = dom.window.FormData;
global.localStorage = dom.window.localStorage;
global.StorageEvent = dom.window.StorageEvent;
global.requestAnimationFrame = (cb) => setTimeout(cb, 0);

const libCode = fs.readFileSync(path.resolve(__dirname, '../dist/lego.min.js'), 'utf8');
eval(libCode);

const Lego = window.Lego;

const mount = async (tag) => {
  const el = document.createElement(tag);
  document.body.appendChild(el);
  await flush(30);
  return el;
};

const text = (el, selector) => el.shadowRoot.querySelector(selector).textContent;

/** Walk the prototype chain for a property descriptor JSDOM defines on Node. */
const findDescriptor = (obj, prop) => {
  let current = obj;
  while (current) {
    const desc = Object.getOwnPropertyDescriptor(current, prop);
    if (desc) return desc;
    current = Object.getPrototypeOf(current);
  }
  return null;
};

/**
 * Record every read and write of one node's textContent. A binding that did
 * not re-run touches neither, so this is the direct evidence that a row was
 * left alone rather than re-run and found to be unchanged.
 */
const recordTextContent = (node) => {
  const desc = findDescriptor(node, 'textContent');
  const log = { reads: 0, writes: [] };
  Object.defineProperty(node, 'textContent', {
    configurable: true,
    get() {
      log.reads++;
      return desc.get.call(this);
    },
    set(value) {
      log.writes.push(value);
      desc.set.call(this, value);
    }
  });
  return log;
};

describe('Phase 3: dependencies belong to effects, not to elements', () => {
  beforeEach(async () => {
    document.body.innerHTML = '';
    await Lego.init(document.body);
  });

  it('re-renders every block that reads a shared object, not just the first one', async () => {
    // Bug #1 before this phase: the proxy for an object was created once,
    // bound to whichever element touched it first, so the second block never
    // heard about a mutation again.
    const cart = { total: 0 };
    Lego.block('share-left', '<span>[[ cart.total ]]</span>', { cart });
    Lego.block('share-right', '<em>[[ cart.total ]]</em>', { cart });

    const left = await mount('share-left');
    const right = await mount('share-right');
    expect(text(left, 'span')).toBe('0');
    expect(text(right, 'em')).toBe('0');

    left.state.cart.total = 42;
    await Lego.nextTick();

    expect(text(left, 'span')).toBe('42');
    expect(text(right, 'em')).toBe('42');

    // And in the other direction.
    right.state.cart.total = 7;
    await Lego.nextTick();
    expect(text(left, 'span')).toBe('7');
    expect(text(right, 'em')).toBe('7');
  });

  it('re-renders on a Lego.globals change, with no expression sniffing', async () => {
    Lego.globals.banner = 'hello';
    Lego.block('globals-reader', '<span>[[ global.banner ]]</span>');
    const el = await mount('globals-reader');
    expect(text(el, 'span')).toBe('hello');

    Lego.globals.banner = 'goodbye';
    await Lego.nextTick();
    expect(text(el, 'span')).toBe('goodbye');
  });

  it('picks up a global key that did not exist when the block rendered', async () => {
    Lego.block('globals-late', '<span>[[ global.lateKey ]]</span>');
    const el = await mount('globals-late');
    expect(text(el, 'span')).toBe('');

    Lego.globals.lateKey = 'arrived';
    await Lego.nextTick();
    expect(text(el, 'span')).toBe('arrived');
  });

  it('caches a getter and re-evaluates it only when one of its own deps changes', async () => {
    let calls = 0;
    Lego.block('cached-getter', '<span>[[ doubled ]]</span>', {
      a: 1,
      unrelated: 'x',
      get doubled() { calls++; return this.a * 2; }
    });

    const el = await mount('cached-getter');
    expect(text(el, 'span')).toBe('2');
    expect(calls).toBe(1);

    // Reading it again does not recompute.
    expect(el.state.doubled).toBe(2);
    expect(calls).toBe(1);

    el.state.unrelated = 'y';
    await flush(30);
    expect(calls).toBe(1);

    el.state.a = 21;
    await Lego.nextTick();
    expect(text(el, 'span')).toBe('42');
    expect(calls).toBe(2);
  });
});

describe('Phase 3: b-for rows react on their own', () => {
  beforeEach(async () => {
    document.body.innerHTML = '';
    await Lego.init(document.body);
  });

  const defineList = (tag, hook = {}) => {
    Lego.block(tag, '<li b-for="task in tasks" b-key="id">[[ task.title ]]</li>', {
      tasks: [
        { id: 1, title: 'one' },
        { id: 2, title: 'two' },
        { id: 3, title: 'three' }
      ],
      ...hook
    });
  };

  const rows = (el) => [...el.shadowRoot.querySelectorAll('li')];

  it('mutating one item re-runs that row only', async () => {
    defineList('row-isolation');
    const el = await mount('row-isolation');
    expect(rows(el).map(li => li.textContent)).toEqual(['one', 'two', 'three']);

    const watched = recordTextContent(rows(el)[1].firstChild);
    const rowZero = rows(el)[0];

    el.state.tasks[0].title = 'ONE';
    await Lego.nextTick();

    expect(rowZero.textContent).toBe('ONE');
    // Row 1's text node was neither read nor written: its binding did not run.
    expect(watched.writes).toEqual([]);
    expect(watched.reads).toBe(0);
    // Nothing was rebuilt either.
    expect(rows(el)[0]).toBe(rowZero);
  });

  it('still adds, removes and reorders, and stops rows that leave the pool', async () => {
    let updates = 0;
    defineList('row-structure', { updated() { updates++; } });
    const el = await mount('row-structure');
    const original = rows(el)[1];

    // Add
    el.state.tasks = [
      { id: 1, title: 'one' },
      { id: 2, title: 'two' },
      { id: 3, title: 'three' },
      { id: 4, title: 'four' }
    ];
    await Lego.nextTick();
    expect(rows(el).map(li => li.textContent)).toEqual(['one', 'two', 'three', 'four']);
    expect(rows(el)[1]).toBe(original);

    // Reorder
    el.state.tasks = [
      { id: 4, title: 'four' },
      { id: 3, title: 'three' },
      { id: 2, title: 'two' },
      { id: 1, title: 'one' }
    ];
    await Lego.nextTick();
    expect(rows(el).map(li => li.textContent)).toEqual(['four', 'three', 'two', 'one']);
    expect(rows(el)[2]).toBe(original);

    // Remove: hold on to the dropped item so we can poke it afterwards.
    const dropped = el.state.tasks[0];
    el.state.tasks = [
      { id: 3, title: 'three' },
      { id: 2, title: 'two' }
    ];
    await Lego.nextTick();
    expect(rows(el).map(li => li.textContent)).toEqual(['three', 'two']);

    await flush(80);
    const settled = updates;
    const markup = el.shadowRoot.innerHTML;

    // The evicted row's effects are stopped, so this reaches nothing.
    expect(() => { dropped.title = 'ghost'; }).not.toThrow();
    await flush(80);

    expect(el.shadowRoot.innerHTML).toBe(markup);
    expect(updates).toBe(settled);
  });

  /**
   * A row binding can be dirty from a mutation made earlier in the same frame
   * when the loop evicts its row. Before the fix, render() reached a binding
   * whose effect had been stopped and set to null, built a fresh one against
   * the block's state instead of the row's scope, and ran it on a detached
   * node: `task` did not resolve, the ReferenceError was swallowed, an empty
   * string went into a node nobody can see, and a live effect was left behind
   * on a dead row. stopRow() marks the binding dead so runBinding skips it.
   */
  const evictionOrders = ['mutate then splice', 'splice then mutate'];
  evictionOrders.forEach((order, index) => {
    it(`does not resurrect a row binding evicted in the same frame (${order})`, async () => {
      const tag = `row-evicted-${index}`;
      defineList(tag);
      const el = await mount(tag);

      const doomedRow = rows(el)[1];
      const watched = recordTextContent(doomedRow.firstChild);
      const doomedItem = el.state.tasks[1];

      const errors = [];
      const originalOnError = Lego.config.onError;
      Lego.config.onError = (err, type) => errors.push({ err, type });

      try {
        if (order === 'mutate then splice') {
          doomedItem.title = 'doomed';
          el.state.tasks.splice(1, 1);
        } else {
          el.state.tasks.splice(1, 1);
          doomedItem.title = 'doomed';
        }
        await Lego.nextTick();
        await flush(30);

        expect(errors).toEqual([]);
        expect(rows(el).map(li => li.textContent)).toEqual(['one', 'three']);
        expect(doomedRow.isConnected).toBe(false);

        // The evicted row's bindings are dead and hold no effect.
        expect(doomedRow._loopBindings.length).toBeGreaterThan(0);
        expect(doomedRow._loopBindings.every(b => b.dead === true)).toBe(true);
        expect(doomedRow._loopBindings.every(b => !b.effect)).toBe(true);

        // The resurrection signature is an empty string written into the
        // detached node, because `task` is unresolvable in block scope.
        expect(watched.writes.includes('')).toBe(false);

        // A later mutation of the removed item schedules nothing at all: no
        // render of the host block, and no write to the detached node.
        let renders = 0;
        Lego.config.metrics.onRenderStart = (target) => {
          if (target === el) renders++;
        };
        watched.writes.length = 0;

        doomedItem.title = 'ghost';
        await Lego.nextTick();
        await flush(30);

        expect(renders).toBe(0);
        expect(watched.writes).toEqual([]);
      } finally {
        delete Lego.config.metrics.onRenderStart;
        Lego.config.onError = originalOnError;
      }
    });
  });
});

describe('Phase 3: dependency sets shrink', () => {
  beforeEach(async () => {
    document.body.innerHTML = '';
    await Lego.init(document.body);
  });

  it('a binding that stops reading a key stops re-running on it', async () => {
    let updates = 0;
    Lego.block('dep-shrink', '<span>[[ useA ? a : b ]]</span>', {
      useA: true,
      a: 'A',
      b: 'B',
      updated() { updates++; }
    });

    const el = await mount('dep-shrink');
    expect(text(el, 'span')).toBe('A');

    // While the binding reads `a`, changing `a` re-runs it.
    el.state.a = 'A2';
    await Lego.nextTick();
    expect(text(el, 'span')).toBe('A2');

    // Take the other branch: the binding now reads `useA` and `b`.
    el.state.useA = false;
    await Lego.nextTick();
    expect(text(el, 'span')).toBe('B');

    await flush(80);
    const settled = updates;

    // `a` is no longer a dependency, so this schedules nothing at all.
    el.state.a = 'A3';
    await flush(80);
    expect(updates).toBe(settled);
    expect(text(el, 'span')).toBe('B');

    // `b` still is.
    el.state.b = 'B2';
    await Lego.nextTick();
    expect(text(el, 'span')).toBe('B2');
  });

  it('tracks `in` checks, so adding a key re-renders', async () => {
    Lego.block('has-tracking', "<span>[['admin' in perms ? 'yes' : 'no']]</span>", {
      perms: {}
    });

    const el = await mount('has-tracking');
    expect(text(el, 'span')).toBe('no');

    el.state.perms.admin = true;
    await Lego.nextTick();
    expect(text(el, 'span')).toBe('yes');

    delete el.state.perms.admin;
    await Lego.nextTick();
    expect(text(el, 'span')).toBe('no');
  });
});

describe('Phase 3: $watch', () => {
  beforeEach(async () => {
    document.body.innerHTML = '';
    await Lego.init(document.body);
  });

  it('fires with new and old values, skips no-op writes, and stops on demand', async () => {
    Lego.block('watch-block', '<span>[[ count ]]</span>', { count: 0 });
    const el = await mount('watch-block');

    const seen = [];
    const stop = el.state.$watch('count', (next, previous) => seen.push([next, previous]));

    el.state.count = 1;
    expect(seen).toEqual([[1, 0]]);

    // Same value: not a change.
    el.state.count = 1;
    expect(seen).toEqual([[1, 0]]);

    el.state.count = 2;
    expect(seen).toEqual([[1, 0], [2, 1]]);

    stop();
    el.state.count = 3;
    expect(seen).toEqual([[1, 0], [2, 1]]);

    // The DOM kept up throughout.
    await Lego.nextTick();
    expect(text(el, 'span')).toBe('3');
  });

  it('accepts a function source over the state proxy', async () => {
    Lego.block('watch-fn', '<span>[[ a ]]</span>', { a: 1, b: 2 });
    const el = await mount('watch-fn');

    const sums = [];
    el.state.$watch(s => s.a + s.b, value => sums.push(value));

    el.state.b = 10;
    expect(sums).toEqual([11]);

    el.state.a = 0;
    expect(sums).toEqual([11, 10]);
  });

  it('supports immediate, and stops every watcher on unmount', async () => {
    const seen = [];
    Lego.block('watch-teardown', '<span>[[ n ]]</span>', {
      n: 0,
      mounted() {
        this.$watch('n', value => seen.push(value), { immediate: true });
      }
    });

    const el = await mount('watch-teardown');
    expect(seen).toEqual([0]);

    el.state.n = 1;
    expect(seen).toEqual([0, 1]);

    const state = el.state;
    el.remove();
    await flush(30);

    // Nothing left listening once the block is gone.
    state.n = 2;
    expect(seen).toEqual([0, 1]);
  });
});

describe('Phase 3: persistence writes through the proxy', () => {
  beforeEach(async () => {
    document.body.innerHTML = '';
    localStorage.clear();
    await Lego.init(document.body);
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('updates every block bound to a $db key when one of them writes', async () => {
    Lego.block('db-share-a', '<span>[[ theme ]]</span>', {
      theme: Lego.db('phase3.theme').default('light')
    });
    Lego.block('db-share-b', '<em>[[ theme ]]</em>', {
      theme: Lego.db('phase3.theme').default('light')
    });

    const a = await mount('db-share-a');
    const b = await mount('db-share-b');
    expect(text(a, 'span')).toBe('light');
    expect(text(b, 'em')).toBe('light');

    a.state.theme = 'dark';
    await Lego.nextTick();

    expect(b.state.theme).toBe('dark');
    expect(text(a, 'span')).toBe('dark');
    expect(text(b, 'em')).toBe('dark');
    expect(JSON.parse(localStorage.getItem('phase3.theme'))).toBe('dark');
  });

  it('renders a value arriving from another tab', async () => {
    Lego.block('db-cross-tab', '<span>[[ token ]]</span>', {
      token: Lego.db('phase3.token').default('none')
    });

    const el = await mount('db-cross-tab');
    expect(text(el, 'span')).toBe('none');

    window.dispatchEvent(new window.StorageEvent('storage', {
      key: 'phase3.token',
      newValue: JSON.stringify('from-other-tab'),
      storageArea: localStorage
    }));
    await Lego.nextTick();

    expect(el.state.token).toBe('from-other-tab');
    expect(text(el, 'span')).toBe('from-other-tab');
  });
});

describe('Phase 3: Lego.effect and Lego.watch', () => {
  beforeEach(async () => {
    document.body.innerHTML = '';
    await Lego.init(document.body);
  });

  it('Lego.effect re-runs on a globals change and stops when told to', () => {
    Lego.globals.hits = 0;
    const seen = [];
    const stop = Lego.effect(() => seen.push(Lego.globals.hits));
    expect(seen).toEqual([0]);

    Lego.globals.hits = 1;
    Lego.globals.hits = 2;
    expect(seen).toEqual([0, 1, 2]);

    stop();
    Lego.globals.hits = 3;
    expect(seen).toEqual([0, 1, 2]);
  });

  it('Lego.watch reports new and old values for a globals path', () => {
    Lego.globals.session = { user: 'ada' };
    const seen = [];
    const stop = Lego.watch('session.user', (next, previous) => seen.push([next, previous]));

    Lego.globals.session.user = 'grace';
    expect(seen).toEqual([['grace', 'ada']]);

    stop();
    Lego.globals.session.user = 'hopper';
    expect(seen).toEqual([['grace', 'ada']]);
  });

  it('Lego.watch accepts a function source over globals', () => {
    Lego.globals.left = 1;
    Lego.globals.right = 1;
    const sums = [];
    const stop = Lego.watch(g => g.left + g.right, value => sums.push(value));

    Lego.globals.right = 4;
    expect(sums).toEqual([5]);
    stop();
  });
});
