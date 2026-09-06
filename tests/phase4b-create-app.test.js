import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { flush } from './test-utils.js';
import { JSDOM } from 'jsdom';
import fs from 'fs';
import path from 'path';
import { Monitoring } from '../src/plugins/monitoring.js';

const libCode = fs.readFileSync(path.resolve(__dirname, '../dist/lego.min.js'), 'utf8');

const setupDom = () => {
  const dom = new JSDOM('<!DOCTYPE html><head></head><body></body>', {
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
  global.CustomEvent = win.CustomEvent;
  global.localStorage = win.localStorage;
  global.StorageEvent = win.StorageEvent;
  global.CSSStyleSheet = win.CSSStyleSheet;
  win.requestAnimationFrame = (cb) => setTimeout(cb, 0);
  win.cancelAnimationFrame = (id) => clearTimeout(id);
  global.requestAnimationFrame = win.requestAnimationFrame;
  global.cancelAnimationFrame = win.cancelAnimationFrame;
  win.eval(libCode);
  return win;
};

describe('Phase 4b: createApp', () => {
  let win, Lego, warnSpy;

  beforeEach(() => {
    win = setupDom();
    Lego = win.Lego;
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    win.document.body.innerHTML = '';
    warnSpy.mockRestore();
  });

  const warnings = () =>
    warnSpy.mock.calls.map(c => c[0]).filter(m => typeof m === 'string');

  it('renders two apps with different delimiter syntaxes side by side', async () => {
    const brackets = Lego.createApp();
    const mustache = Lego.createApp({ config: { syntax: 'mustache' } });

    brackets.block('syntax-brackets', '<span>[[ msg ]]</span>', { msg: 'from brackets' });
    mustache.block('syntax-mustache', '<span>{{ msg }}</span>', { msg: 'from mustache' });

    await brackets.init(win.document.body);
    await mustache.init(win.document.body);

    win.document.body.innerHTML = '<syntax-brackets></syntax-brackets><syntax-mustache></syntax-mustache>';
    await flush(20);

    const a = win.document.querySelector('syntax-brackets');
    const b = win.document.querySelector('syntax-mustache');
    expect(a.shadowRoot.textContent).toContain('from brackets');
    expect(b.shadowRoot.textContent).toContain('from mustache');

    // Each app keeps its own delimiters on re-render, not the last one to init.
    a.state.msg = 'brackets again';
    b.state.msg = 'mustache again';
    await Lego.nextTick();
    expect(a.shadowRoot.textContent).toContain('brackets again');
    expect(b.shadowRoot.textContent).toContain('mustache again');
  });

  it('gives each app its own globals', async () => {
    const appA = Lego.createApp({ globals: { label: 'A' } });
    const appB = Lego.createApp({ globals: { label: 'B' } });

    let bRenders = 0;
    appA.block('globals-a', '<span>[[ global.label ]]</span>');
    appB.block('globals-b', '<span>[[ global.label ]]</span>', {
      updated() { bRenders++; }
    });

    await appA.init(win.document.body);
    await appB.init(win.document.body);

    win.document.body.innerHTML = '<globals-a></globals-a><globals-b></globals-b>';
    await flush(20);

    const a = win.document.querySelector('globals-a');
    const b = win.document.querySelector('globals-b');
    expect(a.shadowRoot.textContent).toContain('A');
    expect(b.shadowRoot.textContent).toContain('B');

    const before = bRenders;
    appA.globals.label = 'A2';
    await Lego.nextTick();
    await flush(20);

    expect(a.shadowRoot.textContent).toContain('A2');
    expect(b.shadowRoot.textContent).toContain('B');
    // App B's block never read app A's globals, so nothing woke it.
    expect(bRenders).toBe(before);
    expect(appB.globals.label).toBe('B');
  });

  it('routes two apps into different containers on the same URL change', async () => {
    const appA = Lego.createApp();
    const appB = Lego.createApp();

    appA.block('route-page-a', '<span>page A</span>');
    appB.block('route-page-b', '<span>page B</span>');
    appA.route('/dashboard', 'route-page-a');
    appB.route('/dashboard', 'route-page-b');

    win.document.body.innerHTML = '<div id="outlet-a"></div><div id="outlet-b"></div>';
    await appA.init(win.document.body, { routerTarget: '#outlet-a' });
    await appB.init(win.document.body, { routerTarget: '#outlet-b' });

    win.history.pushState({}, '', '/dashboard');
    win.dispatchEvent(new win.Event('popstate'));
    await flush(30);

    const outletA = win.document.getElementById('outlet-a');
    const outletB = win.document.getElementById('outlet-b');
    expect(outletA.querySelector('route-page-a')).toBeTruthy();
    expect(outletB.querySelector('route-page-b')).toBeTruthy();
    expect(outletA.querySelector('route-page-b')).toBeNull();
    expect(outletB.querySelector('route-page-a')).toBeNull();

    // Both apps committed their own $route for the same navigation.
    expect(appA.globals.$route.route).toBe('/dashboard');
    expect(appB.globals.$route.route).toBe('/dashboard');
  });

  it('scans b-for rows with the defining app delimiters and $registry', async () => {
    const appA = Lego.createApp();
    const appB = Lego.createApp({ config: { syntax: 'mustache' } });

    appA.block('a-store', '<span>store</span>', { count: 7 });
    appB.block(
      'b-list',
      '<ul><li b-for="item in items">{{ item }}</li></ul>' +
      '<p>{{ $registry("a-store") ? "leak" : "clean" }}</p>',
      { items: ['alpha', 'beta'] }
    );

    await appA.init(win.document.body);
    await appB.init(win.document.body);

    win.document.body.innerHTML = '<b-list></b-list>';
    await flush(30);

    const list = win.document.querySelector('b-list');
    const text = list.shadowRoot.textContent;
    expect(text).toContain('alpha');
    expect(text).toContain('beta');
    // Rows are scanned with app B's delimiters, so nothing is left literal.
    expect(text).not.toContain('{{');
    // $registry only sees the blocks this app defined.
    expect(text).toContain('clean');
  });

  it('applies config.strict per app', async () => {
    const strict = Lego.createApp({ config: { strict: true } });
    const lenient = Lego.createApp();

    strict.block('strict-fallback', '<span>caught</span>');
    strict.block('strict-block', '<span>[[ nope ]]</span>', {}, '', '', 'strict-fallback');
    lenient.block('lenient-block', '<span>value:[[ nope ]]</span>');

    await strict.init(win.document.body);
    await lenient.init(win.document.body);

    win.document.body.innerHTML = '<strict-block></strict-block><lenient-block></lenient-block>';
    await flush(30);

    const strictEl = win.document.querySelector('strict-block');
    const lenientEl = win.document.querySelector('lenient-block');
    expect(strictEl.shadowRoot.querySelector('strict-fallback')).toBeTruthy();
    expect(lenientEl.shadowRoot.textContent).toContain('value:');
    expect(lenientEl.shadowRoot.textContent).not.toContain('nope');
  });

  it('installs a plugin once per app and hands it that app', () => {
    const appA = Lego.createApp();
    const appB = Lego.createApp();

    const seen = [];
    const plugin = {
      install(app, options) {
        seen.push({ app, options, self: this });
      }
    };

    appA.use(plugin, { tag: 'first' });
    appA.use(plugin, { tag: 'ignored' });
    appB.use(plugin, { tag: 'second' });

    expect(seen.length).toBe(2);
    expect(seen[0].app).toBe(appA);
    expect(seen[0].options).toEqual({ tag: 'first' });
    expect(seen[0].self).toBe(plugin);
    expect(seen[1].app).toBe(appB);
    expect(seen[1].options).toEqual({ tag: 'second' });

    // A plain function is a plugin too, and use() chains.
    const calls = [];
    const fnPlugin = (app, options) => calls.push([app, options]);
    expect(appA.use(fnPlugin, 1)).toBe(appA);
    appA.use(fnPlugin, 2);
    expect(calls).toEqual([[appA, 1]]);
  });

  it('installs the bundled monitoring plugin through use()', async () => {
    const app = Lego.createApp();
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    app.use(Monitoring, { reportToConsole: false });
    expect(typeof app.metrics.get).toBe('function');
    app.metrics.reset();

    app.block('monitored-block', '<span>[[ msg ]]</span>', { msg: 'hi' });
    await app.init(win.document.body);

    win.document.body.innerHTML = '<monitored-block></monitored-block>';
    await flush(20);

    expect(app.metrics.get().renders).toBeGreaterThan(0);
    // The plugin hooked this app's config, not the default app's.
    expect(app.config.metrics.onRenderStart).toBeTypeOf('function');
    expect(Lego.config.metrics.onRenderStart).toBeUndefined();
    logSpy.mockRestore();
  });

  it('keeps the first definition when a second app claims a defined tag', async () => {
    const appA = Lego.createApp();
    const appB = Lego.createApp();

    appA.block('shared-tag', '<span>owned by A</span>');
    appB.block('shared-tag', '<span>owned by B</span>');

    await appA.init(win.document.body);

    win.document.body.innerHTML = '<shared-tag></shared-tag>';
    await flush(20);

    const el = win.document.querySelector('shared-tag');
    expect(el.shadowRoot.textContent).toContain('owned by A');
    expect(warnings().some(m => m.includes('already defined by another app'))).toBe(true);
    expect(appA.getLegos()).toContain('shared-tag');
    expect(appB.getLegos()).not.toContain('shared-tag');
  });

  it('navigates through the routes of the app that defined the block', async () => {
    const appA = Lego.createApp();
    const appB = Lego.createApp();

    appA.block('dual-page-a', '<span>A page</span>');
    appB.block('dual-page-b', '<span>B page</span>');
    appA.route('/dual', 'dual-page-a');
    appB.route('/dual', 'dual-page-b');

    appB.block('dual-launcher', '<button @click="$go(\'/dual\').get()">go</button>');

    win.document.body.innerHTML = '<div id="dual-a"></div><div id="dual-b"></div><dual-launcher></dual-launcher>';
    await appA.init(win.document.body, { routerTarget: '#dual-a' });
    await appB.init(win.document.body, { routerTarget: '#dual-b' });
    await flush(20);

    const launcher = win.document.querySelector('dual-launcher');
    launcher.shadowRoot.querySelector('button').click();
    await flush(30);

    // $go went through app B's router only: app A never heard about it.
    expect(win.document.getElementById('dual-b').querySelector('dual-page-b')).toBeTruthy();
    expect(win.document.getElementById('dual-a').children.length).toBe(0);
    expect(appB.globals.$route.route).toBe('/dual');
    expect(appA.globals.$route.route).toBe('');
  });

  it('leaves the default Lego app behaving exactly as before', async () => {
    expect(typeof Lego.createApp).toBe('function');
    expect(Lego.config.syntax).toBe('brackets');
    expect(typeof Lego.globals.$go).toBe('function');
    expect(typeof Lego.globals.$db).toBe('function');
    expect(Lego.globals.$route.params).toEqual({});

    await Lego.init(win.document.body);

    Lego.block('default-counter', '<span>[[ count ]]</span>', { count: 1 });
    Lego.block('default-page', '<span>routed</span>');
    Lego.route('/default-route', 'default-page');

    win.document.body.innerHTML = '<default-counter></default-counter><lego-router></lego-router>';
    await flush(20);

    const el = win.document.querySelector('default-counter');
    expect(el.shadowRoot.textContent).toContain('1');
    expect(Lego.getLegos()).toContain('default-counter');

    el.state.count = 2;
    await Lego.nextTick();
    expect(el.shadowRoot.textContent).toContain('2');

    // Globals still reach blocks defined on the default app.
    Lego.globals.who = 'world';
    Lego.block('default-greeter', '<span>hi [[ global.who ]]</span>');
    win.document.body.innerHTML += '<default-greeter></default-greeter>';
    await flush(20);
    expect(win.document.querySelector('default-greeter').shadowRoot.textContent).toContain('hi world');

    win.history.pushState({}, '', '/default-route');
    win.dispatchEvent(new win.Event('popstate'));
    await flush(30);
    expect(win.document.querySelector('lego-router').querySelector('default-page')).toBeTruthy();
  });
});
