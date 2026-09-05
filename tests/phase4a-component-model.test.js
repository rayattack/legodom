import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { flush } from './test-utils.js';
import { JSDOM } from 'jsdom';
import fs from 'fs';
import path from 'path';

const libCode = fs.readFileSync(path.resolve(__dirname, '../dist/lego.min.js'), 'utf8');

const setupDom = () => {
  const dom = new JSDOM('<!DOCTYPE html><head></head><body></body>', {
    url: 'http://localhost/',
    runScripts: 'dangerously',
    resources: 'usable'
  });
  const win = dom.window;
  global.window = win;
  global.document = win.document;
  global.HTMLElement = win.HTMLElement;
  global.customElements = win.customElements;
  global.MutationObserver = win.MutationObserver;
  global.Node = win.Node;
  global.NodeFilter = win.NodeFilter;
  global.Element = win.Element;
  global.Event = win.Event;
  global.CustomEvent = win.CustomEvent;
  global.localStorage = win.localStorage;
  global.StorageEvent = win.StorageEvent;
  global.CSSStyleSheet = win.CSSStyleSheet;
  win.requestAnimationFrame = (cb) => setTimeout(cb, 0);
  win.cancelAnimationFrame = (id) => clearTimeout(id);
  global.requestAnimationFrame = win.requestAnimationFrame;
  global.cancelAnimationFrame = win.cancelAnimationFrame;
  win.eval(libCode);
  return win;
};

describe('Phase 4a: reactive props', () => {
  let win, Lego, warnSpy;

  beforeEach(async () => {
    win = setupDom();
    Lego = win.Lego;
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await Lego.init(win.document.body);
  });

  afterEach(() => {
    win.document.body.innerHTML = '';
    warnSpy.mockRestore();
  });

  const propWarnings = () =>
    warnSpy.mock.calls
      .map(c => c[0])
      .filter(m => typeof m === 'string' && m.includes('[Lego]') && m.includes('prop'));

  it('flows a parent value in at mount and again on every change', async () => {
    Lego.block('kid-title', '<span>[[ title ]]</span>', {}, '', '', '', 'title: String = "none"');
    Lego.block('parent-title', '<kid-title :title="msg"></kid-title>', { msg: 'hello' });

    win.document.body.innerHTML = '<parent-title></parent-title>';
    await flush(20);

    const parent = win.document.querySelector('parent-title');
    const kid = parent.shadowRoot.querySelector('kid-title');
    // The parent renders before the child snaps, so the first value arrives
    // as a pending prop and snap() merges it.
    expect(kid.shadowRoot.textContent).toContain('hello');

    parent.state.msg = 'goodbye';
    await Lego.nextTick();
    expect(kid.shadowRoot.textContent).toContain('goodbye');
  });

  it('maps a kebab-cased binding onto the camelCase prop', async () => {
    Lego.block('kid-user', '<span>[[ userName ]]</span>', {}, '', '', '', 'userName: String = ""');
    Lego.block('parent-user', '<kid-user :user-name="who"></kid-user>', { who: 'Ada' });

    win.document.body.innerHTML = '<parent-user></parent-user>';
    await flush(20);

    const kid = win.document.querySelector('parent-user').shadowRoot.querySelector('kid-user');
    expect(kid.state.userName).toBe('Ada');
    expect(kid.shadowRoot.textContent).toContain('Ada');
  });

  it('coerces plain attributes through the declared type', async () => {
    Lego.block(
      'coerce-block',
      '<span>[[ label ]]</span>',
      {}, '', '', '',
      'count: Number, ratio: Number, flag: Boolean, off: Boolean, items: Array, cfg: Object, label: String'
    );
    win.document.body.innerHTML =
      `<coerce-block count="42" ratio="1.5" flag off="false" items='[1,2]' cfg='{"a":1}' label="hi"></coerce-block>`;
    await flush(20);

    const state = win.document.querySelector('coerce-block').state;
    expect(state.count).toBe(42);
    expect(state.ratio).toBe(1.5);
    expect(state.flag).toBe(true);
    expect(state.off).toBe(false);
    expect([...state.items]).toEqual([1, 2]);
    expect(state.cfg.a).toBe(1);
    expect(state.label).toBe('hi');
  });

  it('reflects an attribute set after mount onto the prop', async () => {
    Lego.block('late-attr', '<span>[[ count ]]</span>', {}, '', '', '', 'count: Number = 0');
    win.document.body.innerHTML = '<late-attr></late-attr>';
    await flush(20);

    const el = win.document.querySelector('late-attr');
    el.setAttribute('count', '7');
    await Lego.nextTick();

    expect(el.state.count).toBe(7);
    expect(el.shadowRoot.textContent).toContain('7');
  });

  it('gives every instance its own default object', async () => {
    Lego.block('def-items', '<span>[[ items.length ]]</span>', {}, '', '', '', 'items: Array = []');
    win.document.body.innerHTML = '<def-items></def-items><def-items></def-items>';
    await flush(20);

    const [a, b] = [...win.document.querySelectorAll('def-items')];
    expect(a.state.items).not.toBe(b.state.items);

    a.state.items.push('x');
    await Lego.nextTick();
    expect(a.state.items.length).toBe(1);
    expect(b.state.items.length).toBe(0);
  });

  it('binds props from inside a b-for row scope', async () => {
    Lego.block('row-kid', '<span>[[ label ]]</span>', {}, '', '', '', 'label: String = ""');
    Lego.block(
      'row-parent',
      '<ul><li b-for="item in items"><row-kid :label="item.name"></row-kid></li></ul>',
      { items: [{ id: 1, name: 'alpha' }, { id: 2, name: 'beta' }] }
    );

    win.document.body.innerHTML = '<row-parent></row-parent>';
    await flush(30);

    const parent = win.document.querySelector('row-parent');
    const kids = () => [...parent.shadowRoot.querySelectorAll('row-kid')];
    expect(kids().map(k => k.shadowRoot.textContent.trim())).toEqual(['alpha', 'beta']);

    parent.state.items[0].name = 'omega';
    await Lego.nextTick();
    expect(kids().map(k => k.shadowRoot.textContent.trim())).toEqual(['omega', 'beta']);
  });

  it('does not warn about a prop that carries a default', async () => {
    Lego.block('defaulted-prop', '<span>[[ title ]]</span>', {}, '', '', '', 'title = "fallback"');
    win.document.body.innerHTML = '<defaulted-prop></defaulted-prop>';
    await flush(20);

    expect(propWarnings()).toEqual([]);
    expect(win.document.querySelector('defaulted-prop').shadowRoot.textContent).toContain('fallback');
  });
});

describe('Phase 4a: Shadow DOM opt-out', () => {
  let win, Lego;

  beforeEach(async () => {
    win = setupDom();
    Lego = win.Lego;
    await Lego.init(win.document.body);
  });

  afterEach(() => { win.document.body.innerHTML = ''; });

  it('renders into the element itself and stays reactive', async () => {
    Lego.block('light-one', { template: '<p>[[ msg ]]</p>', logic: { msg: 'hi' }, shadow: false });
    win.document.body.innerHTML = '<light-one></light-one>';
    await flush(20);

    const el = win.document.querySelector('light-one');
    expect(el.shadowRoot).toBe(null);
    expect(el.querySelector('p').textContent).toBe('hi');

    el.state.msg = 'bye';
    await Lego.nextTick();
    expect(el.querySelector('p').textContent).toBe('bye');
  });

  it('is reachable by a page-level selector, which is what global CSS needs', async () => {
    Lego.block('light-global', { template: '<p class="inner">x</p>', shadow: false });
    win.document.body.innerHTML = '<light-global></light-global>';
    await flush(20);

    expect(win.document.querySelector('body light-global p.inner')).not.toBe(null);
  });

  it('emulates default, named and fallback slots', async () => {
    Lego.block('light-card', {
      template: '<header><slot name="head">H</slot></header>' +
                '<div class="body"><slot></slot></div>' +
                '<footer><slot name="foot">F</slot></footer>',
      shadow: false
    });
    win.document.body.innerHTML =
      '<light-card><h1 slot="head">Title</h1><p>Body</p></light-card>';
    await flush(20);

    const el = win.document.querySelector('light-card');
    expect(el.querySelector('header').textContent).toBe('Title');
    expect(el.querySelector('.body').textContent).toBe('Body');
    expect(el.querySelector('footer').textContent).toBe('F');
    expect(el.querySelectorAll('slot').length).toBe(0);
  });

  it('keeps parent interpolation alive inside slotted content', async () => {
    Lego.block('light-slot', { template: '<div><slot></slot></div>', shadow: false });
    Lego.block('slot-parent', '<light-slot><span>[[ who ]]</span></light-slot>', { who: 'Ada' });

    win.document.body.innerHTML = '<slot-parent></slot-parent>';
    await flush(20);

    const parent = win.document.querySelector('slot-parent');
    const span = parent.shadowRoot.querySelector('span');
    expect(span.textContent).toBe('Ada');
    // The span now lives inside the light block's <div>, moved there by slot
    // emulation, and it is still the parent's binding.
    expect(span.parentElement.tagName).toBe('DIV');

    parent.state.who = 'Grace';
    await Lego.nextTick();
    expect(span.textContent).toBe('Grace');
  });

  it('injects one scoped stylesheet per tag, however many instances mount', async () => {
    Lego.block('light-styled', {
      template: '<style>self { color: red; } .x { color: blue; } @media (min-width: 1px) { .y { color: green; } }</style><p class="x">hi</p>',
      shadow: false
    });
    win.document.body.innerHTML = '<light-styled></light-styled><light-styled></light-styled>';
    await flush(20);

    const sheets = win.document.querySelectorAll('style[data-lego-style="light-styled"]');
    expect(sheets.length).toBe(1);

    const css = sheets[0].textContent;
    expect(css).toContain('light-styled {');
    expect(css).toContain('light-styled .x');
    expect(css).toContain('@media');
    expect(css).toContain('light-styled .y');

    // The instance keeps no <style> of its own.
    expect(win.document.querySelector('light-styled style')).toBe(null);
  });

  it('nests a light block inside a shadow block and a shadow block inside a light one', async () => {
    Lego.block('shadow-kid', '<em>[[ n ]]</em>', {}, '', '', '', 'n: Number = 0');
    Lego.block('light-host', {
      template: '<shadow-kid :n="count"></shadow-kid>',
      logic: { count: 5 },
      shadow: false
    });
    Lego.block('shadow-host', '<light-host></light-host>', {});

    win.document.body.innerHTML = '<shadow-host></shadow-host>';
    await flush(30);

    const host = win.document.querySelector('shadow-host');
    const light = host.shadowRoot.querySelector('light-host');
    expect(light.shadowRoot).toBe(null);

    const kid = light.querySelector('shadow-kid');
    expect(kid.shadowRoot.textContent).toContain('5');

    light.state.count = 9;
    await Lego.nextTick();
    expect(kid.shadowRoot.textContent).toContain('9');
  });
});

describe('Phase 4a: form participation', () => {
  let win, Lego;

  beforeEach(async () => {
    win = setupDom();
    Lego = win.Lego;
    await Lego.init(win.document.body);
  });

  afterEach(() => { win.document.body.innerHTML = ''; });

  const mountField = async (tag) => {
    win.document.body.innerHTML = `<${tag}></${tag}>`;
    await flush(20);
    return win.document.querySelector(tag);
  };

  it('publishes state.value through internals whenever it changes', async () => {
    Lego.block('form-field', {
      template: '<input>',
      logic: { value: 'a' },
      form: true
    });
    const el = await mountField('form-field');
    expect(el._internals).toBeTruthy();

    const spy = vi.spyOn(el._internals, 'setFormValue');
    el.state.value = 'b';
    expect(spy).toHaveBeenCalledWith('b');
    spy.mockRestore();
  });

  it('delegates $form.setValidity and the validity read back to internals', async () => {
    Lego.block('form-validated', { template: '<input>', logic: { value: '' }, form: true });
    const el = await mountField('form-validated');

    expect(el.state.$form.validity.valid).toBe(true);
    el.state.$form.setValidity({ valueMissing: true }, 'Required');
    expect(el.state.$form.validity.valid).toBe(false);
    expect(el.state.$form.checkValidity()).toBe(false);

    el.state.$form.setValidity({});
    expect(el.state.$form.checkValidity()).toBe(true);
  });

  it('restores the mounted value on formResetCallback and records disabled', async () => {
    Lego.block('form-resettable', { template: '<input>', logic: { value: 'start' }, form: true });
    const el = await mountField('form-resettable');

    el.state.value = 'edited';
    el.formResetCallback();
    expect(el.state.value).toBe('start');

    el.formDisabledCallback(true);
    expect(el.state.$disabled).toBe(true);
  });

  it('leaves a block that did not ask for form participation untouched', async () => {
    Lego.block('plain-field', '<input>', { value: 'a' });
    const el = await mountField('plain-field');

    expect(el._internals).toBeUndefined();
    expect(el.state.$form).toBeUndefined();
  });
});

describe('Phase 4a: lifecycle hooks', () => {
  let win, Lego;

  beforeEach(async () => {
    win = setupDom();
    Lego = win.Lego;
    await Lego.init(win.document.body);
  });

  afterEach(() => { win.document.body.innerHTML = ''; });

  it('runs updated() once per flush, with the DOM already committed', async () => {
    const seen = [];
    Lego.block('sync-updated', '<span>[[ n ]]</span>', {
      n: 0,
      updated() {
        seen.push(this.$element.shadowRoot.querySelector('span').textContent);
      }
    });
    win.document.body.innerHTML = '<sync-updated></sync-updated>';
    await flush(20);
    seen.length = 0;

    const el = win.document.querySelector('sync-updated');
    el.state.n = 1;
    el.state.n = 2;
    el.state.n = 3;
    await Lego.nextTick();

    // One flush, one call, and it saw the finished DOM rather than a 50ms
    // old snapshot of it.
    expect(seen).toEqual(['3']);
  });

  it('runs beforeUpdate() against the DOM the render is about to replace', async () => {
    const seen = [];
    Lego.block('before-update', '<span>[[ n ]]</span>', {
      n: 0,
      beforeUpdate() {
        seen.push(this.$element.shadowRoot.querySelector('span').textContent);
      }
    });
    win.document.body.innerHTML = '<before-update></before-update>';
    await flush(20);

    // Never fires for the initial render.
    expect(seen).toEqual([]);

    const el = win.document.querySelector('before-update');
    el.state.n = 1;
    await Lego.nextTick();
    expect(seen).toEqual(['0']);
    expect(el.shadowRoot.querySelector('span').textContent).toBe('1');
  });

  it('lets an ancestor claim a descendant error with errorCaptured', async () => {
    const captured = [];
    const reported = [];
    Lego.config.onError = (err, type) => reported.push({ err, type });

    Lego.block('boom-kid', '<span>x</span>', {
      mounted() { throw new Error('kid-boom'); }
    });
    Lego.block('catching-parent', '<boom-kid></boom-kid>', {
      errorCaptured(err, info) {
        captured.push({ message: err.message, type: info.type, source: info.source.tagName });
        return false;
      }
    });

    win.document.body.innerHTML = '<catching-parent></catching-parent>';
    await flush(30);

    expect(captured.length).toBe(1);
    expect(captured[0].message).toBe('kid-boom');
    expect(captured[0].type).toBe('mounted');
    expect(captured[0].source).toBe('BOOM-KID');
    // Claimed: config.onError never heard about it.
    expect(reported).toEqual([]);
  });

  it('lets the error through when errorCaptured returns nothing', async () => {
    const reported = [];
    Lego.config.onError = (err, type) => reported.push({ err, type });

    Lego.block('boom-kid-2', '<span>x</span>', {
      mounted() { throw new Error('still-boom'); }
    });
    Lego.block('watching-parent', '<boom-kid-2></boom-kid-2>', {
      errorCaptured() { /* observe only */ }
    });

    win.document.body.innerHTML = '<watching-parent></watching-parent>';
    await flush(30);

    expect(reported.some(r => r.err.message === 'still-boom' && r.type === 'mounted')).toBe(true);
  });

  it('exposes $loading around an async mounted(), and only then', async () => {
    let release;
    const gate = new Promise(resolve => { release = resolve; });

    Lego.block('async-block', '<span>[[ $loading ]]</span>', {
      async mounted() { await gate; }
    });
    Lego.block('sync-block', '<span>ready</span>', {
      mounted() { /* nothing async */ }
    });

    win.document.body.innerHTML = '<async-block></async-block><sync-block></sync-block>';
    const el = win.document.querySelector('async-block');
    expect(el.state.$loading).toBe(true);

    release();
    await flush(20);
    expect(el.state.$loading).toBe(false);

    expect('$loading' in win.document.querySelector('sync-block').state).toBe(false);
  });
});
