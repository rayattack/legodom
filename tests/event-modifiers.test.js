import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { flush } from './test-utils.js';
import { JSDOM } from 'jsdom';
import fs from 'fs';
import path from 'path';

describe('Event Modifiers', () => {
  let window, document, Lego;

  beforeEach(async () => {
    const dom = new JSDOM(`<!DOCTYPE html><body></body>`, {
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
    global.KeyboardEvent = window.KeyboardEvent;
    global.Event = window.Event;

    // Load Lego
    const mainJs = fs.readFileSync(path.resolve(__dirname, '../dist/lego.min.js'), 'utf8');
    window.eval(mainJs);
    Lego = window.Lego;
    Lego.init();
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('supports .prevent modifier', async () => {
    const handler = vi.fn();
    window.Lego.block('prevent-test', '<button @click.prevent="run">Click</button>', {
      run(e) { handler(); }
    });

    document.body.innerHTML = '<prevent-test></prevent-test>';
    await flush(10);

    const btn = document.querySelector('prevent-test').shadowRoot.querySelector('button');
    const event = new window.Event('click', { bubbles: true, cancelable: true });
    vi.spyOn(event, 'preventDefault');

    btn.dispatchEvent(event);

    expect(handler).toHaveBeenCalled();
    expect(event.preventDefault).toHaveBeenCalled();
  });

  it('supports .stop modifier', async () => {
    const parentHandler = vi.fn();
    const childHandler = vi.fn();

    // Parent listens to click, Child has .stop
    window.Lego.block('stop-test', `
      <div @click="parent">
        <button @click.stop="child">Click</button>
      </div>
    `, {
      parent() { parentHandler(); },
      child() { childHandler(); }
    });

    document.body.innerHTML = '<stop-test></stop-test>';
    await flush(10);

    const btn = document.querySelector('stop-test').shadowRoot.querySelector('button');

    btn.click(); // Simple click

    expect(childHandler).toHaveBeenCalled();
    expect(parentHandler).not.toHaveBeenCalled();
  });

  it('supports .self modifier', async () => {
    const handler = vi.fn();
    window.Lego.block('self-test', `
      <div id="wrapper" @click.self="run">
        <button>Inside</button>
      </div>
    `, {
      run() { handler(); }
    });

    document.body.innerHTML = '<self-test></self-test>';
    await flush(10);

    const wrapper = document.querySelector('self-test').shadowRoot.querySelector('#wrapper');
    const btn = document.querySelector('self-test').shadowRoot.querySelector('button');

    // Click on child -> Should NOT trigger wrapper handler
    btn.click();
    expect(handler).not.toHaveBeenCalled();

    // Click on wrapper -> Should trigger
    wrapper.click();
    expect(handler).toHaveBeenCalled();
  });

  it('supports key modifiers (enter)', async () => {
    const handler = vi.fn();
    window.Lego.block('key-test', '<input @keydown.enter="run">', {
      run() { handler(); }
    });

    document.body.innerHTML = '<key-test></key-test>';
    await flush(10);

    const input = document.querySelector('key-test').shadowRoot.querySelector('input');

    // Press Space (Should ignore)
    input.dispatchEvent(new window.KeyboardEvent('keydown', { key: ' ' }));
    expect(handler).not.toHaveBeenCalled();

    // Press Enter (Should trigger)
    input.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter' }));
    expect(handler).toHaveBeenCalled();
  });

  it('supports system modifiers (.ctrl)', async () => {
    const handler = vi.fn();
    window.Lego.block('sys-test', '<input @keydown.ctrl.enter="run">', {
      run() { handler(); }
    });

    document.body.innerHTML = '<sys-test></sys-test>';
    await flush(10);

    const input = document.querySelector('sys-test').shadowRoot.querySelector('input');

    // Enter without Ctrl
    input.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', ctrlKey: false }));
    expect(handler).not.toHaveBeenCalled();

    // Enter WITH Ctrl
    input.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true }));
    expect(handler).toHaveBeenCalled();
  });

  it('supports key categories (.alpha)', async () => {
    const handler = vi.fn();
    window.Lego.block('alpha-test', '<input @keydown.alpha="run">', {
      run() { handler(); }
    });

    document.body.innerHTML = '<alpha-test></alpha-test>';
    await flush(10);

    const input = document.querySelector('alpha-test').shadowRoot.querySelector('input');

    // Number
    input.dispatchEvent(new window.KeyboardEvent('keydown', { key: '1' }));
    expect(handler).not.toHaveBeenCalled();

    // Letter
    input.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'a' }));
    expect(handler).toHaveBeenCalled();
  });
});
