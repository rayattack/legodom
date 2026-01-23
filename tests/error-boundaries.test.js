import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
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
global.CustomEvent = dom.window.CustomEvent;
global.requestAnimationFrame = (cb) => setTimeout(cb, 0);

const libCode = fs.readFileSync(path.resolve(__dirname, '../dist/main.js'), 'utf8');
eval(libCode);

describe('Error Boundaries (b-error)', () => {
  let originalOnError;

  beforeEach(async () => {
    document.body.innerHTML = '';
    originalOnError = window.Lego.config.onError;
    await window.Lego.init(document.body);
  });

  afterEach(() => {
    window.Lego.config.onError = originalOnError;
  });

  describe('Template-Level Boundaries', () => {
    it('should catch render errors and display error block (via defineLegoFile)', async () => {
      // Define error boundary block
      window.Lego.block('error-card', '<div class="error">ERROR: [[ $error ? $error.message : "unknown" ]]</div>', {});

      // Use defineLegoFile for template-level b-error
      const legoFile = `
        <template b-error="error-card">
          <div>[[ crash() ]]</div>
        </template>
        <script>
          export default {
            crash() {
              throw new Error('Template crash');
            }
          }
        </script>
      `;
      window.Lego.defineLegoFile(legoFile, 'crashy-block.lego');

      const el = document.createElement('crashy-block');
      document.body.appendChild(el);

      await new Promise(r => setTimeout(r, 150));

      const target = el.shadowRoot || el;
      const errorCard = target.querySelector('error-card');
      expect(errorCard).toBeTruthy();
    });
  });

  describe('Instance-Level Boundaries', () => {
    it('should use instance b-error attribute', async () => {
      window.Lego.block('generic-error', '<div class="generic">Generic Error</div>', {});

      window.Lego.block('normal-block', '<div>[[ boom() ]]</div>', {
        boom() {
          throw new Error('Boom');
        }
      });

      const el1 = document.createElement('normal-block');
      el1.setAttribute('b-error', 'generic-error');
      document.body.appendChild(el1);

      await new Promise(r => setTimeout(r, 150));

      const target1 = el1.shadowRoot || el1;
      expect(target1.querySelector('generic-error')).toBeTruthy();
    });

    it('should inject $error object with message, stack, and component', async () => {
      window.Lego.block('debug-error', '<div id="err-msg">Error occurred</div>', {});

      window.Lego.block('failing-block', '<div>[[ fail() ]]</div>', {
        fail() {
          throw new Error('Test error message');
        }
      });

      const el = document.createElement('failing-block');
      el.setAttribute('b-error', 'debug-error');
      document.body.appendChild(el);

      await new Promise(r => setTimeout(r, 200));

      const target = el.shadowRoot || el;
      const errorBlock = target.querySelector('debug-error');

      expect(errorBlock).toBeTruthy();
      expect(errorBlock.state.$error).toBeTruthy();
      expect(errorBlock.state.$error.message).toBe('Test error message');
      expect(errorBlock.state.$error.component).toBe('failing-block');
    });
  });

  describe('Cascading Error Boundaries', () => {
    it('should bubble to parent boundary if child has none', async () => {
      window.Lego.block('parent-error', '<div class="parent-err">Parent caught it!</div>', {});

      window.Lego.block('parent-shell', `
        <div>
          <child-block></child-block>
        </div>
      `, {});

      window.Lego.block('child-block', '<div>[[ explode() ]]</div>', {
        explode() {
          throw new Error('Child crashed');
        }
      });

      const parent = document.createElement('parent-shell');
      parent.setAttribute('b-error', 'parent-error');
      document.body.appendChild(parent);

      await new Promise(r => setTimeout(r, 200));

      const target = parent.shadowRoot || parent;
      expect(target.querySelector('parent-error')).toBeTruthy();
    });

    it('should use closest boundary when nested', async () => {
      window.Lego.block('root-error', '<div>Root Error</div>', {});
      window.Lego.block('child-error', '<div>Child Error</div>', {});

      window.Lego.block('root-comp', `
        <div>
          <middle-comp b-error="child-error"></middle-comp>
        </div>
      `, {});

      window.Lego.block('middle-comp', `
        <div>
          <leaf-comp></leaf-comp>
        </div>
      `, {});

      window.Lego.block('leaf-comp', '<div>[[ fail() ]]</div>', {
        fail() {
          throw new Error('Leaf error');
        }
      });

      const root = document.createElement('root-comp');
      root.setAttribute('b-error', 'root-error');
      document.body.appendChild(root);

      await new Promise(r => setTimeout(r, 250));

      const rootTarget = root.shadowRoot || root;
      const middleComp = rootTarget.querySelector('middle-comp');
      const middleTarget = middleComp?.shadowRoot || middleComp;

      expect(middleTarget?.querySelector('child-error')).toBeTruthy();
      expect(rootTarget.querySelector('root-error')).toBeFalsy();
    });
  });

  describe('Error Sources', () => {
    it('should catch errors in mounted() lifecycle', async () => {
      window.Lego.block('mount-error', '<div>Mount Error Caught</div>', {});

      window.Lego.block('bad-mount', '<div>Test</div>', {
        mounted() {
          throw new Error('Mount failed');
        }
      });

      const el = document.createElement('bad-mount');
      el.setAttribute('b-error', 'mount-error');
      document.body.appendChild(el);

      await new Promise(r => setTimeout(r, 150));

      const target = el.shadowRoot || el;
      expect(target.querySelector('mount-error')).toBeTruthy();
    });

    it('should catch errors in event handlers', async () => {
      window.Lego.block('handler-error', '<div>Handler Error</div>', {});

      window.Lego.block('bad-handler', '<button @click="crashHandler()">Click</button>', {
        crashHandler() {
          throw new Error('Handler crashed');
        }
      });

      const el = document.createElement('bad-handler');
      el.setAttribute('b-error', 'handler-error');
      document.body.appendChild(el);

      await new Promise(r => setTimeout(r, 100));

      const button = el.shadowRoot.querySelector('button');
      button.click();

      await new Promise(r => setTimeout(r, 100));

      const target = el.shadowRoot || el;
      expect(target.querySelector('handler-error')).toBeTruthy();
    });
  });

  describe('Fallback Behavior', () => {
    it('should call config.onError when no boundary exists', async () => {
      const errorSpy = vi.fn();
      window.Lego.config.onError = errorSpy;

      window.Lego.block('no-boundary', '<div>[[ crash() ]]</div>', {
        crash() {
          throw new Error('No boundary');
        }
      });

      const el = document.createElement('no-boundary');
      document.body.appendChild(el);

      await new Promise(r => setTimeout(r, 150));

      expect(errorSpy).toHaveBeenCalled();
      expect(errorSpy.mock.calls[0][0].message).toBe('No boundary');
    });

    it('should fallback to onError when error block rendering fails', async () => {
      const errorSpy = vi.fn();
      window.Lego.config.onError = errorSpy;

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => { });

      window.Lego.block('broken-error', '<div>[[ causeError() ]]</div>', {
        causeError() {
          throw new Error('Error block is broken');
        }
      });

      window.Lego.block('primary-crash', '<div>[[ fail() ]]</div>', {
        fail() {
          throw new Error('Primary error');
        }
      });

      const el = document.createElement('primary-crash');
      el.setAttribute('b-error', 'broken-error');
      document.body.appendChild(el);

      await new Promise(r => setTimeout(r, 200));

      // Either onError was called OR console.error was called
      const errorWasCaught = errorSpy.mock.calls.length > 0 || consoleSpy.mock.calls.some(
        call => JSON.stringify(call).includes('[Lego] Error boundary failed')
      );
      expect(errorWasCaught).toBe(true);

      consoleSpy.mockRestore();
    });
  });
});
