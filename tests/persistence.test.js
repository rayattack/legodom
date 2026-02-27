import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { flush } from './test-utils.js';
import { JSDOM } from 'jsdom';
import fs from 'fs';
import path from 'path';

describe('Reactive Persistence ($db)', () => {
  let window, document, Lego;

  beforeEach(async () => {
    const dom = new JSDOM(`<!DOCTYPE html><body></body>`, {
      url: 'http://localhost/',
      runScripts: 'dangerously',
      resources: 'usable'
    });
    window = dom.window;
    document = window.document;

    // Polyfill globals for the eval-ed script
    global.window = window;
    global.document = document;
    global.Node = window.Node;
    global.Element = window.Element;
    global.HTMLElement = window.HTMLElement;
    global.MutationObserver = window.MutationObserver;
    global.customElements = window.customElements;
    global.CSSStyleSheet = window.CSSStyleSheet;
    global.localStorage = window.localStorage;
    global.StorageEvent = window.StorageEvent;
    window.requestAnimationFrame = (cb) => setTimeout(cb, 16);
    window.cancelAnimationFrame = (id) => clearTimeout(id);

    // Load Lego
    const mainJs = fs.readFileSync(path.resolve(__dirname, '../dist/lego.min.js'), 'utf8');
    window.eval(mainJs);
    Lego = window.Lego;
    Lego.init();

    // Clear storage
    window.localStorage.clear();
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('Initializes with default value if storage is empty', async () => {
    Lego.block('db-test-default', '<span>[[ val ]]</span>', {
      val: Lego.db('test.key').default('default-val')
    });
    document.body.innerHTML = '<db-test-default></db-test-default>';
    await flush(10);

    const el = document.querySelector('db-test-default');
    expect(el.state.val).toBe('default-val');
    expect(el.shadowRoot.innerHTML).toContain('default-val');
  });

  it('Hydrates from existing storage', async () => {
    window.localStorage.setItem('test.key.hyd', JSON.stringify('stored-val'));

    Lego.block('db-test-hyd', '<span>[[ val ]]</span>', {
      val: Lego.db('test.key.hyd').default('default-val')
    });
    document.body.innerHTML = '<db-test-hyd></db-test-hyd>';
    await flush(10);

    const el = document.querySelector('db-test-hyd');
    expect(el.state.val).toBe('stored-val');
    expect(el.shadowRoot.innerHTML).toContain('stored-val');
  });

  it('Persists updates to storage immediately (debounce=0)', async () => {
    Lego.block('db-write', '<span>[[ val ]]</span>', {
      val: Lego.db('test.write').default('init')
    });
    document.body.innerHTML = '<db-write></db-write>';
    await flush(10);

    const el = document.querySelector('db-write');
    el.state.val = 'new-val';

    await flush(20); // wait for event loop

    expect(JSON.parse(window.localStorage.getItem('test.write'))).toBe('new-val');
  });

  it('Supports chained debounce configuration', async () => {
    Lego.block('db-debounce', '<span>[[ val ]]</span>', {
      val: Lego.db('test.debounce').default('init').debounce(50)
    });
    document.body.innerHTML = '<db-debounce></db-debounce>';
    await flush(10);

    const el = document.querySelector('db-debounce');
    el.state.val = 'A';
    el.state.val = 'B';
    el.state.val = 'C';

    // Should not have written yet
    expect(window.localStorage.getItem('test.debounce')).toBeNull();

    // Wait for debounce
    await flush(70);

    expect(JSON.parse(window.localStorage.getItem('test.debounce'))).toBe('C');
  });

  it('Cross-tab Sync: Updates state on storage event', async () => {
    Lego.block('db-sync', '<span>[[ val ]]</span>', {
      val: Lego.db('test.sync').default('A')
    });
    document.body.innerHTML = '<db-sync></db-sync>';
    await flush(10);

    const el = document.querySelector('db-sync');
    expect(el.state.val).toBe('A');

    // Simulate event from another tab
    const event = new window.StorageEvent('storage', {
      key: 'test.sync',
      newValue: JSON.stringify('B'),
      storageArea: window.localStorage
    });
    window.dispatchEvent(event);

    await flush(20);

    expect(el.state.val).toBe('B');
    expect(el.shadowRoot.innerHTML).toContain('B');
  });

  it('b-logic access using $db helper', async () => {
    // Test using the global $db in b-logic string on a BLOCK
    Lego.block('db-logic-test', '<span>[[ config ]]</span>');

    document.body.innerHTML = '<db-logic-test b-logic="{ config: $db(\'attr.config\').default(\'off\') }"></db-logic-test>';
    await flush(10);

    const el = document.querySelector('db-logic-test');
    const span = el.shadowRoot.querySelector('span');
    expect(span.innerHTML).toContain('off');

    // Verify it is reactive and bound
    window.localStorage.setItem('attr.config', JSON.stringify('on'));
    window.dispatchEvent(new window.StorageEvent('storage', {
      key: 'attr.config',
      newValue: JSON.stringify('on'),
      storageArea: window.localStorage
    }));

    await flush(20);
    expect(span.innerHTML).toContain('on');
  });
});
