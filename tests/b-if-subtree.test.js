import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { flush } from './test-utils.js';
import { JSDOM } from 'jsdom';
import fs from 'fs';
import path from 'path';

/**
 * A false `b-if` detaches its node, but the bindings inside that node were
 * still scanned and still ran on every render, so an expression that is only
 * safe once the condition holds threw anyway. `<div b-if="user"><b>[[ user.name
 * ]]</b></div>` is the shape every framework encourages and it crashed here.
 *
 * The guard is attachment: a binding whose node and anchor are both off the
 * live tree has nothing to write to, so it is skipped rather than evaluated.
 */
describe('b-if subtree bindings', () => {
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

  it('does not evaluate a binding inside a false b-if', async () => {
    const seen = [];
    Lego.block('guard-block', {
      template: `
        <div b-if="user">
          <b>[[ probe() ]]-[[ user.name ]]</b>
        </div>
      `,
      logic: {
        user: null,
        probe() {
          seen.push('ran');
          return 'x';
        }
      }
    });

    const el = document.createElement('guard-block');
    document.body.appendChild(el);
    await flush();

    expect(seen).toEqual([]);
    expect(el.shadowRoot.querySelector('b')).toBe(null);

    el.state.user = { name: 'Ada' };
    await flush();

    expect(seen).toEqual(['ran']);
    expect(el.shadowRoot.querySelector('b').textContent.trim()).toBe('x-Ada');
  });

  it('stops evaluating again once the condition goes back to false', async () => {
    const seen = [];
    Lego.block('toggle-block', {
      template: '<p b-if="open"><i>[[ probe() ]]</i></p>',
      logic: {
        open: true,
        item: { label: 'first' },
        probe() {
          seen.push('ran');
          return 'x';
        }
      }
    });

    const el = document.createElement('toggle-block');
    document.body.appendChild(el);
    await flush();
    expect(seen).toEqual(['ran']);

    el.state.open = false;
    el.state.item = null;
    await flush();

    expect(seen).toEqual(['ran']);
    expect(el.shadowRoot.querySelector('i')).toBe(null);
  });

  it('does not evaluate a nested b-if inside a false outer b-if', async () => {
    const seen = [];
    Lego.block('nested-guard', {
      template: `
        <div b-if="outer">
          <span b-if="probe()">deep</span>
        </div>
      `,
      logic: {
        outer: null,
        probe() {
          seen.push('ran');
          return true;
        }
      }
    });

    const el = document.createElement('nested-guard');
    document.body.appendChild(el);
    await flush();

    expect(seen).toEqual([]);

    el.state.outer = { inner: true };
    await flush();

    expect(seen).toEqual(['ran']);
    expect(el.shadowRoot.querySelector('span').textContent).toBe('deep');
  });

  it('still writes attributes and text once the branch is attached', async () => {
    Lego.block('attr-guard', {
      template: '<div b-if="on"><a href="[[ url ]]" class="[[ tone ]]">[[ label ]]</a></div>',
      logic: { on: false, url: null, tone: 'plain', label: 'nothing' }
    });

    const el = document.createElement('attr-guard');
    document.body.appendChild(el);
    await flush();

    Object.assign(el.state, { on: true, url: '/docs', tone: 'brand', label: 'Docs' });
    await flush();

    const link = el.shadowRoot.querySelector('a');
    expect(link.getAttribute('href')).toBe('/docs');
    expect(link.getAttribute('class')).toBe('brand');
    expect(link.textContent).toBe('Docs');
  });

  it('reports a genuine error from an attached branch through onError', async () => {
    const onError = vi.fn();
    Lego.config.onError = onError;

    Lego.block('loud-block', {
      template: '<div b-if="on"><b>[[ boom.value ]]</b></div>',
      logic: { on: true, boom: null }
    });

    const el = document.createElement('loud-block');
    document.body.appendChild(el);
    await flush();

    expect(onError).toHaveBeenCalled();
    Lego.config.onError = () => {};
  });
});
