import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { flush } from './test-utils.js';
import { JSDOM } from 'jsdom';
import fs from 'fs';
import path from 'path';

describe('b-for loop variable never leaks into block state', () => {
  let window, document;

  beforeEach(async () => {
    const dom = new JSDOM(`<!DOCTYPE html><body></body>`, { url: 'http://localhost/', runScripts: 'dangerously', resources: 'usable' });
    window = dom.window;
    document = window.document;
    global.window = window;
    global.document = document;
    global.Node = window.Node;
    global.Element = window.Element;
    global.HTMLElement = window.HTMLElement;
    global.KeyboardEvent = window.KeyboardEvent;
    global.Event = window.Event;
    const mainJs = fs.readFileSync(path.resolve(__dirname, '../dist/lego.min.js'), 'utf8');
    window.eval(mainJs);
    window.Lego.init();
  });

  afterEach(() => { document.body.innerHTML = ''; });

  it('a state key named like the loop variable keeps its own value', async () => {
    window.Lego.block('shadow-loop', `
      <p id="own">[[ m.subject ]]</p>
      <ul><li b-for="m in items">[[ m.title ]]</li></ul>
    `, {
      m: { subject: 'the selected one' },
      items: [{ title: 'first' }, { title: 'second' }]
    });
    document.body.innerHTML = '<shadow-loop></shadow-loop>';
    await flush(20);
    const el = document.querySelector('shadow-loop');
    const root = el.shadowRoot;

    expect(root.querySelector('#own').textContent.trim()).toBe('the selected one');
    expect([...root.querySelectorAll('li')].map(li => li.textContent.trim())).toEqual(['first', 'second']);
    expect(el.state.m.subject).toBe('the selected one');
    expect(el.state.m.title).toBeUndefined();

    el.state.items.push({ title: 'third' });
    await flush(20);
    expect(root.querySelector('#own').textContent.trim()).toBe('the selected one');
    expect(root.querySelectorAll('li').length).toBe(3);
  });
});
