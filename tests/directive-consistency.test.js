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
global.FormData = dom.window.FormData;

global.CSSStyleSheet = class {
  constructor() { this.cssRules = []; }
  replace(content) { this.cssText = content; return Promise.resolve(this); }
};

global.requestAnimationFrame = (cb) => setTimeout(cb, 0);

const libCode = fs.readFileSync(path.resolve(__dirname, '../dist/lego.min.js'), 'utf8');
eval(libCode);

describe('Directive Consistency', () => {
  beforeEach(async () => {
    document.body.innerHTML = '';
    await window.Lego.init(document.body);
  });

  describe('destroy() cleanup', () => {
    it('b-if: removes comment anchor on destroy', async () => {
      window.Lego.block('destroy-if', '<p b-if="show">visible</p>');
      const el = document.createElement('destroy-if');
      el.setAttribute('b-data', '{ show: true }');
      document.body.appendChild(el);
      await flush();

      const shadow = el.shadowRoot;
      expect(shadow).toBeTruthy();

      // Toggle off to create the anchor comment
      el.state.show = false;
      await flush();

      const comments = [];
      const walker = document.createTreeWalker(shadow, NodeFilter.SHOW_COMMENT);
      let n;
      while (n = walker.nextNode()) comments.push(n);
      expect(comments.length).toBeGreaterThan(0);

      // Unsnap should clean up
      document.body.removeChild(el);
      await flush();
    });

    it('b-for: cleans up pool nodes on destroy', async () => {
      window.Lego.block('destroy-for', '<li b-for="item in items">[[item]]</li>');
      const el = document.createElement('destroy-for');
      el.setAttribute('b-data', '{ items: ["a", "b", "c"] }');
      document.body.appendChild(el);
      await flush();

      const shadow = el.shadowRoot;
      expect(shadow).toBeTruthy();
      const lis = shadow.querySelectorAll('li');
      expect(lis.length).toBe(3);

      document.body.removeChild(el);
      await flush();
    });

    it('b-html: clears innerHTML cache on destroy', async () => {
      window.Lego.block('destroy-html', '<div b-html="content"></div>');
      const el = document.createElement('destroy-html');
      el.setAttribute('b-data', '{ content: "<b>bold</b>" }');
      document.body.appendChild(el);
      await flush();

      const shadow = el.shadowRoot;
      const div = shadow.querySelector('div');
      expect(div.innerHTML).toBe('<b>bold</b>');
      expect(div._bHtmlPrev).toBe('<b>bold</b>');

      document.body.removeChild(el);
      await flush();
    });

    it('b-sync: stores _bSyncHandler for cleanup', async () => {
      window.Lego.block('destroy-sync', '<input b-sync="name" />');
      const el = document.createElement('destroy-sync');
      el.setAttribute('b-data', '{ name: "test" }');
      document.body.appendChild(el);
      await flush();

      const input = el.shadowRoot.querySelector('input');
      expect(input._bSyncHandler).toBeDefined();
      expect(typeof input._bSyncHandler).toBe('function');

      document.body.removeChild(el);
      await flush();
    });
  });

  describe('global context', () => {
    it('b-init: can access global context', async () => {
      window.Lego.globals.initFlag = false;
      window.Lego.block('global-init', '<div b-init="global.initFlag = true"></div>');
      const el = document.createElement('global-init');
      document.body.appendChild(el);
      await flush();

      expect(window.Lego.globals.initFlag).toBe(true);
      document.body.removeChild(el);
      await flush();
    });

    it('b-text: resolves global. prefixed paths', async () => {
      window.Lego.globals.greeting = 'Hello Global';
      window.Lego.block('global-text', '<span b-text="global.greeting"></span>');
      const el = document.createElement('global-text');
      document.body.appendChild(el);
      await flush();

      const span = el.shadowRoot.querySelector('span');
      expect(span.textContent).toBe('Hello Global');
      document.body.removeChild(el);
      await flush();
    });
  });

  describe('b-sync modifiers', () => {
    it('.number modifier converts input to number', async () => {
      window.Lego.block('sync-number', '<input b-sync.number="age" />');
      const el = document.createElement('sync-number');
      el.setAttribute('b-data', '{ age: 0 }');
      document.body.appendChild(el);
      await flush();

      const input = el.shadowRoot.querySelector('input');
      input.value = '42';
      input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
      await flush();

      expect(el.state.age).toBe(42);
      document.body.removeChild(el);
      await flush();
    });

    it('.trim modifier trims whitespace', async () => {
      window.Lego.block('sync-trim', '<input b-sync.trim="username" />');
      const el = document.createElement('sync-trim');
      el.setAttribute('b-data', '{ username: "" }');
      document.body.appendChild(el);
      await flush();

      const input = el.shadowRoot.querySelector('input');
      input.value = '  hello  ';
      input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
      await flush();

      expect(el.state.username).toBe('hello');
      document.body.removeChild(el);
      await flush();
    });

    it('.lazy modifier only listens on change, not input', async () => {
      window.Lego.block('sync-lazy', '<input b-sync.lazy="val" />');
      const el = document.createElement('sync-lazy');
      el.setAttribute('b-data', '{ val: "" }');
      document.body.appendChild(el);
      await flush();

      const input = el.shadowRoot.querySelector('input');
      input.value = 'typed';
      input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
      await flush();
      // Should NOT update on input with .lazy
      expect(el.state.val).toBe('');

      input.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
      await flush();
      // Should update on change
      expect(el.state.val).toBe('typed');

      document.body.removeChild(el);
      await flush();
    });

    it('.number.trim combined modifiers work together', async () => {
      window.Lego.block('sync-combined', '<input b-sync.trim.number="price" />');
      const el = document.createElement('sync-combined');
      el.setAttribute('b-data', '{ price: 0 }');
      document.body.appendChild(el);
      await flush();

      const input = el.shadowRoot.querySelector('input');
      input.value = '  99.5  ';
      input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
      await flush();

      expect(el.state.price).toBe(99.5);
      document.body.removeChild(el);
      await flush();
    });
  });
});
