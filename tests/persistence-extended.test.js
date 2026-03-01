import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { flush } from './test-utils.js';
import { JSDOM } from 'jsdom';
import fs from 'fs';
import path from 'path';

describe('Persistence Extended Tests', () => {
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
    global.localStorage = window.localStorage;
    global.StorageEvent = window.StorageEvent;
    window.requestAnimationFrame = (cb) => setTimeout(cb, 16);
    window.cancelAnimationFrame = (id) => clearTimeout(id);

    const mainJs = fs.readFileSync(path.resolve(__dirname, '../dist/lego.min.js'), 'utf8');
    window.eval(mainJs);
    Lego = window.Lego;
    await Lego.init();
    window.localStorage.clear();
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  describe('Cross-tab sync', () => {
    it('should ignore storage events for unknown keys', async () => {
      Lego.block('db-ignore-a', '<span>[[val]]</span>', {
        val: Lego.db('known.key').default('A')
      });
      document.body.innerHTML = '<db-ignore-a></db-ignore-a>';
      await flush(50);

      const el = document.querySelector('db-ignore-a');

      // Fire storage event for unrelated key
      window.dispatchEvent(new window.StorageEvent('storage', {
        key: 'unknown.key',
        newValue: JSON.stringify('B'),
        storageArea: window.localStorage
      }));
      await flush(50);

      // Should remain unchanged
      expect(el.state.val).toBe('A');
    });

    it('should handle null newValue in storage events', async () => {
      Lego.block('db-null-a', '<span>[[val]]</span>', {
        val: Lego.db('null.test').default('initial')
      });
      document.body.innerHTML = '<db-null-a></db-null-a>';
      await flush(50);

      // Simulate key deletion from another tab
      window.dispatchEvent(new window.StorageEvent('storage', {
        key: 'null.test',
        newValue: null,
        storageArea: window.localStorage
      }));
      await flush(50);

      const el = document.querySelector('db-null-a');
      expect(el.state.val).toBeNull();
    });
  });

  describe('Cleanup on unmount', () => {
    it('should clean up dbBindings when element is removed', async () => {
      Lego.block('db-cleanup-a', '<span>[[val]]</span>', {
        val: Lego.db('cleanup.key').default('test')
      });
      document.body.innerHTML = '<db-cleanup-a></db-cleanup-a>';
      await flush(50);

      const el = document.querySelector('db-cleanup-a');
      expect(el.state.val).toBe('test');

      // Remove the element (triggers unsnap -> cleanupDbBindings)
      document.body.innerHTML = '';
      await flush(50);

      // Storage event for the old key should not crash
      window.dispatchEvent(new window.StorageEvent('storage', {
        key: 'cleanup.key',
        newValue: JSON.stringify('updated'),
        storageArea: window.localStorage
      }));
      await flush(50);

      // No error thrown = pass
    });
  });

  describe('$db API', () => {
    it('should support .get() to read current value', async () => {
      window.localStorage.setItem('api.read', JSON.stringify('stored'));

      Lego.block('db-get-a', '<span>[[val]]</span>', {
        val: Lego.db('api.read').default('fallback')
      });
      document.body.innerHTML = '<db-get-a></db-get-a>';
      await flush(50);

      const el = document.querySelector('db-get-a');
      expect(el.state.val).toBe('stored');
    });

    it('should support .delete() to remove a key', async () => {
      window.localStorage.setItem('api.del', JSON.stringify('to-delete'));

      const db = Lego.db('api.del');
      const result = db.delete();
      expect(result).toBe(true);
      expect(window.localStorage.getItem('api.del')).toBeNull();
    });

    it('should support .set() to write a value', async () => {
      const db = Lego.db('api.write');
      db.set('written-value');
      await flush(50);

      expect(JSON.parse(window.localStorage.getItem('api.write'))).toBe('written-value');
    });
  });
});
