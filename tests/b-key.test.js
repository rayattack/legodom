import { describe, it, expect, beforeEach } from 'vitest';
import { flush } from './test-utils.js';
import { JSDOM } from 'jsdom';
import fs from 'fs';
import path from 'path';

// Setup the DOM environment
const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
  runScripts: "dangerously",
  resources: "usable"
});

global.window = dom.window;
global.document = dom.window.document;

// Use defineProperty for navigator as it might be read-only
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

// Mock CSSStyleSheet for JSDOM
global.CSSStyleSheet = class {
  constructor() { this.cssRules = []; }
  replace(content) { this.cssText = content; return Promise.resolve(this); }
};

global.requestAnimationFrame = (cb) => setTimeout(cb, 0);

// Load the library code
const libCode = fs.readFileSync(path.resolve(import.meta.dirname, '../dist/lego.min.js'), 'utf8');
eval(libCode);

describe('b-key Directive Tests', () => {
  beforeEach(async () => {
    document.body.innerHTML = '';
    await window.Lego.init(document.body);
  });

  it('b-key: uses custom key path for stable rendering', async () => {
    window.Lego.block('key-test', `
      <div b-for="item in items" b-key="name">
        <span class="item-name">[[item.name]]</span>
      </div>
    `, {
      items: [
        { name: 'Alice', age: 25 },
        { name: 'Bob', age: 30 },
        { name: 'Charlie', age: 35 }
      ]
    });

    const el = document.createElement('key-test');
    document.body.appendChild(el);
    await flush();

    // b-for clones are now siblings in the shadowRoot, not children of a container
    const children = Array.from(el.shadowRoot.querySelectorAll('div'));
    expect(children.length).toBe(3);
    expect(children[0].textContent.trim()).toBe('Alice');
    expect(children[1].textContent.trim()).toBe('Bob');
    expect(children[2].textContent.trim()).toBe('Charlie');

    const aliceNode = children[0];
    const bobNode = children[1];
    const charlieNode = children[2];

    el.state.items = [
      { name: 'Alice', age: 26 },
      { name: 'Bob', age: 31 },
      { name: 'Charlie', age: 36 }
    ];

    await flush();

    const newChildren = Array.from(el.shadowRoot.querySelectorAll('div'));
    expect(newChildren[0]).toBe(aliceNode);
    expect(newChildren[1]).toBe(bobNode);
    expect(newChildren[2]).toBe(charlieNode);
  });

  it('b-key: prevents DOM thrashing with inline arrays', async () => {
    window.Lego.block('inline-test', `
      <div b-for="menu in menus" b-key="icon">
        <span>[[menu.icon]]</span>
      </div>
    `, {
      menus: [
        { icon: 'home', name: 'Home' },
        { icon: 'settings', name: 'Settings' }
      ]
    });

    const el = document.createElement('inline-test');
    document.body.appendChild(el);
    await flush();

    // b-for clones are now siblings in the shadowRoot
    const children = Array.from(el.shadowRoot.querySelectorAll('div'));
    const firstChild = children[0];

    el.state.menus = [
      { icon: 'home', name: 'Home (Updated)' },
      { icon: 'settings', name: 'Settings (Updated)' }
    ];

    await flush();

    const newChildren = Array.from(el.shadowRoot.querySelectorAll('div'));
    expect(newChildren[0]).toBe(firstChild);
    expect(newChildren[0].textContent.trim()).toBe('home');
  });

  it('b-for: auto-detects common id fields without b-key', async () => {
    window.Lego.block('auto-id-test', `
      <div b-for="item in items">
        <span>[[item.name]]</span>
      </div>
    `, {
      items: [
        { id: 1, name: 'Item 1' },
        { id: 2, name: 'Item 2' }
      ]
    });

    const el = document.createElement('auto-id-test');
    document.body.appendChild(el);
    await flush();

    // b-for clones are now siblings in the shadowRoot
    const children = Array.from(el.shadowRoot.querySelectorAll('div'));
    const firstChild = children[0];

    el.state.items = [
      { id: 1, name: 'Item 1 Updated' },
      { id: 2, name: 'Item 2 Updated' }
    ];

    await flush();

    const newChildren = Array.from(el.shadowRoot.querySelectorAll('div'));
    expect(newChildren[0]).toBe(firstChild);
    expect(newChildren[0].textContent.trim()).toBe('Item 1 Updated');
  });

  it('b-for: handles _id, uuid, key fields', async () => {
    window.Lego.block('uuid-test', `
      <div b-for="item in items">[[item.data]]</div>
    `, {
      items: [
        { uuid: 'abc-123', data: 'First' },
        { _id: 'xyz-789', data: 'Second' },
        { key: 'key-456', data: 'Third' }
      ]
    });

    const el = document.createElement('uuid-test');
    document.body.appendChild(el);
    await flush();

    // b-for clones are now siblings in the shadowRoot
    const children = Array.from(el.shadowRoot.querySelectorAll('div'));
    expect(children.length).toBe(3);
    expect(children[0].textContent.trim()).toBe('First');
    expect(children[1].textContent.trim()).toBe('Second');
    expect(children[2].textContent.trim()).toBe('Third');
  });

  it('b-key: b-key attribute is removed from cloned template', async () => {
    window.Lego.block('key-removal-test', `
      <div b-for="item in items" b-key="id">
        <span>[[item.name]]</span>
      </div>
    `, {
      items: [{ id: 1, name: 'Test' }]
    });

    const el = document.createElement('key-removal-test');
    document.body.appendChild(el);
    await flush();

    // b-for clones are now siblings in the shadowRoot
    const child = el.shadowRoot.querySelector('div');

    expect(child.hasAttribute('b-key')).toBe(false);
    expect(child.hasAttribute('b-for')).toBe(false);
  });

  it('b-key: works with nested property paths', async () => {
    window.Lego.block('nested-key-test', `
      <div b-for="item in items" b-key="user.id">
        <span>[[item.user.name]]</span>
      </div>
    `, {
      items: [
        { user: { id: 'u1', name: 'Alice' } },
        { user: { id: 'u2', name: 'Bob' } }
      ]
    });

    const el = document.createElement('nested-key-test');
    document.body.appendChild(el);
    await flush();

    // b-for clones are now siblings in the shadowRoot
    const children = Array.from(el.shadowRoot.querySelectorAll('div'));
    const firstChild = children[0];

    el.state.items = [
      { user: { id: 'u1', name: 'Alice Updated' } },
      { user: { id: 'u2', name: 'Bob Updated' } }
    ];

    await flush();

    const newChildren = Array.from(el.shadowRoot.querySelectorAll('div'));
    expect(newChildren[0]).toBe(firstChild);
    expect(newChildren[0].textContent.trim()).toBe('Alice Updated');
  });
});
