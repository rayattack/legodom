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
global.Node = dom.window.Node;
global.Element = dom.window.Element;
global.Event = dom.window.Event;
global.NodeFilter = dom.window.NodeFilter;
global.FormData = dom.window.FormData;
global.requestAnimationFrame = (cb) => setTimeout(cb, 0);

// Load the library code
const libCode = fs.readFileSync(path.resolve(__dirname, '../dist/lego.min.js'), 'utf8');
eval(libCode);

describe('b-for scope', () => {
  beforeEach(async () => {
    document.body.innerHTML = '';
    // Re-eval library to reset state if needed, but simple init usually enough?
    // Actually Lego singleton might persist. 
    // Ideally we should reload the library, but let's try just init.
    // If Lego is global, we can't easily reset it without re-eval.
    // But since we eval once at top, let's hope init handles cleanup or state reset.
    // In LegoDOM, usually creating new blocks is fine.
  });

  it('should access loop variable in attributes of the loop element', async () => {
    window.Lego.block('test-loop-scope', `
      <div b-for="item in items" 
           class="test-item [[ item.active ? 'active' : '' ]]"
           data-id="[[ item.id ]]">
           [[ item.name ]]
      </div>
    `);

    const el = document.createElement('test-loop-scope');
    // Set state using internal _studs or assuming init sets it? 
    // LegoDOM blocks read state usually.
    // We can define init method in block or set properties.
    // The library usually syncs attributes to state or we can use init().

    /* 
       Let's use a setup where we have an init function
    */
    window.Lego.block('test-loop-scope-2',
      `
        <div b-for="item in items" 
             class="test-item [[ item.active ? 'active' : '' ]]"
             test-attr="[[ item.name ]]">
             <span>[[ item.name ]]</span>
        </div>
      `,
      {
        mounted() {
          Object.assign(this, {
            items: [
              { id: 1, name: 'A', active: true },
              { id: 2, name: 'B', active: false }
            ]
          });
        }
      }
    );

    const el2 = document.createElement('test-loop-scope-2');
    document.body.appendChild(el2);

    // Wait for render
    await flush(50);

    const root = el2.shadowRoot;
    const items = root.querySelectorAll('.test-item');
    expect(items.length).toBe(2);

    expect(items[0].getAttribute('test-attr')).toBe('A');
    expect(items[0].classList.contains('active')).toBe(true);

    expect(items[1].getAttribute('test-attr')).toBe('B');
    expect(items[1].classList.contains('active')).toBe(false);
  });
});
