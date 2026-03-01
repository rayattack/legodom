import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { flush } from './test-utils.js';
import { JSDOM } from 'jsdom';
import fs from 'fs';
import path from 'path';

describe('Error Boundary Recursion Guard', () => {
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
    global.CustomEvent = window.CustomEvent;
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

  it('should not infinite loop when error boundary itself crashes', async () => {
    const errorSpy = vi.fn();
    Lego.config.onError = errorSpy;
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    // Error block that also crashes
    Lego.block('crash-error-a', '<div>[[fail()]]</div>', {
      fail() { throw new Error('Error block also crashed'); }
    });

    // Primary block that crashes and uses crashing error boundary
    Lego.block('crash-primary-a', '<div>[[explode()]]</div>', {
      explode() { throw new Error('Primary crash'); }
    });

    const el = document.createElement('crash-primary-a');
    el.setAttribute('b-error', 'crash-error-a');
    document.body.appendChild(el);

    // Should not hang or throw unhandled — the recursion guard should stop it
    await flush(300);

    // Either onError was called or console.error logged the recursion limit
    const recursionHandled = errorSpy.mock.calls.length > 0 ||
      consoleSpy.mock.calls.some(call =>
        call.some(arg => typeof arg === 'string' && arg.includes('recursion limit'))
      );
    expect(recursionHandled).toBe(true);

    consoleSpy.mockRestore();
  });

  it('should allow normal error boundaries to still work', async () => {
    // Working error boundary
    Lego.block('good-error-a', '<div class="err-display">Error caught</div>');

    // Crashing block
    Lego.block('crash-normal-a', '<div>[[boom()]]</div>', {
      boom() { throw new Error('Normal crash'); }
    });

    const el = document.createElement('crash-normal-a');
    el.setAttribute('b-error', 'good-error-a');
    document.body.appendChild(el);

    await flush(200);

    const target = el.shadowRoot || el;
    expect(target.querySelector('good-error-a')).toBeTruthy();
  });
});
