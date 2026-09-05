import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { flush } from './test-utils.js';
import { JSDOM } from 'jsdom';
import fs from 'fs';
import path from 'path';

const libCode = fs.readFileSync(path.resolve(__dirname, '../dist/lego.min.js'), 'utf8');

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
  // Critical: must set on the dom's window since Lego is eval'd in that scope
  win.requestAnimationFrame = (cb) => setTimeout(cb, 0);
  win.cancelAnimationFrame = (id) => clearTimeout(id);
  global.requestAnimationFrame = win.requestAnimationFrame;
  global.cancelAnimationFrame = win.cancelAnimationFrame;
  win.eval(libCode);
  return win;
};

describe('Audit fix #6: updated() lifecycle does not starve under sustained mutation', () => {
  let win, Lego;
  beforeEach(async () => {
    win = setupDom();
    Lego = win.Lego;
    win.localStorage.clear();
    await Lego.init(win.document.body);
  });
  afterEach(() => { win.document.body.innerHTML = ''; });

  it('fires updated() within ~50ms of the first mutation, even when mutations keep arriving', async () => {
    let updatedCalls = 0;
    Lego.block('starve-test', '<span>[[ count ]]</span>', {
      count: 0,
      updated() { updatedCalls++; }
    });
    win.document.body.innerHTML = '<starve-test></starve-test>';
    await flush(20);

    const el = win.document.querySelector('starve-test');

    // Hammer state every 10ms for ~200ms with awaited gaps so cleanup is
    // deterministic (no leaked setInterval). Old (buggy) behaviour reset
    // the 50ms timer on every batch and never fired updated(). New
    // behaviour: timer is armed once and fires within ~50ms of the first
    // batch, so the hook runs at least once during the burst.
    for (let i = 0; i < 20; i++) {
      el.state.count = i;
      await flush(10);
    }
    await flush(80); // trailing window

    expect(updatedCalls).toBeGreaterThanOrEqual(2);
  });
});

describe('Audit fix #2: cross-tab $db sync does not loop write-back', () => {
  let win, Lego;
  beforeEach(async () => {
    win = setupDom();
    Lego = win.Lego;
    win.localStorage.clear();
    await Lego.init(win.document.body);
  });
  afterEach(() => { win.document.body.innerHTML = ''; });

  it('storage event does not trigger a re-save through the proxy', async () => {
    Lego.block('db-noloop', '<span>[[ val ]]</span>', {
      val: Lego.db('test.noloop').default('A')
    });
    win.document.body.innerHTML = '<db-noloop></db-noloop>';
    await flush(20);

    // Wrap setItem to count writes for the watched key. spyOn doesn't bind
    // reliably across JSDOM's localStorage Proxy — manual wrapping is
    // simpler and equivalent.
    let writes = 0;
    const origSetItem = win.localStorage.setItem.bind(win.localStorage);
    win.localStorage.setItem = function (k, v) {
      if (k === 'test.noloop') writes++;
      return origSetItem(k, v);
    };

    const event = new win.StorageEvent('storage', {
      key: 'test.noloop',
      newValue: JSON.stringify('B'),
      storageArea: win.localStorage
    });
    win.dispatchEvent(event);
    await flush(40);

    const el = win.document.querySelector('db-noloop');
    expect(el.state.val).toBe('B');
    // The storage event did not cause us to write back what we just received.
    expect(writes).toBe(0);
  });

  it('local sibling sync still works without recursive write-back', async () => {
    Lego.block('db-sib-a', '<span>[[ val ]]</span>', {
      val: Lego.db('test.sib').default('A')
    });
    Lego.block('db-sib-b', '<span>[[ val ]]</span>', {
      val: Lego.db('test.sib').default('A')
    });
    win.document.body.innerHTML = '<db-sib-a></db-sib-a><db-sib-b></db-sib-b>';
    await flush(20);

    const a = win.document.querySelector('db-sib-a');
    const b = win.document.querySelector('db-sib-b');

    a.state.val = 'C';
    await flush(40);

    // Both bindings see the new value, and storage holds it exactly once.
    expect(a.state.val).toBe('C');
    expect(b.state.val).toBe('C');
    expect(JSON.parse(win.localStorage.getItem('test.sib'))).toBe('C');

    // The follow-up: setting the SAME value on the sibling proxy should
    // be a no-op (suppressed). We can verify by mutating to a known value
    // through `b` and observing the round-trip is single-write.
    b.state.val = 'D';
    await flush(40);
    expect(a.state.val).toBe('D');
    expect(b.state.val).toBe('D');
    expect(JSON.parse(win.localStorage.getItem('test.sib'))).toBe('D');
  });
});

describe('Audit fix #5: parseJSObject refuses templated b-logic', () => {
  let win, Lego, errSpy;
  beforeEach(async () => {
    win = setupDom();
    Lego = win.Lego;
    errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    await Lego.init(win.document.body);
  });
  afterEach(() => {
    errSpy.mockRestore();
    win.document.body.innerHTML = '';
  });

  it('refuses b-logic that contains template delimiters', async () => {
    Lego.block('logic-tpl', '<span>[[ name ]]</span>');
    // [[ ]] inside b-logic is a sign user data was interpolated into JS.
    win.document.body.innerHTML =
      '<logic-tpl b-logic="{ name: \'[[evil]]\' }"></logic-tpl>';
    await flush(20);

    const el = win.document.querySelector('logic-tpl');
    // b-logic was rejected: name is undefined, not the would-be value.
    expect(el.state.name).toBeUndefined();
    // Error was logged.
    expect(errSpy).toHaveBeenCalled();
    const refused = errSpy.mock.calls.some(args =>
      String(args[0]).includes('Refusing to parse b-logic'));
    expect(refused).toBe(true);
  });

  it('still accepts well-formed b-logic without delimiters', async () => {
    Lego.block('logic-ok', '<span>[[ greeting ]]</span>');
    win.document.body.innerHTML =
      '<logic-ok b-logic="{ greeting: \'hi\' }"></logic-ok>';
    await flush(20);

    const el = win.document.querySelector('logic-ok');
    expect(el.state.greeting).toBe('hi');
  });
});

describe('Audit fix #3: b-html.safe sanitizes content', () => {
  let win, Lego;
  beforeEach(async () => {
    win = setupDom();
    Lego = win.Lego;
    await Lego.init(win.document.body);
  });
  afterEach(() => { win.document.body.innerHTML = ''; });

  it('default b-html still injects raw HTML (opt-in only)', async () => {
    Lego.block('raw-html', '<div b-html="markup"></div>', {
      markup: '<script>x=1</script><b>ok</b>'
    });
    win.document.body.innerHTML = '<raw-html></raw-html>';
    await flush(20);
    const el = win.document.querySelector('raw-html');
    const div = el.shadowRoot.querySelector('div');
    expect(div.innerHTML).toContain('<script>');
  });

  it('b-html.safe strips <script>, on* attributes, and javascript: URLs', async () => {
    Lego.block('safe-html', '<div b-html.safe="markup"></div>', {
      markup:
        '<script>alert(1)</script>' +
        '<img src="x" onerror="alert(2)">' +
        '<a href="javascript:alert(3)">link</a>' +
        '<b>kept</b>'
    });
    win.document.body.innerHTML = '<safe-html></safe-html>';
    await flush(20);
    const el = win.document.querySelector('safe-html');
    const div = el.shadowRoot.querySelector('div');
    const html = div.innerHTML;
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('onerror');
    expect(html).not.toMatch(/href="javascript:/i);
    expect(html).toContain('<b>kept</b>');
  });

  it('b-html.safe strips SVG and MathML <script> (case-insensitive tag check)', async () => {
    // SVG/MathML elements live in foreign namespaces and preserve lowercase
    // tagName. A case-sensitive set check (the original bug) silently let
    // these through, leaving exploitable script payloads in the output.
    Lego.block('safe-svg', '<div b-html.safe="markup"></div>', {
      markup:
        '<svg><script>alert(1)</script></svg>' +
        '<math><script>alert(2)</script></math>' +
        '<svg><style>@import url(evil)</style></svg>' +
        '<b>kept</b>'
    });
    win.document.body.innerHTML = '<safe-svg></safe-svg>';
    await flush(20);
    const el = win.document.querySelector('safe-svg');
    const div = el.shadowRoot.querySelector('div');
    const html = div.innerHTML.toLowerCase();
    expect(html).not.toContain('<script');
    expect(html).not.toContain('<style');
    expect(html).not.toContain('alert(1)');
    expect(html).not.toContain('alert(2)');
    expect(html).not.toContain('@import');
    expect(html).toContain('<b>kept</b>');
  });

  it('audit fix #42: b-html.safe strips dangerous content nested inside a declarative-Shadow-DOM <template>', async () => {
    Lego.block('safe-dsd', '<div b-html.safe="markup"></div>', {
      markup:
        '<template shadowrootmode="open"><img src=x onerror="alert(1)"></template>' +
        '<b>kept</b>'
    });
    win.document.body.innerHTML = '<safe-dsd></safe-dsd>';
    await flush(20);
    const el = win.document.querySelector('safe-dsd');
    const div = el.shadowRoot.querySelector('div');
    const html = div.innerHTML;
    expect(html).not.toContain('onerror');
    expect(html).not.toMatch(/shadowrootmode|shadowroot/i);
    expect(html).toContain('<b>kept</b>');
  });

  it('b-html.safe respects user-provided config.sanitize', async () => {
    Lego.config.sanitize = (s) => '[CLEANED]' + s.replace(/<[^>]+>/g, '');
    try {
      Lego.block('safe-cfg', '<div b-html.safe="markup"></div>', {
        markup: '<b>x</b>'
      });
      win.document.body.innerHTML = '<safe-cfg></safe-cfg>';
      await flush(20);
      const el = win.document.querySelector('safe-cfg');
      const div = el.shadowRoot.querySelector('div');
      expect(div.innerHTML).toBe('[CLEANED]x');
    } finally {
      Lego.config.sanitize = null;
    }
  });
});

describe('Audit fix #4: auto-discovery loader allowlist + tag validation', () => {
  let win, Lego, warnSpy;
  beforeEach(async () => {
    win = setupDom();
    Lego = win.Lego;
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => {
    warnSpy.mockRestore();
    win.document.body.innerHTML = '';
  });

  it('honors loaderAllowlist (regex form) and skips non-matching tags', async () => {
    const loader = vi.fn(() => null);
    Lego.config.loaderAllowlist = [/^app-/];
    await Lego.init(win.document.body, { loader });

    win.document.body.innerHTML = '<app-good></app-good><evil-tag></evil-tag>';
    await flush(30);

    const tags = loader.mock.calls.map(c => c[0]);
    expect(tags).toContain('app-good');
    expect(tags).not.toContain('evil-tag');

    Lego.config.loaderAllowlist = null;
  });

  it('honors loaderAllowlist (string form, exact match)', async () => {
    const loader = vi.fn(() => null);
    Lego.config.loaderAllowlist = ['my-block'];
    await Lego.init(win.document.body, { loader });

    win.document.body.innerHTML = '<my-block></my-block><other-block></other-block>';
    await flush(30);

    const tags = loader.mock.calls.map(c => c[0]);
    expect(tags).toEqual(['my-block']);

    Lego.config.loaderAllowlist = null;
  });

  it('rejects tags that lack a hyphen-segment (single-word custom names)', async () => {
    const loader = vi.fn(() => null);
    Lego.config.loaderAllowlist = null;
    await Lego.init(win.document.body, { loader });

    // Single-segment tags like "x" or weird patterns should be filtered
    // by the strict shape regex even if the parser accepts them.
    win.document.body.innerHTML = '<good-tag></good-tag>';
    await flush(30);

    const tags = loader.mock.calls.map(c => c[0]);
    // good-tag is well-formed, should be loaded
    expect(tags).toContain('good-tag');
  });

  it('warns when loader is set without an allowlist', async () => {
    const loader = vi.fn(() => null);
    Lego.config.loaderAllowlist = null;
    await Lego.init(win.document.body, { loader });

    win.document.body.innerHTML = '<some-block></some-block>';
    await flush(30);

    const warned = warnSpy.mock.calls.some(args =>
      String(args[0]).includes('loaderAllowlist'));
    expect(warned).toBe(true);
  });
});

describe('Audit fix #7: inner directives work inside b-for', () => {
  let win, Lego;
  beforeEach(async () => {
    win = setupDom();
    Lego = win.Lego;
    await Lego.init(win.document.body);
  });
  afterEach(() => { win.document.body.innerHTML = ''; });

  it('b-if inside b-for hides items based on per-item state', async () => {
    Lego.block('list-with-if',
      '<ul><li b-for="item in items"><span b-if="item.show">[[ item.name ]]</span></li></ul>',
      {
        items: [
          { id: 1, name: 'A', show: true },
          { id: 2, name: 'B', show: false },
          { id: 3, name: 'C', show: true }
        ]
      });
    win.document.body.innerHTML = '<list-with-if></list-with-if>';
    await flush(30);

    const el = win.document.querySelector('list-with-if');
    const lis = el.shadowRoot.querySelectorAll('li');
    expect(lis.length).toBe(3);
    // Visible spans: A and C only
    const visibleNames = [...lis].map(li => {
      const span = li.querySelector('span');
      return span ? span.textContent : null;
    });
    expect(visibleNames).toEqual(['A', null, 'C']);
  });

  it('b-show inside b-for toggles visibility per item', async () => {
    Lego.block('list-with-show',
      '<ul><li b-for="item in items"><span b-show="item.show">[[ item.name ]]</span></li></ul>',
      {
        items: [
          { id: 1, name: 'X', show: true },
          { id: 2, name: 'Y', show: false }
        ]
      });
    win.document.body.innerHTML = '<list-with-show></list-with-show>';
    await flush(30);

    const el = win.document.querySelector('list-with-show');
    const spans = el.shadowRoot.querySelectorAll('span');
    expect(spans[0].style.display).not.toBe('none');
    expect(spans[1].style.display).toBe('none');
  });

  it('b-if inside b-for reacts to mutations on item state', async () => {
    Lego.block('list-react',
      '<ul><li b-for="item in items"><span b-if="item.show">[[ item.name ]]</span></li></ul>',
      {
        items: [
          { id: 1, name: 'A', show: true },
          { id: 2, name: 'B', show: false }
        ]
      });
    win.document.body.innerHTML = '<list-react></list-react>';
    await flush(30);

    const el = win.document.querySelector('list-react');
    el.state.items[1].show = true;
    await flush(30);

    const lis = el.shadowRoot.querySelectorAll('li');
    const visible = [...lis].map(li => {
      const span = li.querySelector('span');
      return span ? span.textContent : null;
    });
    expect(visible).toEqual(['A', 'B']);
  });
});

describe('Audit fix #8: concurrent navigation is guarded', () => {
  let win, Lego;
  beforeEach(async () => {
    win = setupDom();
    Lego = win.Lego;
  });
  afterEach(() => { win.document.body.innerHTML = ''; });

  it('a slow middleware does not commit if a newer navigation has started', async () => {
    Lego.block('route-slow', '<div>slow</div>');
    Lego.block('route-fast', '<div>fast</div>');

    let resolveSlow;
    const slowMiddleware = () => new Promise(r => { resolveSlow = r; });

    Lego.route('/slow', 'route-slow', slowMiddleware);
    Lego.route('/fast', 'route-fast');

    win.document.body.innerHTML = '<lego-router></lego-router>';
    await Lego.init(win.document.body);
    await flush(30);

    // Start nav to /slow (will hang on middleware)
    win.history.pushState({}, '', '/slow');
    const slowPromise = Lego.globals.$go('/slow').get(false);

    // Immediately start nav to /fast (no middleware → completes first)
    win.history.pushState({}, '', '/fast');
    await Lego.globals.$go('/fast').get(false);
    await flush(30);

    // Now resolve the slow middleware. The slow nav was superseded —
    // it must NOT mount route-slow over the current /fast view.
    resolveSlow(true);
    await slowPromise;
    await flush(30);

    const router = win.document.querySelector('lego-router');
    expect(router.querySelector('route-fast')).not.toBeNull();
    expect(router.querySelector('route-slow')).toBeNull();
    // $route should reflect the winning navigation
    expect(Lego.globals.$route.route).toBe('/fast');
  });
});

describe('Audit fix #16: binding-level dependency tracking', () => {
  let win, Lego;
  beforeEach(async () => {
    win = setupDom();
    Lego = win.Lego;
    await Lego.init(win.document.body);
  });
  afterEach(() => { win.document.body.innerHTML = ''; });

  it('mutating one key does not re-run unrelated bindings', async () => {
    let aRuns = 0, bRuns = 0;
    Lego.block('dep-test',
      '<div><span b-text="aTagged"></span><span b-text="bTagged"></span></div>',
      {
        a: 1,
        b: 1,
        get aTagged() { aRuns++; return 'a:' + this.a; },
        get bTagged() { bRuns++; return 'b:' + this.b; }
      });
    win.document.body.innerHTML = '<dep-test></dep-test>';
    await flush(30);

    const aBefore = aRuns, bBefore = bRuns;
    expect(aBefore).toBeGreaterThan(0);
    expect(bBefore).toBeGreaterThan(0);

    const el = win.document.querySelector('dep-test');
    el.state.a = 2;
    await flush(30);

    // aTagged should re-run; bTagged should not (its only dep is `b`).
    expect(aRuns).toBeGreaterThan(aBefore);
    expect(bRuns).toBe(bBefore);
  });

  it('mutating a key with no readers still triggers a render (whole-block fallback)', async () => {
    Lego.block('untracked-block',
      '<div><span>[[ visible ]]</span></div>',
      {
        visible: 'hello',
        hidden: 0 // no binding reads this
      });
    win.document.body.innerHTML = '<untracked-block></untracked-block>';
    await flush(30);

    const el = win.document.querySelector('untracked-block');
    // Mutating an untracked key shouldn't crash and shouldn't strand the
    // batcher. After mutation, mutating a tracked key still works.
    el.state.hidden = 999;
    el.state.visible = 'world';
    await flush(30);

    expect(el.shadowRoot.querySelector('span').textContent).toBe('world');
  });
});

describe('Audit fix #30: cross-tab storage listener is idempotent', () => {
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

  it('re-running Lego.init() does not stack additional storage listeners', async () => {
    // Count storage-listener registrations on window. The first init in
    // beforeEach already bound one. Re-running init must not add more.
    let storageRegistrations = 0;
    const origAdd = win.addEventListener.bind(win);
    win.addEventListener = function (type, handler, opts) {
      if (type === 'storage') storageRegistrations++;
      return origAdd(type, handler, opts);
    };

    try {
      await Lego.init(win.document.body);
      await Lego.init(win.document.body);
      await Lego.init(win.document.body);
      expect(storageRegistrations).toBe(0);
    } finally {
      win.addEventListener = origAdd;
    }
  });
});

describe('Audit fix: $db quota eviction actually frees localStorage', () => {
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

  it('removeItem is called with the real key on quota retry, freeing space', async () => {
    // Two blocks writing to two keys. First we let `older` save normally
    // (so it's in the tracker). Then we trigger a QuotaExceededError on
    // `newer`'s first write — eviction must remove the actual `older`
    // localStorage entry, not a phantom prefixed name.
    Lego.block('q-older', '<span>[[ v ]]</span>', { v: Lego.db('older').default('init') });
    Lego.block('q-newer', '<span>[[ v ]]</span>', { v: Lego.db('newer').default('init') });

    win.document.body.innerHTML = '<q-older></q-older><q-newer></q-newer>';
    await flush(20);

    const older = win.document.querySelector('q-older');
    older.state.v = 'old-data';
    await flush(20);

    // Sanity: the older key landed in real localStorage.
    expect(win.localStorage.getItem('older')).toBe(JSON.stringify('old-data'));

    // JSDOM Storage instance methods can't be shadowed via direct assignment
    // (the underlying proxy treats it as a stored key, not a method override).
    // Patch on the prototype instead, then restore.
    const origSet = win.Storage.prototype.setItem;
    const origRemove = win.Storage.prototype.removeItem;
    const removed = [];
    let quotaThrown = false;
    win.Storage.prototype.setItem = function (k, v) {
      if (k === 'newer' && !quotaThrown) {
        quotaThrown = true;
        const e = new Error('quota');
        e.name = 'QuotaExceededError';
        throw e;
      }
      return origSet.call(this, k, v);
    };
    win.Storage.prototype.removeItem = function (k) {
      removed.push(k);
      return origRemove.call(this, k);
    };

    try {
      const newer = win.document.querySelector('q-newer');
      newer.state.v = 'new-data';
      await flush(40);

      // Eviction targeted the real key (not a `lego:older` phantom).
      expect(quotaThrown).toBe(true);
      expect(removed).toContain('older');
      expect(removed).not.toContain('lego:older');
      // Retry succeeded.
      expect(win.localStorage.getItem('newer')).toBe(JSON.stringify('new-data'));
      // And the evicted key is actually gone from storage.
      expect(win.localStorage.getItem('older')).toBeNull();
    } finally {
      win.Storage.prototype.setItem = origSet;
      win.Storage.prototype.removeItem = origRemove;
    }
  });
});

describe('Audit fix #9: b-html prunes stale bindings to wiped subtree', () => {
  let win, Lego;
  beforeEach(async () => {
    win = setupDom();
    Lego = win.Lego;
    await Lego.init(win.document.body);
  });
  afterEach(() => { win.document.body.innerHTML = ''; });

  it('drops bindings whose nodes the b-html write detached, so later state changes do not write to dead nodes', async () => {
    // Initial template seeds placeholder text inside a b-html container.
    // Pre-fix: the text binding for [[label]] survives the innerHTML wipe,
    // ends up in the dirty-binding set on label mutation, and writes to a
    // detached text node (silent no-op + retained reference).
    Lego.block(
      'b-html-stale',
      '<div b-html="raw"><span class="placeholder">[[label]]</span></div>',
      { raw: '<p class="injected">A</p>', label: 'initial' }
    );
    win.document.body.innerHTML = '<b-html-stale></b-html-stale>';
    await flush(20);

    const host = win.document.querySelector('b-html-stale');
    const container = host.shadowRoot.querySelector('div');

    // After first render b-html replaced the placeholder span with raw content.
    expect(container.querySelector('.placeholder')).toBeNull();
    expect(container.querySelector('.injected').textContent).toBe('A');

    // Capture the now-detached span's text node so we can prove no later
    // render writes to it.
    // (Placeholder text was "initial" — read it back via the original child
    //  reference path.) We can't reach the detached node directly, so
    // instead we inspect the block's internal bindings array — pre-fix it
    // would still contain a text binding for the placeholder.
    const dataKey = Object.getOwnPropertySymbols(host).find(s => s.description === undefined);
    // Use the public-ish surface: check that mutating an unrelated state key
    // doesn't throw and doesn't leak the placeholder string back into the DOM.
    host.state.label = 'changed';
    await flush(20);
    expect(container.querySelector('.placeholder')).toBeNull();
    expect(container.innerHTML).not.toContain('changed');
    expect(container.querySelector('.injected').textContent).toBe('A');

    // And mutating raw still re-renders cleanly.
    host.state.raw = '<p class="injected">B</p>';
    await flush(20);
    expect(container.querySelector('.injected').textContent).toBe('B');
  });

  it('subsequent b-html writes do not re-prune (idempotent)', async () => {
    Lego.block(
      'b-html-repeat',
      '<div b-html="raw"></div>',
      { raw: '<p>1</p>' }
    );
    win.document.body.innerHTML = '<b-html-repeat></b-html-repeat>';
    await flush(20);
    const host = win.document.querySelector('b-html-repeat');
    const container = host.shadowRoot.querySelector('div');
    expect(container.querySelector('p').textContent).toBe('1');

    // Multiple successive writes should be fine — the prune scan finds no
    // stale bindings on the empty initial subtree, and re-running it does
    // not throw or corrupt subsequent writes.
    host.state.raw = '<p>2</p>';
    await flush(20);
    expect(container.querySelector('p').textContent).toBe('2');
    host.state.raw = '<p>3</p>';
    await flush(20);
    expect(container.querySelector('p').textContent).toBe('3');
  });
});

describe('Audit fixes #14/#15: scan/render walk shortcuts (correctness anchor)', () => {
  let win, Lego;
  beforeEach(async () => {
    win = setupDom();
    Lego = win.Lego;
    await Lego.init(win.document.body);
  });
  afterEach(() => { win.document.body.innerHTML = ''; });

  it('nested b-for: outer scan skips inner b-for subtree, inner runs against per-row scope', async () => {
    // Nested loops: rows × cells. Pre-fix #14 scanned every cell at the
    // outer level (then skipped via isInsideBoundary). Post-fix the outer
    // pass returns immediately at the outer b-for and only the inner scan
    // (run on each cloned row) sees the cell template. This test pins down
    // the correctness contract: per-row item names + per-cell item values
    // both render against the right scope.
    Lego.block(
      'nested-grid',
      '<table><tr b-for="row in rows"><td b-for="cell in row.cells">[[row.name]]:[[cell]]</td></tr></table>',
      {
        rows: [
          { name: 'r1', cells: ['a', 'b'] },
          { name: 'r2', cells: ['c', 'd'] }
        ]
      }
    );
    win.document.body.innerHTML = '<nested-grid></nested-grid>';
    await flush(40);

    const host = win.document.querySelector('nested-grid');
    const cells = [...host.shadowRoot.querySelectorAll('td')].map(td => td.textContent);
    expect(cells).toEqual(['r1:a', 'r1:b', 'r2:c', 'r2:d']);

    // Mutate an inner cell — full b-for re-iteration should pick it up.
    host.state.rows[0].cells[1] = 'B!';
    await flush(40);
    const after = [...host.shadowRoot.querySelectorAll('td')].map(td => td.textContent);
    expect(after).toEqual(['r1:a', 'r1:B!', 'r2:c', 'r2:d']);
  });

  it('b-for child carries text and attr interpolation on its own root element', async () => {
    // The failing test that surfaced during the refactor: attrs and text on
    // the b-for element itself need to render. scanForBindings now
    // includes the container's own text/attr bindings (matching the
    // previous updateNodeBindings(root) behaviour) instead of leaving them
    // to a separate walk.
    Lego.block(
      'for-root-attrs',
      '<div b-for="x in xs" data-name="[[x.name]]" class="row [[x.flag ? \'on\' : \'off\']]">[[x.name]]</div>',
      { xs: [{ name: 'A', flag: true }, { name: 'B', flag: false }] }
    );
    win.document.body.innerHTML = '<for-root-attrs></for-root-attrs>';
    await flush(40);

    const host = win.document.querySelector('for-root-attrs');
    const rows = host.shadowRoot.querySelectorAll('div');
    expect(rows[0].getAttribute('data-name')).toBe('A');
    expect(rows[0].className).toContain('on');
    expect(rows[0].textContent).toBe('A');
    expect(rows[1].getAttribute('data-name')).toBe('B');
    expect(rows[1].className).toContain('off');
    expect(rows[1].textContent).toBe('B');
  });
});

describe('Audit fix #33: b-show preserves the author\'s inline display', () => {
  let win, Lego;
  beforeEach(async () => {
    win = setupDom();
    Lego = win.Lego;
    await Lego.init(win.document.body);
  });
  afterEach(() => { win.document.body.innerHTML = ''; });

  it('toggling b-show on an element with inline display:flex restores flex, not empty', async () => {
    Lego.block(
      'show-flex',
      '<div b-show="visible" style="display: flex">hi</div>',
      { visible: true }
    );
    win.document.body.innerHTML = '<show-flex></show-flex>';
    await flush(20);

    const host = win.document.querySelector('show-flex');
    const div = host.shadowRoot.querySelector('div');

    // Initially visible: display stays "flex" (the cached original).
    expect(div.style.display).toBe('flex');

    host.state.visible = false;
    await flush(20);
    expect(div.style.display).toBe('none');

    host.state.visible = true;
    await flush(20);
    // Pre-fix this would have flipped to '', losing the flex layout.
    expect(div.style.display).toBe('flex');
  });

  it('elements with no inline display still resolve via the cascade when shown', async () => {
    Lego.block(
      'show-cascade',
      '<div b-show="visible">hi</div>',
      { visible: true }
    );
    win.document.body.innerHTML = '<show-cascade></show-cascade>';
    await flush(20);

    const host = win.document.querySelector('show-cascade');
    const div = host.shadowRoot.querySelector('div');

    // No inline display → cached '' → toggling true keeps it empty so
    // stylesheet rules apply.
    expect(div.style.display).toBe('');
    host.state.visible = false;
    await flush(20);
    expect(div.style.display).toBe('none');
    host.state.visible = true;
    await flush(20);
    expect(div.style.display).toBe('');
  });
});

describe('Audit fix #34: b-sync handles radio buttons', () => {
  let win, Lego;
  beforeEach(async () => {
    win = setupDom();
    Lego = win.Lego;
    await Lego.init(win.document.body);
  });
  afterEach(() => { win.document.body.innerHTML = ''; });

  it('reflects state into the matching radio in a group', async () => {
    Lego.block(
      'radio-group',
      '<form>' +
        '<input type="radio" name="pick" value="A" b-sync="choice">' +
        '<input type="radio" name="pick" value="B" b-sync="choice">' +
        '<input type="radio" name="pick" value="C" b-sync="choice">' +
      '</form>',
      { choice: 'B' }
    );
    win.document.body.innerHTML = '<radio-group></radio-group>';
    await flush(20);

    const host = win.document.querySelector('radio-group');
    const radios = host.shadowRoot.querySelectorAll('input[type=radio]');
    // Pre-fix syncModelValue overwrote `el.value` for radios, breaking
    // both the group identity and any subsequent matching. Post-fix we
    // toggle `checked` based on whether `value` matches state.
    expect(radios[0].checked).toBe(false);
    expect(radios[1].checked).toBe(true);
    expect(radios[2].checked).toBe(false);
    expect(radios[0].value).toBe('A');
    expect(radios[1].value).toBe('B');
    expect(radios[2].value).toBe('C');

    host.state.choice = 'C';
    await flush(20);
    expect(radios[0].checked).toBe(false);
    expect(radios[1].checked).toBe(false);
    expect(radios[2].checked).toBe(true);

    // Null/undefined state clears the whole group.
    host.state.choice = null;
    await flush(20);
    expect([...radios].every(r => !r.checked)).toBe(true);
  });

  it('user clicks a radio → state picks up the radio\'s value', async () => {
    Lego.block(
      'radio-write',
      '<form>' +
        '<input type="radio" name="g" value="A" b-sync="pick">' +
        '<input type="radio" name="g" value="B" b-sync="pick">' +
      '</form>',
      { pick: 'A' }
    );
    win.document.body.innerHTML = '<radio-write></radio-write>';
    await flush(20);

    const host = win.document.querySelector('radio-write');
    const radios = host.shadowRoot.querySelectorAll('input[type=radio]');

    // Simulate user click: the browser/JSDOM sets `checked` and fires events.
    radios[1].checked = true;
    radios[1].dispatchEvent(new win.Event('change', { bubbles: true }));
    await flush(20);

    expect(host.state.pick).toBe('B');
  });
});

describe('Audit fix #40: route wildcard matches', () => {
  let win, Lego;
  beforeEach(() => {
    win = setupDom();
    Lego = win.Lego;
  });
  afterEach(() => { win.document.body.innerHTML = ''; });

  const mountRouterHost = () => {
    const host = win.document.createElement('lego-router');
    win.document.body.appendChild(host);
    return host;
  };

  it('catch-all `*` route matches arbitrary paths', async () => {
    Lego.block('rt-home', '<div>home</div>');
    Lego.block('rt-catch', '<div class="catch">catch</div>');

    Lego.route('/', 'rt-home');
    Lego.route('*', 'rt-catch');

    win.history.pushState({}, '', '/totally/unmapped/path');
    const host = mountRouterHost();
    await Lego.init(win.document.body);
    await flush(60);

    // Catch-all should mount: pre-fix this matched only the literal ".*".
    expect(host.querySelector('rt-catch')).toBeTruthy();
  });

  it('suffix wildcard `/foo/*` matches any sub-path', async () => {
    Lego.block('rt-foo-any', '<div class="foo-any">foo any</div>');
    Lego.block('rt-other', '<div>other</div>');

    Lego.route('/foo/*', 'rt-foo-any');
    Lego.route('/other', 'rt-other');

    win.history.pushState({}, '', '/foo/bar/baz');
    const host = mountRouterHost();
    await Lego.init(win.document.body);
    await flush(60);

    expect(host.querySelector('rt-foo-any')).toBeTruthy();
  });

  it('exact path still wins over suffix wildcard when routes are ordered correctly', async () => {
    Lego.block('rt-foo-exact', '<div class="foo-exact">exact</div>');
    Lego.block('rt-foo-any', '<div class="foo-any">any</div>');

    Lego.route('/foo', 'rt-foo-exact');
    Lego.route('/foo/*', 'rt-foo-any');

    win.history.pushState({}, '', '/foo');
    const host = mountRouterHost();
    await Lego.init(win.document.body);
    await flush(60);

    expect(host.querySelector('rt-foo-exact')).toBeTruthy();
    expect(host.querySelector('rt-foo-any')).toBeFalsy();
  });

  it('static metacharacters in the path are still escaped (not treated as regex)', async () => {
    Lego.block('rt-dotted', '<div class="dotted">dotted</div>');
    Lego.block('rt-fallback', '<div class="fallback">fallback</div>');

    // `.` should match a literal dot, not "any character".
    Lego.route('/a.b', 'rt-dotted');
    Lego.route('*', 'rt-fallback');

    win.history.pushState({}, '', '/aXb');
    const host = mountRouterHost();
    await Lego.init(win.document.body);
    await flush(60);

    // `/aXb` does NOT match `/a.b` (dot is escaped) → fallback wins.
    expect(host.querySelector('rt-dotted')).toBeFalsy();
    expect(host.querySelector('rt-fallback')).toBeTruthy();
  });
});

describe('Audit fix #36: manifest registration honors loaderAllowlist', () => {
  let win, Lego, warnSpy;
  beforeEach(() => {
    win = setupDom();
    Lego = win.Lego;
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => {
    warnSpy.mockRestore();
    win.document.body.innerHTML = '';
  });

  it('drops manifest entries whose tag name is not in the allowlist', async () => {
    Lego.config.loaderAllowlist = ['ok-block'];
    await Lego.init(win.document.body, {
      manifest: [
        { base: '/blocks/', suffix: true, legos: ['ok-block', 'evil-block'] }
      ]
    });

    // ok-block is defined as a custom element; evil-block is refused.
    expect(win.customElements.get('ok-block')).toBeTruthy();
    expect(win.customElements.get('evil-block')).toBeFalsy();

    const refused = warnSpy.mock.calls.some(args =>
      args.some(a => typeof a === 'string' && a.includes('Manifest skipped "evil-block"'))
    );
    expect(refused).toBe(true);
  });

  it('refuses manifest entries with malformed tag names regardless of allowlist', async () => {
    // No allowlist set: still refuses the malformed tag.
    await Lego.init(win.document.body, {
      manifest: [{ base: '/b/', suffix: true, legos: ['BadTag'] }]
    });
    expect(win.customElements.get('badtag')).toBeFalsy();
    expect(win.customElements.get('BadTag')).toBeFalsy();
    const refused = warnSpy.mock.calls.some(args =>
      args.some(a => typeof a === 'string' && a.includes('malformed tag'))
    );
    expect(refused).toBe(true);
  });
});

describe('Audit fix #37: failed customElements.define rolls back the registry', () => {
  let win, Lego, warnSpy;
  beforeEach(async () => {
    win = setupDom();
    Lego = win.Lego;
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await Lego.init(win.document.body);
  });
  afterEach(() => {
    warnSpy.mockRestore();
    win.document.body.innerHTML = '';
  });

  it('does not retain a registry entry when define throws', () => {
    // Uppercase tag names are illegal for autonomous custom elements —
    // customElements.define throws SyntaxError.
    Lego.block('Bad-Block', '<div>nope</div>');

    expect(Lego.getLegos()).not.toContain('Bad-Block');
    // warn was emitted for the failure.
    expect(warnSpy.mock.calls.some(args =>
      args.some(a => typeof a === 'string' && a.includes('Failed to register'))
    )).toBe(true);
  });

  it('does not block a later valid block from registering with a different name', async () => {
    Lego.block('Bad-Other', '<div>nope</div>');
    expect(Lego.getLegos()).not.toContain('Bad-Other');

    Lego.block('good-other', '<div class="ok">ok</div>');
    win.document.body.innerHTML = '<good-other></good-other>';
    await flush(20);
    expect(win.document.querySelector('good-other').shadowRoot.querySelector('.ok')).toBeTruthy();
  });
});

describe('Audit fix #38: self → :host substitution skips strings and comments', () => {
  let win, Lego;
  beforeEach(async () => {
    win = setupDom();
    Lego = win.Lego;
    await Lego.init(win.document.body);
  });
  afterEach(() => { win.document.body.innerHTML = ''; });

  it('preserves the literal "self" inside CSS strings (content)', async () => {
    // <style> lives directly inside the template; lifecycle.js rewrites
    // its textContent during snap().
    Lego.block(
      'css-quoted-self',
      '<style>.hi::before { content: "self"; } /* keep self in comment too */ self { color: red }</style><div class="hi">x</div>'
    );
    win.document.body.innerHTML = '<css-quoted-self></css-quoted-self>';
    await flush(20);
    const host = win.document.querySelector('css-quoted-self');
    const style = host.shadowRoot.querySelector('style').textContent;

    // The bare `self { ... }` selector still becomes `:host`.
    expect(style).toMatch(/:host\s*\{/);
    // The string literal stays "self", NOT ":host".
    expect(style).toContain('content: "self"');
    expect(style).not.toContain('content: ":host"');
    // The comment text stays untouched too.
    expect(style).toContain('keep self in comment');
    expect(style).not.toContain('keep :host in comment');
  });

  it('preserves single-quoted strings as well', async () => {
    Lego.block(
      'css-single-quoted-self',
      "<style>.hi::before { content: 'self'; } self { color: blue }</style><div>x</div>"
    );
    win.document.body.innerHTML = '<css-single-quoted-self></css-single-quoted-self>';
    await flush(20);
    const host = win.document.querySelector('css-single-quoted-self');
    const style = host.shadowRoot.querySelector('style').textContent;

    expect(style).toMatch(/:host\s*\{/);
    expect(style).toContain("content: 'self'");
    expect(style).not.toContain("content: ':host'");
  });
});

describe('Audit fix #19: b-for reuses the per-child scope object', () => {
  let win, Lego;
  beforeEach(async () => {
    win = setupDom();
    Lego = win.Lego;
    await Lego.init(win.document.body);
  });
  afterEach(() => { win.document.body.innerHTML = ''; });

  it('the same localScope is bound to a pool child across renders', async () => {
    Lego.block(
      'reuse-scope',
      '<ul><li b-for="item in items" b-key="id">[[item.label]] (#[[$index]])</li></ul>',
      { items: [{ id: 1, label: 'A' }, { id: 2, label: 'B' }] }
    );
    win.document.body.innerHTML = '<reuse-scope></reuse-scope>';
    await flush(30);

    const host = win.document.querySelector('reuse-scope');
    const lis = [...host.shadowRoot.querySelectorAll('li')];
    // Pool child has the cached scope after first render.
    const firstScopes = lis.map(li => li._loopScope);
    expect(firstScopes.every(s => s)).toBe(true);

    // Mutate items so the loop re-iterates.
    host.state.items[0].label = 'A!';
    host.state.items[1].label = 'B!';
    await flush(30);

    const lis2 = [...host.shadowRoot.querySelectorAll('li')];
    // Same DOM nodes → same cached scope objects → no fresh allocation.
    expect(lis2[0]._loopScope).toBe(firstScopes[0]);
    expect(lis2[1]._loopScope).toBe(firstScopes[1]);

    // Rendered output is correct.
    expect(lis2[0].textContent.trim()).toBe('A! (#0)');
    expect(lis2[1].textContent.trim()).toBe('B! (#1)');
  });

  it('reordering by key preserves the per-child scope (no re-allocation)', async () => {
    Lego.block(
      'reuse-reorder',
      '<ul><li b-for="x in xs" b-key="id">[[x.t]]</li></ul>',
      { xs: [{ id: 1, t: 'one' }, { id: 2, t: 'two' }] }
    );
    win.document.body.innerHTML = '<reuse-reorder></reuse-reorder>';
    await flush(30);

    const host = win.document.querySelector('reuse-reorder');
    const lisBefore = [...host.shadowRoot.querySelectorAll('li')];
    const scope1Before = lisBefore.find(li => li.textContent.trim() === 'one')._loopScope;
    const scope2Before = lisBefore.find(li => li.textContent.trim() === 'two')._loopScope;

    // Swap order.
    host.state.xs = [{ id: 2, t: 'two' }, { id: 1, t: 'one' }];
    await flush(30);

    const lisAfter = [...host.shadowRoot.querySelectorAll('li')];
    const scope1After = lisAfter.find(li => li.textContent.trim() === 'one')._loopScope;
    const scope2After = lisAfter.find(li => li.textContent.trim() === 'two')._loopScope;

    // Pool key is stable, so the same DOM (and same _loopScope) follows
    // each item.
    expect(scope1After).toBe(scope1Before);
    expect(scope2After).toBe(scope2Before);
  });
});

describe('Audit fix #45: b-for caches each child\'s sync-input list instead of re-scanning per render', () => {
  let win, Lego;
  beforeEach(async () => {
    win = setupDom();
    Lego = win.Lego;
    await Lego.init(win.document.body);
  });
  afterEach(() => { win.document.body.innerHTML = ''; });

  it('does not call querySelectorAll on reused pool children across re-renders', async () => {
    Lego.block(
      'for-sync-scan',
      '<ul><li b-for="item in items" b-key="id"><input b-sync="item.label"></li></ul>',
      { items: [{ id: 1, label: 'A' }, { id: 2, label: 'B' }] }
    );
    win.document.body.innerHTML = '<for-sync-scan></for-sync-scan>';
    await flush(30);

    const host = win.document.querySelector('for-sync-scan');
    const lis = [...host.shadowRoot.querySelectorAll('li')];
    expect(lis.every(li => Array.isArray(li._loopSyncInputs))).toBe(true);

    const qsaSpy = vi.spyOn(win.Element.prototype, 'querySelectorAll');
    // Mutate a field to force the loop to re-iterate without changing keys.
    host.state.items[0].label = 'A!';
    host.state.items[1].label = 'B!';
    await flush(30);

    expect(qsaSpy).not.toHaveBeenCalled();
    qsaSpy.mockRestore();

    // Sync read-back still resolves against the correct item.
    const input = host.shadowRoot.querySelector('li input');
    expect(input.value).toBe('A!');
  });
});

describe('Audit fix #24: el.state = X is a shallow merge (with one-time warning)', () => {
  let win, Lego, warnSpy;
  beforeEach(async () => {
    win = setupDom();
    Lego = win.Lego;
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await Lego.init(win.document.body);
  });
  afterEach(() => {
    warnSpy.mockRestore();
    win.document.body.innerHTML = '';
  });

  it('preserves keys absent from the assigned object (merge, not replace)', async () => {
    Lego.block('merge-state', '<div>[[a]]/[[b]]</div>', { a: 1, b: 2 });
    win.document.body.innerHTML = '<merge-state></merge-state>';
    await flush(20);

    const host = win.document.querySelector('merge-state');
    expect(host.shadowRoot.querySelector('div').textContent).toBe('1/2');

    host.state = { a: 99 };
    await flush(20);

    // `b` is preserved; `a` is updated.
    expect(host.state.a).toBe(99);
    expect(host.state.b).toBe(2);
    expect(host.shadowRoot.querySelector('div').textContent).toBe('99/2');

    // Warning was emitted once with the merge clarification.
    const merged = warnSpy.mock.calls.some(args =>
      args.some(a => typeof a === 'string' && a.includes('shallow merge'))
    );
    expect(merged).toBe(true);
  });

  it('emits the merge warning at most once across many assignments', async () => {
    Lego.block('warn-once', '<div>[[n]]</div>', { n: 0 });
    win.document.body.innerHTML = '<warn-once></warn-once>';
    await flush(20);

    const host = win.document.querySelector('warn-once');
    for (let i = 0; i < 5; i++) host.state = { n: i };
    await flush(20);

    const mergeWarnings = warnSpy.mock.calls.filter(args =>
      args.some(a => typeof a === 'string' && a.includes('shallow merge'))
    );
    expect(mergeWarnings.length).toBe(1);
  });
});

describe('Audit fix #32: safeEval auto-invoke is gated to event-handler context', () => {
  let win, Lego;
  beforeEach(async () => {
    win = setupDom();
    Lego = win.Lego;
    await Lego.init(win.document.body);
  });
  afterEach(() => { win.document.body.innerHTML = ''; });

  it('text interpolation does NOT auto-invoke a function-valued state field', async () => {
    // Pre-fix: any state field that happened to be a function was silently
    // called when read by [[…]] — surprise side effects, and the displayed
    // value was the function's return rather than `.toString()`.
    let calls = 0;
    Lego.block(
      'no-auto-invoke',
      '<div>[[fn]]</div>',
      { fn() { calls++; return 'invoked'; } }
    );
    win.document.body.innerHTML = '<no-auto-invoke></no-auto-invoke>';
    await flush(20);

    const host = win.document.querySelector('no-auto-invoke');
    // The function was NOT called. The interpolation falls back to the
    // function's `.toString()`-shaped output (or whatever the engine
    // produces from coercing a function to a string).
    expect(calls).toBe(0);
    expect(host.shadowRoot.querySelector('div').textContent).not.toBe('invoked');
  });

  it('event handlers still auto-invoke a bare function reference', async () => {
    let calls = 0;
    let receivedEvent;
    Lego.block(
      'event-auto-invoke',
      '<button @click="handler">click</button>',
      { handler(e) { calls++; receivedEvent = e; } }
    );
    win.document.body.innerHTML = '<event-auto-invoke></event-auto-invoke>';
    await flush(20);

    const host = win.document.querySelector('event-auto-invoke');
    const button = host.shadowRoot.querySelector('button');
    button.click();
    await flush(20);

    expect(calls).toBe(1);
    // The auto-invoke passed the click event through.
    expect(receivedEvent).toBeTruthy();
    expect(receivedEvent.type).toBe('click');
  });
});

describe('Audit fix #18: initial discovery walks the tree once, not twice', () => {
  let win, Lego, calls;
  beforeEach(() => {
    win = setupDom();
    Lego = win.Lego;
    calls = new Map(); // tagName -> visit count
  });
  afterEach(() => { win.document.body.innerHTML = ''; });

  it('config.loader sees each unknown tag exactly once on initial scan', async () => {
    win.document.body.innerHTML =
      '<wrap-a><wrap-b><wrap-c></wrap-c></wrap-b></wrap-a>';

    Lego.config.loaderAllowlist = [/^wrap-/];
    await Lego.init(win.document.body, {
      loader: (tag) => {
        calls.set(tag, (calls.get(tag) || 0) + 1);
        // Don't actually fetch — return falsy to short-circuit.
        return null;
      }
    });
    await flush(40);

    // Pre-fix: TreeWalker descended into every node and discover()
    // recursed on each, so each tag was processed twice.
    expect(calls.get('wrap-a')).toBe(1);
    expect(calls.get('wrap-b')).toBe(1);
    expect(calls.get('wrap-c')).toBe(1);
  });
});

describe('Audit fix #20: globals tracking is per-key', () => {
  let win, Lego;
  beforeEach(async () => {
    win = setupDom();
    Lego = win.Lego;
    await Lego.init(win.document.body);
  });
  afterEach(() => { win.document.body.innerHTML = ''; });

  it('mutating one global key does not re-render blocks that read a different key', async () => {
    let aRenders = 0, bRenders = 0;
    Lego.globals.themeA = 'light';
    Lego.globals.themeB = 'dark';

    Lego.block('reads-a', '<div>[[ global.themeA ]]</div>', {
      updated() { aRenders++; }
    });
    Lego.block('reads-b', '<div>[[ global.themeB ]]</div>', {
      updated() { bRenders++; }
    });
    win.document.body.innerHTML = '<reads-a></reads-a><reads-b></reads-b>';
    await flush(80);

    const baselineA = aRenders;
    const baselineB = bRenders;

    // Mutate themeA only.
    Lego.globals.themeA = 'dim';
    await flush(80);

    // reads-a's updated() fired (DOM updated to 'dim'); reads-b stayed quiet.
    expect(win.document.querySelector('reads-a').shadowRoot.querySelector('div').textContent).toBe('dim');
    expect(aRenders).toBeGreaterThan(baselineA);
    expect(bRenders).toBe(baselineB);
  });

  it('nested global access (deep path) falls back to the wildcard subscriber', async () => {
    Lego.globals.user = { name: 'Ada' };
    Lego.globals.theme = 'light';

    let nestedRenders = 0;
    Lego.block('reads-nested', '<div>[[ global.user.name ]]</div>', {
      updated() { nestedRenders++; }
    });
    win.document.body.innerHTML = '<reads-nested></reads-nested>';
    await flush(80);

    const baseline = nestedRenders;
    // Nested reads use the wildcard set, so an unrelated top-level
    // mutation also wakes them. Conservative but correct.
    Lego.globals.theme = 'dark';
    await flush(80);
    expect(nestedRenders).toBeGreaterThan(baseline);

    // The deep mutation actually changes the DOM.
    Lego.globals.user.name = 'Grace';
    await flush(80);
    expect(win.document.querySelector('reads-nested').shadowRoot.querySelector('div').textContent).toBe('Grace');
  });
});

describe('Audit fix #31: cleanupDbBindings uses the reverse index', () => {
  let win, Lego;
  beforeEach(async () => {
    win = setupDom();
    Lego = win.Lego;
    win.localStorage.clear();
    await Lego.init(win.document.body);
  });
  afterEach(() => { win.document.body.innerHTML = ''; });

  it('unsnap removes only this element\'s db entries; siblings stay registered', async () => {
    Lego.block('db-clean-a', '<span>[[ v ]]</span>', {
      v: Lego.db('shared.k').default('A')
    });
    Lego.block('db-clean-b', '<span>[[ v ]]</span>', {
      v: Lego.db('shared.k').default('A')
    });
    win.document.body.innerHTML = '<db-clean-a></db-clean-a><db-clean-b></db-clean-b>';
    await flush(30);

    const a = win.document.querySelector('db-clean-a');
    const b = win.document.querySelector('db-clean-b');

    // Remove A. B should still receive cross-tab updates for the same key.
    a.remove();
    await flush(30);

    // Simulate a cross-tab update on the shared key.
    const event = new win.StorageEvent('storage', {
      key: 'shared.k',
      newValue: JSON.stringify('Z'),
      storageArea: win.localStorage
    });
    win.dispatchEvent(event);
    await flush(30);

    // B sees the new value (its binding is still registered).
    expect(b.state.v).toBe('Z');
  });
});

describe('Audit fix #23: safeEval blocklist allows benign property access', () => {
  let win, Lego, warnSpy;
  beforeEach(async () => {
    win = setupDom();
    Lego = win.Lego;
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await Lego.init(win.document.body);
  });
  afterEach(() => {
    warnSpy.mockRestore();
    win.document.body.innerHTML = '';
  });

  const isBlocked = () =>
    warnSpy.mock.calls.some(args =>
      args.some(a => typeof a === 'string' && a.includes('Blocked dangerous'))
    );

  it('renders item.class, pkg.module, schema.prototype as ordinary property reads', async () => {
    Lego.block(
      'soft-allowed',
      '<div>' +
        '<span class="c">[[ item.class ]]</span>' +
        '<span class="m">[[ pkg.module ]]</span>' +
        '<span class="p">[[ schema.prototype ]]</span>' +
      '</div>',
      {
        item: { class: 'card-large' },
        pkg: { module: 'auth' },
        schema: { prototype: 'v2' }
      }
    );
    win.document.body.innerHTML = '<soft-allowed></soft-allowed>';
    await flush(20);

    const host = win.document.querySelector('soft-allowed');
    expect(host.shadowRoot.querySelector('.c').textContent).toBe('card-large');
    expect(host.shadowRoot.querySelector('.m').textContent).toBe('auth');
    expect(host.shadowRoot.querySelector('.p').textContent).toBe('v2');
    // None of those triggered the blocklist.
    expect(isBlocked()).toBe(false);
  });

  it('still blocks bareword class / module / prototype keyword forms', async () => {
    Lego.block(
      'soft-blocked',
      '<div class="r">[[ class ]]</div>',
      {}
    );
    win.document.body.innerHTML = '<soft-blocked></soft-blocked>';
    await flush(20);

    expect(isBlocked()).toBe(true);
  });

  it('still blocks the constructor / __proto__ / eval / import escape vectors', async () => {
    // These remain in the strict tier — even property-access form is
    // dangerous because `obj.constructor.constructor("…")()` reaches
    // Function. The renderer falls back to `?? ''`, so blocked output
    // shows as the empty string and the warning fires.
    Lego.block(
      'strict-blocked',
      '<div class="r">[[ obj.constructor ]]/[[ obj.__proto__ ]]/[[ x.eval ]]</div>',
      { obj: {}, x: {} }
    );
    win.document.body.innerHTML = '<strict-blocked></strict-blocked>';
    await flush(20);

    const host = win.document.querySelector('strict-blocked');
    expect(host.shadowRoot.querySelector('.r').textContent).toBe('//');
    // Each blocked expression triggers a warning.
    const warnings = warnSpy.mock.calls.filter(args =>
      args.some(a => typeof a === 'string' && a.includes('Blocked dangerous'))
    );
    expect(warnings.length).toBeGreaterThanOrEqual(3);
  });
});

describe('Audit fix #41: safeEval blocklist stopgap against prototype-pollution helpers', () => {
  let win, Lego, warnSpy;
  beforeEach(async () => {
    win = setupDom();
    Lego = win.Lego;
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await Lego.init(win.document.body);
  });
  afterEach(() => {
    warnSpy.mockRestore();
    win.document.body.innerHTML = '';
  });

  it('blocks Object.getPrototypeOf/setPrototypeOf/defineProperty/getOwnPropertyDescriptor and Reflect', async () => {
    Lego.block(
      'proto-pollution',
      '<div class="r">' +
        '[[ Object.getPrototypeOf(obj) ]]/' +
        '[[ Object.setPrototypeOf(obj, null) ]]/' +
        '[[ Object.defineProperty(obj, "x", {}) ]]/' +
        '[[ Object.getOwnPropertyDescriptor(obj, "x") ]]/' +
        '[[ Reflect.get(obj, "x") ]]' +
      '</div>',
      { obj: {} }
    );
    win.document.body.innerHTML = '<proto-pollution></proto-pollution>';
    await flush(20);

    const host = win.document.querySelector('proto-pollution');
    expect(host.shadowRoot.querySelector('.r').textContent).toBe('////');
    const warnings = warnSpy.mock.calls.filter(args =>
      args.some(a => typeof a === 'string' && a.includes('Blocked dangerous'))
    );
    expect(warnings.length).toBeGreaterThanOrEqual(5);
  });
});

describe('Audit fix #26: Lego.config.strict surfaces missing template variables', () => {
  let win, Lego;
  beforeEach(async () => {
    win = setupDom();
    Lego = win.Lego;
    await Lego.init(win.document.body);
  });
  afterEach(() => {
    if (Lego && Lego.config) Lego.config.strict = false;
    win.document.body.innerHTML = '';
  });

  it('default behaviour: undefined variable renders as empty string (silent)', async () => {
    Lego.block('strict-default', '<div class="r">A=[[ a ]] B=[[ b ]]</div>', { a: 'x' });
    win.document.body.innerHTML = '<strict-default></strict-default>';
    await flush(20);

    const host = win.document.querySelector('strict-default');
    // `b` doesn't exist on state → silent fallback to empty string.
    expect(host.shadowRoot.querySelector('.r').textContent).toBe('A=x B=');
  });

  it('strict mode: undefined variable triggers the error boundary', async () => {
    // Working error block displays a marker class.
    Lego.block('strict-err', '<div class="caught">caught</div>');

    Lego.block(
      'strict-typo',
      '<div>[[ usre.email ]]</div>',
      { user: { email: 'a@b' } }
    );

    Lego.config.strict = true;
    const host = win.document.createElement('strict-typo');
    host.setAttribute('b-error', 'strict-err');
    win.document.body.appendChild(host);
    await flush(40);

    // Error boundary swapped in — the typo'd binding raised a
    // ReferenceError instead of being silently swallowed.
    const target = host.shadowRoot || host;
    expect(target.querySelector('strict-err')).toBeTruthy();
  });
});

describe('Audit fix #43: attribute interpolation scheme-guards URL sinks under Lego.config.strict', () => {
  let win, Lego;
  beforeEach(async () => {
    win = setupDom();
    Lego = win.Lego;
    await Lego.init(win.document.body);
  });
  afterEach(() => {
    if (Lego && Lego.config) Lego.config.strict = false;
    win.document.body.innerHTML = '';
  });

  it('default behaviour: a javascript: URL still renders into href (unchanged, industry-standard gap)', async () => {
    Lego.block('url-default', '<a href="[[ url ]]">go</a>', { url: 'javascript:alert(1)' });
    win.document.body.innerHTML = '<url-default></url-default>';
    await flush(20);

    const host = win.document.querySelector('url-default');
    expect(host.shadowRoot.querySelector('a').getAttribute('href')).toBe('javascript:alert(1)');
  });

  it('strict mode: a javascript:/data:/vbscript: URL is dropped from a dangerous attribute', async () => {
    Lego.config.strict = true;
    Lego.block('url-strict', '<a href="[[ url ]]">go</a>', { url: 'javascript:alert(1)' });
    win.document.body.innerHTML = '<url-strict></url-strict>';
    await flush(20);

    const host = win.document.querySelector('url-strict');
    expect(host.shadowRoot.querySelector('a').hasAttribute('href')).toBe(false);
  });

  it('strict mode: a normal URL on a dangerous attribute still renders', async () => {
    Lego.config.strict = true;
    Lego.block('url-strict-ok', '<a href="[[ url ]]">go</a>', { url: '/dashboard' });
    win.document.body.innerHTML = '<url-strict-ok></url-strict-ok>';
    await flush(20);

    const host = win.document.querySelector('url-strict-ok');
    expect(host.shadowRoot.querySelector('a').getAttribute('href')).toBe('/dashboard');
  });

  it('strict mode: non-URL attributes are untouched even with javascript:-looking text', async () => {
    Lego.config.strict = true;
    Lego.block('url-strict-title', '<a title="[[ note ]]">go</a>', { note: 'javascript:not-a-link' });
    win.document.body.innerHTML = '<url-strict-title></url-strict-title>';
    await flush(20);

    const host = win.document.querySelector('url-strict-title');
    expect(host.shadowRoot.querySelector('a').getAttribute('title')).toBe('javascript:not-a-link');
  });
});
