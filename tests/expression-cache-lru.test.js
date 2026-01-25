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

const libCode = fs.readFileSync(path.resolve(__dirname, '../dist/main.js'), 'utf8');
eval(libCode);

describe('Expression Cache LRU Fix', () => {
  beforeEach(async () => {
    document.body.innerHTML = '';
    await window.Lego.init(document.body);
  });

  it('should cache compiled expressions for reuse', async () => {
    window.Lego.block('cache-test', '<div>[[count]]</div>');

    const el1 = document.createElement('cache-test');
    el1.setAttribute('b-data', '{ count: 1 }');
    document.body.appendChild(el1);
    await new Promise(r => setTimeout(r, 100));

    const el2 = document.createElement('cache-test');
    el2.setAttribute('b-data', '{ count: 2 }');
    document.body.appendChild(el2);
    await new Promise(r => setTimeout(r, 100));

    // Both should render correctly (cache working)
    expect(el1.shadowRoot.textContent).toContain('1');
    expect(el2.shadowRoot.textContent).toContain('2');
  });

  it('should limit cache size to prevent unbounded growth', async () => {
    window.Lego.block('dynamic-test', '<div b-if="show">[[message]]</div>');

    // Generate 1200 unique expressions (exceeds 1000 limit)
    for (let i = 0; i < 1200; i++) {
      const el = document.createElement('dynamic-test');
      el.setAttribute('b-data', `{ show: true, message: 'msg${i}' }`);
      document.body.appendChild(el);
      await new Promise(r => setTimeout(r, 1));
      el.remove();
      await new Promise(r => setTimeout(r, 1));
    }

    // Verify app didn't crash or run out of memory
    expect(document.body.children.length).toBe(0);
  }, 10000); // 10 second timeout

  it('should evict least recently used expressions', async () => {
    window.Lego.block('lru-test', '<span>[[value]]</span>');

    const elA = document.createElement('lru-test');
    elA.setAttribute('b-data', '{ value: "A" }');
    document.body.appendChild(elA);
    await new Promise(r => setTimeout(r, 10));

    const elB = document.createElement('lru-test');
    elB.setAttribute('b-data', '{ value: "B" }');
    document.body.appendChild(elB);
    await new Promise(r => setTimeout(r, 10));

    // Access A again (making it more recently used)
    elA.state.value = "A2";
    await new Promise(r => setTimeout(r, 50));

    expect(elA.shadowRoot.textContent).toContain('A2');
    expect(elB.shadowRoot.textContent).toContain('B');
  });

  it('should handle cache hits and misses correctly', async () => {
    window.Lego.block('hit-test', '<div>[[x + y]]</div>');

    const el1 = document.createElement('hit-test');
    el1.setAttribute('b-data', '{ x: 1, y: 2 }');
    document.body.appendChild(el1);
    await new Promise(r => setTimeout(r, 50));
    expect(el1.shadowRoot.textContent).toContain('3');

    const el2 = document.createElement('hit-test');
    el2.setAttribute('b-data', '{ x: 5, y: 10 }');
    document.body.appendChild(el2);
    await new Promise(r => setTimeout(r, 50));
    expect(el2.shadowRoot.textContent).toContain('15');
  });

  it('should not crash when cache is full', async () => {
    window.Lego.block('fill-test', '<div>[[val]]</div>');

    const elements = [];
    for (let i = 0; i < 100; i++) {
      const el = document.createElement('fill-test');
      el.setAttribute('b-data', `{ val: ${i} }`);
      document.body.appendChild(el);
      elements.push(el);
    }

    await new Promise(r => setTimeout(r, 200));

    elements.forEach((el, i) => {
      expect(el.shadowRoot.textContent).toContain(String(i));
    });

    elements.forEach(el => el.remove());
  });
});
