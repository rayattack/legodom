import { describe, it, expect, beforeEach } from 'vitest';
import { JSDOM } from 'jsdom';
import fs from 'fs';
import path from 'path';

// Setup the DOM environment
const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
  runScripts: "dangerously",
  resources: "usable",
  url: "http://localhost/"
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

global.CSSStyleSheet = class {
  constructor() { this.cssRules = []; }
  replace(content) { this.cssText = content; return Promise.resolve(this); }
};

global.requestAnimationFrame = (cb) => setTimeout(cb, 0);

// Load the library code
const libCode = fs.readFileSync(path.resolve(__dirname, '../main.js'), 'utf8');
eval(libCode);

describe('$route Access', () => {
  beforeEach(async () => {
    document.body.innerHTML = '';
    await window.Lego.init(document.body);
  });

  it('$route should be available in template expressions', async () => {
    window.Lego.route('/', 'home-page');

    // Signature: name, template, logic, styles...
    window.Lego.block('home-page', `<div id="route-test">[[ $route.url ]]</div>`);

    const el = document.createElement('home-page');
    document.body.appendChild(el);

    await new Promise(r => setTimeout(r, 100));

    const routeEl = el.shadowRoot.querySelector('#route-test');
    expect(routeEl.textContent.trim()).toBe('/');
  });

  it('$route should be available in script space via this.$route', async () => {
    window.Lego.route('/', 'test-block');

    window.Lego.block('test-block', `<div id="test">[[ currentRoute ]]</div>`, {
      get currentRoute() {
        return this.$route.url;
      }
    });

    const el = document.createElement('test-block');
    document.body.appendChild(el);

    await new Promise(r => setTimeout(r, 100));

    expect(el.shadowRoot.querySelector('#test').textContent.trim()).toBe('/');
  });

  it('$route should be available via globals in getters', async () => {
    window.Lego.block('logic-test', `<div id="logic-route">[[ where ]]</div>`, {
      get where() { return this.$route.url }
    });

    const el = document.createElement('logic-test');
    document.body.appendChild(el);

    await new Promise(r => setTimeout(r, 100));

    expect(el.shadowRoot.querySelector('#logic-route').textContent.trim()).toBe('/');
  });
});
