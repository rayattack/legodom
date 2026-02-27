import { describe, it, expect, beforeEach, vi } from 'vitest';
import { flush } from './test-utils.js';
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
global.ShadowRoot = dom.window.ShadowRoot;
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
const libCode = fs.readFileSync(path.resolve(__dirname, '../dist/lego.min.js'), 'utf8');
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
          ok: true,
          text: () => Promise.resolve(cssContent)
        });
      }
      return Promise.reject(new Error('Not found'));
    });

    // Initialize Lego with styles configuration
    await window.Lego.init(document.body, {
      styles: {
        mystyle: ['styles.css']
      }
    });

    window.Lego.block('styled-block', '<p>Hello</p>', {}, 'mystyle');

    const el = document.createElement('styled-block');
    document.body.appendChild(el);

    // Wait for mutation observer and async rendering
    await flush();

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
      if (url === 's1.css') return Promise.resolve({ ok: true, text: () => Promise.resolve(css1) });
      if (url === 's2.css') return Promise.resolve({ ok: true, text: () => Promise.resolve(css2) });
      return Promise.reject(new Error('Not found'));
    });

    await window.Lego.init(document.body, {
      styles: {
        base: ['s1.css'],
        theme: ['s2.css']
      }
    });

    window.Lego.block('multi-styled', '<p>Multi</p>', {}, 'base theme');

    const el = document.createElement('multi-styled');
    document.body.appendChild(el);

    await flush();

    const sheets = el.shadowRoot.adoptedStyleSheets;
    expect(sheets.length).toBe(2);
    expect(sheets[0].cssText).toBe(css1);
    expect(sheets[1].cssText).toBe(css2);
  });


  it('should apply h1 red style as requested', async () => {
    const cssRed = 'h1 { color: red; }';

    // Set up fetch mock for this test
    global.fetch = vi.fn().mockImplementation((url) => {
      if (url === 'red.css') return Promise.resolve({ ok: true, text: () => Promise.resolve(cssRed) });
      return Promise.reject(new Error('Not found'));
    });

    await window.Lego.init(document.body, {
      styles: {
        'make-it-red': ['red.css']
      }
    });

    window.Lego.block('red-block', '<h1>Header</h1>', {}, 'make-it-red');

    const el = document.createElement('red-block');
    document.body.appendChild(el);

    await flush();

    const sheets = el.shadowRoot.adoptedStyleSheets;
    expect(sheets.length).toBeGreaterThan(0);
    expect(sheets[0].cssText).toBe(cssRed);
  });

  describe('b-cascade tests', () => {
    it('should inherit stylesheets via b-cascade from parent', async () => {
      const globalCSS = ':host { border: 1px solid blue; }';
      const themeCSS = ':host { background: #f0f0f0; }';

      global.fetch = vi.fn().mockImplementation((url) => {
        if (url === 'global.css') return Promise.resolve({ ok: true, text: () => Promise.resolve(globalCSS) });
        if (url === 'theme.css') return Promise.resolve({ ok: true, text: () => Promise.resolve(themeCSS) });
        return Promise.reject(new Error('Not found'));
      });

      await window.Lego.init(document.body, {
        styles: {
          global: ['global.css'],
          theme: ['theme.css']
        }
      });

      // Parent with b-cascade
      window.Lego.block('cascade-parent', '<slot></slot>', {}, 'global theme', 'global');

      // Child that should inherit
      window.Lego.block('cascade-child', '<h3>Child</h3>');

      const parent = document.createElement('cascade-parent');
      const child = document.createElement('cascade-child');
      parent.appendChild(child);
      document.body.appendChild(parent);

      await flush();

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
        if (url === 'base.css') return Promise.resolve({ ok: true, text: () => Promise.resolve(baseCSS) });
        if (url === 'theme.css') return Promise.resolve({ ok: true, text: () => Promise.resolve(themeCSS) });
        if (url === 'custom.css') return Promise.resolve({ ok: true, text: () => Promise.resolve(customCSS) });
        return Promise.reject(new Error('Not found'));
      });

      await window.Lego.init(document.body, {
        styles: {
          base: ['base.css'],
          theme: ['theme.css'],
          custom: ['custom.css']
        }
      });

      window.Lego.block('merge-parent', '<slot></slot>', {}, 'base theme', 'base theme');

      // Child with explicit stylesheet - should MERGE (inherit base+theme AND add custom)
      window.Lego.block('merge-child', '<p>Explicit child</p>', {}, 'custom');

      const parent = document.createElement('merge-parent');
      const child = document.createElement('merge-child');
      parent.appendChild(child);
      document.body.appendChild(parent);

      await flush();

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

      global.fetch = vi.fn().mockImplementation((url) => {
        if (url === 'tokens.css') return Promise.resolve({ ok: true, text: () => Promise.resolve(tokensCSS) });
        if (url === 'layout.css') return Promise.resolve({ ok: true, text: () => Promise.resolve(layoutCSS) });
        return Promise.reject(new Error('Not found'));
      });

      await window.Lego.init(document.body, {
        styles: {
          tokens: ['tokens.css'],
          layout: ['layout.css']
        }
      });

      // Level 1: Root cascades tokens
      window.Lego.block('level1-root', '<slot></slot>', {}, 'tokens', 'tokens');

      // Level 2: Mid cascades layout
      window.Lego.block('level2-mid', '<slot></slot>', {}, 'layout', 'layout');

      // Level 3: Leaf (no explicit styles)
      window.Lego.block('level3-leaf', '<p>Deep child</p>');

      const root = document.createElement('level1-root');
      const mid = document.createElement('level2-mid');
      const leaf = document.createElement('level3-leaf');

      root.appendChild(mid);
      mid.appendChild(leaf);
      document.body.appendChild(root);

      await flush();

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
        if (url === 'shared.css') return Promise.resolve({ ok: true, text: () => Promise.resolve(sharedCSS) });
        return Promise.reject(new Error('Not found'));
      });

      await window.Lego.init(document.body, {
        styles: {
          shared: ['shared.css']
        }
      });

      window.Lego.block('dedup-parent', '<slot></slot>', {}, 'shared', 'shared');

      window.Lego.block('dedup-mid', '<slot></slot>', {}, 'shared', 'shared');

      window.Lego.block('dedup-child', '<p>Should not have duplicate</p>');

      const parent = document.createElement('dedup-parent');
      const mid = document.createElement('dedup-mid');
      const child = document.createElement('dedup-child');

      parent.appendChild(mid);
      mid.appendChild(child);
      document.body.appendChild(parent);

      await flush();

      // Child inherits 'shared' from both parent and mid, but should be deduped
      const childSheets = child.shadowRoot.adoptedStyleSheets;
      expect(childSheets.length).toBe(1);
      expect(childSheets[0].cssText).toBe(sharedCSS);
    });

    it('should provide debug metadata via Lego.debug.stylesheets', async () => {
      const inheritedCSS = '.inherited { color: blue; }';
      const explicitCSS = '.explicit { color: red; }';

      global.fetch = vi.fn().mockImplementation((url) => {
        if (url === 'inherited.css') return Promise.resolve({ ok: true, text: () => Promise.resolve(inheritedCSS) });
        if (url === 'explicit.css') return Promise.resolve({ ok: true, text: () => Promise.resolve(explicitCSS) });
        return Promise.reject(new Error('Not found'));
      });

      await window.Lego.init(document.body, {
        styles: {
          inherited: ['inherited.css'],
          explicit: ['explicit.css']
        }
      });

      window.Lego.block('debug-parent', '<slot></slot>', {}, 'inherited', 'inherited');

      window.Lego.block('debug-child', '<p>Debug child</p>', {}, 'explicit');

      const parent = document.createElement('debug-parent');
      const child = document.createElement('debug-child');
      parent.appendChild(child);
      document.body.appendChild(parent);

      await flush();

      // Use the debug API
      const debugInfo = window.Lego.debug.stylesheets(child);

      expect(debugInfo).toBeDefined();
      expect(debugInfo.inherited).toEqual(['inherited']);
      expect(debugInfo.explicit).toEqual(['explicit']);
      expect(debugInfo.applied).toEqual(['inherited', 'explicit']);
    });
  });
});
