import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { JSDOM } from 'jsdom';

describe('LegoDOM v2 Renames', () => {
  let window, document, Lego;

  beforeEach(async () => {
    const dom = new JSDOM(`<!DOCTYPE html><body></body>`, {
      url: 'http://localhost/',
      runScripts: 'dangerously',
      resources: 'usable'
    });
    window = dom.window;
    document = window.document;
    global.window = window;
    global.document = document;
    global.Node = window.Node;
    global.Element = window.Element;
    global.HTMLElement = window.HTMLElement;
    global.MutationObserver = window.MutationObserver;
    global.customElements = window.customElements;
    global.CSSStyleSheet = window.CSSStyleSheet;

    // Load Lego
    const fs = await import('fs');
    const path = await import('path');
    const mainJs = fs.readFileSync(path.resolve(__dirname, '../main.js'), 'utf8');
    window.eval(mainJs);
    Lego = window.Lego;
    Lego.init();
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('Lego.block works correctly', async () => {
    Lego.block('test-block', '<span>[[ msg ]]</span>', { msg: 'I am a block' });

    document.body.innerHTML = '<test-block></test-block>';
    // Wait for mutation observer
    await new Promise(resolve => setTimeout(resolve, 0));

    const el = document.querySelector('test-block');
    expect(el.shadowRoot.innerHTML).toContain('I am a block');
  });

  it('Lego.define is an alias for Lego.block', () => {
    expect(Lego.define).toBe(Lego.block);
  });

  it('b-logic works for passing state', async () => {
    Lego.block('logic-block', '<span>[[ count ]]</span>');

    document.body.innerHTML = '<logic-block b-logic="{ count: 42 }"></logic-block>';
    await new Promise(resolve => setTimeout(resolve, 0));

    const el = document.querySelector('logic-block');
    expect(el.shadowRoot.innerHTML).toContain('42');
  });

  it('b-data fallback works', async () => {
    Lego.block('data-block', '<span>[[ count ]]</span>');

    document.body.innerHTML = '<data-block b-data="{ count: 100 }"></data-block>';
    await new Promise(resolve => setTimeout(resolve, 0));

    const el = document.querySelector('data-block');
    expect(el.shadowRoot.innerHTML).toContain('100');
  });

  it('b-logic takes precedence over b-data', async () => {
    Lego.block('prio-block', '<span>[[ count ]]</span>');

    document.body.innerHTML = '<prio-block b-logic="{ count: 1 }" b-data="{ count: 2 }"></prio-block>';
    await new Promise(resolve => setTimeout(resolve, 0));

    const el = document.querySelector('prio-block');
    expect(el.shadowRoot.innerHTML).toContain('1');
  });
});
