/**
 * Stories: the named renderings of one block.
 *
 * Three sources feed in, and they layer rather than compete. Every block gets
 * the implicit `Default` story for free, because a block that declares its
 * props already describes one useful rendering and nothing should have to be
 * authored to see it. A `<story>` section in the .lego file adds a variant
 * next to the markup it varies. A sibling `<name>.stories.js` adds variants
 * that need real JavaScript, which an attribute cannot carry.
 *
 * A story named `Default` from either authored source replaces the implicit
 * one instead of colliding with it, so overriding the zero-config rendering is
 * a matter of naming a story after it.
 *
 * Story ids are built in exactly one place, `storyId` in contracts.js, because
 * the manager and the preview have to agree on them across a postMessage
 * boundary where neither can ask the other what it meant.
 */
import { promises as fs } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { compile } from '../../../src/utils/expression.js';
import { parseHTML, serialize, attrValue } from '../../../src/server/html.js';
import { DEFAULT_STORY_NAME, storyId } from './contracts.js';

/**
 * Evaluate the raw source of a `<story>` attribute.
 *
 * `args="{ loading: true }"` is an expression, not JSON, because that is what
 * the rest of a template is. Running it through the same `compile()` a binding
 * uses means a story argument and a binding disagree about nothing: the same
 * literals parse, the same identifiers are denied.
 *
 * A story that will not evaluate yields an empty object and a recorded
 * message. Nothing here throws, because one bad attribute must not cost the
 * whole manifest.
 */
const evaluateSource = (src, label, errors) => {
  const text = String(src || '').trim();
  if (!text) return {};
  try {
    const value = compile(`(${text})`)({}, {});
    if (value && typeof value === 'object') return value;
    if (errors) errors.push(`${label}: expected an object, got ${typeof value}`);
    return {};
  } catch (err) {
    if (errors) errors.push(`${label}: ${err.message}`);
    return {};
  }
};

/**
 * Split a `<story>` body into slot content.
 *
 * A story's body is what the block receives as children, so a top level
 * element carrying `slot="footer"` belongs to the footer slot and everything
 * else belongs to the default one. The split is done on the parse tree rather
 * than a DOM because this runs in Node, and `parseHTML` is the same parser the
 * server renderer uses on the block's own template.
 *
 * Lenient parsing, and unparseable content becomes default slot content
 * verbatim: a story body is authored markup, and refusing to show it teaches
 * the author less than showing it wrong.
 */
const splitSlotHTML = (html) => {
  const source = String(html || '').trim();
  if (!source) return {};
  let nodes;
  try {
    nodes = parseHTML(source, 'story', { lenient: true });
  } catch (err) {
    return { '': source };
  }

  const slots = {};
  let fallback = '';
  nodes.forEach((node) => {
    const name = node.type === 'el' ? attrValue(node, 'slot') : undefined;
    const html = serialize([node]);
    if (!name) {
      fallback += html;
      return;
    }
    slots[name] = (slots[name] || '') + html;
  });

  const trimmed = fallback.trim();
  if (trimmed) slots[''] = trimmed;
  return slots;
};

/**
 * Normalise whatever a story author wrote as `slots` into the map the
 * renderer takes. A bare string is default slot content, and `default` is
 * accepted as a spelling of `''` because writing an empty key in JavaScript
 * reads like a mistake.
 */
const normaliseSlots = (slots) => {
  if (typeof slots === 'string') return slots ? { '': slots } : {};
  if (!slots || typeof slots !== 'object') return {};
  const out = {};
  Object.keys(slots).forEach((key) => {
    const html = slots[key];
    if (typeof html !== 'string' || html === '') return;
    out[key === 'default' ? '' : key] = html;
  });
  return out;
};

/** Build one story from a loosely shaped spec. The id is assigned by merge. */
const toStory = (name, spec, source) => ({
  id: '',
  block: '',
  name: String(name),
  args: (spec && spec.args) || {},
  slots: normaliseSlots(spec && spec.slots),
  globals: (spec && spec.globals) || {},
  route: (spec && spec.route) || null,
  source
});

/**
 * Flatten story lists into the final ordered set for one block, assigning ids.
 *
 * Two things are settled here and nowhere else. An authored `Default` drops
 * the implicit one, since two stories under one name is never what the author
 * meant. And two names that slug the same get `-2`, `-3` suffixes in the order
 * they were authored, because an id is a URL and a snapshot filename, and both
 * have to stay distinct even when the display names collide.
 *
 * @param {string} tag - the block these stories belong to
 * @param {...Story[]} lists - story lists, in precedence order
 * @returns {Story[]}
 */
export function mergeStories(tag, ...lists) {
  const flat = lists.flat().filter(Boolean);
  const overridden = flat.some((story) =>
    story.source !== 'implicit' && story.name === DEFAULT_STORY_NAME);
  const kept = overridden ? flat.filter((story) => story.source !== 'implicit') : flat;

  const seen = new Map();
  return kept.map((story) => {
    const base = storyId(tag, story.name);
    const count = (seen.get(base) || 0) + 1;
    seen.set(base, count);
    return {
      ...story,
      block: tag,
      id: count === 1 ? base : `${base}-${count}`
    };
  });
}

/**
 * Every story a block carries in its own file: the implicit Default, then one
 * per `<story>` section, in source order.
 *
 * Never empty. A block with no authored stories still has the one the studio
 * can render from its own defaults, which is the whole point of the implicit
 * story: nothing is authored until a second variant is wanted.
 *
 * @param {object} block - a BlockInfo
 * @param {string[]} [errors] - collects unevaluable story attributes
 * @returns {Story[]}
 */
export function storiesFor(block, errors) {
  const tag = block.tag;
  const implicit = {
    id: storyId(tag, DEFAULT_STORY_NAME),
    block: tag,
    name: DEFAULT_STORY_NAME,
    args: {},
    slots: {},
    globals: {},
    route: null,
    source: 'implicit'
  };

  const sections = Array.isArray(block.storySections) ? block.storySections : [];
  const authored = sections.map((section) => ({
    id: '',
    block: tag,
    name: section.name,
    args: evaluateSource(section.args, `<${tag}> story "${section.name}" args`, errors),
    slots: splitSlotHTML(section.slotHTML),
    globals: evaluateSource(section.globals, `<${tag}> story "${section.name}" globals`, errors),
    route: null,
    source: 'lego'
  }));

  return mergeStories(tag, [implicit], authored);
}

/**
 * `blocks/user-card.lego` -> `blocks/user-card.stories.js`.
 *
 * Exported because discovery records the story modules it actually loaded on
 * `BlockInfo.storyFiles`, and a consumer asking what a changed file affects
 * should read that list rather than derive this convention a second time.
 */
export const storyFileFor = (file) => String(file).replace(/\.lego$/, '.stories.js');

/**
 * Read a block's sibling `<name>.stories.js`, when it has one.
 *
 * Two shapes are accepted, because both read naturally depending on what the
 * stories are. A keyed object names each story by its key, which is the
 * shortest thing to write. An array carries `name` on each entry, which is the
 * only way to control ordering independently of key ordering or to use a name
 * that is not a valid identifier.
 *
 * The import URL carries the file's mtime so a dev server re-reading a changed
 * story file gets the new module rather than the one Node already cached.
 *
 * @param {object} block - a BlockInfo
 * @param {string[]} [errors] - collects load failures
 * @param {string[]} [loaded] - collects the paths of modules that contributed,
 *   which is what discovery puts on `BlockInfo.storyFiles`
 * @returns {Promise<Story[]>} empty when there is no sibling file
 */
export async function loadStoryFiles(block, errors, loaded) {
  const file = storyFileFor(block.file);
  let stat;
  try {
    stat = await fs.stat(file);
  } catch (err) {
    return [];
  }
  if (!stat.isFile()) return [];

  let module;
  try {
    module = await import(`${pathToFileURL(file).href}?mtime=${stat.mtimeMs}`);
  } catch (err) {
    if (errors) errors.push(`${file}: story file did not load: ${err.message}`);
    return [];
  }

  const exported = module && module.default;
  if (!exported || typeof exported !== 'object') {
    if (errors) errors.push(`${file}: expected a default export naming stories`);
    return [];
  }

  const raw = Array.isArray(exported)
    ? exported.map((spec, index) => toStory(spec && spec.name || `Story ${index + 1}`, spec, 'file'))
    : Object.keys(exported).map((name) => toStory(name, exported[name], 'file'));

  if (loaded) loaded.push(file);
  return mergeStories(block.tag, raw);
}
