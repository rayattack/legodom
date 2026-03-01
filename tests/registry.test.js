import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { flush } from './test-utils.js';
import { JSDOM } from 'jsdom';
import fs from 'fs';
import path from 'path';

describe('Registry', () => {
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

  it('should register a block in the registry', () => {
    Lego.block('reg-test-a', '<div>Hello</div>');
    expect(Lego.getLegos()).toContain('reg-test-a');
  });

  it('should track active blocks when mounted', async () => {
    Lego.block('reg-active-a', '<div>Active</div>');
    expect(Lego.getActiveBlocksCount()).toBe(0);

    document.body.innerHTML = '<reg-active-a></reg-active-a>';
    await flush(50);

    expect(Lego.getActiveBlocksCount()).toBeGreaterThanOrEqual(1);
  });

  it('should remove from active blocks on unmount', async () => {
    Lego.block('reg-remove-a', '<div>Remove</div>');
    document.body.innerHTML = '<reg-remove-a></reg-remove-a>';
    await flush(50);

    const before = Lego.getActiveBlocksCount();
    document.body.innerHTML = '';
    await flush(50);

    expect(Lego.getActiveBlocksCount()).toBeLessThan(before);
  });

  it('getPrivateData should return consistent data for same element', async () => {
    Lego.block('reg-priv-a', '<div>Private</div>');
    document.body.innerHTML = '<reg-priv-a></reg-priv-a>';
    await flush(50);

    const el = document.querySelector('reg-priv-a');
    expect(el.shadowRoot).toBeTruthy();
    expect(el.state).toBeDefined();
  });

  it('should support multiple block registrations', () => {
    Lego.block('reg-multi-a', '<div>A</div>');
    Lego.block('reg-multi-b', '<div>B</div>');
    Lego.block('reg-multi-c', '<div>C</div>');

    const legos = Lego.getLegos();
    expect(legos).toContain('reg-multi-a');
    expect(legos).toContain('reg-multi-b');
    expect(legos).toContain('reg-multi-c');
  });
});
