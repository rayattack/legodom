import { describe, it, expect, beforeEach, vi } from 'vitest';
import { flush } from './test-utils.js';
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

const libCode = fs.readFileSync(path.resolve(__dirname, '../dist/lego.min.js'), 'utf8');
eval(libCode);

describe('Batcher Race Condition Fix', () => {
  beforeEach(async () => {
    document.body.innerHTML = '';
    await window.Lego.init(document.body);
  });

  it('should not drop updates arriving during render', async () => {
    let renderCount = 0;

    window.Lego.block('race-test', '<div>[[count]]</div>', {
      count: 0,
      updated() {
        renderCount++;
        // Trigger another update during render
        if (renderCount === 1) {
          this.count = 2;
        }
      }
    });

    const el = document.createElement('race-test');
    document.body.appendChild(el);
    await flush();

    // Initial state
    expect(el.state.count).toBe(0);

    // Trigger first update
    el.state.count = 1;
    await flush(200);

    // Should have processed both updates (1 and 2), not dropped the second
    expect(el.state.count).toBe(2);
    expect(el.shadowRoot.textContent).toContain('2');
  });

  it('should handle rapid consecutive updates', async () => {
    window.Lego.block('rapid-test', '<div>[[value]]</div>', {
      value: 0
    });

    const el = document.createElement('rapid-test');
    document.body.appendChild(el);
    await flush(50);

    // Fire 10 updates rapidly
    for (let i = 1; i <= 10; i++) {
      el.state.value = i;
    }

    await flush(200);

    // Final value should be 10 (not dropped)
    expect(el.state.value).toBe(10);
    expect(el.shadowRoot.textContent).toContain('10');
  });

  it('should preserve final state after rapid updates', async () => {
    window.Lego.block('order-test', '<div>[[step]]</div>', {
      step: 0
    });

    const el = document.createElement('order-test');
    document.body.appendChild(el);
    await flush(50);

    // Trigger rapid updates (batching will coalesce)
    el.state.step = 1;
    el.state.step = 2;
    el.state.step = 3;

    await flush(200);

    // Final state should be preserved
    expect(el.state.step).toBe(3);
    expect(el.shadowRoot.textContent).toContain('3');
  });

  it('should queue updates from multiple blocks', async () => {
    window.Lego.block('multi-test', '<span>[[id]]:[[value]]</span>', {
      id: 0,
      value: 0
    });

    const el1 = document.createElement('multi-test');
    el1.setAttribute('b-data', '{ id: 1, value: 0 }');
    document.body.appendChild(el1);

    const el2 = document.createElement('multi-test');
    el2.setAttribute('b-data', '{ id: 2, value: 0 }');
    document.body.appendChild(el2);

    await flush();

    // Update both simultaneously
    el1.state.value = 10;
    el2.state.value = 20;

    await flush(150);

    // Both should be updated
    expect(el1.shadowRoot.textContent).toContain('1:10');
    expect(el2.shadowRoot.textContent).toContain('2:20');
  });
});
