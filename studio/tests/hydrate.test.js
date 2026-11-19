import { describe, it, expect } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normaliseHTML, compareRenders } from '../src/hydrate/compare.js';
import { findStory, renderStoryHTML, renderAllStories } from '../src/hydrate/plugin.js';
import { declaredMarkers, validateOutput, verify, run } from '../src/cli/hydrate.js';
import {
  VIEWPORTS,
  THEMES,
  resolveViewport,
  resolveTheme,
  sizeLabel
} from '../src/manager/blocks/viewport-model.js';
import { discover } from '../src/core/discover.js';
import {
  createPreviewChannel,
  diffRows,
  runComparison,
  splitRows
} from '../src/manager/blocks/hydration-model.js';
import { PROTOCOL } from '../src/core/contracts.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES = path.join(here, '..', 'fixtures');

/**
 * The fixtures are read, never written. Anything that needs a directory of
 * its own builds one under the OS temp dir and copies the block sources in.
 */
const SOURCE_FILE = /\.(lego|stories\.js)$/;

const copyFixtures = async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'lego-studio-hydrate-'));
  const entries = await fs.readdir(FIXTURES, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isFile() || !SOURCE_FILE.test(entry.name)) continue;
    await fs.copyFile(path.join(FIXTURES, entry.name), path.join(root, entry.name));
  }
  return root;
};

const kinds = (result) => result.differences.map((entry) => entry.kind);

const find = (result, kind) => result.differences.filter((entry) => entry.kind === kind);

/* ------------------------------------------------------------------ *
 * Normalisation: what it erases
 * ------------------------------------------------------------------ */

describe('normaliseHTML erases exactly what it documents', () => {
  it('drops b-hydrate, which the client removes at snap', () => {
    const server = normaliseHTML('<ui-badge b-hydrate b-id="ui-badge"><span>hi</span></ui-badge>');
    const client = normaliseHTML('<ui-badge b-id="ui-badge"><span>hi</span></ui-badge>');
    expect(server).toBe(client);
    expect(server).not.toContain('b-hydrate');
  });

  it('sorts attributes, so source order is not a difference', () => {
    const a = normaliseHTML('<div class="x" id="y" data-z="1"></div>');
    const b = normaliseHTML('<div data-z="1" id="y" class="x"></div>');
    expect(a).toBe(b);
    expect(a.trim()).toBe('<div class="x" data-z="1" id="y"></div>');
  });

  it('treats a valueless attribute as an empty valued one', () => {
    expect(normaliseHTML('<input disabled>')).toBe(normaliseHTML('<input disabled="">'));
  });

  it('drops whitespace that sits alone between tags', () => {
    const spread = normaliseHTML('<div>\n  <span>a</span>\n\n  <span>b</span>\n</div>');
    const tight = normaliseHTML('<div><span>a</span><span>b</span></div>');
    expect(spread).toBe(tight);
  });

  it('drops b-for, b-key and data-b-key, which the client strips from every row', () => {
    const server = normaliseHTML(
      '<ul><!--b-for: item in items-->' +
      '<li b-for="item in items" b-key="id" data-b-key="1" class="row">a</li></ul>'
    );
    const client = normaliseHTML('<ul><!--b-for: item in items--><li class="row">a</li></ul>');
    expect(server).toBe(client);
    expect(server).not.toContain('data-b-key');
    expect(server).not.toContain('b-key');
  });

  it('decodes character references in attribute values', () => {
    const server = normaliseHTML('<ul b-if="a < b && c"></ul>');
    const client = normaliseHTML('<ul b-if="a &lt; b &amp;&amp; c"></ul>');
    expect(server).toBe(client);
  });

  it('decodes numeric references too, and leaves an unknown one alone', () => {
    expect(normaliseHTML('<p title="&#65;&#x42;"></p>')).toBe(normaliseHTML('<p title="AB"></p>'));
    expect(normaliseHTML('<p title="&notareference;"></p>')).toContain('&notareference;');
  });

  it('settles a literal quote and an authored &quot; on one spelling', () => {
    expect(normaliseHTML(`<p title='say "hi"'></p>`)).toBe(normaliseHTML('<p title="say &quot;hi&quot;"></p>'));
  });

  it('does not decode references in text, where escaping is the server\'s job', () => {
    expect(normaliseHTML('<p>a &lt; b</p>')).toContain('&lt;');
  });

  it('lifts a light block style out of the tree so its position cannot differ', () => {
    const inHost = normaliseHTML('<ui-badge><style data-lego-style="ui-badge">a{color:red}</style><span>x</span></ui-badge>');
    const hoisted = normaliseHTML('<ui-badge><span>x</span></ui-badge><style data-lego-style="ui-badge">a{color:red}</style>');
    expect(inHost).toBe(hoisted);
  });

  it('collapses whitespace inside a lifted light block style', () => {
    const loose = normaliseHTML('<style data-lego-style="ui-badge">a {\n  color: red;\n}</style>');
    const tight = normaliseHTML('<style data-lego-style="ui-badge">a { color: red; }</style>');
    expect(loose).toBe(tight);
  });
});

describe('normaliseHTML keeps everything else', () => {
  it('keeps whitespace inside a style element', () => {
    const out = normaliseHTML('<style>.a {\n  color: red;\n}</style>');
    expect(out).toContain('.a {\n  color: red;\n}');
  });

  it('keeps whitespace inside script, textarea and title', () => {
    expect(normaliseHTML('<script>let a = 1;\nlet b = 2;</script>')).toContain('let a = 1;\nlet b = 2;');
    expect(normaliseHTML('<textarea>  padded  </textarea>')).toContain('>  padded  <');
    expect(normaliseHTML('<title>  spaced  </title>')).toContain('>  spaced  <');
  });

  it('keeps a b-if anchor, because a missing one is a real divergence', () => {
    expect(normaliseHTML('<div><!--b-if: count > 0--></div>')).toContain('<!--b-if: count > 0-->');
  });

  it('keeps a b-for anchor, which the client does emit', () => {
    const out = normaliseHTML(
      '<ul><!--b-for: item in items--><li data-b-key="1">a</li></ul>'
    );
    expect(out).toContain('<!--b-for: item in items-->');
  });

  it('keeps a shadow root template and its style, in order', () => {
    const out = normaliseHTML('<ui-card b-hydrate><template shadowrootmode="open"><style>x{}</style><p>hi</p></template></ui-card>');
    expect(out.indexOf('shadowrootmode')).toBeLessThan(out.indexOf('<style>'));
    expect(out.indexOf('<style>')).toBeLessThan(out.indexOf('<p>'));
  });

  it('keeps the light block style marker', () => {
    expect(normaliseHTML('<ui-badge><style data-lego-style="ui-badge">a{}</style></ui-badge>'))
      .toContain('data-lego-style="ui-badge"');
  });
});

/* ------------------------------------------------------------------ *
 * Comparison
 * ------------------------------------------------------------------ */

describe('compareRenders on an identical pair', () => {
  it('reports equal with no diff and no differences', () => {
    const html = '<ui-card b-id="ui-card"><template shadowrootmode="open"><style>x{}</style><p>Hi</p></template></ui-card>';
    const result = compareRenders(html, html);
    expect(result.equal).toBe(true);
    expect(result.diff).toBe('');
    expect(result.differences).toEqual([]);
  });

  it('sees through the differences normalisation erases', () => {
    const server = '<ui-badge b-hydrate b-id="ui-badge">\n  <span class="badge" hidden>x</span>\n</ui-badge>';
    const client = '<ui-badge b-id="ui-badge"><span hidden="" class="badge">x</span></ui-badge>';
    expect(compareRenders(server, client).equal).toBe(true);
  });
});

describe('compareRenders on a real divergence', () => {
  it('names a text value the two engines disagree about', () => {
    const result = compareRenders('<p>Hello Ada</p>', '<p>Hello Grace</p>');
    expect(result.equal).toBe(false);
    expect(kinds(result)).toEqual(['text']);
    expect(find(result, 'text')[0]).toMatchObject({
      path: 'p > #text',
      server: 'Hello Ada',
      client: 'Hello Grace'
    });
    expect(result.diff).toContain('-<p>Hello Ada</p>');
    expect(result.diff).toContain('+<p>Hello Grace</p>');
  });

  it('names an attribute one side computed differently', () => {
    const result = compareRenders('<span class="badge badge--brand"></span>', '<span class="badge badge--neutral"></span>');
    expect(kinds(result)).toEqual(['attribute']);
    expect(find(result, 'attribute')[0]).toMatchObject({
      path: 'span > @class',
      server: 'badge badge--brand',
      client: 'badge badge--neutral'
    });
  });

  it('reports an attribute only one side emitted', () => {
    const result = compareRenders('<input value="7">', '<input>');
    expect(find(result, 'attribute')[0]).toMatchObject({ server: '7', client: null });
  });

  it('reports a node the client never rendered as missing', () => {
    const result = compareRenders('<ul><li>a</li><li>b</li></ul>', '<ul><li>a</li></ul>');
    expect(kinds(result)).toEqual(['missing']);
    expect(find(result, 'missing')[0]).toMatchObject({ path: 'ul > li[1]', client: null });
  });

  it('reports a node only the client rendered as extra', () => {
    const result = compareRenders('<ul><li>a</li></ul>', '<ul><li>a</li><li>b</li></ul>');
    expect(kinds(result)).toEqual(['extra']);
    expect(find(result, 'extra')[0]).toMatchObject({ path: 'ul > li[1]', server: null });
  });

  it('catches a b-if anchor the client dropped, which is the bug this exists for', () => {
    const server = '<div><!--b-if: count > 0--></div>';
    const client = '<div></div>';
    const result = compareRenders(server, client);
    expect(result.equal).toBe(false);
    expect(find(result, 'missing')[0].server).toBe('<!--b-if: count > 0-->');
  });

  it('catches an anchor whose expression drifted', () => {
    const result = compareRenders('<div><!--b-if: ready--></div>', '<div><!--b-if: isReady--></div>');
    expect(kinds(result)).toEqual(['text']);
    expect(find(result, 'text')[0]).toMatchObject({
      server: '<!--b-if: ready-->',
      client: '<!--b-if: isReady-->'
    });
  });

  it('collapses a swapped element into one element difference rather than two', () => {
    const result = compareRenders('<div><p>x</p></div>', '<div><span>x</span></div>');
    expect(kinds(result)).toEqual(['element']);
  });

  it('does not let one inserted sibling shift everything after it', () => {
    const server = '<ul><li>a</li><li>b</li><li>c</li></ul>';
    const client = '<ul><li>a</li><li>new</li><li>b</li><li>c</li></ul>';
    const result = compareRenders(server, client);
    expect(kinds(result)).toEqual(['extra']);
  });

  it('reports structure before values', () => {
    const server = '<div><p class="a">one</p><p>two</p></div>';
    const client = '<div><p class="b">ONE</p></div>';
    const result = compareRenders(server, client);
    expect(result.differences[0].kind).toBe('missing');
    expect(kinds(result)).toEqual(['missing', 'text', 'attribute']);
  });

  it('compares a style element as text rather than walking into it', () => {
    const result = compareRenders('<style>a{color:red}</style>', '<style>a{color:blue}</style>');
    expect(kinds(result)).toEqual(['text']);
  });

  it('reports a light block whose styles reached only one side', () => {
    const server = '<ui-badge><style data-lego-style="ui-badge">a{color:red}</style><span>x</span></ui-badge>';
    const client = '<ui-badge><span>x</span></ui-badge>';
    const result = compareRenders(server, client);
    expect(kinds(result)).toEqual(['element']);
    expect(find(result, 'element')[0]).toMatchObject({
      path: 'style[data-lego-style="ui-badge"]',
      client: null
    });
  });

  it('reports a light block the two engines scoped differently', () => {
    const server = '<ui-badge><style data-lego-style="ui-badge">ui-badge a{color:red}</style></ui-badge>';
    const client = '<ui-badge></ui-badge><style data-lego-style="ui-badge">ui-badge ui-badge a{color:red}</style>';
    const result = compareRenders(server, client);
    expect(kinds(result)).toEqual(['text']);
    expect(find(result, 'text')[0].path).toBe('style[data-lego-style="ui-badge"]');
  });

  it('reports a second, different stylesheet shipped under the same marker', () => {
    const server = '<ui-badge><style data-lego-style="ui-badge">a{color:red}</style></ui-badge>';
    const client = '<ui-badge><style data-lego-style="ui-badge">a{color:red}</style>' +
      '<style data-lego-style="ui-badge">b{color:red;background:blue}</style></ui-badge>';
    const result = compareRenders(server, client);
    expect(kinds(result)).toEqual(['element']);
    expect(find(result, 'element')[0]).toMatchObject({
      path: 'style[data-lego-style="ui-badge"]',
      server: null,
      client: 'b { 2 }'
    });
  });

  it('ignores the values a browser CSSOM re-spells', () => {
    const server = '<ui-badge><style data-lego-style="ui-badge">' +
      'ui-badge .badge--neutral {\n  background: #eef1f6;\n  color: #46506b;\n}</style></ui-badge>';
    const client = '<ui-badge></ui-badge><style data-lego-style="ui-badge">' +
      'ui-badge .badge--neutral { background: rgb(238, 241, 246); color: rgb(70, 80, 107); }</style>';
    expect(compareRenders(server, client).equal).toBe(true);
  });

  it('catches a declaration that went missing, which is what the count is for', () => {
    const server = '<ui-badge><style data-lego-style="ui-badge">a { color: red; background: blue; }</style></ui-badge>';
    const client = '<ui-badge></ui-badge><style data-lego-style="ui-badge">a { color: red; }</style>';
    const result = compareRenders(server, client);
    expect(kinds(result)).toEqual(['text']);
    expect(find(result, 'text')[0]).toMatchObject({
      path: 'style[data-lego-style="ui-badge"] a',
      server: '2 declaration(s)',
      client: '1 declaration(s)'
    });
  });

  it('catches a rule the two engines scoped to different selectors', () => {
    const server = '<ui-badge><style data-lego-style="ui-badge">ui-badge a { color: red; }</style></ui-badge>';
    const client = '<ui-badge></ui-badge><style data-lego-style="ui-badge">ui-badge ui-badge a { color: red; }</style>';
    expect(kinds(compareRenders(server, client))).toEqual(['text']);
  });

  it('catches a rule that only one engine emitted', () => {
    const server = '<ui-badge><style data-lego-style="ui-badge">a{color:red}b{color:blue}</style></ui-badge>';
    const client = '<ui-badge></ui-badge><style data-lego-style="ui-badge">a{color:red}</style>';
    expect(kinds(compareRenders(server, client))).toEqual(['element']);
  });

  it('tolerates the whitespace a CSSOM puts around combinators and commas', () => {
    const server = '<ui-badge><style data-lego-style="ui-badge">a>b,c+d{color:red}</style></ui-badge>';
    const client = '<ui-badge></ui-badge><style data-lego-style="ui-badge">a > b, c + d { color: red; }</style>';
    expect(compareRenders(server, client).equal).toBe(true);
  });

  it('keeps descendant spacing, which is the whitespace that means something', () => {
    const server = '<ui-badge><style data-lego-style="ui-badge">a b{color:red}</style></ui-badge>';
    const client = '<ui-badge></ui-badge><style data-lego-style="ui-badge">a.b{color:red}</style>';
    expect(compareRenders(server, client).equal).toBe(false);
  });

  it('carries a group rule condition into the preludes under it', () => {
    const server = '<ui-badge><style data-lego-style="ui-badge">@media (min-width: 600px) { a { color: red; } }</style></ui-badge>';
    const client = '<ui-badge></ui-badge><style data-lego-style="ui-badge">@media (min-width: 900px) { a { color: red; } }</style>';
    const result = compareRenders(server, client);
    expect(kinds(result)).toEqual(['text']);
    expect(find(result, 'text')[0].server).toContain('@media (min-width: 600px) > a');
  });

  it('does not miscount a semicolon inside a url or a string', () => {
    const server = '<ui-badge><style data-lego-style="ui-badge">' +
      'a { background: url(data:image/png;base64,AAA); content: "x;y"; }</style></ui-badge>';
    const client = '<ui-badge></ui-badge><style data-lego-style="ui-badge">' +
      'a { background: url(data:image/png;base64,BBB); content: "p;q"; }</style>';
    expect(compareRenders(server, client).equal).toBe(true);
  });

  it('does not care where a matching light block style sits', () => {
    const server = '<ui-badge><style data-lego-style="ui-badge">a { color: red; }</style><span>x</span></ui-badge>';
    const client = '<ui-badge><span>x</span></ui-badge><style data-lego-style="ui-badge">a {\n  color: red;\n}</style>';
    expect(compareRenders(server, client).equal).toBe(true);
  });

  it('sees a whole b-for row list as equal once the loop bookkeeping is gone', () => {
    const server = '<ul><!--b-for: t in todos-->' +
      '<li b-for="t in todos" b-key="id" data-b-key="1">one</li>' +
      '<li b-for="t in todos" b-key="id" data-b-key="2">two</li></ul>';
    const client = '<ul><!--b-for: t in todos--><li>one</li><li>two</li></ul>';
    expect(compareRenders(server, client).equal).toBe(true);
  });

  it('still catches a row the client did not render', () => {
    const server = '<ul><!--b-for: t in todos-->' +
      '<li b-for="t in todos" data-b-key="1">one</li>' +
      '<li b-for="t in todos" data-b-key="2">two</li></ul>';
    const client = '<ul><!--b-for: t in todos--><li>one</li></ul>';
    expect(kinds(compareRenders(server, client))).toEqual(['missing']);
  });
});

/* ------------------------------------------------------------------ *
 * The server half, as the panel and the build both get it
 * ------------------------------------------------------------------ */

describe('the ssr endpoint helpers', () => {
  it('finds a story by id and by bare tag', async () => {
    const manifest = await discover({ root: FIXTURES });
    expect(findStory(manifest, 'ui-button--default').block).toBe('ui-button');
    expect(findStory(manifest, 'ui-button').block).toBe('ui-button');
    expect(findStory(manifest, 'nope--nope')).toBe(null);
  });

  it('renders a story to markup carrying the hydration markers', async () => {
    const manifest = await discover({ root: FIXTURES });
    const { html, error } = renderStoryHTML(manifest, 'ui-button--default');
    expect(error).toBe(null);
    expect(html).toContain('b-hydrate');
    expect(html).toContain('<template shadowrootmode="open">');
  });

  it('reports an unknown story rather than throwing', async () => {
    const manifest = await discover({ root: FIXTURES });
    expect(renderStoryHTML(manifest, 'ui-nothing--x')).toEqual({
      html: null,
      error: 'No story "ui-nothing--x" in the manifest.'
    });
  });

  it('renders every story for the static build', async () => {
    const manifest = await discover({ root: FIXTURES });
    const all = renderAllStories(manifest);
    expect(Object.keys(all).length).toBe(21);
    expect(Object.values(all).every((entry) => typeof entry.html === 'string')).toBe(true);
  });
});

/* ------------------------------------------------------------------ *
 * The contract checks the CLI runs
 * ------------------------------------------------------------------ */

describe('validateOutput', () => {
  const story = { id: 'ui-thing--default', block: 'ui-thing' };
  const shadowManifest = {
    order: ['ui-thing'],
    blocks: { 'ui-thing': { shadow: true, css: 'x{}', template: '<p b-if="ready">hi</p>' } }
  };
  const markers = () => declaredMarkers(shadowManifest);

  it('passes markup that honours the contract', () => {
    const html = '<ui-thing b-hydrate b-id="ui-thing"><template shadowrootmode="open"><style>x{}</style><!--b-if: ready--></template></ui-thing>';
    expect(validateOutput(html, story, shadowManifest, markers())).toEqual([]);
  });

  it('flags a b-hydrate host with no definition', () => {
    const html = '<ui-ghost b-hydrate b-id="ui-ghost"></ui-ghost>';
    const found = validateOutput(html, story, shadowManifest, markers());
    expect(found.map((f) => f.rule)).toEqual(['host']);
  });

  it('flags a shadow block with no declarative template', () => {
    const html = '<ui-thing b-hydrate b-id="ui-thing"><p>hi</p></ui-thing>';
    expect(validateOutput(html, story, shadowManifest, markers())[0].rule).toBe('shadow');
  });

  it('flags a shadow block whose style is not first', () => {
    const html = '<ui-thing b-hydrate b-id="ui-thing"><template shadowrootmode="open"><p>hi</p><style>x{}</style></template></ui-thing>';
    expect(validateOutput(html, story, shadowManifest, markers())[0].rule).toBe('shadow');
  });

  it('flags a light block whose style cannot be deduplicated', () => {
    const manifest = {
      order: ['ui-lite'],
      blocks: { 'ui-lite': { shadow: false, css: 'x{}', template: '<p>hi</p>' } }
    };
    const html = '<ui-lite b-hydrate b-id="ui-lite"><style>x{}</style><p>hi</p></ui-lite>';
    const found = validateOutput(html, { id: 'ui-lite--d', block: 'ui-lite' }, manifest, declaredMarkers(manifest));
    expect(found[0].rule).toBe('light');
    expect(found[0].message).toContain('data-lego-style');
  });

  it('flags a b-for row with no anchor, and an anchor whose rows lost their keys', () => {
    const manifest = {
      order: ['ui-list'],
      blocks: { 'ui-list': { shadow: true, css: '', template: '<ul><li b-for="item in items">x</li></ul>' } }
    };
    const listStory = { id: 'ui-list--d', block: 'ui-list' };
    const orphan = '<ul><li data-b-key="1" b-for="item in items">a</li></ul>';
    expect(validateOutput(orphan, listStory, manifest, declaredMarkers(manifest))[0].rule).toBe('b-for');

    const duplicated = '<ul><!--b-for: item in items-->' +
      '<li b-for="item in items" data-b-key="1">a</li>' +
      '<li b-for="item in items" data-b-key="1">b</li></ul>';
    const found = validateOutput(duplicated, listStory, manifest, declaredMarkers(manifest));
    expect(found[0].message).toContain('two rows keyed "1"');
  });

  it('flags a marker no template declares', () => {
    const html = '<ui-thing b-hydrate b-id="ui-thing"><template shadowrootmode="open"><style>x{}</style><!--b-if: invented--></template></ui-thing>';
    expect(validateOutput(html, story, shadowManifest, markers())[0].rule).toBe('marker');
  });
});

describe('the hydrate command over the fixtures', () => {
  it('finds nothing wrong with the rendered output', async () => {
    const manifest = await discover({ root: FIXTURES });
    const { findings, stories, ok } = verify(manifest);
    expect(findings).toEqual([]);
    expect(stories.length).toBe(21);
    expect(ok).toBe(true);
  });

  it('restricts itself with --only', async () => {
    const manifest = await discover({ root: FIXTURES });
    const { stories } = verify(manifest, { only: ['ui-badge'] });
    expect(stories.every((id) => id.startsWith('ui-badge--'))).toBe(true);
  });

  it('reads no snapshots, so it works in a tree that has none', async () => {
    const root = await copyFixtures();
    const manifest = await discover({ root });
    expect(verify(manifest).ok).toBe(true);
    expect(await run({ root })).toBe(0);
  });

  it('exits 0 over the fixtures', async () => {
    const code = await run({ root: FIXTURES });
    expect(code).toBe(0);
  });
});

/* ------------------------------------------------------------------ *
 * The toolbar control's own arithmetic
 * ------------------------------------------------------------------ */

describe('the viewport picker', () => {
  it('offers the four sizes plus a custom entry', () => {
    expect(VIEWPORTS.map((entry) => entry.id)).toEqual(['responsive', 'phone', 'tablet', 'laptop', 'custom']);
    expect(THEMES).toEqual(['system', 'light', 'dark']);
  });

  it('answers a preset out of the table, copied rather than shared', () => {
    expect(resolveViewport('phone')).toMatchObject({ width: 375, height: 667 });
    expect(resolveViewport('responsive').width).toBe(null);
    const once = resolveViewport('laptop');
    once.width = 1;
    expect(resolveViewport('laptop').width).toBe(1280);
  });

  it('falls back to responsive for an id it does not know', () => {
    expect(resolveViewport('nonsense').id).toBe('responsive');
    expect(resolveViewport(undefined).id).toBe('responsive');
  });

  it('clamps a custom width instead of trusting the input', () => {
    expect(resolveViewport('custom', 10).width).toBe(160);
    expect(resolveViewport('custom', 99999).width).toBe(4000);
    expect(resolveViewport('custom', '640').width).toBe(640);
    expect(resolveViewport('custom', 640.4).width).toBe(640);
    expect(resolveViewport('custom', 'wide').width).toBe(480);
    expect(resolveViewport('custom', '').width).toBe(480);
  });

  it('names a custom width in its label', () => {
    expect(resolveViewport('custom', 900).label).toBe('Custom 900px');
  });

  it('resolves system to a concrete theme, because PROTOCOL.THEME has no third state', () => {
    expect(resolveTheme('system', true)).toBe('dark');
    expect(resolveTheme('system', false)).toBe('light');
    expect(resolveTheme('light', true)).toBe('light');
    expect(resolveTheme('dark', false)).toBe('dark');
    expect(resolveTheme('nonsense', true)).toBe('dark');
  });

  it('labels a size the way the toolbar shows it', () => {
    expect(sizeLabel(resolveViewport('responsive'))).toBe('fluid');
    expect(sizeLabel(resolveViewport('tablet'))).toBe('768 x 1024');
    expect(sizeLabel(resolveViewport('custom', 900))).toBe('900px');
    expect(sizeLabel(null)).toBe('fluid');
  });
});

/* ------------------------------------------------------------------ *
 * The panel's story id gates
 * ------------------------------------------------------------------ */

/**
 * The panel shipped with a race: it asked for the client half the instant the
 * selection changed, the preview answered with whatever it still had mounted,
 * and neither side checked the id. The result was one story's server HTML
 * compared against the previous story's DOM, which produced a correct diff, a
 * spurious diff or a spurious match depending purely on which postMessage won.
 * Both gates below are what closes it, so both are pinned here.
 */

/** A window stand-in: the message bus and the timers, and nothing else. */
const fakeWindow = () => {
  const listeners = new Set();
  return {
    addEventListener: (type, fn) => { if (type === 'message') listeners.add(fn); },
    removeEventListener: (type, fn) => listeners.delete(fn),
    setInterval: (fn, ms) => setInterval(fn, ms),
    clearInterval: (id) => clearInterval(id),
    /** Deliver a message as if it came from the preview frame. */
    deliver(data) {
      const source = { postMessage: () => {} };
      listeners.forEach((fn) => fn({ data, source }));
    },
    /** Announce a preview, so the channel has somewhere to send. */
    announce(sent) {
      const source = { postMessage: (message) => sent.push(message) };
      listeners.forEach((fn) => fn({ data: { type: PROTOCOL.READY }, source }));
    }
  };
};

describe('the preview channel', () => {
  it('ignores a reply about another story and waits for the right one', async () => {
    const win = fakeWindow();
    const channel = createPreviewChannel(win);
    const sent = [];
    win.announce(sent);

    const answer = channel.request('ui-card--default', 2000);
    win.deliver({ type: PROTOCOL.SERIALIZED, storyId: 'ui-avatar--large', html: '<ui-avatar></ui-avatar>', error: null });
    win.deliver({ type: PROTOCOL.SERIALIZED, storyId: 'ui-card--default', html: '<ui-card></ui-card>', error: null });

    const result = await answer;
    expect(result.storyId).toBe('ui-card--default');
    expect(result.html).toBe('<ui-card></ui-card>');
    channel.stop();
  });

  it('asks for the story by name, so the preview can refuse', async () => {
    const win = fakeWindow();
    const channel = createPreviewChannel(win);
    const sent = [];
    win.announce(sent);

    const answer = channel.request('ui-card--default', 1000);
    win.deliver({ type: PROTOCOL.SERIALIZED, storyId: 'ui-card--default', html: '<ui-card></ui-card>', error: null });
    await answer;

    expect(sent[0]).toMatchObject({ type: PROTOCOL.SERIALIZE, storyId: 'ui-card--default' });
    channel.stop();
  });

  it('reports the preview finishing a render, which is what drives a comparison', async () => {
    const win = fakeWindow();
    const channel = createPreviewChannel(win);
    const seen = [];
    const stop = channel.onRendered((data) => seen.push(data));

    win.deliver({ type: PROTOCOL.RENDERED, storyId: 'ui-card--default', error: null });
    expect(seen).toHaveLength(1);
    expect(seen[0].storyId).toBe('ui-card--default');

    stop();
    win.deliver({ type: PROTOCOL.RENDERED, storyId: 'ui-badge--brand', error: null });
    expect(seen).toHaveLength(1);
    channel.stop();
  });
});

describe('runComparison', () => {
  const server = (html) => async () => ({ html, error: null });
  const clientAs = (html, storyId) => async () => ({ html, error: null, storyId });

  it('refuses to diff a reply about a different story', async () => {
    const out = await runComparison('ui-card--default', {
      server: server('<ui-card b-id="ui-card"><p>server</p></ui-card>'),
      client: clientAs('<ui-avatar b-id="ui-avatar"><p>client</p></ui-avatar>', 'ui-avatar--large')
    });
    expect(out.phase).toBe('waiting');
    expect(out.differences).toEqual([]);
    expect(out.diff).toBe('');
    expect(out.message).toContain('ui-avatar--large');
    expect(out.message).toContain('ui-card--default');
  });

  it('diffs a reply about the story that was asked for', async () => {
    const out = await runComparison('ui-card--default', {
      server: server('<ui-card b-id="ui-card"><p>server</p></ui-card>'),
      client: clientAs('<ui-card b-id="ui-card"><p>client</p></ui-card>', 'ui-card--default')
    });
    expect(out.phase).toBe('diverged');
    expect(out.differences).toHaveLength(1);
  });

  it('accepts a reply that names no story, since older previews sent none', async () => {
    const out = await runComparison('ui-card--default', {
      server: server('<ui-card b-id="ui-card"><p>x</p></ui-card>'),
      client: clientAs('<ui-card b-id="ui-card"><p>x</p></ui-card>', null)
    });
    expect(out.phase).toBe('match');
  });

  it('reports an error from either half plainly', async () => {
    const out = await runComparison('ui-card--default', {
      server: async () => ({ html: '', error: 'no such story' }),
      client: clientAs('<ui-card></ui-card>', 'ui-card--default')
    });
    expect(out.phase).toBe('error');
    expect(out.message).toContain('no such story');
  });
});

describe('the diff views', () => {
  const diff = ['@@ -1,3 +1,3 @@', ' <ul>', '-  <li>a</li>', '+  <li>b</li>', ' </ul>'].join('\n');

  it('tags every unified line with what it is', () => {
    expect(diffRows(diff).map((row) => row.kind)).toEqual(['hunk', 'eq', 'del', 'ins', 'eq']);
    expect(diffRows('')).toEqual([]);
  });

  it('regroups the same rows into two columns without a second diff', () => {
    const pairs = splitRows(diffRows(diff));
    expect(pairs.map((p) => p.kind)).toEqual(['hunk', 'eq', 'change', 'eq']);
    const change = pairs.find((p) => p.kind === 'change');
    expect(change.left).toBe('  <li>a</li>');
    expect(change.right).toBe('  <li>b</li>');
  });

  it('leaves a blank facing an unpaired removal', () => {
    const rows = diffRows(['@@ -1,2 +1,1 @@', '-<a></a>', '-<b></b>', '+<a></a>'].join('\n'));
    const pairs = splitRows(rows).filter((p) => p.kind === 'change');
    expect(pairs).toHaveLength(2);
    expect(pairs[1].right).toBe(null);
  });
});
