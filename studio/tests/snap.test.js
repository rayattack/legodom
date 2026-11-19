import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { discover } from '../src/core/discover.js';
import { createStoryRenderer, formatHTML } from '../src/core/render.js';
import { unifiedDiff } from '../src/core/diff.js';
import { run, snapshot } from '../src/cli/snap.js';
import { SNAPSHOT_DIR } from '../src/core/contracts.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES = path.join(here, '..', 'fixtures');

/**
 * Copy the fixture sources into a scratch directory.
 *
 * Only the block sources travel. `studio/fixtures/__snapshots__` is a real
 * committed artifact, and bringing it along would hand every test a baseline
 * it did not create, so a run that should report `added` would report
 * `unchanged` the moment somebody regenerated the demo. Nothing in this file
 * writes anywhere inside the fixtures directory.
 */
const SOURCE_FILE = /\.(lego|stories\.js)$/;

const copyFixtures = async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'lego-studio-snap-'));
  const entries = await fs.readdir(FIXTURES, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isFile() || !SOURCE_FILE.test(entry.name)) continue;
    await fs.copyFile(path.join(FIXTURES, entry.name), path.join(root, entry.name));
  }
  return root;
};

const statuses = (results) => results.map((entry) => `${entry.status} ${entry.storyId}`);

const byStatus = (results, status) => results.filter((entry) => entry.status === status);

/**
 * The per-story lines of a run, told apart from the tally line that follows
 * them by the `block--slug` id every story line carries second.
 */
const storyLines = (lines, status) =>
  lines.filter((line) => new RegExp(`^${status} \\S+--\\S+ `).test(line));

const exec = promisify(execFile);

/**
 * A repository whose branch name is pinned, so the base git picks is the same
 * one on every machine, and whose identity is set inline so a contributor's
 * global git config cannot make the commit fail.
 */
const git = (root, args) => exec('git', [
  '-c', 'user.email=studio@example.com',
  '-c', 'user.name=Studio',
  '-c', 'commit.gpgsign=false',
  ...args
], { cwd: root });

const initRepo = async (root) => {
  await git(root, ['init', '-q']);
  await git(root, ['symbolic-ref', 'HEAD', 'refs/heads/main']);
  await git(root, ['add', '.']);
  await git(root, ['commit', '-qm', 'fixtures']);
};

const commitAll = async (root, message) => {
  await git(root, ['add', '.']);
  await git(root, ['commit', '-qm', message]);
};

describe('unifiedDiff', () => {
  it('returns nothing for identical text', () => {
    expect(unifiedDiff('a\nb\nc\n', 'a\nb\nc\n')).toBe('');
    expect(unifiedDiff('', '')).toBe('');
  });

  it('reports an insertion', () => {
    const diff = unifiedDiff('a\nb\nc', 'a\nb\nnew\nc');
    expect(diff).toBe([
      '@@ -1,3 +1,4 @@',
      ' a',
      ' b',
      '+new',
      ' c'
    ].join('\n'));
  });

  it('reports a deletion', () => {
    const diff = unifiedDiff('a\nb\ngone\nc', 'a\nb\nc');
    expect(diff).toBe([
      '@@ -1,4 +1,3 @@',
      ' a',
      ' b',
      '-gone',
      ' c'
    ].join('\n'));
  });

  it('reports a replacement as a delete then an insert', () => {
    const diff = unifiedDiff('a\nold\nc', 'a\nnew\nc');
    expect(diff).toBe([
      '@@ -1,3 +1,3 @@',
      ' a',
      '-old',
      '+new',
      ' c'
    ].join('\n'));
  });

  it('holds changes to three lines of context by default', () => {
    const before = Array.from({ length: 20 }, (_, i) => `line ${i}`).join('\n');
    const after = before.replace('line 10', 'line ten');
    const diff = unifiedDiff(before, after);
    const lines = diff.split('\n');
    expect(lines[0]).toBe('@@ -8,7 +8,7 @@');
    expect(lines.filter((line) => line.startsWith(' '))).toHaveLength(6);
    expect(lines).toContain('-line 10');
    expect(lines).toContain('+line ten');
  });

  it('emits one hunk per distant change', () => {
    const before = Array.from({ length: 40 }, (_, i) => `line ${i}`).join('\n');
    const after = before.replace('line 2', 'two').replace('line 30', 'thirty');
    const headers = unifiedDiff(before, after).split('\n').filter((line) => line.startsWith('@@'));
    expect(headers).toHaveLength(2);
  });

  it('merges hunks whose context overlaps', () => {
    const before = Array.from({ length: 20 }, (_, i) => `line ${i}`).join('\n');
    const after = before.replace('line 5', 'five').replace('line 7', 'seven');
    const headers = unifiedDiff(before, after).split('\n').filter((line) => line.startsWith('@@'));
    expect(headers).toHaveLength(1);
  });

  it('numbers a pure insertion into empty text from zero', () => {
    expect(unifiedDiff('', 'only\n')).toBe(['@@ -0,0 +1,1 @@', '+only'].join('\n'));
  });

  it('honours a custom context width', () => {
    const before = 'a\nb\nc\nd\ne';
    const after = 'a\nb\nC\nd\ne';
    expect(unifiedDiff(before, after, { context: 1 })).toBe([
      '@@ -2,3 +2,3 @@',
      ' b',
      '-c',
      '+C',
      ' d'
    ].join('\n'));
  });
});

describe('render determinism', () => {
  it('renders every story byte identically twice', async () => {
    const first = await discover({ root: FIXTURES });
    const second = await discover({ root: FIXTURES });
    const a = createStoryRenderer(first);
    const b = createStoryRenderer(second);

    first.order.forEach((tag) => {
      first.blocks[tag].stories.forEach((story, index) => {
        const left = formatHTML(a.render(story));
        const right = formatHTML(b.render(second.blocks[tag].stories[index]));
        expect(right, `${story.id} differed between runs`).toBe(left);
      });
    });
  });

  it('renders the same story twice on one renderer identically', async () => {
    const manifest = await discover({ root: FIXTURES });
    const { render } = createStoryRenderer(manifest);
    const story = manifest.blocks['ui-panel'].stories.at(-1);
    expect(render(story)).toBe(render(story));
  });
});

describe('formatHTML', () => {
  it('indents by depth and puts each tag on its own line', () => {
    expect(formatHTML('<div><p>hi</p><span>there</span></div>')).toBe([
      '<div>',
      '  <p>hi</p>',
      '  <span>there</span>',
      '</div>',
      ''
    ].join('\n'));
  });

  it('leaves void elements alone', () => {
    expect(formatHTML('<div><br><img src="a.png"></div>')).toBe([
      '<div>',
      '  <br>',
      '  <img src="a.png">',
      '</div>',
      ''
    ].join('\n'));
  });

  it('never breaks a raw text element', () => {
    const out = formatHTML('<div><style>.a { color: red }</style></div>');
    expect(out).toContain('  <style>.a { color: red }</style>');
  });

  it('is stable under a second pass', () => {
    const once = formatHTML('<div><p>hi</p><span>there</span></div>');
    expect(formatHTML(once)).toBe(once);
  });
});

describe('snapshot', () => {
  let root;

  beforeEach(async () => {
    root = await copyFixtures();
  });

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  it('adds every snapshot on the first run and finds them unchanged on the second', async () => {
    const manifest = await discover({ root });
    const first = await snapshot(manifest, {});
    expect(first.ok).toBe(true);
    expect(byStatus(first.results, 'added')).toHaveLength(first.results.length);

    const written = await fs.readFile(
      path.join(root, SNAPSHOT_DIR, 'ui-button', 'default.html'), 'utf8'
    );
    expect(written).toContain('<ui-button');

    const second = await snapshot(await discover({ root }), {});
    expect(second.ok).toBe(true);
    expect(byStatus(second.results, 'unchanged')).toHaveLength(second.results.length);
  });

  it('writes nothing in check mode and reports what is missing', async () => {
    const manifest = await discover({ root });
    const { results, ok } = await snapshot(manifest, { check: true });
    expect(ok).toBe(false);
    expect(byStatus(results, 'added').length).toBe(results.length);
    await expect(fs.stat(path.join(root, SNAPSHOT_DIR))).rejects.toThrow();
  });

  it('reports a changed snapshot with a diff and leaves the file alone', async () => {
    await snapshot(await discover({ root }), {});
    const file = path.join(root, SNAPSHOT_DIR, 'ui-button', 'default.html');
    const original = await fs.readFile(file, 'utf8');
    await fs.writeFile(file, original.replace('button__label', 'button__caption'), 'utf8');

    const { results, ok } = await snapshot(await discover({ root }), { check: true });
    expect(ok).toBe(false);
    const changed = byStatus(results, 'changed');
    expect(changed).toHaveLength(1);
    expect(changed[0].storyId).toBe('ui-button--default');
    expect(changed[0].file).toBe('ui-button/default.html');
    expect(changed[0].diff).toContain('-');
    expect(changed[0].diff).toContain('button__label');
    expect(await fs.readFile(file, 'utf8')).toContain('button__caption');
  });

  it('rewrites a changed snapshot in the default mode', async () => {
    await snapshot(await discover({ root }), {});
    const file = path.join(root, SNAPSHOT_DIR, 'ui-button', 'default.html');
    await fs.writeFile(file, '<ui-button>stale</ui-button>\n', 'utf8');

    const { results, ok } = await snapshot(await discover({ root }), {});
    expect(ok).toBe(true);
    expect(byStatus(results, 'written').map((entry) => entry.storyId)).toEqual([
      'ui-button--default'
    ]);
    expect(await fs.readFile(file, 'utf8')).not.toBe('<ui-button>stale</ui-button>\n');
  });

  it('force-writes in update mode', async () => {
    await snapshot(await discover({ root }), {});
    const file = path.join(root, SNAPSHOT_DIR, 'ui-badge', 'default.html');
    await fs.writeFile(file, 'anything\n', 'utf8');

    const { results, ok } = await snapshot(await discover({ root }), { update: true });
    expect(ok).toBe(true);
    expect(byStatus(results, 'changed')).toHaveLength(0);
    expect(await fs.readFile(file, 'utf8')).toContain('<ui-badge');
  });

  it('reports a snapshot no story claims as removed', async () => {
    await snapshot(await discover({ root }), {});
    const stray = path.join(root, SNAPSHOT_DIR, 'ui-button', 'ghost-town.html');
    await fs.writeFile(stray, '<ui-button></ui-button>\n', 'utf8');

    const { results, ok } = await snapshot(await discover({ root }), { check: true });
    expect(ok).toBe(false);
    expect(byStatus(results, 'removed')).toEqual([{
      status: 'removed',
      storyId: 'ui-button--ghost-town',
      file: 'ui-button/ghost-town.html',
      diff: null,
      error: null
    }]);
  });

  it('leaves a stray file alone outside check mode', async () => {
    await snapshot(await discover({ root }), {});
    const stray = path.join(root, SNAPSHOT_DIR, 'ui-button', 'ghost-town.html');
    await fs.writeFile(stray, '<ui-button></ui-button>\n', 'utf8');

    const { results } = await snapshot(await discover({ root }), {});
    expect(byStatus(results, 'removed')).toHaveLength(0);
    expect(await fs.readFile(stray, 'utf8')).toBe('<ui-button></ui-button>\n');
  });

  it('restricts the run to the blocks named by only', async () => {
    const manifest = await discover({ root });
    const { results } = await snapshot(manifest, { only: ['ui-badge'] });
    expect(new Set(results.map((entry) => entry.storyId.split('--')[0]))).toEqual(
      new Set(['ui-badge'])
    );
    expect(statuses(results).length).toBe(manifest.blocks['ui-badge'].stories.length);
    await expect(fs.stat(path.join(root, SNAPSHOT_DIR, 'ui-button'))).rejects.toThrow();
  });

  it('does not call a story removed just because only excluded it', async () => {
    await snapshot(await discover({ root }), {});
    const { results } = await snapshot(await discover({ root }), {
      check: true,
      only: ['ui-badge']
    });
    expect(byStatus(results, 'removed')).toHaveLength(0);
    expect(byStatus(results, 'unchanged')).toHaveLength(results.length);
  });

  it('gives every result the fields SnapResult names', async () => {
    const { results } = await snapshot(await discover({ root }), {});
    results.forEach((entry) => {
      expect(Object.keys(entry).sort()).toEqual(['diff', 'error', 'file', 'status', 'storyId']);
    });
  });

  it('separates two stories whose names slug the same', async () => {
    await fs.writeFile(path.join(root, 'twin-block.lego'), [
      '<template b-props="label: String = \'x\'"><p>[[label]]</p></template>',
      '<story name="Is Loading" args="{ label: \'one\' }"></story>',
      '<story name="is-loading" args="{ label: \'two\' }"></story>'
    ].join('\n'), 'utf8');

    const { results } = await snapshot(await discover({ root }), { only: ['twin-block'] });
    const files = results.map((entry) => entry.file);
    expect(new Set(files).size).toBe(files.length);
    expect(files).toContain('twin-block/is-loading.html');
    expect(files).toContain('twin-block/is-loading-2.html');
    expect(await fs.readFile(
      path.join(root, SNAPSHOT_DIR, 'twin-block', 'is-loading.html'), 'utf8'
    )).toContain('one');
    expect(await fs.readFile(
      path.join(root, SNAPSHOT_DIR, 'twin-block', 'is-loading-2.html'), 'utf8'
    )).toContain('two');
  });
});

describe('run', () => {
  let root;
  let logged;

  beforeEach(async () => {
    root = await copyFixtures();
    logged = [];
    vi.spyOn(console, 'log').mockImplementation((line) => logged.push(String(line)));
    vi.spyOn(console, 'error').mockImplementation((line) => logged.push(String(line)));
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await fs.rm(root, { recursive: true, force: true });
  });

  it('writes snapshots and exits zero', async () => {
    expect(await run({ root })).toBe(0);
    expect(logged.some((line) => line.startsWith('added ui-button--default'))).toBe(true);
    expect(logged.some((line) => line.includes('added '))).toBe(true);
  });

  it('exits non-zero when a check finds a difference, and prints the diff', async () => {
    await run({ root });
    logged.length = 0;
    const file = path.join(root, SNAPSHOT_DIR, 'ui-stat', 'default.html');
    await fs.writeFile(file, '<ui-stat b-hydrate b-id="ui-stat"></ui-stat>\n', 'utf8');

    expect(await run({ root, check: true })).toBe(1);
    expect(logged.some((line) => line.startsWith('changed ui-stat--default'))).toBe(true);
    expect(logged.some((line) => line.startsWith('@@'))).toBe(true);
  });

  it('exits zero when a check finds everything current', async () => {
    await run({ root });
    logged.length = 0;
    expect(await run({ root, check: true })).toBe(0);
  });

  it('accepts only as a comma separated list', async () => {
    expect(await run({ root, only: 'ui-badge, ui-stat' })).toBe(0);
    const dirs = await fs.readdir(path.join(root, SNAPSHOT_DIR));
    expect(dirs.sort()).toEqual(['ui-badge', 'ui-stat']);
  });

  it('exits non-zero when discovery recorded a failure', async () => {
    await fs.writeFile(path.join(root, 'nohyphen.lego'), '<template><p>x</p></template>', 'utf8');
    expect(await run({ root })).toBe(1);
    expect(logged.some((line) => line.includes('nohyphen.lego'))).toBe(true);
  });

  it('widens to everything when there is no git repository to ask', async () => {
    const manifest = await discover({ root });
    const total = manifest.order
      .reduce((count, tag) => count + manifest.blocks[tag].stories.length, 0);

    expect(await run({ root, affected: true })).toBe(0);
    expect(logged).toContain('affected: everything (no usable git diff, so nothing is ruled out)');
    expect(storyLines(logged, 'added')).toHaveLength(total);
  });
});

/**
 * `--affected` is the claim the whole snapshot phase rests on, so these run
 * against a real repository rather than a stubbed diff.
 */
describe('run --affected', () => {
  let root;
  let logged;
  let manifest;

  beforeEach(async () => {
    root = await copyFixtures();
    logged = [];
    vi.spyOn(console, 'log').mockImplementation((line) => logged.push(String(line)));
    vi.spyOn(console, 'error').mockImplementation((line) => logged.push(String(line)));

    await initRepo(root);
    await run({ root });
    await commitAll(root, 'snapshots');
    manifest = await discover({ root });
    logged.length = 0;
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await fs.rm(root, { recursive: true, force: true });
  });

  it('narrows to the changed block and everything that composes it', async () => {
    const badge = path.join(root, 'ui-badge.lego');
    const source = await fs.readFile(badge, 'utf8');
    await fs.writeFile(badge, source.replace('#eef1f6', '#dde3ee'), 'utf8');

    expect(await run({ root, check: true, affected: true, base: 'main' })).toBe(1);

    const total = manifest.order
      .reduce((count, tag) => count + manifest.blocks[tag].stories.length, 0);
    expect(logged).toContain(`affected: 5 of ${total} stories (ui-badge, ui-panel)`);

    const changed = storyLines(logged, 'changed');
    const blocks = new Set(changed.map((line) => line.split(' ')[1].split('--')[0]));
    expect(blocks).toEqual(new Set(['ui-badge', 'ui-panel']));
    expect(changed).toHaveLength(5);
  });

  it('never reports an unaffected block\'s snapshot as removed', async () => {
    const stray = path.join(root, SNAPSHOT_DIR, 'ui-button', 'ghost-town.html');
    await fs.writeFile(stray, '<ui-button></ui-button>\n', 'utf8');
    await commitAll(root, 'stray');

    const badge = path.join(root, 'ui-badge.lego');
    await fs.writeFile(badge, `${await fs.readFile(badge, 'utf8')}\n`, 'utf8');

    await run({ root, check: true, affected: true, base: 'main' });
    expect(storyLines(logged, 'removed')).toEqual([]);
    expect(await fs.readFile(stray, 'utf8')).toBe('<ui-button></ui-button>\n');
  });

  it('still reports a stale snapshot inside a block it did render', async () => {
    const stray = path.join(root, SNAPSHOT_DIR, 'ui-badge', 'ghost-town.html');
    await fs.writeFile(stray, '<ui-badge></ui-badge>\n', 'utf8');
    await commitAll(root, 'stray');

    const badge = path.join(root, 'ui-badge.lego');
    await fs.writeFile(badge, `${await fs.readFile(badge, 'utf8')}\n`, 'utf8');

    expect(await run({ root, check: true, affected: true, base: 'main' })).toBe(1);
    expect(logged).toContain('removed ui-badge--ghost-town ui-badge/ghost-town.html');
  });

  it('reports nothing affected when the tree is clean', async () => {
    expect(await run({ root, check: true, affected: true, base: 'main' })).toBe(0);
    const total = manifest.order
      .reduce((count, tag) => count + manifest.blocks[tag].stories.length, 0);
    expect(logged).toContain(`affected: 0 of ${total} stories (none)`);
    expect(storyLines(logged, 'changed')).toEqual([]);
  });

  it('widens to everything when a file outside the blocks changed', async () => {
    await fs.writeFile(path.join(root, 'theme.css'), 'body { color: red }', 'utf8');
    await run({ root, check: true, affected: true, base: 'main' });
    expect(logged.some((line) => line.startsWith('affected: everything (changed outside'))).toBe(true);
    expect(logged.some((line) => line.includes('theme.css'))).toBe(true);
  });

  it('composes with update, rewriting only what it rendered', async () => {
    const badge = path.join(root, SNAPSHOT_DIR, 'ui-badge', 'default.html');
    const button = path.join(root, SNAPSHOT_DIR, 'ui-button', 'default.html');
    await fs.writeFile(badge, 'stale badge\n', 'utf8');
    await fs.writeFile(button, 'stale button\n', 'utf8');
    await commitAll(root, 'stale');

    const source = path.join(root, 'ui-badge.lego');
    await fs.writeFile(source, `${await fs.readFile(source, 'utf8')}\n`, 'utf8');

    expect(await run({ root, update: true, affected: true, base: 'main' })).toBe(0);
    expect(await fs.readFile(badge, 'utf8')).toContain('<ui-badge');
    expect(await fs.readFile(button, 'utf8')).toBe('stale button\n');
  });

  it('composes with only, intersecting both filters', async () => {
    const source = path.join(root, 'ui-badge.lego');
    await fs.writeFile(source, `${await fs.readFile(source, 'utf8')}\n`, 'utf8');

    await run({ root, check: true, affected: true, base: 'main', only: 'ui-panel' });
    const looked = logged
      .filter((line) => /^(changed|added|written|removed) \S+--\S+ /.test(line))
      .map((line) => line.split(' ')[1].split('--')[0]);
    expect(new Set(looked).size).toBeLessThanOrEqual(1);
    expect(looked.every((tag) => tag === 'ui-panel')).toBe(true);
  });
});
