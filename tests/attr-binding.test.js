import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { flush } from './test-utils.js';
import { JSDOM } from 'jsdom';
import fs from 'fs';
import path from 'path';
import { createRenderer } from '../src/server/index.js';
import { boundAttrText } from '../src/utils/helpers.js';

/**
 * `:name="expr"` on a built-in element binds the attribute. Before, the
 * binding was dropped for anything that was not a registered block, and an
 * interpolated `disabled="[[ busy ]]"` is always present, so there was no
 * declarative way to toggle `disabled`, `hidden`, `checked` or `open`.
 *
 * Boolean attributes are present when truthy and absent otherwise. Any other
 * attribute is absent only for null and undefined, so `:aria-expanded="open"`
 * writes "false" rather than dropping the attribute. On a tag with a hyphen
 * the colon is still the prop channel, including for a block that registers
 * after its parent was scanned.
 */

const libCode = fs.readFileSync(path.resolve(__dirname, '../dist/lego.min.js'), 'utf8');

const setupDom = (bodyHTML = '') => {
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
  global.CSSStyleSheet = class {
    constructor() { this.cssRules = []; }
    replace(content) { this.cssText = content; return Promise.resolve(this); }
    replaceSync(content) { this.cssText = content; }
  };
  win.CSSStyleSheet = global.CSSStyleSheet;
  win.requestAnimationFrame = (cb) => setTimeout(cb, 0);
  win.eval(libCode);
  return win;
};

describe('boundAttrText', () => {
  it('treats boolean attributes as present or absent', () => {
    expect(boundAttrText('disabled', true)).toBe('');
    expect(boundAttrText('disabled', 'yes')).toBe('');
    expect(boundAttrText('disabled', '')).toBe('');
    expect(boundAttrText('disabled', false)).toBe(null);
    expect(boundAttrText('disabled', 0)).toBe(null);
    expect(boundAttrText('hidden', undefined)).toBe(null);
  });

  it('writes other attributes as text, dropping only null and undefined', () => {
    expect(boundAttrText('aria-expanded', false)).toBe('false');
    expect(boundAttrText('aria-expanded', true)).toBe('true');
    expect(boundAttrText('tabindex', 0)).toBe('0');
    expect(boundAttrText('title', '')).toBe('');
    expect(boundAttrText('href', null)).toBe(null);
    expect(boundAttrText('href', undefined)).toBe(null);
  });
});

describe(':name on built-in elements (client)', () => {
  let win, Lego;

  beforeEach(async () => {
    win = setupDom();
    Lego = win.Lego;
    await Lego.init();
  });

  afterEach(() => {
    win.document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  const root = (el) => el.shadowRoot || el;

  const mount = async (tag, options, html) => {
    Lego.block(tag, options);
    const host = win.document.createElement('div');
    host.innerHTML = html || `<${tag}></${tag}>`;
    win.document.body.appendChild(host);
    await flush(30);
    return host.firstElementChild;
  };

  it('toggles a boolean attribute', async () => {
    const el = await mount('ab-toggle', {
      template: '<button :disabled="busy">Save</button><aside :hidden="!open">menu</aside>',
      logic: { busy: true, open: false }
    });
    const button = root(el).querySelector('button');
    const aside = root(el).querySelector('aside');
    expect(button.hasAttribute('disabled')).toBe(true);
    expect(button.disabled).toBe(true);
    expect(aside.hidden).toBe(true);

    el.state.busy = false;
    el.state.open = true;
    await flush(30);
    expect(button.hasAttribute('disabled')).toBe(false);
    expect(button.disabled).toBe(false);
    expect(aside.hasAttribute('hidden')).toBe(false);
  });

  it('writes "false" for a non-boolean attribute and removes it for null', async () => {
    const el = await mount('ab-aria', {
      template: '<button :aria-expanded="open" :title="tip">x</button>',
      logic: { open: false, tip: 'Help' }
    });
    const button = root(el).querySelector('button');
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(button.getAttribute('title')).toBe('Help');

    el.state.open = true;
    el.state.tip = null;
    await flush(30);
    expect(button.getAttribute('aria-expanded')).toBe('true');
    expect(button.hasAttribute('title')).toBe(false);
  });

  it('keeps value and checked live after the user has touched the control', async () => {
    const el = await mount('ab-live', {
      template: '<input :value="name"><input type="checkbox" :checked="on">',
      logic: { name: 'Ada', on: false }
    });
    const [text, box] = root(el).querySelectorAll('input');
    expect(text.value).toBe('Ada');

    text.value = 'typed';      // a user edit detaches value from the attribute
    box.checked = true;        // and checked from its attribute
    el.state.name = 'Grace';
    el.state.on = false;
    el.state.on = true;
    await flush(30);
    el.state.on = false;
    await flush(30);
    expect(text.value).toBe('Grace');
    expect(box.checked).toBe(false);
  });

  it('binds per row inside b-for', async () => {
    const el = await mount('ab-rows', {
      template: '<button b-for="t in todos" :disabled="t.done">[[ t.title ]]</button>',
      logic: { todos: [{ id: 1, title: 'a', done: true }, { id: 2, title: 'b', done: false }] }
    });
    const states = () => [...root(el).querySelectorAll('button')].map(b => b.disabled);
    expect(states()).toEqual([true, false]);
    el.state.todos[1].done = true;
    await flush(30);
    expect(states()).toEqual([true, true]);
  });

  it('passes props to a block that is itself the b-for element', async () => {
    Lego.block('ab-member', { template: '<b>[[ name ]]</b>', props: 'name: String' });
    const el = await mount('ab-team', {
      template: '<ab-member b-for="m in team" :name="m.name"></ab-member>',
      logic: { team: [{ id: 1, name: 'Ada' }, { id: 2, name: 'Grace' }] }
    });
    await flush(30);
    const names = () => [...root(el).querySelectorAll('ab-member')].map(m => root(m).querySelector('b').textContent);
    expect(names()).toEqual(['Ada', 'Grace']);
    el.state.team[0].name = 'Lovelace';
    await flush(30);
    expect(names()).toEqual(['Lovelace', 'Grace']);
  });

  it('drops a dangerous URL in strict mode', async () => {
    vi.spyOn(win.console, 'warn').mockImplementation(() => {});
    Lego.config.strict = true;
    try {
      const el = await mount('ab-url', { template: '<a :href="url">x</a>', logic: { url: 'javascript:alert(1)' } });
      expect(root(el).querySelector('a').hasAttribute('href')).toBe(false);
      el.state.url = '/safe';
      await flush(30);
      expect(root(el).querySelector('a').getAttribute('href')).toBe('/safe');
    } finally {
      Lego.config.strict = false;
    }
  });

  it('is still the prop channel on a block', async () => {
    Lego.block('ab-child', { template: '<b>[[ disabled ? "off" : "on" ]]</b>', props: 'disabled: Boolean' });
    const el = await mount('ab-parent', {
      template: '<ab-child :disabled="busy"></ab-child>',
      logic: { busy: true }
    });
    const child = root(el).querySelector('ab-child');
    await flush(30);
    expect(root(child).querySelector('b').textContent).toBe('off');
    expect(child.hasAttribute('disabled')).toBe(false);
  });

  it('hands props to a block registered after its parent was scanned', async () => {
    const el = await mount('ab-early', {
      template: '<ab-late :label="name"></ab-late>',
      logic: { name: 'Ada' }
    });
    Lego.block('ab-late', { template: '<i>[[ label ]]</i>', props: 'label: String' });
    await flush(30);
    const child = root(el).querySelector('ab-late');
    expect(root(child).querySelector('i').textContent).toBe('Ada');
    expect(child.hasAttribute('label')).toBe(false);
  });
});

describe(':name on built-in elements (server and hydration)', () => {
  const definitions = {
    'save-bar': {
      template: '<button :disabled="busy" :aria-pressed="busy" :title="tip">Save</button><a :href="link">x</a>' +
        '<input type="checkbox" b-for="t in todos" :checked="t.done">',
      logic: { busy: true, tip: null, link: '/next', todos: [{ id: 1, done: true }, { id: 2, done: false }] }
    }
  };

  it('renders the attribute state the client would write', () => {
    const html = createRenderer({ definitions }).renderToString('save-bar');
    expect(html).toMatch(/<button :disabled="busy" :aria-pressed="busy" :title="tip" disabled aria-pressed="true">/);
    expect(html).toContain('<a :href="link" href="/next">');
    expect(html).not.toMatch(/ title=/);
    expect(html).toContain('<input type="checkbox" b-for="t in todos" :checked="t.done" data-b-key="1" checked>');
    expect(html).toContain('<input type="checkbox" b-for="t in todos" :checked="t.done" data-b-key="2">');
  });

  it('does not write an attribute for a colon binding on a custom element', () => {
    const html = createRenderer({
      definitions: { 'outer-box': { template: '<later-block :label="name"></later-block>', logic: { name: 'Ada' } } }
    }).renderToString('outer-box');
    expect(html).toContain('<later-block :label="name">');
    expect(html).not.toContain(' label=');
  });

  it('hydrates a server-rendered binding without writing to the DOM', async () => {
    const html = createRenderer({ definitions }).renderToString('save-bar');
    const win = setupDom(html);
    // JSDOM has no declarative Shadow DOM; convert the template by hand.
    win.document.querySelectorAll('template[shadowrootmode]').forEach(tpl => {
      const shadow = tpl.parentElement.attachShadow({ mode: 'open' });
      shadow.appendChild(tpl.content);
      tpl.remove();
    });

    const writes = [];
    const { setAttribute, removeAttribute } = win.Element.prototype;
    win.Element.prototype.setAttribute = function (name, value) {
      if (this.isConnected) writes.push(`set ${name}`);
      return setAttribute.call(this, name, value);
    };
    // Adopting a page strips its markers: b-hydrate on the host, and
    // data-b-key, b-for and b-key on each row. Those are not binding writes.
    const markers = new Set(['b-hydrate', 'data-b-key', 'b-for', 'b-key']);
    win.Element.prototype.removeAttribute = function (name) {
      if (this.isConnected && !markers.has(name)) writes.push(`remove ${name}`);
      return removeAttribute.call(this, name);
    };

    const Lego = win.Lego;
    Lego.block('save-bar', definitions['save-bar']);
    await Lego.init(win.document.body);
    await Lego.nextTick();
    win.Element.prototype.setAttribute = setAttribute;
    win.Element.prototype.removeAttribute = removeAttribute;

    expect(writes).toEqual([]);

    const bar = win.document.querySelector('save-bar');
    const button = bar.shadowRoot.querySelector('button');
    expect(button.disabled).toBe(true);
    const boxes = () => [...bar.shadowRoot.querySelectorAll('input')].map(i => i.checked);
    expect(boxes()).toEqual([true, false]);

    bar.state.busy = false;
    bar.state.todos[1].done = true;
    await Lego.nextTick();
    expect(button.disabled).toBe(false);
    expect(button.getAttribute('aria-pressed')).toBe('false');
    expect(boxes()).toEqual([true, true]);
  });
});
