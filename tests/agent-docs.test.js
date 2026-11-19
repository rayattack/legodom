import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { flush } from './test-utils.js';
import { JSDOM } from 'jsdom';
import fs from 'fs';
import path from 'path';
import { parseLego, generateBlockCall, scriptModule, scriptFunctionBody } from '../src/utils/parser-utils.js';

/**
 * create-legodom/template/AGENTS.md, docs/public/llms-full.txt and
 * docs/public/llms.txt tell coding agents how to write LegoDOM. An agent
 * follows them literally, so a wrong line costs more there than anywhere else
 * in the docs. These tests hold the three files to the runtime: their examples
 * have to run, their allowlist has to be the compiler's, their links have to
 * resolve, and every limitation they warn about has to still be true.
 *
 * When a "documented limitation" test fails, the limitation was lifted. Update
 * the sharp edges in AGENTS.md and llms-full.txt (they must stay identical),
 * then flip the test.
 */

const repo = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(repo, p), 'utf8');
const AGENTS = read('create-legodom/template/AGENTS.md');
const FULL = read('docs/public/llms-full.txt');
const INDEX = read('docs/public/llms.txt');

const fenced = (doc, firstLine) => {
  const escaped = firstLine.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = doc.match(new RegExp('```html\\n(' + escaped + '[\\s\\S]*?)```'));
  if (!match) throw new Error(`No example starting with ${firstLine}`);
  return match[1];
};

describe('agent docs: static checks', () => {
  it('documents every directive module in llms-full.txt', () => {
    const names = fs.readdirSync(path.join(repo, 'src/directives'))
      .filter(f => /^b-.+\.js$/.test(f))
      .map(f => f.replace(/\.js$/, ''));
    expect(names.length).toBeGreaterThan(5);
    for (const name of names) expect(FULL, name).toContain('`' + name);
  });

  it('lists exactly the globals the expression compiler allows', () => {
    const source = read('src/utils/expression.js');
    const safe = source.match(/const SAFE = dict\(\{([\s\S]*?)\}\);/)[1]
      .split(/[\s,]+/).filter(Boolean).sort();
    for (const doc of [AGENTS, FULL]) {
      const listed = doc.match(/only these globals:\s*`([^`]+)`/i)[1].split(/\s+/).filter(Boolean).sort();
      expect(listed).toEqual(safe);
    }
  });

  it('keeps the sharp edges identical in AGENTS.md and llms-full.txt', () => {
    const edges = (doc) => doc.slice(doc.indexOf('Each of these looks right and is wrong:')).trim();
    expect(edges(AGENTS).length).toBeGreaterThan(500);
    expect(edges(FULL)).toBe(edges(AGENTS));
  });

  it('follows the llms.txt layout and links only to files that exist', () => {
    expect(INDEX.startsWith('# LegoDOM\n')).toBe(true);
    expect(INDEX).toMatch(/\n> \S/);
    expect(INDEX).toContain('(https://rayattack.github.io/legodom/llms-full.txt)');
    const raw = [...INDEX.matchAll(/\(https:\/\/raw\.githubusercontent\.com\/rayattack\/legodom\/main\/([^)]+)\)/g)];
    expect(raw.length).toBeGreaterThan(20);
    for (const [, file] of raw) expect(fs.existsSync(path.join(repo, file)), file).toBe(true);
  });

  it('keeps script imports for the bundler and refuses them without one', () => {
    const script = "import { money } from './money.js';\nconst TAX = 0.2;\nexport default { total: 1 }";
    const { code } = scriptModule(script);
    expect(code).toContain("import { money } from './money.js';");
    expect(code).toContain('const TAX = 0.2;');
    expect(() => scriptFunctionBody(script)).toThrow(/needs the Vite plugin/);
    expect(() => scriptFunctionBody('const TAX = 0.2;\nexport default { total: 1 }')).not.toThrow();
  });
});

describe('agent docs: runtime behavior', () => {
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
    window.CSSStyleSheet = global.CSSStyleSheet;
    window.requestAnimationFrame = (cb) => setTimeout(cb, 0);

    window.eval(fs.readFileSync(path.join(repo, 'dist/lego.min.js'), 'utf8'));
    Lego = window.Lego;
    await Lego.init();
  });

  afterEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  const root = (el) => el.shadowRoot || el;
  const fire = (el, type, init = {}) => el.dispatchEvent(new window.Event(type, { bubbles: true, cancelable: true, ...init }));

  const place = async (html) => {
    const host = document.createElement('div');
    host.innerHTML = html;
    document.body.appendChild(host);
    await flush(30);
    return host.firstElementChild;
  };

  const block = (tag, options, html) => {
    Lego.block(tag, options);
    return place(html || `<${tag}></${tag}>`);
  };

  // What the Vite plugin emits for a .lego file, run the way the plugin runs it.
  const defineSfc = (source, filename) => {
    window.eval(`(function () { const $db = Lego.db; ${generateBlockCall(parseLego(source, filename))} })()`);
  };

  const quiet = () => {
    vi.spyOn(window.console, 'error').mockImplementation(() => {});
    vi.spyOn(window.console, 'warn').mockImplementation(() => {});
  };

  describe('examples', () => {
    it('runs the AGENTS.md todo-list block', async () => {
      defineSfc(fenced(AGENTS, '<!-- src/todo-list.lego -->'), 'todo-list.lego');
      const el = await place('<todo-list title="Groceries"></todo-list>');
      const $ = (sel) => root(el).querySelector(sel);
      expect($('h2').textContent).toBe('Groceries (0 left)');
      expect($('p').textContent).toBe('Nothing yet.');

      $('form input').value = 'Milk';
      fire($('form input'), 'input');
      fire($('form'), 'submit');
      await flush(30);
      expect(root(el).querySelectorAll('li')).toHaveLength(1);
      expect($('li span').textContent).toBe('Milk');
      expect($('h2').textContent).toBe('Groceries (1 left)');
      expect($('form input').value).toBe('');
      expect($('p')).toBeNull();

      const box = $('li input[type="checkbox"]');
      box.checked = true;
      fire(box, 'change');
      fire(box, 'input');
      await flush(30);
      expect($('h2').textContent).toBe('Groceries (0 left)');
      expect($('li span').className).toBe('done');

      fire($('li button'), 'click');
      await flush(30);
      expect(root(el).querySelectorAll('li')).toHaveLength(0);
      expect($('p').textContent).toBe('Nothing yet.');
    });

    it('runs the llms-full.txt user-card block', async () => {
      defineSfc(fenced(FULL, '<!-- src/user-card.lego'), 'user-card.lego');
      const el = await place('<user-card name="Ada" followers="10"></user-card>');
      let detail = null;
      el.addEventListener('follow-changed', (e) => { detail = e.detail; });
      expect(root(el).querySelector('h3').textContent).toBe('Ada');
      expect(root(el).querySelector('p').textContent).toBe('10 followers');

      fire(root(el).querySelector('button'), 'click');
      await flush(30);
      expect(root(el).querySelector('p').textContent).toBe('11 followers');
      expect(root(el).querySelector('button').textContent).toBe('Unfollow');
      expect(detail).toEqual({ following: true });
    });

    it('runs the llms-full.txt no-build counter', async () => {
      const call = FULL.match(/(Lego\.block\('counter-button'[\s\S]*?\}\);)/)[1];
      window.eval(call);
      const el = await place('<counter-button></counter-button>');
      fire(root(el).querySelector('button'), 'click');
      await flush(30);
      expect(root(el).querySelector('button').textContent).toBe('Clicked 1 times');
    });

    it('toggles a boolean attribute with :disabled', async () => {
      const el = await block('doc-save', {
        template: '<button :disabled="busy" :aria-expanded="open">Save</button>',
        logic: { busy: true, open: false }
      });
      const button = root(el).querySelector('button');
      expect(button.disabled).toBe(true);
      expect(button.getAttribute('aria-expanded')).toBe('false');
      el.state.busy = false;
      await flush(30);
      expect(button.disabled).toBe(false);
    });

    it('supports the documented alternatives', async () => {
      const el = await block('doc-alternatives', {
        template: `
          <button class="seq" @click="a = 1, b = 2">x</button>
          <i class="seq">[[ a ]]-[[ b ]]</i>
          <b class="entry" b-for="entry in Object.entries(prices)">[[ entry[0] ]]=[[ entry[1] ]]</b>
          <u class="open" b-for="t in todos.filter(t => !t.done)">[[ t.title ]]</u>
          <s class="calc">[[ total() ]]|[[ items.filter(i => i.on).length ]]|[[ user?.name ?? 'anon' ]]</s>
          <em class="idx" b-for="x in letters" @click="removeAt($index)">[[ $index ]]:[[ x ]]</em>
        `,
        logic: {
          a: 0,
          b: 0,
          prices: { tea: 2, cake: 3 },
          todos: [{ id: 1, title: 'one', done: false }, { id: 2, title: 'two', done: true }],
          items: [{ on: true }, { on: false }],
          user: null,
          letters: ['a', 'b', 'c'],
          total() { return 5; },
          removeAt(i) { this.letters.splice(i, 1); }
        }
      });
      const $$ = (sel) => [...root(el).querySelectorAll(sel)].map(n => n.textContent).join(',');
      fire(root(el).querySelector('button.seq'), 'click');
      await flush(30);
      expect($$('i.seq')).toBe('1-2');
      expect($$('b.entry')).toBe('tea=2,cake=3');
      expect($$('u.open')).toBe('one');
      expect($$('s.calc')).toBe('5|1|anon');
      expect($$('em.idx')).toBe('0:a,1:b,2:c');
      fire(root(el).querySelectorAll('em.idx')[1], 'click');
      await flush(30);
      expect($$('em.idx')).toBe('0:a,1:c');
    });
  });

  describe('documented limitations', () => {
    it('runs nothing from a handler containing a semicolon', async () => {
      quiet();
      const el = await block('doc-semicolon', {
        template: '<button @click="a = 1; b = 2">x</button><i>[[ a ]]-[[ b ]]</i>',
        logic: { a: 0, b: 0 }
      });
      fire(root(el).querySelector('button'), 'click');
      await flush(30);
      expect(root(el).querySelector('i').textContent).toBe('0-0');
    });

    it('does not render spread syntax', async () => {
      quiet();
      const el = await block('doc-spread', { template: '<i>[[ [...xs, 4].length ]]</i>', logic: { xs: [1, 2, 3] } });
      expect(root(el).querySelector('i').textContent).not.toBe('4');
    });

    it('does not loop over a destructured b-for', async () => {
      quiet();
      const el = await block('doc-destructure', {
        template: '<ul><li b-for="(x, i) in xs">[[ x ]]</li></ul>',
        logic: { xs: ['a', 'b'] }
      });
      expect([...root(el).querySelectorAll('li')].map(li => li.textContent)).not.toEqual(['a', 'b']);
    });

    it('prints a method named without parentheses as source', async () => {
      const el = await block('doc-noparens', {
        template: '<i>[[ total ]]</i>',
        logic: { total() { return 5; } }
      });
      expect(root(el).querySelector('i').textContent).toContain('return 5');
    });

    it('does not give an arrow-function method the state as this', async () => {
      quiet();
      const el = await block('doc-arrow', {
        template: '<button @click="inc()">x</button><i>[[ n ]]</i>',
        logic: { n: 0, inc: () => { try { this.n++; } catch (e) { /* this is not the state */ } } }
      });
      fire(root(el).querySelector('button'), 'click');
      await flush(30);
      expect(root(el).querySelector('i').textContent).toBe('0');
    });

    it('ignores b-if on the b-for element', async () => {
      quiet();
      const el = await block('doc-for-if', {
        template: '<ul><li b-for="x in xs" b-if="x.show">[[ x.n ]]</li></ul>',
        logic: { xs: [{ id: 1, n: 1, show: true }, { id: 2, n: 2, show: false }] }
      });
      expect(root(el).querySelectorAll('li')).toHaveLength(2);
    });

    it('iterates arrays only', async () => {
      quiet();
      const el = await block('doc-for-object', { template: '<i b-for="v in obj">[[ v ]]</i>', logic: { obj: { a: 1 } } });
      expect(root(el).querySelectorAll('i')).toHaveLength(0);
    });

    it('keeps an interpolated boolean attribute present when false', async () => {
      const el = await block('doc-bool-attr', { template: '<button disabled="[[ busy ]]">x</button>', logic: { busy: false } });
      expect(root(el).querySelector('button').disabled).toBe(true);
    });

    it('does not re-render when a Set is mutated in place', async () => {
      const el = await block('doc-set', {
        template: '<i>[[ tags.size ]]</i>',
        logic: { tags: new window.Set(['a']) }
      });
      el.state.tags.add('b');
      await flush(30);
      expect(root(el).querySelector('i').textContent).toBe('1');
      el.state.tags = new window.Set(el.state.tags).add('c');
      await flush(30);
      expect(root(el).querySelector('i').textContent).toBe('3');
    });
  });
});
