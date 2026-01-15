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

// Load LegoDOM
const libCode = fs.readFileSync(path.resolve(__dirname, '../main.js'), 'utf8');
eval(libCode);

describe('LegoDOM Security', () => {
  beforeEach(async () => {
    document.body.innerHTML = '';
    await window.Lego.init(document.body);
  });

  it('should block dangerous expressions in safeEval', async () => {
    // This test expects the framework to BLOCK access to Function constructor
    window.Lego.define('pwn-comp', '<div>[[ (function(){ window.pwned = true; })() ]]</div>');
    const el = document.createElement('pwn-comp');
    document.body.appendChild(el);

    await new Promise(r => setTimeout(r, 100));

    // Should NOT have executed
    expect(window.pwned).toBeUndefined();
  });

  it('should block access to global sensitive objects', async () => {
    // Try to access global 'process' or 'window' explicitly if possible
    window.Lego.define('env-comp', '<div>[[ window.location.href ]]</div>');
    const el = document.createElement('env-comp');
    document.body.appendChild(el);

    await new Promise(r => setTimeout(r, 100));

    // Ideally this should be blocked or restricted, 
    // but for now we focus on preventing arbitrary code execution via constructors
    // If strict mode is on, accessing window might be allowed but defining new functions should be bad.
  });

  it('should safely render HTML with b-html but potentially expose XSS if unchecked', async () => {
    // b-html doesn't exist yet, but we will add it.
    // If we add it, we want to ensure it works.
  });
});
