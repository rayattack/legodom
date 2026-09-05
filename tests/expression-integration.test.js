import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
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

describe('expression compiler: template integration', () => {
  beforeEach(async () => {
    document.body.innerHTML = '';
    await Lego.init(document.body);
  });

  it('interpolates arithmetic, ternaries and member chains', async () => {
    Lego.block(
      'expr-text',
      '<p class="a">[[ x + y * 2 ]]</p>' +
      '<p class="b">[[ user?.name ?? "anon" ]]</p>' +
      '<p class="c">[[ items.length > 1 ? "many" : "one" ]]</p>',
      { x: 1, y: 2, user: null, items: [1, 2] }
    );
    const el = await mount('expr-text');
    const root = el.shadowRoot;
    expect(root.querySelector('.a').textContent).toBe('5');
    expect(root.querySelector('.b').textContent).toBe('anon');
    expect(root.querySelector('.c').textContent).toBe('many');
  });

  it('runs @click="count++" against state', async () => {
    Lego.block('expr-inc', '<button @click="count++">go</button><span>[[ count ]]</span>', { count: 0 });
    const el = await mount('expr-inc');
    el.shadowRoot.querySelector('button').click();
    await flush(30);
    expect(el.state.count).toBe(1);
    expect(el.shadowRoot.querySelector('span').textContent).toBe('1');
  });

  it('runs @click="showModal = false" against state', async () => {
    Lego.block('expr-assign', '<button @click="showModal = false">x</button>', { showModal: true });
    const el = await mount('expr-assign');
    el.shadowRoot.querySelector('button').click();
    await flush(30);
    expect(el.state.showModal).toBe(false);
  });

  it('passes $event and event to a handler', async () => {
    const seen = [];
    Lego.block(
      'expr-event',
      '<div class="a" @save="onSave($event)"></div><div class="b" @save="onSave(event)"></div>',
      { onSave(e) { seen.push(e.detail); } }
    );
    const el = await mount('expr-event');
    el.shadowRoot.querySelector('.a')
      .dispatchEvent(new window.CustomEvent('save', { detail: 'from-$event' }));
    el.shadowRoot.querySelector('.b')
      .dispatchEvent(new window.CustomEvent('save', { detail: 'from-event' }));
    await flush(20);
    expect(seen).toEqual(['from-$event', 'from-event']);
  });

  it('renders b-for over an inline arrow-function filter', async () => {
    Lego.block(
      'expr-for',
      '<ul><li b-for="x in items.filter(i => i.active)">[[ x.name ]]</li></ul>',
      {
        items: [
          { id: 1, name: 'A', active: true },
          { id: 2, name: 'B', active: false },
          { id: 3, name: 'C', active: true }
        ]
      }
    );
    const el = await mount('expr-for');
    const names = [...el.shadowRoot.querySelectorAll('li')].map(li => li.textContent.trim());
    expect(names).toEqual(['A', 'C']);
  });

  it('resolves a b-mount tag built from a template literal', async () => {
    Lego.block('users-pane', '<span class="pane">users pane</span>');
    Lego.block('expr-mount', '<div b-mount="`${tab}-pane`"></div>', { tab: 'users' });
    const el = await mount('expr-mount');
    await flush(40);
    const mounted = el.shadowRoot.querySelector('users-pane');
    expect(mounted).toBeTruthy();
    expect(mounted.shadowRoot.querySelector('.pane').textContent).toBe('users pane');
  });

  it('parses a b-logic object literal on the instance', async () => {
    Lego.block('expr-logic', '<span>[[ name ]]:[[ count + 1 ]]</span>');
    const el = document.createElement('expr-logic');
    el.setAttribute('b-logic', "{ name: 'Alice', count: 41 }");
    document.body.appendChild(el);
    await flush(30);
    expect(el.shadowRoot.querySelector('span').textContent).toBe('Alice:42');
  });

  it('falls back to Function() for b-logic method shorthand, warning once', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    Lego.block('expr-logic-method', '<button @click="bump()">go</button><span>[[ n ]]</span>');
    const el = document.createElement('expr-logic-method');
    el.setAttribute('b-logic', '{ n: 1, bump() { this.n++ } }');
    document.body.appendChild(el);
    await flush(30);

    el.shadowRoot.querySelector('button').click();
    await flush(30);
    expect(el.shadowRoot.querySelector('span').textContent).toBe('2');

    const warned = warnSpy.mock.calls.filter(args =>
      args.some(a => typeof a === 'string' && a.includes('compile through Function()'))
    );
    expect(warned.length).toBe(1);
    warnSpy.mockRestore();
  });
});

describe('expression compiler: sandbox in templates', () => {
  beforeEach(async () => {
    document.body.innerHTML = '';
    await Lego.init(document.body);
  });

  afterEach(() => {
    Lego.config.strict = false;
    Lego.config.onError = undefined;
  });

  it('renders typeof window as undefined: no host global is reachable', async () => {
    Lego.block(
      'sandbox-typeof',
      '<i class="a">[[ typeof window ]]</i><i class="b">[[ typeof document ]]</i>' +
      '<i class="c">[[ typeof Math ]]</i>'
    );
    const el = await mount('sandbox-typeof');
    expect(el.shadowRoot.querySelector('.a').textContent).toBe('undefined');
    expect(el.shadowRoot.querySelector('.b').textContent).toBe('undefined');
    expect(el.shadowRoot.querySelector('.c').textContent).toBe('object');
  });

  it('cannot write document.cookie from an event handler', async () => {
    const onError = vi.fn();
    Lego.config.onError = onError;
    Lego.block('sandbox-cookie', '<button @click="document.cookie = \'evil=1\'">x</button>');
    const el = await mount('sandbox-cookie');

    expect(() => el.shadowRoot.querySelector('button').click()).not.toThrow();
    await flush(20);

    expect(document.cookie).not.toContain('evil');
    expect(onError).toHaveBeenCalled();
    expect(onError.mock.calls[0][0]).toBeInstanceOf(ReferenceError);
  });

  it('cannot reach fetch, eval or Function by name', async () => {
    const onError = vi.fn();
    Lego.config.onError = onError;
    Lego.block(
      'sandbox-globals',
      '<button class="f" @click="fetch(\'/x\')">a</button>' +
      '<button class="e" @click="eval(\'1\')">b</button>' +
      '<button class="c" @click="Function(\'return 1\')()">c</button>'
    );
    const el = await mount('sandbox-globals');
    ['.f', '.e', '.c'].forEach(sel => el.shadowRoot.querySelector(sel).click());
    await flush(20);
    expect(onError).toHaveBeenCalledTimes(3);
    onError.mock.calls.forEach(call => expect(call[0]).toBeInstanceOf(ReferenceError));
  });

  it('warns and renders nothing for a denied property, but reads lookalikes fine', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    Lego.block(
      'sandbox-denied',
      '<b class="a">[[ obj.constructor ]]</b><b class="b">[[ item.class ]]</b>',
      { obj: {}, item: { class: 'card' } }
    );
    const el = await mount('sandbox-denied');
    expect(el.shadowRoot.querySelector('.a').textContent).toBe('');
    expect(el.shadowRoot.querySelector('.b').textContent).toBe('card');
    expect(warnSpy.mock.calls.some(args =>
      args.some(a => typeof a === 'string' && a.includes('Blocked dangerous expression'))
    )).toBe(true);
    warnSpy.mockRestore();
  });

  it('swallows a ReferenceError by default and re-throws it under config.strict', async () => {
    Lego.block('strict-off', '<span>A=[[ a ]] B=[[ b ]]</span>', { a: 'x' });
    const relaxed = await mount('strict-off');
    expect(relaxed.shadowRoot.querySelector('span').textContent).toBe('A=x B=');

    const onError = vi.fn();
    Lego.config.onError = onError;
    Lego.config.strict = true;
    Lego.block('strict-on', '<span>[[ usre.email ]]</span>', { user: { email: 'a@b' } });
    await mount('strict-on');
    expect(onError).toHaveBeenCalled();
    expect(onError.mock.calls[0][0]).toBeInstanceOf(ReferenceError);
  });
});
