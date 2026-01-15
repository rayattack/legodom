import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import fs from 'fs';
import path from 'path';

const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
  runScripts: "dangerously",
  resources: "usable"
});

global.window = dom.window;
global.document = dom.window.document;
Object.defineProperty(global, 'navigator', { value: dom.window.navigator });
global.HTMLElement = dom.window.HTMLElement;
global.customElements = dom.window.customElements;
global.MutationObserver = dom.window.MutationObserver;
global.Node = dom.window.Node;
global.NodeFilter = dom.window.NodeFilter;
global.Element = dom.window.Element;
global.Event = dom.window.Event;
global.requestAnimationFrame = (cb) => setTimeout(cb, 0);

const libCode = fs.readFileSync(path.resolve(__dirname, '../main.js'), 'utf8');
eval(libCode);

describe('LegoDOM Configurable Syntax', () => {
  beforeEach(async () => {
    document.body.innerHTML = '';
    window.Lego.config.syntax = 'brackets'; // Explicitly set default (though it's default in main.js now)
    await window.Lego.init(document.body);
  });

  afterEach(() => {
    window.Lego.config.syntax = 'brackets'; // Reset
  });

  it('should render [[ ]] by default', async () => {
    window.Lego.define('default-syntax', '<div>[[ msg ]]</div>');
    const el = document.createElement('default-syntax');
    el.setAttribute('b-data', "{ msg: 'Hello' }");
    document.body.appendChild(el);
    await new Promise(r => setTimeout(r, 100));
    expect(el.shadowRoot.textContent).toBe('Hello');
  });

  it('should render {{ }} when syntax is mustache', async () => {
    window.Lego.config.syntax = 'mustache';

    window.Lego.define('mustache-syntax', '<div>{{ msg }}</div>');
    const el = document.createElement('mustache-syntax');
    el.setAttribute('b-data', "{ msg: 'Mustache World' }");
    document.body.appendChild(el);
    await new Promise(r => setTimeout(r, 100));
    expect(el.shadowRoot.textContent).toBe('Mustache World');
  });

  it('should ignore {{ }} when syntax is brackets', async () => {
    // Default is brackets
    // {{ msg }} should be treated as literal text
    window.Lego.define('mixed-syntax', '<div>{{ msg }} - [[ msg ]]</div>');
    const el = document.createElement('mixed-syntax');
    el.setAttribute('b-data', "{ msg: 'Active' }");
    document.body.appendChild(el);
    await new Promise(r => setTimeout(r, 100));
    expect(el.shadowRoot.textContent).toBe('{{ msg }} - Active');
  });
});
