import { describe, it, expect } from 'vitest';
import { JSDOM } from 'jsdom';
import fs from 'fs';
import path from 'path';

const libCode = fs.readFileSync(path.resolve(__dirname, '../dist/lego.min.js'), 'utf8');

const setup = (url = 'http://localhost/') => {
  const dom = new JSDOM('<!DOCTYPE html><body></body>', { url, runScripts: 'dangerously' });
  const win = dom.window;
  win.requestAnimationFrame = (cb) => setTimeout(cb, 0);
  win.cancelAnimationFrame = (id) => clearTimeout(id);
  win.eval(libCode);
  return win;
};
const tick = (ms = 30) => new Promise(resolve => setTimeout(resolve, ms));

describe('class interpolation on an SVG element', () => {
  it('writes the class and keeps rendering the rest of the block', async () => {
    const win = setup();
    const errors = [];
    win.Lego.config.onError = (err) => errors.push(err.message);
    win.Lego.block('svg-host', {
      template: `<svg class="icon [[ open ? 'is-open' : '' ]]"><path d="M0 0"/></svg><p>[[ label ]]</p>`,
      logic: { open: true, label: 'after' }
    });
    win.document.body.innerHTML = '<svg-host></svg-host>';
    await win.Lego.init();
    await tick();

    const root = win.document.querySelector('svg-host').shadowRoot;
    expect(errors).toEqual([]);
    expect(root.querySelector('svg').getAttribute('class')).toBe('icon is-open');
    expect(root.querySelector('p').textContent).toBe('after');

    win.document.querySelector('svg-host').state.open = false;
    await tick();
    expect(root.querySelector('svg').getAttribute('class').trim()).toBe('icon');
  });
});

describe('b-link clicks the browser should keep', () => {
  const page = async () => {
    const win = setup('http://localhost/');
    win.Lego.block('home-view', { template: '<p>home</p>' });
    win.Lego.block('about-view', { template: '<p>about</p>' });
    win.Lego.route('/', 'home-view');
    win.Lego.route('/about', 'about-view');
    win.document.body.innerHTML = '<a id="go" href="/about" b-link>About</a><a id="tab" href="/about" b-link target="_blank">About</a><lego-router></lego-router>';
    await win.Lego.init();
    await tick();
    return win;
  };
  const click = (win, id, init = {}) => {
    const event = new win.MouseEvent('click', { bubbles: true, cancelable: true, composed: true, ...init });
    win.document.getElementById(id).dispatchEvent(event);
    return event;
  };

  it('still routes a plain left click', async () => {
    const win = await page();
    const event = click(win, 'go');
    await tick();
    expect(event.defaultPrevented).toBe(true);
    expect(win.location.pathname).toBe('/about');
    expect(win.document.querySelector('lego-router').firstElementChild.tagName).toBe('ABOUT-VIEW');
  });

  for (const [name, init] of [['meta', { metaKey: true }], ['ctrl', { ctrlKey: true }], ['shift', { shiftKey: true }], ['middle button', { button: 1 }]]) {
    it(`leaves a ${name} click alone`, async () => {
      const win = await page();
      const event = click(win, 'go', init);
      await tick();
      expect(event.defaultPrevented).toBe(false);
      expect(win.location.pathname).toBe('/');
    });
  }

  it('leaves a link with target="_blank" alone', async () => {
    const win = await page();
    const event = click(win, 'tab');
    await tick();
    expect(event.defaultPrevented).toBe(false);
    expect(win.location.pathname).toBe('/');
  });
});
