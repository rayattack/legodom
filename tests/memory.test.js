import { describe, it, expect, beforeEach, vi } from 'vitest';
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

describe('LegoDOM Memory Management', () => {
  beforeEach(async () => {
    document.body.innerHTML = '';
    await window.Lego.init(document.body);
  });

  it('should cleanup activeComponents when elements are removed', async () => {
    window.Lego.define('mem-comp', '<div>Hi</div>');

    // Mount
    const el = document.createElement('mem-comp');
    document.body.appendChild(el);
    await new Promise(r => setTimeout(r, 100)); // Wait for observer

    expect(window.Lego.getActiveComponentsCount()).toBe(1);

    // Unmount
    el.remove();
    await new Promise(r => setTimeout(r, 100)); // Wait for observer

    expect(window.Lego.getActiveComponentsCount()).toBe(0);
  });

  it('should cleanup nested components recursively', async () => {
    window.Lego.define('parent-comp', '<child-comp></child-comp>');
    window.Lego.define('child-comp', '<span>Child</span>');

    const el = document.createElement('parent-comp');
    document.body.appendChild(el);
    await new Promise(r => setTimeout(r, 100));

    expect(window.Lego.getActiveComponentsCount()).toBe(2); // Parent + Child

    el.remove();
    await new Promise(r => setTimeout(r, 100));

    expect(window.Lego.getActiveComponentsCount()).toBe(0);
  });
});
