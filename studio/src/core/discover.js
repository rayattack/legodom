/**
 * Discovery: a directory of .lego files becomes a Manifest.
 *
 * Everything downstream reads the manifest and nothing else. The dev server
 * serves it, the manager renders a sidebar from it, the graph walks its
 * `children` edges, the snapshotter iterates its stories. So the job here is
 * to answer every question those consumers have while the file is open, and
 * to answer them the same way twice: directory entries are sorted, tags are
 * sorted, and nothing depends on filesystem ordering.
 *
 * Discovery never throws. A .lego file that will not parse costs a line in
 * `errors` and its own absence from `blocks`; it does not cost the studio.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { parseLego, validateLego } from '../../../src/utils/parser-utils.js';
import { bProps } from '../../../src/directives/b-props.js';
import { globToRegExp } from '../../../src/utils/glob.js';
import { controlFor } from './contracts.js';
import { loadLogic, LIFECYCLE_KEYS } from './render.js';
import { storiesFor, loadStoryFiles, mergeStories } from './stories.js';

/**
 * Directories a block never lives in. `studio` is on the list because the
 * studio's own UI is built from blocks, and a user scanning their project
 * must never find the tool's internals mixed in with their own work.
 */
const SKIP_DIRS = new Set(['node_modules', 'dist', '.git', 'studio']);

/** Tags the studio reserves for itself, skipped wherever they are found. */
const STUDIO_TAG_PREFIX = 'lego-studio-';

const LIFECYCLE = new Set(LIFECYCLE_KEYS);

const toPosix = (relative) => relative.split(path.sep).join('/');

/* ------------------------------------------------------------------ *
 * Props
 * ------------------------------------------------------------------ */

/**
 * Split a `b-props` body on the commas that separate declarations, leaving
 * the ones inside a string, a call, an array or an object literal alone, so
 * `items: Array = [1, 2]` stays one declaration.
 *
 * This mirrors `splitDeclarations` in src/directives/b-props.js, which does
 * not export it. The duplication buys the one thing bProps will not hand
 * back: the raw source text of a default, which the manager shows in the
 * props table so an author can see what a control is overriding.
 */
const splitDeclarations = (body) => {
  const out = [];
  let depth = 0;
  let quote = '';
  let start = 0;
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (quote) {
      if (ch === '\\') i++;
      else if (ch === quote) quote = '';
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') { quote = ch; continue; }
    if (ch === '(' || ch === '[' || ch === '{') depth++;
    if (ch === ')' || ch === ']' || ch === '}') depth--;
    if (ch !== ',' || depth !== 0) continue;
    out.push(body.slice(start, i));
    start = i + 1;
  }
  out.push(body.slice(start));
  return out.map((token) => token.trim()).filter(Boolean);
};

// name, then an optional `: Type`, then an optional `= default expression`.
const DECLARATION = /^([a-zA-Z_$][\w$]*)\s*(?::\s*([A-Za-z]+))?\s*(?:=\s*([\s\S]+))?$/;

/** Prop name to the raw text the author wrote after `=`, for the props table. */
const defaultSources = (propsAttr) => {
  const sources = new Map();
  let body = String(propsAttr || '').trim();
  if (body.startsWith('{') && body.endsWith('}')) body = body.slice(1, -1).trim();
  if (!body) return sources;
  splitDeclarations(body).forEach((token) => {
    const match = DECLARATION.exec(token);
    if (!match) return;
    sources.set(match[1], match[3] === undefined ? null : match[3].trim());
  });
  return sources;
};

/**
 * Turn a `b-props` string into descriptors.
 *
 * `bProps` is the framework's own parser and the only one whose answers are
 * guaranteed to match what the browser will do, so it does the parsing. Its
 * registry is global and keyed by tag, though, and discovery runs against a
 * project that may already have those tags registered in the same process, so
 * the tag is unregistered again the moment its answer has been read.
 */
const describeProps = (tag, propsAttr) => {
  if (!propsAttr) return [];
  bProps.register(tag, propsAttr);
  const declared = bProps.get(tag) || [];
  const sources = defaultSources(propsAttr);

  const props = declared.map((prop) => ({
    name: prop.name,
    attr: prop.attr,
    type: prop.type,
    defaultSource: sources.has(prop.name) ? sources.get(prop.name) : null,
    // The thunk hands back a fresh value per call, which is how two instances
    // of a block with `items: Array = []` avoid sharing one array.
    defaultValue: prop.defaultFn ? prop.defaultFn() : undefined,
    control: controlFor(prop.type)
  }));

  bProps.unregister(tag);
  return props;
};

/* ------------------------------------------------------------------ *
 * Logic
 * ------------------------------------------------------------------ */

/**
 * Sort a block's logic keys into the two things the manager shows: state it
 * can display and edit, and methods it can list as actions.
 *
 * A getter is state, and is never called to find that out. Reading it would
 * run author code at discovery time, outside any render, with `this` bound to
 * a bare logic object rather than to reactive state, which is a good way to
 * throw for reasons that have nothing to do with the block.
 *
 * `$`-prefixed keys belong to the framework, lifecycle hooks are neither
 * state nor an action a person triggers, and a declared prop is already
 * described by its own descriptor.
 */
const classifyLogic = (logic, propNames) => {
  const stateKeys = [];
  const methodKeys = [];
  Object.keys(logic).forEach((key) => {
    if (key.startsWith('$') || LIFECYCLE.has(key) || propNames.has(key)) return;
    const descriptor = Object.getOwnPropertyDescriptor(logic, key);
    if (!descriptor) return;
    if (descriptor.get) {
      stateKeys.push(key);
      return;
    }
    if (typeof descriptor.value === 'function') {
      methodKeys.push(key);
      return;
    }
    stateKeys.push(key);
  });
  return { stateKeys, methodKeys };
};

/** `$emit('saved')`, in any of the three quote styles a script might use. */
const EMIT = /\$emit\(\s*(['"`])([^'"`]*)\1/g;

const collectEmits = (script) => {
  const names = new Set();
  let match;
  EMIT.lastIndex = 0;
  while ((match = EMIT.exec(script)) !== null) {
    if (match[2]) names.add(match[2]);
  }
  return [...names].sort();
};

/* ------------------------------------------------------------------ *
 * Template
 * ------------------------------------------------------------------ */

const SLOT = /<slot\b([^>]*)>/gi;
const SLOT_NAME = /(?:^|\s)name\s*=\s*["']([^"']*)["']/i;

/** Slot names a template offers, `''` for the unnamed one. */
const collectSlots = (template) => {
  const names = [];
  let match;
  SLOT.lastIndex = 0;
  while ((match = SLOT.exec(template)) !== null) {
    const named = match[1].match(SLOT_NAME);
    const name = named ? named[1] : '';
    if (!names.includes(name)) names.push(name);
  }
  return names;
};

/**
 * Every hyphenated tag a template opens. Whether one is a block cannot be
 * known yet, since the block it names may sit in a file this walk has not
 * reached, so the candidates are kept and filtered once the scan is done.
 */
const CUSTOM_TAG = /<([a-z][a-z0-9]*(?:-[a-z0-9]+)+)\b/gi;

const collectTags = (template) => {
  const tags = new Set();
  let match;
  CUSTOM_TAG.lastIndex = 0;
  while ((match = CUSTOM_TAG.exec(template)) !== null) {
    tags.add(match[1].toLowerCase());
  }
  return tags;
};

/* ------------------------------------------------------------------ *
 * Walk
 * ------------------------------------------------------------------ */

/**
 * Collect every file under `dir`, sorted, skipping the directories nothing
 * useful lives in. Sorting matters: `order` is sorted anyway, but the errors
 * list and the duplicate-tag decision both follow visit order.
 */
const walk = async (dir, out) => {
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch (err) {
    return err;
  }
  entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  for (const entry of entries) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      await walk(abs, out);
      continue;
    }
    if (entry.isFile()) out.push(abs);
  }
  return null;
};

/**
 * Scan a directory tree for .lego blocks.
 *
 * @param {object} options
 * @param {string} options.root - directory to scan, resolved to an absolute path
 * @param {string[]} [options.include] - globs, relative to root, forward slashes
 * @param {string[]} [options.exclude] - globs that veto an included path
 * @returns {Promise<Manifest>}
 */
export async function discover({ root, include = ['**/*.lego'], exclude = [] } = {}) {
  const base = path.resolve(root || process.cwd());
  const errors = [];
  const blocks = {};
  const candidates = new Map();

  const files = [];
  const walkError = await walk(base, files);
  if (walkError) {
    errors.push(`${base}: could not be read: ${walkError.message}`);
    return { root: base, blocks, order: [], errors };
  }

  const includeRe = include.map(globToRegExp);
  const excludeRe = exclude.map(globToRegExp);

  for (const file of files) {
    const relFile = toPosix(path.relative(base, file));
    if (!includeRe.some((re) => re.test(relFile))) continue;
    if (excludeRe.some((re) => re.test(relFile))) continue;

    let source;
    try {
      source = await fs.readFile(file, 'utf8');
    } catch (err) {
      errors.push(`${relFile}: could not be read: ${err.message}`);
      continue;
    }

    let parsed;
    try {
      // parseLego derives the tag from the filename and throws when it has no
      // hyphen, which is the most common way a .lego file is not a block.
      parsed = parseLego(source, path.basename(file));
    } catch (err) {
      errors.push(`${relFile}: ${err.message}`);
      continue;
    }

    const invalid = validateLego(parsed);
    if (!invalid.valid) {
      errors.push(`${relFile}: ${invalid.errors.join('; ')}`);
      continue;
    }

    const tag = parsed.blockName;
    if (tag.startsWith(STUDIO_TAG_PREFIX)) continue;
    if (blocks[tag]) {
      errors.push(`${relFile}: block "${tag}" is already defined by ${blocks[tag].relFile}`);
      continue;
    }

    const props = describeProps(tag, parsed.propsAttr);
    const propNames = new Set(props.map((prop) => prop.name));
    const { logic, error } = await loadLogic(parsed.script, { blockName: tag, file, lang: parsed.scriptLang });
    if (error) errors.push(`${relFile}: ${error}`);
    const { stateKeys, methodKeys } = classifyLogic(logic, propNames);

    blocks[tag] = {
      tag,
      file,
      relFile,
      shadow: parsed.shadowAttr !== 'false',
      form: !!parsed.formAttr,
      template: parsed.template,
      css: parsed.style,
      script: parsed.script,
      propsAttr: parsed.propsAttr,
      props,
      stateKeys,
      methodKeys,
      emits: collectEmits(parsed.script),
      slots: collectSlots(parsed.template),
      children: [],
      // The raw `<story>` sections, kept so storiesFor() can build stories
      // from a BlockInfo without re-reading the file. Plain data, so a
      // manifest still survives structuredClone on its way to the manager.
      storySections: parsed.stories,
      storyFiles: [],
      stories: []
    };
    candidates.set(tag, collectTags(parsed.template));
  }

  const order = Object.keys(blocks).sort();

  // Second pass. A tag is a child only once it is known to be a block, which
  // is why this cannot happen while the files are still being read.
  //
  // A block that names its own tag keeps the self edge. Recursion is an
  // ordinary LegoDOM pattern, a tree node or a threaded comment guarded by a
  // b-if that terminates it, and dropping the edge would leave the graph
  // unable to see that editing the block changes what the block renders.
  order.forEach((tag) => {
    const seen = candidates.get(tag) || new Set();
    blocks[tag].children = [...seen].filter((child) => blocks[child]).sort();
  });

  for (const tag of order) {
    const block = blocks[tag];
    const fromFile = await loadStoryFiles(block, errors, block.storyFiles);
    block.stories = mergeStories(tag, storiesFor(block, errors), fromFile);
  }

  return { root: base, blocks, order, errors };
}
