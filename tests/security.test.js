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

global.requestAnimationFrame = (cb) => setTimeout(cb, 0);

// Load LegoDOM
const libCode = fs.readFileSync(path.resolve(__dirname, '../dist/lego.min.js'), 'utf8');
eval(libCode);

describe('LegoDOM Security', () => {
  beforeEach(async () => {
    document.body.innerHTML = '';
    await window.Lego.init(document.body);
  });

  it('should block dangerous expressions in safeEval', async () => {
    // This test expects the framework to BLOCK access to Function constructor
    window.Lego.block('pwn-comp', '<div>[[ (function(){ window.pwned = true; })() ]]</div>');
    const el = document.createElement('pwn-comp');
    document.body.appendChild(el);

    await flush();

    // Should NOT have executed
    expect(window.pwned).toBeUndefined();
  });

  it('should block access to global sensitive objects', async () => {
    // Accessing constructor through window should be blocked by safeEval's regex
    window.Lego.block('env-comp', '<div>[[ window.constructor.name ]]</div>');
    const el = document.createElement('env-comp');
    document.body.appendChild(el);

    await flush();

    const shadow = el.shadowRoot || el._legoShadow;
    const div = shadow?.querySelector('div');
    // "constructor" is blocked by safeEval — expression should not evaluate
    expect(div?.textContent?.trim() || '').not.toBe('Window');
  });

  it('should render b-html with trusted content', async () => {
    window.Lego.block('html-comp', '<div b-html="markup"></div>', {
      markup: '<strong>hello</strong>'
    });
    const el = document.createElement('html-comp');
    document.body.appendChild(el);

    await flush();

    const shadow = el.shadowRoot || el._legoShadow;
    const div = shadow?.querySelector('div');
    expect(div?.innerHTML).toBe('<strong>hello</strong>');
  });
});
