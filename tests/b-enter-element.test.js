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
global.Node = dom.window.Node;
global.Element = dom.window.Element;
global.Event = dom.window.Event;
global.NodeFilter = dom.window.NodeFilter;
global.FormData = dom.window.FormData;
global.requestAnimationFrame = (cb) => setTimeout(cb, 0);

// Mock IntersectionObserver
global.IntersectionObserver = class {
  constructor(cb) {
    this.cb = cb;
  }
  observe(element) {
    // Immediately trigger intersection for testing
    this.cb([{ isIntersecting: true, target: element }]);
  }
  disconnect() { }
};

// Load the library code (pointing to the output of build.js)
const libCode = fs.readFileSync(path.resolve(__dirname, '../dist/lego.min.js'), 'utf8');
eval(libCode);

describe('b-enter directive $element access', () => {
  beforeEach(async () => {
    document.body.innerHTML = '';
    await window.Lego.init(document.body);
  });

  it('should have access to $element in b-enter expression', async () => {
    window.Lego.block('test-enter', '<div b-enter="$element.classList.add(\'seen\')"></div>');
    const el = document.createElement('test-enter');
    document.body.appendChild(el);

    await flush(50);

    const div = el.shadowRoot.querySelector('div');
    expect(div.classList.contains('seen')).toBe(true);
  });

  it('should have access to $element in b-leave expression', async () => {
    // Mock IO to simulate leave
    global.IntersectionObserver = class {
      constructor(cb) {
        this.cb = cb;
      }
      observe(element) {
        // Simulate enter then leave
        this.cb([{ isIntersecting: true, target: element }]);
        setTimeout(() => {
          this.cb([{ isIntersecting: false, target: element }]);
        }, 10);
      }
      disconnect() { }
    };

    window.Lego.block('test-leave', '<div b-leave="$element.classList.add(\'left\')"></div>');
    const el = document.createElement('test-leave');
    document.body.appendChild(el);

    await flush();

    const div = el.shadowRoot.querySelector('div');
    expect(div.classList.contains('left')).toBe(true);
  });
});
