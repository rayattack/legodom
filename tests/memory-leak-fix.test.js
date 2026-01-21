import { describe, it, expect, beforeEach } from 'vitest';
import { JSDOM } from 'jsdom';
import fs from 'fs';
import path from 'path';

const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
  runScripts: "dangerously",
  resources: "usable"
});

global.window = dom.window;
global.document = dom.window.document;
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
global.requestAnimationFrame = (cb) => setTimeout(cb, 0);

const libCode = fs.readFileSync(path.resolve(__dirname, '../main.js'), 'utf8');
eval(libCode);

describe('Memory Leak Fix - Circular References', () => {
  beforeEach(async () => {
    document.body.innerHTML = '';
    await window.Lego.init(document.body);
  });

  it('should break circular references when element is removed', async () => {
    window.Lego.define('leak-test', '<div>[[msg]]</div>');

    const el = document.createElement('leak-test');
    el.setAttribute('b-data', '{ msg: "test" }');
    document.body.appendChild(el);
    await new Promise(r => setTimeout(r, 100));

    // Verify element is initialized
    expect(el._studs).toBeDefined();
    expect(el._studs.$element).toBe(el);
    expect(el._studs.msg).toBe('test');

    // Remove element (triggers unsnap)
    el.remove();
    await new Promise(r => setTimeout(r, 100));

    // MEMORY LEAK FIX: Verify circular references are broken
    expect(el._studs).toBeNull();
    expect(window.Lego.getActiveBlocksCount()).toBe(0);
  });

  it('should clear $vars references to prevent memory leaks', async () => {
    window.Lego.define('vars-test', '<input b-var="myInput" />');

    const el = document.createElement('vars-test');
    document.body.appendChild(el);
    await new Promise(r => setTimeout(r, 100));

    const input = el.shadowRoot.querySelector('input');
    expect(el._studs.$vars.myInput).toBe(input);

    // Remove and verify cleanup
    el.remove();
    await new Promise(r => setTimeout(r, 100));

    expect(el._studs).toBeNull();
  });

  it('should clear bindings array to free node references', async () => {
    window.Lego.define('binding-test', '<div b-if="show">Content</div>');

    const el = document.createElement('binding-test');
    el.setAttribute('b-data', '{ show: true }');
    document.body.appendChild(el);
    await new Promise(r => setTimeout(r, 100));

    // Remove
    el.remove();
    await new Promise(r => setTimeout(r, 100));

    // Internal bindings should be cleared
    expect(el._studs).toBeNull();
  });

  it('should clear for-loop pools to prevent pooled node leaks', async () => {
    window.Lego.define('pool-test', '<div b-for="item in items">[[item]]</div>');

    const el = document.createElement('pool-test');
    el.setAttribute('b-data', '{ items: [1, 2, 3, 4, 5] }');
    document.body.appendChild(el);
    await new Promise(r => setTimeout(r, 100));

    // Verify pool exists - cloned divs are now siblings in shadowRoot
    const children = el.shadowRoot.querySelectorAll('div');
    expect(children.length).toBe(5);

    // Remove and verify pool cleanup
    el.remove();
    await new Promise(r => setTimeout(r, 100));

    expect(el._studs).toBeNull();
    expect(window.Lego.getActiveBlocksCount()).toBe(0);
  });

  it('should handle nested blocks cleanup recursively', async () => {
    window.Lego.define('parent-leak', '<child-leak></child-leak>');
    window.Lego.define('child-leak', '<span>Child</span>');

    const el = document.createElement('parent-leak');
    document.body.appendChild(el);
    await new Promise(r => setTimeout(r, 100));

    expect(window.Lego.getActiveBlocksCount()).toBe(2);

    // Remove parent
    el.remove();
    await new Promise(r => setTimeout(r, 100));

    // Both parent and child should be cleaned up
    expect(window.Lego.getActiveBlocksCount()).toBe(0);
    expect(el._studs).toBeNull();
  });

  it('should not crash if unmounted hook throws error', async () => {
    window.Lego.define('error-unmount', '<div>Test</div>', {
      unmounted() {
        throw new Error('Unmount error');
      }
    });

    const el = document.createElement('error-unmount');
    document.body.appendChild(el);
    await new Promise(r => setTimeout(r, 100));

    // Should not throw
    expect(() => {
      el.remove();
    }).not.toThrow();

    await new Promise(r => setTimeout(r, 100));

    // Cleanup should still happen despite error
    expect(el._studs).toBeNull();
  });

  it('should clean up multiple elements in sequence without memory buildup', async () => {
    window.Lego.define('bulk-test', '<div>[[index]]</div>');

    // Create and destroy 100 elements
    for (let i = 0; i < 100; i++) {
      const el = document.createElement('bulk-test');
      el.setAttribute('b-data', `{ index: ${i} }`);
      document.body.appendChild(el);
      await new Promise(r => setTimeout(r, 5));

      el.remove();
      await new Promise(r => setTimeout(r, 5));

      // Verify cleanup happened
      expect(el._studs).toBeNull();
    }

    // No blocks should be active
    expect(window.Lego.getActiveBlocksCount()).toBe(0);
  });
});
