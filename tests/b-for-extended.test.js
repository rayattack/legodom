import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { flush } from './test-utils.js';
import { JSDOM } from 'jsdom';
import fs from 'fs';
import path from 'path';

describe('b-for Extended Tests', () => {
  let window, document, Lego;

  beforeEach(async () => {
    const dom = new JSDOM('<!DOCTYPE html><body></body>', {
      url: 'http://localhost/',
      runScripts: 'dangerously',
      resources: 'usable'
    });
    window = dom.window;
    document = window.document;

    global.window = window;
    global.document = document;
    global.Node = window.Node;
    global.Element = window.Element;
    global.HTMLElement = window.HTMLElement;
    global.MutationObserver = window.MutationObserver;
    global.customElements = window.customElements;
    global.NodeFilter = window.NodeFilter;
    global.Event = window.Event;
    global.CSSStyleSheet = class {
      constructor() { this.cssRules = []; }
      replace(content) { this.cssText = content; return Promise.resolve(this); }
    };
    window.requestAnimationFrame = (cb) => setTimeout(cb, 0);

    const mainJs = fs.readFileSync(path.resolve(__dirname, '../dist/lego.min.js'), 'utf8');
    window.eval(mainJs);
    Lego = window.Lego;
    await Lego.init();
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  describe('List reordering', () => {
    it('should reorder elements when list order changes', async () => {
      Lego.block('for-reorder-a', `<div b-for="item in items" b-key="id"><span>[[item.name]]</span></div>`, {
        items: [
          { id: 1, name: 'A' },
          { id: 2, name: 'B' },
          { id: 3, name: 'C' }
        ]
      });
      document.body.innerHTML = '<for-reorder-a></for-reorder-a>';
      await flush(100);

      const el = document.querySelector('for-reorder-a');
      let spans = el.shadowRoot.querySelectorAll('span');
      expect(spans[0].textContent).toBe('A');
      expect(spans[1].textContent).toBe('B');
      expect(spans[2].textContent).toBe('C');

      // Reverse the list
      el.state.items = [
        { id: 3, name: 'C' },
        { id: 2, name: 'B' },
        { id: 1, name: 'A' }
      ];
      await flush(100);

      spans = el.shadowRoot.querySelectorAll('span');
      expect(spans[0].textContent).toBe('C');
      expect(spans[1].textContent).toBe('B');
      expect(spans[2].textContent).toBe('A');
    });

    it('should handle adding items to list', async () => {
      Lego.block('for-add-a', `<div b-for="item in items" b-key="id"><span>[[item.name]]</span></div>`, {
        items: [{ id: 1, name: 'A' }]
      });
      document.body.innerHTML = '<for-add-a></for-add-a>';
      await flush(100);

      const el = document.querySelector('for-add-a');
      let spans = el.shadowRoot.querySelectorAll('span');
      expect(spans.length).toBe(1);

      el.state.items = [
        { id: 1, name: 'A' },
        { id: 2, name: 'B' },
        { id: 3, name: 'C' }
      ];
      await flush(100);

      spans = el.shadowRoot.querySelectorAll('span');
      expect(spans.length).toBe(3);
    });

    it('should handle removing items from list', async () => {
      Lego.block('for-remove-a', `<div b-for="item in items" b-key="id"><span>[[item.name]]</span></div>`, {
        items: [
          { id: 1, name: 'A' },
          { id: 2, name: 'B' },
          { id: 3, name: 'C' }
        ]
      });
      document.body.innerHTML = '<for-remove-a></for-remove-a>';
      await flush(100);

      const el = document.querySelector('for-remove-a');
      let spans = el.shadowRoot.querySelectorAll('span');
      expect(spans.length).toBe(3);

      el.state.items = [{ id: 2, name: 'B' }];
      await flush(100);

      spans = el.shadowRoot.querySelectorAll('span');
      expect(spans.length).toBe(1);
      expect(spans[0].textContent).toBe('B');
    });
  });

  describe('Destroy and cleanup', () => {
    it('should clean up pool on element removal', async () => {
      Lego.block('for-destroy-a', `<div b-for="item in items"><span>[[item]]</span></div>`, {
        items: ['X', 'Y', 'Z']
      });
      document.body.innerHTML = '<for-destroy-a></for-destroy-a>';
      await flush(100);

      const el = document.querySelector('for-destroy-a');
      expect(el.shadowRoot.querySelectorAll('span').length).toBe(3);

      // Remove element triggers unsnap which calls directive destroy
      document.body.innerHTML = '';
      await flush(100);

      // No crash = cleanup succeeded
    });

    it('should clean up event listeners on pool children during destroy', async () => {
      Lego.block('for-events-a', `<div b-for="item in items"><button @click="handle()">[[item]]</button></div>`, {
        items: ['A', 'B'],
        handle() {}
      });
      document.body.innerHTML = '<for-events-a></for-events-a>';
      await flush(100);

      const el = document.querySelector('for-events-a');
      expect(el.shadowRoot.querySelectorAll('button').length).toBe(2);

      // Remove element — should clean up listeners without errors
      document.body.innerHTML = '';
      await flush(100);
    });
  });

  describe('Empty and edge cases', () => {
    it('should handle empty list', async () => {
      Lego.block('for-empty-a', `<div b-for="item in items"><span>[[item]]</span></div>`, {
        items: []
      });
      document.body.innerHTML = '<for-empty-a></for-empty-a>';
      await flush(100);

      const el = document.querySelector('for-empty-a');
      expect(el.shadowRoot.querySelectorAll('span').length).toBe(0);
    });

    it('should handle list going from items to empty', async () => {
      Lego.block('for-to-empty-a', `<div b-for="item in items"><span>[[item]]</span></div>`, {
        items: ['A', 'B']
      });
      document.body.innerHTML = '<for-to-empty-a></for-to-empty-a>';
      await flush(100);

      const el = document.querySelector('for-to-empty-a');
      expect(el.shadowRoot.querySelectorAll('span').length).toBe(2);

      el.state.items = [];
      await flush(100);

      expect(el.shadowRoot.querySelectorAll('span').length).toBe(0);
    });
  });
});
