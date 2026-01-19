import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { JSDOM } from 'jsdom';

describe('LegoDOM v2 New Features', () => {
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

  it('Scoped Props: Child inherits parent state in b-logic', async () => {
    Lego.block('parent-block', '<child-block b-logic="{ val: parentVal }"></child-block>', { parentVal: 'inherited' });
    Lego.block('child-block', '<span>[[ val ]]</span>');

    document.body.innerHTML = '<parent-block></parent-block>';
    await new Promise(resolve => setTimeout(resolve, 10));

    const parent = document.querySelector('parent-block');
    const child = parent.shadowRoot.querySelector('child-block');
    expect(child.shadowRoot.innerHTML).toContain('inherited');
  });

  it('$parent: Resolves to nearest block ancestor in Template', async () => {
    Lego.block('grand-parent', '<parent-wrapper></parent-wrapper>');
    Lego.block('parent-wrapper', '<div><child-item></child-item></div>'); // Nested in div
    // Child uses $parent.tagName in template. 
    // $parent should refer to 'parent-wrapper' (its block parent)
    Lego.block('child-item', '<span>[[ $parent.tagName ]]</span>');

    document.body.innerHTML = '<grand-parent></grand-parent>';
    await new Promise(resolve => setTimeout(resolve, 10));

    const gp = document.querySelector('grand-parent');
    const parent = gp.shadowRoot.querySelector('parent-wrapper');
    const child = parent.shadowRoot.querySelector('child-item');

    // Checks that we skipped the 'div' and finding the block
    expect(child.shadowRoot.innerHTML).toContain('PARENT-WRAPPER');
  });

  it('b-logic scope: explicit parent access', async () => {
    // In b-logic, 'this' is the parent scope.
    // So $element refers to the PARENT element.
    Lego.block('param-parent', '<param-child b-logic="{ pName: $element.tagName }"></param-child>');
    Lego.block('param-child', '<span>[[ pName ]]</span>');

    document.body.innerHTML = '<param-parent></param-parent>';
    await new Promise(resolve => setTimeout(resolve, 10));

    const p = document.querySelector('param-parent');
    const c = p.shadowRoot.querySelector('param-child');
    expect(c.shadowRoot.innerHTML).toContain('PARAM-PARENT');
  });
});
