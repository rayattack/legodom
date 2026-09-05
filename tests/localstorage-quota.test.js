import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { flush } from './test-utils.js';
import { JSDOM } from 'jsdom';
import fs from 'fs';
import path from 'path';

describe('LocalStorage Quota Fix', () => {
  let window, document, Lego, restore;

  beforeEach(async () => {
    const dom = new JSDOM(`<!DOCTYPE html><body></body>`, {
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
    window.requestAnimationFrame = (cb) => setTimeout(cb, 16);

    global.localStorage = window.localStorage;
    window.localStorage.clear();
    restore = null;

    const mainJs = fs.readFileSync(path.resolve(__dirname, '../dist/lego.min.js'), 'utf8');
    window.eval(mainJs);
    Lego = window.Lego;
    Lego.init();
  });

  afterEach(() => {
    if (restore) restore();
    window.localStorage.clear();
  });

  /**
   * JSDOM's Storage is a Proxy: assigning `localStorage.setItem = fn` stores
   * an *item* named "setItem" instead of overriding the method, so the mock
   * never runs. Patch the prototype instead and hand back a restorer.
   */
  const patchStorage = ({ failOn }) => {
    const originalSet = window.Storage.prototype.setItem;
    const originalRemove = window.Storage.prototype.removeItem;
    const removed = [];

    window.Storage.prototype.setItem = function (key, value) {
      if (key === failOn) {
        const err = new Error('QuotaExceededError');
        err.name = 'QuotaExceededError';
        throw err;
      }
      return originalSet.call(this, key, value);
    };
    window.Storage.prototype.removeItem = function (key) {
      removed.push(key);
      return originalRemove.call(this, key);
    };

    restore = () => {
      window.Storage.prototype.setItem = originalSet;
      window.Storage.prototype.removeItem = originalRemove;
      restore = null;
    };
    return { removed };
  };

  it('reports QuotaExceededError through config.onError and abandons the write', async () => {
    const reported = [];
    Lego.config.onError = (err, type, key) => reported.push({ err, type, key });
    patchStorage({ failOn: 'test.quota' });

    Lego.block('quota-test', '<span>[[ value ]]</span>', {
      value: Lego.db('test.quota').default('init')
    });

    document.body.innerHTML = '<quota-test></quota-test>';
    await flush(10);

    const el = document.querySelector('quota-test');
    el.state.value = 'large-data';
    await flush();

    // The write is abandoned; the app is told, and nothing was persisted.
    expect(window.localStorage.getItem('test.quota')).toBeNull();
    expect(reported.length).toBeGreaterThan(0);
    expect(reported[0].type).toBe('quota');
    expect(reported[0].key).toBe('test.quota');
    expect(reported[0].err.name).toBe('QuotaExceededError');
  });

  it('should not evict any keys when quota is exceeded', async () => {
    // Keys the removed FIFO eviction pass would previously have deleted.
    window.localStorage.setItem('lego:old1', JSON.stringify('data1'));
    window.localStorage.setItem('lego:old2', JSON.stringify('data2'));
    window.localStorage.setItem('lego:old3', JSON.stringify('data3'));

    const { removed } = patchStorage({ failOn: 'test.new' });

    Lego.block('evict-test', '<div>[[ data ]]</div>', {
      data: Lego.db('test.new').default('new-value')
    });

    document.body.innerHTML = '<evict-test></evict-test>';
    await flush(50);

    const el = document.querySelector('evict-test');
    el.state.data = 'x'.repeat(1000); // Large update
    await flush();

    expect(removed).toEqual([]);
    expect(window.localStorage.getItem('lego:old1')).toBe(JSON.stringify('data1'));
    expect(window.localStorage.getItem('lego:old2')).toBe(JSON.stringify('data2'));
    expect(window.localStorage.getItem('lego:old3')).toBe(JSON.stringify('data3'));
  });

  it('should not touch keys owned by the rest of the app', async () => {
    window.localStorage.setItem('user:preference', 'keep-me');
    window.localStorage.setItem('lego:old', 'keep-me-too');

    patchStorage({ failOn: 'test.protected' });

    Lego.block('protect-test', '<div>[[ val ]]</div>', {
      val: Lego.db('test.protected').default('value')
    });

    document.body.innerHTML = '<protect-test></protect-test>';
    await flush(50);

    const el = document.querySelector('protect-test');
    el.state.val = 'new';
    await flush();

    expect(window.localStorage.getItem('user:preference')).toBe('keep-me');
    expect(window.localStorage.getItem('lego:old')).toBe('keep-me-too');
  });

  it('should handle storage errors other than quota', async () => {
    const originalSet = window.Storage.prototype.setItem;
    window.Storage.prototype.setItem = function () {
      throw new Error('DOMException: SecurityError');
    };
    restore = () => {
      window.Storage.prototype.setItem = originalSet;
      restore = null;
    };

    Lego.block('error-test', '<div>[[ val ]]</div>', {
      val: Lego.db('test.error').default('initial')
    });

    // Should not crash
    expect(() => {
      document.body.innerHTML = '<error-test></error-test>';
    }).not.toThrow();

    await flush(50);
    const el = document.querySelector('error-test');

    // Should not crash when updating
    expect(() => {
      el.state.val = 'updated';
    }).not.toThrow();
  });
});
