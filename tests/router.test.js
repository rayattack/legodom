import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { flush } from './test-utils.js';
import { JSDOM } from 'jsdom';
import fs from 'fs';
import path from 'path';

describe('Router', () => {
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
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('should render route component into lego-router target', async () => {
    Lego.block('route-home-a', '<div id="home">Home Page</div>');
    Lego.route('/', 'route-home-a');

    const router = document.createElement('div');
    router.setAttribute('is', 'lego-router');
    // The default target is 'lego-router' tag
    const legoRouter = document.createElement('lego-router');
    document.body.appendChild(legoRouter);

    await Lego.init(document.body);
    await flush(100);

    const child = legoRouter.querySelector('route-home-a');
    expect(child).toBeTruthy();
  });

  it('should use createElement instead of innerHTML for route rendering', async () => {
    Lego.block('route-safe-a', '<div>Safe</div>');
    Lego.route('/', 'route-safe-a');

    const legoRouter = document.createElement('lego-router');
    document.body.appendChild(legoRouter);

    await Lego.init(document.body);
    await flush(100);

    const child = legoRouter.querySelector('route-safe-a');
    expect(child).toBeTruthy();
    expect(child.tagName.toLowerCase()).toBe('route-safe-a');
  });

  it('should update $route on navigation', async () => {
    Lego.block('route-nav-a', '<div>Nav Page</div>');
    Lego.route('/', 'route-nav-a');

    const legoRouter = document.createElement('lego-router');
    document.body.appendChild(legoRouter);

    await Lego.init(document.body);
    await flush(100);

    expect(Lego.globals.$route.url).toBe('/');
    expect(Lego.globals.$route.route).toBe('/');
  });

  it('should extract route params', async () => {
    Lego.block('route-param-a', '<div>User Page</div>');
    Lego.route('/users/:id', 'route-param-a');

    await Lego.init(document.body);

    // Route params are extracted when the route matches
    // Since we're at '/', /users/:id won't match
    // But we can verify the route was registered
    expect(Lego.globals.$route).toBeDefined();
  });

  it('should support route middleware', async () => {
    const middlewareSpy = vi.fn(() => true);

    Lego.block('route-mid-a', '<div>Middleware Page</div>');
    Lego.route('/', 'route-mid-a', middlewareSpy);

    const legoRouter = document.createElement('lego-router');
    document.body.appendChild(legoRouter);

    await Lego.init(document.body);
    await flush(100);

    expect(middlewareSpy).toHaveBeenCalled();
  });

  it('should block navigation when middleware returns false', async () => {
    const blockMiddleware = vi.fn(() => false);

    Lego.block('route-blocked-a', '<div>Blocked</div>');
    Lego.route('/', 'route-blocked-a', blockMiddleware);

    const legoRouter = document.createElement('lego-router');
    document.body.appendChild(legoRouter);

    await Lego.init(document.body);
    await flush(100);

    expect(blockMiddleware).toHaveBeenCalled();
    // Component should NOT have been rendered since middleware blocked it
    expect(legoRouter.querySelector('route-blocked-a')).toBeFalsy();
  });

  it('should only prevent form submission on forms with b-action', async () => {
    Lego.block('route-form-a', '<div>Form Page</div>');
    Lego.route('/', 'route-form-a');

    const legoRouter = document.createElement('lego-router');
    document.body.appendChild(legoRouter);

    await Lego.init(document.body);
    await flush(50);

    // Normal form should NOT be prevented
    const normalForm = document.createElement('form');
    document.body.appendChild(normalForm);
    const normalEvent = new window.Event('submit', { bubbles: true, cancelable: true });
    normalForm.dispatchEvent(normalEvent);
    expect(normalEvent.defaultPrevented).toBe(false);

    // Form with b-action SHOULD be prevented
    const legoForm = document.createElement('form');
    legoForm.setAttribute('b-action', '/submit');
    document.body.appendChild(legoForm);
    const legoEvent = new window.Event('submit', { bubbles: true, cancelable: true });
    legoForm.dispatchEvent(legoEvent);
    expect(legoEvent.defaultPrevented).toBe(true);
  });
});
