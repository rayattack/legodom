import { describe, it, expect, beforeEach, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import fs from 'fs';
import path from 'path';

// 1. Setup the DOM environment
const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
  runScripts: "dangerously",
  resources: "usable"
});

global.window = dom.window;
global.document = dom.window.document;

// Use defineProperty for navigator as it might be read-only in some environments
Object.defineProperty(global, 'navigator', {
  value: dom.window.navigator,
  writable: true,
  configurable: true
});
global.HTMLElement = dom.window.HTMLElement;
global.customElements = dom.window.customElements;
global.MutationObserver = dom.window.MutationObserver;
global.Node = dom.window.Node;
global.NodeFilter = dom.window.NodeFilter;
global.Element = dom.window.Element;
global.Event = dom.window.Event;
global.FormData = dom.window.FormData;

// Mock CSSStyleSheet for JSDOM
global.CSSStyleSheet = class {
  constructor() { this.cssRules = []; }
  replace(content) { this.cssText = content; return Promise.resolve(this); }
};

global.requestAnimationFrame = (cb) => setTimeout(cb, 0);

// 2. Load the library code
// We read it as a string to execute it in our shimmed global environment
const libCode = fs.readFileSync(path.resolve(__dirname, '../main.js'), 'utf8');
eval(libCode);

describe('Lego JS Node Environment Tests', () => {
  beforeEach(async () => {
    document.body.innerHTML = '';
    window.clicked = false;
    // Initializing the library manually for the test environment
    await window.Lego.init(document.body);
  });

  it('should initialize the Lego global object', () => {
    expect(window.Lego).toBeDefined();
    expect(typeof window.Lego.define).toBe('function');
  });

  it('should reactively update text content', async () => {
    window.Lego.define('test-comp', '<span>[[msg]]</span>');
    const el = document.createElement('test-comp');
    el.setAttribute('b-data', "{ msg: 'hello' }");
    document.body.appendChild(el);

    // Wait for MutationObserver / snap to fire
    await new Promise(r => setTimeout(r, 100));

    const span = el.shadowRoot.querySelector('span');
    expect(span.textContent).toBe('hello');

    // Test reactivity
    el._studs.msg = 'world';

    // Wait for batcher (requestAnimationFrame shim)
    await new Promise(r => setTimeout(r, 100));
    expect(span.textContent).toBe('world');
  });

  it('should prevent XSS via auto-escaping', async () => {
    window.Lego.define('xss-comp', '<div>[[code]]</div>');
    const el = document.createElement('xss-comp');
    el.setAttribute('b-data', "{ code: '<script>alert(1)</script>' }");
    document.body.appendChild(el);

    await new Promise(r => setTimeout(r, 100));

    const div = el.shadowRoot.querySelector('div');
    // It should be escaped, not raw HTML
    expect(div.innerHTML).toContain('&lt;script&gt;');
  });

  it('should handle @events using the universal binder', async () => {
    window.Lego.define('event-comp', '<button @click="handleClick">Click Me</button>');

    const el = document.createElement('event-comp');
    el.setAttribute('b-data', `{ handleClick: () => { window.clicked = true; } }`);
    document.body.appendChild(el);

    await new Promise(r => setTimeout(r, 100));

    const btn = el.shadowRoot.querySelector('button');
    btn.click();

    expect(window.clicked).toBe(true);
  });
});
