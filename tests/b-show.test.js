import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { flush } from './test-utils.js';
import { JSDOM } from 'jsdom';
import fs from 'fs';
import path from 'path';

describe('b-show Directive', () => {
  let window, document, Lego;

  beforeEach(async () => {
    const dom = new JSDOM('<!DOCTYPE html><body></body>', {
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
    global.NodeFilter = window.NodeFilter;
    global.Event = window.Event;
    global.CSSStyleSheet = class {
      constructor() { this.cssRules = []; }
      replace(content) { this.cssText = content; return Promise.resolve(this); }
    };
    window.requestAnimationFrame = (cb) => setTimeout(cb, 0);

    const mainJs = fs.readFileSync(path.resolve(__dirname, '../dist/lego.min.js'), 'utf8');
    window.eval(mainJs);
    Lego = window.Lego;
    await Lego.init();
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('should hide element when condition is false', async () => {
    Lego.block('show-hide-a', '<div b-show="visible">Content</div>', {
      visible: false
    });
    document.body.innerHTML = '<show-hide-a></show-hide-a>';
    await flush(50);

    const el = document.querySelector('show-hide-a');
    const div = el.shadowRoot.querySelector('div');
    expect(div.style.display).toBe('none');
  });

  it('should show element when condition is true', async () => {
    Lego.block('show-vis-a', '<div b-show="visible">Content</div>', {
      visible: true
    });
    document.body.innerHTML = '<show-vis-a></show-vis-a>';
    await flush(50);

    const el = document.querySelector('show-vis-a');
    const div = el.shadowRoot.querySelector('div');
    expect(div.style.display).not.toBe('none');
  });

  it('should reactively toggle visibility', async () => {
    Lego.block('show-toggle-a', '<div b-show="visible">Content</div>', {
      visible: true
    });
    document.body.innerHTML = '<show-toggle-a></show-toggle-a>';
    await flush(50);

    const el = document.querySelector('show-toggle-a');
    const div = el.shadowRoot.querySelector('div');
    expect(div.style.display).not.toBe('none');

    el.state.visible = false;
    await flush(50);
    expect(div.style.display).toBe('none');

    el.state.visible = true;
    await flush(50);
    expect(div.style.display).not.toBe('none');
  });

  it('should evaluate expressions, not just booleans', async () => {
    Lego.block('show-expr-a', '<div b-show="count > 0">Has items</div>', {
      count: 0
    });
    document.body.innerHTML = '<show-expr-a></show-expr-a>';
    await flush(50);

    const el = document.querySelector('show-expr-a');
    const div = el.shadowRoot.querySelector('div');
    expect(div.style.display).toBe('none');

    el.state.count = 5;
    await flush(50);
    expect(div.style.display).not.toBe('none');
  });
});
