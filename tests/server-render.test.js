import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createRenderer, MAX_BLOCK_DEPTH } from '../src/server/index.js';
import { parseHTML, serialize } from '../src/server/html.js';

// Pure Node tests. No JSDOM, no bundle, no build step: these exercise
// src/server/ directly, the way tests/expression-parser.test.js exercises the
// expression compiler.

const here = path.dirname(fileURLToPath(import.meta.url));
const entry = path.resolve(here, '../src/server/index.js');

/** Render one block from a one-off renderer. */
const render = (name, definition, renderOptions, rendererOptions) => {
  const renderer = createRenderer(rendererOptions);
  renderer.define(name, definition);
  return renderer.renderToString(name, renderOptions);
};

/** The markup inside a shadow block's declarative template. */
const shadowOf = (html) => {
  const open = '<template shadowrootmode="open">';
  const start = html.indexOf(open) + open.length;
  return html.slice(start, html.lastIndexOf('</template>'));
};

describe('module purity', () => {
  it('imports in a plain Node process with no DOM globals', () => {
    const script = `import(${JSON.stringify(entry)}).then((m) => {
      if (typeof document !== 'undefined') throw new Error('document leaked in');
      if (typeof window !== 'undefined') throw new Error('window leaked in');
      if (typeof m.createRenderer !== 'function') throw new Error('no createRenderer');
      m.createRenderer().define('a-b', { template: '<p>[[ x ]]</p>', logic: { x: 1 } });
      process.stdout.write('ok');
    });`;
    const out = execFileSync(process.execPath, ['--input-type=module', '-e', script], {
      encoding: 'utf8',
      env: { ...process.env, NODE_OPTIONS: '' }
    });
    expect(out).toBe('ok');
  });

  it('reaches no DOM global from the test process either', async () => {
    const mod = await import('../src/server/index.js');
    expect(typeof mod.createRenderer).toBe('function');
    expect(typeof globalThis.document).toBe('undefined');
  });
});

describe('interpolation', () => {
  it('substitutes into text and escapes the result', () => {
    const html = render('x-text', {
      template: '<p>Hello [[ name ]], [[ count * 2 ]]</p>',
      logic: { name: '<b>Ada</b>', count: 21 }
    });
    expect(shadowOf(html)).toBe('<p>Hello &lt;b&gt;Ada&lt;/b&gt;, 42</p>');
  });

  it('substitutes into attributes and escapes for an attribute position', () => {
    const html = render('x-attr', {
      template: '<a href="/u/[[ id ]]" title="[[ label ]]" class="card [[ tone ]]">go</a>',
      logic: { id: 7, label: 'say "hi" & <bye>', tone: 'warm' }
    });
    expect(shadowOf(html)).toBe(
      '<a href="/u/7" title="say &quot;hi&quot; &amp; &lt;bye&gt;" class="card warm">go</a>'
    );
  });

  it('renders a null or undefined value as an empty string', () => {
    const html = render('x-empty', {
      template: '<p>[[ a ]][[ b ]]!</p>',
      logic: { a: null, b: undefined }
    });
    expect(shadowOf(html)).toBe('<p>!</p>');
  });

  it('honours the mustache syntax option', () => {
    const html = render(
      'x-mustache',
      { template: '<p>{{ name }} [[ name ]]</p>', logic: { name: 'Ada' } },
      {},
      { syntax: 'mustache' }
    );
    expect(shadowOf(html)).toBe('<p>Ada [[ name ]]</p>');
  });
});

describe('b-if', () => {
  it('emits the element when the condition holds', () => {
    const html = render('x-if-true', {
      template: '<p b-if="ok">yes</p>',
      logic: { ok: true }
    });
    expect(shadowOf(html)).toBe('<p b-if="ok">yes</p>');
  });

  it('emits an anchor comment carrying the expression verbatim when it does not', () => {
    const html = render('x-if-false', {
      template: '<p b-if="count > 3">yes</p>',
      logic: { count: 1 }
    });
    expect(shadowOf(html)).toBe('<!--b-if: count > 3-->');
  });
});

describe('b-show', () => {
  it('appends display none, creating the style attribute when absent', () => {
    const html = render('x-show-a', { template: '<p b-show="open">hi</p>', logic: { open: false } });
    expect(shadowOf(html)).toBe('<p b-show="open" style="display: none">hi</p>');
  });

  it('appends to an existing inline style', () => {
    const html = render('x-show-b', {
      template: '<p b-show="open" style="color: red">hi</p>',
      logic: { open: false }
    });
    expect(shadowOf(html)).toBe('<p b-show="open" style="color: red; display: none">hi</p>');
  });

  it('leaves the style alone when the condition holds', () => {
    const html = render('x-show-c', {
      template: '<p b-show="open" style="color: red">hi</p>',
      logic: { open: true }
    });
    expect(shadowOf(html)).toBe('<p b-show="open" style="color: red">hi</p>');
  });
});

describe('b-for', () => {
  it('uses the b-key path for the row key', () => {
    const html = render('x-for-key', {
      template: '<li b-for="t in tasks" b-key="slug">[[ t.title ]]</li>',
      logic: { tasks: [{ slug: 'a', title: 'One' }, { slug: 'b', title: 'Two' }] }
    });
    expect(shadowOf(html)).toBe(
      '<!--b-for: t in tasks-->' +
      '<li b-for="t in tasks" b-key="slug" data-b-key="a">One</li>' +
      '<li b-for="t in tasks" b-key="slug" data-b-key="b">Two</li>'
    );
  });

  it('falls back to the id family when no b-key is given', () => {
    const html = render('x-for-id', {
      template: '<li b-for="t in items">[[ t.n ]]</li>',
      logic: { items: [{ id: 'i1', n: 1 }, { _id: 'i2', n: 2 }, { uuid: 'i3', n: 3 }, { key: 'i4', n: 4 }] }
    });
    expect(shadowOf(html)).toMatch('data-b-key="i1"');
    expect(shadowOf(html)).toMatch('data-b-key="i2"');
    expect(shadowOf(html)).toMatch('data-b-key="i3"');
    expect(shadowOf(html)).toMatch('data-b-key="i4"');
  });

  it('keys a keyless object row by its index', () => {
    const html = render('x-for-keyless', {
      template: '<li b-for="t in items">[[ t.n ]]</li>',
      logic: { items: [{ n: 'a' }, { n: 'b' }] }
    });
    expect(shadowOf(html)).toBe(
      '<!--b-for: t in items-->' +
      '<li b-for="t in items" data-b-key="0">a</li>' +
      '<li b-for="t in items" data-b-key="1">b</li>'
    );
  });

  it('keys a primitive row by index and value', () => {
    const html = render('x-for-prims', {
      template: '<li b-for="n in nums">[[ n ]]</li>',
      logic: { nums: [10, 20] }
    });
    expect(shadowOf(html)).toBe(
      '<!--b-for: n in nums-->' +
      '<li b-for="n in nums" data-b-key="0-10">10</li>' +
      '<li b-for="n in nums" data-b-key="1-20">20</li>'
    );
  });

  it('normalizes the anchor comment to single spaces around in', () => {
    const html = render('x-for-space', {
      template: '<li b-for="  n   in    nums  ">[[ n ]]</li>',
      logic: { nums: [1] }
    });
    expect(shadowOf(html)).toContain('<!--b-for: n in nums-->');
  });

  it('emits only the anchor for an empty list', () => {
    const html = render('x-for-empty', { template: '<li b-for="n in nums">x</li>', logic: { nums: [] } });
    expect(shadowOf(html)).toBe('<!--b-for: n in nums-->');
  });

  it('exposes $index and the surrounding scope inside a row', () => {
    const html = render('x-for-index', {
      template: '<li b-for="n in nums">[[ $index ]]:[[ n ]]:[[ prefix ]]</li>',
      logic: { nums: ['a'], prefix: 'p' }
    });
    expect(shadowOf(html)).toContain('>0:a:p<');
  });

  it('nests, with the inner loop seeing the outer item', () => {
    const html = render('x-for-nested', {
      template: '<ul b-for="g in groups" b-key="id"><li b-for="m in g.members">[[ g.id ]]/[[ m ]]</li></ul>',
      logic: { groups: [{ id: 'g1', members: ['a', 'b'] }, { id: 'g2', members: ['c'] }] }
    });
    const body = shadowOf(html);
    expect(body).toContain('<!--b-for: g in groups-->');
    expect(body).toContain('<!--b-for: m in g.members-->');
    expect(body).toContain('>g1/a<');
    expect(body).toContain('>g1/b<');
    expect(body).toContain('>g2/c<');
    expect(body).toContain('data-b-key="g1"');
  });
});

describe('content directives', () => {
  it('b-text writes escaped text content from a state path', () => {
    const html = render('x-btext', {
      template: '<p b-text="user.name">placeholder</p>',
      logic: { user: { name: '<script>' } }
    });
    expect(shadowOf(html)).toBe('<p b-text="user.name">&lt;script&gt;</p>');
  });

  it('b-text reads globals through the global prefix', () => {
    const html = render(
      'x-btext-global',
      { template: '<p b-text="global.tenant"></p>', logic: {} },
      { globals: { tenant: 'acme' } }
    );
    expect(shadowOf(html)).toBe('<p b-text="global.tenant">acme</p>');
  });

  it('b-html inserts raw markup', () => {
    const html = render('x-bhtml', {
      template: '<div b-html="body"></div>',
      logic: { body: '<b>bold</b>' }
    });
    expect(shadowOf(html)).toBe('<div b-html="body"><b>bold</b></div>');
  });

  it('b-html.safe strips a script element and an onclick handler', () => {
    const html = render('x-bhtml-safe', {
      template: '<div b-html.safe="body"></div>',
      logic: { body: '<p onclick="steal()">hi</p><script>alert(1)</script><a href="javascript:x">l</a>' }
    });
    const body = shadowOf(html);
    expect(body).not.toContain('<script');
    expect(body).not.toContain('onclick');
    expect(body).not.toContain('javascript:');
    expect(body).toContain('<p>hi</p>');
    expect(body).toContain('<a>l</a>');
  });
});

describe('b-sync', () => {
  it('writes the value attribute on a text input', () => {
    const html = render('x-sync-text', {
      template: '<input type="text" b-sync="name">',
      logic: { name: 'Ada & co' }
    });
    expect(shadowOf(html)).toBe('<input type="text" b-sync="name" value="Ada &amp; co">');
  });

  it('writes checked on a checkbox by truthiness', () => {
    const on = render('x-sync-on', { template: '<input type="checkbox" b-sync="ok">', logic: { ok: true } });
    const off = render('x-sync-off', { template: '<input type="checkbox" b-sync="ok">', logic: { ok: false } });
    expect(shadowOf(on)).toBe('<input type="checkbox" b-sync="ok" checked>');
    expect(shadowOf(off)).toBe('<input type="checkbox" b-sync="ok">');
  });

  it('checks only the radio whose value matches the state', () => {
    const html = render('x-sync-radio', {
      template: '<input type="radio" value="a" b-sync="pick"><input type="radio" value="b" b-sync="pick">',
      logic: { pick: 'b' }
    });
    expect(shadowOf(html)).toBe(
      '<input type="radio" value="a" b-sync="pick">' +
      '<input type="radio" value="b" b-sync="pick" checked>'
    );
  });

  it('writes a textarea value as its text content', () => {
    const html = render('x-sync-area', { template: '<textarea b-sync="note"></textarea>', logic: { note: 'a<b' } });
    expect(shadowOf(html)).toBe('<textarea b-sync="note">a&lt;b</textarea>');
  });
});

describe('untouched directives', () => {
  it('emits event handlers, b-init, b-enter and b-leave exactly as authored', () => {
    const template =
      '<button @click="add()" @keydown.enter.prevent="go()" b-init="setup()" ' +
      'b-enter="load()" b-leave.once="save()" b-var="btn">[[ label ]]</button>';
    const html = render('x-inert', { template, logic: { label: 'Add', calls: 0 } });
    expect(shadowOf(html)).toBe(
      '<button @click="add()" @keydown.enter.prevent="go()" b-init="setup()" ' +
      'b-enter="load()" b-leave.once="save()" b-var="btn">Add</button>'
    );
  });

  it('does not run a b-init expression', () => {
    const logic = { calls: 0, bump() { this.calls += 1; } };
    render('x-inert-run', { template: '<p b-init="bump()">[[ calls ]]</p>', logic });
    expect(logic.calls).toBe(0);
  });
});

describe('state', () => {
  it('evaluates a getter on read, including one that reads other state', () => {
    const html = render('x-getter', {
      template: '<p>[[ full ]] [[ shout ]]</p>',
      logic: {
        first: 'Ada',
        last: 'Lovelace',
        get full() { return `${this.first} ${this.last}`; },
        get shout() { return this.full.toUpperCase(); }
      }
    });
    expect(shadowOf(html)).toBe('<p>Ada Lovelace ADA LOVELACE</p>');
  });

  it('calls a method with this bound to the state', () => {
    const html = render('x-method', {
      template: '<p>[[ greet("hi") ]]</p>',
      logic: { name: 'Ada', greet(word) { return `${word} ${this.name}`; } }
    });
    expect(shadowOf(html)).toBe('<p>hi Ada</p>');
  });

  it('layers props over the logic defaults', () => {
    const html = render(
      'x-props',
      { template: '<p>[[ name ]]/[[ role ]]</p>', logic: { name: 'default', role: 'user' } },
      { props: { name: 'Ada' } }
    );
    expect(shadowOf(html)).toBe('<p>Ada/user</p>');
  });

  it('never calls a lifecycle hook', () => {
    const seen = [];
    render('x-hooks', {
      template: '<p>[[ n ]]</p>',
      logic: {
        n: 1,
        mounted() { seen.push('mounted'); },
        updated() { seen.push('updated'); },
        unmounted() { seen.push('unmounted'); }
      }
    });
    expect(seen).toEqual([]);
  });

  it('reads globals and route params through the helpers', () => {
    const html = render(
      'x-ctx',
      { template: '<p>[[ global.tenant ]] [[ $route.url ]] [[ $route.params.id ]] [[ $params.id ]]</p>', logic: {} },
      { globals: { tenant: 'acme' }, route: { url: '/u/1', params: { id: '1' } } }
    );
    expect(shadowOf(html)).toBe('<p>acme /u/1 1 1</p>');
  });

  it('leaves the browser only helpers inert rather than absent', () => {
    const html = render('x-inert-helpers', {
      template: '<p>[[ $element ]][[ $go("/x") ]][[ $emit("e") ]][[ $db("k").get() ]]</p>',
      logic: {}
    });
    expect(shadowOf(html)).toBe('<p></p>');
  });
});

describe('errors', () => {
  it('renders an unknown identifier as an empty string', () => {
    const html = render('x-ref', { template: '<p>a[[ nowhere ]]b</p>', logic: {} });
    expect(shadowOf(html)).toBe('<p>ab</p>');
  });

  it('propagates a TypeError with the block name and the expression', () => {
    expect(() => render('x-throw', {
      template: '<p>[[ boom() ]]</p>',
      logic: { boom() { throw new TypeError('no good'); } }
    })).toThrow(/\[Lego SSR\] <x-throw>: failed evaluating "boom\(\)": no good/);
  });

  it('propagates a TypeError raised by a bad property read', () => {
    expect(() => render('x-throw-prop', {
      template: '<p>[[ user.name ]]</p>',
      logic: { user: null }
    })).toThrow(/<x-throw-prop>/);
  });

  it('refuses to render a block that was never defined', () => {
    const renderer = createRenderer();
    expect(() => renderer.renderToString('nope-block')).toThrow(/No block registered as "nope-block"/);
  });

  it('refuses a block name without a hyphen', () => {
    const renderer = createRenderer();
    expect(() => renderer.define('div', { template: '<p></p>' })).toThrow(/must contain a hyphen/);
  });
});

describe('block hosts and slots', () => {
  it('puts the style first inside a declarative shadow root', () => {
    const html = render(
      'x-shadow',
      { template: '<div class="w">[[ n ]]</div>', styles: 'self { display: block } .w { color: red }', logic: { n: 1 } },
      { attrs: { class: 'card' } }
    );
    expect(html).toBe(
      '<x-shadow class="card" b-hydrate b-id="x-shadow">' +
      '<template shadowrootmode="open">' +
      '<style>:host { display: block } .w { color: red }</style>' +
      '<div class="w">1</div>' +
      '</template>' +
      '</x-shadow>'
    );
  });

  it('leaves a slot element alone in a shadow block and appends the caller content', () => {
    const html = render(
      'x-shadow-slots',
      { template: '<div><slot name="header"></slot><slot></slot></div>', logic: {} },
      { slots: { default: '<p>body</p>', header: '<b>title</b>' } }
    );
    expect(html).toBe(
      '<x-shadow-slots b-hydrate b-id="x-shadow-slots">' +
      '<template shadowrootmode="open"><div><slot name="header"></slot><slot></slot></div></template>' +
      '<p>body</p><b slot="header">title</b>' +
      '</x-shadow-slots>'
    );
  });

  it('substitutes slot content inline for a light DOM block', () => {
    const html = render(
      'x-light',
      {
        template: '<header><slot name="header">no title</slot></header><main><slot>nothing</slot></main>',
        shadow: false,
        logic: {}
      },
      { slots: { default: '<p>body</p>', header: '<b>title</b>' } }
    );
    expect(html).toBe(
      '<x-light b-hydrate b-id="x-light">' +
      '<header><b>title</b></header><main><p>body</p></main>' +
      '</x-light>'
    );
  });

  it('renders slot fallback children when nothing is assigned', () => {
    const html = render('x-light-fallback', {
      template: '<header><slot name="header">[[ title ]] fallback</slot></header><main><slot>none</slot></main>',
      shadow: false,
      logic: { title: 'Default' }
    });
    expect(html).toBe(
      '<x-light-fallback b-hydrate b-id="x-light-fallback">' +
      '<header>Default fallback</header><main>none</main>' +
      '</x-light-fallback>'
    );
  });

  it('scopes a light DOM block style to the tag and marks the style element', () => {
    const styles = [
      'self { display: block }',
      '.card, .panel > p { color: red }',
      '@media (min-width: 40em) { .card, self .wide { padding: 1rem } }',
      '@keyframes fade { from { opacity: 0 } to { opacity: 1 } }',
      '@font-face { font-family: X; src: url(x.woff2) }'
    ].join('\n');
    const html = render('x-scoped', { template: '<p>hi</p>', shadow: false, styles, logic: {} });
    const expected = [
      'x-scoped { display: block }',
      'x-scoped .card, x-scoped .panel > p { color: red }',
      '@media (min-width: 40em) { x-scoped .card, x-scoped .wide { padding: 1rem } }',
      '@keyframes fade { from { opacity: 0 } to { opacity: 1 } }',
      '@font-face { font-family: X; src: url(x.woff2) }'
    ].join('\n');
    expect(html).toContain(`<style data-lego-style="x-scoped">${expected}</style>`);
  });

  it('leaves a self naming selector unprefixed rather than doubling the tag', () => {
    const html = render('x-self-only', {
      template: '<p>hi</p>',
      shadow: false,
      styles: 'self .inner { color: blue }',
      logic: {}
    });
    expect(html).toContain('>x-self-only .inner { color: blue }<');
  });

  it('does not rewrite self inside a declaration value', () => {
    const html = render('x-css-literal', {
      template: '<p>hi</p>',
      shadow: false,
      styles: 'a::after { content: "self" }',
      logic: {}
    });
    expect(html).toContain('>x-css-literal a::after { content: "self" }<');
  });

  it('keeps shadow block styles unprefixed and unmarked', () => {
    const html = render('x-shadow-css', {
      template: '<p>hi</p>',
      styles: 'self { color: blue }\n.card, .panel { color: red }',
      logic: {}
    });
    expect(html).toContain('<style>:host { color: blue }\n.card, .panel { color: red }</style>');
    expect(html).not.toContain('data-lego-style');
  });
});

describe('nested blocks', () => {
  const parent = {
    template:
      '<section>' +
      '<user-card :display-name="who" b-logic="{ tone: \'cold\' }" role="admin">' +
      '<em slot="footer">by [[ who ]]</em>' +
      '</user-card>' +
      '</section>',
    logic: { who: 'Grace' }
  };
  const child = {
    template: '<p>[[ displayName ]]/[[ tone ]]/[[ role ]]</p>',
    props: '{ role, displayName }',
    logic: { displayName: 'anon', tone: 'warm', role: 'guest' }
  };

  const nested = () => {
    const renderer = createRenderer();
    renderer.define('user-card', child);
    renderer.define('outer-shell', parent);
    return renderer.renderToString('outer-shell');
  };

  it('renders the child with props from :prop, b-logic and declared attributes', () => {
    expect(nested()).toContain('<p>Grace/cold/admin</p>');
  });

  it('marks the nested host and keeps its authored attributes', () => {
    expect(nested()).toContain(
      '<user-card :display-name="who" b-logic="{ tone: \'cold\' }" role="admin" b-hydrate b-id="user-card">'
    );
  });

  it('renders the caller content in the parent scope, after the template', () => {
    expect(nested()).toContain('</template><em slot="footer">by Grace</em></user-card>');
  });

  it('layers props in contract order, so a bound :prop wins last', () => {
    const renderer = createRenderer();
    renderer.define('leaf-order', {
      template: '<p>[[ label ]]</p>',
      props: 'label',
      logic: { label: 'from-logic' }
    });
    renderer.define('host-order', {
      template:
        '<leaf-order></leaf-order>' +
        '<leaf-order b-logic="{ label: \'from-b-logic\' }"></leaf-order>' +
        '<leaf-order b-logic="{ label: \'from-b-logic\' }" label="from-attribute"></leaf-order>' +
        '<leaf-order label="from-attribute" :label="v"></leaf-order>' +
        '<leaf-order :label="v" label="from-attribute"></leaf-order>',
      logic: { v: 'from-colon-prop' }
    });
    const labels = [...renderer.renderToString('host-order').matchAll(/<p>([^<]*)<\/p>/g)]
      .map((match) => match[1]);
    // Later source wins: logic, then b-logic, then a declared plain
    // attribute, then a bound :prop. Attribute order on the tag is
    // irrelevant, which is why the last two entries agree.
    expect(labels).toEqual([
      'from-logic',
      'from-b-logic',
      'from-attribute',
      'from-colon-prop',
      'from-colon-prop'
    ]);
  });

  it('accepts a b-logic written as a bare property list', () => {
    const renderer = createRenderer();
    renderer.define('leaf-bare', { template: '<p>[[ a ]][[ b ]]</p>', logic: { a: '', b: '' } });
    renderer.define('host-bare', { template: '<leaf-bare b-logic="a: 1, b: 2"></leaf-bare>', logic: {} });
    expect(renderer.renderToString('host-bare')).toContain('<p>12</p>');
  });

  it('resolves a b-logic expression against the parent scope', () => {
    const renderer = createRenderer();
    renderer.define('leaf-scope', { template: '<p>[[ n ]]</p>', logic: { n: 0 } });
    renderer.define('host-scope', {
      template: '<leaf-scope b-logic="{ n: base * 2 }"></leaf-scope>',
      logic: { base: 21 }
    });
    expect(renderer.renderToString('host-scope')).toContain('<p>42</p>');
  });

  it('refuses a b-logic containing template delimiters', () => {
    const renderer = createRenderer();
    renderer.define('leaf-guard', { template: '<p>[[ n ]]</p>', logic: { n: 'safe' } });
    renderer.define('host-guard', {
      template: '<leaf-guard b-logic="{ n: \'[[ evil ]]\' }"></leaf-guard>',
      logic: { evil: 'x' }
    });
    expect(renderer.renderToString('host-guard')).toContain('<p>safe</p>');
  });

  it('fills named slots inline for a nested light DOM block', () => {
    const renderer = createRenderer();
    renderer.define('light-leaf', {
      template: '<header><slot name="head">none</slot></header><main><slot></slot></main>',
      shadow: false,
      logic: {}
    });
    renderer.define('host-light', {
      template: '<light-leaf><b slot="head">[[ t ]]</b><span>body</span></light-leaf>',
      logic: { t: 'Title' }
    });
    expect(renderer.renderToString('host-light')).toBe(
      '<host-light b-hydrate b-id="host-light">' +
      '<template shadowrootmode="open">' +
      '<light-leaf b-hydrate b-id="light-leaf">' +
      '<header><b slot="head">Title</b></header><main><span>body</span></main>' +
      '</light-leaf>' +
      '</template></host-light>'
    );
  });

  it('ignores a plain attribute that is not a declared prop', () => {
    const renderer = createRenderer();
    renderer.define('leaf-one', { template: '<p>[[ title ]]</p>', logic: { title: 'default' } });
    renderer.define('host-one', { template: '<leaf-one title="ignored"></leaf-one>', logic: {} });
    expect(renderer.renderToString('host-one')).toContain('<p>default</p>');
  });

  it('renders a block named by b-mount as the element content', () => {
    const renderer = createRenderer();
    renderer.define('leaf-two', { template: '<p>leaf</p>', logic: {} });
    renderer.define('host-two', { template: '<div b-mount="which"></div>', logic: { which: 'leaf-two' } });
    const html = renderer.renderToString('host-two');
    expect(html).toContain('<div b-mount="which"><leaf-two b-hydrate b-id="leaf-two">');
  });

  it('leaves a b-mount element empty when the block is not registered', () => {
    const renderer = createRenderer();
    renderer.define('host-three', { template: '<div b-mount="which"></div>', logic: { which: 'missing-block' } });
    expect(renderer.renderToString('host-three')).toContain('<div b-mount="which"></div>');
  });

  it('stops at the depth limit and emits an empty host', () => {
    const renderer = createRenderer();
    renderer.define('deep-one', { template: '<deep-one></deep-one>', logic: {} });
    const html = renderer.renderToString('deep-one');
    const hosts = html.split('<deep-one').length - 1;
    expect(hosts).toBe(MAX_BLOCK_DEPTH + 1);
    expect(html).toContain('<deep-one b-hydrate b-id="deep-one"></deep-one>');
  });
});

describe('defineLegoFile', () => {
  const source = `
<template>
  <div class="card">
    <h2>[[ fullName ]]</h2>
    <p>[[ shout(title) ]]</p>
    <span b-if="admin">admin</span>
  </div>
</template>

<script>
  export default {
    first: 'Ada',
    last: 'Lovelace',
    title: 'countess',
    admin: false,
    get fullName() { return this.first + ' ' + this.last; },
    shout(word) { return word.toUpperCase() + '!' + this.first; }
  }
</script>

<style>
  self { display: block }
  .card { padding: 1rem }
</style>
`;

  it('registers the block under the name derived from the filename', () => {
    const renderer = createRenderer();
    renderer.defineLegoFile(source, 'user-card.lego');
    expect(renderer.has('user-card')).toBe(true);
    expect(renderer.names()).toEqual(['user-card']);
  });

  it('evaluates the script section, getters and methods included', () => {
    const renderer = createRenderer();
    renderer.defineLegoFile(source, 'UserCard.lego');
    const body = shadowOf(renderer.renderToString('user-card'));
    expect(body).toContain('<h2>Ada Lovelace</h2>');
    expect(body).toContain('<p>COUNTESS!Ada</p>');
    expect(body).toContain('<!--b-if: admin-->');
  });

  it('emits the style section first, with self rewritten', () => {
    const renderer = createRenderer();
    renderer.defineLegoFile(source, 'user-card.lego');
    const html = renderer.renderToString('user-card');
    expect(html).toContain('<template shadowrootmode="open"><style>:host { display: block }');
  });

  it('accepts props from the caller over the script defaults', () => {
    const renderer = createRenderer();
    renderer.defineLegoFile(source, 'user-card.lego');
    const body = shadowOf(renderer.renderToString('user-card', { props: { first: 'Grace' } }));
    expect(body).toContain('<h2>Grace Lovelace</h2>');
  });

  it('renders light DOM when the template declares b-shadow false', () => {
    const renderer = createRenderer();
    renderer.defineLegoFile(
      '<template b-shadow="false"><p><slot>none</slot></p></template>',
      'light-card.lego'
    );
    expect(renderer.renderToString('light-card', { slots: { default: 'hi' } }))
      .toBe('<light-card b-hydrate b-id="light-card"><p>hi</p></light-card>');
  });

  it('reports a broken script section with the block name', () => {
    const renderer = createRenderer();
    expect(() => renderer.defineLegoFile(
      '<template><p></p></template><script>export default { a: ( }</script>',
      'bad-card.lego'
    )).toThrow(/<bad-card>: failed evaluating the script section/);
  });
});

describe('html parser', () => {
  it('rejects an unclosed element, naming the block and the offset', () => {
    expect(() => parseHTML('<div><p>hi</div>', 'my-block'))
      .toThrow('[Lego SSR] my-block: closing tag </div> does not match the open <p> element at offset 10');
  });

  it('rejects an element left open at the end of the template', () => {
    expect(() => parseHTML('<section><p>hi</p>', 'my-block'))
      .toThrow('[Lego SSR] my-block: unclosed <section> element at offset 0');
  });

  it('rejects a closing tag that matches nothing', () => {
    expect(() => parseHTML('<p>hi</p></div>', 'my-block'))
      .toThrow(/closing tag <\/div> matches no open element at offset 9/);
  });

  it('rejects an unterminated attribute value', () => {
    expect(() => parseHTML('<p class="a>hi</p>', 'my-block'))
      .toThrow(/unterminated value for attribute "class"/);
  });

  it('rejects an unterminated comment', () => {
    expect(() => parseHTML('<p><!-- oops</p>', 'my-block')).toThrow(/unterminated comment at offset 3/);
  });

  it('treats a bare less than sign in text as text', () => {
    const nodes = parseHTML('<p>[[ a < b ? 1 : 2 ]]</p>', 'my-block');
    expect(nodes[0].children[0].value).toBe('[[ a < b ? 1 : 2 ]]');
  });

  it('keeps raw text elements unparsed', () => {
    const nodes = parseHTML('<style>a > b { color: red }</style>', 'my-block');
    expect(nodes[0].children[0].value).toBe('a > b { color: red }');
    expect(nodes[0].children[0].raw).toBe(true);
  });

  it('records attributes in source order, valueless ones included', () => {
    const nodes = parseHTML('<input disabled type="text" data-x=raw>', 'my-block');
    expect(nodes[0].attrs).toEqual([['disabled', null], ['type', 'text'], ['data-x', 'raw']]);
  });

  it('round trips a representative template unchanged', () => {
    const template = [
      '<div class="card" data-n="1">',
      '<!-- a note -->',
      '<h2 b-text="title"></h2>',
      '<input type="text" value="a &amp; b" disabled>',
      '<br>',
      '<ul><li b-for="x in xs" b-key="id" @click="pick(x)">[[ x.label ]]</li></ul>',
      '<style>.a { color: red }</style>',
      '<p>plain text with &quot;quotes&quot;</p>',
      '</div>'
    ].join('');
    expect(serialize(parseHTML(template, 'round-trip'))).toBe(template);
  });
});
