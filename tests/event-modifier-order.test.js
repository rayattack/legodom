import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { flush } from './test-utils.js';
import { JSDOM } from 'jsdom';
import fs from 'fs';
import path from 'path';

describe('Event modifiers apply only to matched keys', () => {
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

  it('@keydown.enter.prevent leaves other keys alone', async () => {
    const handler = vi.fn();
    window.Lego.block('prevent-order', '<input @keydown.enter.prevent="run">', { run() { handler(); } });
    document.body.innerHTML = '<prevent-order></prevent-order>';
    await flush(10);
    const input = document.querySelector('prevent-order').shadowRoot.querySelector('input');

    const letter = new window.KeyboardEvent('keydown', { key: 'a', bubbles: true, cancelable: true });
    input.dispatchEvent(letter);
    expect(letter.defaultPrevented).toBe(false);
    expect(handler).not.toHaveBeenCalled();

    const enter = new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
    input.dispatchEvent(enter);
    expect(enter.defaultPrevented).toBe(true);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('@keydown.ctrl.s.stop does not stop propagation of plain keys', async () => {
    const outer = vi.fn();
    window.Lego.block('stop-order', '<div @keydown="outer"><input @keydown.ctrl.s.stop="run"></div>', { outer() { outer(); }, run() {} });
    document.body.innerHTML = '<stop-order></stop-order>';
    await flush(10);
    const input = document.querySelector('stop-order').shadowRoot.querySelector('input');

    input.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'a', bubbles: true, cancelable: true }));
    expect(outer).toHaveBeenCalledTimes(1);

    input.dispatchEvent(new window.KeyboardEvent('keydown', { key: 's', ctrlKey: true, bubbles: true, cancelable: true }));
    expect(outer).toHaveBeenCalledTimes(1);
  });
});
