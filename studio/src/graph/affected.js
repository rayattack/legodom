import path from 'node:path';
import { manifestOrder } from './build.js';

/**
 * What a change can reach.
 *
 * This is the half of the studio that pays for itself. Re-rendering every
 * story on every commit is correct and slow; re-rendering the ones a diff can
 * actually have changed is correct and fast, but only if the reachability is
 * exact. Bundler based tools guess at that from module records. Here the graph
 * comes from the templates themselves, so editing a button really does hand
 * back every screen that composes it, however deep.
 *
 * The one rule that outranks speed: when the answer is not knowable, the
 * answer is everything. An extra snapshot costs seconds. A missed snapshot
 * costs a shipped regression, and worse, the trust that the tool catches them.
 */

/** A block source file. */
const LEGO_EXT = '.lego';

/** The convention a story module follows when nothing says otherwise. */
const STORY_SUFFIX = '.stories.js';

/**
 * The tag a `button-primary.stories.js` file belongs to, guessed from the
 * name. This is the fallback, not the rule: `BlockInfo.storyFiles` lists the
 * modules that actually contributed stories, and a guess is only consulted
 * when that list has nothing to say.
 */
const storyFileTag = (file) => {
  const base = path.basename(file);
  if (!base.endsWith(STORY_SUFFIX) || base.length === STORY_SUFFIX.length) return null;
  return base.slice(0, -STORY_SUFFIX.length);
};

const cleanList = (list) => (Array.isArray(list) ? list : [])
  .filter(item => typeof item === 'string' && item.length > 0);

/**
 * Resolve a path the caller supplied.
 *
 * Relative input resolves against the working directory, never against the
 * manifest root. The natural caller is holding what `git diff --name-only`
 * printed, and those paths are relative to the repository, not to whatever
 * subdirectory the scan happened to be rooted at. Resolving them against the
 * root produces `<root>/<root>/file.lego`, which matches nothing, and the
 * failure then hides inside the fail safe as a permanent full run.
 *
 * Returns null for anything that is not a usable path: a non string, an empty
 * string, or a value the platform refuses outright. Those are caller errors
 * rather than facts about the project, so they are kept apart from the files
 * worth naming. They are not discarded either, because a change set nobody can
 * read is exactly the case that must widen rather than narrow.
 */
const resolveGiven = (file) => {
  if (typeof file !== 'string' || !file) return null;
  try {
    return path.resolve(file);
  } catch {
    return null;
  }
};

/** Resolve a path the manifest owns. These are absolute already, but a hand
 * built manifest may hold them relative to its own root, which is the correct
 * base for anything the manifest itself wrote down. */
const resolveOwned = (root, file) => {
  try {
    return path.resolve(root, file);
  } catch {
    return null;
  }
};

/**
 * Every path the manifest claims, split by what kind of path it is: block
 * sources on one side, the story modules that contributed stories on the
 * other. Two maps rather than one because `tagsForFiles` is documented as
 * matching block files, and folding story modules into it would quietly widen
 * that promise.
 */
const fileIndex = (manifest) => {
  const root = (manifest && manifest.root) || process.cwd();
  const blocks = (manifest && manifest.blocks) || {};
  const byBlockFile = new Map();
  const byStoryFile = new Map();

  for (const tag of manifestOrder(manifest)) {
    const info = blocks[tag];
    if (!info) continue;
    if (typeof info.file === 'string' && info.file) {
      const abs = resolveOwned(root, info.file);
      if (abs) byBlockFile.set(abs, tag);
    }
    for (const story of Array.isArray(info.storyFiles) ? info.storyFiles : []) {
      if (typeof story !== 'string' || !story) continue;
      const abs = resolveOwned(root, story);
      if (abs) byStoryFile.set(abs, tag);
    }
  }
  return { byBlockFile, byStoryFile };
};

/**
 * Sort a change set into three buckets: the tags it names, the files that
 * widen the answer to everything, and the paths that could not be resolved at
 * all. Every file lands in exactly one, so the buckets together are the whole
 * decision and there is no fourth branch hiding somewhere else.
 */
const classifyFiles = (manifest, files) => {
  const blocks = (manifest && manifest.blocks) || {};
  const { byBlockFile, byStoryFile } = fileIndex(manifest);
  const tags = new Set();
  const unbounded = [];
  const unresolved = [];

  for (const file of files) {
    const abs = resolveGiven(file);
    if (abs === null) {
      unresolved.push(file);
      continue;
    }

    const owner = byBlockFile.get(abs) || byStoryFile.get(abs);
    if (owner) {
      tags.add(owner);
      continue;
    }
    // The naming fallback, for the window where a story module exists but the
    // scan has not recorded it. A guess only counts when it names a real
    // block; anything else widens rather than inventing a tag.
    const guess = storyFileTag(abs);
    if (guess && blocks[guess]) {
      tags.add(guess);
      continue;
    }
    unbounded.push(file);
  }

  return { tags: [...tags], unbounded, unresolved };
};

/**
 * The changed files whose blast radius cannot be bounded. One of these is
 * enough to widen the answer to everything, and a caller reporting that to a
 * human wants to name the culprit rather than leave them wondering why a one
 * line change re-rendered the world.
 *
 * Two kinds qualify. The obvious one is a file that belongs to no block: a
 * stylesheet, a helper, the framework itself. The second is a `.lego` or a
 * story module the manifest has never heard of, which means the scan and the
 * diff disagree about what exists. That happens when a block was deleted, or
 * when it sits outside the include glob while something inside the glob still
 * composes it, and in both cases the parents that used to render it changed in
 * a way this graph cannot see.
 *
 * A path that could not be resolved at all is deliberately not listed. It also
 * widens the answer inside `affectedStories`, but it says nothing about the
 * project, so naming it as the culprit would send a developer looking for a
 * file that was never really in the diff.
 *
 * Anything that is not a list of files, `null` included, means the change set
 * itself was unknown: there is nothing to blame, and `null` comes back out.
 *
 * @param {object} manifest
 * @param {?string[]} changedFiles
 * @returns {?string[]}
 */
export function unboundedFiles(manifest, changedFiles) {
  if (!Array.isArray(changedFiles)) return null;
  return classifyFiles(manifest, changedFiles).unbounded;
}

/**
 * The changed tags plus everything that composes them, transitively.
 *
 * The closures on the graph have already absorbed any recursion, so this is a
 * union of precomputed lists and stays finite whatever the templates do. A tag
 * the graph has never heard of is still returned: the caller asserted it
 * changed, and dropping it here would quietly narrow the answer.
 *
 * @param {object} graph a BlockGraph
 * @param {string[]} changedTags
 * @returns {string[]} sorted, deduped
 */
export function affectedBlocks(graph, changedTags) {
  const dependents = (graph && graph.dependents) || {};
  const out = new Set();
  for (const tag of cleanList(changedTags)) {
    out.add(tag);
    for (const parent of dependents[tag] || []) out.add(parent);
  }
  return [...out].sort();
}

/**
 * The tags whose block file is one of `files`.
 *
 * Paths are compared resolved and absolute: the caller's against the working
 * directory, the manifest's against the manifest root. A caller holding git
 * output has repository relative paths and a caller holding a manifest has
 * absolute ones, and the difference must not be a source of silent misses.
 *
 * Story modules are not matched here. Use `affectedStories` for the question
 * of what a change reaches; this answers the narrower question of which block
 * a source file is.
 *
 * @param {object} manifest
 * @param {string[]} files
 * @returns {string[]} tags, in manifest order
 */
export function tagsForFiles(manifest, files) {
  const wanted = new Set();
  for (const file of cleanList(files)) {
    const abs = resolveGiven(file);
    if (abs) wanted.add(abs);
  }
  if (!wanted.size) return [];

  const { byBlockFile } = fileIndex(manifest);
  const out = [];
  for (const [file, tag] of byBlockFile) {
    if (wanted.has(file)) out.push(tag);
  }
  return out;
}

/**
 * The stories a set of changed files can affect, in manifest order.
 *
 * Three answers are possible and the distinction matters:
 *
 *   null or undefined  the caller could not narrow anything down (no git repo,
 *                      an explicit --all, an unresolvable base), so every
 *                      story is affected.
 *   an empty list      nothing changed, so no story is affected.
 *   anything else      resolved through the graph.
 *
 * Anything `unboundedFiles` flags also means everything, as does a path that
 * would not resolve. The studio cannot bound what those reach, so it does not
 * pretend to.
 *
 * @param {object} manifest
 * @param {object} graph
 * @param {?string[]} changedFiles
 * @returns {object[]} Story objects
 */
export function affectedStories(manifest, graph, changedFiles) {
  const order = manifestOrder(manifest);
  const blocks = (manifest && manifest.blocks) || {};

  const storiesOf = (tag) => {
    const info = blocks[tag];
    return info && Array.isArray(info.stories) ? info.stories : [];
  };
  const everything = () => order.flatMap(storiesOf);

  // Not a list at all, `null` and `undefined` included: the caller could not
  // narrow anything down, or handed over something unreadable. Either way the
  // safe answer is the whole set.
  if (!Array.isArray(changedFiles)) return everything();
  if (!changedFiles.length) return [];

  const { tags, unbounded, unresolved } = classifyFiles(manifest, changedFiles);
  if (unbounded.length || unresolved.length) return everything();
  if (!tags.length) return [];

  const affected = new Set(affectedBlocks(graph, tags));
  const out = [];
  for (const tag of order) {
    if (!affected.has(tag)) continue;
    out.push(...storiesOf(tag));
  }
  return out;
}
