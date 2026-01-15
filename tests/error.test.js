import { describe, it, expect, beforeEach, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import fs from 'fs';
import path from 'path';

// Setup Mock DOM
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

const libCode = fs.readFileSync(path.resolve(__dirname, '../main.js'), 'utf8');
eval(libCode);

describe('LegoDOM Error Handling', () => {
  beforeEach(async () => {
    document.body.innerHTML = '';
    await window.Lego.init(document.body);
  });

  it('should catch errors in rendering and call onError', async () => {
    const errorSpy = vi.fn();
    window.Lego.config.onError = errorSpy;

    // Define a component that throws an error when accessing a property used in template
    window.Lego.define('error-comp', '<div>[[ throwErr() ]]</div>', {
      throwErr() {
        throw new Error('Render Failure');
      }
    });

    const el = document.createElement('error-comp');
    document.body.appendChild(el);

    await new Promise(r => setTimeout(r, 100));

    expect(errorSpy).toHaveBeenCalled();
    expect(errorSpy.mock.calls[0][1]).toBe('render-error');
  });

  it('should catch errors in event handlers', async () => {
    const errorSpy = vi.fn();
    window.Lego.config.onError = errorSpy;

    window.Lego.define('btn-error', '<button @click="crash()">Crash</button>', {
      crash() { throw new Error('Boom'); }
    });

    const el = document.createElement('btn-error');
    document.body.appendChild(el);
    await new Promise(r => setTimeout(r, 100));

    el.shadowRoot.querySelector('button').click();

    expect(errorSpy).toHaveBeenCalled();
    expect(errorSpy.mock.calls[0][1]).toBe('event-handler');
  });
});
