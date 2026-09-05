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
  win.requestAnimationFrame = (cb) => setTimeout(cb, 0);
  win.cancelAnimationFrame = (id) => clearTimeout(id);
  global.requestAnimationFrame = win.requestAnimationFrame;
  global.cancelAnimationFrame = win.cancelAnimationFrame;
  win.eval(libCode);
  return win;
};

describe('b-props: declarative prop contract', () => {
  let win, Lego, warnSpy, errorSpy;

  beforeEach(async () => {
    win = setupDom();
    Lego = win.Lego;
    win.localStorage.clear();
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    await Lego.init(win.document.body);
  });

  afterEach(() => {
    win.document.body.innerHTML = '';
    warnSpy.mockRestore();
    errorSpy.mockRestore();
  });

  const propWarnings = () =>
    warnSpy.mock.calls
      .map(c => c[0])
      .filter(m => typeof m === 'string' && m.includes('[Lego]') &&
                   (m.includes('b-props') || m.includes('missing prop')));

  it('does not warn when every declared prop is provided via b-logic', async () => {
    Lego.block(
      'props-ok',
      '<span>[[ name ]] / [[ age ]]</span>',
      {},                  // no script defaults
      '', '', '',
      '{ name, age }'
    );
    win.document.body.innerHTML = `<props-ok b-logic="{ name: 'Alice', age: 30 }"></props-ok>`;
    await flush(20);

    expect(propWarnings()).toEqual([]);
    expect(win.document.querySelector('props-ok').shadowRoot.textContent).toContain('Alice / 30');
  });

  it('warns when a declared prop is missing (not provided and no script default)', async () => {
    Lego.block(
      'props-missing',
      '<span>[[ name ]]</span>',
      {},
      '', '', '',
      '{ name, age }'
    );
    win.document.body.innerHTML = `<props-missing b-logic="{ name: 'Alice' }"></props-missing>`;
    await flush(20);

    const msgs = propWarnings();
    expect(msgs.some(m => m.includes('missing prop "age"'))).toBe(true);
    expect(msgs.some(m => m.includes('missing prop "name"'))).toBe(false);
  });

  it('does not warn for a declared prop covered by a script default', async () => {
    Lego.block(
      'props-defaulted',
      '<span>[[ title ]]</span>',
      { title: 'Default' },     // script default fills the gap
      '', '', '',
      '{ title }'
    );
    win.document.body.innerHTML = `<props-defaulted></props-defaulted>`;
    await flush(20);

    expect(propWarnings()).toEqual([]);
    expect(win.document.querySelector('props-defaulted').shadowRoot.textContent).toContain('Default');
  });

  it('warns when b-logic passes a key not declared in b-props', async () => {
    Lego.block(
      'props-unknown',
      '<span>[[ name ]]</span>',
      {},
      '', '', '',
      '{ name }'
    );
    win.document.body.innerHTML = `<props-unknown b-logic="{ name: 'Alice', foo: 1 }"></props-unknown>`;
    await flush(20);

    const msgs = propWarnings();
    expect(msgs.some(m => m.includes('b-logic key "foo"'))).toBe(true);
    expect(msgs.some(m => m.includes('b-logic key "name"'))).toBe(false);
  });

  it('rejects an unparseable b-props declaration with a clear error and no crash', async () => {
    Lego.block(
      'props-bad-syntax',
      '<span>[[ name ]]</span>',
      { name: 'fallback' },
      '', '', '',
      `{ name: 'Alice' }`         // 'Alice' is not a declared type
    );
    win.document.body.innerHTML = `<props-bad-syntax></props-bad-syntax>`;
    await flush(20);

    const errs = errorSpy.mock.calls.map(c => c[0]);
    expect(errs.some(m =>
      typeof m === 'string' && m.includes('Invalid b-props') && m.includes('not a valid prop declaration')
    )).toBe(true);

    // No crash + no propWarnings (parse failed → no contract registered → silent)
    expect(propWarnings()).toEqual([]);
    expect(win.document.querySelector('props-bad-syntax').shadowRoot.textContent).toContain('fallback');
  });

  it('tolerates whitespace and accepts both braced and unbraced lists', async () => {
    Lego.block('props-ws-a', '<span>[[ a ]]</span>', { a: 1 }, '', '', '', '   {   a   }   ');
    Lego.block('props-ws-b', '<span>[[ b ]]</span>', { b: 2 }, '', '', '', 'b');
    Lego.block('props-ws-c', '<span>[[ c ]]</span>', { c: 3 }, '', '', '', ' c , ');

    win.document.body.innerHTML = `
      <props-ws-a></props-ws-a>
      <props-ws-b></props-ws-b>
      <props-ws-c></props-ws-c>
    `;
    await flush(20);

    expect(propWarnings()).toEqual([]);
    expect(errorSpy.mock.calls.length).toBe(0);
  });

  it('blocks without b-props validate nothing (existing behaviour preserved)', async () => {
    Lego.block(
      'props-omitted',
      '<span>[[ anything ]]</span>',
      {}
      // no props arg
    );
    win.document.body.innerHTML = `<props-omitted b-logic="{ anything: 'x', extra: 'y' }"></props-omitted>`;
    await flush(20);

    expect(propWarnings()).toEqual([]);
  });

  it('inline <template b-id b-props> registers the contract and warns on missing', async () => {
    win.document.body.innerHTML = `
      <template b-id="props-inline" b-props="{ a, b }">
        <span>[[ a ]]/[[ b ]]</span>
      </template>
      <props-inline b-logic="{ a: 1 }"></props-inline>
    `;
    // Re-run init so the inline template is picked up.
    await Lego.init(win.document.body);
    await flush(20);

    const msgs = propWarnings();
    expect(msgs.some(m => m.includes('missing prop "b"'))).toBe(true);
  });
});
