import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import fs from 'fs';
import path from 'path';

const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
  runScripts: "dangerously",
  resources: "usable"
});

global.window = dom.window;
global.document = dom.window.document;
Object.defineProperty(global, 'navigator', { value: dom.window.navigator });
global.HTMLElement = dom.window.HTMLElement;
global.customElements = dom.window.customElements;
global.MutationObserver = dom.window.MutationObserver;
global.Node = dom.window.Node;
global.NodeFilter = dom.window.NodeFilter;
global.Element = dom.window.Element;
global.Event = dom.window.Event;
global.fetch = vi.fn();
global.requestAnimationFrame = (cb) => setTimeout(cb, 0);

const libCode = fs.readFileSync(path.resolve(__dirname, '../main.js'), 'utf8');
eval(libCode);

describe('LegoDOM Server-Side Components', () => {
  beforeEach(async () => {
    document.body.innerHTML = '';
    vi.clearAllMocks();
  });

  it('should auto-load undefined components via loader config', async () => {
    // 1. Mock the server response
    const mockSFC = `
      <template>
        <div class="remote-box">Loaded from Server: [[ msg ]]</div>
      </template>
      <script>
        export default { msg: 'Remote Data' }
      </script>
      <style>
        .remote-box { color: blue; }
      </style>
    `;

    global.fetch.mockResolvedValue({
      text: () => Promise.resolve(mockSFC)
    });

    // 2. Initialize with loader
    await window.Lego.init(document.body, {
      loader: (tag) => {
        if (tag === 'remote-widget') return '/components/remote-widget.lego';
        return null;
      }
    });

    // 3. Inject undefined component
    const el = document.createElement('remote-widget');
    document.body.appendChild(el);

    // Wait for fetch + parse + render
    await new Promise(r => setTimeout(r, 100));

    // 4. Verify fetch called
    expect(global.fetch).toHaveBeenCalledWith('/components/remote-widget.lego');

    // 5. Verify render
    expect(el.shadowRoot).toBeDefined();
    expect(el.shadowRoot.textContent).toContain('Loaded from Server: Remote Data');

    // 6. Verify style injection
    const styles = el.shadowRoot.querySelector('style');
    expect(styles.textContent).toContain('.remote-box { color: blue; }');
  });

  it('should support async loader (Promise) for custom fetching', async () => {
    // Simulate user doing their own authenticated fetch
    const mockSFC = `<template><div>Async Auth Content</div></template>`;

    await window.Lego.init(document.body, {
      loader: async (tag) => {
        if (tag === 'auth-widget') {
          // Simulate network delay
          await new Promise(r => setTimeout(r, 10));
          return mockSFC;
        }
      }
    });

    const el = document.createElement('auth-widget');
    document.body.appendChild(el);

    // Wait for async loader
    await new Promise(r => setTimeout(r, 100));

    expect(el.shadowRoot).toBeDefined();
    expect(el.shadowRoot.textContent).toContain('Async Auth Content');
  });

  it('should fail gracefully if loader returns null', async () => {
    await window.Lego.init(document.body, {
      loader: () => null
    });

    const el = document.createElement('unknown-widget');
    document.body.appendChild(el);

    await new Promise(r => setTimeout(r, 50));
    expect(global.fetch).not.toHaveBeenCalled();
    expect(el.shadowRoot).toBeNull();
  });
});
