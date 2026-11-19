import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { flush } from './test-utils.js';
import { JSDOM } from 'jsdom';
import fs from 'fs';
import path from 'path';

/**
 * An event handler inside a `b-for` row runs in that row's own scope. Before,
 * the handler rebuilt a scope from the list expression and the loop variable
 * alone, so `$index` was a ReferenceError there while it rendered fine in the
 * row's text, and an inner loop's handler evaluated `cat.items` against the
 * block state, where `cat` does not exist.
 */
describe('b-for row handler scope', () => {
  let window, document, Lego;

  beforeEach(async () => {
    const dom = new JSDOM('<!DOCTYPE html><body></body>', { url: 'http://localhost/', runScripts: 'dangerously' });
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
    window.CSSStyleSheet = global.CSSStyleSheet;
    window.requestAnimationFrame = (cb) => setTimeout(cb, 0);
    window.eval(fs.readFileSync(path.resolve(__dirname, '../dist/lego.min.js'), 'utf8'));
    Lego = window.Lego;
    await Lego.init();
  });

  afterEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  const mount = async (tag, options) => {
    Lego.block(tag, options);
    document.body.insertAdjacentHTML('beforeend', `<${tag}></${tag}>`);
    await flush(30);
    return document.querySelector(tag);
  };
  const click = async (node) => {
    node.dispatchEvent(new window.Event('click', { bubbles: true }));
    await flush(30);
  };

  it('defines $index in a row handler', async () => {
    const errors = vi.spyOn(window.console, 'error').mockImplementation(() => {});
    const el = await mount('hs-index', {
      template: '<ul><li b-for="t in xs"><button @click="removeAt($index)">[[ t ]]</button></li></ul>',
      logic: { xs: ['a', 'b', 'c'], removeAt(i) { this.xs.splice(i, 1); } }
    });
    await click(el.shadowRoot.querySelectorAll('button')[1]);
    expect(el.state.xs).toEqual(['a', 'c']);
    await click(el.shadowRoot.querySelectorAll('button')[1]);
    expect(el.state.xs).toEqual(['a']);
    expect(errors).not.toHaveBeenCalled();
  });

  it('acts on the item the row shows when the list is a filtered expression', async () => {
    const el = await mount('hs-filter', {
      template: '<button b-for="t in todos.filter(t => !t.done)" @click="t.done = true">[[ t.title ]]</button>',
      logic: { todos: [{ id: 1, title: 'a', done: false }, { id: 2, title: 'b', done: true }, { id: 3, title: 'c', done: false }] }
    });
    const buttons = el.shadowRoot.querySelectorAll('button');
    expect([...buttons].map(b => b.textContent)).toEqual(['a', 'c']);
    await click(buttons[1]);
    expect(el.state.todos.map(t => t.done)).toEqual([false, true, true]);
  });

  it('sees both loop variables in a nested loop handler', async () => {
    const errors = vi.spyOn(window.console, 'error').mockImplementation(() => {});
    const el = await mount('hs-nested', {
      template: `
        <section b-for="cat in cats">
          <button b-for="item in cat.items" @click="pick(cat.name, item, $index)">[[ item ]]</button>
        </section>`,
      logic: {
        cats: [{ id: 1, name: 'fruit', items: ['apple', 'pear'] }, { id: 2, name: 'veg', items: ['kale'] }],
        picked: '',
        pick(cat, item, i) { this.picked = `${cat}/${item}/${i}`; }
      }
    });
    const buttons = el.shadowRoot.querySelectorAll('button');
    await click(buttons[1]);
    expect(el.state.picked).toBe('fruit/pear/1');
    await click(buttons[2]);
    expect(el.state.picked).toBe('veg/kale/0');
    expect(errors).not.toHaveBeenCalled();
  });

  it('still writes block state from a row handler', async () => {
    const el = await mount('hs-write', {
      template: '<button b-for="t in xs" @click="selected = t">[[ t ]]</button><i>[[ selected ]]</i>',
      logic: { xs: ['a', 'b'], selected: '' }
    });
    await click(el.shadowRoot.querySelectorAll('button')[1]);
    expect(el.state.selected).toBe('b');
    expect(el.shadowRoot.querySelector('i').textContent).toBe('b');
  });
});
