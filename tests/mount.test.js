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
global.FormData = dom.window.FormData;

global.CSSStyleSheet = class {
  constructor() { this.cssRules = []; }
  replace(content) { this.cssText = content; return Promise.resolve(this); }
};

global.requestAnimationFrame = (cb) => setTimeout(cb, 0);

const libCode = fs.readFileSync(path.resolve(__dirname, '../dist/lego.min.js'), 'utf8');
eval(libCode);

describe('$mount API', () => {
  beforeEach(async () => {
    document.body.innerHTML = '';
    await window.Lego.init(document.body);
  });

  describe('Lego.mount() / $mount()', () => {
    it('mounts a component into a target by ID selector', async () => {
      window.Lego.block('mount-target-a', '<p>Hello from A</p>');
      const target = document.createElement('div');
      target.id = 'panel';
      document.body.appendChild(target);

      window.Lego.mount('mount-target-a', '#panel');
      await flush();

      const child = target.firstElementChild;
      expect(child).toBeTruthy();
      expect(child.tagName.toLowerCase()).toBe('mount-target-a');
      expect(child.shadowRoot).toBeTruthy();
      expect(child.shadowRoot.querySelector('p').textContent).toBe('Hello from A');
    });

    it('clears a target when tagName is null', async () => {
      window.Lego.block('mount-clear-a', '<p>Content</p>');
      const target = document.createElement('div');
      target.id = 'clear-panel';
      document.body.appendChild(target);

      window.Lego.mount('mount-clear-a', '#clear-panel');
      await flush();
      expect(target.firstElementChild).toBeTruthy();

      window.Lego.mount(null, '#clear-panel');
      await flush();
      expect(target.innerHTML).toBe('');
    });

    it('passes props via $initialState', async () => {
      window.Lego.block('mount-props-a', '<span b-text="userId"></span>');
      const target = document.createElement('div');
      target.id = 'props-panel';
      document.body.appendChild(target);

      window.Lego.mount('mount-props-a', '#props-panel', { userId: 42 });
      await flush();

      const child = target.firstElementChild;
      expect(child.state.userId).toBe(42);
    });

    it('returns a detached element when no target is provided', async () => {
      window.Lego.block('mount-detach-a', '<p>Detached</p>');
      const el = window.Lego.mount('mount-detach-a');
      expect(el).toBeTruthy();
      expect(el.tagName.toLowerCase()).toBe('mount-detach-a');
    });

    it('warns for tag names without hyphens', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      window.Lego.mount('invalid', '#nonexistent');
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('not a valid custom element name')
      );
      warnSpy.mockRestore();
    });

    it('handles missing targets gracefully', async () => {
      window.Lego.block('mount-miss-a', '<p>Miss</p>');
      const result = window.Lego.mount('mount-miss-a', '#does-not-exist');
      expect(result).toBeUndefined();
    });

    it('replaces previous component when re-mounting', async () => {
      window.Lego.block('mount-old-a', '<p>Old</p>');
      window.Lego.block('mount-new-a', '<p>New</p>');
      const target = document.createElement('div');
      target.id = 'swap-panel';
      document.body.appendChild(target);

      window.Lego.mount('mount-old-a', '#swap-panel');
      await flush();
      expect(target.firstElementChild.tagName.toLowerCase()).toBe('mount-old-a');

      window.Lego.mount('mount-new-a', '#swap-panel');
      await flush();
      expect(target.firstElementChild.tagName.toLowerCase()).toBe('mount-new-a');
      expect(target.children.length).toBe(1);
    });

    it('accepts a DOM element as target', async () => {
      window.Lego.block('mount-elem-a', '<p>Direct</p>');
      const target = document.createElement('div');
      document.body.appendChild(target);

      window.Lego.mount('mount-elem-a', target);
      await flush();

      expect(target.firstElementChild.tagName.toLowerCase()).toBe('mount-elem-a');
      expect(target.firstElementChild.shadowRoot.querySelector('p').textContent).toBe('Direct');
    });
  });

  describe('b-mount directive', () => {
    it('mounts a component from a state expression', async () => {
      window.Lego.block('mount-child-b', '<p>Child B</p>');
      window.Lego.block('mount-host-b', '<div b-mount="view"></div>');
      const el = document.createElement('mount-host-b');
      el.setAttribute('b-data', "{ view: 'mount-child-b' }");
      document.body.appendChild(el);
      await flush();

      const container = el.shadowRoot.querySelector('div');
      expect(container.firstElementChild).toBeTruthy();
      expect(container.firstElementChild.tagName.toLowerCase()).toBe('mount-child-b');
    });

    it('reactively swaps component when state changes', async () => {
      window.Lego.block('mount-view-one', '<p>View 1</p>');
      window.Lego.block('mount-view-two', '<p>View 2</p>');
      window.Lego.block('mount-host-swap', '<div b-mount="current"></div>');
      const el = document.createElement('mount-host-swap');
      el.setAttribute('b-data', "{ current: 'mount-view-one' }");
      document.body.appendChild(el);
      await flush();

      const container = el.shadowRoot.querySelector('div');
      expect(container.firstElementChild.tagName.toLowerCase()).toBe('mount-view-one');

      el.state.current = 'mount-view-two';
      await flush();
      expect(container.firstElementChild.tagName.toLowerCase()).toBe('mount-view-two');
    });

    it('clears container when expression evaluates to falsy', async () => {
      window.Lego.block('mount-child-c', '<p>Child C</p>');
      window.Lego.block('mount-host-clear', '<div b-mount="view"></div>');
      const el = document.createElement('mount-host-clear');
      el.setAttribute('b-data', "{ view: 'mount-child-c' }");
      document.body.appendChild(el);
      await flush();

      const container = el.shadowRoot.querySelector('div');
      expect(container.firstElementChild).toBeTruthy();

      el.state.view = null;
      await flush();
      expect(container.innerHTML).toBe('');
    });

    it('supports ternary expressions', async () => {
      window.Lego.block('mount-admin-d', '<p>Admin</p>');
      window.Lego.block('mount-user-d', '<p>User</p>');
      window.Lego.block('mount-host-ternary', "<div b-mount=\"isAdmin ? 'mount-admin-d' : 'mount-user-d'\"></div>");
      const el = document.createElement('mount-host-ternary');
      el.setAttribute('b-data', '{ isAdmin: true }');
      document.body.appendChild(el);
      await flush();

      const container = el.shadowRoot.querySelector('div');
      expect(container.firstElementChild.tagName.toLowerCase()).toBe('mount-admin-d');

      el.state.isAdmin = false;
      await flush();
      expect(container.firstElementChild.tagName.toLowerCase()).toBe('mount-user-d');
    });

    it('skips re-mount when tag name has not changed', async () => {
      window.Lego.block('mount-stable-e', '<p>Stable</p>');
      window.Lego.block('mount-host-stable', '<div b-mount="view"></div>');
      const el = document.createElement('mount-host-stable');
      el.setAttribute('b-data', "{ view: 'mount-stable-e', counter: 0 }");
      document.body.appendChild(el);
      await flush();

      const container = el.shadowRoot.querySelector('div');
      const firstChild = container.firstElementChild;
      expect(firstChild.tagName.toLowerCase()).toBe('mount-stable-e');

      // Trigger a re-render by changing unrelated state
      el.state.counter = 1;
      await flush();

      // Should be the same DOM node (not re-mounted)
      expect(container.firstElementChild).toBe(firstChild);
    });
  });
});
