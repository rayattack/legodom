import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { storiesFor, loadStoryFiles, mergeStories } from '../src/core/stories.js';
import { discover } from '../src/core/discover.js';
import { DEFAULT_STORY_NAME, storyId } from '../src/core/contracts.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES = path.join(here, '..', 'fixtures');

const STORY_FIELDS = ['args', 'block', 'globals', 'id', 'name', 'route', 'slots', 'source'];

/** The smallest thing storiesFor accepts, so a test can vary one field. */
const block = (overrides = {}) => ({
  tag: 'demo-block',
  file: path.join(FIXTURES, 'demo-block.lego'),
  storySections: [],
  ...overrides
});

describe('storiesFor', () => {
  it('always produces the implicit Default first', () => {
    const stories = storiesFor(block());
    expect(stories).toHaveLength(1);
    expect(stories[0]).toEqual({
      id: 'demo-block--default',
      block: 'demo-block',
      name: DEFAULT_STORY_NAME,
      args: {},
      slots: {},
      globals: {},
      route: null,
      source: 'implicit'
    });
  });

  it('gives every story the fields the contract names', () => {
    const stories = storiesFor(block({
      storySections: [{ name: 'Loading', args: '{ loading: true }', globals: '', slotHTML: '' }]
    }));
    stories.forEach((story) => {
      expect(Object.keys(story).sort()).toEqual(STORY_FIELDS);
    });
  });

  it('evaluates args and globals as expressions, not JSON', () => {
    const [, loading] = storiesFor(block({
      storySections: [{
        name: 'Loading',
        args: "{ loading: true, retries: 1 + 1, label: 'Fetching' }",
        globals: '{ theme: "dark" }',
        slotHTML: ''
      }]
    }));
    expect(loading.args).toEqual({ loading: true, retries: 2, label: 'Fetching' });
    expect(loading.globals).toEqual({ theme: 'dark' });
    expect(loading.source).toBe('lego');
  });

  it('records an unevaluable args expression instead of throwing', () => {
    const errors = [];
    const stories = storiesFor(block({
      storySections: [{ name: 'Broken', args: '{ oops: ', globals: '', slotHTML: '' }]
    }), errors);
    expect(stories).toHaveLength(2);
    expect(stories[1].args).toEqual({});
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('Broken');
  });

  it('puts a story body in the default slot', () => {
    const [, story] = storiesFor(block({
      storySections: [{ name: 'Filled', args: '', globals: '', slotHTML: '<p>Hello</p>' }]
    }));
    expect(story.slots).toEqual({ '': '<p>Hello</p>' });
  });

  it('splits top level slot attributes into named slots', () => {
    const [, story] = storiesFor(block({
      storySections: [{
        name: 'Split',
        args: '',
        globals: '',
        slotHTML: '<h3 slot="header">Title</h3><p>Body</p><small slot="footer">Foot</small>'
      }]
    }));
    expect(story.slots).toEqual({
      header: '<h3 slot="header">Title</h3>',
      footer: '<small slot="footer">Foot</small>',
      '': '<p>Body</p>'
    });
  });

  it('leaves a body with no slot attributes entirely in the default slot', () => {
    const [, story] = storiesFor(block({
      storySections: [{
        name: 'Plain',
        args: '',
        globals: '',
        slotHTML: '<p>One</p>\n  <p>Two</p>'
      }]
    }));
    expect(Object.keys(story.slots)).toEqual(['']);
    expect(story.slots['']).toContain('<p>One</p>');
    expect(story.slots['']).toContain('<p>Two</p>');
  });

  it('lets an authored Default replace the implicit one', () => {
    const stories = storiesFor(block({
      storySections: [{ name: 'Default', args: '{ open: true }', globals: '', slotHTML: '' }]
    }));
    expect(stories).toHaveLength(1);
    expect(stories[0].source).toBe('lego');
    expect(stories[0].id).toBe(storyId('demo-block', DEFAULT_STORY_NAME));
    expect(stories[0].args).toEqual({ open: true });
  });

  it('suffixes ids whose names slug the same', () => {
    const stories = storiesFor(block({
      storySections: [
        { name: 'Is Loading', args: '', globals: '', slotHTML: '' },
        { name: 'is loading', args: '', globals: '', slotHTML: '' },
        { name: 'IS-LOADING', args: '', globals: '', slotHTML: '' }
      ]
    }));
    expect(stories.map((story) => story.id)).toEqual([
      'demo-block--default',
      'demo-block--is-loading',
      'demo-block--is-loading-2',
      'demo-block--is-loading-3'
    ]);
    expect(new Set(stories.map((story) => story.id)).size).toBe(stories.length);
  });
});

describe('mergeStories', () => {
  const implicit = {
    id: '', block: 'demo-block', name: 'Default', args: {}, slots: {},
    globals: {}, route: null, source: 'implicit'
  };

  it('keeps the implicit story when nothing overrides it', () => {
    const merged = mergeStories('demo-block', [implicit], []);
    expect(merged.map((story) => story.source)).toEqual(['implicit']);
  });

  it('drops the implicit story for a file story named Default', () => {
    const fromFile = {
      id: '', block: '', name: 'Default', args: { a: 1 }, slots: {},
      globals: {}, route: null, source: 'file'
    };
    const merged = mergeStories('demo-block', [implicit], [fromFile]);
    expect(merged).toHaveLength(1);
    expect(merged[0].source).toBe('file');
    expect(merged[0].id).toBe('demo-block--default');
  });

  it('stamps the block onto every story', () => {
    const merged = mergeStories('other-block', [implicit]);
    expect(merged[0].block).toBe('other-block');
  });
});

describe('loadStoryFiles', () => {
  let root;

  beforeAll(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'lego-studio-stories-'));
  });

  afterAll(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  const withStoryFile = async (name, source) => {
    const lego = path.join(root, `${name}.lego`);
    await fs.writeFile(lego, '<template><p>x</p></template>', 'utf8');
    if (source !== null) {
      await fs.writeFile(path.join(root, `${name}.stories.js`), source, 'utf8');
    }
    return { tag: name, file: lego, storySections: [] };
  };

  it('returns nothing when there is no sibling file', async () => {
    const target = await withStoryFile('lonely-block', null);
    expect(await loadStoryFiles(target)).toEqual([]);
  });

  it('reads the keyed object form', async () => {
    const target = await withStoryFile('keyed-block', `
      export default {
        Loading: { args: { loading: true } },
        Empty: { args: { items: [] }, slots: { default: '<p>none</p>' } }
      };
    `);
    const stories = await loadStoryFiles(target);
    expect(stories.map((story) => story.name)).toEqual(['Loading', 'Empty']);
    expect(stories.map((story) => story.id)).toEqual([
      'keyed-block--loading',
      'keyed-block--empty'
    ]);
    expect(stories[0].source).toBe('file');
    expect(stories[1].slots).toEqual({ '': '<p>none</p>' });
  });

  it('reads the array form and keeps its ordering', async () => {
    const target = await withStoryFile('listed-block', `
      export default [
        { name: 'Second', args: { n: 2 } },
        { name: 'First', args: { n: 1 }, route: { url: '/first' } }
      ];
    `);
    const stories = await loadStoryFiles(target);
    expect(stories.map((story) => story.name)).toEqual(['Second', 'First']);
    expect(stories[1].route).toEqual({ url: '/first' });
  });

  it('names the module it loaded so discovery need not guess the convention', async () => {
    const target = await withStoryFile('named-block', 'export default { One: {} };');
    const loaded = [];
    await loadStoryFiles(target, [], loaded);
    expect(loaded).toEqual([path.join(root, 'named-block.stories.js')]);
  });

  it('names nothing when there is no module to load', async () => {
    const target = await withStoryFile('silent-block', null);
    const loaded = [];
    await loadStoryFiles(target, [], loaded);
    expect(loaded).toEqual([]);
  });

  it('records a story file that will not load', async () => {
    const target = await withStoryFile('bad-block', 'export default {');
    const errors = [];
    expect(await loadStoryFiles(target, errors)).toEqual([]);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('bad-block.stories.js');
  });

  it('records a story file with no usable default export', async () => {
    const target = await withStoryFile('naked-block', 'export const nope = 1;');
    const errors = [];
    expect(await loadStoryFiles(target, errors)).toEqual([]);
    expect(errors[0]).toContain('default export');
  });
});

describe('story precedence in a real manifest', () => {
  it('orders implicit, then lego sections, then file stories', async () => {
    const manifest = await discover({ root: FIXTURES });
    expect(manifest.blocks['ui-stat'].stories.map((story) => [story.name, story.source])).toEqual([
      ['Default', 'implicit'],
      ['Revenue', 'file'],
      ['Churn', 'file'],
      ['Flat week', 'file']
    ]);
    expect(manifest.blocks['ui-button'].stories.map((story) => story.source)).toEqual([
      'implicit', 'lego', 'lego', 'lego'
    ]);
  });

  it('keeps story ids unique inside every block', async () => {
    const manifest = await discover({ root: FIXTURES });
    manifest.order.forEach((tag) => {
      const ids = manifest.blocks[tag].stories.map((story) => story.id);
      expect(new Set(ids).size).toBe(ids.length);
      ids.forEach((id) => expect(id.startsWith(`${tag}--`)).toBe(true));
    });
  });
});
