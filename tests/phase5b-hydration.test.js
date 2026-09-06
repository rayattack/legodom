import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { flush } from './test-utils.js';
import { JSDOM } from 'jsdom';
import { execFileSync } from 'node:child_process';
import fs from 'fs';
import path from 'path';

import { createRenderer } from '../src/server/index.js';

/** Node.COMMENT_NODE, spelled out because these assertions run outside a window. */
const COMMENT_NODE = 8;

const libCode = fs.readFileSync(path.resolve(__dirname, '../dist/lego.min.js'), 'utf8');
const clientEntry = path.resolve(__dirname, '../dist/lego.mjs');
const serverEntry = path.resolve(__dirname, '../dist/lego.server.mjs');

/**
 * JSDOM does not implement declarative Shadow DOM, so a test that wants to
 * behave like a modern browser converts the templates by hand before the
 * runtime ever sees them. The recursion follows each new shadow root, whose
 * own hosts carry templates the document-level query cannot reach.
 */
const convertDeclarativeShadow = (root) => {
  [...root.querySelectorAll('template[shadowrootmode]')].forEach(tpl => {
    const host = tpl.parentElement;
    if (!host || host.shadowRoot) return;
    const shadow = host.attachShadow({ mode: 'open' });
    shadow.appendChild(tpl.content);
    tpl.remove();
    convertDeclarativeShadow(shadow);
  });
};

const setupDom = (bodyHTML = '', { declarativeShadow = true } = {}) => {
  const dom = new JSDOM(`<!DOCTYPE html><head></head><body>${bodyHTML}</body>`, {
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

  // A browser turns the declarative templates into shadow roots while it
  // parses, which is well before any script runs.
  if (declarativeShadow) convertDeclarativeShadow(win.document.body);

  win.eval(libCode);
  return win;
};

/**
 * Count every write the runtime makes to markup that is already on screen.
 * Detached nodes (a definition's own `<template>`, the subtree a false b-if
 * keeps in hand) are not part of the painted page, so they are not counted.
 */
const watchWrites = (win) => {
  const writes = [];
  const textDesc = Object.getOwnPropertyDescriptor(win.Node.prototype, 'textContent');
  Object.defineProperty(win.Node.prototype, 'textContent', {
    configurable: true,
    enumerable: textDesc.enumerable,
    get: textDesc.get,
    set(value) {
      if (this.isConnected) writes.push(`textContent = ${JSON.stringify(value)}`);
      textDesc.set.call(this, value);
    }
  });

  const setAttribute = win.Element.prototype.setAttribute;
  win.Element.prototype.setAttribute = function (name, value) {
    if (this.isConnected) writes.push(`setAttribute ${name}="${value}"`);
    return setAttribute.call(this, name, value);
  };

  return {
    writes,
    restore() {
      Object.defineProperty(win.Node.prototype, 'textContent', textDesc);
      win.Element.prototype.setAttribute = setAttribute;
    }
  };
};

/* ------------------------------------------------------------------ *
 * Blocks, defined once and registered on both sides
 * ------------------------------------------------------------------ */

const CARD = {
  template: '<div class="card [[ tone ]]"><h2 title="[[ name ]]">[[ name ]]</h2></div>',
  logic: { name: 'Ada', tone: 'warm' }
};

const BADGE = {
  template: '<span>[[ label ]]</span>',
  logic: { label: '' },
  props: '{ label }'
};

const SHELL = {
  template: '<div class="shell"><inner-badge :label="msg"></inner-badge></div>',
  logic: { msg: 'hi' }
};

/**
 * Everything the walk has to pair at once: interpolated text, an interpolated
 * attribute, both sides of a b-if, a hidden b-show and a keyed b-for.
 */
const PANEL = {
  template: '<section class="panel [[ tone ]]">'
    + '<h2 title="[[ name ]]">[[ name ]]</h2>'
    + '<p b-if="open">visible</p>'
    + '<p b-if="!open">hidden</p>'
    + '<em b-show="open">shown</em>'
    + '<ul><li b-for="todo in todos" b-key="id">[[ todo.title ]]</li></ul>'
    + '</section>',
  logic: {
    name: 'Ada',
    tone: 'warm',
    open: false,
    todos: [{ id: 1, title: 'one' }, { id: 2, title: 'two' }]
  }
};

// The hidden branch carries a b-for, so the clone hydration keeps in hand has
// to be a fully scanned subtree, not just an element.
const GATE = {
  template: '<div>'
    + '<p b-if="open">open</p>'
    + '<ul b-if="open"><li b-for="n in nums" b-key="id">[[ n.id ]]</li></ul>'
    + '<p b-if="!open">shut</p>'
    + '</div>',
  logic: { open: false, nums: [{ id: 1 }, { id: 2 }] }
};

const LIST = {
  template: '<ul><li b-for="todo in todos" b-key="id" class="row">[[ todo.title ]]</li></ul>',
  logic: { todos: [{ id: 1, title: 'one' }, { id: 2, title: 'two' }, { id: 3, title: 'three' }] }
};

const LIGHT_SOURCE = [
  '<template b-shadow="false">',
  '<div class="row">[[ label ]]</div>',
  '</template>',
  '<script>',
  'export default { label: "hello" }',
  '</script>',
  '<style>',
  'self { display: block }',
  '.row { color: red }',
  '</style>'
].join('\n');

/** Register the same definitions on the client that the renderer holds. */
const registerOnClient = (Lego, definitions) => {
  Object.entries(definitions).forEach(([tagName, definition]) => Lego.block(tagName, definition));
};

describe('Phase 5b: Node-safe registration', () => {
  it('registers a block in a plain Node process with no DOM globals', () => {
    const script = `import(${JSON.stringify(clientEntry)}).then((m) => {
      const Lego = m.default;
      if (typeof document !== 'undefined') throw new Error('document leaked in');
      Lego.block('x-y', { template: '<b>[[ a ]]</b>', logic: { a: 1 } });
      if (!Lego.getLegos().includes('x-y')) throw new Error('getLegos() missing x-y');
      process.stdout.write('ok');
    });`;
    const out = execFileSync(process.execPath, ['--input-type=module', '-e', script], {
      encoding: 'utf8',
      env: { ...process.env, NODE_OPTIONS: '' }
    });
    expect(out).toBe('ok');
  });

  it('renders those definitions with the server entry, through getDefinitions()', () => {
    const script = `Promise.all([
      import(${JSON.stringify(clientEntry)}),
      import(${JSON.stringify(serverEntry)})
    ]).then(([client, server]) => {
      const Lego = client.default;
      Lego.block('x-y', { template: '<b>[[ a ]]</b>', logic: { a: 1 } });
      const renderer = server.createRenderer({ definitions: Lego.getDefinitions() });
      process.stdout.write(renderer.renderToString('x-y'));
    });`;
    const out = execFileSync(process.execPath, ['--input-type=module', '-e', script], {
      encoding: 'utf8',
      env: { ...process.env, NODE_OPTIONS: '' }
    });
    expect(out).toBe(
      '<x-y b-hydrate b-id="x-y"><template shadowrootmode="open"><b>1</b></template></x-y>'
    );
  });

  it('accepts the app itself through defineFrom(), light DOM and styles included', () => {
    const script = `Promise.all([
      import(${JSON.stringify(clientEntry)}),
      import(${JSON.stringify(serverEntry)})
    ]).then(([client, server]) => {
      const Lego = client.default;
      Lego.defineLegoFile(${JSON.stringify(LIGHT_SOURCE)}, 'light-card.lego');
      const renderer = server.createRenderer().defineFrom(Lego);
      process.stdout.write(renderer.renderToString('light-card'));
    });`;
    const out = execFileSync(process.execPath, ['--input-type=module', '-e', script], {
      encoding: 'utf8',
      env: { ...process.env, NODE_OPTIONS: '' }
    });
    expect(out).toContain('<light-card b-hydrate b-id="light-card">');
    expect(out).toContain('data-lego-style="light-card"');
    expect(out).toContain('light-card .row');
    expect(out).toContain('<div class="row">hello</div>');
    expect(out).not.toContain('shadowrootmode');
  });
});

describe('Phase 5b: hydration', () => {
  let win, Lego, warnSpy;

  const start = (definitions, tagName, renderOptions, domOptions) => {
    const renderer = createRenderer({ definitions });
    const html = renderer.renderToString(tagName, renderOptions);
    win = setupDom(html, domOptions);
    Lego = win.Lego;
    registerOnClient(Lego, definitions);
    return html;
  };

  beforeEach(() => {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    if (win) win.document.body.innerHTML = '';
    warnSpy.mockRestore();
    win = null;
    Lego = null;
  });

  const hydrationWarnings = () => warnSpy.mock.calls
    .map(c => c[0])
    .filter(m => typeof m === 'string' && m.includes('Hydration mismatch'));

  it('writes nothing to a page the server already rendered correctly', async () => {
    const definitions = { 'user-card': CARD, 'kitchen-panel': PANEL };
    const renderer = createRenderer({ definitions });
    const html = renderer.renderToString('user-card') + renderer.renderToString('kitchen-panel');
    win = setupDom(html);
    Lego = win.Lego;

    const watcher = watchWrites(win);
    registerOnClient(Lego, definitions);
    await Lego.init(win.document.body);
    await Lego.nextTick();
    watcher.restore();

    expect(watcher.writes).toEqual([]);

    const card = win.document.querySelector('user-card');
    expect(card.shadowRoot.querySelector('h2').textContent).toBe('Ada');
    expect(card.shadowRoot.querySelector('.card').getAttribute('class')).toBe('card warm');
    expect(card.hasAttribute('b-hydrate')).toBe(false);

    const panel = win.document.querySelector('kitchen-panel');
    expect(panel.shadowRoot.querySelector('p').textContent).toBe('hidden');
    expect(panel.shadowRoot.querySelector('em').style.display).toBe('none');
    expect([...panel.shadowRoot.querySelectorAll('li')].map(li => li.textContent))
      .toEqual(['one', 'two']);
    expect(hydrationWarnings()).toEqual([]);
  });

  it('keeps the very same nodes rather than re-creating them', async () => {
    start({ 'user-card': CARD }, 'user-card');
    const card = win.document.querySelector('user-card');
    const heading = card.shadowRoot.querySelector('h2');
    const text = heading.firstChild;

    await Lego.init(win.document.body);
    await Lego.nextTick();

    expect(card.shadowRoot.querySelector('h2')).toBe(heading);
    expect(heading.firstChild).toBe(text);
  });

  it('corrects state the server rendered from stale data', async () => {
    const renderer = createRenderer({ definitions: { 'user-card': CARD } });
    const html = renderer.renderToString('user-card', { props: { name: 'Grace', tone: 'cool' } });
    win = setupDom(html);
    Lego = win.Lego;

    const card = win.document.querySelector('user-card');
    expect(card.shadowRoot.querySelector('h2').textContent).toBe('Grace');

    // The client's definition says Ada, and no prop overrides it, so the
    // first render has to put the page right.
    registerOnClient(Lego, { 'user-card': CARD });
    await Lego.init(win.document.body);
    await Lego.nextTick();

    expect(card.shadowRoot.querySelector('h2').textContent).toBe('Ada');
    expect(card.shadowRoot.querySelector('h2').getAttribute('title')).toBe('Ada');
    expect(card.shadowRoot.querySelector('.card').getAttribute('class')).toBe('card warm');
    expect(hydrationWarnings()).toEqual([]);
  });

  it('adopts a b-if comment and toggles in both directions afterwards', async () => {
    start({ 'gate-block': GATE }, 'gate-block');
    const gate = win.document.querySelector('gate-block');
    const root = gate.shadowRoot.querySelector('div');

    // false b-if is a comment, true b-if is the element the server rendered.
    const comments = [...root.childNodes].filter(n => n.nodeType === COMMENT_NODE);
    expect(comments.map(c => c.textContent)).toEqual(['b-if: open', 'b-if: open']);

    await Lego.init(win.document.body);
    await Lego.nextTick();

    expect(root.textContent).toBe('shut');
    expect(hydrationWarnings()).toEqual([]);

    gate.state.open = true;
    await Lego.nextTick();
    expect(root.textContent).toBe('open12');
    expect(root.querySelectorAll('li').length).toBe(2);

    gate.state.open = false;
    await Lego.nextTick();
    expect(root.textContent).toBe('shut');
  });

  it('adopts b-for rows by key and keeps them across mutation, reorder and removal', async () => {
    start({ 'todo-list': LIST }, 'todo-list');
    const list = win.document.querySelector('todo-list');
    const ul = list.shadowRoot.querySelector('ul');
    const before = [...ul.querySelectorAll('li')];

    expect(before.length).toBe(3);
    expect(before.map(li => li.textContent)).toEqual(['one', 'two', 'three']);
    expect(ul.firstChild.nodeType).toBe(COMMENT_NODE);
    expect(ul.firstChild.textContent).toBe('b-for: todo in todos');

    await Lego.init(win.document.body);
    await Lego.nextTick();

    const adopted = [...ul.querySelectorAll('li')];
    expect(adopted).toEqual(before);
    expect(adopted.every(li => !li.hasAttribute('data-b-key'))).toBe(true);
    expect(hydrationWarnings()).toEqual([]);

    // A mutation reaches the row that is already on screen.
    list.state.todos[1].title = 'TWO';
    await Lego.nextTick();
    expect([...ul.querySelectorAll('li')][1]).toBe(before[1]);
    expect(before[1].textContent).toBe('TWO');

    // Reorder moves the same elements.
    list.state.todos = [list.state.todos[2], list.state.todos[0], list.state.todos[1]];
    await Lego.nextTick();
    expect([...ul.querySelectorAll('li')]).toEqual([before[2], before[0], before[1]]);

    // Removal drops one and leaves the rest alone.
    list.state.todos = list.state.todos.filter(t => t.id !== 1);
    await Lego.nextTick();
    expect([...ul.querySelectorAll('li')]).toEqual([before[2], before[1]]);
    expect(before[0].isConnected).toBe(false);
  });

  it('hydrates a nested block and keeps its :prop reactive', async () => {
    start({ 'inner-badge': BADGE, 'outer-shell': SHELL }, 'outer-shell');
    const shell = win.document.querySelector('outer-shell');

    await Lego.init(win.document.body);
    await Lego.nextTick();

    const badge = shell.shadowRoot.querySelector('inner-badge');
    const span = badge.shadowRoot.querySelector('span');
    expect(span.textContent).toBe('hi');
    expect(badge.state.label).toBe('hi');
    expect(hydrationWarnings()).toEqual([]);

    shell.state.msg = 'bye';
    await Lego.nextTick();
    expect(badge.shadowRoot.querySelector('span')).toBe(span);
    expect(span.textContent).toBe('bye');
  });

  it('hydrates a light DOM block without injecting its style a second time', async () => {
    const renderer = createRenderer();
    renderer.defineLegoFile(LIGHT_SOURCE, 'light-card.lego');
    const html = renderer.renderToString('light-card');
    win = setupDom(html);
    Lego = win.Lego;

    Lego.defineLegoFile(LIGHT_SOURCE, 'light-card.lego');
    await Lego.init(win.document.body);
    await Lego.nextTick();

    const host = win.document.querySelector('light-card');
    expect(host.shadowRoot).toBe(null);
    expect(host.querySelector('.row').textContent).toBe('hello');
    expect(host.querySelector('style')).toBe(null);
    expect(hydrationWarnings()).toEqual([]);

    const injected = win.document.head.querySelectorAll('style[data-lego-style="light-card"]');
    expect(injected.length).toBe(1);
    // Scoped once by the server, never re-scoped on the way into <head>.
    expect(injected[0].textContent).toContain('light-card .row');
    expect(injected[0].textContent).not.toContain('light-card light-card');

    // A second instance, mounted fresh rather than hydrated, finds the style
    // already there and adds nothing.
    const second = win.document.createElement('light-card');
    win.document.body.appendChild(second);
    Lego.snap(second);
    await Lego.nextTick();

    expect(second.querySelector('.row').textContent).toBe('hello');
    expect(win.document.head.querySelectorAll('style[data-lego-style="light-card"]').length).toBe(1);
  });

  it('converts a declarative shadow root itself when the browser will not', async () => {
    // No pre-conversion here: the <template shadowrootmode> is still sitting
    // in the light DOM when the runtime reaches the host.
    const definitions = { 'inner-badge': BADGE, 'outer-shell': SHELL };
    const renderer = createRenderer({ definitions });
    const html = renderer.renderToString('outer-shell');
    win = setupDom(html, { declarativeShadow: false });
    Lego = win.Lego;

    const shell = win.document.querySelector('outer-shell');
    expect(shell.shadowRoot).toBe(null);
    expect(shell.querySelector('template[shadowrootmode]')).not.toBe(null);

    registerOnClient(Lego, definitions);
    await Lego.init(win.document.body);
    await Lego.nextTick();

    expect(shell.shadowRoot).not.toBe(null);
    expect(shell.querySelector('template[shadowrootmode]')).toBe(null);
    expect(shell.shadowRoot.querySelector('.shell')).not.toBe(null);
    expect(hydrationWarnings()).toEqual([]);

    const badge = shell.shadowRoot.querySelector('inner-badge');
    expect(badge.shadowRoot.querySelector('span').textContent).toBe('hi');

    shell.state.msg = 'later';
    await Lego.nextTick();
    expect(badge.shadowRoot.querySelector('span').textContent).toBe('later');
  });

  it('falls back with exactly one warning when the markup does not match', async () => {
    const renderer = createRenderer({ definitions: { 'user-card': CARD } });
    // A node the template never described: the shapes diverge and the block
    // has to render itself from scratch.
    const html = renderer.renderToString('user-card').replace('</template>', '<hr></template>');
    win = setupDom(html);
    Lego = win.Lego;

    registerOnClient(Lego, { 'user-card': CARD });
    await Lego.init(win.document.body);
    await Lego.nextTick();

    const warnings = hydrationWarnings();
    expect(warnings.length).toBe(1);
    expect(warnings[0]).toContain('<user-card>');

    const card = win.document.querySelector('user-card');
    expect(card.shadowRoot.querySelector('hr')).toBe(null);
    expect(card.shadowRoot.querySelector('h2').textContent).toBe('Ada');
    expect(card.shadowRoot.querySelector('.card').getAttribute('class')).toBe('card warm');

    card.state.name = 'Grace';
    await Lego.nextTick();
    expect(card.shadowRoot.querySelector('h2').textContent).toBe('Grace');
  });

  it('falls back cleanly for a light DOM block whose slots the server filled', async () => {
    // The server substitutes slots itself, so the caller's nodes sit where
    // the template says `<slot>` and the two shapes cannot be paired. The
    // block reports it, drops the server's markup and renders its own.
    const definitions = {
      'light-slots': {
        template: '<header><slot name="title">untitled</slot></header>',
        shadow: false
      }
    };
    const renderer = createRenderer({ definitions });
    const html = renderer.renderToString('light-slots', { slots: { title: '<b>hi</b>' } });
    win = setupDom(html);
    Lego = win.Lego;

    registerOnClient(Lego, definitions);
    await Lego.init(win.document.body);
    await Lego.nextTick();

    expect(hydrationWarnings().length).toBe(1);
    const host = win.document.querySelector('light-slots');
    expect(host.querySelector('header').textContent).toBe('untitled');
    expect(host.querySelector('slot')).toBe(null);
  });

  it('leaves a page with no b-hydrate attributes exactly as it was', async () => {
    win = setupDom('<user-card></user-card>');
    Lego = win.Lego;
    registerOnClient(Lego, { 'user-card': CARD });
    await Lego.init(win.document.body);
    await flush(20);

    const card = win.document.querySelector('user-card');
    expect(card.shadowRoot.querySelector('h2').textContent).toBe('Ada');
    expect(hydrationWarnings()).toEqual([]);
  });
});
