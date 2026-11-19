/**
 * `lego studio snap`: render every story and compare it against disk.
 *
 * This is the regression half of the studio. The manager shows a person what
 * a block looks like; snapshots tell a build whether it still looks like that.
 * Both render through the same `createStoryRenderer`, so a snapshot is a
 * record of what the preview would have shown, not of a parallel code path.
 *
 * Three modes, one comparison. The default writes what is missing or stale,
 * which is what a person wants while working. `--check` writes nothing and
 * fails on any difference, which is what CI wants. `--update` rewrites
 * everything, which is the deliberate act of accepting a change.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { SNAPSHOT_DIR, snapshotPath, storyId } from '../core/contracts.js';
import { discover } from '../core/discover.js';
import { createStoryRenderer, formatHTML } from '../core/render.js';
import { unifiedDiff } from '../core/diff.js';

const toPosix = (relative) => relative.split(path.sep).join('/');

/** File contents, or null when there is no file. A missing file is an answer. */
const readIfExists = async (file) => {
  try {
    return await fs.readFile(file, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
};

const writeSnapshot = async (file, html) => {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, html, 'utf8');
};

/**
 * The snapshot file for a story.
 *
 * The story's id rather than its name supplies the slug, because two stories
 * whose names slug the same are already distinguished there by a `-2` suffix,
 * and a filename that collides would have one story silently overwrite the
 * other. Slugging an already slugged string changes nothing, so a story with
 * a unique name lands exactly where `snapshotPath(block, name)` says it does.
 */
const fileFor = (story) => snapshotPath(story.block, story.id.slice(story.block.length + 2));

const result = (status, story, file, extra = {}) => ({
  status,
  storyId: story.id,
  file,
  diff: null,
  error: null,
  ...extra
});

/**
 * Every `.html` under the snapshot directory, as paths relative to it. Used
 * to find files no story claims any more.
 */
const existingSnapshots = async (dir, into = [], prefix = '') => {
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch (err) {
    return into;
  }
  entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  for (const entry of entries) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      await existingSnapshots(path.join(dir, entry.name), into, rel);
      continue;
    }
    if (entry.isFile() && entry.name.endsWith('.html')) into.push(rel);
  }
  return into;
};

/** `button-primary/loading.html` -> `button-primary--loading`. */
const storyIdFromFile = (relative) => {
  const parts = relative.split('/');
  const slug = parts.pop().replace(/\.html$/, '');
  return storyId(parts.join('/'), slug);
};

/**
 * Render every story and reconcile it with the snapshot on disk.
 *
 * @param {object} manifest - what discover() returned
 * @param {object} [options]
 * @param {boolean} [options.check] - compare only, and report stale files
 * @param {boolean} [options.update] - rewrite every snapshot
 * @param {string[]} [options.only] - restrict to these block tags
 * @param {?string[]} [options.storyIds] - restrict to these stories, which is
 *   how `--affected` narrows a run. Null means every story.
 * @returns {Promise<{results: SnapResult[], ok: boolean}>}
 */
export async function snapshot(
  manifest,
  { check = false, update = false, only = null, storyIds = null } = {}
) {
  const scope = only && only.length ? new Set(only) : null;
  const wanted = storyIds ? new Set(storyIds) : null;
  const dir = path.join(manifest.root, SNAPSHOT_DIR);
  const { render } = createStoryRenderer(manifest);
  const results = [];
  const claimed = new Set();
  const covered = new Set();

  for (const tag of manifest.order) {
    if (scope && !scope.has(tag)) continue;
    const all = manifest.blocks[tag].stories;
    const rendering = wanted ? all.filter((story) => wanted.has(story.id)) : all;
    // A block only vouches for its own snapshot directory when every one of
    // its stories was rendered. Narrowing a run must never make the snapshot
    // of a story nobody looked at appear abandoned, or a single `--affected`
    // pass would report the whole baseline as stale.
    if (rendering.length === all.length) covered.add(tag);

    for (const story of rendering) {
      const file = fileFor(story);
      claimed.add(file);
      const target = path.join(dir, file);

      let html;
      try {
        html = formatHTML(render(story));
      } catch (err) {
        results.push(result('error', story, file, { error: err.message }));
        continue;
      }

      const previous = await readIfExists(target);
      if (previous === null) {
        if (!check) await writeSnapshot(target, html);
        results.push(result('added', story, file));
        continue;
      }
      if (previous === html) {
        if (update) await writeSnapshot(target, html);
        results.push(result('unchanged', story, file));
        continue;
      }
      if (check) {
        results.push(result('changed', story, file, { diff: unifiedDiff(previous, html) }));
        continue;
      }
      await writeSnapshot(target, html);
      results.push(result('written', story, file));
    }
  }

  if (check) {
    // Stale files are only reported, never deleted. Removing a story is a
    // deliberate act, and so is removing what recorded it.
    const onDisk = await existingSnapshots(dir);
    onDisk.forEach((file) => {
      if (claimed.has(file)) return;
      if (!covered.has(file.split('/')[0])) return;
      results.push({
        status: 'removed',
        storyId: storyIdFromFile(file),
        file,
        diff: null,
        error: null
      });
    });
  }

  const ok = check
    ? results.every((entry) => entry.status === 'unchanged')
    : results.every((entry) => entry.status !== 'error');

  return { results, ok };
}

/* ------------------------------------------------------------------ *
 * Command
 * ------------------------------------------------------------------ */

const parseOnly = (value) => {
  if (Array.isArray(value)) return value.filter(Boolean);
  if (typeof value !== 'string') return null;
  const tags = value.split(',').map((tag) => tag.trim()).filter(Boolean);
  return tags.length ? tags : null;
};

/** How many stories the manifest holds, for the `n of m` narrowing line. */
const storyCount = (manifest) =>
  manifest.order.reduce((total, tag) => total + manifest.blocks[tag].stories.length, 0);

/**
 * Work out which stories a diff can have changed, and say so.
 *
 * The whole value of `--affected` is that it is trustworthy, so it fails
 * open in every direction: no git repository, an unresolvable base, or a
 * changed file whose blast radius the graph cannot bound all widen the answer
 * back to every story. `affectedStories` already returns everything for a null
 * change set, so the value from git goes straight through.
 *
 * A returned null means "render everything", which is also what `snapshot`
 * takes for an un-narrowed run.
 *
 * The graph modules are imported here rather than at module scope so a plain
 * `snap` never pays for them.
 *
 * @returns {Promise<?string[]>} story ids to render, or null for all of them
 */
const narrowToAffected = async (manifest, root, base) => {
  const [{ buildGraph }, { affectedStories, unboundedFiles }, { changedFiles }] = await Promise.all([
    import('../graph/build.js'),
    import('../graph/affected.js'),
    import('../graph/git.js')
  ]);

  const files = await changedFiles({ root, base });
  const stories = affectedStories(manifest, buildGraph(manifest), files);
  const unbounded = unboundedFiles(manifest, files) || [];

  if (files === null) {
    console.log('affected: everything (no usable git diff, so nothing is ruled out)');
    return null;
  }
  if (unbounded.length) {
    const blame = unbounded.slice(0, 3).map((file) => path.relative(root, file));
    const rest = unbounded.length - blame.length;
    const more = rest > 0 ? `, +${rest} more` : '';
    console.log(`affected: everything (changed outside the blocks: ${blame.join(', ')}${more})`);
    return null;
  }

  const tags = [...new Set(stories.map((story) => story.block))];
  console.log(
    `affected: ${stories.length} of ${storyCount(manifest)} stories (${tags.join(', ') || 'none'})`
  );
  return stories.map((story) => story.id);
};

const tally = (results) => {
  const counts = {};
  results.forEach((entry) => {
    counts[entry.status] = (counts[entry.status] || 0) + 1;
  });
  return counts;
};

/**
 * Run the command.
 *
 * @param {object} flags
 * @param {string} [flags.root] - directory to scan, defaults to the cwd
 * @param {boolean} [flags.check] - compare only, exit non-zero on any change
 * @param {boolean} [flags.update] - rewrite every snapshot
 * @param {string|string[]} [flags.only] - comma separated block tags
 * @param {boolean} [flags.affected] - render only what the current diff reaches
 * @param {string} [flags.base] - the ref `--affected` diffs against
 * @returns {Promise<number>} the process exit code
 */
export async function run(flags = {}) {
  const root = path.resolve(flags.root || process.cwd());
  const manifest = await discover({ root });
  const storyIds = flags.affected ? await narrowToAffected(manifest, root, flags.base) : null;
  const { results, ok } = await snapshot(manifest, {
    check: !!flags.check,
    update: !!flags.update,
    only: parseOnly(flags.only),
    storyIds
  });

  // Reported after the run, not before it: registering the blocks is what
  // finds a script section that will not evaluate, and that message belongs
  // with the rest rather than half a screen above them.
  manifest.errors.forEach((message) => console.error(message));

  const noisy = results.filter((entry) => entry.status !== 'unchanged');
  noisy.forEach((entry) => {
    const detail = entry.error ? ` ${entry.error}` : '';
    console.log(`${entry.status} ${entry.storyId} ${entry.file}${detail}`);
  });

  const counts = tally(results);
  console.log(Object.keys(counts).sort().map((key) => `${key} ${counts[key]}`).join(' '));

  noisy.filter((entry) => entry.diff).forEach((entry) => {
    console.log('');
    console.log(entry.file);
    console.log(entry.diff);
  });

  return ok && manifest.errors.length === 0 ? 0 : 1;
}

/* ------------------------------------------------------------------ *
 * Direct invocation
 * ------------------------------------------------------------------ */

const USAGE = [
  'Usage: node studio/src/cli/snap.js [options]',
  '',
  '  --root <dir>    directory to scan, defaults to the current one',
  '  --check         compare only, exit non-zero on any difference',
  '  --update        rewrite every snapshot',
  '  --only a,b      restrict to these block tags',
  '  --affected      restrict to the stories the current diff can reach',
  '  --base <ref>    the ref --affected diffs against'
].join('\n');

const parseArgv = (argv) => {
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--check') flags.check = true;
    else if (arg === '--update') flags.update = true;
    else if (arg === '--affected') flags.affected = true;
    else if (arg === '--root') flags.root = argv[++i];
    else if (arg.startsWith('--root=')) flags.root = arg.slice(7);
    else if (arg === '--only') flags.only = argv[++i];
    else if (arg.startsWith('--only=')) flags.only = arg.slice(7);
    else if (arg === '--base') flags.base = argv[++i];
    else if (arg.startsWith('--base=')) flags.base = arg.slice(7);
  }
  return flags;
};

const invokedDirectly = process.argv[1]
  && import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) {
  const argv = process.argv.slice(2);
  // Snapshotting writes files, so running the command bare says what it would
  // do rather than guessing that the current directory was meant.
  if (argv.length === 0) {
    console.log(USAGE);
  } else {
    process.exitCode = await run(parseArgv(argv));
  }
}
