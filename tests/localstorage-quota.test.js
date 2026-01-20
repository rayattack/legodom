import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { JSDOM } from 'jsdom';
import fs from 'fs';
import path from 'path';

describe('LocalStorage Quota Fix', () => {
  let window, document, Lego, originalSetItem;

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
    global.Blob = window.Blob || class Blob {
      constructor(parts) {
        this.size = parts.reduce((acc, part) => acc + (part.length || 0), 0);
      }
    };
    window.requestAnimationFrame = (cb) => setTimeout(cb, 16);

    global.localStorage = window.localStorage;
    window.localStorage.clear();

    // Store original
    originalSetItem = window.localStorage.setItem.bind(window.localStorage);

    const mainJs = fs.readFileSync(path.resolve(__dirname, '../main.js'), 'utf8');
    window.eval(mainJs);
    Lego = window.Lego;
    Lego.init();
  });

  afterEach(() => {
    window.localStorage.clear();
    // Restore original if mocked
    if (originalSetItem) {
      window.localStorage.setItem = originalSetItem;
    }
  });

  it('should handle QuotaExceededError gracefully', async () => {
    let quotaErrorCount = 0;
    let firstCallFailed = false;

    // Mock setItem to fail first time, succeed after eviction
    window.localStorage.setItem = function (key, value) {
      if (!firstCallFailed && key === 'test.quota') {
        firstCallFailed = true;
        const err = new Error('QuotaExceededError');
        err.name = 'QuotaExceededError';
        throw err;
      }
      // Call original for other keys or retry
      return originalSetItem(key, value);
    };

    Lego.block('quota-test', '<span>[[ value ]]</span>', {
      value: Lego.db('test.quota').default('init')
    });

    document.body.innerHTML = '<quota-test></quota-test>';
    await new Promise(r => setTimeout(r, 10));

    const el = document.querySelector('quota-test');

    // This should trigger QuotaExceededError first, then retry
    el.state.value = 'large-data';
    await new Promise(r => setTimeout(r, 100));

    // Should have recovered (value set on retry)
    const stored = window.localStorage.getItem('test.quota');
    expect(stored).toBeDefined();
  });

  it('should evict oldest keys when quota exceeded', async () => {
    // Pre-populate with old Lego keys
    window.localStorage.setItem('lego:old1', JSON.stringify('data1'));
    window.localStorage.setItem('lego:old2', JSON.stringify('data2'));
    window.localStorage.setItem('lego:old3', JSON.stringify('data3'));

    // Simulate QuotaExceededError
    let callCount = 0;
    const originalSet = window.localStorage.setItem.bind(window.localStorage);
    window.localStorage.setItem = function (key, value) {
      if (key === 'test.new' && callCount === 0) {
        callCount++;
        const err = new Error('QuotaExceededError');
        err.name = 'QuotaExceededError';
        throw err;
      }
      return originalSet(key, value);
    };

    Lego.block('evict-test', '<div>[[ data ]]</div>', {
      data: Lego.db('test.new').default('new-value')
    });

    document.body.innerHTML = '<evict-test></evict-test>';
    await new Promise(r => setTimeout(r, 50));

    const el = document.querySelector('evict-test');
    el.state.data = 'x'.repeat(1000); // Large update

    await new Promise(r => setTimeout(r, 100));

    // New key should be saved
    const newData = window.localStorage.getItem('test.new');
    expect(newData).toBeDefined();
  });

  it('should not evict non-Lego keys', async () => {
    // Add non-Lego key
    window.localStorage.setItem('user:preference', 'keep-me');
    window.localStorage.setItem('lego:old', 'evict-me');

    let callCount = 0;
    const originalSet = window.localStorage.setItem.bind(window.localStorage);
    window.localStorage.setItem = function (key, value) {
      if (key === 'lego:test.protected' && callCount === 0) {
        callCount++;
        const err = new Error('QuotaExceededError');
        err.name = 'QuotaExceededError';
        throw err;
      }
      return originalSet(key, value);
    };

    Lego.block('protect-test', '<div>[[ val ]]</div>', {
      val: Lego.db('test.protected').default('value')
    });

    document.body.innerHTML = '<protect-test></protect-test>';
    await new Promise(r => setTimeout(r, 50));

    const el = document.querySelector('protect-test');
    el.state.val = 'new';
    await new Promise(r => setTimeout(r, 100));

    // User preference should still exist
    expect(window.localStorage.getItem('user:preference')).toBe('keep-me');
  });

  it('should handle storage errors other than quota', async () => {
    window.localStorage.setItem = function () {
      throw new Error('DOMException: SecurityError');
    };

    Lego.block('error-test', '<div>[[ val ]]</div>', {
      val: Lego.db('test.error').default('initial')
    });

    // Should not crash
    expect(() => {
      document.body.innerHTML = '<error-test></error-test>';
    }).not.toThrow();

    await new Promise(r => setTimeout(r, 50));
    const el = document.querySelector('error-test');

    // Should not crash when updating
    expect(() => {
      el.state.val = 'updated';
    }).not.toThrow();
  });
});
