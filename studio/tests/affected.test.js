import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { buildGraph } from '../src/graph/build.js';
import { affectedBlocks, tagsForFiles, affectedStories, unboundedFiles } from '../src/graph/affected.js';
import { changedFiles } from '../src/graph/git.js';
import { storyId } from '../src/core/contracts.js';

const exec = promisify(execFile);

/**
 * The fixture root sits under the working directory on purpose. A caller
 * passing what git printed hands over repository relative paths, so the tests
 * have to be able to write the same path both ways and get the same answer.
 */
const ROOT = path.resolve('studio-fixture-blocks');
const rel = (...parts) => path.relative(process.cwd(), path.join(ROOT, ...parts));

const story = (tag, name) => ({
  id: storyId(tag, name),
  block: tag,
  name,
  args: {},
  slots: {},
  globals: {},
  route: null,
  source: name === 'Default' ? 'implicit' : 'lego'
});

const block = (tag, children = [], stories = ['Default'], storyFiles = []) => ({
  tag,
  file: path.join(ROOT, `${tag}.lego`),
  relFile: `${tag}.lego`,
  shadow: true,
  form: false,
  template: '',
  css: '',
  script: '',
  propsAttr: '',
  props: [],
  stateKeys: [],
  methodKeys: [],
  emits: [],
  slots: [],
  children,
  storyFiles,
  stories: stories.map(name => story(tag, name))
});

const manifest = (blocks) => ({
  root: ROOT,
  blocks: Object.fromEntries(blocks.map(b => [b.tag, b])),
  order: blocks.map(b => b.tag).sort(),
  errors: []
});

/** page-home -> user-card -> ui-button -> icon-glyph, four levels deep. */
const chain = () => manifest([
  block('page-home', ['user-card']),
  block('user-card', ['ui-button'], ['Default', 'Loading']),
  block('ui-button', ['icon-glyph']),
  block('icon-glyph')
]);

const ids = (stories) => stories.map(s => s.id);

describe('affectedBlocks', () => {
  it('walks every level up from a changed leaf', () => {
    const graph = buildGraph(chain());
    expect(affectedBlocks(graph, ['icon-glyph']))
      .toEqual(['icon-glyph', 'page-home', 'ui-button', 'user-card']);
  });

  it('stops where the composition stops', () => {
    const graph = buildGraph(chain());
    expect(affectedBlocks(graph, ['user-card'])).toEqual(['page-home', 'user-card']);
    expect(affectedBlocks(graph, ['page-home'])).toEqual(['page-home']);
  });

  it('unions and sorts several changed tags', () => {
    const graph = buildGraph(chain());
    expect(affectedBlocks(graph, ['ui-button', 'ui-button', 'user-card']))
      .toEqual(['page-home', 'ui-button', 'user-card']);
  });

  it('keeps a tag the graph has never seen', () => {
    const graph = buildGraph(chain());
    expect(affectedBlocks(graph, ['brand-new'])).toEqual(['brand-new']);
  });

  it('returns nothing for nothing', () => {
    expect(affectedBlocks(buildGraph(chain()), [])).toEqual([]);
  });

  it('terminates on a recursive block', () => {
    const graph = buildGraph(manifest([
      block('comment-item', ['comment-list']),
      block('comment-list', ['comment-item']),
      block('tree-node', ['tree-node']),
      block('page-home', ['comment-list', 'tree-node'])
    ]));
    expect(affectedBlocks(graph, ['comment-item']))
      .toEqual(['comment-item', 'comment-list', 'page-home']);
    expect(affectedBlocks(graph, ['tree-node'])).toEqual(['page-home', 'tree-node']);
  });
});

describe('tagsForFiles', () => {
  it('matches an absolute path', () => {
    expect(tagsForFiles(chain(), [path.join(ROOT, 'ui-button.lego')])).toEqual(['ui-button']);
  });

  it('matches a path relative to the working directory, which is what git prints', () => {
    expect(tagsForFiles(chain(), [rel('ui-button.lego')])).toEqual(['ui-button']);
  });

  it('matches through dot and parent segments', () => {
    expect(tagsForFiles(chain(), [`./${rel('ui-button.lego')}`])).toEqual(['ui-button']);
    expect(tagsForFiles(chain(), [path.join(ROOT, 'nested', '..', 'ui-button.lego')]))
      .toEqual(['ui-button']);
    expect(tagsForFiles(chain(), [rel('nested', '..', 'ui-button.lego')])).toEqual(['ui-button']);
  });

  it('does not resolve a caller path against the manifest root', () => {
    // The old bug: `ui-button.lego` became `<root>/ui-button.lego` only because
    // the root was prepended, which turns any repository relative path from git
    // into `<root>/<root>/...` and matches nothing at all.
    expect(tagsForFiles(chain(), ['ui-button.lego'])).toEqual([]);
  });

  it('returns tags in manifest order', () => {
    expect(tagsForFiles(chain(), [rel('user-card.lego'), rel('icon-glyph.lego')]))
      .toEqual(['icon-glyph', 'user-card']);
  });

  it('reports nothing matched when nothing matched', () => {
    expect(tagsForFiles(chain(), ['somewhere/else.lego'])).toEqual([]);
    expect(tagsForFiles(chain(), [path.join(ROOT, 'never-scanned.lego')])).toEqual([]);
    expect(tagsForFiles(chain(), [])).toEqual([]);
  });

  it('does not match a story module', () => {
    const m = manifest([block('ui-button', [], ['Default'], [path.join(ROOT, 'ui-button.stories.js')])]);
    expect(tagsForFiles(m, [path.join(ROOT, 'ui-button.stories.js')])).toEqual([]);
    expect(tagsForFiles(m, [path.join(ROOT, 'ui-button.lego')])).toEqual(['ui-button']);
  });
});

describe('affectedStories', () => {
  const m = chain();
  const graph = buildGraph(m);

  it('treats null as everything, because null means git could not tell us', () => {
    expect(ids(affectedStories(m, graph, null))).toEqual([
      'icon-glyph--default',
      'page-home--default',
      'ui-button--default',
      'user-card--default',
      'user-card--loading'
    ]);
    expect(affectedStories(m, graph, undefined).length).toBe(5);
  });

  it('treats an empty list as nothing changed', () => {
    expect(affectedStories(m, graph, [])).toEqual([]);
  });

  it('returns every story of every block above a changed leaf', () => {
    expect(ids(affectedStories(m, graph, [path.join(ROOT, 'ui-button.lego')]))).toEqual([
      'page-home--default',
      'ui-button--default',
      'user-card--default',
      'user-card--loading'
    ]);
  });

  it('does not reach down to blocks the change cannot touch', () => {
    const out = ids(affectedStories(m, graph, [path.join(ROOT, 'user-card.lego')]));
    expect(out).toEqual(['page-home--default', 'user-card--default', 'user-card--loading']);
    expect(out).not.toContain('icon-glyph--default');
  });

  it('narrows the same way from a repository relative path', () => {
    expect(ids(affectedStories(m, graph, [rel('ui-button.lego')]))).toEqual([
      'page-home--default',
      'ui-button--default',
      'user-card--default',
      'user-card--loading'
    ]);
  });

  it('falls back to the naming convention when storyFiles is empty', () => {
    expect(ids(affectedStories(m, graph, [path.join(ROOT, 'ui-button.stories.js')]))).toEqual([
      'page-home--default',
      'ui-button--default',
      'user-card--default',
      'user-card--loading'
    ]);
  });

  it('matches a story module by its recorded path, whatever it is called', () => {
    const odd = path.join(ROOT, 'stories', 'button-variants.js');
    const withFiles = manifest([
      block('page-home', ['ui-button']),
      block('ui-button', [], ['Default', 'Ghost'], [odd])
    ]);
    const g = buildGraph(withFiles);
    expect(ids(affectedStories(withFiles, g, [odd])))
      .toEqual(['page-home--default', 'ui-button--default', 'ui-button--ghost']);
    expect(ids(affectedStories(withFiles, g, [path.relative(process.cwd(), odd)])))
      .toEqual(['page-home--default', 'ui-button--default', 'ui-button--ghost']);
  });

  it('fails safe on a story module that belongs to no block', () => {
    const withFiles = manifest([
      block('ui-button', [], ['Default'], [path.join(ROOT, 'stories', 'button.js')]),
      block('ui-badge')
    ]);
    const g = buildGraph(withFiles);
    // Narrowing would return the one button story; the orphan module cannot be
    // placed, so both blocks come back instead.
    expect(ids(affectedStories(withFiles, g, [path.join(ROOT, 'stories', 'button.js')])))
      .toEqual(['ui-button--default']);
    expect(ids(affectedStories(withFiles, g, [path.join(ROOT, 'stories', 'other.js')])))
      .toEqual(['ui-badge--default', 'ui-button--default']);
  });

  it('fails safe on a story file for a tag the scan never found', () => {
    // A deleted block, or one outside the include glob that something inside
    // it still composes. Either way the graph cannot bound the change.
    expect(affectedStories(m, graph, [path.join(ROOT, 'nothing-here.stories.js')]).length).toBe(5);
  });

  it('fails safe on a block file the manifest does not know', () => {
    expect(affectedStories(m, graph, ['/app/legacy/deleted-block.lego']).length).toBe(5);
  });

  it('fails safe: an unknown file means everything is affected', () => {
    expect(affectedStories(m, graph, ['/app/styles/global.css']).length).toBe(5);
    expect(affectedStories(m, graph, ['/repo/src/core/renderer.js']).length).toBe(5);
    expect(affectedStories(m, graph, ['/app/package.json']).length).toBe(5);
  });

  it('fails safe even when the unknown file arrives beside a known one', () => {
    const out = affectedStories(m, graph, [path.join(ROOT, 'icon-glyph.lego'), '/app/vite.config.js']);
    expect(out.length).toBe(5);
  });

  it('returns stories in manifest order', () => {
    const out = affectedStories(m, graph, [path.join(ROOT, 'icon-glyph.lego')]);
    expect(out.map(s => s.block)).toEqual([
      'icon-glyph', 'page-home', 'ui-button', 'user-card', 'user-card'
    ]);
  });

  it('hands back the story objects themselves, not copies', () => {
    const out = affectedStories(m, graph, [path.join(ROOT, 'icon-glyph.lego')]);
    expect(out[0]).toBe(m.blocks['icon-glyph'].stories[0]);
  });
});

describe('unboundedFiles', () => {
  const m = chain();

  it('names the files that force a full run', () => {
    expect(unboundedFiles(m, [
      path.join(ROOT, 'ui-button.lego'),
      '/app/styles/global.css',
      path.join(ROOT, 'ui-button.stories.js')
    ])).toEqual(['/app/styles/global.css']);
  });

  it('is empty when every changed file maps to a block', () => {
    expect(unboundedFiles(m, [
      path.join(ROOT, 'ui-button.lego'),
      path.join(ROOT, 'user-card.stories.js')
    ])).toEqual([]);
    expect(unboundedFiles(m, [])).toEqual([]);
  });

  it('flags a block file the manifest has never seen', () => {
    expect(unboundedFiles(m, ['/app/legacy/gone.lego'])).toEqual(['/app/legacy/gone.lego']);
  });

  it('has nothing to blame when the change set itself is unknown', () => {
    expect(unboundedFiles(m, null)).toBe(null);
    expect(unboundedFiles(m, undefined)).toBe(null);
  });

  it('names a path that matched no block, in the form the caller wrote it', () => {
    expect(unboundedFiles(m, [rel('never-scanned.lego')])).toEqual([rel('never-scanned.lego')]);
  });

  it('does not name an entry that was never a usable path', () => {
    // Garbage in the change set says nothing about the project, so it is not
    // offered up as the culprit. It still widens the answer rather than being
    // dropped, which would narrow a run on a caller error.
    for (const junk of [42, '', null, { file: 'x.lego' }]) {
      const files = [path.join(ROOT, 'ui-button.lego'), junk];
      expect(unboundedFiles(m, files)).toEqual([]);
      expect(affectedStories(m, buildGraph(m), files).length).toBe(5);
    }
  });

  it('has nothing to blame when the change set is not a list', () => {
    expect(unboundedFiles(m, 'ui-button.lego')).toBe(null);
    expect(affectedStories(m, buildGraph(m), 'ui-button.lego').length).toBe(5);
  });

  it('agrees with what affectedStories decided', () => {
    const graph = buildGraph(m);
    const files = [path.join(ROOT, 'icon-glyph.lego'), '/app/tokens.css'];
    expect(unboundedFiles(m, files)).toEqual(['/app/tokens.css']);
    expect(affectedStories(m, graph, files).length).toBe(5);
  });
});

describe('changedFiles', () => {
  let dir;

  beforeAll(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'lego-studio-graph-'));
  });

  afterAll(async () => {
    if (dir) await fs.rm(dir, { recursive: true, force: true });
  });

  it('means everything when asked for everything', async () => {
    expect(await changedFiles({ root: dir, all: true })).toBe(null);
  });

  it('means everything outside a git repository', async () => {
    const plain = await fs.mkdtemp(path.join(os.tmpdir(), 'lego-studio-nogit-'));
    try {
      expect(await changedFiles({ root: plain })).toBe(null);
    } finally {
      await fs.rm(plain, { recursive: true, force: true });
    }
  });

  it('reports absolute paths for a real repository', async () => {
    const repo = await fs.mkdtemp(path.join(os.tmpdir(), 'lego-studio-repo-'));
    try {
      const git = (...args) => exec('git', args, { cwd: repo });
      await git('init', '--quiet');
      await git('config', 'user.email', 'studio@example.test');
      await git('config', 'user.name', 'Studio');
      await fs.writeFile(path.join(repo, 'first.lego'), '<template b-id="a-one"></template>');
      await git('add', '.');
      await git('commit', '--quiet', '-m', 'first');
      await fs.writeFile(path.join(repo, 'second.lego'), '<template b-id="b-two"></template>');

      const files = await changedFiles({ root: repo, base: 'HEAD' });
      expect(files).not.toBe(null);
      expect(files.every(file => path.isAbsolute(file))).toBe(true);
      expect(files.some(file => path.basename(file) === 'second.lego')).toBe(true);
    } finally {
      await fs.rm(repo, { recursive: true, force: true });
    }
  });

  it('means everything when the named base does not resolve', async () => {
    const repo = await fs.mkdtemp(path.join(os.tmpdir(), 'lego-studio-base-'));
    try {
      const git = (...args) => exec('git', args, { cwd: repo });
      await git('init', '--quiet');
      await git('config', 'user.email', 'studio@example.test');
      await git('config', 'user.name', 'Studio');
      await fs.writeFile(path.join(repo, 'first.lego'), '<template b-id="a-one"></template>');
      await git('add', '.');
      await git('commit', '--quiet', '-m', 'first');

      expect(await changedFiles({ root: repo, base: 'no/such/ref' })).toBe(null);
    } finally {
      await fs.rm(repo, { recursive: true, force: true });
    }
  });
});
