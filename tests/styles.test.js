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
global.ShadowRoot = dom.window.ShadowRoot; // Add this line
global.Event = dom.window.Event;
global.FormData = dom.window.FormData;

// Shim ShadowRoot.prototype.adoptedStyleSheets for JSDOM
if (!dom.window.ShadowRoot.prototype.hasOwnProperty('adoptedStyleSheets')) {
  Object.defineProperty(dom.window.ShadowRoot.prototype, 'adoptedStyleSheets', {
    get() { return this._adoptedStyleSheets || []; },
    set(sheets) { this._adoptedStyleSheets = sheets; },
    configurable: true,
    enumerable: true
  });
}
if (!dom.window.Document.prototype.hasOwnProperty('adoptedStyleSheets')) {
  Object.defineProperty(dom.window.Document.prototype, 'adoptedStyleSheets', {
    get() { return this._adoptedStyleSheets || []; },
    set(sheets) { this._adoptedStyleSheets = sheets; },
    configurable: true,
    enumerable: true
  });
}

// Mock CSSStyleSheet for JSDOM
global.CSSStyleSheet = class {
  constructor() { this.cssRules = []; this.cssText = ''; }
  replace(content) { this.cssText = content; return Promise.resolve(this); }
};

global.requestAnimationFrame = (cb) => setTimeout(cb, 0);

// 2. Load the library code
const libCode = fs.readFileSync(path.resolve(__dirname, '../main.js'), 'utf8');
// Evaluate library code in the mock environment
eval(libCode);

describe('Lego Stylesheets Tests', () => {

  beforeEach(() => {
    document.body.innerHTML = '';
    // Reset fetch mock
    global.fetch = undefined;
  });

  it('should apply b-stylesheets to blocks', async () => {
    const cssContent = 'p { font-size: 20px; }';

    // Mock fetch to return our CSS
    global.fetch = vi.fn().mockImplementation((url) => {
      if (url === 'styles.css') {
        return Promise.resolve({
          text: () => Promise.resolve(cssContent)
        });
      }
      if (url === 's1.css') return Promise.resolve({ text: () => Promise.resolve('.one { color: red; }') });
      if (url === 's2.css') return Promise.resolve({ text: () => Promise.resolve('.two { color: blue; }') });

      return Promise.reject(new Error('Not found'));
    });

    // Initialize Lego with styles configuration
    await window.Lego.init(document.body, {
      styles: {
        mystyle: ['styles.css']
      }
    });

    // Define a block that uses the stylesheet using .lego file simulation
    window.Lego.defineLegoFile(`
      <template b-stylesheets="mystyle">
        <p>Hello</p>
      </template>
    `, 'styled-block.lego');

    const el = document.createElement('styled-block');
    document.body.appendChild(el);

    // Wait for mutation observer and async rendering
    await new Promise(r => setTimeout(r, 100));

    // Verify shadow root has adoptedStyleSheets
    expect(el.shadowRoot).toBeDefined();
    // Use the proxied property from our shim
    const sheets = el.shadowRoot.adoptedStyleSheets;
    expect(sheets).toBeDefined();
    expect(sheets.length).toBeGreaterThan(0);

    // Check if the content of the stylesheet matches
    expect(sheets[0].cssText).toBe(cssContent);
  });

  it('should handle multiple stylesheets in b-stylesheets', async () => {
    const css1 = '.one { color: red; }';
    const css2 = '.two { color: blue; }';

    global.fetch = vi.fn().mockImplementation((url) => {
      if (url === 's1.css') return Promise.resolve({ text: () => Promise.resolve(css1) });
      if (url === 's2.css') return Promise.resolve({ text: () => Promise.resolve(css2) });
      return Promise.reject(new Error('Not found'));
    });

    await window.Lego.init(document.body, {
      styles: {
        base: ['s1.css'],
        theme: ['s2.css']
      }
    });

    window.Lego.defineLegoFile(`
       <template b-stylesheets="base theme">
         <p>Multi</p>
       </template>
     `, 'multi-styled.lego');

    const el = document.createElement('multi-styled');
    document.body.appendChild(el);

    await new Promise(r => setTimeout(r, 100));

    const sheets = el.shadowRoot.adoptedStyleSheets;
    expect(sheets.length).toBe(2);
    expect(sheets[0].cssText).toBe(css1);
    expect(sheets[1].cssText).toBe(css2);
  });


  it('should apply h1 red style as requested', async () => {
    const cssRed = 'h1 { color: red; }';

    global.fetch = vi.fn().mockImplementation((url) => {
      if (url === 'red.css') return Promise.resolve({ text: () => Promise.resolve(cssRed) });
      return Promise.reject(new Error('Not found'));
    });

    await window.Lego.init(document.body, {
      styles: {
        'make-it-red': ['red.css']
      }
    });

    window.Lego.defineLegoFile(`
      <template b-stylesheets="make-it-red">
        <h1>Header</h1>
      </template>
    `, 'red-block.lego');

    const el = document.createElement('red-block');
    document.body.appendChild(el);

    await new Promise(r => setTimeout(r, 100));

    const sheets = el.shadowRoot.adoptedStyleSheets;
    expect(sheets.length).toBeGreaterThan(0);
    expect(sheets[0].cssText).toBe(cssRed);
  });
});
