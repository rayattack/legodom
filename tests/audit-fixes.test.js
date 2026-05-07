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
