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
      if (url === 'red.css') return Promise.resolve({ text: () => Promise.resolve('h1 { color: red; }') });

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

    // Set up fetch mock for this test
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

  describe('b-cascade tests', () => {
    it('should inherit stylesheets via b-cascade from parent', async () => {
      const globalCSS = ':host { border: 1px solid blue; }';
      const themeCSS = ':host { background: #f0f0f0; }';

      global.fetch = vi.fn().mockImplementation((url) => {
        if (url === 'global.css') return Promise.resolve({ text: () => Promise.resolve(globalCSS) });
        if (url === 'theme.css') return Promise.resolve({ text: () => Promise.resolve(themeCSS) });
        return Promise.reject(new Error('Not found'));
      });

      await window.Lego.init(document.body, {
        styles: {
          global: ['global.css'],
          theme: ['theme.css']
        }
      });

      // Parent with b-cascade
      window.Lego.defineLegoFile(`
        <template b-stylesheets="global theme" b-cascade="global">
          <slot></slot>
        </template>
      `, 'cascade-parent.lego');

      // Child that should inherit
      window.Lego.defineLegoFile(`
        <template>
          <h3>Child</h3>
        </template>
      `, 'cascade-child.lego');

      const parent = document.createElement('cascade-parent');
      const child = document.createElement('cascade-child');
      parent.appendChild(child);
      document.body.appendChild(parent);

      await new Promise(r => setTimeout(r, 100));

      // Parent should have both global and theme
      expect(parent.shadowRoot.adoptedStyleSheets.length).toBe(2);

      // Child should inherit global (but not theme, since only global is in b-cascade)
      expect(child.shadowRoot.adoptedStyleSheets.length).toBe(1);
      expect(child.shadowRoot.adoptedStyleSheets[0].cssText).toBe(globalCSS);
    });

    it('should merge inherited and explicit stylesheets', async () => {
      const baseCSS = '.base { margin: 0; }';
      const themeCSS = '.theme { color: navy; }';
      const customCSS = '.custom { font-size: 16px; }';

      global.fetch = vi.fn().mockImplementation((url) => {
        if (url === 'base.css') return Promise.resolve({ text: () => Promise.resolve(baseCSS) });
        if (url === 'theme.css') return Promise.resolve({ text: () => Promise.resolve(themeCSS) });
        if (url === 'custom.css') return Promise.resolve({ text: () => Promise.resolve(customCSS) });
        return Promise.reject(new Error('Not found'));
      });

      await window.Lego.init(document.body, {
        styles: {
          base: ['base.css'],
          theme: ['theme.css'],
          custom: ['custom.css']
        }
      });

      window.Lego.defineLegoFile(`
        <template b-stylesheets="base theme" b-cascade="base theme">
          <slot></slot>
        </template>
      `, 'merge-parent.lego');

      // Child with explicit stylesheet - should MERGE (inherit base+theme AND add custom)
      window.Lego.defineLegoFile(`
        <template b-stylesheets="custom">
          <p>Explicit child</p>
        </template>
      `, 'merge-child.lego');

      const parent = document.createElement('merge-parent');
      const child = document.createElement('merge-child');
      parent.appendChild(child);
      document.body.appendChild(parent);

      await new Promise(r => setTimeout(r, 100));

      // Child should have all three: base (inherited), theme (inherited), custom (explicit)
      const childSheets = child.shadowRoot.adoptedStyleSheets;
      expect(childSheets.length).toBe(3);

      // Verify all stylesheets are present
      const cssTexts = childSheets.map(s => s.cssText);
      expect(cssTexts).toContain(baseCSS);
      expect(cssTexts).toContain(themeCSS);
      expect(cssTexts).toContain(customCSS);
    });

    it('should support multi-level cascade', async () => {
      const tokensCSS = ':host { --spacing: 8px; }';
      const layoutCSS = ':host { display: block; }';
      const componCSS = ':host { padding: 1rem; }';

      global.fetch = vi.fn().mockImplementation((url) => {
        if (url === 'tokens.css') return Promise.resolve({ text: () => Promise.resolve(tokensCSS) });
        if (url === 'layout.css') return Promise.resolve({ text: () => Promise.resolve(layoutCSS) });
        if (url === 'compon.css') return Promise.resolve({ text: () => Promise.resolve(componCSS) });
        return Promise.reject(new Error('Not found'));
      });

      await window.Lego.init(document.body, {
        styles: {
          tokens: ['tokens.css'],
          layout: ['layout.css'],
          compon: ['compon.css']
        }
      });

      // Level 1: Root cascades tokens
      window.Lego.defineLegoFile(`
        <template b-stylesheets="tokens" b-cascade="tokens">
          <slot></slot>
        </template>
      `, 'level1-root.lego');

      // Level 2: Mid cascades layout
      window.Lego.defineLegoFile(`
        <template b-stylesheets="layout" b-cascade="layout">
          <slot></slot>
        </template>
      `, 'level2-mid.lego');

      // Level 3: Leaf (no explicit styles)
      window.Lego.defineLegoFile(`
        <template>
          <p>Deep child</p>
        </template>
      `, 'level3-leaf.lego');

      const root = document.createElement('level1-root');
      const mid = document.createElement('level2-mid');
      const leaf = document.createElement('level3-leaf');

      root.appendChild(mid);
      mid.appendChild(leaf);
      document.body.appendChild(root);

      await new Promise(r => setTimeout(r, 100));

      // Leaf should inherit tokens (from root) + layout (from mid)
      const leafSheets = leaf.shadowRoot.adoptedStyleSheets;
      expect(leafSheets.length).toBe(2);

      const cssTexts = leafSheets.map(s => s.cssText);
      expect(cssTexts).toContain(tokensCSS);
      expect(cssTexts).toContain(layoutCSS);
    });

    it('should deduplicate inherited stylesheets', async () => {
      const sharedCSS = ':host { margin: 0; }';

      global.fetch = vi.fn().mockImplementation((url) => {
        if (url === 'shared.css') return Promise.resolve({ text: () => Promise.resolve(sharedCSS) });
        return Promise.reject(new Error('Not found'));
      });

      await window.Lego.init(document.body, {
        styles: {
          shared: ['shared.css']
        }
      });

      window.Lego.defineLegoFile(`
        <template b-stylesheets="shared" b-cascade="shared">
          <slot></slot>
        </template>
      `, 'dedup-parent.lego');

      window.Lego.defineLegoFile(`
        <template b-stylesheets="shared" b-cascade="shared">
          <slot></slot>
        </template>
      `, 'dedup-mid.lego');

      window.Lego.defineLegoFile(`
        <template>
          <p>Should not have duplicate</p>
        </template>
      `, 'dedup-child.lego');

      const parent = document.createElement('dedup-parent');
      const mid = document.createElement('dedup-mid');
      const child = document.createElement('dedup-child');

      parent.appendChild(mid);
      mid.appendChild(child);
      document.body.appendChild(parent);

      await new Promise(r => setTimeout(r, 100));

      // Child inherits 'shared' from both parent and mid, but should be deduped
      const childSheets = child.shadowRoot.adoptedStyleSheets;
      expect(childSheets.length).toBe(1);
      expect(childSheets[0].cssText).toBe(sharedCSS);
    });

    it('should provide debug metadata via Lego.debug.stylesheets', async () => {
      const inheritedCSS = '.inherited { color: blue; }';
      const explicitCSS = '.explicit { color: red; }';

      global.fetch = vi.fn().mockImplementation((url) => {
        if (url === 'inherited.css') return Promise.resolve({ text: () => Promise.resolve(inheritedCSS) });
        if (url === 'explicit.css') return Promise.resolve({ text: () => Promise.resolve(explicitCSS) });
        return Promise.reject(new Error('Not found'));
      });

      await window.Lego.init(document.body, {
        styles: {
          inherited: ['inherited.css'],
          explicit: ['explicit.css']
        }
      });

      window.Lego.defineLegoFile(`
        <template b-stylesheets="inherited" b-cascade="inherited">
          <slot></slot>
        </template>
      `, 'debug-parent.lego');

      window.Lego.defineLegoFile(`
        <template b-stylesheets="explicit">
          <p>Debug child</p>
        </template>
      `, 'debug-child.lego');

      const parent = document.createElement('debug-parent');
      const child = document.createElement('debug-child');
      parent.appendChild(child);
      document.body.appendChild(parent);

      await new Promise(r => setTimeout(r, 100));

      // Use the debug API
      const debugInfo = window.Lego.debug.stylesheets(child);

      expect(debugInfo).toBeDefined();
      expect(debugInfo.inherited).toEqual(['inherited']);
      expect(debugInfo.explicit).toEqual(['explicit']);
      expect(debugInfo.applied).toEqual(['inherited', 'explicit']);
    });
  });
});
