import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { flush } from './test-utils.js';
import { JSDOM } from 'jsdom';
import fs from 'fs';
import path from 'path';
import { globToRegExp, matchGlob } from '../src/utils/glob.js';

const libCode = fs.readFileSync(path.resolve(__dirname, '../dist/lego.min.js'), 'utf8');

/**
 * Same globals the other suites install, factored into a helper so each
 * describe gets its own realm and its own Lego singleton. Several fixes here
 * touch module-level state (the router's `routes` array, the init-completed
 * flag), which a single shared instance would smear across tests.
 */
const setupDom = () => {
  const dom = new JSDOM('<!DOCTYPE html><body></body>', {
    url: 'http://localhost/',
    runScripts: 'dangerously',
    resources: 'usable'
  });
  const win = dom.window;
  global.window = win;
  global.document = win.document;
  global.HTMLElement = win.HTMLElement;
  global.customElements = win.customElements;
  global.MutationObserver = win.MutationObserver;
  global.Node = win.Node;
  global.NodeFilter = win.NodeFilter;
  global.Element = win.Element;
  global.Event = win.Event;
  global.localStorage = win.localStorage;
  global.StorageEvent = win.StorageEvent;
  global.CSSStyleSheet = win.CSSStyleSheet;
  // Critical: must be set on the dom's window since Lego is eval'd there.
  win.requestAnimationFrame = (cb) => setTimeout(cb, 0);
  win.cancelAnimationFrame = (id) => clearTimeout(id);
  global.requestAnimationFrame = win.requestAnimationFrame;
  global.cancelAnimationFrame = win.cancelAnimationFrame;
  win.eval(libCode);
  return win;
};

describe('Phase 1 fix #1: only plain objects and arrays are proxied', () => {
  let win, Lego;
  beforeEach(async () => {
    win = setupDom();
    Lego = win.Lego;
    await Lego.init(win.document.body);
  });
  afterEach(() => { win.document.body.innerHTML = ''; });

  it('keeps built-ins with internal slots usable in state and in templates', async () => {
    Lego.block('builtin-state', '<span id="size">[[ tags.size ]]</span><em id="who">[[ meta.get("who") ]]</em>', {
      tags: new Set(['a']),
      meta: new Map([['who', 'lego']]),
      when: new Date(0),
      ready: Promise.resolve('ok'),
      addTag(tag) {
        this.tags.add(tag);
        return this.tags.size;
      },
      stamp() { return this.when.getTime(); },
      lookup(key) { return this.meta.get(key); },
      settle() { return this.ready; }
    });

    win.document.body.innerHTML = '<builtin-state></builtin-state>';
    await flush(30);
    const el = win.document.querySelector('builtin-state');

    // Rendering `[[ tags.size ]]` used to blow up with
    // "Method get Set.prototype.size called on incompatible receiver".
    expect(el.shadowRoot.querySelector('#size').textContent).toBe('1');
    expect(el.shadowRoot.querySelector('#who').textContent).toBe('lego');

    // Methods reached through the proxy still see a compatible receiver.
    expect(() => el.state.addTag('b')).not.toThrow();
    expect(el.state.tags.size).toBe(2);
    expect(el.state.lookup('who')).toBe('lego');
    expect(el.state.stamp()).toBe(0);
    await expect(el.state.settle()).resolves.toBe('ok');

    // The raw values come back unwrapped, not Proxy-wrapped clones.
    expect(el.state.tags instanceof Set).toBe(true);
    expect(el.state.when instanceof Date).toBe(true);
  });

  it('leaves plain nested objects and arrays reactive', async () => {
    Lego.block('plain-state', '<p id="name">[[ user.name ]]</p><p id="count">[[ items.length ]]</p>', {
      user: { name: 'ada' },
      items: [1, 2]
    });

    win.document.body.innerHTML = '<plain-state></plain-state>';
    await flush(30);
    const el = win.document.querySelector('plain-state');

    expect(el.shadowRoot.querySelector('#name').textContent).toBe('ada');
    expect(el.shadowRoot.querySelector('#count').textContent).toBe('2');

    el.state.user.name = 'grace';
    await flush(30);
    expect(el.shadowRoot.querySelector('#name').textContent).toBe('grace');

    el.state.items.push(3);
    await flush(30);
    expect(el.shadowRoot.querySelector('#count').textContent).toBe('3');
  });

  it('keeps an ordinary class instance in state reactive', async () => {
    // Class instances were reactive before this phase and must stay that
    // way: an app holding `new Store()` in state and mutating its fields
    // through a method must still re-render.
    class Store {
      constructor() { this.count = 0; }
      bump() { this.count += 1; }
    }

    Lego.block('class-state', '<span>[[ store.count ]]</span>', {
      store: new Store()
    });

    win.document.body.innerHTML = '<class-state></class-state>';
    await flush(30);
    const el = win.document.querySelector('class-state');
    expect(el.shadowRoot.querySelector('span').textContent).toBe('0');

    el.state.store.bump();
    await flush(30);
    expect(el.shadowRoot.querySelector('span').textContent).toBe('1');

    el.state.store.count = 7;
    await flush(30);
    expect(el.shadowRoot.querySelector('span').textContent).toBe('7');
  });

  it('excludes every built-in that carries internal slots', async () => {
    // Guards the toStringTag rule against the built-ins most likely to end
    // up in state. None of these may be handed back as a Proxy.
    Lego.block('builtin-sweep', '<span>ok</span>', {
      set: new Set(),
      map: new Map(),
      weak: new WeakMap(),
      date: new Date(),
      promise: Promise.resolve(),
      regex: /x/,
      error: new Error('x'),
      buffer: new ArrayBuffer(8),
      typed: new Uint8Array(4),
      url: new URL('http://example.test/')
    });

    win.document.body.innerHTML = '<builtin-sweep></builtin-sweep>';
    await flush(30);
    const state = win.document.querySelector('builtin-sweep').state;

    expect(() => state.set.add(1)).not.toThrow();
    expect(() => state.map.set('k', 1)).not.toThrow();
    expect(() => state.weak.set(state.date, 1)).not.toThrow();
    expect(() => state.date.getTime()).not.toThrow();
    expect(() => state.promise.then(() => {})).not.toThrow();
    expect(() => state.regex.test('x')).not.toThrow();
    expect(state.error.message).toBe('x');
    expect(state.buffer.byteLength).toBe(8);
    expect(state.typed.length).toBe(4);
    expect(state.url.host).toBe('example.test');
  });
});

describe('Phase 1 fix #2: async rejections reach the error system', () => {
  let win, Lego, originalOnError, reported;
  beforeEach(async () => {
    win = setupDom();
    Lego = win.Lego;
    reported = [];
    originalOnError = Lego.config.onError;
    Lego.config.onError = (err, type, el) => reported.push({ err, type, el });
    await Lego.init(win.document.body);
  });
  afterEach(() => {
    Lego.config.onError = originalOnError;
    win.document.body.innerHTML = '';
  });

  it('renders the error boundary when an async mounted() rejects', async () => {
    Lego.block('async-fallback', '<p class="fallback">recovered</p>');
    Lego.block(
      'async-mount-boom',
      '<div class="normal">ok</div>',
      { async mounted() { throw new Error('boom'); } },
      '', '', 'async-fallback'
    );

    win.document.body.innerHTML = '<async-mount-boom></async-mount-boom>';
    await flush(50);

    const el = win.document.querySelector('async-mount-boom');
    const fallback = el.shadowRoot.querySelector('async-fallback');
    expect(fallback).toBeTruthy();
    expect(fallback.shadowRoot.querySelector('.fallback').textContent).toBe('recovered');
  });

  it('routes an async @click rejection to config.onError', async () => {
    Lego.block('async-click-boom', '<button @click="fail()">go</button>', {
      async fail() { throw new Error('click-boom'); }
    });

    win.document.body.innerHTML = '<async-click-boom></async-click-boom>';
    await flush(30);

    const el = win.document.querySelector('async-click-boom');
    el.shadowRoot.querySelector('button').click();
    await flush(30);

    const hit = reported.find(r => r.type === 'event-handler');
    expect(hit).toBeTruthy();
    expect(hit.err.message).toBe('click-boom');
  });

  it('routes an async updated() rejection to config.onError', async () => {
    Lego.block('async-updated-boom', '<span>[[ n ]]</span>', {
      n: 0,
      async updated() { throw new Error('updated-boom'); }
    });

    win.document.body.innerHTML = '<async-updated-boom></async-updated-boom>';
    await flush(30);

    win.document.querySelector('async-updated-boom').state.n = 1;
    await flush(120);

    const hit = reported.find(r => r.type === 'updated');
    expect(hit).toBeTruthy();
    expect(hit.err.message).toBe('updated-boom');
  });

  it('routes an async unmounted() rejection to config.onError', async () => {
    Lego.block('async-unmount-boom', '<div>bye</div>', {
      async unmounted() { throw new Error('unmount-boom'); }
    });

    win.document.body.innerHTML = '<async-unmount-boom></async-unmount-boom>';
    await flush(30);

    win.document.querySelector('async-unmount-boom').remove();
    await flush(30);

    const hit = reported.find(r => r.type === 'unmounted');
    expect(hit).toBeTruthy();
    expect(hit.err.message).toBe('unmount-boom');
  });
});

describe('Phase 1 fix #3: a DOM move does not tear the block down', () => {
  let win, Lego;
  beforeEach(async () => {
    win = setupDom();
    Lego = win.Lego;
    await Lego.init(win.document.body);
  });
  afterEach(() => { win.document.body.innerHTML = ''; });

  it('keeps row state and mounted() count across a b-for reorder', async () => {
    let mountedCount = 0;
    Lego.block('move-row', '<span>[[ label ]]</span>', {
      label: 'init',
      mounted() { mountedCount += 1; }
    });
    Lego.block('move-list', '<move-row b-for="row in rows" b-key="id" data-id="[[ row.id ]]"></move-row>', {
      rows: [{ id: 'a' }, { id: 'b' }, { id: 'c' }]
    });

    win.document.body.innerHTML = '<move-list></move-list>';
    await flush(50);

    const list = win.document.querySelector('move-list');
    const idsOf = () => [...list.shadowRoot.querySelectorAll('move-row')].map(r => r.getAttribute('data-id'));
    const rowNamed = (id) => [...list.shadowRoot.querySelectorAll('move-row')].find(r => r.getAttribute('data-id') === id);

    expect(idsOf()).toEqual(['a', 'b', 'c']);
    const mountsAfterFirstRender = mountedCount;
    expect(mountsAfterFirstRender).toBe(3);

    const rowB = rowNamed('b');
    rowB.state.label = 'kept';
    await flush(30);
    expect(rowB.shadowRoot.querySelector('span').textContent).toBe('kept');

    // Reverse: b-for reuses the pooled children and reorders them with
    // insertBefore, which fires disconnect immediately followed by connect.
    list.state.rows = [{ id: 'c' }, { id: 'b' }, { id: 'a' }];
    await flush(50);

    expect(idsOf()).toEqual(['c', 'b', 'a']);
    expect(mountedCount).toBe(mountsAfterFirstRender);
    expect(rowNamed('b')).toBe(rowB);
    expect(rowB.state).toBeTruthy();
    expect(rowB.state.label).toBe('kept');
    expect(rowB.shadowRoot.querySelector('span').textContent).toBe('kept');
  });

  it('still unsnaps a genuinely removed element, one microtask later', async () => {
    let unmountedCalls = 0;
    Lego.block('gone-block', '<div>x</div>', {
      unmounted() { unmountedCalls += 1; }
    });

    win.document.body.innerHTML = '<gone-block></gone-block>';
    await flush(30);

    const before = Lego.getActiveBlocksCount();
    expect(before).toBeGreaterThanOrEqual(1);

    const el = win.document.querySelector('gone-block');
    el.remove();

    // Teardown is deferred so a move can cancel it.
    expect(unmountedCalls).toBe(0);
    expect(Lego.getActiveBlocksCount()).toBe(before);

    await flush(10);

    expect(unmountedCalls).toBe(1);
    expect(Lego.getActiveBlocksCount()).toBe(before - 1);
    expect(el._studs).toBeNull();
  });

  it('does not tear down a block that is moved between parents', async () => {
    let mountedCount = 0;
    Lego.block('portable-block', '<span>[[ note ]]</span>', {
      note: 'first',
      mounted() { mountedCount += 1; }
    });

    win.document.body.innerHTML = '<div id="from"><portable-block></portable-block></div><div id="to"></div>';
    await flush(30);

    const el = win.document.querySelector('portable-block');
    el.state.note = 'second';
    await flush(30);

    win.document.getElementById('to').appendChild(el);
    await flush(30);

    expect(mountedCount).toBe(1);
    expect(el.state.note).toBe('second');
    expect(el.shadowRoot.querySelector('span').textContent).toBe('second');
  });
});

describe('Phase 1 fix #3 (review): unmounted precedes mounted on replace paths', () => {
  let win, Lego, order;
  beforeEach(() => {
    win = setupDom();
    Lego = win.Lego;
    order = [];
  });
  afterEach(() => { win.document.body.innerHTML = ''; });

  const definePages = () => {
    Lego.block('page-one', '<p>one</p>', {
      mounted() { order.push('one:mounted'); },
      unmounted() { order.push('one:unmounted'); }
    });
    Lego.block('page-two', '<p>two</p>', {
      mounted() { order.push('two:mounted'); },
      unmounted() { order.push('two:unmounted'); }
    });
  };

  it('runs the outgoing page unmounted() before the incoming page mounted()', async () => {
    win.document.body.innerHTML = '<lego-router></lego-router>';
    definePages();
    Lego.route('/', 'page-one');
    Lego.route('/two', 'page-two');
    await Lego.init(win.document.body);
    await flush(50);

    expect(order).toEqual(['one:mounted']);

    Lego.globals.$go('/two').get();
    await flush(50);

    expect(order).toEqual(['one:mounted', 'one:unmounted', 'two:mounted']);
    expect(win.document.querySelector('lego-router page-two')).toBeTruthy();
  });

  it('runs the outgoing block unmounted() before the incoming block mounted() on $mount', async () => {
    win.document.body.innerHTML = '<div id="slot"></div>';
    definePages();
    await Lego.init(win.document.body);
    await flush(30);

    Lego.mount('page-one', '#slot');
    await flush(30);
    expect(order).toEqual(['one:mounted']);

    Lego.mount('page-two', '#slot');
    await flush(30);

    expect(order).toEqual(['one:mounted', 'one:unmounted', 'two:mounted']);
    expect(win.document.querySelector('#slot page-two')).toBeTruthy();
  });

  it('is idempotent: the deferred disconnect teardown does not re-run unmounted()', async () => {
    win.document.body.innerHTML = '<div id="slot"></div>';
    definePages();
    await Lego.init(win.document.body);
    await flush(30);

    Lego.mount('page-one', '#slot');
    await flush(30);
    Lego.mount('page-two', '#slot');
    // Long enough for the queued microtask teardown to have fired too.
    await flush(50);

    expect(order.filter(entry => entry === 'one:unmounted')).toHaveLength(1);
  });
});

describe('Phase 1 fix #4: b-sync runs after the bindings that fill it', () => {
  let win, Lego;
  beforeEach(async () => {
    win = setupDom();
    Lego = win.Lego;
    await Lego.init(win.document.body);
  });
  afterEach(() => { win.document.body.innerHTML = ''; });

  it('selects the right option when the options come from b-for', async () => {
    Lego.block(
      'select-for',
      '<select b-sync="pick"><option b-for="o in opts" value="[[ o ]]">[[ o ]]</option></select>',
      { pick: 'b', opts: ['a', 'b', 'c'] }
    );

    win.document.body.innerHTML = '<select-for></select-for>';
    await flush(50);

    const select = win.document.querySelector('select-for').shadowRoot.querySelector('select');
    expect(select.querySelectorAll('option').length).toBe(3);
    expect(select.value).toBe('b');
  });

  it('selects the right option for a select inside a b-for row', async () => {
    Lego.block(
      'loop-select',
      '<div b-for="row in rows" b-key="id"><select b-sync="picked"><option b-for="o in opts" value="[[ o ]]">[[ o ]]</option></select></div>',
      { rows: [{ id: 1 }], opts: ['x', 'y', 'z'], picked: 'y' }
    );

    win.document.body.innerHTML = '<loop-select></loop-select>';
    await flush(50);

    const select = win.document.querySelector('loop-select').shadowRoot.querySelector('select');
    expect(select.querySelectorAll('option').length).toBe(3);
    expect(select.value).toBe('y');
  });

  it('still syncs a plain input, which has no ordering dependency', async () => {
    Lego.block('plain-sync', '<input b-sync="name" />', { name: 'ada' });

    win.document.body.innerHTML = '<plain-sync></plain-sync>';
    await flush(30);

    const el = win.document.querySelector('plain-sync');
    expect(el.shadowRoot.querySelector('input').value).toBe('ada');

    el.state.name = 'grace';
    await flush(30);
    expect(el.shadowRoot.querySelector('input').value).toBe('grace');
  });
});

describe('Phase 1 fix #5: routes registered after init still work', () => {
  let win, Lego;
  beforeEach(() => {
    win = setupDom();
    Lego = win.Lego;
  });
  afterEach(() => { win.document.body.innerHTML = ''; });

  it('renders a route added after init and keeps b-link navigation working', async () => {
    win.document.body.innerHTML = '<lego-router></lego-router>';

    // No routes exist yet: this is exactly the case where the listeners
    // used to never get installed.
    await Lego.init(win.document.body);

    Lego.block('late-page', '<p class="late">late</p>');
    Lego.block('other-page', '<p class="other">other</p>');

    Lego.route('/', 'late-page');
    await flush(50);

    const router = win.document.querySelector('lego-router');
    expect(router.querySelector('late-page')).toBeTruthy();

    // A second late route must not re-render the current one.
    Lego.route('/other', 'other-page');
    await flush(30);
    expect(router.querySelector('late-page')).toBeTruthy();
    expect(router.querySelector('other-page')).toBeNull();

    const link = win.document.createElement('a');
    link.setAttribute('href', '/other');
    link.setAttribute('b-link', '');
    link.textContent = 'go';
    win.document.body.appendChild(link);

    link.click();
    await flush(50);

    expect(win.location.pathname).toBe('/other');
    expect(router.querySelector('other-page')).toBeTruthy();
    expect(router.querySelector('late-page')).toBeNull();
  });

  it('does not install the document listeners twice', async () => {
    let clickListeners = 0;
    const originalAdd = win.document.addEventListener.bind(win.document);
    win.document.addEventListener = (type, ...rest) => {
      if (type === 'click') clickListeners += 1;
      return originalAdd(type, ...rest);
    };

    try {
      await Lego.init(win.document.body);
      Lego.route('/twice-a', 'twice-a-page');
      Lego.route('/twice-b', 'twice-b-page');
      await Lego.init(win.document.body);
      await flush(30);
      expect(clickListeners).toBe(1);
    } finally {
      win.document.addEventListener = originalAdd;
    }
  });
});

describe('Phase 1 fix #6: Lego.nextTick', () => {
  let win, Lego;
  beforeEach(async () => {
    win = setupDom();
    Lego = win.Lego;
    await Lego.init(win.document.body);
  });
  afterEach(() => { win.document.body.innerHTML = ''; });

  it('resolves after the pending batch has updated the DOM', async () => {
    Lego.block('tick-block', '<span>[[ n ]]</span>', { n: 0 });
    win.document.body.innerHTML = '<tick-block></tick-block>';
    await flush(30);

    const el = win.document.querySelector('tick-block');
    el.state.n = 42;

    // Not yet: the batcher waits for the next animation frame.
    expect(el.shadowRoot.querySelector('span').textContent).toBe('0');

    await Lego.nextTick();
    expect(el.shadowRoot.querySelector('span').textContent).toBe('42');
  });

  it('resolves when nothing is pending', async () => {
    await expect(Lego.nextTick()).resolves.toBeUndefined();
  });

  it('waits for the following batch when called mid-render', async () => {
    // A mutation made while a batch is in flight is pushed to the batcher's
    // pending queue and renders in the *next* batch. A nextTick() registered
    // during that same batch must therefore wait for the next one, not the
    // current one. config.metrics.onRenderEnd is the natural injection
    // point: it runs inside render(), inside processBatch.
    Lego.block('tick-mid', '<span>[[ label ]]</span>', { label: 'a' });
    win.document.body.innerHTML = '<tick-mid></tick-mid>';
    await flush(30);

    const el = win.document.querySelector('tick-mid');
    const textNow = () => el.shadowRoot.querySelector('span').textContent;
    const seen = [];
    let armed = true;
    let midTick = null;

    Lego.config.metrics.onRenderEnd = (target) => {
      if (!armed || target !== el) return;
      armed = false;
      midTick = Lego.nextTick().then(() => seen.push(textNow()));
      // Queued during processing: this lands in the following batch.
      el.state.label = 'c';
    };

    try {
      el.state.label = 'b';
      await flush(60);
      await midTick;
      expect(seen).toEqual(['c']);
      expect(textNow()).toBe('c');
    } finally {
      delete Lego.config.metrics.onRenderEnd;
    }
  });

  it('can be awaited repeatedly', async () => {
    Lego.block('tick-twice', '<span>[[ n ]]</span>', { n: 0 });
    win.document.body.innerHTML = '<tick-twice></tick-twice>';
    await flush(30);

    const el = win.document.querySelector('tick-twice');
    for (let n = 1; n <= 3; n++) {
      el.state.n = n;
      await Lego.nextTick();
      expect(el.shadowRoot.querySelector('span').textContent).toBe(String(n));
    }
  });
});

describe('Phase 1 fix #7: the built-in glob matcher replaces fast-glob', () => {
  it('handles **/*.lego', () => {
    const re = globToRegExp('**/*.lego');
    expect(re.test('a.lego')).toBe(true);
    expect(re.test('blocks/a.lego')).toBe(true);
    expect(re.test('blocks/nested/deep/a.lego')).toBe(true);
    expect(re.test('a.txt')).toBe(false);
    expect(re.test('a.lego.txt')).toBe(false);
  });

  it('handles blocks/*.lego', () => {
    const re = globToRegExp('blocks/*.lego');
    expect(re.test('blocks/a.lego')).toBe(true);
    expect(re.test('blocks/sub/a.lego')).toBe(false);
    expect(re.test('a.lego')).toBe(false);
    expect(re.test('other/a.lego')).toBe(false);
  });

  it('handles *.lego', () => {
    const re = globToRegExp('*.lego');
    expect(re.test('a.lego')).toBe(true);
    expect(re.test('user-card.lego')).toBe(true);
    expect(re.test('blocks/a.lego')).toBe(false);
  });

  it('handles ? and bare **', () => {
    expect(globToRegExp('?.lego').test('a.lego')).toBe(true);
    expect(globToRegExp('?.lego').test('ab.lego')).toBe(false);
    expect(globToRegExp('blocks/**').test('blocks/a/b/c.lego')).toBe(true);
    expect(globToRegExp('blocks/**').test('other/a.lego')).toBe(false);
  });

  it('treats regex metacharacters in the pattern as literals', () => {
    const re = globToRegExp('a+b.lego');
    expect(re.test('a+b.lego')).toBe(true);
    expect(re.test('aab.lego')).toBe(false);
    expect(re.test('axlego')).toBe(false);
  });

  it('normalizes Windows separators through matchGlob', () => {
    expect(matchGlob('**/*.lego', 'blocks\\nested\\a.lego')).toBe(true);
    expect(matchGlob('blocks/*.lego', 'blocks\\a.lego')).toBe(true);
  });
});

describe('Phase 1 fix #8: quota errors never evict other keys', () => {
  let win, Lego;
  beforeEach(async () => {
    win = setupDom();
    Lego = win.Lego;
    win.localStorage.clear();
    await Lego.init(win.document.body);
  });
  afterEach(() => {
    win.document.body.innerHTML = '';
    win.localStorage.clear();
  });

  it('reports the error and removes nothing', async () => {
    win.localStorage.setItem('someone-elses-data', 'precious');

    // Give the old FIFO tracker something it would have judged evictable: a
    // key Lego wrote itself, earlier, through a $db binding.
    Lego.block('quota-neighbour', '<span>[[ v ]]</span>', {
      v: Lego.db('phase1.neighbour').default('init')
    });
    win.document.body.innerHTML = '<quota-neighbour></quota-neighbour>';
    await flush(30);
    win.document.querySelector('quota-neighbour').state.v = 'neighbour-data';
    await flush(30);
    expect(win.localStorage.getItem('phase1.neighbour')).toBe(JSON.stringify('neighbour-data'));

    const originalSet = win.Storage.prototype.setItem;
    const originalRemove = win.Storage.prototype.removeItem;
    const removed = [];
    win.Storage.prototype.setItem = function (key, value) {
      if (key === 'phase1.quota') {
        const err = new Error('quota');
        err.name = 'QuotaExceededError';
        throw err;
      }
      return originalSet.call(this, key, value);
    };
    win.Storage.prototype.removeItem = function (key) {
      removed.push(key);
      return originalRemove.call(this, key);
    };

    const originalOnError = Lego.config.onError;
    const reported = [];
    Lego.config.onError = (err, type, key) => reported.push({ err, type, key });

    try {
      Lego.block('quota-phase1', '<span>[[ v ]]</span>', {
        v: Lego.db('phase1.quota').default('init')
      });
      win.document.body.innerHTML += '<quota-phase1></quota-phase1>';
      await flush(30);

      win.document.querySelector('quota-phase1').state.v = 'x'.repeat(100);
      await flush(30);

      expect(removed).toEqual([]);
      expect(win.localStorage.getItem('someone-elses-data')).toBe('precious');
      expect(win.localStorage.getItem('phase1.neighbour')).toBe(JSON.stringify('neighbour-data'));
      expect(win.localStorage.getItem('phase1.quota')).toBeNull();
      expect(reported.some(r => r.type === 'quota' && r.key === 'phase1.quota')).toBe(true);
    } finally {
      win.Storage.prototype.setItem = originalSet;
      win.Storage.prototype.removeItem = originalRemove;
      Lego.config.onError = originalOnError;
    }
  });
});

describe('Phase 1 fix #9: the documented API surface is the real one', () => {
  let win, Lego;
  beforeEach(async () => {
    win = setupDom();
    Lego = win.Lego;
    await Lego.init(win.document.body);
  });
  afterEach(() => { win.document.body.innerHTML = ''; });

  it('exposes el.state, not el.setState or el.logic', async () => {
    Lego.block('doc-surface', '<span>[[ name ]]</span>', {
      name: 'ada',
      rename(next) { this.name = next; }
    });

    win.document.body.innerHTML = '<doc-surface></doc-surface>';
    await flush(30);
    const el = win.document.querySelector('doc-surface');

    // docs/tutorial/testing.md used to show both of these.
    expect(el.setState).toBeUndefined();
    expect(el.logic).toBeUndefined();

    expect(el.state).toBeTruthy();
    expect(el.state.name).toBe('ada');

    // Assignment merges rather than replacing.
    el.state = { name: 'grace' };
    await Lego.nextTick();
    expect(el.state.name).toBe('grace');
    expect(typeof el.state.rename).toBe('function');
    expect(el.shadowRoot.querySelector('span').textContent).toBe('grace');

    el.state.rename('hopper');
    await Lego.nextTick();
    expect(el.shadowRoot.querySelector('span').textContent).toBe('hopper');
  });

  it('ships the vite plugin as a default export', async () => {
    const mod = await import('../vite-plugin.js');
    expect(typeof mod.default).toBe('function');
    expect(mod.legoPlugin).toBeUndefined();
    expect(mod.default().name).toBe('vite-plugin-lego');
  });
});
